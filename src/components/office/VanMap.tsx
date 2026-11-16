"use client";
// The van map (17 Nov). Leaflet with OpenStreetMap tiles: vans as coloured dots with their name, and on a van's page the
// day's trail, its stops and the day's job sites. Live pages refresh themselves every minute (the engine pulls from
// Traccar once a minute, so faster wouldn't show anything new).
import "leaflet/dist/leaflet.css";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";

export type MapVan = { id: string; name: string; lat: number; lng: number; state: string; label: string; href?: string };
export type MapPin = { lat: number; lng: number; label: string; kind: "stop" | "site" };

const COLOURS: Record<string, string> = {
  moving: "#16a34a", idling: "#f59e0b", parked: "#2563eb", offline: "#94a3b8", no_data: "#94a3b8",
};
const AUCKLAND: [number, number] = [-36.87, 174.74];

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function VanMap({ vans = [], trail = [], pins = [], refreshSeconds = 0, height = 520 }: {
  vans?: MapVan[]; trail?: [number, number][]; pins?: MapPin[]; refreshSeconds?: number; height?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const fitted = useRef(false);
  const router = useRouter();
  const key = JSON.stringify([vans, trail.length, trail.at(-1), pins]);

  useEffect(() => {
    if (!refreshSeconds) return;
    const t = setInterval(() => router.refresh(), refreshSeconds * 1000);
    return () => clearInterval(t);
  }, [refreshSeconds, router]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !box.current) return;
      if (!map.current) {
        map.current = L.map(box.current, { scrollWheelZoom: false }).setView(AUCKLAND, 11);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map.current);
      }
      const m = map.current;
      m.eachLayer((l) => { if (!(l instanceof L.TileLayer)) m.removeLayer(l); });
      const bounds: [number, number][] = [];

      if (trail.length > 1) {
        L.polyline(trail, { color: "#0F172A", weight: 4, opacity: 0.75 }).addTo(m);
        bounds.push(...trail);
      }
      for (const p of pins) {
        const icon = L.divIcon({
          className: "",
          html: p.kind === "site"
            ? `<div style="width:18px;height:18px;border-radius:4px;background:#0ea5e9;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`
            : `<div style="width:14px;height:14px;border-radius:9999px;background:#f59e0b;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
          iconSize: [18, 18], iconAnchor: [9, 9],
        });
        L.marker([p.lat, p.lng], { icon, title: p.label, zIndexOffset: p.kind === "stop" ? 500 : 0 }).bindPopup(esc(p.label)).addTo(m);
        bounds.push([p.lat, p.lng]);
      }
      for (const v of vans) {
        const colour = COLOURS[v.state] ?? "#94a3b8";
        const icon = L.divIcon({
          className: "",
          html: `<div style="display:flex;align-items:center;gap:4px;transform:translate(-9px,-9px)">
              <div style="flex:none;width:18px;height:18px;border-radius:9999px;background:${colour};border:3px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,.45)"></div>
              <span style="background:#0F172A;color:#fff;font:600 11px/1.2 system-ui,sans-serif;padding:2px 6px;border-radius:6px;white-space:nowrap">${esc(v.name)}</span>
            </div>`,
          iconSize: [0, 0],
        });
        const popup = `<strong>${esc(v.name)}</strong><br>${esc(v.label)}${v.href ? `<br><a href="${esc(v.href)}">Open van →</a>` : ""}`;
        L.marker([v.lat, v.lng], { icon, title: v.name, zIndexOffset: 1000 }).bindPopup(popup).addTo(m);
        bounds.push([v.lat, v.lng]);
      }
      // Fit once; after that the person may have zoomed or panned and refreshes shouldn't undo it.
      if (!fitted.current && bounds.length) {
        if (bounds.length === 1) m.setView(bounds[0], 14);
        else m.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 15 });
        fitted.current = true;
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => () => { map.current?.remove(); map.current = null; }, []);

  return <div ref={box} style={{ height }} className="z-0 w-full overflow-hidden rounded-2xl bg-slate-200" data-testid="van-map" />;
}

import "server-only";
// Reads a site's fields from a form (SiteFields in AddressSearch.tsx) for office_save_site. When Google
// search wasn't used (no map position), the typed address is looked up with Google geocoding so the site
// still lands on the map for drive times and van tracking. A failed lookup never stops the save.
import { geocode } from "./engine";

const val = (form: FormData, k: string, max: number) => String(form.get(k) ?? "").trim().slice(0, max);
const coord = (s: string, lo: number, hi: number) => {
  const n = Number(s);
  return s !== "" && Number.isFinite(n) && n >= lo && n <= hi ? n : null;
};

/** opts.was: the site as saved; the address is only looked up again when the street, suburb or postcode changed. */
export async function siteChanges(form: FormData, prefix = "", opts: {
  withNotes?: boolean; was?: { address_line: string; suburb: string | null; postcode: string | null };
} = {}) {
  const p = (k: string) => `${prefix}${k}`;
  const changes: Record<string, unknown> = {
    site_name: val(form, p("site_name"), 120),
    address_line: val(form, p("address_line"), 200),
    suburb: val(form, p("suburb"), 80),
    city: val(form, p("city"), 80),
    postcode: val(form, p("postcode"), 10),
  };
  if (form.has(p("access_notes"))) changes.access_notes = val(form, p("access_notes"), 1000);
  if (opts.withNotes && form.has(p("notes"))) changes.notes = val(form, p("notes"), 1000);
  let lat = coord(val(form, p("lat"), 30), -48, -33);
  let lng = coord(val(form, p("lng"), 30), 165, 179.9);
  const w = opts.was;
  const moved = !w || w.address_line !== changes.address_line || (w.suburb ?? "") !== changes.suburb || (w.postcode ?? "") !== changes.postcode;
  if ((lat === null || lng === null) && changes.address_line && moved) {
    try {
      const at = await geocode(String(changes.address_line), [changes.suburb, changes.city].filter(Boolean).join(" "), String(changes.postcode ?? ""));
      if (at) ({ lat, lng } = at);
    } catch {
      // no map position this time; the address is still saved
    }
  }
  if (lat !== null && lng !== null) {
    changes.lat = lat;
    changes.lng = lng;
  }
  return changes;
}

import "server-only";
// Google address search for the office console (17 Nov 2026): type part of an address or a place name
// ("New World Eastridge") and pick it; the site's street, suburb, city, postcode and map position fill in.
// Uses Google's Places API (New) with the same server key as geocoding and drive times
// (GOOGLE_MAPS_SERVER_KEY), so the key never reaches the browser. "Places API (New)" must be switched on
// for that key in Google Cloud; until it is, the box says so and the address can still be typed by hand.
import type { PickedAddress, PlaceSuggestion } from "./places-shared";

const KEY = () => process.env.GOOGLE_MAPS_SERVER_KEY ?? "";
// Auckland: suggestions near here come first; anywhere in New Zealand can still be found.
const AUCKLAND = { latitude: -36.8485, longitude: 174.7633 };

async function google<T>(url: string, init: RequestInit & { fieldMask?: string }): Promise<T> {
  if (!KEY()) throw new Error("Google isn't set up (GOOGLE_MAPS_SERVER_KEY).");
  const res = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": KEY(),
      ...(init.fieldMask ? { "X-Goog-FieldMask": init.fieldMask } : {}),
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string; status?: string } } | null;
    const why = body?.error?.message ?? `HTTP ${res.status}`;
    if (res.status === 403 || body?.error?.status === "PERMISSION_DENIED") {
      throw new Error(`Google address search isn't switched on for this key yet (Places API (New)). ${why}`);
    }
    throw new Error(`Google address search: ${why}`);
  }
  return (await res.json()) as T;
}

type AutocompleteReply = {
  suggestions?: {
    placePrediction?: {
      placeId: string;
      text?: { text: string };
      structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } };
    };
  }[];
};

export async function suggestPlaces(input: string, sessionToken: string): Promise<PlaceSuggestion[]> {
  const q = input.trim().slice(0, 200);
  if (q.length < 3) return [];
  const r = await google<AutocompleteReply>("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    body: JSON.stringify({
      input: q,
      includedRegionCodes: ["nz"],
      regionCode: "nz",
      languageCode: "en-NZ",
      locationBias: { circle: { center: AUCKLAND, radius: 50000 } },
      ...(sessionToken ? { sessionToken } : {}),
    }),
  });
  return (r.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => !!p?.placeId)
    .slice(0, 6)
    .map((p) => ({
      id: p.placeId,
      main: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
      secondary: p.structuredFormat?.secondaryText?.text ?? "",
    }));
}

type Component = { longText: string; shortText: string; types: string[] };
type DetailsReply = {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  addressComponents?: Component[];
  location?: { latitude: number; longitude: number };
  types?: string[];
};

/** Turns Google's address parts into our site fields (NZ style: "2/14 Smith Street", suburb, city, postcode). */
export function toSiteAddress(d: DetailsReply): PickedAddress {
  const parts = d.addressComponents ?? [];
  const get = (...types: string[]) => {
    for (const t of types) {
      const c = parts.find((p) => p.types.includes(t));
      if (c) return c.longText;
    }
    return "";
  };
  const unit = get("subpremise");
  const number = get("street_number");
  const street = get("route");
  const city = get("locality", "postal_town", "administrative_area_level_2") || "Auckland";
  let suburb = get("sublocality_level_1", "sublocality", "neighborhood");
  if (!suburb || suburb === city) suburb = get("locality") !== city ? get("locality") : suburb;
  let addressLine = [number ? `${unit ? `${unit}/` : ""}${number}` : unit, street].filter(Boolean).join(" ").trim();
  // A place with no street number (a shopping centre, a rural property): first part of Google's address.
  if (!addressLine || !number) addressLine = (d.formattedAddress ?? "").split(",")[0]?.trim() || addressLine;
  const isPlace = (d.types ?? []).some((t) => t === "establishment" || t === "point_of_interest");
  const name = d.displayName?.text ?? "";
  return {
    address_line: addressLine,
    suburb: suburb === city ? "" : suburb,
    city,
    postcode: get("postal_code"),
    lat: d.location?.latitude ?? null,
    lng: d.location?.longitude ?? null,
    site_name: isPlace && name && !addressLine.toLowerCase().startsWith(name.toLowerCase()) ? name : "",
    formatted: d.formattedAddress ?? "",
  };
}

export async function placeAddress(placeId: string, sessionToken: string): Promise<PickedAddress> {
  if (!/^[A-Za-z0-9_-]{10,400}$/.test(placeId)) throw new Error("Unknown place.");
  const qs = sessionToken ? `?sessionToken=${encodeURIComponent(sessionToken)}` : "";
  const d = await google<DetailsReply>(`https://places.googleapis.com/v1/places/${placeId}${qs}`, {
    method: "GET",
    fieldMask: "id,displayName,formattedAddress,addressComponents,location,types",
  });
  return toSiteAddress(d);
}

// Types for the Google address search, shared by the server lookup and the address box in the browser.
export type PlaceSuggestion = { id: string; main: string; secondary: string };
export type PickedAddress = {
  address_line: string;
  suburb: string;
  city: string;
  postcode: string;
  lat: number | null;
  lng: number | null;
  /** A business or place name (e.g. "New World Eastridge") when that's what was picked; otherwise "". */
  site_name: string;
  formatted: string;
};

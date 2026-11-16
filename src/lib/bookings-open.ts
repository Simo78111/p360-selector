// Public online booking on/off switch.
//
// Before launch the live site shows the whole website and the staff side (office console, plumber app, quotes,
// certificates) but doesn't take bookings from the public: the booking page says booking opens soon and gives
// the phone number, and the booking endpoint refuses anything sent to it.
//
// Open it on the live site by adding PUBLIC_BOOKINGS=open in Vercel → Settings → Environment Variables
// (Production), then redeploy. The test site always takes bookings so they can be tried there.
import { isTestSite } from "./test-mode";

export function publicBookingsOpen(): boolean {
  return isTestSite() || process.env.PUBLIC_BOOKINGS?.trim().toLowerCase() === "open";
}

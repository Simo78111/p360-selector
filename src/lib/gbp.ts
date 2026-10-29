import "server-only";
import { liveServiceAllowed } from "./test-mode";
// Google Business Profile updates ("posts" on the Google listing).
// Switches on with GOOGLE_BUSINESS_ACCOUNT_ID, GOOGLE_BUSINESS_LOCATION_ID, and an OAuth client
// (GOOGLE_BUSINESS_CLIENT_ID / _CLIENT_SECRET) with a refresh token for the owner's Google login
// (GOOGLE_BUSINESS_REFRESH_TOKEN, scope https://www.googleapis.com/auth/business.manage).
// Google has to approve the project for the Business Profile APIs first (a form, a few days).

type Fetch = typeof fetch;

export const gbpEnabled = () =>
  liveServiceAllowed() && Boolean(process.env.GOOGLE_BUSINESS_ACCOUNT_ID && process.env.GOOGLE_BUSINESS_LOCATION_ID &&
          process.env.GOOGLE_BUSINESS_CLIENT_ID && process.env.GOOGLE_BUSINESS_CLIENT_SECRET &&
          process.env.GOOGLE_BUSINESS_REFRESH_TOKEN);

async function accessToken(f: Fetch) {
  const res = await f("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: process.env.GOOGLE_BUSINESS_REFRESH_TOKEN!,
      client_id: process.env.GOOGLE_BUSINESS_CLIENT_ID!,
      client_secret: process.env.GOOGLE_BUSINESS_CLIENT_SECRET!,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; error_description?: string };
  if (!res.ok || !data.access_token) throw new Error(`Google sign-in: ${data.error_description ?? res.status}`);
  return data.access_token;
}

/** A "What's new" update with an optional photo and a Book button. */
export async function postToGoogle(summary: string, imageUrl: string | undefined, bookUrl: string, f: Fetch = fetch) {
  const token = await accessToken(f);
  const account = process.env.GOOGLE_BUSINESS_ACCOUNT_ID!.replace(/^accounts\//, "");
  const location = process.env.GOOGLE_BUSINESS_LOCATION_ID!.replace(/^locations\//, "");
  const res = await f(`https://mybusiness.googleapis.com/v4/accounts/${account}/locations/${location}/localPosts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      languageCode: "en-NZ",
      topicType: "STANDARD",
      summary: summary.slice(0, 1500),
      callToAction: { actionType: "BOOK", url: bookUrl },
      ...(imageUrl ? { media: [{ mediaFormat: "PHOTO", sourceUrl: imageUrl }] } : {}),
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { name?: string; error?: { message?: string } };
  if (!res.ok) throw new Error(`Google: ${data.error?.message ?? res.status}`);
  return data.name ?? "";
}

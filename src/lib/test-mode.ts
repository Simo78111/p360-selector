// Test-site safety switch.
//
// The job-management branch has its own preview website on Vercel that talks to the
// "P360 Platform - Test" database (fake data). Vercel can copy Production settings into
// previews, so this file makes sure a test site can never reach anything real, even if a
// live key slips into its settings:
//   - it only talks to the test database (any other database URL is ignored);
//   - Fergus, Facebook/Instagram, Google Business Profile, Xero and live Stripe are switched off;
//   - every email goes to the test inbox, marked [TEST], never to a customer or supplier.
//
// A site is a test site when P360_ENV=test, or when Vercel built it from the
// job-management branch (VERCEL_GIT_COMMIT_REF), so a forgotten setting can't turn it live.

export const TEST_DATABASE_REF = "faqjfjljwwdsnwknmzhf";

export function isTestSite(): boolean {
  return process.env.P360_ENV === "test" || process.env.VERCEL_GIT_COMMIT_REF === "job-management";
}

/** On a test site, only the test database is allowed. Live sites are unaffected. */
export function databaseAllowed(url: string | undefined): boolean {
  if (!url) return false;
  if (!isTestSite()) return true;
  const ok = url.includes(`${TEST_DATABASE_REF}.supabase.co`);
  if (!ok) console.error("[test-mode] refused a non-test database on the test site:", url.replace(/^https?:\/\//, "").slice(0, 40));
  return ok;
}

/** Outside services that act on the real world: never from a test site. */
export function liveServiceAllowed(): boolean {
  return !isTestSite();
}

/** Where a test site's emails go instead of the real recipient. */
export function testInbox(): string | undefined {
  return process.env.TEST_EMAIL_TO || process.env.OFFICE_EMAIL || undefined;
}

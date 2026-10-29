// Checks the test-site safety switch (src/lib/test-mode.ts). Run: npx tsx scripts/test-test-mode.ts
import assert from "node:assert/strict";
import { databaseAllowed, isTestSite, liveServiceAllowed, testInbox } from "../src/lib/test-mode";

const LIVE = "https://swpzujthsmkicraeytan.supabase.co";
const TEST = "https://faqjfjljwwdsnwknmzhf.supabase.co";
const env = process.env;

delete env.P360_ENV; delete env.VERCEL_GIT_COMMIT_REF;
assert.equal(isTestSite(), false);
assert.equal(databaseAllowed(LIVE), true, "live site may use live");
assert.equal(liveServiceAllowed(), true);

env.VERCEL_GIT_COMMIT_REF = "job-management";
assert.equal(isTestSite(), true, "job-management branch is a test site even without P360_ENV");
assert.equal(databaseAllowed(LIVE), false, "test site refuses the live database");
assert.equal(databaseAllowed("https://vyvvomgopvwsoawphydi.supabase.co"), false, "test site refuses the live bookings database");
assert.equal(databaseAllowed(TEST), true);
assert.equal(liveServiceAllowed(), false, "Fergus/Meta/Google/Xero off on the test site");

delete env.VERCEL_GIT_COMMIT_REF; env.P360_ENV = "test";
assert.equal(isTestSite(), true);
env.OFFICE_EMAIL = "office@example.com"; delete env.TEST_EMAIL_TO;
assert.equal(testInbox(), "office@example.com");
env.TEST_EMAIL_TO = "tester@example.com";
assert.equal(testInbox(), "tester@example.com");
console.log("test-mode: ALL CHECKS PASSED");

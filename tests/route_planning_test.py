"""Route planning screens against a local engine (see README). Run with `npm run start` on :3360."""
import re, sys
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3360"
DAY = sys.argv[2] if len(sys.argv) > 2 else "2026-10-27"
SHOTS = "/tmp/claude-0"

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 1280, "height": 1000})
    page.goto(f"{BASE}/dashboard/login")
    page.fill("input[type=password]", "local-test")
    page.keyboard.press("Enter")
    page.wait_for_url("**/dashboard/office")

    # 1. An unplanned day: estimates, windows, and the plan button
    page.goto(f"{BASE}/dashboard/office?date={DAY}")
    expect(page.get_by_text("Not planned yet.")).to_be_visible()
    before = page.locator("h2", has_text="Simon").locator("xpath=../..").inner_text()
    order_before = re.findall(r"#\d+ Tap or mixer installation\s+\S+\s+(\w+ \w+)", before)
    page.screenshot(path=f"{SHOTS}/route_before.png", full_page=True)
    print("1. before:", order_before)

    # 2. Work out the best route (no texts)
    page.get_by_role("button", name="Work out best route now").click()
    expect(page.get_by_role("status")).to_contain_text("Route worked out (no texts sent)")
    msg = page.get_by_role("status").inner_text()
    print("2.", msg)
    m = re.search(r"Simon: (\d+) → (\d+) min driving", msg)
    assert m and int(m.group(2)) < int(m.group(1)), "less driving after planning"
    after = page.locator("h2", has_text="Simon").locator("xpath=../..").inner_text()
    order_after = re.findall(r"#\d+ Tap or mixer installation\s+\S+\s+(\w+ \w+)", after)
    print("   after:", order_after)
    expect(page.get_by_text(re.compile(r"min drive and park")).first).to_be_visible()
    page.screenshot(path=f"{SHOTS}/route_after.png", full_page=True)

    # 3. Plumbers: set a home, switch home routing on and off
    page.goto(f"{BASE}/dashboard/office/plumbers")
    expect(page.get_by_text("Now: Off")).to_be_visible()
    expect(page.get_by_role("button", name="Turn on")).to_be_disabled()   # no homes yet
    page.screenshot(path=f"{SHOTS}/plumbers.png", full_page=True)
    print("3. plumbers page: home routing off, can't turn on without a home")
    b.close()
    print("ALL CHECKS PASSED")

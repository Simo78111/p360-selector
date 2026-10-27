"""Office screen (/screen/<token>): fits a TV with no scrolling, first names only, refreshes and flags new urgent
   items, warns when it stops updating, and the Settings link controls (make, replace, switch off) and targets.
   Local engine with the screen seed (token a1b2…f90); site on :3360.
   Usage: python3 tests/screen_test.py [base-url] [engine-postgres-url]"""
import re, subprocess, sys
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3360"
DB = sys.argv[2] if len(sys.argv) > 2 else "postgresql://postgres@localhost:5433/engine"
TOKEN = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90"
SHOTS = "/tmp/claude-0"
expect.set_options(timeout=15000)

def sql(q):
    return subprocess.run(["psql", DB, "-Atc", q], capture_output=True, text=True, check=True).stdout.strip()

sql(f"update ops_settings set screen_token = '{TOKEN}', revenue_target_day = null, revenue_target_week = null")

with sync_playwright() as p:
    b = p.chromium.launch()
    tv = b.new_page(viewport={"width": 1920, "height": 1080})
    tv.clock.install()
    tv.goto(f"{BASE}/screen/{TOKEN}")
    expect(tv.get_by_role("heading", name="Needs attention")).to_be_visible()
    expect(tv.get_by_role("heading", name="Plumbers today")).to_be_visible()
    assert tv.evaluate("document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth")
    body = tv.locator("main").inner_text()
    assert not re.search(r"(Smith|Reid|Turner St|\+6421|021 )", body.replace("Jo Turner", "")), "no customer surnames or phones"
    expect(tv.get_by_text("Text from Gus: Water coming through the ceiling")).to_be_visible()
    expect(tv.get_by_text("1 urgent")).to_be_visible()
    expect(tv.get_by_text("(+35 min late)")).to_be_visible()
    expect(tv.get_by_text("TEST MODE")).to_be_visible()
    print("1. fits 1920×1080, first names only, urgent text and late plumber shown")

    # a new urgent item appears on the next refresh and is ringed
    sql("""insert into agent_actions (agent, action, payload, needs_approval, approval)
           values ('customer_service', 'reply_needs_attention',
                   jsonb_build_object('customer_id', (select id from customers where full_name = 'Lou Tai'), 'body', 'Smell of gas!',
                                      'ai_urgent', true, 'ai_summary', 'Smells gas in the kitchen'), true, 'pending')""")
    tv.clock.run_for(31_000)
    expect(tv.get_by_text("Text from Lou: Smells gas in the kitchen")).to_be_visible()
    expect(tv.get_by_text("2 urgent")).to_be_visible()
    assert "ring-2" in tv.locator("li", has_text="Smells gas").get_attribute("class")
    print("2. new urgent item shows within 30 seconds, highlighted")

    # targets show as progress bars
    sql("update ops_settings set revenue_target_day = 3000")
    tv.clock.run_for(31_000)
    expect(tv.get_by_text("58% of $3,000 target")).to_be_visible()
    print("3. daily target progress bar")

    # connection lost: warning after 2 minutes
    tv.route("**/api/screen/**", lambda r: r.abort())
    tv.clock.run_for(150_000)
    expect(tv.get_by_text(re.compile(r"Not updating — last update \d+ min ago"))).to_be_visible()
    tv.unroute("**/api/screen/**")
    tv.clock.run_for(31_000)
    expect(tv.get_by_text(re.compile("Not updating"))).to_have_count(0)
    print("4. 'Not updating' warning when the connection drops; clears when it's back")
    tv.screenshot(path=f"{SHOTS}/screen-test.png")

    # Settings: the link, replace it, switch off, targets
    page = b.new_page(viewport={"width": 1280, "height": 1000})
    page.goto(f"{BASE}/dashboard/login")
    page.fill("input[type=password]", "local-test")
    page.keyboard.press("Enter")
    page.wait_for_url("**/dashboard/office")
    page.goto(f"{BASE}/dashboard/office/settings#screen")
    link = page.get_by_label("Office screen link")
    expect(link).to_have_value(f"http://localhost:3360/screen/{TOKEN}")
    page.locator("#screen").get_by_role("button", name="Make a new link").click()
    expect(page.locator("p[role=status]")).to_contain_text("New screen link made")
    new_link = page.get_by_label("Office screen link").input_value()
    assert new_link != f"http://localhost:3360/screen/{TOKEN}" and re.search(r"/screen/[0-9a-f]{64}$", new_link), new_link
    tv.clock.run_for(31_000)
    expect(tv.get_by_text("Screen link no longer works")).to_be_visible()
    gone = b.new_page()
    gone.goto(f"{BASE}/screen/{TOKEN}")
    expect(gone.get_by_role("heading", name="This screen link doesn't work")).to_be_visible()
    gone.goto(new_link)
    expect(gone.get_by_role("heading", name="Needs attention")).to_be_visible()
    print("5. new link works; the old one stops and says so")

    page.fill("#target_day", "$2,500")
    page.fill("#target_week", "")
    page.uncheck("input[name=chime]")
    page.locator("#screen").get_by_role("button", name="Save").click()
    expect(page.locator("p[role=status]")).to_contain_text("Office screen settings saved.")
    assert sql("select revenue_target_day, revenue_target_week is null, screen_chime from ops_settings") == "2500.00|t|f"
    page.locator("#screen").get_by_role("button", name="Switch off").click()
    expect(page.locator("p[role=status]")).to_contain_text("switched off")
    expect(page.locator("#screen").get_by_role("button", name="Make the screen link")).to_be_visible()
    assert gone.request.get(new_link.replace("/screen/", "/api/screen/")).status == 404
    print("6. targets saved ($2,500/day, no weekly); switching off kills the link")
    sql(f"update ops_settings set screen_token = '{TOKEN}', screen_chime = true")
    print("ALL CHECKS PASSED")

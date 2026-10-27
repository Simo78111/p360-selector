"""Marketing page: the four kinds of draft (reminder, post, area page, ad), edits checked by the engine,
   approve / reject, area page goes live, settings and rules, unsubscribe link, phone width.
   Local engine with the marketing seed (one draft of each kind); site on :3360.
   Usage: python3 tests/marketing_test.py [base-url] [engine-postgres-url]"""
import re, subprocess, sys
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3360"
DB = sys.argv[2] if len(sys.argv) > 2 else "postgresql://postgres@localhost:5433/engine"
SHOTS = "/tmp/claude-0"
expect.set_options(timeout=15000)

def sql(q):
    return subprocess.run(["psql", DB, "-Atc", q], capture_output=True, text=True, check=True).stdout.strip()

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 1280, "height": 1100})
    page.goto(f"{BASE}/dashboard/login")
    page.fill("input[type=password]", "local-test")
    page.keyboard.press("Enter")
    page.wait_for_url("**/dashboard/office")
    page.goto(f"{BASE}/dashboard/office/marketing")
    expect(page.get_by_role("heading", name="Marketing", exact=True)).to_be_visible()
    cards = page.locator("form:has(input[name=kind])")
    expect(cards).to_have_count(4)
    page.screenshot(path=f"{SHOTS}/marketing.png", full_page=True)
    print("1. four drafts waiting: reminder, post, area page, ad")

    # 2. reminder: the engine refuses a text without the opt-out line; then approve
    card = cards.filter(has=page.locator("input[name=kind][value=campaign]"))
    expect(card).to_contain_text("Goes to 3 customers")
    card.locator("textarea[name=sms]").fill("{business}: Hi {first_name}, drain check time: {link}")
    card.get_by_role("button", name="Save changes").click()
    expect(page.locator("p[role=alert]")).to_contain_text("Reply STOP to opt out")
    card = page.locator("form:has(input[name=kind][value=campaign])")
    card.locator("textarea[name=sms]").fill("{business}: Hi {first_name}, it's a year since we cleared your drain. A quick check catches roots early: {link} Reply STOP to opt out")
    card.get_by_role("button", name="Approve and send").click()
    expect(page.locator("p[role=status]")).to_contain_text(re.compile(r"goes out at 9am|Sent: 3 texts"))
    print("2. reminder: missing STOP refused, then approved:", page.locator("p[role=status]").inner_text())

    # 3. area page: approve → live, in /areas and the sitemap
    card = page.locator("form:has(input[name=kind][value=seo_page])")
    card.locator("input[name=h1]").fill("Plumber in Ponsonby, Auckland")
    card.get_by_role("button", name="Approve and publish").click()
    expect(page.locator("p[role=status]")).to_contain_text("Published at /areas/plumber-ponsonby")
    area = b.new_page(viewport={"width": 1280, "height": 1000})
    area.goto(f"{BASE}/areas/plumber-ponsonby")
    expect(area.get_by_role("heading", level=1)).to_have_text("Plumber in Ponsonby, Auckland")
    expect(area.get_by_role("heading", name="How booking works")).to_be_visible()
    expect(area.locator("article li").first).to_contain_text("Blocked kitchen sinks")
    expect(area.get_by_text("Do you cover all of Ponsonby?")).to_be_visible()
    assert "FAQPage" in area.locator("script[type='application/ld+json']").inner_text()
    assert area.title() == "Plumber in Ponsonby | Plumbing 360", area.title()
    area.screenshot(path=f"{SHOTS}/area-page.png", full_page=True)
    area.goto(f"{BASE}/areas")
    expect(area.get_by_role("link", name="Plumber in Ponsonby, Auckland")).to_be_visible()
    assert "/areas/plumber-ponsonby" in area.request.get(f"{BASE}/sitemap.xml").text()
    print("3. area page live with headings, list, FAQ schema; listed on /areas and in the sitemap")

    # 4. post: no Meta/Google keys locally → approved and marked to post by hand
    page.reload()
    card = page.locator("form:has(input[name=kind][value=social_post])")
    card.locator("textarea[name=facebook]").fill("Fixed a leaking vanity in Eve Taylor's bathroom")
    card.get_by_role("button", name="Approve and post").click()
    expect(page.locator("p[role=alert]")).to_contain_text("names the customer")
    card = page.locator("form:has(input[name=kind][value=social_post])")
    card.locator("textarea[name=facebook]").fill("A drip under a vanity in Herne Bay, found and fixed. Book online: http://localhost:3360/get-started")
    card.get_by_role("button", name="Approve and post").click()
    expect(page.locator("p[role=status]")).to_contain_text("Approved and published")
    expect(page.get_by_text(re.compile(r"Post by hand: Facebook, Instagram, Google listing"))).to_be_visible()
    print("4. post naming the customer refused; then approved and left to post by hand (no keys)")

    # 5. ad: over the daily cap is refused; reject it with a note
    card = page.locator("form:has(input[name=kind][value=meta_ad])")
    card.locator("input[name=daily_budget]").evaluate("e => e.removeAttribute('max')")
    card.locator("input[name=daily_budget]").fill("80")
    card.get_by_role("button", name="Approve and post").click()
    expect(page.locator("p[role=alert]")).to_contain_text("Daily budget must be between $5 and $30")
    card = page.locator("form:has(input[name=kind][value=meta_ad])")
    card.locator("input[name=note]").fill("Not this week")
    card.get_by_role("button", name="Reject").click()
    expect(page.locator("p[role=status]")).to_contain_text("Rejected.")
    expect(page.get_by_text("Nothing waiting.")).to_be_visible()
    expect(page.get_by_text("Note: Not this week")).to_be_visible()
    print("5. ad over the $30/day cap refused, then rejected with a note")

    # 6. settings and rules
    page.fill("#ad_daily_budget_max", "25")
    page.uncheck("input[name=ads_on]")
    page.get_by_role("button", name="Save settings").click()
    expect(page.locator("p[role=status]")).to_contain_text("Marketing settings saved.")
    expect(page.locator("#ad_daily_budget_max")).to_have_value("25")
    expect(page.locator("input[name=ads_on]")).not_to_be_checked()
    rule = page.locator("#rules form").filter(has_text="Drain check a year on")
    rule.locator("input[name=after_days]").fill("300")
    rule.get_by_role("button", name="Save").click()
    expect(page.locator("p[role=status]")).to_contain_text('Saved "Drain check a year on"')
    assert sql("select after_days from marketing_rules where code = 'drain-check'") == "300"
    print("6. settings and a rule saved")

    # 7. take the area page down and put it back
    page.locator("#pages form").get_by_role("button", name="Take down").click()
    expect(page.locator("p[role=status]")).to_contain_text("taken down")
    assert area.request.get(f"{BASE}/areas/plumber-ponsonby").status == 404
    page.locator("#pages form").get_by_role("button", name="Put back").click()
    expect(page.locator("p[role=status]")).to_contain_text("back online")
    print("7. area page taken down (404) and put back")

    # 8. the unsubscribe link from a reminder email
    token = sql("select marketing_token from customers where full_name = 'Bob Brown'")
    u = b.new_page()
    u.goto(f"{BASE}/unsubscribe/{token}")
    expect(u.get_by_text("Hi Bob.")).to_be_visible()
    assert sql("select marketing_opt_out from customers where full_name = 'Bob Brown'") == "f", "opening the link alone does nothing"
    u.get_by_role("button", name="Unsubscribe me").click()
    expect(u.get_by_role("heading", name="You're unsubscribed")).to_be_visible()
    assert sql("select marketing_opt_out from customers where full_name = 'Bob Brown'") == "t"
    u.goto(f"{BASE}/unsubscribe/not-a-token")
    expect(u.get_by_role("heading", name="That link doesn't work")).to_be_visible()
    print("8. unsubscribe needs the button press; bad links handled")

    # 9. phone width
    m = b.new_page(viewport={"width": 390, "height": 844})
    m.context.add_cookies(page.context.cookies())
    for path in ["/dashboard/office/marketing", "/areas/plumber-ponsonby"]:
        m.goto(f"{BASE}{path}")
        assert m.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), f"sideways scroll on {path}"
    m.goto(f"{BASE}/dashboard/office/marketing")
    m.screenshot(path=f"{SHOTS}/marketing-phone.png", full_page=True)
    print("9. phone width OK")
    print("ALL CHECKS PASSED")

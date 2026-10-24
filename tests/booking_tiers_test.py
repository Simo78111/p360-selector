"""Booking form: Priority / Standard / Flexi. Run against `npm run start` on :3360.
   python3 tests/booking_tiers_test.py [base_url]"""
import json, sys
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3360"
SHOTS = "/tmp/claude-0"

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 390, "height": 900})
    posted = {}

    def fake_post(route):
        posted["body"] = route.request.post_data or ""
        route.fulfill(status=200, content_type="application/json",
                      body=json.dumps({"reference": "P360-TEST01", "url": f"{BASE}/book/confirmed?ref=P360-TEST01&tier=flexi"}))
    page.route("**/api/bookings", fake_post)

    # 1. A dripping basin: all three tiers, Standard picked by default
    page.goto(f"{BASE}/book?a=plumbing.leak.basin.dripping")
    page.fill("#description", "Slow drip under the bathroom vanity")
    page.get_by_role("button", name="Continue").click()
    page.fill("#street", "12 Ponsonby Road")
    page.fill("#suburb", "Ponsonby")
    page.fill("#postcode", "1011")
    page.get_by_text("I own the property").click()
    page.get_by_role("button", name="Continue").click()

    expect(page.get_by_role("heading", name="When would you like us?")).to_be_visible()
    radios = page.locator("input[name=tier]")
    assert radios.count() == 3, radios.count()
    expect(page.locator("input[name=tier][value=standard]")).to_be_checked()
    # Standard needs a day
    page.get_by_role("button", name="Continue").click()
    expect(page.get_by_text("Pick at least one day")).to_be_visible()
    page.screenshot(path=f"{SHOTS}/tiers_standard.png", full_page=True)

    # Flexi: days disappear, consent needed
    page.locator("label", has=page.locator("input[value=flexi]")).click()
    expect(page.get_by_text("Which days suit you?")).to_have_count(0)
    page.get_by_role("button", name="Continue").click()
    expect(page.get_by_text("Tick this so we can text you")).to_be_visible()
    page.get_by_text("Text me when a plumber").click()
    page.screenshot(path=f"{SHOTS}/tiers_flexi.png", full_page=True)
    page.get_by_role("button", name="Continue").click()

    page.fill("#name", "Test Person")
    page.fill("#phone", "021 123 4567")
    page.fill("#email", "test@example.com")
    page.get_by_role("button", name="Continue").click()

    expect(page.get_by_role("heading", name="Check your booking")).to_be_visible()
    expect(page.get_by_text("Flexi · from $75")).to_be_visible()  # $95 call-out less 20%, to the nearest $5
    page.screenshot(path=f"{SHOTS}/tiers_review.png", full_page=True)
    page.locator("input[type=checkbox]").last.check()  # booking terms
    page.get_by_role("button", name="Send booking").click()
    page.wait_for_url("**/book/confirmed**")
    body = posted["body"]
    assert 'name="tier"\r\n\r\nflexi' in body and 'name="poolConsent"\r\n\r\ntrue' in body, body[:600]
    expect(page.get_by_text("added you to our Flexi list")).to_be_visible()
    print("1. dripping basin: 3 tiers, Standard needs a day, Flexi needs consent, Flexi $75 sent")

    # 2. Cylinder replacement: no Flexi
    page.evaluate("sessionStorage.clear()")
    page.goto(f"{BASE}/book?a=plumbing.install.cylinder")
    page.fill("#description", "Old cylinder needs replacing")
    page.get_by_role("button", name="Continue").click()
    page.fill("#street", "3 Jervois Road"); page.fill("#suburb", "Herne Bay"); page.fill("#postcode", "1011")
    page.get_by_text("I own the property").click()
    page.get_by_role("button", name="Continue").click()
    assert page.locator("input[name=tier]").count() == 2
    assert page.locator("input[value=flexi]").count() == 0
    print("2. cylinder: Priority and Standard only")

    # 3. Overflowing toilet (urgent): Priority recommended
    page.evaluate("sessionStorage.clear()")
    page.goto(f"{BASE}/book?a=plumbing.blockage.toilet.overflowing")
    page.fill("#description", "Toilet overflowing when flushed")
    page.get_by_role("button", name="Continue").click()
    page.fill("#street", "5 Surrey Crescent"); page.fill("#suburb", "Grey Lynn"); page.fill("#postcode", "1021")
    page.get_by_text("I'm renting").click()
    page.get_by_role("button", name="Continue").click()
    expect(page.get_by_text("Recommended")).to_be_visible()
    assert page.locator("input[value=flexi]").count() == 0
    page.screenshot(path=f"{SHOTS}/tiers_urgent.png", full_page=True)
    print("3. urgent: Priority recommended, no Flexi")

    # 4. Confirmation page with a booked time
    page.goto(f"{BASE}/book/confirmed?ref=P360-TEST02&tier=standard&when=Wed%2028%20Oct%2012%3A00%20pm")
    expect(page.get_by_text("Wed 28 Oct 12:00 pm")).to_be_visible()
    page.screenshot(path=f"{SHOTS}/tiers_confirmed.png", full_page=True)
    print("4. confirmation shows the booked time")
    print("ALL CHECKS PASSED")
    b.close()

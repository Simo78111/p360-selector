"""Customer and property profile on the office job page: add notes (kinds), still right, remove,
   wipe everything. Local engine from local-stack.sh; site on :3360."""
import re, sys
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3360"
SHOTS = "/tmp/claude-0"
expect.set_options(timeout=15000)

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 1280, "height": 1100})
    page.goto(f"{BASE}/dashboard/login")
    page.fill("input[type=password]", "local-test")
    page.keyboard.press("Enter")
    page.wait_for_url("**/dashboard/office")
    page.goto(f"{BASE}/dashboard/office/jobs?q=Ann+Smith")
    page.locator("tbody tr").first.click()
    page.wait_for_url(re.compile(r".*/jobs/\d+$"))
    url = page.url
    panel = page.locator("#profile")
    expect(panel.get_by_text("Nothing noted yet.")).to_be_visible()

    for kind, text in [("gate_code", "Gate code 4321"), ("pet", "Max the labrador, friendly"),
                       ("preference", "Ring 10 minutes before arriving")]:
        page.select_option("#note-kind", kind)
        page.fill("#note-body", text)
        page.get_by_role("button", name="Add note").click()
        expect(page.get_by_text("Note saved.")).to_be_visible()
    notes = page.get_by_label("Profile notes").locator("li")
    expect(notes).to_have_count(3)
    expect(notes.nth(0)).to_contain_text("Gate/door code: Gate code 4321")
    expect(notes.nth(0)).to_contain_text("About the property · Office")
    expect(notes.nth(2)).to_contain_text("About the customer")
    page.screenshot(path=f"{SHOTS}/profile.png", full_page=True)
    print("1. three notes added; gate code first; preference is about the customer")

    notes.nth(0).get_by_role("button", name="Still right").click()
    expect(page.get_by_text("Marked as still right.")).to_be_visible()
    page.get_by_label("Profile notes").locator("li").nth(1).get_by_role("button", name=re.compile("Remove")).click()
    expect(page.get_by_text("Note removed.")).to_be_visible()
    expect(page.get_by_label("Profile notes").locator("li")).to_have_count(2)
    print("2. still right / remove")

    page.get_by_text("Customer asked us to forget their details?").click()
    page.get_by_role("button", name="Wipe notes").click()
    expect(page.get_by_text("Tick the box to confirm.")).to_be_visible()
    page.get_by_text("Customer asked us to forget their details?").click()
    page.check("input[name=sure]")
    page.get_by_role("button", name="Wipe notes").click()
    expect(page.get_by_text(re.compile("2 notes about this customer and their property wiped"))).to_be_visible()
    expect(page.locator("#profile").get_by_text("Nothing noted yet.")).to_be_visible()
    print("3. wipe needs a tick; then everything is wiped")

    m = b.new_page(viewport={"width": 390, "height": 844})
    m.context.add_cookies(page.context.cookies())
    m.goto(url)
    assert m.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "no sideways scroll"
    print("4. phone width OK")
    print("ALL CHECKS PASSED")
    b.close()

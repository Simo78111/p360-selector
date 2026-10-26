"""Adding, editing and deactivating plumbers in the office console.
   Local engine from local-stack.sh (Simon active with 4 jobs booked ahead); site on :3360.
   The local gateway fakes Supabase Auth's admin API so the app login can be checked."""
import re, sys
from playwright.sync_api import sync_playwright, expect

expect.set_options(timeout=15000)

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3360"
SHOTS = "/tmp/claude-0"

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 1280, "height": 1000})
    page.goto(f"{BASE}/dashboard/login")
    page.fill("input[type=password]", "local-test")
    page.keyboard.press("Enter")
    page.wait_for_url("**/dashboard/office")
    page.goto(f"{BASE}/dashboard/office/plumbers")

    # 1. Add a plumber with an app login
    page.get_by_text("+ Add a plumber").click()
    page.fill("#name-new", "Hemi Walker")
    page.fill("#phone-new", "021 555 0101")
    page.fill("#email-new", "Hemi@Example.co.nz")
    page.fill("#licence-new", "PGDB-778")
    page.fill("#start-new", "07:00")
    page.fill("#end-new", "15:30")
    page.fill("#password-new", "pipes-and-taps")
    page.check("#gas-new")
    page.fill("#rate-plumbing-new", "$110")
    page.fill("#rate-gas-new", "135.50")
    page.screenshot(path=f"{SHOTS}/plumber_new_form.png", full_page=True)
    page.get_by_role("button", name="Add plumber").click()
    expect(page.get_by_text(re.compile("Hemi Walker added. App login made"))).to_be_visible()
    row = page.locator("li", has=page.locator("p.font-semibold", has_text="Hemi Walker"))
    expect(row.get_by_text("+64215550101 · hemi@example.co.nz · PGDB PGDB-778")).to_be_visible()
    expect(row.get_by_text(re.compile("7:00 am – 3:30 pm"))).to_be_visible()
    expect(row.get_by_text("Plumber + gas fitter")).to_be_visible()
    expect(row.get_by_text(re.compile(r"\$110\.00/h plumbing · \$135\.50/h gas"))).to_be_visible()
    print("1. added Hemi with an app login")

    # 2. Duplicate mobile refused, bad home address refused (nothing half-made)
    page.get_by_text("+ Add a plumber").click()
    page.fill("#name-new", "Second Hemi")
    page.fill("#phone-new", "0215550101")
    page.get_by_role("button", name="Add plumber").click()
    expect(page.get_by_text(re.compile("Another plumber already has the mobile"))).to_be_visible()
    page.get_by_text("+ Add a plumber").click()
    page.fill("#name-new", "Nowhere Ned")
    page.fill("#phone-new", "0215550199")
    page.fill("#home-new", "zzzz nowhere")
    page.get_by_role("button", name="Add plumber").click()
    expect(page.get_by_role("alert").or_(page.get_by_text(re.compile("Couldn't find|Geocoding|fetch failed"))).first).to_be_visible()
    expect(page.get_by_text("Nowhere Ned")).to_have_count(0)
    print("2. duplicate mobile and unknown home refused")

    # 3. Edit Hemi: new shift, reset password
    page.goto(f"{BASE}/dashboard/office/plumbers")
    hemi = page.locator("li", has=page.locator("p.font-semibold", has_text="Hemi Walker"))
    hemi.get_by_text("Edit Hemi Walker").click()
    hemi.locator("input[name=shiftEnd]").fill("17:00")
    hemi.locator("input[name=password]").fill("new-password-1")
    hemi.get_by_role("button", name="Save changes").click()
    expect(page.get_by_text(re.compile("Hemi Walker saved. App password changed"))).to_be_visible()
    expect(page.locator("li", has=page.locator("p.font-semibold", has_text="Hemi Walker")).get_by_text(re.compile("7:00 am – 5:00 pm"))).to_be_visible()
    print("3. edited shift and reset the password")

    # 4. Simon has jobs booked, so can't be made inactive
    page.goto(f"{BASE}/dashboard/office/plumbers")
    simon = page.locator("li", has=page.locator("p.font-semibold", has_text="Simon"))
    simon.get_by_text("Edit Simon").click()
    expect(simon.get_by_text(re.compile("Move their 4 booked jobs first"))).to_be_visible()
    simon.get_by_role("button", name="Make inactive").click()
    expect(page.get_by_text(re.compile("Simon has 4 jobs booked from today on"))).to_be_visible()
    print("4. can't deactivate a plumber with booked jobs")

    # 5. Hemi has none: inactive, then back
    page.goto(f"{BASE}/dashboard/office/plumbers")
    hemi = page.locator("li", has=page.locator("p.font-semibold", has_text="Hemi Walker"))
    hemi.get_by_text("Edit Hemi Walker").click()
    hemi.get_by_role("button", name="Make inactive").click()
    expect(page.get_by_text("Hemi Walker is now inactive and won't be given jobs.")).to_be_visible()
    page.goto(f"{BASE}/dashboard/office/plumbers")
    hemi = page.locator("li", has=page.locator("p.font-semibold", has_text="Hemi Walker"))
    expect(hemi.get_by_text("inactive", exact=True)).to_be_visible()
    hemi.get_by_text("Edit Hemi Walker").click()
    hemi.get_by_role("button", name="Make active again").click()
    expect(page.get_by_text(re.compile("Hemi Walker is active again"))).to_be_visible()
    page.screenshot(path=f"{SHOTS}/plumbers_list.png", full_page=True)
    print("5. inactive and back")

    # 6. Phone width
    m = b.new_page(viewport={"width": 390, "height": 844})
    m.context.add_cookies(page.context.cookies())
    m.goto(f"{BASE}/dashboard/office/plumbers")
    m.get_by_text("+ Add a plumber").click()
    assert m.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "no sideways scroll"
    m.screenshot(path=f"{SHOTS}/plumbers_phone.png", full_page=True)
    print("6. phone width OK")
    print("ALL CHECKS PASSED")
    b.close()

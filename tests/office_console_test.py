"""Office console against a local engine (see README). Run with `npm run start` on :3360,
   ENGINE_* pointing at the local engine and DASHBOARD_PASSWORD=local-test."""
import re, sys
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3360"
SHOTS = "/tmp/claude-0"

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 1280, "height": 1000})

    page.goto(f"{BASE}/dashboard/login")
    page.fill("input[type=password]", "local-test")
    page.get_by_role("button", name=re.compile("log in", re.I)).click()
    page.wait_for_url("**/dashboard/office")
    print("1. login lands on the day board")

    # Find a day with jobs: go to the first booked job's day via the jobs list
    page.goto(f"{BASE}/dashboard/office/jobs?f=all")
    expect(page.get_by_text("Ann Smith")).to_be_visible()
    page.screenshot(path=f"{SHOTS}/office_jobs.png", full_page=True)
    page.fill("#q", "021 1000 002")
    page.get_by_role("button", name="Search").click()
    expect(page.get_by_text("Bob Jones")).to_be_visible()
    expect(page.get_by_text("Ann Smith")).to_have_count(0)
    print("2. jobs list and phone search")

    page.goto(f"{BASE}/dashboard/office/jobs?f=all")
    page.get_by_role("link", name=re.compile("Tap or mixer")).click()
    expect(page.get_by_text("New mixer in the kitchen")).to_be_visible()
    expect(page.get_by_text("Gate code 1234")).to_be_visible()
    expect(page.get_by_text("Text to customer").first).to_be_visible()
    page.screenshot(path=f"{SHOTS}/office_job.png", full_page=True)
    print("3. job page with history")

    # Move to the other plumber on the same day
    day = page.locator("#date").input_value()
    current = page.locator("#plumberId").evaluate("s => s.options[s.selectedIndex].text")
    other = "Ria" if current == "Simon" else "Simon"
    page.select_option("#plumberId", label=other)
    page.get_by_role("button", name="Move job").click()
    expect(page.get_by_role("status")).to_contain_text(f"Moved to {other}")
    expect(page.get_by_text(f"Job Moved: Moved to {other}").first).to_be_visible()
    print("4.", page.get_by_role("status").inner_text())

    page.get_by_role("link", name="See that day →").click()
    expect(page.get_by_role("heading", name=other)).to_be_visible()
    expect(page.get_by_text("Waiting for a time")).to_be_visible()
    expect(page.get_by_text(re.compile("thing.* need"))).to_be_visible()
    page.screenshot(path=f"{SHOTS}/office_today.png", full_page=True)
    print("5. day board:", day)

    # Book the Flexi job (Cat) from the waiting list
    row = page.locator("li", has_text="Cat Lee")
    row.get_by_role("button", name="Book first free slot").click()
    expect(page.get_by_role("status")).to_contain_text("customer has been texted")
    print("6. book now:", page.get_by_role("status").inner_text())

    # Needs attention: resolve
    page.goto(f"{BASE}/dashboard/office/attention")
    expect(page.get_by_text("Couldn't find a time")).to_be_visible()
    page.screenshot(path=f"{SHOTS}/office_attention.png", full_page=True)
    page.fill("input[name=note]", "Called Eve, booked for next week")
    page.get_by_role("button", name="Done").click()
    expect(page.get_by_text("All clear")).to_be_visible()
    print("7. attention item resolved")

    # Cancel Bob, with a text
    page.goto(f"{BASE}/dashboard/office/jobs?q=bob")
    page.get_by_role("link", name=re.compile("Blocked toilet")).click()
    page.fill("#reason", "Customer fixed it")
    page.get_by_role("button", name=re.compile("Cancel job #")).click()
    expect(page.get_by_role("status")).to_have_text("Cancelled. The customer has been texted.")
    expect(page.get_by_text(re.compile("has been cancelled. Questions")).first).to_be_visible()
    print("8. cancelled and texted")

    # Phone size
    page.set_viewport_size({"width": 390, "height": 900})
    page.goto(f"{BASE}/dashboard/office?date={day}")
    page.screenshot(path=f"{SHOTS}/office_today_phone.png", full_page=True)
    assert page.evaluate("document.documentElement.scrollWidth") <= 390, "no sideways scroll on a phone"
    print("9. fits a phone")
    print("ALL CHECKS PASSED")
    b.close()

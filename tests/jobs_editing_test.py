"""Bulk moves, return visits, callbacks, editing and search in the office console.
   Local engine seeded with yesterday's unfinished jobs (see README); site on :3360."""
import re, sys
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3360"
SHOTS = "/tmp/claude-0"

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 1280, "height": 1000})
    page.goto(f"{BASE}/dashboard/login")
    page.fill("input[type=password]", "local-test")
    page.keyboard.press("Enter")
    page.wait_for_url("**/dashboard/office")

    # 1. Today shows the overdue reminder
    expect(page.get_by_text(re.compile(r"4 jobs were booked for an earlier day"))).to_be_visible()
    page.get_by_role("link", name=re.compile("Review")).first.click()
    page.wait_for_url("**f=overdue")
    rows = page.locator("tbody tr")
    expect(rows).to_have_count(4)
    expect(page.get_by_text("Couldn't finish")).to_be_visible()
    page.screenshot(path=f"{SHOTS}/jobs_overdue.png", full_page=True)
    print("1. overdue list:", rows.count(), "jobs")

    # 2. Tick the three untouched ones, move them to Ria today
    for name in ["Takapuna Tom", "Milford Mia", "Grey Lynn Gus"]:
        page.locator("tr", has_text=name).locator("input[name=jobIds]").check()
    expect(page.locator("[data-selected-count]")).to_have_text("3 selected")
    page.select_option("#bulk-plumber", label="Ria")
    page.get_by_role("button", name="Move", exact=True).click()
    expect(page.get_by_role("status")).to_contain_text("Moved 3 jobs")
    print("2.", page.get_by_role("status").inner_text())
    expect(page.locator("tbody tr")).to_have_count(1)   # only Ponsonby left overdue

    # 3. Select all + disabled buttons when nothing is ticked
    expect(page.get_by_role("button", name="Move", exact=True)).to_be_disabled()
    page.get_by_label("Select all jobs").check()
    expect(page.locator("[data-selected-count]")).to_have_text("1 selected")
    page.get_by_label("Select all jobs").uncheck()

    # 4. Ponsonby: return visit with Simon tomorrow
    page.get_by_role("link", name=re.compile("Leak at a sink")).click()
    expect(page.get_by_text("couldn't be finished. Book a return visit")).to_be_visible()
    import datetime
    tomorrow = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()
    page.fill("#rv-date", tomorrow)
    page.get_by_role("button", name="Book return visit").click()
    expect(page.get_by_role("status")).to_contain_text("Return visit booked")
    expect(page.get_by_text("Book a return visit")).to_have_count(0)
    print("4.", page.get_by_role("status").inner_text())

    # 5. Edit details: access + office notes
    page.get_by_text("Edit details").click()
    page.fill("input[name=access_notes]", "Side gate, code 4321")
    page.fill("textarea[name=office_notes]", "Customer prefers mornings")
    page.get_by_role("button", name="Save changes").click()
    expect(page.get_by_role("status")).to_contain_text("Saved: access notes, office notes")
    expect(page.get_by_text("Office notes:")).to_be_visible()
    print("5.", page.get_by_role("status").inner_text())

    # 6. Header search finds it by the office note
    page.fill("#global-search", "prefers mornings")
    page.keyboard.press("Enter")
    page.wait_for_url("**/dashboard/office/jobs?f=all&q=*")
    expect(page.locator("tbody tr")).to_have_count(1)
    expect(page.get_by_text("Ponsonby Pat")).to_be_visible()
    print("6. search by office note finds the job")

    # 7. Callback on Dora's finished job
    page.fill("#global-search", "Dora")
    page.keyboard.press("Enter")
    page.get_by_role("link", name=re.compile("Tap or mixer")).click()
    page.fill("#cb-reason", "Mixer still dripping")
    page.get_by_role("button", name="Book callback").click()
    expect(page.get_by_role("status")).to_contain_text("Callback job #")
    expect(page.get_by_role("heading", name="Callbacks for this job")).to_be_visible()
    page.screenshot(path=f"{SHOTS}/job_callback.png", full_page=True)
    print("7.", page.get_by_role("status").inner_text())
    cb = re.search(r"Callback job #(\d+)", page.get_by_role("status").inner_text()).group(1)
    page.goto(f"{BASE}/dashboard/office/jobs/{cb}")
    expect(page.get_by_text("Callback for")).to_be_visible()
    expect(page.get_by_text("No charge (callback)")).to_be_visible()
    page.screenshot(path=f"{SHOTS}/job_is_callback.png", full_page=True)

    # 8. Callbacks filter + plumber count
    page.goto(f"{BASE}/dashboard/office/jobs?f=callbacks")
    expect(page.locator("tbody tr")).to_have_count(1)
    page.goto(f"{BASE}/dashboard/office/plumbers")
    expect(page.locator("li", has_text="Simon").get_by_text(re.compile("1 callback"))).to_be_visible()
    print("8. callbacks filter and plumber count")

    # 9. Bulk cancel the callback (texts the customer)
    page.goto(f"{BASE}/dashboard/office/jobs?f=callbacks")
    page.get_by_label("Select all jobs").check()
    page.fill("#bulk-reason", "Fixed over the phone")
    page.get_by_role("button", name="Cancel jobs").click()
    expect(page.get_by_role("status")).to_contain_text("Cancelled 1 job")
    print("9.", page.get_by_role("status").inner_text())

    # 10. Phone width
    page.set_viewport_size({"width": 390, "height": 900})
    page.goto(f"{BASE}/dashboard/office/jobs?f=open")
    page.screenshot(path=f"{SHOTS}/jobs_phone.png", full_page=True)
    assert page.evaluate("document.documentElement.scrollWidth") <= 390, "no sideways scroll"
    print("10. fits a phone")
    b.close()
print("ALL CHECKS PASSED")

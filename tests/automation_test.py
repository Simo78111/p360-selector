"""The automation pages: settings, a quote to check and send, orders, timesheets (+ CSV), plumbers off,
   gas certificate signing and the customer's copy. Local engine from local-stack.sh with the automation
   seed (a drafted quote, an order, a timesheet, a gas certificate); site on :3360.
   Usage: python3 tests/automation_test.py <sign_token> <job_number> <timesheet_date> [base]"""
import re, sys
from playwright.sync_api import sync_playwright, expect

TOKEN, JOB, DAY = sys.argv[1], sys.argv[2], sys.argv[3]
BASE = sys.argv[4] if len(sys.argv) > 4 else "http://localhost:3360"
SHOTS = "/tmp/claude-0"
expect.set_options(timeout=15000)
errors = []

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 1280, "height": 1100})
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(f"{BASE}/dashboard/login")
    page.fill("input[type=password]", "local-test")
    page.keyboard.press("Enter")
    page.wait_for_url("**/dashboard/office")

    # 1. Settings
    page.get_by_role("link", name="Settings").click()
    expect(page.get_by_role("heading", name="Settings", exact=True)).to_be_visible()
    expect(page.get_by_label("Your email")).to_have_value("simon@test.nz")
    page.get_by_label("Your Google review link").fill("https://g.page/r/TEST/review")
    page.get_by_label("Send automatically up to ($ incl GST)").fill("800")
    page.get_by_role("button", name="Save settings").click()
    expect(page.get_by_text("Settings saved.")).to_be_visible()
    expect(page.get_by_label("Send automatically up to ($ incl GST)")).to_have_value("800")
    mico = page.locator("form", has_text="Mico").filter(has=page.get_by_label("Order email"))
    mico.get_by_label("Pick-up branch").fill("Mico Penrose (Great South Rd)")
    mico.get_by_role("button", name="Save").click()
    expect(page.get_by_text("Ordering details saved for Mico.")).to_be_visible()
    page.get_by_label("Registration no.").first.fill("GF-1234")
    page.get_by_role("button", name="Save").last.click()
    expect(page.get_by_text("Gas details saved for Simon.")).to_be_visible()
    page.get_by_label("Your email").fill("not-an-email")
    page.get_by_role("button", name="Save settings").click()
    expect(page.locator("text=Your email").first).to_be_visible()      # browser blocks a bad email (type=email)
    page.screenshot(path=f"{SHOTS}/settings.png", full_page=True)
    print("1. settings, supplier ordering and gas details saved")

    # 2. A drafted quote waits in Needs attention with a line to price; price it and send
    page.goto(f"{BASE}/dashboard/office/attention")
    card = page.locator("li", has_text="Follow-up recommended")
    expect(card).to_contain_text("Quote drafted: $552.00 incl GST — check it and send (1 line(s) need a price)")
    card.get_by_role("button", name="Send quote to the customer").click()
    expect(page.get_by_text('Put a price on "180L mains pressure cylinder"')).to_be_visible()
    card = page.locator("li", has_text="Follow-up recommended")
    card.locator("input[placeholder='Price?']").fill("2100")
    card.get_by_role("button", name="Send quote to the customer").click()
    expect(page.get_by_text(re.compile(r"Quote sent to the customer: \$2967\.00 incl GST"))).to_be_visible()
    expect(page.locator("li", has_text="Follow-up recommended")).to_have_count(0)
    page.goto(f"{BASE}/dashboard/office/jobs/{JOB}")
    expect(page.locator("#quotes")).to_contain_text("Replace the hot water cylinder. — $2967.00 incl GST · sent, waiting for YES")
    expect(page.locator("#quotes")).to_contain_text("PO-00001 · Mico · sent")
    print("2. quote priced and sent from Needs attention; job shows the quote and the order")

    # 3. Orders
    page.get_by_role("link", name="Orders").click()
    expect(page.get_by_text("PO-00001 · Mico")).to_be_visible()
    expect(page.locator("li", has_text="PO-00001")).to_contain_text("2 x IV15 Isolating valve 15mm")
    print("3. orders page lists the order")

    # 4. Timesheets: Simon worked yesterday 7:20 → 10:00; correct and approve; CSV
    page.goto(f"{BASE}/dashboard/office/timesheets?week={DAY}")
    sec = page.locator("section", has_text="Simon")
    expect(sec.locator("input[name=start]")).to_have_value("07:20")
    expect(sec.locator("input[name=finish]")).to_have_value("10:00")
    sec.locator("input[name=start]").fill("07:00")
    sec.get_by_role("button", name="Save").click()
    expect(page.get_by_text("Saved: 3 hours.")).to_be_visible()
    page.get_by_role("button", name="Approve the whole week").click()
    expect(page.get_by_text("1 day approved.")).to_be_visible()
    expect(page.locator("section", has_text="Simon")).to_contain_text("Approved")
    with page.expect_download() as dl:
        page.get_by_role("link", name="Download CSV for payroll").click()
    csv = open(dl.value.path()).read()
    assert "Plumber,Email,Date,Start,Finish" in csv and f"Simon,simon@test.nz,{DAY},07:00,10:00,0,3,1,approved" in csv, csv
    page.screenshot(path=f"{SHOTS}/timesheets.png", full_page=True)
    print("4. timesheet corrected, approved, exported:", csv.splitlines()[1])

    # 5. Plumbers: mark Ria off for a day, then back on
    page.goto(f"{BASE}/dashboard/office/plumbers")
    page.get_by_label("Plumber", exact=True).select_option(label="Ria")
    page.get_by_role("button", name="Mark off and move their jobs").click()
    expect(page.get_by_text(re.compile(r"are off \d{4}-\d{2}-\d{2}\. 0 jobs moved"))).to_be_visible()
    off = page.locator("li", has_text="Ria").filter(has=page.get_by_role("button", name="Back on"))
    expect(off).to_contain_text("sick")
    off.get_by_role("button", name="Back on").click()
    expect(page.get_by_text(re.compile("Ria is back on"))).to_be_visible()
    print("5. plumber marked off and back on")

    # 6. Gas certificate: the certifier's link, required fields, sign, customer's copy
    page.goto(f"{BASE}/dashboard/office/certificates")
    expect(page.locator("li", has_text="GC-00001")).to_contain_text("With the certifier")
    c = b.new_page(viewport={"width": 390, "height": 844})
    c.on("pageerror", lambda e: errors.append(str(e)))
    c.goto(f"{BASE}/certify/{TOKEN}")
    expect(c.get_by_role("heading", name=re.compile("Gas Certificate of Compliance GC-00001"))).to_be_visible()
    expect(c.get_by_label("Location of the installation")).to_have_value(re.compile("Surrey Cres"))
    assert c.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "no sideways scroll on a phone"
    c.get_by_role("radio", name="Yes").first.check()
    c.locator("input[name=certified_design][value=no]").check()
    c.locator("input[name=manufacturer_instructions][value=yes]").check()
    c.get_by_label("Safe to connect to gas type").select_option("Natural gas")
    c.get_by_label("Safe to connect at pressure").fill("2.75 kPa")
    c.get_by_label("Authentication mark (reg 85B)").fill("AM-77")
    c.get_by_label("Registration no. (or employer licence no.)").fill("CG-9")
    c.get_by_label("Type your full name to sign").fill("Simon Test")
    c.get_by_role("button", name="Sign and send to the customer").click()
    expect(c.get_by_role("heading", name=re.compile("Gas Certificate"))).to_be_visible()     # declaration not ticked: browser blocks
    c.get_by_label(re.compile("I am satisfied that the gasfitting work")).check()
    c.get_by_role("button", name="Sign and send to the customer").click()
    expect(c.get_by_text("Signed. The customer has been sent their copy.")).to_be_visible()
    expect(c.locator("article")).to_contain_text("Simon Test")
    expect(c.locator("article")).to_contain_text("Natural gas")
    c.screenshot(path=f"{SHOTS}/certificate-signed.png", full_page=True)
    page.reload()
    row = page.locator("li", has_text="GC-00001")
    expect(row).to_contain_text("Signed and sent to the customer")
    with page.expect_popup() as pop:
        row.get_by_role("link", name="View").click()
    v = pop.value
    expect(v.locator("article")).to_contain_text("Authentication mark: AM-77")
    assert "/certificate/" in v.url
    print("6. certifier signed from the link on a phone; customer copy viewable")

    b.close()

assert not errors, errors
print("ALL CHECKS PASSED")

"""Price books: upload two months of a supplier's CSV, markup, search, and extra work from
   the job page. Local engine from local-stack.sh; site on :3360."""
import re, sys, os
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3360"
SHOTS = "/tmp/claude-0"
FIX = os.path.join(os.path.dirname(__file__), "fixtures")
expect.set_options(timeout=15000)

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 1280, "height": 1000})
    page.goto(f"{BASE}/dashboard/login")
    page.fill("input[type=password]", "local-test")
    page.keyboard.press("Enter")
    page.wait_for_url("**/dashboard/office")
    page.get_by_role("link", name="Price books").click()
    page.wait_for_url("**/price-books")
    expect(page.get_by_text("No price books yet")).to_be_visible()

    # 1. Excel refused with a clear message
    page.set_input_files("#pb-file", "/tmp/claude-0/book.xlsx")
    expect(page.get_by_text(re.compile("That's an Excel file"))).to_be_visible()

    # 2. October CSV: header row found below the title lines, Nett (not RRP) chosen as cost
    page.fill("#pb-supplier", "Mico")
    page.set_input_files("#pb-file", f"{FIX}/mico-oct.csv")
    expect(page.locator("#col-code option:checked")).to_have_text("Item Code")
    expect(page.locator("#col-cost option:checked")).to_have_text("Nett Price")
    expect(page.locator("#col-unit option:checked")).to_have_text("UOM")
    expect(page.locator("#col-brand option:checked")).to_have_text("Brand")
    expect(page.locator("#col-discount option:checked")).to_have_text("Not in this file")
    expect(page.get_by_role("cell", name="Isolating valve 15mm, chrome")).to_be_visible()
    expect(page.get_by_role("cell", name='Tap washer 12mm "Jumbo" (pack 10)')).to_be_visible()
    page.screenshot(path=f"{SHOTS}/pb_preview.png", full_page=True)
    page.get_by_role("button", name="Upload 5 items").click()
    expect(page.get_by_text("Mico price book updated: 5 items.")).to_be_visible()
    expect(page.get_by_text(re.compile("1 rows skipped"))).to_be_visible()
    print("1-2. Excel refused; October book: 5 items, columns guessed")

    # 3. Search: default 30% markup, then Mico at 50%
    page.goto(f"{BASE}/dashboard/office/price-books?q=valve+15")
    row = page.locator("tr", has_text="Isolating valve 15mm")
    expect(row.get_by_role("cell", name="$13.00")).to_be_visible()
    expect(row.get_by_role("cell", name="$14.95")).to_be_visible()
    mico = page.locator("li", has=page.locator("p.font-semibold", has_text="Mico"))
    mico.locator("input[name=markup]").fill("50")
    mico.get_by_role("button", name="Save").click()
    expect(page.get_by_text("Saved. That supplier's items are now cost + 50%.")).to_be_visible()
    page.goto(f"{BASE}/dashboard/office/price-books?q=IV15C")
    expect(page.locator("tr", has_text="Isolating valve").get_by_role("cell", name="$15.00")).to_be_visible()
    print("3. search and markup")

    # 4. November: pick Mico from the list; summary of changes; old item gone, price history shown
    page.goto(f"{BASE}/dashboard/office/price-books")
    expect(page.locator("#pb-supplier")).to_have_value("Mico")
    page.set_input_files("#pb-file", f"{FIX}/mico-nov.csv")
    page.get_by_role("button", name="Upload 5 items").click()
    expect(page.get_by_text(re.compile(r"1 new · 2 price changes \(1 went up\) · 1 no longer listed"))).to_be_visible()
    page.goto(f"{BASE}/dashboard/office/price-books?q=valve")
    expect(page.get_by_text("was $10.00")).to_be_visible()
    expect(page.get_by_text("Ball valve 20mm lever")).to_be_visible()
    page.goto(f"{BASE}/dashboard/office/price-books?q=cartridge")
    expect(page.get_by_text(re.compile("Nothing matches"))).to_be_visible()
    page.goto(f"{BASE}/dashboard/office/price-books")
    expect(page.get_by_text(re.compile("Mico · .* · 5 items: 1 new, 2 price changes"))).to_be_visible()
    page.screenshot(path=f"{SHOTS}/pb_page.png", full_page=True)
    print("4. November book: changes summarised, discontinued item gone")

    # 5. Extra work from a job page: two valves + half an hour's labour
    page.goto(f"{BASE}/dashboard/office/jobs?q=Ann+Smith")
    page.get_by_role("link", name=re.compile(r"#\d+")).first.click()
    page.wait_for_url(re.compile(r".*/jobs/\d+$"))
    page.fill("#job-materials-q", "isolating 15")
    results = page.get_by_label("Search results")
    expect(results.get_by_text("Isolating valve 15mm, chrome")).to_be_visible()
    results.locator("li", has_text="Isolating valve").get_by_role("button", name="Add").click()
    results.locator("li", has_text="Isolating valve").get_by_role("button", name="Add").click()
    page.get_by_role("button", name="+ Labour").click()
    lab = page.locator("tr[data-line]", has=page.locator("input[placeholder=Labour]"))
    lab.get_by_label("Quantity").fill("0.5")
    lab.get_by_label("Price each excl GST").fill("120")
    # 2 x 16.50 (cost 11 + 50%) + 60 = 93 excl → 106.95 incl
    expect(page.get_by_text(re.compile(r"will see \$106\.95 incl GST"))).to_be_visible()
    expect(page.get_by_text("materials cost $22.00")).to_be_visible()
    page.screenshot(path=f"{SHOTS}/pb_job_builder.png", full_page=True)
    page.get_by_role("button", name=re.compile("Text Ann for approval")).click()
    expect(page.get_by_text(re.compile(r"Sent to Ann: 2 x Isolating valve 15mm, chrome, 0.5 x Labour, \$106.95"))).to_be_visible()
    table = page.locator("#materials table").first
    expect(table.get_by_text("IV15C · Mico")).to_be_visible()
    expect(table.get_by_role("cell", name="$33.00")).to_be_visible()
    expect(table.get_by_role("cell", name="$22.00")).to_be_visible()
    expect(page.get_by_text(re.compile("already waiting for Ann's answer"))).to_be_visible()
    expect(page.get_by_text(re.compile("Text from customer|Text to customer")).first).to_be_visible()
    print("5. extra work from the price book sent from the job page")

    # 6. Phone width
    m = b.new_page(viewport={"width": 390, "height": 844})
    m.context.add_cookies(page.context.cookies())
    m.goto(f"{BASE}/dashboard/office/price-books?q=valve")
    assert m.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "no sideways scroll"
    m.screenshot(path=f"{SHOTS}/pb_phone.png", full_page=True)
    print("6. phone width OK")
    print("ALL CHECKS PASSED")
    b.close()

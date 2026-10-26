"""Finished jobs: open from anywhere on the row, see what happened, add photos (shrunk in the
   browser), email them to the customer, remove one. Local engine from local-stack.sh with the first
   job finished (finish-job.sh); the local gateway fakes Storage and Resend. Site on :3360."""
import json, os, re, sys, urllib.request
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

    # 1. Done list: clicking the customer's name (not the job link) opens the job
    page.goto(f"{BASE}/dashboard/office/jobs?f=done")
    page.locator("tbody tr").first.get_by_text("Ann Smith").click()
    page.wait_for_url(re.compile(r".*/jobs/\d+$"))
    print("1. a finished job opens from anywhere on its row")

    # 2. What happened
    card = page.locator("section", has=page.get_by_role("heading", name="What happened"))
    expect(card.get_by_text(re.compile("on time|min late|min early"))).to_be_visible()
    expect(card.get_by_text(re.compile(r"2h on site \(planned 1h 30m\)"))).to_be_visible()
    expect(card.get_by_text("Swapped the mixer, tested, no leaks")).to_be_visible()
    expect(card.locator("dt", has_text="Invoice sent")).to_be_visible()
    expect(card.locator("dt", has_text="On the way")).to_be_visible()
    print("2. what happened: on the way, arrived, 2h on site vs 1h 30m planned, note, invoice")

    # 3. Add a before photo (2400px → shrunk to 1600px) and an after photo
    page.select_option("#photo-stage", "before")
    page.fill("#photo-caption", "Old mixer leaking")
    page.set_input_files("#photo-file", f"{FIX}/before.png")
    expect(page.get_by_text("1 photo added.")).to_be_visible()
    page.select_option("#photo-stage", "after")
    page.set_input_files("#photo-file", f"{FIX}/after.png")
    expect(page.get_by_text("1 photo added.")).to_be_visible()
    photos = page.get_by_label("Photos", exact=True).locator("li")
    expect(photos).to_have_count(2)
    expect(photos.first).to_contain_text("Before")
    expect(photos.first).to_contain_text("Old mixer leaking")
    img = photos.first.locator("img")
    expect(img).to_be_visible()
    page.wait_for_function("document.querySelector('[aria-label=Photos] img').naturalWidth > 0")
    w = img.evaluate("i => i.naturalWidth")
    assert w == 1600, f"shrunk to 1600px wide, got {w}"
    page.screenshot(path=f"{SHOTS}/job_photos.png", full_page=True)
    print("3. two photos added; the 2400px one was shrunk to 1600px")

    # 4. Email both to the customer
    page.get_by_role("button", name="Tick all").click()
    page.fill("#photo-to", "ann@example.com")
    page.fill("#photo-note", "Here's the finished job.")
    page.get_by_role("button", name="Email photos").click()
    expect(page.get_by_text("Emailed 2 photos to ann@example.com.")).to_be_visible()
    sent = json.loads(urllib.request.urlopen("http://localhost:3900/resend/last").read())
    assert sent["to"] == ["ann@example.com"] and len(sent["attachments"]) == 2, sent.get("to")
    assert sent["attachments"][0]["filename"].endswith("-before-1.jpg"), sent["attachments"][0]["filename"]
    assert "Here's the finished job." in sent["text"]
    page.reload()
    expect(page.get_by_text(re.compile("Photos Emailed: 2 photos emailed to ann@example.com"))).to_be_visible()
    print("4. emailed 2 photos as attachments; noted in the history")

    # 5. Remove one
    page.get_by_label("Photos", exact=True).locator("li").first.get_by_role("button", name="Remove").click()
    expect(page.get_by_text("Photo removed from the job.")).to_be_visible()
    expect(page.get_by_label("Photos", exact=True).locator("li")).to_have_count(1)
    print("5. removed one")

    # 6. Phone width
    m = b.new_page(viewport={"width": 390, "height": 844})
    m.context.add_cookies(page.context.cookies())
    m.goto(page.url)
    assert m.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "no sideways scroll"
    m.screenshot(path=f"{SHOTS}/job_photos_phone.png", full_page=True)
    print("6. phone width OK")
    print("ALL CHECKS PASSED")
    b.close()

"""Customer texts and the assistant: text as the customer from a job page (test mode), the
   answer-text function answers (fake Claude locally), the office sees what happened, replies to a
   handed-over text, switches the assistant mode. Local engine + functions (start-fn.sh); site on :3360."""
import json, re, sys, urllib.request
from playwright.sync_api import sync_playwright, expect

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3360"
SHOTS = "/tmp/claude-0"
SECRET = sys.argv[2] if len(sys.argv) > 2 else ""
expect.set_options(timeout=15000)

def answer(action_id):
    """Locally there's no pg_net, so do what the database trigger does on Supabase."""
    req = urllib.request.Request("http://localhost:8001", data=json.dumps({"action_id": action_id}).encode(),
                                 headers={"content-type": "application/json", "x-ai-secret": SECRET})
    return json.loads(urllib.request.urlopen(req).read())

def latest_action(body):
    import subprocess
    d = open("/tmp/claude-0/pgdir").read().strip()
    q = f"select id from agent_actions where payload->>'body' = '{body}' order by created_at desc limit 1"
    return subprocess.check_output(["su", "postgres", "-c", f'psql -h {d} -d postgres -Atc "{q}"'], cwd="/tmp").decode().strip()

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
    job_url = page.url

    # 1. Ask a question as the customer → answered automatically, shown in History
    page.fill("#sim-text", "When are you coming?")
    page.get_by_role("button", name="Send as customer").click()
    expect(page.get_by_text(re.compile("The assistant is answering it now"))).to_be_visible()
    r = answer(latest_action("When are you coming?"))
    assert r["result"]["status"] == "answered", r
    page.goto(job_url)
    expect(page.get_by_text("Plumbing 360: Your plumber is booked for tomorrow morning. You'll get the exact time the afternoon before.")).to_be_visible()
    print("1. question answered automatically; reply in the job's history")

    # 2. A gate code → access note, no office item
    page.fill("#sim-text", "The gate code is 4321")
    page.get_by_role("button", name="Send as customer").click()
    answer(latest_action("The gate code is 4321"))
    page.goto(job_url)
    expect(page.get_by_label("Profile notes").get_by_text(re.compile("Gate/door code: Gate code 4321"))).to_be_visible()
    expect(page.get_by_label("Profile notes").get_by_text(re.compile("From a text"))).to_be_visible()
    print("2. gate code added to the customer's profile")

    # 3. Reschedule → handed to the office with a holding reply; office replies and closes it
    page.fill("#sim-text", "Can you come Thursday instead?")
    page.get_by_role("button", name="Send as customer").click()
    answer(latest_action("Can you come Thursday instead?"))
    page.goto(f"{BASE}/dashboard/office/attention")
    item = page.locator("li", has_text="Can you come Thursday instead?")
    expect(item.get_by_text("Wants to move the job to Thursday")).to_be_visible()
    expect(item.get_by_text(re.compile("Replied: .Thanks, I've passed that to the team"))).to_be_visible()
    item.get_by_label("Reply by text").fill("Hi Ann, Thursday at 9am is fine. See you then!")
    page.screenshot(path=f"{SHOTS}/texts_attention.png", full_page=True)
    item.get_by_role("button", name="Send reply and close").click()
    expect(page.get_by_text("Reply sent.")).to_be_visible()
    expect(page.locator("li", has_text="Can you come Thursday instead?")).to_have_count(0)
    print("3. reschedule handed over with a holding reply; office replied and closed it")

    # 4. Suggest-only: nothing sent, the suggestion is pre-filled for the office
    page.get_by_role("button", name="Suggest only").click()
    expect(page.get_by_text("The assistant now only suggests replies; you send them.")).to_be_visible()
    page.goto(job_url)
    page.fill("#sim-text", "Is it still on?")
    page.get_by_role("button", name="Send as customer").click()
    r = answer(latest_action("Is it still on?"))
    assert not r["result"]["sent"], r
    page.goto(f"{BASE}/dashboard/office/attention")
    item = page.locator("li", has_text="Is it still on?")
    expect(item.get_by_label("Suggested reply (edit if you like)")).to_have_value(re.compile("Your plumber is booked for tomorrow"))
    page.get_by_role("button", name="Answer").click()
    expect(page.get_by_text(re.compile("now answers routine texts"))).to_be_visible()
    print("4. suggest-only mode: nothing sent, reply suggested for the office")

    # 5. Wrong secret refused
    try:
        req = urllib.request.Request("http://localhost:8001", data=b'{"action_id":"x"}', headers={"x-ai-secret": "nope"})
        urllib.request.urlopen(req)
        raise AssertionError("should be refused")
    except urllib.error.HTTPError as e:
        assert e.code == 403
    print("5. callers without the secret are refused")
    print("ALL CHECKS PASSED")
    b.close()

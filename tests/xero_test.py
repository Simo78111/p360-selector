"""Xero link, end to end, against tests/mocks/fake-xero.cjs and a local engine.
   Needs: fake Xero on :3950, the site on :3360 pointed at both (see README), ENGINE_URL + ENGINE_KEY env."""
import json, os, re, sys, urllib.request
from playwright.sync_api import sync_playwright, expect

BASE = "http://localhost:3360"
XERO = "http://localhost:3950"
ENGINE = os.environ.get("ENGINE_URL", "http://localhost:3900")
KEY = os.environ["ENGINE_KEY"]
SHOTS = "/tmp/claude-0"

def call(url, body=None, method=None, headers=None):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None,
                                 method=method or ("POST" if body is not None else "GET"),
                                 headers={"Content-Type": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(req) as r:
            t = r.read().decode()
            return r.status, (json.loads(t) if t else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

def rpc(fn, args=None):
    code, body = call(f"{ENGINE}/rest/v1/rpc/{fn}", args or {}, headers={"Authorization": f"Bearer {KEY}", "apikey": KEY})
    assert code in (200, 204), (fn, code, body)
    return body

def rows(table, query):
    code, body = call(f"{ENGINE}/rest/v1/{table}?{query}", headers={"Authorization": f"Bearer {KEY}", "apikey": KEY})
    assert code == 200, body
    return body

def finish_job(customer, phone, street, suburb, pc, lat, lng):
    """Book, schedule today and complete a job: the invoice is made automatically."""
    b = rpc("create_booking", {"p_full_name": customer, "p_phone": phone, "p_email": None, "p_address_line": street,
                               "p_suburb": suburb, "p_postcode": pc, "p_lat": lat, "p_lng": lng,
                               "p_service_code": "install-tap", "p_tier": "standard"})
    plumber = rows("plumbers", "select=id&active=eq.true&limit=1")[0]["id"]
    rpc("schedule_job", {"p_job_id": b["job_id"], "p_plumber_id": plumber,
                         "p_work_date": __import__("datetime").date.today().isoformat()})
    rpc("record_status", {"p_job_id": b["job_id"], "p_event": "completed"})
    inv = rows("invoices", f"select=id,invoice_number,xero_sync_status,total&job_id=eq.{b['job_id']}")[0]
    return b, inv

def texts(job_id):
    return [m["template"] + ": " + m["body"] for m in rows("messages", f"select=template,body&job_id=eq.{job_id}&order=created_at")]

# A job finished before Xero is connected: texted the old way
b_old, inv_old = finish_job("Old Customer", "+64211000091", "1 Queen St", "Auckland Central", "1010", -36.846, 174.766)
assert inv_old["xero_sync_status"] == "not_configured"
print("0. before Xero:", inv_old["invoice_number"], "texted:", texts(b_old["job_id"])[-1][:60])

with sync_playwright() as p:
    br = p.chromium.launch()
    page = br.new_page(viewport={"width": 1280, "height": 1000})
    page.goto(f"{BASE}/dashboard/login")
    page.fill("input[type=password]", "local-test")
    page.keyboard.press("Enter")
    page.wait_for_url("**/dashboard/office")

    # 1. Connect (the fake Xero signs in straight away)
    page.goto(f"{BASE}/dashboard/office/xero")
    expect(page.get_by_text("Not connected")).to_be_visible()
    page.get_by_role("link", name="Connect Xero").click()
    page.wait_for_url("**/dashboard/office/xero?ok=*")
    expect(page.get_by_role("status")).to_contain_text("Connected to Demo Company (NZ)")
    expect(page.get_by_role("heading", name="Demo Company (NZ)")).to_be_visible()
    print("1.", page.get_by_role("status").inner_text())

    # 2. Settings: accounts and tracking come from Xero
    page.select_option("#account", "200")
    page.select_option("#tracking", "Region|North")
    page.check("input[name=enabled]")
    page.get_by_role("button", name="Save").click()
    expect(page.get_by_role("status")).to_contain_text("New invoices now go to Xero")
    page.screenshot(path=f"{SHOTS}/xero_page.png", full_page=True)
    print("2. account 200, tracking Region: North, sending on")

    # 3. A job finishes: invoice waits for Xero, then goes, and the customer gets the link
    b, inv = finish_job("Ann Smith", "+64211000092", "12 Ponsonby Rd", "Ponsonby", "1011", -36.857, 174.744)
    assert inv["xero_sync_status"] == "pending", inv
    assert not any(t.startswith("invoice_ready") for t in texts(b["job_id"])), "text waits for Xero"
    # what the engine's 5-minute nudge does: POST with the engine's secret
    secret = rpc("xero_sync_secret")
    code, r = call(f"{BASE}/api/xero/sync", {}, headers={"x-sync-secret": secret})
    assert code == 200 and r["sent"] == [inv["invoice_number"]], (code, r)
    code, _ = call(f"{BASE}/api/xero/sync", {}, headers={"x-sync-secret": "wrong"})
    assert code == 401, "wrong secret refused"
    t = [x for x in texts(b["job_id"]) if x.startswith("invoice_ready_link")]
    assert t and "View and pay: https://in.xero.com/fake/" in t[0], texts(b["job_id"])
    print("3.", t[0])
    _, state = call(f"{XERO}/_state")
    xi = next(i for i in state["invoices"] if i["InvoiceNumber"] == inv["invoice_number"])
    assert xi["Reference"] == f"Job #{b['job_number']}" and xi["LineAmountTypes"] == "Exclusive"
    assert xi["LineItems"][0]["AccountCode"] == "200" and xi["LineItems"][0]["Tracking"] == [{"Name": "Region", "Option": "North"}]
    assert abs(xi["Total"] - float(inv["total"])) < 0.01, (xi["Total"], inv["total"])
    contact = next(c for c in state["contacts"] if c["Name"] == "Ann Smith")
    assert contact["Phones"][0]["PhoneNumber"] == "0211000092"
    print("   in Xero:", xi["InvoiceNumber"], xi["Reference"], "$%.2f" % xi["Total"], "contact", contact["Name"])

    # 4. Same name, different person → Xero needs unique names
    b2, inv2 = finish_job("Ann Smith", "+64211000093", "5 Surrey Cres", "Grey Lynn", "1021", -36.861, 174.735)
    page.reload()
    page.get_by_role("button", name="Send and check now").click()
    expect(page.get_by_role("status")).to_contain_text(f"Sent {inv2['invoice_number']}")
    _, state = call(f"{XERO}/_state")
    assert any(c["Name"] == "Ann Smith (0211000093)" for c in state["contacts"]), [c["Name"] for c in state["contacts"]]
    print("4. second Ann Smith →", "Ann Smith (0211000093)")

    # 5. Paid in Xero → payment here, customer thanked, job paid (token expired meanwhile: refreshed)
    call(f"{XERO}/_pay", {"number": inv["invoice_number"], "amount": float(inv["total"])})
    call(f"{XERO}/_expire", {})
    page.get_by_role("button", name="Send and check now").click()
    expect(page.get_by_role("status")).to_contain_text("1 newly paid")
    job = rows("jobs", f"select=status&id=eq.{b['job_id']}")[0]
    assert job["status"] == "paid", job
    assert any(x.startswith("payment_received") for x in texts(b["job_id"]))
    _, state = call(f"{XERO}/_state")
    assert state["refreshes"] >= 1, "token refreshed after expiry"
    print("5.", page.get_by_role("status").inner_text(), "| refreshes:", state["refreshes"])

    # 6. The invoice from before Xero: send it by hand (not texted again)
    row = page.locator("tr", has_text=inv_old["invoice_number"])
    row.get_by_role("button", name="Send to Xero").click()
    expect(page.get_by_role("status")).to_contain_text(f"Sent {inv_old['invoice_number']} to Xero")
    assert sum(1 for x in texts(b_old["job_id"]) if x.startswith("invoice_ready")) == 1, "not texted twice"
    print("6. older invoice sent by hand; customer not texted again")

    # 7. A bad account code: refused by Xero → office told, customer still texted
    rpc("xero_settings", {"p_enabled": True, "p_account_code": "999", "p_tracking_name": None, "p_tracking_option": None})
    b3, inv3 = finish_job("Cat Lee", "+64211000094", "8 Garnet Rd", "Westmere", "1022", -36.853, 174.722)
    page.reload()
    page.get_by_role("button", name="Send and check now").click()
    expect(page.locator("p[role=alert]")).to_contain_text("not a valid code")
    assert not page.locator("p[role=alert]").inner_text().startswith("Nothing waiting")
    assert rows("invoices", f"select=xero_sync_status&id=eq.{inv3['id']}")[0]["xero_sync_status"] == "failed"
    assert any(x.startswith("invoice_ready:") for x in texts(b3["job_id"])), "customer still gets the invoice"
    page.screenshot(path=f"{SHOTS}/xero_failed.png", full_page=True)
    page.goto(f"{BASE}/dashboard/office/attention")
    expect(page.get_by_text(re.compile("couldn't be sent to Xero"))).to_be_visible()
    print("7. bad account code → failed, office told, customer texted without link")

    # 8. Disconnect
    page.goto(f"{BASE}/dashboard/office/xero")
    page.get_by_role("button", name="Disconnect").click()
    expect(page.get_by_text("Not connected")).to_be_visible()
    print("8. disconnected")
    br.close()
print("ALL CHECKS PASSED")

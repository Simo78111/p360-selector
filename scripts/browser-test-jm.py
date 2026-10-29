"""Browser test of the Phase 1 office screens: staff, companies, customers, pricing tiers, Fergus import.
Usage: python3 scripts/browser-test-jm.py <base-url> <screenshot-dir>
Needs the site running with the engine connected to a TEST database loaded with
supabase/seed/jm_fake_data.sql (engine repo), and the office console unlocked (local dev)."""
import sys, re, pathlib
from playwright.sync_api import sync_playwright, expect

base, shots = sys.argv[1].rstrip('/'), sys.argv[2]
fixtures = pathlib.Path(__file__).parent / 'fixtures' / 'fergus'
errors = []

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 1280, 'height': 900})
    pg.on('pageerror', lambda e: errors.append(str(e)))

    # 1. Staff: everyone, their roles, Smartly codes and licence warnings
    pg.goto(f'{base}/dashboard/office/staff')
    expect(pg.get_by_role('heading', name='Staff', exact=True)).to_be_visible()
    rows = pg.get_by_test_id('staff-row')
    expect(rows).to_have_count(5)
    tama = rows.filter(has_text='Tama Tradie')
    expect(tama).to_contain_text('Plumbing 360: Tradesperson')
    expect(tama).to_contain_text('Project 360: Tradesperson')
    expect(tama).to_contain_text('T9004')
    expect(tama).to_contain_text('Rate 2')
    expect(tama).to_contain_text('Site Safe TEST-SS-1004 · expired')
    expect(pg.get_by_role('status').filter(has_text='Licences expired or expiring')).to_contain_text('Sina Supervisor')
    pg.screenshot(path=f'{shots}/1-staff.png', full_page=True)
    print('1. Staff list: 5 people, roles in each company, Smartly code/rate, licence expiry warnings')

    # 2. Add someone (Project 360 tradesperson, works on jobs, with a login)
    pg.get_by_text('+ Add a staff member').click()
    form = pg.locator('details[open] form').first
    form.get_by_label('Name').fill('Wiremu Newstart (TEST)')
    form.get_by_label('Mobile').fill('021 900 0099')
    form.get_by_label('Email (their login)').fill('test.new@example.com')
    form.get_by_label('Trade').select_option('plumber')
    form.get_by_label('Cost rate ($/h excl GST)').fill('36')
    form.get_by_label('Charge-out rate ($/h excl GST)').fill('105')
    form.get_by_label('Smartly employee code').fill('T9099')
    form.get_by_label('Smartly pay rate').select_option('2')
    form.get_by_label('Password for a login (optional)').fill('TestPass-2026')
    form.get_by_label('Role at Project 360').select_option('tradesperson')
    form.get_by_label('Works on jobs (diary + plumber app)').check()
    form.get_by_role('button', name='Add staff member').click()
    expect(pg.get_by_role('status').first).to_contain_text('Wiremu Newstart (TEST) added. Login made: test.new@example.com')
    new = pg.get_by_test_id('staff-row').filter(has_text='Wiremu Newstart')
    expect(new).to_contain_text('Project 360: Tradesperson')
    expect(new).to_contain_text('has a login')
    expect(new).to_contain_text('in the diary')
    print('2. Added a staff member with a role, Smartly details and a login; they are in the diary')

    # duplicate Smartly code is refused with a plain message
    pg.get_by_text('+ Add a staff member').click()
    form = pg.locator('details[open] form').first
    form.get_by_label('Name').fill('Dup (TEST)')
    form.get_by_label('Smartly employee code').fill('T9099')
    form.get_by_role('button', name='Add staff member').click()
    expect(pg.locator('p[role=alert]')).to_contain_text('Smartly employee code T9099 is already used')
    print('   duplicate Smartly code refused')

    # 3. Edit and deactivate
    row = pg.get_by_test_id('staff-row').filter(has_text='Aria Apprentice')
    row.get_by_text('Edit Aria').click()
    row.get_by_label('Role at Plumbing 360').select_option('apprentice')
    row.get_by_role('button', name='Save', exact=True).first.click()
    expect(pg.get_by_test_id('staff-row').filter(has_text='Aria Apprentice')).to_contain_text('Plumbing 360: Apprentice')
    row = pg.get_by_test_id('staff-row').filter(has_text='Aria Apprentice')
    row.get_by_text('Edit Aria').click()
    row.get_by_label('Licence number').last.fill('TEST-PL-1005')
    row.get_by_label('Expiry date').last.fill('2027-03-31')
    row.get_by_role('button', name='+ Add licence').click()
    expect(pg.get_by_test_id('staff-row').filter(has_text='Aria Apprentice')).to_contain_text('TEST-PL-1005 · expires 31 Mar 2027')
    pg.get_by_test_id('staff-row').filter(has_text='Aria Apprentice').get_by_role('button', name='Deactivate').click()
    expect(pg.get_by_role('status').first).to_contain_text('is deactivated')
    expect(pg.get_by_test_id('staff-row')).to_have_count(5)
    pg.get_by_role('link', name=re.compile('show 1 inactive')).click()
    expect(pg.get_by_test_id('staff-row')).to_have_count(6)
    pg.get_by_test_id('staff-row').filter(has_text='Aria Apprentice').get_by_role('button', name='Make active').click()
    expect(pg.get_by_role('status').first).to_contain_text('is active again')
    print('3. Edited a role, added a licence with expiry, deactivated and reactivated')

    # 4. Companies
    pg.goto(f'{base}/dashboard/office/companies')
    expect(pg.get_by_role('heading', name='Project 360')).to_be_visible()
    ptsl = pg.locator('section', has=pg.get_by_role('heading', name='Project 360'))
    expect(ptsl).to_contain_text('next job PTSL-19938')
    expect(ptsl.get_by_label('Default markup on materials (%)')).to_have_value('23')
    expect(pg.locator('section', has=pg.get_by_role('heading', name='Plumbing 360')).get_by_label('Default markup on materials (%)')).to_have_value('60')
    ptsl.get_by_label('Email').fill('projects@example.com')
    ptsl.get_by_role('button', name='Save Project 360').click()
    expect(pg.get_by_role('status').first).to_contain_text('Project 360 saved')
    pg.screenshot(path=f'{shots}/4-companies.png', full_page=True)
    print('4. Companies: Plumbing 360 60%, Project 360 23% with PTSL-19938 next; details saved')

    # 5. Customers: each company sees only its own
    pg.goto(f'{base}/dashboard/office/customers?co=PTSL')
    expect(pg.get_by_role('link', name='Kowhai Construction Ltd (TEST)')).to_be_visible()
    expect(pg.get_by_role('link', name='Harriet Homeowner (TEST)')).to_have_count(0)
    pg.get_by_role('link', name='Plumbing 360').click()
    expect(pg.get_by_role('link', name='Harriet Homeowner (TEST)')).to_be_visible()
    expect(pg.get_by_role('link', name='Kowhai Construction Ltd (TEST)')).to_have_count(0)
    pg.get_by_role('link', name='Project 360').click()
    pg.get_by_label('Search customers').fill('rimu grove')
    pg.get_by_role('button', name='Search').click()
    expect(pg.locator('tbody tr')).to_have_count(1)
    print('5. Customers: each company lists only its own; search finds a customer by site address')

    pg.goto(f'{base}/dashboard/office/customers?co=PTSL')
    pg.get_by_text('+ Add a Project 360 customer').click()
    pg.get_by_label('Business name (if any)').fill('Pohutukawa Cafe (TEST)')
    pg.get_by_label("Person's name").fill('Mere Owner')
    pg.get_by_label('Type').select_option('commercial')
    pg.get_by_label('Pricing tier').select_option(label='Cost + 60')
    pg.get_by_role('button', name='Add customer').click()
    expect(pg.get_by_role('heading', name='Pohutukawa Cafe (TEST)')).to_be_visible()
    expect(pg.get_by_role('status').first).to_contain_text('Customer added')
    expect(pg.get_by_text('Project 360 · Commercial · Cost + 60')).to_be_visible()
    pg.get_by_text('+ Add a site').click()
    site = pg.locator('details[open]', has_text='+ Add a site')
    site.get_by_label('Site name (optional)').fill('Main shop')
    site.get_by_label('Street address').fill('5 Imaginary Lane')
    site.get_by_label('Suburb').fill('Mt Albert')
    site.get_by_role('button', name='Add site').click()
    expect(pg.get_by_text('Main shop — 5 Imaginary Lane, Mt Albert')).to_be_visible()
    pg.get_by_text('+ Add a contact').click()
    ct = pg.locator('details[open]', has_text='+ Add a contact')
    ct.get_by_label('Name').fill('Rua Manager')
    ct.get_by_label('Mobile').fill('022 900 4001')
    ct.get_by_label('Only for site').select_option(label='Main shop')
    ct.get_by_label('Primary contact').check()
    ct.get_by_label('Gets invoices').check()
    ct.get_by_role('button', name='Add contact').click()
    expect(pg.get_by_text('Rua Manager')).to_be_visible()
    expect(pg.get_by_text(re.compile(r'\+64229004001 · gets invoices · site: 5 Imaginary Lane'))).to_be_visible()
    pg.screenshot(path=f'{shots}/5-customer.png', full_page=True)
    print('   added a Project 360 customer on Cost + 60 with a site and a site contact')

    # 6. Pricing tiers
    pg.goto(f'{base}/dashboard/office/pricing?co=PTSL')
    expect(pg.get_by_test_id('tier')).to_have_count(2)
    cost60 = pg.get_by_test_id('tier').filter(has_text='Cost + 60')
    expect(cost60).to_contain_text('PB Plumber')
    expect(cost60).to_contain_text('$99.00')
    default = pg.get_by_test_id('tier').filter(has_text='Default tier (cost +40)')
    expect(default).to_contain_text('new customers start here')
    default.get_by_label('Item code').fill('GF')
    default.get_by_label('Fixed price ($ excl GST)').fill('104.5')
    default.get_by_role('button', name='Set item price').click()
    expect(pg.get_by_role('status').first).to_contain_text('Price saved')
    expect(pg.get_by_test_id('tier').filter(has_text='Default tier (cost +40)')).to_contain_text('$104.50')
    expect(pg.get_by_text('$62.00').first).to_be_visible()   # plumber labour cost
    expect(pg.get_by_text('$110.00').first).to_be_visible()  # gas fitter sell
    pg.screenshot(path=f'{shots}/6-pricing.png', full_page=True)
    print('6. Pricing: labour rates $62/$105 and $66/$110; tier prices shown and set')

    # 7. Fergus import, using the fake sample exports
    pg.goto(f'{base}/dashboard/office/import')
    pg.get_by_label('Into').select_option(label='Project 360')
    for kind, label, expect_added in [('customers', 'Customers', 4), ('sites', 'Sites', 3), ('contacts', 'Contacts', 3), ('tier_prices', 'Tier prices', 2)]:
        pg.get_by_label('Fergus CSV export').set_input_files(str(fixtures / f'{kind}.csv'))
        expect(pg.get_by_label("It's a list of")).to_have_value(kind)
        pg.get_by_role('button', name='Check first').click()
        result = pg.get_by_role('status').filter(has_text='Check only, nothing saved')
        expect(result).to_contain_text(f'{expect_added} new')
        pg.get_by_role('button', name='Import into Project 360').click()
        expect(pg.get_by_role('status').filter(has_text='Imported:')).to_contain_text(f'{expect_added} new')
        print(f'7. Fergus {label}: check first then import, {expect_added} new')
    expect(pg.get_by_role('status').filter(has_text='Imported:')).to_contain_text('Item not in the price books')
    pg.screenshot(path=f'{shots}/7-import.png', full_page=True)
    pg.reload()
    expect(pg.locator('tbody tr')).to_have_count(4)
    pg.goto(f'{base}/dashboard/office/customers?co=PTSL&q=Lena')
    pg.get_by_role('link', name='Lena Fakehouse').click()
    expect(pg.get_by_text('5 Pretend Street, Grey Lynn')).to_be_visible()
    print('   imports listed; imported customer has its site')

    b.close()

if errors:
    print('PAGE ERRORS:', errors)
    sys.exit(1)
print('No page errors. ALL CHECKS PASSED')

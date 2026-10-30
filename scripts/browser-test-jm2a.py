"""Browser test of Phase 2a: staff logins with roles on the office console, the jobs list and pipeline lists, the
job page (phases, pipeline moves, variations, notes, tasks, files, hold), and bookings alongside.

Usage: python3 scripts/browser-test-jm2a.py <base-url> <screenshot-dir> [vercel-share-cookie]
Needs the site connected to the TEST database with supabase/seed/jm_fake_data.sql and jm_phase2a_fake_data.sql
(engine repo) loaded, and the test logins (password P360-Test-2026!) in Supabase Auth."""
import sys, re, time, tempfile, pathlib
from playwright.sync_api import sync_playwright, expect

base, shots = sys.argv[1].rstrip('/'), sys.argv[2]
share = sys.argv[3] if len(sys.argv) > 3 else None
PASSWORD = 'P360-Test-2026!'
errors = []
stamp = time.strftime('%H%M%S')

def sign_in(pg, email, password=PASSWORD):
    pg.goto(f'{base}/dashboard/login')
    form = pg.get_by_test_id('staff-login')
    form.get_by_label('Email').fill(email)
    form.get_by_label('Password').fill(password)
    form.get_by_role('button', name='Sign in').click()

def sign_out(pg):
    pg.get_by_role('button', name='Log out').click()
    expect(pg.get_by_test_id('staff-login')).to_be_visible()

def nav(pg):
    return [t.strip() for t in pg.get_by_role('navigation', name='Dashboard').get_by_role('link').all_inner_texts()]

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1280, 'height': 900})
    if share:  # Vercel preview protection
        ctx.add_cookies([{'name': '_vercel_jwt', 'value': share, 'url': base}])
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errors.append(str(e)))

    # 1. Logins: wrong password, a tradesperson, then the Plumbing 360 office manager
    sign_in(pg, 'test.office@example.com', 'wrong-password')
    expect(pg.get_by_role('alert')).to_contain_text("That email and password don't match")
    sign_in(pg, 'test.tradie@example.com')
    expect(pg.get_by_role('alert')).to_contain_text('Your role uses the plumber app, not the office console')
    sign_in(pg, 'test.office@example.com')
    pg.wait_for_url(re.compile(r'/dashboard/office$'))
    expect(pg.get_by_test_id('signed-in-as')).to_contain_text('Oscar Office')
    items = nav(pg)
    assert 'Today' in items and 'All jobs' in items and 'Bookings' in items, items
    assert 'Settings' not in items and 'Xero' not in items and 'Companies' not in items, items
    pg.screenshot(path=f'{shots}/1-office-manager-today.png')
    pg.goto(f'{base}/dashboard/office/all-jobs?view=all')
    expect(pg.get_by_test_id('jobs-table')).to_be_visible()
    expect(pg.get_by_test_id('jobs-table')).not_to_contain_text('PTSL')
    expect(pg.get_by_test_id('jobs-table')).to_contain_text('Harriet Homeowner')
    pg.goto(f'{base}/dashboard/office/staff')
    expect(pg.get_by_text('View only: an owner/admin adds and changes staff')).to_be_visible()
    expect(pg.get_by_text('+ Add a staff member')).to_have_count(0)
    pg.goto(f'{base}/dashboard/office/settings')
    pg.wait_for_url(re.compile(r'err='))
    expect(pg.get_by_role('alert')).to_contain_text("Your role can't open that page")
    print('1. Logins: wrong password and trades refused; Plumbing 360 office manager sees bookings + Plumbing 360 jobs only, no settings, staff view-only')

    # the booking opens on the new job page, linked to the booking screen
    pg.goto(f'{base}/dashboard/office/all-jobs?view=all&q=Harriet')
    pg.get_by_test_id('jobs-table').get_by_role('link').first.click()
    expect(pg.get_by_test_id('booking-banner')).to_contain_text('Plumbing 360 booking')
    expect(pg.get_by_test_id('phase')).to_contain_text('To Schedule')
    expect(pg.get_by_test_id('job-actions')).to_have_count(0)
    booking_url = pg.url
    pg.get_by_test_id('booking-banner').get_by_role('link', name='booking screen').click()
    pg.wait_for_url(re.compile(r'/dashboard/office/jobs/\d+$'))
    pg.screenshot(path=f'{shots}/2-booking-screen.png')
    pg.goto(booking_url)
    nf = pg.get_by_test_id('note-form')
    nf.get_by_label('Add a note').fill(f'Customer prefers mornings ({stamp})')
    nf.get_by_role('button', name='Add note').click()
    expect(pg.get_by_test_id('log')).to_contain_text(f'Customer prefers mornings ({stamp})')
    print('2. A website booking shows in All jobs at its stage, opens with a link to the booking screen, takes notes')
    sign_out(pg)

    # 3. Owner: a new Project 360 job, phases, the pipeline, a variation
    sign_in(pg, 'test.owner@example.com')
    pg.wait_for_url(re.compile(r'/dashboard/office$'))
    assert 'Settings' in nav(pg)
    pg.goto(f'{base}/dashboard/office/all-jobs/new?co=PTSL&q=Kowhai')
    pg.get_by_test_id('customer-picker').get_by_role('link', name='Choose').first.click()
    form = pg.get_by_test_id('new-job-form')
    form.get_by_label('Job name').fill(f'Browser test job {stamp}')
    form.get_by_label('Site', exact=True).select_option(label='Lot 14, 14 Rimu Grove, Hobsonville')
    form.get_by_label("Customer's order number").fill(f'BT-{stamp}')
    form.get_by_label('Job manager').select_option(label='Sina Supervisor (TEST)')
    form.get_by_label('Phase name').fill('Drainage')
    form.get_by_role('button', name='Create job').click()
    expect(pg.get_by_role('status')).to_contain_text('created with phase PTSL-')
    ref = pg.get_by_test_id('job-ref').inner_text().strip()
    assert re.fullmatch(r'PTSL-\d{4,}', ref), ref
    expect(pg.get_by_test_id('job-header')).to_contain_text('Kowhai Construction Ltd (TEST)')
    expect(pg.get_by_test_id('job-header')).to_contain_text('Cost + 60')
    expect(pg.get_by_test_id('phase')).to_have_count(1)
    expect(pg.get_by_test_id('phase').first).to_contain_text(f'{ref}a')

    pg.get_by_text('+ Add a phase').click()
    pf = pg.get_by_test_id('phase-form')
    pf.get_by_label('Phase name').fill('Rough-in')
    pf.get_by_role('button', name='Add phase').click()
    expect(pg.get_by_role('status')).to_contain_text(f'Phase {ref}b added')
    a = pg.get_by_test_id('phase').filter(has_text=f'{ref}a')
    a.get_by_role('button', name='Move to To Start →').click()
    a = pg.get_by_test_id('phase').filter(has_text=f'{ref}a')
    a.get_by_role('button', name='Move to In Progress →').click()
    a = pg.get_by_test_id('phase').filter(has_text=f'{ref}a')
    expect(a.get_by_role('listitem').and_(pg.locator('[aria-current=step]'))).to_have_text('In Progress')
    a.get_by_role('button', name='← Back to To Start').click()
    a = pg.get_by_test_id('phase').filter(has_text=f'{ref}a')
    a.get_by_label('Jump to stage').select_option('to_invoice')
    a.get_by_role('button', name='Go').click()
    expect(pg.get_by_test_id('phase').filter(has_text=f'{ref}a')).to_contain_text('since')
    expect(pg.get_by_test_id('log')).to_contain_text(f'{ref}a: To Start → To Invoice')
    pg.screenshot(path=f'{shots}/3-job-page.png', full_page=True)
    print(f'3. Owner created {ref} (phase a), added phase b, moved a forward, back one, then jumped to To Invoice; history kept')

    # notes, tasks, a file
    a = pg.get_by_test_id('phase').filter(has_text=f'{ref}a')
    a.get_by_label(f'Note on {ref}a').fill('Drainage passed inspection')
    a.get_by_role('button', name='Add note').click()
    expect(pg.get_by_test_id('phase').filter(has_text=f'{ref}a')).to_contain_text('Drainage passed inspection')
    tf = pg.get_by_test_id('task-form')
    tf.get_by_label('New task').fill('Order the cylinder')
    tf.get_by_label('For').select_option(label='Tama Tradie (TEST)')
    tf.get_by_role('button', name='Add task').click()
    expect(pg.get_by_test_id('tasks')).to_contain_text('Order the cylinder')
    pg.get_by_test_id('tasks').get_by_role('button', name='Done').first.click()
    expect(pg.get_by_test_id('tasks')).to_contain_text('done by Olivia Owner')
    tmp = pathlib.Path(tempfile.mkdtemp()) / 'site-plan.pdf'
    tmp.write_bytes(b'%PDF-1.4\n% test file\n')
    up = pg.get_by_test_id('file-upload')
    up.get_by_label('Choose files or photos').set_input_files(str(tmp))
    up.get_by_role('button', name='Upload').click()
    expect(pg.get_by_test_id('files').get_by_role('link', name='site-plan.pdf')).to_be_visible(timeout=20000)
    with pg.expect_download() as dl:
        pg.get_by_test_id('files').get_by_role('link', name='site-plan.pdf').click()
    assert dl.value.suggested_filename == 'site-plan.pdf', dl.value.suggested_filename
    print('   note on a phase, a task done, a file uploaded and downloaded')

    # job settings, hold
    pg.get_by_text('Job settings').click()
    pg.get_by_label("Customer's order number").fill(f'BT-{stamp}-2')
    pg.get_by_role('button', name='Save settings').click()
    expect(pg.get_by_test_id('log')).to_contain_text(f'order number BT-{stamp}-2')
    pg.get_by_test_id('job-actions').get_by_text('Put on hold').click()
    pg.get_by_label('Why is it on hold?').fill('Waiting on the builder')
    pg.get_by_test_id('job-actions').get_by_role('button', name='Put on hold').click()
    expect(pg.get_by_text('On hold: Waiting on the builder')).to_be_visible()
    expect(pg.get_by_test_id('move-phase')).to_have_count(0)
    pg.get_by_role('button', name='Take off hold').click()
    expect(pg.get_by_test_id('move-phase')).to_have_count(2)
    print('   settings change logged; on hold pauses the pipeline; taken off hold')

    # a variation, and the project rolls up
    pg.get_by_text('+ Add a variation').click()
    vf = pg.get_by_test_id('variation-form')
    vf.get_by_label('Variation name').fill('Extra basin')
    vf.get_by_role('button', name='Add variation').click()
    expect(pg.get_by_role('status')).to_contain_text('Variation PTSL-')
    vref = pg.get_by_test_id('job-ref').inner_text().strip()
    expect(pg.get_by_text(f'Variation of {ref}')).to_be_visible()
    expect(pg.get_by_test_id('project')).to_contain_text('Project: 2 jobs')
    expect(pg.get_by_test_id('money')).to_contain_text('whole project, 2 jobs')
    print(f'4. Variation {vref} linked to {ref}; the project shows both jobs and rolled-up money')

    # the lists: waiting to invoice, search by order number, a phase number opens its job
    pg.goto(f'{base}/dashboard/office/all-jobs?view=stage:to_invoice')
    expect(pg.get_by_test_id('phases-table')).to_contain_text(f'{ref}a')
    expect(pg.get_by_test_id('phases-table')).to_contain_text('Replace riser valve')
    pg.screenshot(path=f'{shots}/4-waiting-to-invoice.png')
    pg.goto(f'{base}/dashboard/office/all-jobs?view=all&q=BT-{stamp}-2')
    expect(pg.get_by_test_id('jobs-table').locator('tbody tr')).to_have_count(1)
    pg.goto(f'{base}/dashboard/office/all-jobs?view=on_hold')
    expect(pg.get_by_test_id('jobs-table')).to_contain_text('Lot 14 new house plumbing (TEST)')
    pg.goto(f'{base}/dashboard/office/job/{ref}b')
    expect(pg.get_by_test_id('job-ref')).to_have_text(ref)
    print('5. Lists: waiting to invoice, search by order number, on hold; a phase number opens its job')
    sign_out(pg)

    # 6. Project 360 supervisor: jobs only, works on them but can't change them
    sign_in(pg, 'test.supervisor@example.com')
    pg.wait_for_url(re.compile(r'/dashboard/office/all-jobs$'))
    items = nav(pg)
    assert items == ['All jobs', 'Customers'], items
    expect(pg.get_by_test_id('jobs-table')).not_to_contain_text('Harriet')
    pg.goto(f'{base}/dashboard/office/job/{ref}')
    expect(pg.get_by_test_id('job-actions')).to_have_count(0)
    expect(pg.get_by_test_id('move-phase')).to_have_count(0)
    nf = pg.get_by_test_id('note-form')
    nf.get_by_label('Add a note').fill('Checked the falls, all good')
    nf.get_by_role('button', name='Add note').click()
    expect(pg.get_by_test_id('log')).to_contain_text('Checked the falls, all good')
    pg.goto(f'{base}/dashboard/office')
    pg.wait_for_url(re.compile(r'all-jobs\?err='))
    pg.goto(f'{base}/dashboard/office/customers?co=P360')
    expect(pg.get_by_role('heading', name='Customers')).to_be_visible()
    expect(pg.get_by_text('+ Add a')).to_have_count(0)
    pg.screenshot(path=f'{shots}/5-supervisor.png', full_page=True)
    print('6. Supervisor: All jobs and Customers only, no Plumbing 360; adds notes; no settings or stage moves')
    sign_out(pg)

    b.close()

if errors:
    print('Page errors:', errors)
    sys.exit(1)
print('ALL BROWSER CHECKS PASSED')

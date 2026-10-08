// Existing published sample: read-only. Scheduled/expired scenarios: intercepted responses only.
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')]; }));
const { chromium } = createRequire(import.meta.url)('C:/Users/Rj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out = 'docs/verification/create-event-2026-10-06-ui/evidence/publication'; fs.mkdirSync(out, { recursive: true });
const report = { checks: [], pageErrors: [], actualEventWrites: 0, retainedFixtures: 0 };
const settings = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, settings);
const student = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, settings);
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
let studentSession, adminSession, sample, published, studentPage, adminPage;
function assert(value, message) { if (!value) throw new Error(message); }
function sanitized(message) { return String(message).replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '[identifier]'); }
async function check(name, mode, action) { try { await action(); report.checks.push({ name, mode, status: 'PASS' }); } catch (error) { report.checks.push({ name, mode, status: 'FAIL', error: sanitized(error.message) }); } console.log(report.checks.at(-1)); }
async function pageFor(session) { const context = await browser.newContext({ viewport: { width: 1440, height: 900 } }); await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: `sb-${new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]}-auth-token`, session }); const page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', e => report.pageErrors.push(sanitized(e.message))); return page; }
const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const panel = p => p.getByRole('region', { name: 'Campus events', exact: true });
const adminCard = (p, title) => p.getByRole('heading', { name: title, exact: true }).locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
async function openEvents(p) { await p.getByRole('button', { name: 'Open event map', exact: true }).waitFor({ timeout: 60000 }); await p.getByRole('button', { name: 'Open event map', exact: true }).click(); await panel(p).waitFor(); await panel(p).getByText(/Loading published events/).waitFor({ state: 'hidden' }); }
async function pickEvent(p, title) { await panel(p).getByRole('button', { name: new RegExp(escapeRegex(title)) }).click(); await panel(p).getByText('Event map preview', { exact: true }).waitFor(); }
async function art(locator) { return locator.evaluate(svg => ({ color: getComputedStyle(svg).color, viewBox: svg.getAttribute('viewBox'), artwork: svg.querySelector('g')?.innerHTML })); }
async function selectMidnight(p) { await p.getByRole('spinbutton', { name: 'Hour', exact: true }).fill('12'); await p.getByRole('spinbutton', { name: 'Minute', exact: true }).fill('00'); await p.getByRole('button', { name: 'AM', exact: true }).click(); await p.getByRole('button', { name: 'Done', exact: true }).click(); }
try {
  const a = await admin.auth.signInWithPassword({ email: env.VITE_DEMO_ADMIN_EMAIL, password: env.VITE_DEMO_ADMIN_PASSWORD }); assert(!a.error, 'Existing admin sign-in failed'); adminSession = a.data.session;
  const s = await student.auth.signInWithPassword({ email: env.VITE_DEMO_STUDENT_EMAIL, password: env.VITE_DEMO_STUDENT_PASSWORD }); assert(!s.error, 'Existing student sign-in failed'); studentSession = s.data.session;
  const records = await admin.from('map_elements').select('id,campus_id,metadata,updated_at,name').eq('element_type', 'event_overlay'); assert(!records.error, 'Existing event inspection failed');
  sample = records.data.find(r => r.metadata?.title === 'TEST: College Week 2026 (sample)' && r.metadata.status === 'approved'); assert(sample, 'No approved sample is available for read-only parity');
  const feed = await student.rpc('list_published_event_previews', { p_campus_id: sample.campus_id }); assert(!feed.error, 'Student public feed read failed'); published = feed.data.events.find(e => e.id === sample.id); assert(published, 'The sample is not currently published/eligible');
  const campusRows = await student.rpc('list_event_safe_published_campuses'); assert(!campusRows.error, 'Published campus snapshot read failed');
  const campus = campusRows.data.find(r => r.campus_id === sample.campus_id || r.snapshot?.campus?.id === sample.campus_id)?.snapshot?.campus;
  const monument = campus?.decorAssets?.find(a => a.type === 'monument' && a.visible !== false);
  const grounds = published.locations.find(l => l.locationRef.type === 'campus'); const floor = published.locations.find(l => l.locationRef.type !== 'campus');
  assert(grounds && floor, 'Read-only parity requires the sample grounds and floor');
  const stage = grounds.eventFurniture.find(f => f.type === 'stage'); assert(stage, 'The sample has no visible stage');
  studentPage = await pageFor(studentSession); await studentPage.goto('http://127.0.0.1:5173/map'); await openEvents(studentPage);
  await check('Desktop event panel has full title and both location controls without duplicate search/back chrome', 'ACTUAL UI / READ-ONLY', async () => {
    await pickEvent(studentPage, published.title);
    assert(await panel(studentPage).getByRole('button', { name: 'Back to events', exact: true }).count() === 1, 'Back action is duplicated');
    assert(await studentPage.getByRole('searchbox', { name: 'Search campus map', exact: true }).count() === 0, 'Normal search overlaps event mode');
    const bounds = await panel(studentPage).boundingBox();
    for (const l of published.locations) { const b = await panel(studentPage).getByRole('button', { name: new RegExp(escapeRegex(l.locationRef.label) + '.*View') }).boundingBox(); assert(b && b.y >= bounds.y && b.y + b.height <= bounds.y + bounds.height, 'A location is clipped in desktop details'); }
    assert(bounds.height > 400 && bounds.y + bounds.height <= 900, 'Desktop panel still uses the short mobile height');
    await studentPage.screenshot({ path: `${out}/student-desktop-details.png`, fullPage: false });
  });
  await check('Campus Grounds venue is centered at the published monument', 'ACTUAL UI / READ-ONLY', async () => {
    assert(monument, 'No central monument exists in the published snapshot');
    const transform = await studentPage.locator('[data-event-venue="campus"]').locator('..').getAttribute('transform');
    assert(transform === `translate(${monument.x},${monument.y})`, 'Grounds marker is not centered at the monument');
    await panel(studentPage).getByRole('button', { name: new RegExp(escapeRegex(grounds.locationRef.label) + '.*View') }).click();
    await studentPage.getByTestId('event-preview-layer').waitFor(); await studentPage.screenshot({ path: `${out}/student-desktop-grounds.png`, fullPage: false });
  });
  adminPage = await pageFor(adminSession);
  await adminPage.route('**/rest/v1/rpc/manage_event_publication', r => r.abort()); // No accidental write in the actual-data context.
  await adminPage.goto('http://127.0.0.1:5173/admin-dashboard/event-layouts'); await adminCard(adminPage, published.title).waitFor({ timeout: 60000 });
  await adminCard(adminPage, published.title).getByRole('button', { name: 'Open map preview', exact: true }).click();
  await adminPage.getByRole('dialog', { name: 'Requested map preview', exact: true }).waitFor();
  const adminStage = adminPage.getByTestId(`event-furniture-${stage.id}`).getByRole('img', { name: stage.name, exact: true });
  await adminStage.waitFor();
  await check('Admin and student stage artwork/color/geometry match; student has no white editing box', 'ACTUAL UI / READ-ONLY', async () => {
    const studentStage = studentPage.getByTestId('event-preview-layer').getByRole('img', { name: stage.name, exact: true });
    const adminArt = await art(adminStage); const studentArt = await art(studentStage); assert(JSON.stringify(adminArt) === JSON.stringify(studentArt), 'Stage artwork/color differs');
    const studentGroup = studentStage.locator('..'); assert(await studentGroup.locator(':scope > rect').count() === 0, 'An editing box is shown to students');
    const adminDimensions = await adminPage.getByTestId(`event-furniture-${stage.id}`).evaluate(el => ({ x: Number.parseFloat(el.style.left), y: Number.parseFloat(el.style.top), w: Number.parseFloat(el.style.width), h: Number.parseFloat(el.style.height) }));
    assert(adminDimensions.x === stage.x && adminDimensions.y === stage.y && adminDimensions.w === stage.width && adminDimensions.h === stage.height, 'Admin uses different authored geometry');
    assert(await studentStage.getAttribute('width') === String(stage.width) && await studentStage.getAttribute('height') === String(stage.height), 'Student stage footprint differs');
    await adminStage.screenshot({ path: `${out}/admin-stage-art.png` }); await studentStage.screenshot({ path: `${out}/student-stage-art.png` }); await adminPage.screenshot({ path: `${out}/admin-grounds.png`, fullPage: false });
  });
  await check('Both roles show the same floor furniture and top-left label positions', 'ACTUAL UI / READ-ONLY', async () => {
    await adminPage.getByRole('button', { name: 'View ' + floor.locationRef.label, exact: true }).click();
    await panel(studentPage).getByRole('button', { name: new RegExp(escapeRegex(floor.locationRef.label) + '.*View') }).click();
    for (const f of floor.eventFurniture.filter(f => f.visible !== false)) { const adminVisual = adminPage.getByTestId(`event-furniture-${f.id}`).getByRole('img', { name: f.name, exact: true }); const publicVisual = studentPage.getByTestId('event-preview-layer').getByRole('img', { name: f.name, exact: true }); await publicVisual.waitFor(); assert(JSON.stringify(await art(adminVisual)) === JSON.stringify(await art(publicVisual)), 'Floor asset artwork/color differs'); }
    for (const l of floor.eventLabels.filter(l => l.visible !== false)) {
      const adminLabel = adminPage.getByTestId(`event-label-${l.id}`); const publicLabel = studentPage.locator(`[data-event-label-id="${l.id}"]`);
      const p = await adminLabel.evaluate(el => ({ x: el.style.left, y: el.style.top, weight: getComputedStyle(el).fontWeight }));
      report.labelComparison ??= []; report.labelComparison.push({ text: l.text, adminX: p.x, adminY: p.y, publicX: l.x, publicY: l.y, adminWeight: p.weight });
      // CSSOM serializes fractional pixel positions with fewer decimals than the SVG/JSON data.
      assert(Math.abs(Number.parseFloat(p.x) - l.x) < .01 && Math.abs(Number.parseFloat(p.y) - l.y) < .01 && p.weight === '700', 'Admin label position or weight differs');
      assert(await publicLabel.getAttribute('x') === String(l.x) && await publicLabel.getAttribute('y') === String(l.y) && await publicLabel.getAttribute('dominant-baseline') === 'text-before-edge' && await publicLabel.getAttribute('font-weight') === '700', 'Public label differs from top-left/bold admin label');
    }
    await studentPage.screenshot({ path: `${out}/student-desktop-floor.png`, fullPage: false }); await adminPage.screenshot({ path: `${out}/admin-floor.png`, fullPage: false });
  });
  await adminPage.getByRole('button', { name: 'Close map preview', exact: true }).click();
  await check('Already visible publication shows disabled Published and no initial stale-time error', 'ACTUAL UI / READ-ONLY', async () => {
    await adminCard(adminPage, published.title).getByRole('button', { name: 'Manage publication', exact: true }).click();
    assert(await adminPage.getByRole('button', { name: 'Published', exact: true }).isDisabled(), 'Already published event can be redundantly published');
    assert(await adminPage.getByRole('alert').count() === 0, 'Past stored publication is shown as a new error');
    await adminPage.screenshot({ path: `${out}/publication-desktop.png`, fullPage: false });
    await adminPage.setViewportSize({ width: 390, height: 844 });
    const modal = await adminPage.getByRole('dialog', { name: 'Manage event publication', exact: true }).boundingBox(); assert(modal.x >= 0 && modal.y >= 0 && modal.x + modal.width <= 390 && modal.y + modal.height <= 844, 'Publication modal overflows mobile');
    for (const text of ['Cancel', 'Published', 'Save schedule', 'Unpublish']) { const box = await adminPage.getByRole('button', { name: text, exact: true }).boundingBox(); assert(box.y >= 0 && box.y + box.height <= 844, text + ' is clipped'); }
    await adminPage.screenshot({ path: `${out}/publication-mobile.png`, fullPage: false }); await adminPage.getByRole('button', { name: 'Cancel', exact: true }).click();
  });
  await check('Mobile event details expand; location selection collapses the sheet and closing restores the regular map', 'ACTUAL UI / READ-ONLY', async () => {
    await studentPage.setViewportSize({ width: 390, height: 844 }); await studentPage.goto('http://127.0.0.1:5173/map'); await openEvents(studentPage); await pickEvent(studentPage, published.title);
    const details = await panel(studentPage).boundingBox(); assert(details.height > 350 && details.y >= 0 && details.y + details.height <= 844, 'Mobile details do not provide usable space within the viewport');
    for (const l of published.locations) { const b = await panel(studentPage).getByRole('button', { name: new RegExp(escapeRegex(l.locationRef.label) + '.*View') }).boundingBox(); assert(b.y >= details.y && b.y + b.height <= details.y + details.height, 'Mobile location clipped'); }
    await studentPage.screenshot({ path: `${out}/student-mobile-details.png`, fullPage: false });
    await panel(studentPage).getByRole('button', { name: new RegExp(escapeRegex(grounds.locationRef.label) + '.*View') }).click();
    const peek = await panel(studentPage).boundingBox(); assert(peek.height < 180, 'Sheet does not yield space to the selected map');
    await studentPage.screenshot({ path: `${out}/student-mobile-map.png`, fullPage: false });
    await panel(studentPage).getByRole('button', { name: 'Show event list', exact: true }).click();
    await panel(studentPage).getByRole('button', { name: new RegExp(escapeRegex(floor.locationRef.label) + '.*View') }).click();
    await studentPage.getByTestId('event-preview-layer').waitFor(); await studentPage.screenshot({ path: `${out}/student-mobile-floor.png`, fullPage: false });
    await panel(studentPage).getByRole('button', { name: 'Close campus events', exact: true }).click(); assert(await studentPage.getByTestId('event-preview-layer').count() === 0, 'Event assets leak into the regular map'); assert(await studentPage.getByRole('searchbox', { name: 'Search campus map', exact: true }).count() === 1, 'Regular map search is not restored');
  });

  await check('Short mobile landscape keeps location selection and publication actions reachable', 'ACTUAL UI / READ-ONLY', async () => {
    await studentPage.setViewportSize({ width: 740, height: 480 }); await studentPage.goto('http://127.0.0.1:5173/map'); await openEvents(studentPage); await pickEvent(studentPage, published.title);
    await panel(studentPage).getByRole('button', { name: new RegExp(escapeRegex(floor.locationRef.label) + '.*View') }).click();
    await studentPage.getByTestId('event-preview-layer').waitFor(); assert((await panel(studentPage).boundingBox()).height < 180, 'Landscape sheet covers the selected map');
    assert(await studentPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Landscape has horizontal page overflow');
    await studentPage.screenshot({ path: `${out}/student-landscape-map.png`, fullPage: false });
    await adminPage.setViewportSize({ width: 740, height: 480 }); await adminCard(adminPage, published.title).getByRole('button', { name: 'Manage publication', exact: true }).click();
    for (const name of ['Cancel', 'Published', 'Save schedule', 'Unpublish']) { const b = await adminPage.getByRole('button', { name, exact: true }).boundingBox(); assert(b.y >= 0 && b.y + b.height <= 480, 'A publication action is clipped in landscape'); }
    await adminPage.screenshot({ path: `${out}/publication-landscape.png`, fullPage: false }); await adminPage.getByRole('button', { name: 'Cancel', exact: true }).click();
  });

  // Controlled public feed uses the actual sample layouts, new in-memory identity/times, and actual browser UI.
  const now = Date.now(); const pubTime = now + 300000; const eventStart = now + 86400000; const eventEnd = now + 172800000;
  const simulated = { ...published, id: randomUUID(), title: 'QA controlled scheduled event', publicationAt: new Date(pubTime).toISOString(), dateStart: new Date(eventStart).toISOString(), dateEnd: new Date(eventEnd).toISOString() };
  let frame = 0;
  const boundaryTimes = [pubTime - 1, pubTime, eventStart, eventEnd];
  const controlledStudent = await pageFor(studentSession);
  await controlledStudent.route('**/rest/v1/rpc/list_published_event_previews', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ serverNow: new Date(boundaryTimes[frame]).toISOString(), events: frame === 0 || frame === 3 ? [] : [simulated] }) }));
  await check('Scheduled feed remains hidden then reflects Upcoming, Ongoing and expiry at controlled server boundaries', 'CONTROLLED RESPONSES / CLOCK, NO DATABASE WRITES', async () => {
    await controlledStudent.goto('http://127.0.0.1:5173/map'); await openEvents(controlledStudent); await panel(controlledStudent).getByRole('button', { name: 'Upcoming', exact: true }).click(); await panel(controlledStudent).getByText('No upcoming events', { exact: true }).waitFor();
    frame = 1; await controlledStudent.evaluate(() => window.dispatchEvent(new Event('focus'))); await panel(controlledStudent).getByRole('button', { name: /QA controlled scheduled event/ }).waitFor(); assert((await panel(controlledStudent).innerText()).includes('upcoming'), 'Publication did not appear in Upcoming'); await controlledStudent.screenshot({ path: `${out}/controlled-upcoming-desktop.png`, fullPage: false });
    await controlledStudent.setViewportSize({ width: 390, height: 844 }); await controlledStudent.screenshot({ path: `${out}/controlled-upcoming-mobile.png`, fullPage: false });
    frame = 2; await controlledStudent.evaluate(() => window.dispatchEvent(new Event('focus'))); await panel(controlledStudent).getByText('No upcoming events', { exact: true }).waitFor(); await panel(controlledStudent).getByRole('button', { name: 'Ongoing', exact: true }).click(); await panel(controlledStudent).getByRole('button', { name: /QA controlled scheduled event/ }).waitFor();
    await pickEvent(controlledStudent, simulated.title); await panel(controlledStudent).getByRole('button', { name: new RegExp(escapeRegex(grounds.locationRef.label) + '.*View') }).click(); await controlledStudent.getByTestId('event-preview-layer').waitFor();
    frame = 3; await controlledStudent.evaluate(() => window.dispatchEvent(new Event('focus'))); await panel(controlledStudent).getByText('No ongoing events', { exact: true }).waitFor(); assert(await controlledStudent.getByTestId('event-preview-layer').count() === 0, 'Expired event remains on the map');
  });

  let fake = { ...sample, id: randomUUID(), metadata: { ...sample.metadata, title: 'QA controlled publication settings', isActive: false, publicationAt: new Date(pubTime).toISOString(), dateStart: new Date(eventStart).toISOString(), dateEnd: new Date(eventEnd).toISOString() } };
  const controlledAdmin = await pageFor(adminSession); let commands = [];
  await controlledAdmin.route('**/rest/v1/map_elements?*', async route => { if (route.request().method() !== 'GET') { await route.abort(); return; } await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([fake]) }); });
  await controlledAdmin.route('**/rest/v1/rpc/manage_event_publication', async route => { const body = route.request().postDataJSON(); assert(body.p_overlay_id === fake.id, 'Controlled command targeted an existing record'); commands.push({ action: body.p_action, publicationAt: body.p_publication_at }); fake = { ...fake, updated_at: new Date().toISOString(), metadata: { ...fake.metadata, isActive: true, publicationAt: body.p_action === 'schedule' ? body.p_publication_at : new Date().toISOString() } }; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: fake.id, campusId: fake.campus_id, updatedAt: fake.updated_at, metadata: fake.metadata }) }); });
  await check('Admin schedules future publication through UI and sends the intended command without touching an existing event', 'CONTROLLED RPC / NO DATABASE WRITES', async () => {
    await controlledAdmin.goto('http://127.0.0.1:5173/admin-dashboard/event-layouts'); await controlledAdmin.getByRole('button', { name: 'Manage publication', exact: true }).waitFor({ timeout: 60000 }); await controlledAdmin.getByRole('button', { name: 'Manage publication', exact: true }).click();
    await controlledAdmin.getByRole('button', { name: /^Schedule student publication date:/ }).click(); const tomorrow = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', month: 'long', day: 'numeric', year: 'numeric' }).format(now + 86400000); await controlledAdmin.getByRole('button', { name: tomorrow, exact: true }).click();
    await controlledAdmin.getByRole('button', { name: /^Schedule student publication time:/ }).click(); await selectMidnight(controlledAdmin);
    await controlledAdmin.getByRole('button', { name: 'Save schedule', exact: true }).click(); await controlledAdmin.getByRole('dialog', { name: 'Manage event publication', exact: true }).waitFor({ state: 'hidden' }); assert(commands.length === 1 && commands[0].action === 'schedule' && Date.parse(commands[0].publicationAt) > now && Date.parse(commands[0].publicationAt) < eventStart, 'Schedule command time is wrong');
    await controlledAdmin.getByRole('button', { name: 'Manage publication', exact: true }).click(); assert((await controlledAdmin.getByRole('dialog', { name: 'Manage event publication', exact: true }).innerText()).includes('Scheduled'), 'Saved schedule state is not reflected'); await controlledAdmin.screenshot({ path: `${out}/controlled-scheduled-admin.png`, fullPage: false }); await controlledAdmin.getByRole('button', { name: 'Cancel', exact: true }).click();
  });
  await check('Expired event and past publication date are blocked with actionable guidance on mobile', 'CONTROLLED RESPONSES / NO DATABASE WRITES', async () => {
    fake = { ...fake, metadata: { ...fake.metadata, isActive: false, dateStart: new Date(now - 172800000).toISOString(), dateEnd: new Date(now - 86400000).toISOString() } };
    await controlledAdmin.setViewportSize({ width: 390, height: 844 }); await controlledAdmin.reload(); await controlledAdmin.getByRole('button', { name: 'Manage publication', exact: true }).click(); assert(await controlledAdmin.getByRole('button', { name: 'Publish now', exact: true }).isDisabled() && await controlledAdmin.getByRole('button', { name: 'Save schedule', exact: true }).isDisabled(), 'Expired event actions are enabled'); assert((await controlledAdmin.getByRole('alert').innerText()).includes('updated start and end dates'), 'Expired guidance is missing'); await controlledAdmin.screenshot({ path: `${out}/controlled-expired-mobile.png`, fullPage: false }); await controlledAdmin.getByRole('button', { name: 'Cancel', exact: true }).click();
    fake = { ...fake, metadata: { ...fake.metadata, dateStart: new Date(eventStart).toISOString(), dateEnd: new Date(eventEnd).toISOString() } }; await controlledAdmin.reload(); await controlledAdmin.getByRole('button', { name: 'Manage publication', exact: true }).click();
    await controlledAdmin.getByRole('button', { name: /^Schedule student publication date:/ }).click(); await controlledAdmin.getByRole('button', { name: 'Today', exact: true }).click(); await controlledAdmin.getByRole('button', { name: /^Schedule student publication time:/ }).click(); await selectMidnight(controlledAdmin); assert(await controlledAdmin.getByRole('button', { name: 'Save schedule', exact: true }).isDisabled(), 'Past schedule was not blocked'); await controlledAdmin.getByText('Choose a future publication time.', { exact: true }).waitFor(); await controlledAdmin.screenshot({ path: `${out}/controlled-past-schedule-mobile.png`, fullPage: false }); assert(commands.length === 1, 'Invalid form sent another command'); await controlledAdmin.getByRole('button', { name: 'Cancel', exact: true }).click();
  });
  const after = await admin.from('map_elements').select('metadata,updated_at').eq('id', sample.id).single(); assert(!after.error && after.data.updated_at === sample.updated_at && JSON.stringify(after.data.metadata) === JSON.stringify(sample.metadata), 'Existing sample changed during read-only verification');
  report.existingSampleUnchanged = true; report.controlledCommands = commands;
} catch (error) { report.failure = sanitized(error.message); process.exitCode = 1; if (studentPage) await studentPage.screenshot({ path: `${out}/failure-student.png`, fullPage: false }).catch(() => {}); }
finally { await browser.close(); await admin.auth.signOut({ scope: 'local' }); await student.auth.signOut({ scope: 'local' }); fs.writeFileSync(`${out}/publication-parity.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report)); if (report.checks.some(c => c.status === 'FAIL')) process.exitCode = 1; }

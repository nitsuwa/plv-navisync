// Controlled browser responses on the real rendered app. No event/database writes.
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')]; }));
const { chromium } = createRequire(import.meta.url)('C:/Users/Rj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = 'docs/verification/event-clarity-first-batch/evidence';
fs.mkdirSync(output, { recursive: true });
const boundsOnly = process.argv.includes('--notification-bounds');
const resultPath = `${output}/${boundsOnly ? 'bounds-results' : 'results'}.json`;
const report = { mode: 'CONTROLLED browser UI responses; existing demo sign-ins; no event writes', checks: [], pageErrors: [], resourceErrors: [], blockedWrites: 0, status: 'RUNNING' };
const client = () => createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = client(), org = client(), student = client();
let browser, page;
const check = (condition, label) => { if (!condition) throw new Error(label); report.checks.push({ label, status: 'PASS' }); fs.writeFileSync(resultPath, JSON.stringify(report, null, 2)); console.log(`PASS ${label}`); };
const stamp = delta => new Date(Date.now() + delta).toISOString();
let rows = [], publicEvents = [], publishedRows = [];
const readonlyRpc = new Set(['list_event_safe_published_campuses', 'list_coming_soon_campuses', 'list_published_event_previews', 'list_event_revisions']);
async function identity(client, email, password, label) {
  const result = await client.auth.signInWithPassword({ email, password });
  if (result.error || !result.data.session) throw new Error(`Configured ${label} sign-in failed`);
  return result.data;
}
async function open(identity, url, viewport) {
  const context = await browser.newContext({ viewport, hasTouch: viewport.width < 768 });
  const key = `sb-${new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
  await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key, session: identity.session });
  await context.route('**/rest/v1/**', route => {
    const req = route.request(), u = new URL(req.url());
    if (['GET', 'HEAD'].includes(req.method()) || readonlyRpc.has(u.pathname.split('/rpc/')[1])) return route.continue();
    report.blockedWrites++; return route.abort();
  });
  await context.route('**/rest/v1/map_elements?*', route => {
    const req = route.request(), url = new URL(req.url());
    if (req.method() !== 'GET') { report.blockedWrites++; return route.abort(); }
    if (!(url.searchParams.get('or')?.includes('event_overlay') || url.searchParams.has('id'))) return route.continue();
    const id = url.searchParams.get('id')?.replace(/^eq\./, '');
    const data = id ? rows.filter(row => row.id === id) : rows;
    const single = (req.headers().accept ?? '').includes('vnd.pgrst.object');
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(single ? data[0] ?? null : data) });
  });
  await context.route('**/rest/v1/rpc/list_published_event_previews', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ serverNow: stamp(0), events: publicEvents }) }));
  await context.route('**/rest/v1/rpc/list_event_safe_published_campuses', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(publishedRows) }));
  page = await context.newPage(); page.setDefaultTimeout(60000); page.setDefaultNavigationTimeout(60000);
  page.on('pageerror', e => report.pageErrors.push(e.message));
  page.on('response', response => { if (response.status() >= 400) report.resourceErrors.push({ status: response.status(), path: new URL(response.url()).pathname }); });
  await page.goto(`http://localhost:5173${url}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  return page;
}
async function shot(name) { await page.screenshot({ path: `${output}/${name}.png`, fullPage: false }); }
async function fit(label) {
  const result = await page.evaluate(() => ({ width: innerWidth, horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1 }));
  check(!result.horizontalOverflow, `${label}: no document horizontal overflow`);
  if (label.toLowerCase().includes('notifications')) {
    const box = await page.locator('[aria-label="Admin notifications"]').boundingBox();
    const size = page.viewportSize();
    check(box && box.x >= -1 && box.x + box.width <= size.width + 1 && box.y >= -1 && box.y + box.height <= size.height + 1, `${label}: whole popup stays inside viewport`);
  }
}
async function closeReview() {
  const dialog = page.getByRole('dialog', { name: 'Review Event Layout' });
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  const discard = page.getByRole('button', { name: 'Discard review', exact: true });
  if (await discard.isVisible().catch(() => false)) await discard.click();
  await dialog.waitFor({ state: 'hidden' });
}
try {
  const [adminIdentity, orgIdentity, studentIdentity] = await Promise.all([
    identity(admin, env.VITE_DEMO_ADMIN_EMAIL, env.VITE_DEMO_ADMIN_PASSWORD, 'Admin'),
    boundsOnly ? null : identity(org, env.VITE_DEMO_ORG_STUDENT_EMAIL, env.VITE_DEMO_ORG_STUDENT_PASSWORD, 'Org'),
    boundsOnly ? null : identity(student, env.VITE_DEMO_STUDENT_EMAIL, env.VITE_DEMO_STUDENT_PASSWORD, 'Student'),
  ]);
  const sample = await admin.from('map_elements').select('id,campus_id,name,metadata,updated_at').eq('id', 'db0da611-5738-4c55-a9c1-61d2714d77bc').single();
  if (sample.error || !sample.data) throw new Error('Read-only QA base event is unavailable');
  const base = sample.data;
  const published = boundsOnly ? { data: [], error: null } : await admin.rpc('list_event_safe_published_campuses');
  if (!boundsOnly && (published.error || !published.data?.length)) throw new Error('Read-only published campus snapshots are unavailable');
  publishedRows = structuredClone(published.data);
  const make = (title, status) => ({ ...structuredClone(base), id: randomUUID(), metadata: { ...structuredClone(base.metadata), title, organizer: 'QA Student Council', description: 'Controlled first-batch UI verification', status, submittedAt: stamp(-60000), lastEditedAt: stamp(-90000), revision: 3, adminComment: null, locationFeedback: {}, feedbackResolutions: {}, isActive: false } });
  const first = make('QA New Event Submission', 'pending'), second = make('QA Another Submission', 'pending'), approved = make('QA Approved Hidden Event', 'approved');
  rows = [first, second, approved];
  browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  // Keep one blank page alive while closing successive isolated role contexts.
  // Edge can otherwise terminate its last window during the next context handoff.
  const anchor = await browser.newContext(); await anchor.newPage();
  await open(adminIdentity, '/admin-dashboard/event-layouts', { width: 1440, height: 900 });
  await page.getByRole('link', { name: 'Event Layouts, 2 pending reviews', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Notifications', exact: true }).click();
  await page.getByRole('button', { name: `Review ${first.metadata.title}`, exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('[data-testid="admin-notification-unread"]')?.textContent === '2');
  check(true, 'Opening admin bell preserves both unread submissions');
  await fit('Admin desktop notifications'); await shot('01-admin-notifications-desktop');
  if (boundsOnly) {
    await page.setViewportSize({ width: 390, height: 844 });
    await fit('Admin mobile notifications'); await shot('notification-bounds-mobile');
    report.status = 'PASS';
  } else {
  await page.getByRole('button', { name: `Review ${first.metadata.title}`, exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Review Event Layout' });
  await review.getByText(first.metadata.title, { exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('[data-testid="admin-notification-unread"]')?.textContent === '1');
  check(true, 'Notification opens exact review and only its unread mark clears');
  await review.getByRole('button', { name: 'Preview requested maps', exact: true }).click();
  await page.getByRole('button', { name: 'Add pin', exact: true }).click();
  const canvas = page.getByLabel('Event layout canvas', { exact: true });
  const box = await canvas.boundingBox();
  await canvas.click({ position: { x: box.width * .45, y: box.height * .6 } });
  await page.getByLabel('Pin comment', { exact: true }).fill('QA: check the venue arrangement.');
  await page.getByRole('button', { name: 'Save pin', exact: true }).click();
  await page.getByText(/Pin saved to review draft.*not been sent/i).waitFor();
  check(true, 'Saved feedback pin explicitly remains an unsent review draft');
  await shot('02-admin-pin-draft-desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  await fit('Admin mobile pin preview'); await shot('03-admin-pin-draft-mobile');
  await page.getByRole('button', { name: 'Close map preview', exact: true }).click();
  await closeReview();
  await page.reload();
  await page.getByRole('button', { name: 'Notifications', exact: true }).click();
  await page.getByRole('button', { name: `Review ${second.metadata.title}`, exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('[data-testid="admin-notification-unread"]')?.textContent === '1');
  check(true, 'Admin unread receipt survives browser reload; pending work remains two');
  await fit('Admin mobile notifications'); await shot('04-admin-notifications-mobile');
  await page.getByRole('button', { name: 'Notifications', exact: true }).click();
  await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click();
  await page.getByRole('link', { name: 'Event Layouts, 2 pending reviews', exact: true }).waitFor();
  check(true, 'Mobile admin drawer shows pending-review count independently of unread');
  await shot('05-admin-mobile-navigation');
  await page.keyboard.press('Escape');
  first.metadata.lastEditedAt = stamp(0); first.metadata.revision = 4;
  await page.reload();
  await page.getByRole('button', { name: 'Notifications', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="admin-notification-unread"]')?.textContent === '2');
  await page.getByText('Maps updated', { exact: false }).first().waitFor();
  check(true, 'Changed pending layout revision becomes unread again');
  await page.getByRole('button', { name: 'Notifications', exact: true }).click();
  const approvedCard = page.getByText(approved.metadata.title, { exact: true }).locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
  await approvedCard.scrollIntoViewIfNeeded();
  await approvedCard.getByText('Unpublished', { exact: true }).waitFor();
  await approvedCard.getByRole('button', { name: 'Manage publication', exact: true }).click();
  await page.getByRole('dialog', { name: 'Manage event publication' }).getByText(/Hidden from students.*Approval is kept/).waitFor();
  check(true, 'Admin publication modal separates approval from hidden student visibility');
  await fit('Admin mobile publication'); await shot('06-admin-publication-mobile');
  await page.context().close();

  rows = [approved];
  await open(orgIdentity, '/student/events', { width: 390, height: 844 });
  const orgCard = page.getByTestId(`org-event-card-${approved.id}`);
  await orgCard.getByText('Unpublished', { exact: true }).waitFor();
  await orgCard.scrollIntoViewIfNeeded();
  check(true, 'Org approved card explicitly says map is hidden from students');
  await fit('Org mobile publication'); await shot('07-org-visibility-mobile');
  await page.setViewportSize({ width: 1440, height: 900 }); await orgCard.scrollIntoViewIfNeeded(); await shot('08-org-visibility-desktop');
  await page.context().close();

  const locations = structuredClone(base.metadata.locations);
  const floor = locations.find(l => l.locationRef.type === 'building');
  if (!floor) throw new Error('QA base requires a building floor');
  const building = publishedRows.find(row => row.campus_id === base.campus_id)?.snapshot?.campus?.buildings?.find(item => item.id === floor.locationRef.buildingId);
  if (!building?.floors?.length) throw new Error('Published building base is unavailable');
  let floorTwo = building.floors.find(item => item.number === 2);
  if (!floorTwo) {
    floorTwo = { ...structuredClone(building.floors[0]), id: 'controlled-floor-two', number: 2, label: 'Floor 2' };
    building.floors.push(floorTwo); report.controlledAdditionalFloor = true;
  }
  locations.push({ ...structuredClone(floor), id: 'qa-floor-two', locationRef: { ...floor.locationRef, floorId: `${floor.locationRef.buildingId}-f2`, label: `${building.name} — ${floorTwo.label}` }, eventFurniture: [], eventLabels: [] });
  const publicOne = { id: randomUUID(), campusId: base.campus_id, title: 'QA Labeled Multi-floor Event', description: 'Venue pins identify locations; each floor opens its own event map.', organizer: 'QA Student Council', status: 'approved', isActive: true, publicationAt: stamp(-3600000), dateStart: stamp(86400000), dateEnd: stamp(90000000), locations, markers: [] };
  const publicTwo = { ...structuredClone(publicOne), id: randomUUID(), title: 'QA Shared Venue Event', locations: locations.filter(l => l.locationRef.type === 'campus') };
  publicEvents = [publicOne, publicTwo];
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 360, height: 640 }]) {
    await open(studentIdentity, '/map', viewport);
    await page.getByRole('button', { name: 'Open event map', exact: true }).click();
    let panel = page.getByRole('region', { name: 'Campus events', exact: true });
    await panel.getByRole('button', { name: publicOne.title }).waitFor();
    await page.getByText('2 events', { exact: true }).waitFor();
    check(true, `Student ${viewport.width}px: shared venue badge explicitly counts events`);
    await panel.getByRole('button', { name: publicOne.title }).click();
    if (viewport.width < 768) await panel.getByRole('button', { name: 'Collapse event panel', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-event-venue]').length === 2);
    check(await page.getByText('2 events', { exact: true }).count() === 0, `Student ${viewport.width}px: selected event scopes pins to its own venues`);
    const buildingPin = page.locator(`[data-event-venue="building:${floor.locationRef.buildingId}"]`);
    await buildingPin.click();
    await panel.getByRole('button', { name: `View map: ${floor.locationRef.label}`, exact: true }).waitFor();
    const secondFloorLabel = locations.at(-1).locationRef.label;
    await panel.getByRole('button', { name: `View map: ${secondFloorLabel}`, exact: true }).waitFor();
    await panel.getByText(`Organized by ${publicOne.organizer}`, { exact: true }).waitFor();
    check(true, `Student ${viewport.width}px: venue inspection shows event context and both floor choices`);
    await fit(`Student ${viewport.width}px venue panel`); await shot(`09-student-venue-${viewport.width}`);
    await panel.getByRole('button', { name: `View map: ${secondFloorLabel}`, exact: true }).click();
    await panel.getByText(secondFloorLabel, { exact: true }).first().waitFor();
    check(await page.getByTestId('student-event-map-button').getAttribute('data-indoor') === 'true', `Student ${viewport.width}px: Floor 2 choice enters the building map`);
    await fit(`Student ${viewport.width}px indoor view`); await shot(`10-student-indoor-${viewport.width}`);
    await page.context().close();
  }
  check(report.pageErrors.length === 0, 'No browser page errors across all role/viewport checks');
  check(report.blockedWrites === 0, 'No event/database mutation attempts were made');
  report.status = 'PASS';
  }
} catch (error) {
  report.status = 'FAIL'; report.failure = error instanceof Error ? error.message : String(error);
  console.log(`FAIL ${report.failure}`);
  if (page && !page.isClosed()) await shot(boundsOnly ? 'before-notification-bounds-mobile' : 'failure').catch(() => {});
  process.exitCode = 1;
} finally {
  fs.writeFileSync(resultPath, JSON.stringify(report, null, 2));
  await browser?.close();
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, pageErrors: report.pageErrors.length, resourceErrors: report.resourceErrors, failure: report.failure ?? null }));
}

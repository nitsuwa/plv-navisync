// Existing student/admin accounts; real navigation and controlled review GET data. No event writes.
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')]; }));
const { chromium } = createRequire(import.meta.url)('C:/Users/Rj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out = 'docs/verification/create-event-2026-10-06-ui/evidence/event-access'; fs.mkdirSync(out, { recursive: true });
const report = { checks: [], pageErrors: [], blockedWriteAttempts: 0, retainedFixtures: 0 };
const config = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, config); const student = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, config);
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
let page;
const assert = (value, message) => { if (!value) throw new Error(message); };
async function check(name, action) { try { await action(); report.checks.push({ name, status: 'PASS' }); } catch (error) { report.checks.push({ name, status: 'FAIL', error: error.message }); await page.screenshot({ path: `${out}/failure-${report.checks.length}.png` }).catch(() => {}); } console.log(report.checks.at(-1)); }
async function contextFor(session) { const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true }); await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: `sb-${new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]}-auth-token`, session }); const reads = new Set(['list_event_safe_published_campuses', 'list_coming_soon_campuses', 'list_published_event_previews']); await context.route('**/rest/v1/**', route => { const req = route.request(); if (['GET', 'HEAD'].includes(req.method()) || (req.method() === 'POST' && reads.has(new URL(req.url()).pathname.split('/rpc/')[1]))) return route.continue(); report.blockedWriteAttempts++; return route.abort(); }); return context; }
async function newPage(context) { page = await context.newPage(); page.setDefaultTimeout(10000); page.setDefaultNavigationTimeout(60000); page.on('pageerror', error => report.pageErrors.push(error.message)); }
async function inside(locator, viewport, name) { const b = await locator.boundingBox(); assert(b && b.x >= 0 && b.y >= 0 && b.x + b.width <= viewport.width + 1 && b.y + b.height <= viewport.height + 1, name + ' is clipped'); return b; }
function overlaps(a, b) { return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y; }
const viewports = [['desktop', { width: 1440, height: 900 }], ['portrait', { width: 390, height: 844 }], ['landscape', { width: 740, height: 390 }], ['tablet', { width: 768, height: 1024 }]];
try {
  const s = await student.auth.signInWithPassword({ email: env.VITE_DEMO_STUDENT_EMAIL, password: env.VITE_DEMO_STUDENT_PASSWORD }); assert(!s.error, 'Student sign-in failed');
  const a = await admin.auth.signInWithPassword({ email: env.VITE_DEMO_ADMIN_EMAIL, password: env.VITE_DEMO_ADMIN_PASSWORD }); assert(!a.error, 'Admin sign-in failed');
  const campuses = await student.rpc('list_event_safe_published_campuses'); assert(!campuses.error, 'Published campus read failed');
  const campus = campuses.data.map(row => row.snapshot?.campus).find(c => c?.buildings?.some(b => b.name === 'STUDENT CENTER BUILDING' && b.floors?.length > 1)); assert(campus, 'Published Student Center with multiple floors is unavailable');
  const building = campus.buildings.find(b => b.name === 'STUDENT CENTER BUILDING'); const floors = [...building.floors].sort((x, y) => x.number - y.number);
  const studentContext = await contextFor(s.data.session); await newPage(studentContext);
  for (const [name, viewport] of viewports) {
    await check('Student normal indoor/outdoor navigation, filters and non-overlap: ' + name, async () => {
      await page.setViewportSize(viewport); await page.goto('http://127.0.0.1:5173/map');
      const search = page.getByRole('searchbox', { name: 'Search campus map', exact: true }); await search.waitFor({ timeout: 60000 }); await search.fill(building.name);
      await page.getByRole('option', { name: new RegExp(building.name + ', Building') }).click(); await page.getByRole('button', { name: 'Enter Building', exact: true }).filter({ visible: true }).first().click();
      const event = page.getByRole('button', { name: 'Open event map', exact: true }); await event.waitFor(); const e = await inside(event, viewport, 'Indoor Event map button'); const f = await inside(page.getByTestId('student-floor-picker'), viewport, 'Floor picker'); assert(!overlaps(e, f), 'Indoor event and floor buttons overlap');
      assert(await page.getByTestId('event-preview-layer').count() === 0, 'Normal entry automatically shows event assets'); await page.screenshot({ path: `${out}/student-indoor-${name}.png` });
      await event.click(); const panel = page.getByRole('region', { name: 'Campus events', exact: true }); await panel.waitFor(); await panel.getByText('Loading published events…', { exact: true }).waitFor({ state: 'hidden' });
      await panel.getByRole('button', { name: 'Upcoming', exact: true }).click(); assert(await panel.getByRole('button', { name: 'Upcoming', exact: true }).getAttribute('aria-pressed') === 'true', 'Upcoming selection failed');
      const p = await inside(panel, viewport, 'Event panel'); const picker = await inside(page.getByTestId('student-floor-picker'), viewport, 'Event-mode floor picker'); const back = await inside(page.getByRole('button', { name: 'Back to campus map', exact: true }), viewport, 'Campus return button'); assert(!overlaps(p, picker) && !overlaps(p, back) && !overlaps(picker, back), 'Event panel and indoor navigation overlap');
      if (viewport.width < 768) {
        const profile = await inside(page.getByTestId('student-map-profile-trigger'), viewport, 'Profile action');
        for (const label of ['Open directions', 'Scan location QR', 'Recenter map']) { const button = page.getByRole('button', { name: label, exact: true }); if (!await button.count()) continue; const utility = await inside(button, viewport, label); assert(!overlaps(utility, profile) && !overlaps(utility, p), label + ' overlaps the profile or event panel'); }
      }
      await page.getByTestId('student-floor-picker').getByRole('button').click(); await inside(page.getByTestId('student-floor-picker-menu'), viewport, 'Floor menu'); await page.getByTestId('student-floor-picker-menu').getByRole('option').filter({ hasText: floors[1].label }).click();
      assert(await panel.getByRole('button', { name: 'Upcoming', exact: true }).getAttribute('aria-pressed') === 'true', 'Changing floors lost the filter'); await page.screenshot({ path: `${out}/student-filter-floor-${name}.png` });
      await page.getByRole('button', { name: 'Back to campus map', exact: true }).click(); assert(await panel.getByRole('button', { name: 'Upcoming', exact: true }).getAttribute('aria-pressed') === 'true', 'Campus return lost the filter');
      await panel.getByRole('button', { name: 'Close campus events', exact: true }).click(); await event.waitFor(); assert(await page.getByTestId('event-preview-layer').count() === 0, 'Event assets remain after closing');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal page overflow'); await page.screenshot({ path: `${out}/student-campus-${name}.png` });
    });
  }
  await studentContext.close();
  const rows = await admin.from('map_elements').select('id,campus_id,metadata,updated_at,name').eq('element_type', 'event_overlay'); assert(!rows.error, 'Event read failed'); const sample = rows.data.find(row => row.metadata?.title === 'TEST: College Week 2026 (sample)'); assert(sample, 'Existing sample unavailable');
  const location = sample.metadata.locations[0]; const longComment = ('Long feedback without truncation. ').repeat(10) + 'x'.repeat(90);
  const feedback = '@event-feedback/v1:' + JSON.stringify({ text: '', pins: [{ id: randomUUID(), x: 100, y: 100, comment: 'Move the booth away from the entrance.' }, { id: randomUUID(), x: 150, y: 150, comment: longComment }] });
  const fake = { ...sample, id: randomUUID(), metadata: { ...sample.metadata, title: 'QA controlled feedback rows', status: 'pending', locationFeedback: { [location.id]: feedback } } };
  const adminContext = await contextFor(a.data.session); await adminContext.route('**/rest/v1/map_elements?*', route => route.request().method() === 'GET' ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([fake]) }) : route.abort()); await newPage(adminContext);
  for (const [name, viewport] of viewports) {
    await check('Admin compact feedback row, full comment and keyboard removal: ' + name, async () => {
      await page.setViewportSize(viewport); await page.goto('http://127.0.0.1:5173/admin-dashboard/event-layouts'); await page.getByRole('button', { name: 'Review submission', exact: true }).waitFor({ timeout: 60000 }); await page.getByRole('button', { name: 'Review submission', exact: true }).click();
      const list = page.getByRole('list', { name: 'Feedback pins for ' + location.locationRef.label, exact: true }); await list.scrollIntoViewIfNeeded();
      assert((await list.innerText()).includes(longComment), 'Long feedback was truncated'); assert(await list.evaluate(el => el.scrollWidth <= el.clientWidth), 'Feedback rows overflow horizontally');
      const remove = list.getByRole('button', { name: 'Remove feedback pin 1 from ' + location.locationRef.label, exact: true }); await remove.scrollIntoViewIfNeeded(); const button = await inside(remove, viewport, 'Remove action'); assert(button.height >= 44 && button.width < 110, 'Remove action is too large or not touch-friendly'); assert(await remove.evaluate(el => parseFloat(getComputedStyle(el).fontSize)) <= 14, 'Remove text is oversized');
      await page.screenshot({ path: `${out}/admin-feedback-${name}.png` }); await remove.focus(); await page.keyboard.press('Enter'); assert(await list.getByRole('listitem').count() === 1, 'Keyboard removal deleted the wrong number of pins');
      const dialog = page.getByRole('dialog', { name: 'Review Event Layout', exact: true }); await dialog.getByRole('button', { name: 'Cancel', exact: true }).click(); await page.getByRole('button', { name: 'Discard review', exact: true }).click();
    });
  }
  const after = await admin.from('map_elements').select('metadata,updated_at').eq('id', sample.id).single(); assert(!after.error && after.data.updated_at === sample.updated_at && JSON.stringify(after.data.metadata) === JSON.stringify(sample.metadata), 'Existing sample changed'); report.existingSampleUnchanged = true; assert(report.blockedWriteAttempts === 0, 'Unexpected actual event write attempted');
} catch (error) { report.failure = error.message; process.exitCode = 1; }
finally { await browser.close(); await admin.auth.signOut({ scope: 'local' }); await student.auth.signOut({ scope: 'local' }); fs.writeFileSync(`${out}/event-access-ui.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report)); if (report.checks.some(check => check.status === 'FAIL')) process.exitCode = 1; }

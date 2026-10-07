// Actual UI interactions; a pending proposal exists only in the intercepted GET response.
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')]; }));
const { chromium } = createRequire(import.meta.url)('C:/Users/Rj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out = 'docs/verification/create-event-2026-10-06-ui/evidence/pin-cursor'; fs.mkdirSync(out, { recursive: true });
const report = { checks: [], pageErrors: [], blockedWriteAttempts: 0, retainedFixtures: 0 };
const admin = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
let page;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
async function check(name, action) { try { await action(); report.checks.push({ name, status: 'PASS' }); } catch (e) { report.checks.push({ name, status: 'FAIL', error: e.message }); await page.screenshot({ path: `${out}/failure-${report.checks.length}.png` }).catch(() => {}); } console.log(report.checks.at(-1)); }
const canvas = () => page.getByLabel('Event layout canvas', { exact: true });
const ghost = () => page.getByTestId('feedback-pin-cursor-preview');
const preview = () => page.getByRole('dialog', { name: 'Requested map preview', exact: true });
async function center() { const b = await canvas().boundingBox(); const point = { x: b.x + b.width * .5, y: b.y + b.height * .5 }; if (await page.evaluate(p => Boolean(document.elementFromPoint(p.x, p.y)?.closest('[data-event-editor-chrome]')), point)) point.y = b.y + b.height * .8; return point; }
async function open(viewport) {
  await page.setViewportSize(viewport); await page.goto('http://127.0.0.1:5173/admin-dashboard/event-layouts');
  await page.getByRole('button', { name: 'Review submission', exact: true }).waitFor({ timeout: 60000 });
  await page.getByRole('button', { name: 'Review submission', exact: true }).click();
  await page.getByRole('button', { name: 'Preview requested maps', exact: true }).click(); await canvas().waitFor();
  await preview().getByRole('button', { name: 'Add pin', exact: true }).click();
}
async function hoverAt(point) {
  await page.mouse.move(point.x, point.y); await ghost().waitFor();
  const b = await canvas().boundingBox();
  const position = await ghost().evaluate(el => ({ x: parseFloat(el.style.left), y: parseFloat(el.style.top), pointerEvents: getComputedStyle(el).pointerEvents }));
  assert(Math.abs(position.x - (point.x - b.x)) < 1 && Math.abs(position.y - (point.y - b.y)) < 1, 'Preview is detached from the pointer');
  assert(position.pointerEvents === 'none', 'Cursor preview intercepts map input');
}
async function noGhost() { await ghost().waitFor({ state: 'hidden' }); }
try {
  const login = await admin.auth.signInWithPassword({ email: env.VITE_DEMO_ADMIN_EMAIL, password: env.VITE_DEMO_ADMIN_PASSWORD }); assert(!login.error, 'Existing admin sign-in failed');
  const records = await admin.from('map_elements').select('id,campus_id,metadata,updated_at,name').eq('element_type', 'event_overlay'); assert(!records.error, 'Event read failed');
  const sample = records.data.find(row => row.metadata?.title === 'TEST: College Week 2026 (sample)'); assert(sample, 'Existing sample unavailable');
  const fake = { ...sample, id: randomUUID(), metadata: { ...sample.metadata, title: 'QA controlled cursor pin', status: 'pending', isActive: false, locationFeedback: {} } };
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true });
  await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: `sb-${new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]}-auth-token`, session: login.data.session });
  const readOnlyRpcs = new Set(['list_event_safe_published_campuses', 'list_coming_soon_campuses']);
  await context.route('**/rest/v1/**', route => { const request = route.request(); const rpc = new URL(request.url()).pathname.split('/rpc/')[1]; if (['GET', 'HEAD'].includes(request.method()) || (request.method() === 'POST' && readOnlyRpcs.has(rpc))) return route.continue(); report.blockedWriteAttempts++; return route.abort(); });
  await context.route('**/rest/v1/map_elements?*', route => route.request().method() === 'GET' ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([fake]) }) : route.abort());
  page = await context.newPage(); page.setDefaultTimeout(10000); page.setDefaultNavigationTimeout(60000); page.on('pageerror', error => report.pageErrors.push(error.message));
  await check('Desktop Grounds cursor follows movement, hides over controls/outside map and cancels', async () => {
    await open({ width: 1440, height: 900 }); const p = await center(); await hoverAt(p); await hoverAt({ x: p.x + 40, y: p.y + 25 });
    assert(await page.getByRole('textbox', { name: 'Pin comment', exact: true }).count() === 0, 'Hover placed a draft');
    await page.screenshot({ path: `${out}/grounds-cursor.png` });
    await preview().getByRole('button', { name: 'Zoom in', exact: true }).hover(); await noGhost();
    await hoverAt(p); await page.mouse.move(0, 0); await noGhost();
    await hoverAt(p); await preview().getByRole('button', { name: 'Cancel pin placement', exact: true }).click(); await noGhost();
    await page.mouse.move(p.x, p.y); assert(await ghost().count() === 0, 'Preview remains after cancellation');
  });
  await check('Pan and Space hide the cursor; zoomed placement becomes a draft and adds exactly one staged pin', async () => {
    await open({ width: 1440, height: 900 }); const p = await center(); await hoverAt(p);
    await preview().getByRole('button', { name: 'Pan map', exact: true }).click(); await page.mouse.move(p.x, p.y); await noGhost();
    await preview().getByRole('button', { name: 'Pan map', exact: true }).click(); await hoverAt(p);
    await canvas().focus(); await page.keyboard.down('Space'); await noGhost(); await page.keyboard.up('Space'); await hoverAt(p);
    await preview().getByRole('button', { name: 'Zoom in', exact: true }).click(); await hoverAt(p);
    await page.mouse.click(p.x, p.y); await noGhost(); await page.getByLabel('Unsaved feedback pin position', { exact: true }).waitFor();
    await page.getByRole('textbox', { name: 'Pin comment', exact: true }).fill('Controlled cursor placement test'); await page.screenshot({ path: `${out}/grounds-draft.png` });
    await page.getByRole('button', { name: 'Save pin', exact: true }).click(); await preview().getByText('1/30 pins', { exact: true }).waitFor();
    assert(await page.getByRole('button', { name: 'Feedback pin 1: Controlled cursor placement test', exact: true }).count() === 1, 'The draft created a duplicate or missing pin'); await noGhost();
  });
  const floor = sample.metadata.locations.find(location => location.locationRef.type !== 'campus'); assert(floor, 'Sample has no floor location');
  await check('Floor preview uses the same cursor and hides it when switching location', async () => {
    await open({ width: 1440, height: 900 }); await preview().getByRole('button', { name: 'View ' + floor.locationRef.label, exact: true }).click();
    await preview().getByRole('button', { name: 'Add pin', exact: true }).click(); await hoverAt(await center()); await page.screenshot({ path: `${out}/floor-cursor.png` });
    await preview().getByRole('button', { name: 'View Campus Grounds', exact: true }).click(); await noGhost();
  });
  for (const [name, viewport] of [['portrait', { width: 390, height: 844 }], ['landscape', { width: 740, height: 390 }]]) {
    await check('Responsive ' + name + ': pointer preview and touch placement', async () => {
      await open(viewport); const p = await center(); await hoverAt(p); await page.screenshot({ path: `${out}/cursor-${name}.png` });
      await preview().getByRole('button', { name: 'Cancel pin placement', exact: true }).click(); await preview().getByRole('button', { name: 'Add pin', exact: true }).click();
      await page.touchscreen.tap(p.x, p.y); await noGhost(); await page.getByRole('textbox', { name: 'Pin comment', exact: true }).waitFor();
      await page.getByLabel('Unsaved feedback pin position', { exact: true }).waitFor(); await page.screenshot({ path: `${out}/draft-${name}.png` });
      if (name === 'landscape') {
        const mapBox = await canvas().boundingBox(); const pinBox = await page.getByLabel('Unsaved feedback pin position', { exact: true }).boundingBox();
        assert(mapBox.height >= 100, 'Landscape comment form leaves no usable map area');
        assert(pinBox.x >= mapBox.x && pinBox.y >= mapBox.y && pinBox.x + pinBox.width <= mapBox.x + mapBox.width && pinBox.y + pinBox.height <= mapBox.y + mapBox.height, 'Landscape draft pin is clipped outside the map');
      }
      await page.getByRole('button', { name: 'Cancel', exact: true }).last().click(); await page.getByRole('button', { name: 'Discard pin', exact: true }).click(); await noGhost();
      assert(await page.getByRole('textbox', { name: 'Pin comment', exact: true }).count() === 0, 'Canceled touch draft remains');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal viewport overflow');
    });
  }
  const after = await admin.from('map_elements').select('metadata,updated_at').eq('id', sample.id).single(); assert(!after.error && after.data.updated_at === sample.updated_at && JSON.stringify(after.data.metadata) === JSON.stringify(sample.metadata), 'The existing sample changed'); report.existingSampleUnchanged = true;
  assert(report.blockedWriteAttempts === 0, 'Unexpected database write attempted');
} catch (error) { report.failure = error.message; process.exitCode = 1; }
finally { await browser.close(); await admin.auth.signOut({ scope: 'local' }); fs.writeFileSync(`${out}/pin-cursor.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report)); if (report.checks.some(check => check.status === 'FAIL')) process.exitCode = 1; }

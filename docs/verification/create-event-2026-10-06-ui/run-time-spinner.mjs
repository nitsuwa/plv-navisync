// Read-only existing data and unsaved UI selections; review data is intercepted in memory.
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')]; }));
const { chromium } = createRequire(import.meta.url)('C:/Users/Rj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out = 'docs/verification/create-event-2026-10-06-ui/evidence/time-spinner'; fs.mkdirSync(out, { recursive: true });
const report = { checks: [], pageErrors: [], blockedWriteAttempts: 0, retainedFixtures: 0 };
const admin = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
let page;
const assert = (value, message) => { if (!value) throw new Error(message); };
const safe = message => String(message).replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '[identifier]');
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
async function check(name, mode, action) { try { await action(); report.checks.push({ name, mode, status: 'PASS' }); } catch (e) { report.checks.push({ name, mode, status: 'FAIL', error: safe(e.message), dialogs: await page.locator('[role="dialog"]').evaluateAll(nodes => nodes.map(n => ({ label: n.getAttribute('aria-label'), hidden: n.getAttribute('aria-hidden'), parentHidden: n.parentElement?.closest('[aria-hidden="true"]') !== null, display: getComputedStyle(n).display }))) }); await page?.screenshot({ path: `${out}/failure-${report.checks.length}.png`, timeout: 5000 }).catch(() => {}); } console.log(report.checks.at(-1)); }
async function contextFor(session) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: `sb-${new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]}-auth-token`, session });
  await context.route('**/rest/v1/**', route => { if (['GET', 'HEAD'].includes(route.request().method())) return route.continue(); report.blockedWriteAttempts++; return route.abort(); });
  return context;
}
async function newPage(context) { page = await context.newPage(); page.setDefaultTimeout(10000); page.setDefaultNavigationTimeout(60000); page.on('pageerror', e => report.pageErrors.push(safe(e.message))); return page; }
async function boundsInside(locator, viewport, name) { const b = await locator.boundingBox(); assert(b && b.x >= 0 && b.y >= 0 && b.x + b.width <= viewport.width + 1 && b.y + b.height <= viewport.height + 1, name + ' is clipped'); }
async function spinner(label, screenshot, viewport) {
  await page.setViewportSize(viewport);
  const trigger = page.getByRole('button', { name: new RegExp('^' + escapeRegex(label) + ' time:') });
  await trigger.click();
  const picker = page.getByRole('dialog', { name: label + ' time picker', exact: true });
  await picker.waitFor();
  const hour = picker.getByRole('spinbutton', { name: 'Hour', exact: true }); const minute = picker.getByRole('spinbutton', { name: 'Minute', exact: true });
  await hour.fill('12'); await hour.press('Enter'); await minute.fill('59'); await minute.press('Enter');
  await picker.getByRole('button', { name: 'PM', exact: true }).click();
  await picker.getByRole('button', { name: 'Increase hour', exact: true }).click();
  await picker.getByRole('button', { name: 'Increase minute', exact: true }).click();
  assert(await hour.inputValue() === '1' && await minute.inputValue() === '00', 'Spinner did not wrap independently');
  assert(await picker.getByRole('button', { name: 'PM', exact: true }).getAttribute('aria-pressed') === 'true', 'Wrapping changed AM/PM');
  await minute.fill('60'); await minute.press('Tab');
  assert(await picker.getByRole('button', { name: 'Done', exact: true }).isDisabled(), 'Invalid minute can be accepted');
  await minute.fill('7'); await minute.press('ArrowUp'); await hour.fill('10'); await hour.press('ArrowDown');
  assert(await hour.inputValue() === '9' && await minute.inputValue() === '08', 'Typed/keyboard adjustment failed');
  for (const name of ['Increase hour', 'Decrease hour', 'Increase minute', 'Decrease minute', 'AM', 'PM', 'Done']) { const control = picker.getByRole('button', { name, exact: true }); await boundsInside(control, viewport, name); assert((await control.boundingBox()).height >= 44, 'A touch target is too small'); }
  await boundsInside(picker, viewport, 'Time picker');
  await page.screenshot({ path: `${out}/${screenshot}.png` });
  await picker.getByRole('button', { name: 'Done', exact: true }).click();
  assert(await trigger.getAttribute('aria-label') === label + ' time: 9:08 PM', 'Done did not retain the time');
  await trigger.click(); await hour.fill('6'); await minute.fill('10'); await picker.getByRole('button', { name: 'PM', exact: true }).click();
  assert(await hour.inputValue() === '6' && await minute.inputValue() === '10', 'Draft changes were lost between fields');
  await page.keyboard.press('Escape'); await picker.waitFor({ state: 'hidden' });
  await page.waitForFunction(label => document.activeElement?.getAttribute('aria-label')?.startsWith(label + ' time:'), label);
  assert(await trigger.getAttribute('aria-label') === label + ' time: 6:10 PM', 'Valid typed changes were not applied');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal page overflow');
}
try {
  const login = await admin.auth.signInWithPassword({ email: env.VITE_DEMO_ADMIN_EMAIL, password: env.VITE_DEMO_ADMIN_PASSWORD }); assert(!login.error, 'Existing admin sign-in failed');
  const records = await admin.from('map_elements').select('id,campus_id,metadata,updated_at,name').eq('element_type', 'event_overlay'); assert(!records.error, 'Event inspection failed');
  const sample = records.data.find(r => r.metadata?.title === 'TEST: College Week 2026 (sample)' && r.metadata.status === 'approved'); assert(sample, 'Existing approved sample unavailable');
  const actualContext = await contextFor(login.data.session); await newPage(actualContext);
  await page.goto('http://127.0.0.1:5173/admin-dashboard/event-layouts');
  const card = page.getByRole('heading', { name: sample.metadata.title, exact: true }).locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]'); await card.waitFor({ timeout: 60000 });
  for (const [name, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 660 }], ['landscape', { width: 740, height: 390 }]]) {
    await check('Publication spinner: ' + name + ' typing/arrows/validation/Done/Escape', 'ACTUAL EXISTING UI / UNSAVED', async () => { await page.reload(); await page.setViewportSize(viewport); await card.getByRole('button', { name: 'Manage publication', exact: true }).click(); await spinner('Schedule student publication', 'publication-' + name, viewport); await page.getByRole('dialog', { name: 'Manage event publication', exact: true }).waitFor(); await page.getByRole('button', { name: 'Cancel', exact: true }).click(); });
  }
  await actualContext.close();
  const controlledContext = await contextFor(login.data.session);
  const fake = { ...sample, id: randomUUID(), metadata: { ...sample.metadata, title: 'QA controlled time controls', status: 'pending', isActive: false } };
  await controlledContext.route('**/rest/v1/map_elements?*', route => route.request().method() === 'GET' ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([fake]) }) : route.abort());
  await newPage(controlledContext); await page.goto('http://127.0.0.1:5173/admin-dashboard/event-layouts'); await page.getByRole('button', { name: 'Review submission', exact: true }).waitFor({ timeout: 60000 });
  for (const [name, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 660 }], ['landscape', { width: 740, height: 390 }]]) {
    await check('Review start/end/publication controls: ' + name, 'ACTUAL UI / CONTROLLED READ RESPONSE / UNSAVED', async () => {
      await page.reload(); await page.setViewportSize(viewport); await page.getByRole('button', { name: 'Review submission', exact: true }).click();
      await page.getByRole('button', { name: /Choose event starts date|Event starts date:/i }).click(); await page.getByRole('button', { name: 'Today', exact: true }).click();
      await spinner('Event starts', 'review-start-' + name, viewport);
      await page.getByRole('button', { name: /Choose event ends date|Event ends date:/i }).click(); await page.getByRole('button', { name: 'Today', exact: true }).click();
      await spinner('Event ends', 'review-end-' + name, viewport);
      await page.getByRole('button', { name: 'Schedule publication', exact: true }).click(); await page.getByRole('button', { name: /Choose publish on date|Publish on date:/i }).click(); await page.getByRole('button', { name: 'Today', exact: true }).click();
      await spinner('Publish on', 'review-publication-' + name, viewport);
      await page.getByRole('dialog', { name: 'Review Event Layout', exact: true }).waitFor(); await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      if (await page.getByRole('button', { name: 'Discard review', exact: true }).count()) await page.getByRole('button', { name: 'Discard review', exact: true }).click();
    });
  }
  await controlledContext.close();
  const eventsContext = await contextFor(login.data.session); await newPage(eventsContext); await page.goto('http://127.0.0.1:5173/admin-dashboard/events');
  await page.getByRole('button', { name: 'New Event', exact: true }).first().waitFor({ timeout: 60000 });
  for (const [name, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 660 }], ['landscape', { width: 740, height: 390 }]]) {
    await check('Admin create form controls: ' + name, 'ACTUAL UI / UNSAVED EMPTY FORM', async () => { await page.reload(); await page.setViewportSize(viewport); await page.getByRole('button', { name: 'New Event', exact: true }).first().click(); await spinner('Start date and time *', 'create-start-' + name, viewport); await spinner('End date and time (optional)', 'create-end-' + name, viewport); await page.getByRole('heading', { name: 'Create Event', exact: true }).waitFor(); await page.getByRole('button', { name: 'Close modal', exact: true }).click(); });
  }
  await eventsContext.close();
  const after = await admin.from('map_elements').select('metadata,updated_at').eq('id', sample.id).single(); assert(!after.error && after.data.updated_at === sample.updated_at && JSON.stringify(after.data.metadata) === JSON.stringify(sample.metadata), 'Existing sample changed'); report.existingSampleUnchanged = true;
  assert(report.blockedWriteAttempts === 0, 'Unexpected event write attempted');
} catch (e) { report.failure = safe(e.message); process.exitCode = 1; }
finally { await browser.close(); await admin.auth.signOut({ scope: 'local' }); fs.writeFileSync(`${out}/time-spinner.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report)); if (report.checks.some(c => c.status === 'FAIL')) process.exitCode = 1; }

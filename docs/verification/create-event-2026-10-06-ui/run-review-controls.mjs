// Existing review data is read-only: local schedule selections are discarded, never approved.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')]; }));
const { chromium } = createRequire(import.meta.url)('C:/Users/Rj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const phase = process.argv.includes('--baseline') ? 'baseline' : 'fixed';
const output = `docs/verification/create-event-2026-10-06-ui/evidence/${phase}`;
fs.mkdirSync(output, { recursive: true });
const report = { phase, mode: 'read-only existing events; unsaved review controls only', checks: [], pageErrors: [] };
const admin = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const org = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
let page;
function assert(condition, message) { if (!condition) throw new Error(message); }
async function check(name, action) { try { await action(); report.checks.push({ name, status: 'PASS' }); } catch (e) { report.checks.push({ name, status: 'FAIL', error: e.message }); } console.log(report.checks.at(-1)); }
try {
  const login = await admin.auth.signInWithPassword({ email: env.VITE_DEMO_ADMIN_EMAIL, password: env.VITE_DEMO_ADMIN_PASSWORD });
  assert(!login.error, 'Existing admin authentication failed');
  const owner = await org.auth.signInWithPassword({ email: env.VITE_DEMO_ORG_STUDENT_EMAIL, password: env.VITE_DEMO_ORG_STUDENT_PASSWORD });
  assert(!owner.error, 'Existing Org authentication failed');
  const rows = await admin.from('map_elements').select('id,metadata').or('element_type.eq.event_overlay,metadata->>kind.eq.event_overlay');
  assert(!rows.error, 'Read-only event inspection failed');
  const relevant = rows.data.filter(r => ['TEST', 'TEST: College Week 2026 (sample)'].includes(r.metadata?.title));
  report.existingTestRecords = relevant.map(r => ({ title: r.metadata.title, status: r.metadata.status, organizer: r.metadata.organizer, ownedByExistingOrg: r.metadata.createdByUserId === owner.data.user.id, hasOwner: Boolean(r.metadata.createdByUserId), hasSubmissionTime: Boolean(r.metadata.submittedAt), locations: r.metadata.locations?.length ?? 0 }));
  report.testTitlesAreDistinctRecords = relevant.length > 1 ? new Set(relevant.map(r => r.id)).size === relevant.length : null;
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: `sb-${new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]}-auth-token`, session: login.data.session });
  page = await context.newPage();
  page.on('pageerror', e => report.pageErrors.push(e.message));
  await page.goto('http://127.0.0.1:5173/admin-dashboard/event-layouts');
  await page.getByRole('button', { name: 'Review submission', exact: true }).first().waitFor({ timeout: 60000 });
  await page.screenshot({ path: `${output}/admin-queue.png`, fullPage: false });
  const sample = page.getByRole('heading', { name: 'TEST: College Week 2026 (sample)', exact: true });
  if (await sample.count()) await sample.locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]').getByRole('button', { name: 'Review submission', exact: true }).click();
  else await page.getByRole('button', { name: 'Review submission', exact: true }).first().click();
  await check('Admin can select an event start date inside the review dialog', async () => {
    await page.getByRole('button', { name: /Choose event starts date|Event starts date:/i }).click();
    await page.screenshot({ path: `${output}/calendar.png`, fullPage: false });
    await page.getByRole('button', { name: 'Today', exact: true }).click({ timeout: 5000 });
    assert(await page.getByRole('button', { name: /^Event starts date:/ }).count() === 1, 'Selected date was not applied');
  });
  if (await page.getByRole('button', { name: 'Today', exact: true }).count()) await page.keyboard.press('Escape');
  await check('Calendar day clicks and scheduled-publication date/time selections work', async () => {
    const tomorrow = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', month: 'long', day: 'numeric', year: 'numeric' }).format(Date.now() + 86400000);
    await page.getByRole('button', { name: /Choose event ends date|Event ends date:/i }).click();
    await page.getByRole('button', { name: tomorrow, exact: true }).click();
    assert(await page.getByRole('button', { name: `Event ends date: ${tomorrow}`, exact: true }).count() === 1, 'Calendar day was not selected');
    await page.getByRole('button', { name: 'Schedule publication', exact: true }).click();
    await page.getByRole('button', { name: /Choose publish on date|Publish on date:/i }).click();
    await page.getByRole('button', { name: tomorrow, exact: true }).click();
    await page.getByRole('button', { name: /^Publish on time:/ }).click();
    await page.getByRole('spinbutton', { name: 'Hour', exact: true }).fill('12');
    await page.getByRole('spinbutton', { name: 'Minute', exact: true }).fill('59');
    await page.getByRole('button', { name: 'AM', exact: true }).click();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    assert(await page.getByRole('button', { name: 'Publish on time: 12:59 AM', exact: true }).count() === 1, 'Publication time was not selected');
  });
  await check('Admin can select hour, minute 59, and PM in the nested time picker', async () => {
    await page.getByRole('button', { name: /^Event starts time:/ }).click();
    await page.getByRole('spinbutton', { name: 'Hour', exact: true }).fill('12');
    await page.getByRole('spinbutton', { name: 'Minute', exact: true }).fill('59');
    await page.getByRole('button', { name: 'PM', exact: true }).click();
    await page.screenshot({ path: `${output}/time-desktop.png`, fullPage: false });
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    assert(await page.getByRole('button', { name: 'Event starts time: 12:59 PM', exact: true }).count() === 1, 'Time selection not retained');
  });
  if (await page.getByRole('button', { name: 'Done', exact: true }).count()) await page.keyboard.press('Escape');
  await check('Mobile time picker stays inside the viewport and exposes minute 59 and Done', async () => {
    await page.setViewportSize({ width: 390, height: 660 });
    await page.getByRole('button', { name: /^Event starts time:/ }).click();
    await page.getByRole('spinbutton', { name: 'Minute', exact: true }).fill('59');
    await page.getByRole('spinbutton', { name: 'Hour', exact: true }).fill('11');
    await page.getByRole('button', { name: 'PM', exact: true }).click();
    const done = await page.getByRole('button', { name: 'Done', exact: true }).boundingBox();
    assert(done && done.y >= 0 && done.y + done.height <= 660, 'Done is clipped outside the mobile viewport');
    await page.screenshot({ path: `${output}/time-mobile.png`, fullPage: false });
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    assert(await page.getByRole('button', { name: 'Event starts time: 11:59 PM', exact: true }).count() === 1, 'Mobile time not retained');
  });
  if (await page.getByRole('button', { name: 'Done', exact: true }).count()) await page.keyboard.press('Escape');
  await check('Short landscape picker keeps Done visible and restores focus with Escape', async () => {
    await page.setViewportSize({ width: 740, height: 480 });
    await page.getByRole('button', { name: /^Event starts time:/ }).click();
    await page.getByRole('spinbutton', { name: 'Minute', exact: true }).fill('00');
    await page.getByRole('spinbutton', { name: 'Hour', exact: true }).fill('12');
    await page.getByRole('button', { name: 'AM', exact: true }).click();
    const done = await page.getByRole('button', { name: 'Done', exact: true }).boundingBox();
    assert(done && done.y >= 0 && done.y + done.height <= 480, 'Done is clipped in short landscape');
    await page.screenshot({ path: `${output}/time-landscape.png`, fullPage: false });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label')?.startsWith('Event starts time:'));
    assert(await page.getByRole('dialog', { name: 'Review Event Layout', exact: true }).count() === 1, 'Escape closed the outer review dialog');
  });
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  if (await page.getByRole('button', { name: 'Discard review', exact: true }).count()) await page.getByRole('button', { name: 'Discard review', exact: true }).click();
} catch (e) { report.failure = e.message; process.exitCode = 1; }
finally { await browser.close(); await admin.auth.signOut({ scope: 'local' }); await org.auth.signOut({ scope: 'local' }); fs.writeFileSync(`${output}/review-controls.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report)); if (report.checks.some(c => c.status === 'FAIL')) process.exitCode = 1; }

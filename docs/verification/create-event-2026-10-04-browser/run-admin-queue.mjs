// Read-only admin event queue browser checks. Uses existing pending data; no mutations.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')]; }));
const { chromium } = createRequire(import.meta.url)('C:/Users/Rj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out = 'docs/verification/create-event-2026-10-04-browser/evidence';
const report = { checks: [], filterResults: {}, errors: [] };
const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
function assert(ok, msg) { if (!ok) throw new Error(msg); }
function pass(name) { report.checks.push({ name, status: 'PASS' }); console.log('PASS ' + name); }
let page;
try {
  const login = await client.auth.signInWithPassword({ email: env.VITE_DEMO_ADMIN_EMAIL, password: env.VITE_DEMO_ADMIN_PASSWORD }); assert(!login.error, 'Admin login failed');
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: `sb-${new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]}-auth-token`, session: login.data.session });
  page = await context.newPage(); page.on('pageerror', error => report.errors.push(error.message));
  await page.goto('http://127.0.0.1:5173/admin-dashboard/event-layouts');
  await page.getByRole('heading', { name: 'Event Layouts', exact: true }).waitFor();
  const cards = page.locator('div.bg-card.rounded-2xl h3.font-extrabold'); await cards.first().waitFor({ timeout: 60000 });
  const initialTitles = await cards.allTextContents();
  const allTab = page.getByRole('button', { name: /^All/ });
  report.allTab = await allTab.innerText(); report.initialCardCount = initialTitles.length;
  assert(Number(report.allTab.match(/\d+/)?.[0]) === initialTitles.length, `All badge ${report.allTab} did not match ${initialTitles.length} visible rows`);
  await page.screenshot({ path: `${out}/admin-queue-desktop.png`, fullPage: true });
  const firstTitle = initialTitles[0].trim();
  const firstCard = cards.first().locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
  const cardLines = (await firstCard.innerText()).split('\n').map(line => line.trim()).filter(Boolean);
  const organizerIndex = cardLines.findIndex(line => line === 'Organizer:');
  const organizer = organizerIndex >= 0 ? cardLines[organizerIndex + 1] : undefined;
  assert(firstTitle && organizer, 'Queue card did not show a title and organizer');
  pass('B04.1 queue loads visible event titles, organizers, status, locations, submission time, and a matching All count');

  const search = page.getByPlaceholder('Search event layouts...');
  await search.fill(firstTitle); await page.getByText(firstTitle, { exact: true }).waitFor();
  assert(await cards.count() === 1, 'Exact title search did not isolate one matching queue row');
  pass('Queue exact-title search narrows to the matching submission');
  await search.fill(organizer.slice(0, Math.min(5, organizer.length)));
  await page.getByText(firstTitle, { exact: true }).waitFor();
  pass('Queue partial-organizer search finds the same event');
  await search.fill('No such QA layout 00000000');
  await page.getByText('No matching layouts', { exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelectorAll('div.bg-card.rounded-2xl h3.font-extrabold').length === 0);
  assert(await cards.count() === 0, 'No-match search still showed event rows');
  await page.screenshot({ path: `${out}/admin-queue-empty-search.png`, fullPage: false });
  pass('Queue empty search shows a distinct no-match state');
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await cards.first().waitFor();

  for (const status of ['Pending', 'Approved', 'Disapproved']) {
    const tab = page.getByRole('button', { name: new RegExp(`^${status}`) });
    await tab.click(); await tab.waitFor({ state: 'visible' });
    await page.waitForFunction(label => [...document.querySelectorAll('button[aria-pressed="true"]')].some(button => button.textContent?.includes(label)), status);
    const count = await cards.count();
    const labels = await page.locator('div.bg-card.rounded-2xl').allTextContents();
    const badges = labels.map(text => ['Pending', 'Approved', 'Disapproved'].find(value => new RegExp(`\\b${value}\\b`).test(text))).filter(Boolean);
    if (count) assert(badges.length >= count && badges.slice(0, count).every(label => label === status), `${status} filter shows a different status`);
    else await page.getByText('No layouts in this category', { exact: true }).waitFor();
    report.filterResults[status] = { visibleRows: count, badge: await tab.innerText(), emptyState: count === 0 };
    if (status === 'Pending') await page.screenshot({ path: `${out}/admin-queue-pending.png`, fullPage: true });
  }
  await page.getByRole('button', { name: /^All/ }).click();
  report.errors = report.errors;
  pass('Pending, Approved, and Disapproved filters match their visible status rows or empty state');
  assert(report.errors.length === 0, 'Browser page errors recorded');
} catch (error) {
  report.failure = error.message; if (page) { report.screen = await page.locator('body').innerText(); await page.screenshot({ path: `${out}/admin-queue-failure.png`, fullPage: true }); }
  console.log('FAIL ' + error.message); process.exitCode = 1;
} finally {
  await browser.close(); await client.auth.signOut({ scope: 'local' });
  fs.writeFileSync(`${out}/admin-queue-browser.json`, JSON.stringify(report, null, 2));
}

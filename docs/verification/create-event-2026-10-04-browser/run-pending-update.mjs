// Actual owner/admin UI regression for pending map updates; own draft only.
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')]; }));
const { chromium } = createRequire(import.meta.url)('C:/Users/Rj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out = 'docs/verification/create-event-2026-10-04-browser/evidence';
const report = { title: `QA pending update ${randomUUID().slice(0, 8)}`, id: null, cleaned: false, checks: [], errors: [] };
const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
let ownerPage, user, adminClient, adminPage;
function assert(ok, msg) { if (!ok) throw new Error(msg); }
function pass(name) { report.checks.push({ name, status: 'PASS' }); console.log('PASS ' + name); }
async function row() { const result = await client.from('map_elements').select('id,metadata,updated_at').eq('id', report.id).single(); assert(!result.error, result.error?.message); return result.data; }
async function waitLabelCount(expected) { for (let i = 0; i < 30; i++) { const current = await row(); if (current.metadata.locations[0].eventLabels.length === expected) return current; await ownerPage.waitForTimeout(300); } throw new Error('Saved layout did not reach expected label count'); }
async function canvasClick(x, y) { const canvas = ownerPage.getByLabel('Event layout canvas', { exact: true }); const box = await canvas.boundingBox(); await canvas.click({ position: { x: box.width * x, y: box.height * y } }); }
try {
  const login = await client.auth.signInWithPassword({ email: env.VITE_DEMO_ORG_STUDENT_EMAIL, password: env.VITE_DEMO_ORG_STUDENT_PASSWORD }); assert(!login.error, 'Org login failed'); user = login.data.user;
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const storageKey = `sb-${new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
  await ownerContext.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: storageKey, session: login.data.session });
  ownerPage = await ownerContext.newPage(); ownerPage.on('pageerror', e => report.errors.push(e.message));
  await ownerPage.goto('http://127.0.0.1:5173/student/events');
  await ownerPage.getByRole('button', { name: 'Create event', exact: true }).waitFor({ timeout: 60000 });
  await ownerPage.getByRole('button', { name: 'Create event', exact: true }).click();
  await ownerPage.getByLabel('Event title *', { exact: true }).fill(report.title);
  await ownerPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await ownerPage.getByRole('checkbox', { name: /Campus Grounds/ }).check();
  await ownerPage.getByRole('button', { name: 'Create & design maps', exact: true }).click();
  await ownerPage.getByRole('button', { name: 'Confirm & design', exact: true }).click();
  await ownerPage.waitForURL('**/student/events/*/edit', { timeout: 60000 }); report.id = ownerPage.url().split('/').at(-2);
  const initial = await row(); assert(initial.metadata.createdByUserId === user.id && initial.metadata.status === 'draft', 'Created proposal is not an owned draft');
  await ownerPage.getByRole('button', { name: 'Skip tour', exact: true }).click();
  await ownerPage.getByRole('button', { name: /Furniture$/ }).click(); await ownerPage.getByRole('button', { name: 'Chair', exact: true }).click(); await canvasClick(.04, .75);
  await ownerPage.getByRole('button', { name: 'Save Draft', exact: true }).click();
  for (let i = 0; i < 30; i++) { if ((await row()).metadata.locations[0].eventFurniture.length === 1) break; await ownerPage.waitForTimeout(300); }
  await ownerPage.getByRole('button', { name: 'Review & submit', exact: true }).click();
  await ownerPage.getByRole('button', { name: 'Confirm submission', exact: true }).click();
  await ownerPage.waitForURL('**/student/events', { timeout: 60000 });
  const submitted = await row(); assert(submitted.metadata.status === 'pending' && submitted.metadata.locations[0].eventFurniture.length === 1, 'Initial submission did not persist as Pending');
  const originalSubmittedAt = submitted.metadata.submittedAt; assert(originalSubmittedAt, 'Submitted timestamp is missing');
  pass('Actual UI creates and submits an owned Pending proposal');

  const ownerCard = ownerPage.locator('article').filter({ has: ownerPage.getByText(report.title, { exact: true }) });
  await ownerCard.getByRole('link', { name: 'Edit maps', exact: true }).click();
  await ownerPage.waitForURL('**/student/events/*/edit', { timeout: 60000 });
  await ownerPage.getByRole('button', { name: 'Label', exact: true }).click(); await canvasClick(.55, .8);
  await ownerPage.getByRole('button', { name: 'Save Draft', exact: true }).click(); await waitLabelCount(1);
  await ownerPage.getByRole('button', { name: 'Review & update GSO', exact: true }).click();
  const updateDialog = ownerPage.getByRole('dialog', { name: 'Review submission updates', exact: true }); await updateDialog.waitFor();
  assert((await updateDialog.innerText()).includes('without withdrawing your pending proposal'), 'Update review copy does not explain Pending is retained');
  assert(await updateDialog.getByRole('button', { name: 'Confirm update', exact: true }).isEnabled(), 'Confirm update is disabled after a valid map edit');
  await ownerPage.screenshot({ path: `${out}/pending-update-review.png`, fullPage: false });
  await updateDialog.getByRole('button', { name: 'Confirm update', exact: true }).click();
  await ownerPage.waitForURL('**/student/events', { timeout: 60000 });
  const updated = await row();
  assert(updated.metadata.status === 'pending', 'Update withdrew or changed Pending status');
  assert(updated.metadata.submittedAt === originalSubmittedAt, 'Pending update changed original submittedAt');
  assert(updated.metadata.locations[0].eventFurniture.length === 1 && updated.metadata.locations[0].eventLabels.length === 1, 'Updated layout was not persisted');
  pass('Owner UI review/update confirms; Pending and original submission time remain, latest map is saved');

  adminClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const adminLogin = await adminClient.auth.signInWithPassword({ email: env.VITE_DEMO_ADMIN_EMAIL, password: env.VITE_DEMO_ADMIN_PASSWORD }); assert(!adminLogin.error, 'Admin login failed');
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await adminContext.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: storageKey, session: adminLogin.data.session });
  adminPage = await adminContext.newPage(); adminPage.on('pageerror', e => report.errors.push(e.message));
  await adminPage.goto('http://127.0.0.1:5173/admin-dashboard/event-layouts');
  const adminCard = adminPage.getByText(report.title, { exact: true }).locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
  await adminCard.getByRole('button', { name: 'Review submission', exact: true }).click();
  await adminPage.getByRole('button', { name: 'Preview requested maps', exact: true }).click();
  await adminPage.getByRole('button', { name: 'Pan map', exact: true }).waitFor();
  const body = await adminPage.locator('body').innerText();
  assert(body.includes('1 furniture') && body.includes('1 labels') && body.includes('Event Label'), 'Admin preview does not show the updated map contents');
  await adminPage.screenshot({ path: `${out}/pending-update-admin-preview.png`, fullPage: false });
  pass('Admin UI previews the same updated furniture and label while event remains Pending');
  await adminPage.getByRole('button', { name: 'Close map preview', exact: true }).click();
  await adminPage.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert((await row()).metadata.status === 'pending', 'Canceling admin review changed event state');
} catch (error) {
  report.failure = error.message;
  if (ownerPage) { report.ownerScreen = await ownerPage.locator('body').innerText(); await ownerPage.screenshot({ path: `${out}/pending-update-failure.png`, fullPage: true }); }
  if (adminPage) { report.adminScreen = await adminPage.locator('body').innerText(); await adminPage.screenshot({ path: `${out}/pending-update-admin-failure.png`, fullPage: true }); }
  console.log('FAIL ' + error.message); process.exitCode = 1;
} finally {
  if (!report.id && user) { const found = await client.from('map_elements').select('id').eq('name', report.title).eq('metadata->>createdByUserId', user.id); if (found.data?.length === 1) report.id = found.data[0].id; }
  if (report.id && user) { try { let current = await row(); if (current.metadata.title === report.title && current.metadata.createdByUserId === user.id) { if (current.metadata.status === 'pending') { const result = await client.rpc('withdraw_event_submission', { p_overlay_id: report.id, p_expected_updated_at: current.updated_at }); assert(!result.error, result.error?.message); current = await row(); } if (['draft', 'disapproved'].includes(current.metadata.status)) { const result = await client.from('map_elements').delete().eq('id', report.id).select('id'); report.cleaned = !result.error && result.data?.some(x => x.id === report.id); } } } catch (error) { report.cleanupError = error.message; } }
  await browser.close(); await client.auth.signOut({ scope: 'local' }); if (adminClient) await adminClient.auth.signOut({ scope: 'local' });
  fs.writeFileSync(`${out}/pending-update-browser.json`, JSON.stringify(report, null, 2)); console.log('Fixture cleaned=' + report.cleaned);
}

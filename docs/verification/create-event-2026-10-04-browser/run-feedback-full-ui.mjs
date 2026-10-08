// Full Student Org create -> admin feedback -> owner fixes/resubmits; real UI only.
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')]; }));
const { chromium } = createRequire(import.meta.url)('C:/Users/Rj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out = 'docs/verification/create-event-2026-10-04-browser/evidence';
const report = { title: `QA browser full feedback ${randomUUID().slice(0, 8)}`, id: null, createdByUI: false, cleaned: false, cleanedByUI: false, checks: [], errors: [] };
const orgClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const adminClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
let owner, admin, ownerPage, adminPage;
function assert(ok, msg) { if (!ok) throw new Error(msg); }
function pass(name) { report.checks.push({ name, status: 'PASS' }); console.log('PASS ' + name); }
async function row() { const result = await orgClient.from('map_elements').select('id,metadata,updated_at').eq('id', report.id).single(); assert(!result.error, result.error?.message); return result.data; }
async function waitFor(test, page, message) { for (let i = 0; i < 50; i++) { const value = await test(); if (value) return value; await page.waitForTimeout(250); } throw new Error(message); }
async function mapClick(page, x, y) { const canvas = page.getByLabel('Event layout canvas', { exact: true }); const box = await canvas.boundingBox(); await canvas.click({ position: { x: box.width * x, y: box.height * y } }); }
async function setDisclosureOpen(disclosure, open) { if (await disclosure.evaluate(node => node.open) !== open) await disclosure.locator('summary').click(); }
async function login(client, email, password) { const result = await client.auth.signInWithPassword({ email, password }); assert(!result.error, 'Configured account login failed'); return result.data; }
function authKey() { return `sb-${new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]}-auth-token`; }
async function pageFor(identity, route, viewport = { width: 1440, height: 900 }) { const context = await browser.newContext({ viewport }); await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: authKey(), session: identity.session }); const page = await context.newPage(); page.on('pageerror', error => report.errors.push(error.message)); await page.goto('http://127.0.0.1:5173' + route); return page; }
try {
  owner = await login(orgClient, env.VITE_DEMO_ORG_STUDENT_EMAIL, env.VITE_DEMO_ORG_STUDENT_PASSWORD);
  admin = await login(adminClient, env.VITE_DEMO_ADMIN_EMAIL, env.VITE_DEMO_ADMIN_PASSWORD);
  ownerPage = await pageFor(owner, '/student/events');
  await ownerPage.getByRole('button', { name: 'Create event', exact: true }).waitFor({ timeout: 60000 });
  await ownerPage.getByRole('button', { name: 'Create event', exact: true }).click();
  await ownerPage.getByLabel('Event title *', { exact: true }).fill(report.title);
  await ownerPage.getByRole('button', { name: 'Continue', exact: true }).click();
  await ownerPage.getByRole('checkbox', { name: /Campus Grounds/ }).check();
  await ownerPage.getByRole('button', { name: 'Create & design maps', exact: true }).click();
  await ownerPage.getByRole('button', { name: 'Confirm & design', exact: true }).click();
  await ownerPage.waitForURL('**/student/events/*/edit', { timeout: 60000 }); report.id = ownerPage.url().split('/').at(-2);
  let current = await row(); assert(current.metadata.title === report.title && current.metadata.createdByUserId === owner.user.id && current.metadata.status === 'draft', 'Actual UI did not create an owned draft');
  report.createdByUI = true; report.locationId = current.metadata.locations[0].id;
  await ownerPage.getByRole('button', { name: 'Skip tour', exact: true }).click();
  await ownerPage.getByRole('button', { name: /Furniture$/ }).click(); await ownerPage.getByRole('button', { name: 'Chair', exact: true }).click(); await mapClick(ownerPage, .04, .75);
  await ownerPage.getByRole('button', { name: 'Save Draft', exact: true }).click();
  current = await waitFor(async () => { const value = await row(); return value.metadata.locations[0].eventFurniture.length === 1 ? value : null; }, ownerPage, 'Initial chair did not save');
  await ownerPage.getByRole('button', { name: 'Review & submit', exact: true }).click();
  await ownerPage.getByRole('button', { name: 'Confirm submission', exact: true }).click();
  await ownerPage.waitForURL('**/student/events', { timeout: 60000 });
  current = await row(); assert(current.metadata.status === 'pending', 'UI submission did not enter Pending');
  pass('J3 begins with an actual UI-created event, furniture placement, save and submission');

  adminPage = await pageFor(admin, '/admin-dashboard/event-layouts');
  await adminPage.getByText(report.title, { exact: true }).waitFor({ timeout: 60000 });
  const adminCard = adminPage.getByText(report.title, { exact: true }).locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
  await adminCard.getByRole('button', { name: 'Review submission', exact: true }).click();
  await adminPage.getByRole('button', { name: 'Preview requested maps', exact: true }).click();
  const previewCanvas = adminPage.getByLabel('Event layout canvas', { exact: true }); await previewCanvas.waitFor();
  const box = await previewCanvas.boundingBox();
  for (const [index, comment] of ['Add the requested entrance table.', 'Place an extra chair at the south seating area.'].entries()) {
    await adminPage.getByRole('button', { name: 'Add pin', exact: true }).click();
    await previewCanvas.click({ position: { x: box.width * (.42 + index * .28), y: box.height * .68 } });
    await adminPage.getByLabel('Pin comment', { exact: true }).fill(comment);
    await adminPage.getByRole('button', { name: 'Save pin', exact: true }).click();
  }
  current = await row(); assert(!current.metadata.locationFeedback?.[report.locationId], 'Staged admin pins persisted before review decision');
  await adminPage.screenshot({ path: `${out}/feedback-full-admin-pin-draft.png`, fullPage: false });
  await adminPage.getByRole('button', { name: 'Close map preview', exact: true }).click();
  await adminPage.getByLabel(/Admin Comment/).fill('Please make the map changes at both marked locations.');
  await adminPage.getByRole('button', { name: 'Disapprove', exact: true }).click();
  current = await waitFor(async () => { const value = await row(); return value.metadata.status === 'disapproved' ? value : null; }, adminPage, 'Admin UI disapproval did not persist');
  const feedback = current.metadata.locationFeedback?.[report.locationId];
  assert(typeof feedback === 'string' && feedback.includes('@event-feedback/v1:') && feedback.includes('Add the requested entrance table.') && feedback.includes('extra chair'), 'Admin review decision did not save both pins');
  const savedPins = JSON.parse(feedback.slice('@event-feedback/v1:'.length)).pins; assert(savedPins.length === 2, 'Admin decision did not persist exactly two pins');
  report.pinIds = savedPins.map(pin => pin.id);
  pass('Admin UI stages two visible feedback pins; both persist only with Disapprove decision');

  // Owner's list is a separate auth context and does not update from the admin decision.
  await ownerPage.reload();
  await ownerPage.getByText(report.title, { exact: true }).waitFor({ timeout: 60000 });
  const ownerCard = ownerPage.locator('article').filter({ has: ownerPage.getByText(report.title, { exact: true }) });
  await ownerCard.getByRole('link', { name: 'Revise maps', exact: true }).click();
  await ownerPage.waitForURL(`**/student/events/${report.id}/edit`, { timeout: 60000 });
  const tourSkip = ownerPage.getByRole('button', { name: 'Skip tour', exact: true });
  if (await tourSkip.count()) await tourSkip.click();
  const checklist = ownerPage.locator('[data-feedback-checklist]'); await setDisclosureOpen(checklist, true);
  await ownerPage.getByRole('button', { name: 'Show pin 1 on map', exact: true }).click();
  await ownerPage.getByRole('button', { name: /Furniture$/ }).click(); await ownerPage.getByRole('button', { name: 'Table', exact: true }).click(); await mapClick(ownerPage, .56, .5);
  await ownerPage.screenshot({ path: `${out}/feedback-full-table-placement.png`, fullPage: false });
  await ownerPage.getByText('Objects (2)', { exact: true }).waitFor({ timeout: 15000 });
  await ownerPage.getByRole('button', { name: 'Save Draft', exact: true }).click();
  current = await waitFor(async () => { const value = await row(); return value.metadata.locations[0].eventFurniture.some(item => /table/i.test(item.name || item.type)) ? value : null; }, ownerPage, 'Requested entrance table did not persist');
  await ownerPage.getByLabel(`Resolution note for pin 1 in ${report.locationId}`, { exact: true }).fill('Added the requested entrance table to the map.');
  await ownerPage.getByRole('button', { name: 'Mark as addressed', exact: true }).first().click();
  await ownerPage.getByRole('button', { name: 'Reopen issue', exact: true }).waitFor();
  assert(current.metadata.locations[0].eventFurniture.length === 2, 'Table did not remain with original chair');
  assert((await row()).metadata.feedbackResolutions[report.locationId][savedPins[0].id].note === 'Added the requested entrance table to the map.', 'First acknowledgement did not persist');
  pass('Owner locates pin 1, adds the requested Table in the editor, records note and addresses it');

  await ownerPage.getByRole('button', { name: 'Review & submit', exact: true }).click();
  assert(await ownerPage.getByRole('dialog', { name: 'Review before submitting', exact: true }).count() === 0, 'Open pin 2 did not block resubmission');
  assert((await row()).metadata.status === 'draft' && await ownerPage.getByText('Feedback needs attention', { exact: true }).count() > 0, 'Open pin 2 did not keep the edited event in Draft and block resubmission');
  pass('One remaining open pin blocks the owner UI resubmission');

  await ownerPage.setViewportSize({ width: 390, height: 844 });
  await ownerPage.screenshot({ path: `${out}/feedback-full-owner-mobile-open.png`, fullPage: false });
  await ownerPage.getByRole('button', { name: 'Show pin 2 on map', exact: true }).click();
  await setDisclosureOpen(checklist, false);
  await ownerPage.screenshot({ path: `${out}/feedback-full-owner-mobile-map.png`, fullPage: false });
  await ownerPage.getByRole('button', { name: /Furniture$/ }).click();
  await ownerPage.getByRole('button', { name: 'Add event item — Browse assets', exact: true }).click();
  const assetCatalog = ownerPage.getByRole('dialog', { name: 'Choose an event item', exact: true }); await assetCatalog.waitFor();
  await assetCatalog.getByRole('option', { name: /^Chair:/ }).click();
  await mapClick(ownerPage, .72, .5);
  await ownerPage.getByRole('button', { name: 'Save Draft', exact: true }).click();
  current = await waitFor(async () => { const value = await row(); return value.metadata.locations[0].eventFurniture.length === 3 ? value : null; }, ownerPage, 'Requested second chair did not persist');
  await setDisclosureOpen(checklist, true);
  await ownerPage.getByLabel(`Resolution note for pin 2 in ${report.locationId}`, { exact: true }).fill('Added the requested south-area chair.');
  await ownerPage.getByRole('button', { name: 'Mark as addressed', exact: true }).first().click();
  await ownerPage.waitForFunction(() => document.querySelector('[data-feedback-checklist] summary')?.textContent?.includes('2/2'));
  await ownerPage.screenshot({ path: `${out}/feedback-full-owner-mobile-addressed.png`, fullPage: false });
  await ownerPage.reload(); await ownerPage.getByRole('button', { name: 'Review & submit', exact: true }).waitFor({ timeout: 60000 });
  await setDisclosureOpen(checklist, true); assert((await checklist.locator('summary').innerText()).includes('2/2'), 'Reload lost the two addressed states');
  current = await row(); assert(current.metadata.locations[0].eventFurniture.length === 3 && Object.keys(current.metadata.feedbackResolutions[report.locationId]).length === 2, 'Reload lost map fixes or feedback acknowledgements');
  await ownerPage.getByRole('button', { name: 'Review & submit', exact: true }).click();
  const submitDialog = ownerPage.getByRole('dialog', { name: 'Review before submitting', exact: true }); await submitDialog.waitFor();
  assert((await submitDialog.innerText()).includes('2/2 addressed · 0 open'), 'Review summary does not show feedback readiness');
  await ownerPage.screenshot({ path: `${out}/feedback-full-resubmit-mobile.png`, fullPage: false });
  await ownerPage.getByRole('button', { name: 'Confirm submission', exact: true }).click();
  await ownerPage.waitForURL('**/student/events', { timeout: 60000 }); current = await row();
  assert(current.metadata.status === 'pending' && current.metadata.locationFeedback[report.locationId] === feedback, 'Resubmission lost feedback or did not return to Pending');
  pass('Mobile owner fixes both maps, reloads, confirms 2/2, and resubmits the same event');

  const adminAgain = await pageFor(admin, '/admin-dashboard/event-layouts');
  await adminAgain.getByText(report.title, { exact: true }).waitFor({ timeout: 60000 });
  const updatedCard = adminAgain.getByText(report.title, { exact: true }).locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
  await updatedCard.getByRole('button', { name: 'Review submission', exact: true }).click();
  await adminAgain.getByText(/Student note: Added the requested entrance table to the map\./).waitFor();
  await adminAgain.getByText(/Student note: Added the requested south-area chair\./).waitFor();
  await adminAgain.screenshot({ path: `${out}/feedback-full-admin-followup.png`, fullPage: false });
  await adminAgain.getByRole('button', { name: 'Cancel', exact: true }).click();
  pass('Admin UI sees both student fix notes on the resubmitted Pending review');

  await ownerCard.getByRole('button', { name: 'Withdraw submission', exact: true }).click();
  await ownerPage.getByRole('button', { name: 'Withdraw to draft', exact: true }).click();
  current = await waitFor(async () => { const value = await row(); return value.metadata.status === 'draft' ? value : null; }, ownerPage, 'Cleanup withdrawal did not return fixture to Draft');
  const draftCard = ownerPage.locator('article').filter({ has: ownerPage.getByText(report.title, { exact: true }) });
  await draftCard.getByRole('button', { name: 'Delete', exact: true }).click();
  await ownerPage.getByText('Delete event proposal?', { exact: true }).waitFor();
  await ownerPage.getByRole('button', { name: 'Delete event', exact: true }).click();
  await ownerPage.getByText(report.title, { exact: true }).waitFor({ state: 'hidden' });
  const absent = await orgClient.from('map_elements').select('id').eq('id', report.id).maybeSingle(); assert(!absent.error && !absent.data, 'UI deletion left the QA event row');
  report.cleaned = true; report.cleanedByUI = true; pass('Owner UI withdraws and deletes its own QA fixture; audit history remains');
} catch (error) {
  report.failure = error.message;
  if (ownerPage) { report.ownerScreen = await ownerPage.locator('body').innerText(); await ownerPage.screenshot({ path: `${out}/feedback-full-ui-failure.png`, fullPage: false }); }
  if (adminPage) { report.adminScreen = await adminPage.locator('body').innerText(); await adminPage.screenshot({ path: `${out}/feedback-full-ui-admin-failure.png`, fullPage: false }); }
  console.log('FAIL ' + error.message); process.exitCode = 1;
} finally {
  if (!report.cleaned && report.id && owner) { try { let current = await row(); if (current.metadata.createdByUserId === owner.user.id && current.metadata.title === report.title) { if (current.metadata.status === 'pending') { const withdrawn = await orgClient.rpc('withdraw_event_submission', { p_overlay_id: report.id, p_expected_updated_at: current.updated_at }); assert(!withdrawn.error, withdrawn.error?.message); current = await row(); } if (['draft', 'disapproved'].includes(current.metadata.status)) { const deleted = await orgClient.from('map_elements').delete().eq('id', report.id).select('id'); report.cleaned = !deleted.error && deleted.data?.some(item => item.id === report.id); report.cleanupMethod = 'owner-scoped QA cleanup fallback'; } } } catch (error) { report.cleanupError = error.message; } }
  await browser.close(); await orgClient.auth.signOut({ scope: 'local' }); await adminClient.auth.signOut({ scope: 'local' });
  fs.writeFileSync(`${out}/feedback-full-ui-browser.json`, JSON.stringify(report, null, 2)); console.log('Fixture cleaned=' + report.cleaned);
}

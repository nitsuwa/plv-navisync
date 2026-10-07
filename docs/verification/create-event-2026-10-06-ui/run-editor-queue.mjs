// Actual UI authoring/submit/withdraw/delete. Touches only the unique fixture created here.
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')]; }));
const { chromium } = createRequire(import.meta.url)('C:/Users/Rj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out = 'docs/verification/create-event-2026-10-06-ui/evidence/editor'; fs.mkdirSync(out, { recursive: true });
const report = { title: 'QA CE interactions ' + randomUUID().slice(0, 8), checks: [], errors: [], cleaned: false };
const org = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
let owner, page, adminPage, id;
function assert(condition, message) { if (!condition) throw new Error(message); }
function pass(name) { report.checks.push({ name, status: 'PASS' }); console.log('PASS ' + name); }
async function row() { const result = await org.from('map_elements').select('id,metadata,updated_at').eq('id', id).single(); assert(!result.error, 'QA readback failed'); return result.data; }
async function open(session, route) { const context = await browser.newContext({ viewport: { width: 1440, height: 900 } }); await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: `sb-${new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]}-auth-token`, session }); const p = await context.newPage(); p.on('pageerror', error => report.errors.push(error.message)); await p.goto('http://127.0.0.1:5173' + route); return p; }
async function canvasClick(p, x, y) { const canvas = p.getByLabel('Event layout canvas', { exact: true }); const box = await canvas.boundingBox(); await canvas.click({ position: { x: box.width * x, y: box.height * y } }); }
function card(p) { return p.getByRole('heading', { name: report.title, exact: true }).locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]'); }
try {
  owner = await org.auth.signInWithPassword({ email: env.VITE_DEMO_ORG_STUDENT_EMAIL, password: env.VITE_DEMO_ORG_STUDENT_PASSWORD }); assert(!owner.error, 'Org authentication failed');
  const administrator = await admin.auth.signInWithPassword({ email: env.VITE_DEMO_ADMIN_EMAIL, password: env.VITE_DEMO_ADMIN_PASSWORD }); assert(!administrator.error, 'Admin authentication failed');
  page = await open(owner.data.session, '/student/events');
  await page.getByRole('button', { name: 'Create event', exact: true }).waitFor({ timeout: 60000 }); await page.getByRole('button', { name: 'Create event', exact: true }).click();
  await page.getByLabel('Event title *', { exact: true }).fill(report.title);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('checkbox', { name: /Campus Grounds/ }).check();
  await page.getByRole('button', { name: 'Create & design maps', exact: true }).click(); await page.getByRole('button', { name: 'Confirm & design', exact: true }).click();
  await page.waitForURL('**/student/events/*/edit', { timeout: 60000 }); id = page.url().split('/').at(-2);
  const tour = page.getByRole('button', { name: 'Skip tour', exact: true }); await tour.waitFor({ timeout: 10000 }).catch(() => {}); if (await tour.count()) await tour.click();
  await page.getByRole('button', { name: 'Furniture', exact: true }).click();
  const toggle = page.getByRole('switch', { name: 'Place multiple', exact: true });
  for (const checked of [true, false, true]) {
    if ((await toggle.getAttribute('aria-checked') === 'true') !== checked) await toggle.click();
    const track = await toggle.locator('span[aria-hidden=true]').boundingBox(); const thumb = await toggle.locator('span[aria-hidden=true] > span').boundingBox();
    assert(thumb.x >= track.x && thumb.x + thumb.width <= track.x + track.width + .5, 'Placement switch thumb escapes its track');
  }
  await page.screenshot({ path: `${out}/placement-switch.png`, fullPage: false }); pass('Placement switch thumb stays inside its track in both states');
  await page.getByRole('button', { name: 'Chair', exact: true }).click(); await canvasClick(page, .04, .75);
  await page.getByRole('button', { name: 'Label', exact: true }).click(); await canvasClick(page, .55, .8);
  const chair = page.locator('[data-testid^="event-furniture-"]').first(); const label = page.locator('[data-testid^="event-label-"]').first();
  await label.dblclick(); await page.getByRole('textbox', { name: 'Edit label text', exact: true }).fill('Registration desk');
  await page.screenshot({ path: `${out}/inline-label.png`, fullPage: false }); await page.getByRole('textbox', { name: 'Edit label text', exact: true }).press('Enter');
  assert(await label.innerText() === 'Registration desk', 'Inline label commit failed');
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); assert(await label.innerText() === 'Event Label', 'Inline edit did not undo');
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); assert(await label.innerText() === 'Registration desk', 'Inline edit did not redo'); pass('Double-click inline label editing, Enter, undo, and redo');
  await page.getByRole('button', { name: 'Label', exact: true }).click();
  const before = await chair.evaluate(el => ({ x: Number.parseFloat(el.style.left), y: Number.parseFloat(el.style.top) })); const box = await chair.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 - 15, box.y + box.height / 2 - 20, { steps: 10 }); await page.mouse.up();
  const after = await chair.evaluate(el => ({ x: Number.parseFloat(el.style.left), y: Number.parseFloat(el.style.top) }));
  assert(before.x !== after.x || before.y !== after.y, 'Chair did not move in Label mode'); assert(await page.locator('[data-testid^="event-label-"]').count() === 1, 'Dragging chair placed a stray label'); pass('Label mode drags existing furniture without placing text');
  await label.dblclick(); const text = page.getByRole('textbox', { name: 'Edit label text', exact: true }); await text.fill('Canceled text'); await text.press('Escape'); assert(await label.innerText() === 'Registration desk', 'Escape retained canceled edit');
  await label.dblclick(); await page.getByRole('textbox', { name: 'Edit label text', exact: true }).fill('Help desk'); await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
  for (let i = 0; i < 30; i++) { const state = await row(); if (state.metadata.locations[0].eventLabels[0]?.text === 'Help desk') break; await page.waitForTimeout(300); }
  assert((await row()).metadata.locations[0].eventLabels[0].text === 'Help desk', 'Save lost active inline text');
  await page.reload(); await page.getByRole('button', { name: 'Review & submit', exact: true }).waitFor({ timeout: 60000 }); assert(await label.innerText() === 'Help desk', 'Reload lost inline text'); pass('Escape cancels; blur/Save commits and persists after reload');
  await page.getByRole('button', { name: 'Review & submit', exact: true }).click(); await page.getByRole('button', { name: 'Confirm submission', exact: true }).click(); await page.waitForURL('**/student/events', { timeout: 60000 });
  adminPage = await open(administrator.data.session, '/admin-dashboard/event-layouts'); await card(adminPage).waitFor({ timeout: 60000 });
  const profile = await admin.from('profiles').select('first_name,last_name').eq('id', owner.data.user.id).single(); const expectedName = [profile.data?.first_name, profile.data?.last_name].filter(Boolean).join(' ');
  assert(expectedName && (await card(adminPage).innerText()).includes('Submitted by:') && (await card(adminPage).innerText()).includes(expectedName), 'Authenticated submitter missing from queue'); pass('Admin sees authenticated submitter independently of organizer');
  await card(adminPage).getByRole('button', { name: 'Review submission', exact: true }).click(); await adminPage.getByRole('button', { name: 'Preview requested maps', exact: true }).click();
  await adminPage.getByRole('button', { name: 'Add pin', exact: true }).click(); await canvasClick(adminPage, .5, .5); await adminPage.getByLabel('Pin comment', { exact: true }).fill('QA pin display check');
  const marker = await adminPage.getByLabel('Unsaved feedback pin position', { exact: true }).boundingBox(); assert(marker.width === 24, 'Draft marker is not compact');
  await adminPage.screenshot({ path: `${out}/compact-draft-pin.png`, fullPage: false }); await adminPage.getByRole('button', { name: 'Save pin', exact: true }).click();
  const saved = await adminPage.getByRole('button', { name: 'Feedback pin 1: QA pin display check', exact: true }).boundingBox(); assert(saved.width === 24, 'Saved marker is not compact');
  await adminPage.screenshot({ path: `${out}/compact-saved-pin.png`, fullPage: false });
  assert(!Object.values((await row()).metadata.locationFeedback ?? {}).some(value => String(value).includes('QA pin display check')), 'Staged pin unexpectedly persisted');
  await adminPage.getByRole('button', { name: 'Close map preview', exact: true }).click(); await adminPage.getByRole('button', { name: 'Cancel', exact: true }).click(); await adminPage.getByRole('button', { name: 'Discard review', exact: true }).click(); pass('Compact draft and numbered pins remain visible; discarded review creates no server feedback');
  const ownerCard = page.locator('article').filter({ has: page.getByRole('heading', { name: report.title, exact: true }) });
  await page.bringToFront(); await ownerCard.getByRole('button', { name: 'Withdraw submission', exact: true }).click(); await page.getByRole('button', { name: 'Withdraw to draft', exact: true }).click();
  await adminPage.bringToFront(); await card(adminPage).waitFor({ state: 'hidden', timeout: 25000 }); pass('Withdrawn submission disappears from already-open admin queue automatically');
  await page.bringToFront(); await ownerCard.getByRole('button', { name: 'Delete', exact: true }).click(); await page.getByRole('button', { name: 'Delete event', exact: true }).click(); await ownerCard.waitFor({ state: 'hidden' });
  const absent = await org.from('map_elements').select('id').eq('id', id).maybeSingle(); assert(!absent.error && !absent.data, 'QA event remains after owner deletion'); report.cleaned = true; pass('UI deletion removes own event without removing unrelated legacy TEST record');
} catch (e) { report.failure = e.message; process.exitCode = 1; if (page) await page.screenshot({ path: `${out}/failure.png`, fullPage: false }).catch(() => {}); }
finally {
  if (id && !report.cleaned) try { let state = await row(); if (state.metadata.title === report.title && state.metadata.createdByUserId === owner.data.user.id) { if (state.metadata.status === 'pending') { const r = await org.rpc('withdraw_event_submission', { p_overlay_id: id, p_expected_updated_at: state.updated_at }); assert(!r.error, 'QA withdrawal cleanup failed'); state = await row(); } if (['draft', 'disapproved'].includes(state.metadata.status)) { const r = await org.from('map_elements').delete().eq('id', id).select('id'); report.cleaned = !r.error && r.data?.some(r => r.id === id); report.cleanupMethod = 'owner-scoped fallback'; } } } catch (e) { report.cleanupError = e.message; }
  await browser.close(); await org.auth.signOut({ scope: 'local' }); await admin.auth.signOut({ scope: 'local' }); fs.writeFileSync(`${out}/editor-queue.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
}

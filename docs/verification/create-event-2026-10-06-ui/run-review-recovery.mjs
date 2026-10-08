// Actual browser Save pin/reload/reopen journeys; proposal/decision responses are controlled.
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')]; }));
const { chromium } = createRequire(import.meta.url)('C:/Users/Rj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out = 'docs/verification/create-event-2026-10-06-ui/evidence/review-recovery'; fs.mkdirSync(out, { recursive: true });
const report = { checks: [], pageErrors: [], blockedWriteAttempts: 0, retainedFixtures: 0, controlledReviewCommands: 0 };
const admin = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
let page, fake, storageKey, commandMode = 'fail', originalPins;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
async function check(name, action) { try { await action(); report.checks.push({ name, status: 'PASS' }); } catch (error) { report.checks.push({ name, status: 'FAIL', error: error.message }); await page.screenshot({ path: `${out}/failure-${report.checks.length}.png` }).catch(() => {}); } console.log(report.checks.at(-1)); }
const preview = () => page.getByRole('dialog', { name: 'Requested map preview', exact: true });
const review = () => page.getByRole('dialog', { name: 'Review Event Layout', exact: true });
const draft = () => page.evaluate(key => { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; }, storageKey);
const readPins = feedback => JSON.parse(feedback.slice('@event-feedback/v1:'.length)).pins;
async function openReview() { await page.getByRole('button', { name: 'Review submission', exact: true }).waitFor({ timeout: 60000 }); await page.getByRole('button', { name: 'Review submission', exact: true }).click(); }
async function openPreview() { await review().getByRole('button', { name: 'Preview requested maps', exact: true }).click(); await page.getByLabel('Event layout canvas', { exact: true }).waitFor(); }
async function addPin(location, text) {
  await preview().getByRole('button', { name: 'View ' + location.locationRef.label, exact: true }).click();
  await preview().getByRole('button', { name: 'Add pin', exact: true }).click();
  const canvas = page.getByLabel('Event layout canvas', { exact: true }); const b = await canvas.boundingBox(); const content = await page.getByTestId('event-canvas-content').boundingBox();
  const left = Math.max(b.x, content.x), right = Math.min(b.x + b.width, content.x + content.width), top = Math.max(b.y, content.y), bottom = Math.min(b.y + b.height, content.y + content.height);
  assert(right > left && bottom > top, 'Authored map bounds are not visible');
  const p = { x: (left + right) / 2, y: (top + bottom) / 2 };
  await page.mouse.move(p.x, p.y); await page.getByTestId('feedback-pin-cursor-preview').waitFor();
  await page.mouse.click(p.x, p.y); await page.getByRole('textbox', { name: 'Pin comment', exact: true }).fill(text); await page.getByRole('button', { name: 'Save pin', exact: true }).click();
  await page.waitForFunction(({ key, id }) => { const raw = localStorage.getItem(key); return raw && JSON.parse(raw).fields.locationFeedback[id]?.startsWith('@event-feedback/v1:'); }, { key: storageKey, id: location.id });
}
try {
  const login = await admin.auth.signInWithPassword({ email: env.VITE_DEMO_ADMIN_EMAIL, password: env.VITE_DEMO_ADMIN_PASSWORD }); assert(!login.error, 'Existing admin sign-in failed');
  const records = await admin.from('map_elements').select('id,campus_id,metadata,updated_at,name').eq('element_type', 'event_overlay'); assert(!records.error, 'Event inspection failed');
  const sample = records.data.find(row => row.metadata?.title === 'TEST: College Week 2026 (sample)'); assert(sample, 'Existing sample unavailable');
  fake = { ...sample, id: randomUUID(), metadata: { ...sample.metadata, title: 'QA controlled review recovery', status: 'pending', isActive: false, locationFeedback: {} } };
  storageKey = `plv-navisync:event-review-draft:v1:${encodeURIComponent(login.data.user.id)}:${encodeURIComponent(fake.id)}`;
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true });
  await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: `sb-${new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]}-auth-token`, session: login.data.session });
  const reads = new Set(['list_event_safe_published_campuses', 'list_coming_soon_campuses']);
  await context.route('**/rest/v1/**', route => { const req = route.request(); if (['GET', 'HEAD'].includes(req.method()) || (req.method() === 'POST' && reads.has(new URL(req.url()).pathname.split('/rpc/')[1]))) return route.continue(); report.blockedWriteAttempts++; return route.abort(); });
  await context.route('**/rest/v1/map_elements?*', route => route.request().method() === 'GET' ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([fake]) }) : route.abort());
  await context.route('**/rest/v1/rpc/review_event_layout', async route => {
    const body = route.request().postDataJSON(); assert(body.p_overlay_id === fake.id, 'Controlled command targets an existing event'); report.controlledReviewCommands++;
    if (commandMode === 'fail') return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'QA503', message: 'Controlled review failure' }) });
    fake = { ...fake, updated_at: new Date(Date.now() + 1000).toISOString(), metadata: { ...fake.metadata, status: body.p_decision, adminComment: body.p_admin_comment, locationFeedback: body.p_location_feedback } };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: fake.id, campusId: fake.campus_id, updatedAt: fake.updated_at, metadata: fake.metadata }) });
  });
  page = await context.newPage(); page.setDefaultTimeout(10000); page.setDefaultNavigationTimeout(60000); page.on('pageerror', error => report.pageErrors.push(error.message));
  const grounds = fake.metadata.locations.find(location => location.locationRef.type === 'campus'); const floor = fake.metadata.locations.find(location => location.locationRef.type !== 'campus'); assert(grounds && floor, 'Two-location sample required');
  await page.goto('http://127.0.0.1:5173/admin-dashboard/event-layouts');
  await check('Saved Grounds and floor pins survive actual reload with exact comments/coordinates', async () => {
    await openReview(); await page.getByLabel('Admin Comment', { exact: false }).fill('QA recover both map feedback notes');
    const tomorrow = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', month: 'long', day: 'numeric', year: 'numeric' }).format(Date.now() + 86400000);
    for (const field of ['Event starts', 'Event ends']) { await review().getByRole('button', { name: new RegExp('Choose ' + field.toLowerCase() + ' date|^' + field + ' date:') }).click(); await page.getByRole('button', { name: tomorrow, exact: true }).click(); }
    await review().getByRole('button', { name: 'Schedule publication', exact: true }).click(); await review().getByRole('button', { name: /Choose publish on date|^Publish on date:/ }).click(); await page.getByRole('button', { name: tomorrow, exact: true }).click();
    await review().getByRole('button', { name: /^Publish on time:/ }).click(); await page.getByRole('spinbutton', { name: 'Hour', exact: true }).fill('6'); await page.getByRole('spinbutton', { name: 'Minute', exact: true }).fill('25'); await page.getByRole('button', { name: 'AM', exact: true }).click(); await page.getByRole('button', { name: 'Done', exact: true }).click();
    await openPreview();
    await addPin(grounds, 'QA grounds pin survives reload'); await addPin(floor, 'QA floor pin survives reload');
    const before = await draft(); originalPins = { [grounds.id]: readPins(before.fields.locationFeedback[grounds.id]), [floor.id]: readPins(before.fields.locationFeedback[floor.id]) };
    await page.reload(); await openReview(); assert(await page.getByLabel('Admin Comment', { exact: false }).inputValue() === 'QA recover both map feedback notes', 'Admin comment was lost');
    await review().getByRole('button', { name: 'Event starts date: ' + tomorrow, exact: true }).waitFor(); await review().getByRole('button', { name: 'Event ends date: ' + tomorrow, exact: true }).waitFor(); await review().getByRole('button', { name: 'Publish on time: 6:25 AM', exact: true }).waitFor(); await openPreview();
    for (const [location, text] of [[grounds, 'QA grounds pin survives reload'], [floor, 'QA floor pin survives reload']]) { await preview().getByRole('button', { name: 'View ' + location.locationRef.label, exact: true }).click(); await page.getByRole('button', { name: 'Feedback pin 1: ' + text, exact: true }).waitFor(); await preview().getByText('1/30 pins', { exact: true }).waitFor(); const recovered = await draft(); assert(JSON.stringify(readPins(recovered.fields.locationFeedback[location.id])) === JSON.stringify(originalPins[location.id]), 'Pin identity, coordinates or comment changed'); await page.screenshot({ path: `${out}/reloaded-${location === grounds ? 'grounds' : 'floor'}-desktop.png` }); }
    assert(report.controlledReviewCommands === 0, 'Reload auto-submitted a decision');
  });
  await check('Portrait reload preserves saved pins and reports the local-only draft status', async () => {
    await page.setViewportSize({ width: 390, height: 844 }); await page.reload(); await openReview(); await openPreview();
    await preview().getByRole('button', { name: 'View Campus Grounds', exact: true }).click(); await page.getByRole('button', { name: 'Feedback pin 1: QA grounds pin survives reload', exact: true }).waitFor();
    await preview().getByText(/Review draft saved on this browser/).waitFor(); await page.screenshot({ path: `${out}/reloaded-portrait.png` }); assert(report.controlledReviewCommands === 0, 'Mobile reload sent a decision');
  });
  await check('Failed review keeps pins through reload; confirmed controlled review clears the local draft', async () => {
    await page.setViewportSize({ width: 1440, height: 900 }); await page.getByRole('button', { name: 'Close map preview', exact: true }).click();
    await review().getByRole('button', { name: 'Disapprove', exact: true }).click(); await review().getByText('Controlled review failure', { exact: true }).waitFor();
    await page.reload(); await openReview(); const retryDraft = await draft(); assert(JSON.stringify(readPins(retryDraft.fields.locationFeedback[grounds.id])) === JSON.stringify(originalPins[grounds.id]), 'Failed review lost the pin');
    commandMode = 'success'; await review().getByRole('button', { name: 'Disapprove', exact: true }).click(); await review().waitFor({ state: 'hidden' });
    assert(await draft() === null, 'Confirmed review left a recovery draft'); assert(report.controlledReviewCommands === 2, 'Unexpected review command count');
  });
  await check('Explicit discard clears a new draft and does not resurrect it after reload', async () => {
    fake = { ...fake, metadata: { ...fake.metadata, status: 'pending', locationFeedback: {} } }; await page.reload(); await openReview(); await page.getByLabel('Admin Comment', { exact: false }).fill('QA explicitly discard this draft');
    await review().getByText(/Review draft saved on this browser/).waitFor(); await review().getByRole('button', { name: 'Cancel', exact: true }).click(); await page.getByRole('button', { name: 'Discard review', exact: true }).click();
    await page.reload(); await openReview(); assert(await page.getByLabel('Admin Comment', { exact: false }).inputValue() === '', 'Discarded comment was restored'); assert(await draft() === null, 'Discard did not clear local recovery data');
  });
  await check('Changed server revision refuses old coordinates with visible guidance', async () => {
    await page.getByLabel('Admin Comment', { exact: false }).fill('QA stale review notes'); await openPreview(); await addPin(grounds, 'QA stale pin must not apply');
    fake = { ...fake, updated_at: new Date(Date.now() + 2000).toISOString(), metadata: { ...fake.metadata, revision: (fake.metadata.revision ?? 0) + 1 } };
    await page.reload(); await openReview(); await review().getByText(/Previous draft pins were not applied/).waitFor(); await openPreview(); await preview().getByText('0/30 pins', { exact: true }).waitFor(); assert(await page.getByRole('button', { name: /Feedback pin 1:/ }).count() === 0, 'Stale pin coordinates were applied'); await page.screenshot({ path: `${out}/stale-review.png` });
  });
  const after = await admin.from('map_elements').select('metadata,updated_at').eq('id', sample.id).single(); assert(!after.error && after.data.updated_at === sample.updated_at && JSON.stringify(after.data.metadata) === JSON.stringify(sample.metadata), 'Existing sample changed'); report.existingSampleUnchanged = true;
  assert(report.blockedWriteAttempts === 0, 'Unexpected actual database mutation attempted');
} catch (error) { report.failure = error.message; process.exitCode = 1; }
finally { if (page) await page.evaluate(key => localStorage.removeItem(key), storageKey).catch(() => {}); await browser.close(); await admin.auth.signOut({ scope: 'local' }); fs.writeFileSync(`${out}/review-recovery.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report)); if (report.checks.some(check => check.status === 'FAIL')) process.exitCode = 1; }

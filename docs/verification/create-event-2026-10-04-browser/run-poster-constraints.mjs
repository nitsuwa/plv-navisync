// UI-only poster validation. No event is created and no file is uploaded.
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')]; }));
const { chromium } = createRequire(import.meta.url)('C:/Users/Rj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out = 'docs/verification/create-event-2026-10-04-browser/evidence';
const report = { title: `QA poster constraints ${randomUUID().slice(0, 8)}`, checks: [], errors: [], noEventCreated: false, noUpload: false };
const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
function assert(ok, msg) { if (!ok) throw new Error(msg); }
function pass(name, detail = '') { report.checks.push({ name, status: 'PASS', ...(detail ? { detail } : {}) }); console.log('PASS ' + name); }
let page, user, uploadCount = 0;
try {
  const login = await client.auth.signInWithPassword({ email: env.VITE_DEMO_ORG_STUDENT_EMAIL, password: env.VITE_DEMO_ORG_STUDENT_PASSWORD });
  assert(!login.error, 'Configured Org login failed'); user = login.data.user;
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: `sb-${new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]}-auth-token`, session: login.data.session });
  page = await context.newPage(); page.on('pageerror', error => report.errors.push(error.message));
  await page.route('**/storage/v1/object/event_posters/**', route => { if (route.request().method() === 'POST') uploadCount++; return route.continue(); });
  await page.goto('http://127.0.0.1:5173/student/events');
  await page.getByRole('button', { name: 'Create event', exact: true }).waitFor({ timeout: 60000 });
  await page.getByRole('button', { name: 'Create event', exact: true }).click();
  await page.getByLabel('Event title *', { exact: true }).fill(report.title);
  const input = page.locator('input[type=file]').first();
  await input.setInputFiles({ name: 'unsupported.gif', mimeType: 'image/gif', buffer: Buffer.from('gif-not-an-image') });
  assert(await page.getByRole('alert').innerText() === 'Choose a JPEG, PNG or WebP image.', 'Unsupported MIME message did not appear');
  assert(await page.getByText('Choose an image to help identify the event', { exact: true }).count() === 1, 'Invalid MIME replaced the selected poster label');
  await page.screenshot({ path: `${out}/poster-invalid-type.png`, fullPage: false });
  pass('Unsupported MIME is rejected inline without replacing form values');

  await input.setInputFiles({ name: 'too-large.png', mimeType: 'image/png', buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });
  assert(await page.getByRole('alert').innerText() === 'The poster must be 5 MB or smaller.', 'Oversize message did not appear');
  assert(await page.getByLabel('Event title *', { exact: true }).inputValue() === report.title, 'Oversize attempt lost title');
  assert(await page.getByText('Choose an image to help identify the event', { exact: true }).count() === 1, 'Oversize file replaced selected poster label');
  await page.screenshot({ path: `${out}/poster-oversize.png`, fullPage: false });
  pass('Poster over 5 MB is rejected inline and title remains intact');

  const images = await page.evaluate(() => Object.fromEntries(['image/jpeg', 'image/webp'].map(type => {
    const canvas = document.createElement('canvas'); canvas.width = 2; canvas.height = 2;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#173475'; ctx.fillRect(0, 0, 2, 2);
    const data = canvas.toDataURL(type); return [type, data];
  })));
  for (const [type, suffix] of [['image/jpeg', 'jpg'], ['image/webp', 'webp']]) {
    const data = images[type]; assert(data.startsWith(`data:${type};base64,`), `Browser could not create a valid ${type} test image`);
    await input.setInputFiles({ name: `qa.${suffix}`, mimeType: type, buffer: Buffer.from(data.split(',')[1], 'base64') });
    assert(await page.getByText(`qa.${suffix}`, { exact: true }).count() === 1, `${type} was not accepted`);
    assert(await page.getByRole('alert').count() === 0, `${type} left an error visible`);
  }
  pass('Valid JPEG and WebP selections are accepted by the create form');
  await page.getByRole('button', { name: 'Remove selected poster', exact: true }).click();
  assert(await page.getByText('Choose an image to help identify the event', { exact: true }).count() === 1, 'Remove selected poster did not reset the filename');
  const finalData = images['image/jpeg'];
  await input.setInputFiles({ name: 'qa-final.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(finalData.split(',')[1], 'base64') });
  await page.screenshot({ path: `${out}/poster-selected-create.png`, fullPage: false });
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  const discard = page.getByRole('alertdialog', { name: 'Discard this proposal?', exact: true }); await discard.waitFor();
  await discard.getByRole('button', { name: 'Keep editing', exact: true }).click();
  const createDialog = page.getByRole('dialog', { name: 'Create event proposal', exact: true });
  report.keepEditingLeavesProposalOpen = await createDialog.isVisible().catch(() => false);
  await page.screenshot({ path: `${out}/poster-keep-editing.png`, fullPage: false });
  assert(report.keepEditingLeavesProposalOpen, 'Keep editing closed the create proposal dialog');
  assert(await page.getByText('qa-final.jpg', { exact: true }).isVisible(), 'Keep editing did not preserve the current file selection');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  const discardAgain = page.getByRole('alertdialog', { name: 'Discard this proposal?', exact: true }); await discardAgain.waitFor();
  await discardAgain.screenshot({ path: `${out}/poster-discard-confirmation.png`, fullPage: false });
  await page.getByText('Discard changes', { exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Create event', exact: true }).click();
  await page.getByLabel('Event title *', { exact: true }).waitFor();
  assert(await page.getByLabel('Event title *', { exact: true }).inputValue() === '', 'Reopened proposal retained discarded title');
  assert(await page.getByText('Choose an image to help identify the event', { exact: true }).count() === 1, 'Reopened proposal retained stale poster state');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('dialog', { name: 'Create event proposal', exact: true }).waitFor({ state: 'hidden' });
  pass('Remove, cancel/keep editing, discard and reopen reset poster state correctly');
  const found = await client.from('map_elements').select('id').eq('name', report.title).eq('metadata->>createdByUserId', user.id);
  assert(!found.error && found.data.length === 0, 'A proposal row was created during validation-only run');
  report.noEventCreated = true;
  report.uploadRequests = uploadCount;
  assert(uploadCount === 0, 'A poster uploaded during validation-only run');
  report.noUpload = true;
} catch (error) {
  report.failure = error.message; if (page) { report.screen = await page.locator('body').innerText(); await page.screenshot({ path: `${out}/poster-constraints-failure.png`, fullPage: true }); }
  console.log('FAIL ' + error.message); process.exitCode = 1;
} finally {
  try {
    if (user) { const found = await client.from('map_elements').select('id').eq('name', report.title).eq('metadata->>createdByUserId', user.id); report.noEventCreated = !found.error && found.data.length === 0; }
    report.uploadRequests = uploadCount; report.noUpload = uploadCount === 0;
  } catch (error) { report.finalCheckError = error.message; }
  await browser.close(); await client.auth.signOut({ scope: 'local' });
  fs.writeFileSync(`${out}/poster-constraints-browser.json`, JSON.stringify(report, null, 2));
  console.log(`No event created=${report.noEventCreated}; no upload=${report.noUpload}`);
}

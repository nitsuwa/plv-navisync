// Authorized QA with existing identities. Mutates only the disposable UUID created here.
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(line => /^[A-Z_]+=/.test(line)).map(line => {
  const index = line.indexOf('=');
  return [line.slice(0, index), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')];
}));
const { chromium } = createRequire(import.meta.url)('C:/Users/Rj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = 'docs/verification/create-event-2026-10-03/keyboard-recovery-browser.json';
const report = { project: new URL(env.VITE_SUPABASE_URL).hostname, id: randomUUID(), created: false, cleaned: false, checks: [], errors: [], submitRequests: [], routeCalls: [] };
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
const makeClient = () => createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
function assert(value, message) { if (!value) throw new Error(message); }
function pass(name) { report.checks.push({ name, status: 'PASS' }); console.log(`PASS ${name}`); }
async function signIn(prefix) {
  const client = makeClient();
  const result = await client.auth.signInWithPassword({ email: env[`${prefix}_EMAIL`], password: env[`${prefix}_PASSWORD`] });
  assert(!result.error && result.data.user, `Configured ${prefix} account sign-in failed`);
  return { client, ...result.data };
}
async function tabTo(page, locator, label) {
  for (let count = 0; count < 140; count += 1) {
    if (await locator.evaluate(element => element === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`Keyboard Tab did not reach ${label}`);
}

let org;
async function readRow() {
  const result = await org.client.from('map_elements').select('id,metadata,updated_at').eq('id', report.id).single();
  assert(!result.error && result.data, 'Disposable keyboard event could not be read');
  return result.data;
}
try {
  org = await signIn('VITE_DEMO_ORG_STUDENT');
  const campusResult = await org.client.from('campus_versions').select('campus_id').eq('state', 'published').limit(1);
  assert(!campusResult.error && campusResult.data?.length, 'No published campus is available for a QA location');
  const pin1 = { id: 'qa-keyboard-pin-1', x: 36, y: 40, comment: 'QA keep booth clear of entrance' };
  const pin2 = { id: 'qa-keyboard-pin-2', x: 58, y: 42, comment: 'QA leave access route open' };
  const feedback = `@event-feedback/v1:${JSON.stringify({ text: 'QA keyboard recovery fixture', pins: [pin1, pin2] })}`;
  const location = {
    id: 'qa-keyboard-grounds',
    locationRef: { type: 'campus', label: 'Campus Grounds' },
    eventFurniture: [{ id: 'qa-keyboard-booth', type: 'booth', name: 'QA booth', category: 'event', x: 240, y: 220, width: 64, height: 48, rotation: 0, color: '#123456', layer: 'events' }],
    eventLabels: [],
  };
  const title = `QA keyboard recovery ${report.id.slice(0, 8)}`;
  const metadata = {
    id: report.id, kind: 'event_overlay', title, description: 'Disposable keyboard and retry QA fixture', organizer: 'QA existing Student Org',
    createdByUserId: org.user.id, status: 'draft', isActive: true, locations: [location], locationRef: location.locationRef,
    eventFurniture: location.eventFurniture, eventLabels: [], markers: [], restrictedAreas: [],
  };
  const insert = await org.client.from('map_elements').insert({
    id: report.id, campus_id: campusResult.data[0].campus_id, element_type: 'event_overlay', name: title, x: 0, y: 0,
    metadata, is_visible: true, is_searchable: false, is_accessible: false, is_emergency_asset: false, z_index: 0, rotation: 0,
    search_keywords: [], style: {},
  }).select('id').single();
  assert(!insert.error, insert.error?.message ?? 'QA event insert failed');
  report.created = true;
  const draft = await readRow();
  const submitted = await org.client.from('map_elements').update({ metadata: { ...draft.metadata, status: 'pending', submittedAt: new Date().toISOString() } }).eq('id', report.id).eq('updated_at', draft.updated_at).select('id').single();
  assert(!submitted.error, submitted.error?.message ?? 'QA event could not enter Pending');
  const pending = await readRow();
  const admin = await signIn('VITE_DEMO_ADMIN');
  const reviewed = await admin.client.rpc('review_event_layout', {
    p_overlay_id: report.id, p_expected_updated_at: pending.updated_at, p_decision: 'disapproved',
    p_date_start: null, p_date_end: null, p_publication_mode: 'now', p_publication_at: null,
    p_admin_comment: 'QA: resolve both map notes before resubmitting.', p_location_feedback: { [location.id]: feedback },
  });
  assert(!reviewed.error, reviewed.error?.message ?? 'Disposable feedback could not be seeded');
  await admin.client.auth.signOut({ scope: 'local' });

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const authKey = `sb-${new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
  await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: authKey, session: org.session });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('request', request => {
    if (request.method() === 'PATCH' && request.url().includes(report.id)) {
      report.submitRequests.push({ method: request.method(), path: new URL(request.url()).pathname });
    }
  });
  await page.goto(`http://127.0.0.1:5173/student/events/${report.id}/edit`);
  const skipTour = page.getByRole('button', { name: 'Skip tour', exact: true });
  await skipTour.waitFor({ timeout: 60000 });
  await tabTo(page, skipTour, 'Skip tour');
  await page.keyboard.press('Enter');

  const checklist = page.locator('[data-feedback-checklist]');
  const checklistSummary = checklist.locator('summary');
  await tabTo(page, checklistSummary, 'feedback checklist');
  await page.keyboard.press('Enter');
  const showFirst = page.getByRole('button', { name: 'Show pin 1 on map', exact: true });
  await tabTo(page, showFirst, 'first pin locator');
  await page.keyboard.press('Enter');
  const firstNote = page.getByLabel(`Resolution note for pin 1 in ${location.id}`, { exact: true });
  await tabTo(page, firstNote, 'first resolution note');
  await page.keyboard.type('QA entrance checked and booth moved');
  let failAcknowledgement = true;
  await page.route('**/rest/v1/rpc/set_event_feedback_pin_addressed', route => {
    if (failAcknowledgement) {
      failAcknowledgement = false;
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'QA acknowledgement temporarily unavailable' }) });
    }
    return route.continue();
  });
  const acknowledgeFirst = page.getByRole('button', { name: 'Mark as addressed', exact: true }).first();
  await tabTo(page, acknowledgeFirst, 'first acknowledge action');
  await page.keyboard.press('Enter');
  await page.getByText(/QA acknowledgement temporarily unavailable/).first().waitFor();
  assert(await firstNote.inputValue() === 'QA entrance checked and booth moved', 'Failed acknowledgement lost typed note');
  assert(!(await readRow()).metadata.feedbackResolutions?.[location.id]?.[pin1.id], 'Failed acknowledgement changed the resolution record');
  pass('Keyboard acknowledgement failure keeps the note and server state; no false success');
  await tabTo(page, acknowledgeFirst, 'first acknowledge retry');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Reopen issue', exact: true }).waitFor();
  assert((await readRow()).metadata.feedbackResolutions[location.id][pin1.id].note === 'QA entrance checked and booth moved', 'Keyboard acknowledgement retry did not persist');

  const reviewSubmit = page.getByRole('button', { name: 'Review & submit', exact: true });
  await tabTo(page, reviewSubmit, 'Review & submit');
  await page.keyboard.press('Enter');
  assert(await page.getByRole('dialog', { name: 'Review before submitting', exact: true }).count() === 0, 'Keyboard submission bypassed the second open feedback pin');
  assert((await readRow()).metadata.status === 'disapproved', 'Blocked submission changed the event');
  pass('Keyboard submission is blocked while the second pin remains open');

  const secondNote = page.getByLabel(`Resolution note for pin 2 in ${location.id}`, { exact: true });
  await tabTo(page, secondNote, 'second resolution note');
  await page.keyboard.type('QA access route checked and clear');
  const acknowledgeSecond = page.getByRole('button', { name: 'Mark as addressed', exact: true });
  await tabTo(page, acknowledgeSecond, 'second acknowledge action');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('[data-feedback-checklist] summary')?.textContent?.includes('2/2'));
  await page.keyboard.press('Control+r');
  await page.getByRole('button', { name: 'Review & submit', exact: true }).waitFor({ timeout: 60000 });
  assert((await checklist.locator('summary').innerText()).includes('2/2'), 'Browser refresh lost acknowledgement state');
  pass('Keyboard actions address both pins and survive browser refresh');

  let failSubmit = true;
  await page.route('**/*', route => {
    const request = route.request();
    const matchesDisposableWrite = request.method() === 'PATCH' && request.url().includes('/rest/v1/map_elements') && request.url().includes(report.id);
    if (request.url().includes('/rest/v1/map_elements')) report.routeCalls.push({ method: request.method(), path: new URL(request.url()).pathname, matchesDisposableWrite });
    if (failSubmit && matchesDisposableWrite) {
      failSubmit = false;
      report.interceptedSubmitPath = new URL(request.url()).pathname;
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'QA submit temporarily unavailable' }) });
    }
    return route.continue();
  });
  const submitAgain = page.getByRole('button', { name: 'Review & submit', exact: true });
  await tabTo(page, submitAgain, 'Review & submit after reload');
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Review before submitting', exact: true });
  await dialog.waitFor();
  const confirm = page.getByRole('button', { name: 'Confirm submission', exact: true });
  assert(await confirm.isEnabled(), 'Keyboard submit was disabled after both feedback pins were addressed');
  await tabTo(page, confirm, 'Confirm submission');
  await page.keyboard.press('Enter');
  await page.getByText(/Submit failed/).first().waitFor({ timeout: 10000 });
  report.submitFailureAttempt = { intercepted: !failSubmit, status: (await readRow()).metadata.status, dialogStillOpen: await dialog.isVisible(), pageText: (await page.locator('body').innerText()).slice(-1800) };
  assert(!failSubmit, `Submit network request was not intercepted; requests=${JSON.stringify(report.submitRequests)}`);
  await page.getByText(/Submit failed/).first().waitFor();
  assert((await readRow()).metadata.status === 'disapproved', 'Failed network submit changed event status');
  assert((await confirm.count()) === 1 && await confirm.isVisible(), 'Failed submit closed the dialog or lost the retry action');
  pass('Keyboard submit network failure preserves the proposal and leaves a retry action');
  await tabTo(page, confirm, 'Confirm submission retry');
  await page.keyboard.press('Enter');
  await page.waitForURL('**/student/events', { timeout: 60000 });
  const finalRow = await readRow();
  assert(finalRow.metadata.status === 'pending', 'Keyboard retry did not resubmit the event');
  assert(Object.keys(finalRow.metadata.feedbackResolutions[location.id]).length === 2, 'Retry lost resolution evidence');
  assert(finalRow.metadata.locationFeedback[location.id] === feedback, 'Retry changed admin feedback');
  const count = await org.client.from('map_elements').select('id', { count: 'exact', head: true }).eq('id', report.id);
  assert(!count.error && count.count === 1, 'Retry created a duplicate event');
  assert(report.errors.length === 0, `Browser raised exceptions: ${report.errors.join('; ')}`);
  pass('Keyboard retry resubmits once with both student notes and original pins; no browser exceptions');
  await context.close();
} catch (error) {
  report.failure = error instanceof Error ? error.message : String(error);
  console.log(`FAIL ${report.failure}`);
  process.exitCode = 1;
} finally {
  if (report.created && org) {
    try {
      let current = await readRow();
      if (current.metadata.status === 'pending') {
        await org.client.rpc('withdraw_event_submission', { p_overlay_id: report.id, p_expected_updated_at: current.updated_at });
        current = await readRow();
      }
      if (['draft', 'disapproved'].includes(current.metadata.status) && current.metadata.createdByUserId === org.user.id && current.metadata.title === `QA keyboard recovery ${report.id.slice(0, 8)}`) {
        const deleted = await org.client.from('map_elements').delete().eq('id', report.id).select('id');
        report.cleaned = !deleted.error && deleted.data?.some(row => row.id === report.id);
        if (deleted.error) report.cleanupError = deleted.error.message;
      }
    } catch (error) { report.cleanupError = error instanceof Error ? error.message : String(error); }
  }
  await browser.close();
  if (org) await org.client.auth.signOut({ scope: 'local' });
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(`Disposable fixture ${report.id} cleaned=${report.cleaned}`);
}

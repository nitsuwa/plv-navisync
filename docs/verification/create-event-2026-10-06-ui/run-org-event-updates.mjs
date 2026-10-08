// Existing Org account; controlled owner-event responses simulate GSO updates. No database writes.
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')]; }));
const { chromium } = createRequire(import.meta.url)('C:/Users/Rj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out = 'docs/verification/create-event-2026-10-06-ui/evidence/org-updates'; fs.mkdirSync(out, { recursive: true });
const report = { checks: [], pageErrors: [], blockedWriteAttempts: 0, retainedFixtures: 0 };
const org = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
let page, rows, ownerReads = 0;
const assert = (value, message) => { if (!value) throw new Error(message); };
async function check(name, action) { try { await action(); report.checks.push({ name, status: 'PASS' }); } catch (e) { report.checks.push({ name, status: 'FAIL', error: e.message }); await page.screenshot({ path: `${out}/failure-${report.checks.length}.png` }).catch(() => {}); } console.log(report.checks.at(-1)); }
const card = index => page.getByTestId('org-event-card-' + rows[index].id);
async function refresh() { await page.evaluate(() => window.dispatchEvent(new Event('focus'))); }
async function expectUnread(index, expected) { await page.waitForFunction(({ id, expected }) => document.querySelector(`[data-testid="org-event-card-${id}"]`)?.getAttribute('data-unread') === String(expected), { id: rows[index].id, expected }); }
async function badge(count, viewport) {
  const link = viewport.width >= 768 ? page.getByRole('link', { name: /^My Events/ }) : page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: /^Events/ });
  if (count) { await link.getByTestId('event-unread-count').waitFor(); assert(await link.getByTestId('event-unread-count').innerText() === String(count), 'Wrong nav unread count'); }
  else await link.getByTestId('event-unread-count').waitFor({ state: 'hidden' });
  return link;
}
async function read(index) { await card(index).getByRole('button', { name: 'Mark GSO update for ' + rows[index].metadata.title + ' as read', exact: true }).click(); await expectUnread(index, false); }
try {
  const login = await org.auth.signInWithPassword({ email: env.VITE_DEMO_ORG_STUDENT_EMAIL, password: env.VITE_DEMO_ORG_STUDENT_PASSWORD }); assert(!login.error, 'Existing Org sign-in failed');
  const before = await org.from('map_elements').select('id,campus_id,metadata,updated_at,name').or('element_type.eq.event_overlay,metadata->>kind.eq.event_overlay').eq('metadata->>createdByUserId', login.data.user.id); assert(!before.error && before.data.length, 'Existing owner events unavailable');
  const sample = before.data[0]; rows = ['QA layout A', 'QA layout B'].map(title => ({ ...sample, id: randomUUID(), metadata: { ...sample.metadata, title, status: 'pending', adminComment: '', locationFeedback: {}, submittedAt: new Date().toISOString() } }));
  const foreign = { ...rows[0], id: randomUUID(), metadata: { ...rows[0].metadata, title: 'Foreign layout must stay hidden', createdByUserId: randomUUID(), status: 'approved' } };
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true });
  await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: `sb-${new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]}-auth-token`, session: login.data.session });
  const reads = new Set(['list_event_safe_published_campuses', 'list_coming_soon_campuses', 'list_published_event_previews', 'list_event_revisions']);
  await context.route('**/rest/v1/**', route => { const req = route.request(); if (['GET', 'HEAD'].includes(req.method()) || (req.method() === 'POST' && reads.has(new URL(req.url()).pathname.split('/rpc/')[1]))) return route.continue(); report.blockedWriteAttempts++; return route.abort(); });
  await context.route('**/rest/v1/map_elements?*', route => { if (route.request().method() !== 'GET') return route.abort(); ownerReads++; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([...rows, foreign]) }); });
  page = await context.newPage(); page.setDefaultTimeout(10000); page.setDefaultNavigationTimeout(60000); page.on('pageerror', e => report.pageErrors.push(e.message));
  await page.goto('http://127.0.0.1:5173/student/events');
  await check('One shared fetch, no pending badge and no foreign-owner card', async () => {
    await card(0).waitFor({ timeout: 60000 }); assert(ownerReads === 1, 'Nav and page made duplicate owner reads'); await badge(0, { width: 1440 });
    assert(await page.getByText('Foreign layout must stay hidden', { exact: true }).count() === 0, 'Foreign event leaked');
  });
  await check('Approval/disapproval mark only the affected cards; reading one leaves the other unread', async () => {
    rows[0].metadata.status = 'approved'; rows[0].metadata.adminComment = 'Approved by GSO'; await refresh(); await expectUnread(0, true); await expectUnread(1, false); await badge(1, { width: 1440 });
    rows[1].metadata.status = 'disapproved'; rows[1].metadata.adminComment = 'Move the booth away from the entrance'; await refresh(); await expectUnread(1, true); await badge(2, { width: 1440 });
    await page.screenshot({ path: `${out}/desktop-unread.png`, fullPage: false }); await read(0); await badge(1, { width: 1440 }); await expectUnread(1, true);
    await page.reload(); await card(0).waitFor({ timeout: 60000 }); await expectUnread(0, false); await expectUnread(1, true); await badge(1, { width: 1440 });
  });
  await check('Later GSO feedback re-notifies; own edits do not; a new review cycle is unread', async () => {
    await read(1); rows[0].metadata.adminComment = 'Approval includes this updated GSO note'; await refresh(); await expectUnread(0, true); await badge(1, { width: 1440 }); await read(0);
    rows[0].updated_at = new Date().toISOString(); rows[0].metadata.revision = (rows[0].metadata.revision ?? 0) + 1; rows[0].metadata.feedbackResolutions = {}; await refresh(); await expectUnread(0, false); await badge(0, { width: 1440 });
    rows[1].metadata.status = 'pending'; rows[1].metadata.submittedAt = new Date(Date.now() + 1000).toISOString(); await refresh(); await expectUnread(1, false);
    rows[1].metadata.status = 'disapproved'; await refresh(); await expectUnread(1, true); await badge(1, { width: 1440 }); await read(1);
  });
  for (const [name, viewport] of [['portrait', { width: 390, height: 844 }], ['landscape', { width: 740, height: 390 }], ['tablet', { width: 768, height: 1024 }]]) {
    await check('Responsive badge, specific-card read and reload: ' + name, async () => {
      rows[0].metadata.adminComment += ' New update for ' + name; rows[1].metadata.adminComment += ' New update for ' + name;
      await page.setViewportSize(viewport); await refresh(); await expectUnread(0, true); await expectUnread(1, true); const nav = await badge(2, viewport);
      const navBox = await nav.boundingBox(); assert(navBox && navBox.x >= 0 && navBox.y >= 0 && navBox.x + navBox.width <= viewport.width && navBox.y + navBox.height <= viewport.height, 'Navigation badge is clipped: ' + JSON.stringify(navBox));
      const mark = card(0).getByRole('button', { name: 'Mark GSO update for QA layout A as read', exact: true }); await mark.scrollIntoViewIfNeeded(); const b = await mark.boundingBox(); assert(b.height >= 44 && b.x >= 0 && b.x + b.width <= viewport.width, 'Card read action is not usable'); await page.screenshot({ path: `${out}/unread-${name}.png` });
      await read(0); await badge(1, viewport); await page.reload(); await card(0).waitFor({ timeout: 60000 }); await expectUnread(0, false); await expectUnread(1, true); await badge(1, viewport); await read(1);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal page overflow');
    });
  }
  const after = await org.from('map_elements').select('id,metadata,updated_at').or('element_type.eq.event_overlay,metadata->>kind.eq.event_overlay').eq('metadata->>createdByUserId', login.data.user.id); assert(!after.error && before.data.every(old => { const now = after.data.find(row => row.id === old.id); return now && now.updated_at === old.updated_at && JSON.stringify(now.metadata) === JSON.stringify(old.metadata); }), 'Existing owner events changed'); report.existingEventsUnchanged = true; assert(report.blockedWriteAttempts === 0, 'Unexpected database mutation attempted');
} catch (error) { report.failure = error.message; process.exitCode = 1; }
finally { await browser.close(); await org.auth.signOut({ scope: 'local' }); fs.writeFileSync(`${out}/org-event-updates.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report)); if (report.checks.some(check => check.status === 'FAIL')) process.exitCode = 1; }

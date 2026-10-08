// Read-only browser verification with existing admin identity; all review changes are discarded.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(line => /^[A-Z_]+=/.test(line)).map(line => {
  const index = line.indexOf('=');
  return [line.slice(0, index), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')];
}));
const { chromium } = createRequire(import.meta.url)('C:/Users/Rj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const output = 'docs/verification/create-event-2026-10-04-browser/evidence';
const report = { checks: [], errors: [], nativeZoom: null };
const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
function assert(value, message) { if (!value) throw new Error(message); }
function pass(name, detail) { report.checks.push({ name, status: 'PASS', detail }); console.log(`PASS ${name}`); }
const transformOf = async page => page.getByTestId('event-canvas-content').getAttribute('style');
const canvasZoomOf = async page => Number((await transformOf(page)).match(/scale\(([^)]+)\)/)?.[1]);
try {
  const login = await client.auth.signInWithPassword({ email: env.VITE_DEMO_ADMIN_EMAIL, password: env.VITE_DEMO_ADMIN_PASSWORD });
  assert(!login.error && login.data.session, 'Configured super admin could not sign in');
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), {
    key: `sb-${new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]}-auth-token`, session: login.data.session,
  });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto('http://127.0.0.1:5173/admin-dashboard/event-layouts');
  await page.getByRole('button', { name: 'Review submission', exact: true }).first().waitFor({ timeout: 60000 });
  const reviewTrigger = page.getByRole('button', { name: 'Review submission', exact: true }).first();
  await reviewTrigger.click();
  const previewTrigger = page.getByRole('button', { name: 'Preview requested maps', exact: true });
  await previewTrigger.waitFor();
  await previewTrigger.click();
  await page.getByRole('button', { name: 'Pan map', exact: true }).waitFor();
  await page.screenshot({ path: output + '/preview-controls-desktop.png', fullPage: false });
  const canvas = page.getByLabel('Event layout canvas', { exact: true });
  const box = await canvas.boundingBox();
  assert(box && box.width > 300 && box.height > 120, 'Admin preview canvas is too small');
  const panToggle = page.getByRole('button', { name: 'Pan map', exact: true });
  await canvas.focus();
  await page.keyboard.press('h');
  assert(await panToggle.getAttribute('aria-pressed') === 'false', 'H did not turn Pan off from the focused map');
  const styleBeforeSpace = await transformOf(page);
  await page.keyboard.down('Space');
  await page.waitForFunction(() => document.querySelector('[aria-label="Event layout canvas"]')?.style.cursor === 'grab');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 36, box.y + box.height / 2 + 24, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up('Space');
  assert(await transformOf(page) !== styleBeforeSpace, 'Space + drag did not temporarily pan the map');
  assert(await panToggle.getAttribute('aria-pressed') === 'false', 'Space changed persistent Pan toggle');
  await page.waitForFunction(() => document.querySelector('[aria-label="Event layout canvas"]')?.style.cursor !== 'grab');
  pass('Space temporarily pans while persistent Pan is off, then releases cleanly');

  const beforeWheel = await canvasZoomOf(page);
  const scrollBeforeWheel = await page.evaluate(() => window.scrollY);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -240);
  await page.keyboard.up('Control');
  await page.waitForFunction(previous => {
    const style = document.querySelector('[data-testid="event-canvas-content"]')?.getAttribute('style') ?? '';
    return Number(style.match(/scale\(([^)]+)\)/)?.[1]) !== previous;
  }, beforeWheel, { timeout: 5000 });
  assert(await page.evaluate(() => window.scrollY) === scrollBeforeWheel, 'Ctrl+wheel leaked into outer page scrolling');
  const afterWheel = await canvasZoomOf(page);
  assert(afterWheel > beforeWheel, 'Ctrl+wheel did not zoom in toward the canvas');
  pass('Ctrl+wheel zooms the map and leaves outer-page scroll unchanged', `${beforeWheel} → ${afterWheel}`);

  const focusItems = page.getByRole('button', { name: 'Focus event items', exact: true });
  assert(await focusItems.isEnabled(), 'Focus items is unavailable despite a visible event layout');
  const beforeFocus = await transformOf(page);
  await focusItems.click();
  await page.waitForFunction(previous => document.querySelector('[data-testid="event-canvas-content"]')?.getAttribute('style') !== previous, beforeFocus, { timeout: 5000 });
  const beforeFit = await transformOf(page);
  await canvas.focus();
  await page.keyboard.press('0');
  await page.waitForFunction(previous => document.querySelector('[data-testid="event-canvas-content"]')?.getAttribute('style') !== previous, beforeFit, { timeout: 5000 });
  pass('Focus items targets requested event assets; 0 refits the map');

  const panBeforeShortcutScope = await panToggle.getAttribute('aria-pressed');
  const closePreview = page.getByRole('button', { name: 'Close map preview', exact: true });
  await closePreview.focus();
  await page.keyboard.press('h');
  assert(await panToggle.getAttribute('aria-pressed') === panBeforeShortcutScope, 'H shortcut fired while focus was outside the map canvas');
  await page.getByRole('button', { name: 'Add pin', exact: true }).click();
  const refreshedBox = await canvas.boundingBox();
  await canvas.click({ position: { x: refreshedBox.width / 2, y: refreshedBox.height / 2 } });
  assert(await page.getByLabel('Unsaved feedback pin position', { exact: true }).count() === 1, 'Draft map pin marker is not visible before save');
  await page.screenshot({ path: output + '/preview-pin-draft.png', fullPage: false });
  const comment = page.getByLabel('Pin comment', { exact: true });
  await comment.focus();
  await page.keyboard.press('h');
  await page.keyboard.press('Space');
  assert((await comment.inputValue()).includes('h '), 'Space/H did not type normally in the feedback comment field');
  assert(await panToggle.getAttribute('aria-pressed') === panBeforeShortcutScope, 'Canvas shortcuts fired inside the comment field');
  await page.getByRole('button', { name: 'Close map preview', exact: true }).click();
  const discardPin = page.getByRole('alertdialog', { name: 'Discard this unsaved pin?', exact: true });
  await discardPin.waitFor();
  await page.getByRole('button', { name: 'Discard pin and close', exact: true }).click();
  assert(await previewTrigger.evaluate(element => element === document.activeElement), 'Closing nested preview did not return focus to its trigger');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert(await reviewTrigger.evaluate(element => element === document.activeElement), 'Closing review did not return focus to the queue action');
  assert(await page.evaluate(() => !document.body.hasAttribute('data-scroll-locked')), 'Closing review did not restore document scroll');
  assert(report.errors.length === 0, `Browser exceptions: ${report.errors.join('; ')}`);
  pass('H is scoped to map; H/Space type in comments; nested modal closes restore focus and scrolling');

  const zoomPage = await context.newPage();
  await zoomPage.goto('http://127.0.0.1:5173/home');
  const beforeZoom = await zoomPage.evaluate(() => ({ dpr: devicePixelRatio, innerWidth, scale: visualViewport?.scale ?? 1 }));
  for (let attempt = 0; attempt < 8; attempt += 1) await zoomPage.keyboard.press('Control+Shift+Equal');
  await zoomPage.waitForTimeout(500);
  const afterZoom = await zoomPage.evaluate(() => ({ dpr: devicePixelRatio, innerWidth, scale: visualViewport?.scale ?? 1 }));
  await zoomPage.screenshot({ path: `${output}/native-zoom-probe.png`, fullPage: true });
  const measured = afterZoom.dpr / beforeZoom.dpr >= 1.9 || beforeZoom.innerWidth / afterZoom.innerWidth >= 1.9 || afterZoom.scale / beforeZoom.scale >= 1.9;
  report.nativeZoom = { before: beforeZoom, after: afterZoom, measuredNear200Percent: measured, note: measured ? 'Native browser zoom shortcut changed measured viewport scale.' : 'Headless Edge did not expose a reliable native browser zoom change; this is not a 200% acceptance PASS.' };
  if (measured) pass('Native Edge zoom is measurable near 200%', `${JSON.stringify(beforeZoom)} → ${JSON.stringify(afterZoom)}`);
  else { report.checks.push({ name: 'Native 200% browser zoom', status: 'BLOCKED', detail: report.nativeZoom.note }); console.log('BLOCKED Native 200% browser zoom is not measurable in headless Edge'); }
  await zoomPage.keyboard.press('Control+0');
  await context.close();
} catch (error) {
  report.failure = error instanceof Error ? error.message : String(error);
  console.log(`FAIL ${report.failure}`);
  process.exitCode = 1;
} finally {
  await browser.close();
  await client.auth.signOut({ scope: 'local' });
  fs.writeFileSync(`${output}/preview-controls-browser.json`, JSON.stringify(report, null, 2));
}

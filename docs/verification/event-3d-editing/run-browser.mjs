import { createRequire } from 'node:module';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(process.env.PLAYWRIGHT_MODULE || `${process.env.USERPROFILE}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`)); }
const out = process.env.EVENT_3D_BROWSER_OUTPUT || 'docs/verification/event-3d-editing/evidence';
fs.mkdirSync(out, { recursive: true });
const report = { status: 'RUNNING', mode: 'real local WebGL renderers, isolated fixtures; no live database writes', checks: [], pageErrors: [], externalRequests: [] };
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, hasTouch: true });
await context.route('**/*', route => { const url = new URL(route.request().url()); if (['localhost', '127.0.0.1'].includes(url.hostname)) return route.continue(); report.externalRequests.push(route.request().url()); return route.abort(); });
const page = await context.newPage();
page.on('pageerror', error => report.pageErrors.push(error.message));
const fixture = 'http://127.0.0.1:5173/docs/verification/event-3d-preview/fixture/index.html';
const button = name => page.getByRole('button', { name, exact: true });
const number = async name => Number(await page.getByRole('spinbutton', { name: `${name} in 3D`, exact: true }).inputValue());
const check = text => { report.checks.push(text); console.log(text); };
async function load(which) {
  await page.goto(`${fixture}?case=${which}`);
  await button('3D layout').click();
  await page.getByRole('region', { name: 'Event 3D editor' }).locator('canvas').waitFor({ state: 'visible', timeout: 30000 });
  await page.getByRole('combobox', { name: 'Selected 3D item' }).selectOption('chair');
  await button('Focus selection in 3D').click();
  await page.waitForTimeout(500);
  if (await button('Snap in 3D').getAttribute('aria-pressed') === 'true') await button('Snap in 3D').click();
}
async function drag(locator, dx, dy, cancel = false) {
  const box = await locator.boundingBox(); assert.ok(box, 'visible transform handle');
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.waitForFunction(() => document.querySelector('[data-event-tour="save"]')?.disabled === true);
  await page.mouse.move(x + dx, y + dy, { steps: 8 }); await page.waitForTimeout(150);
  if (cancel) await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('[data-event-tour="save"]')?.disabled === false);
}
try {
  await load('editing');
  const x = await number('X'), y = await number('Y');
  await drag(button('Chair in 3D'), 55, 25);
  assert.ok(await number('X') !== x || await number('Y') !== y);
  check('Indoor actual pointer drag changes the event item and restores Save after one commit');
  const moved = { x: await number('X'), y: await number('Y') };
  await button('Undo').click();
  await page.getByRole('combobox', { name: 'Selected 3D item' }).selectOption('chair');
  assert.equal(await number('X'), x); assert.equal(await number('Y'), y);
  await button('Redo').click(); await page.getByRole('combobox', { name: 'Selected 3D item' }).selectOption('chair');
  assert.equal(await number('X'), moved.x); assert.equal(await number('Y'), moved.y);
  check('One Undo removes the whole drag and Redo restores it in 3D');
  await button('Focus selection in 3D').click(); await page.waitForTimeout(300);
  await drag(button('Chair in 3D'), -40, 20, true);
  assert.deepEqual({ x: await number('X'), y: await number('Y') }, moved);
  check('Escape cancels the live pointer preview without changing committed coordinates');
  await button('Rotate items in 3D').click();
  const rotation = await number('Rotation');
  await drag(button('Rotate Chair handle in 3D'), 55, 35);
  assert.notEqual(await number('Rotation'), rotation);
  check('Visible rotation handle updates the plotted rotation through the actual scene');
  await button('Resize items in 3D').click();
  const size = { width: await number('Width'), depth: await number('Depth') };
  await drag(button('Resize Chair handle in 3D'), 45, 35);
  assert.ok(await number('Width') !== size.width || await number('Depth') !== size.depth);
  const final = { x: await number('X'), y: await number('Y'), width: await number('Width'), height: await number('Depth'), rotation: await number('Rotation') };
  check('Visible resize handle updates the footprint and retains valid dimensions');
  await page.screenshot({ path: `${out}/indoor-3d-editing.png` });
  await button('2D layout').click();
  const style = await page.getByTestId('event-furniture-chair').getAttribute('style');
  assert.match(style, new RegExp(`width: ${final.width}px`)); assert.match(style, new RegExp(`height: ${final.height}px`));
  await button('Save Draft').click();
  const saved = await page.evaluate(() => window.previewSavedLayout);
  for (const [key, value] of Object.entries(final)) assert.ok(Math.abs(saved.items[0][key] - value) < 0.02, `${key} synchronized on save`);
  check('3D edits remain in 2D and save with the same position, footprint and rotation');

  await load('editing-outdoor');
  const outdoorX = await number('X'); await drag(button('Chair in 3D'), 45, 20);
  assert.notEqual(await number('X'), outdoorX);
  await button('Fit map in 3D').click(); await page.waitForTimeout(300);
  await button('Add item in 3D').click();
  await button('Choose Tent').click();
  const canvasBox = await page.getByRole('region', { name: 'Event 3D editor' }).locator('canvas').boundingBox();
  await page.mouse.click(canvasBox.x + canvasBox.width * 0.55, canvasBox.y + canvasBox.height * 0.6);
  await page.waitForFunction(() => document.querySelectorAll('[aria-label="Event items in 3D preview"] li').length === 3);
  assert.equal(await page.getByRole('list', { name: 'Event items in 3D preview' }).getByRole('listitem').count(), 3);
  check('Outdoor authored coordinates support actual dragging and explicit asset placement');
  await page.getByRole('combobox', { name: 'Selected 3D item' }).selectOption('welcome');
  const labelText = page.getByRole('textbox', { name: 'Label text in 3D' });
  await labelText.fill('Check-in area');
  await page.getByRole('spinbutton', { name: 'Font size in 3D' }).fill('22'); await page.getByRole('spinbutton', { name: 'Font size in 3D' }).press('Enter');
  assert.equal(await button('Check-in area in 3D').evaluate(node => getComputedStyle(node).fontSize), '22px');
  await page.screenshot({ path: `${out}/outdoor-3d-editing.png` });
  check('Label text and font-size edits appear immediately in the actual 3D scene');

  await load('editing');
  const beforeTouch = { x: await number('X'), y: await number('Y') };
  const touch = await context.newCDPSession(page);
  let tag = await button('Chair in 3D').boundingBox();
  const first = { id: 101, x: tag.x + tag.width / 2, y: tag.y + tag.height / 2 };
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...first, x: first.x + 35, y: first.y + 15 }] });
  await page.waitForTimeout(100);
  tag = await button('Chair in 3D').boundingBox();
  const second = { id: 102, x: tag.x + tag.width / 2, y: tag.y + tag.height / 2 };
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...first, x: first.x + 35, y: first.y + 15 }, second] });
  assert.equal(await button('Save Draft').isEnabled(), true);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...first, x: first.x + 35, y: first.y + 15 }, { ...second, x: second.x + 35 }] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.deepEqual({ x: await number('X'), y: await number('Y') }, beforeTouch);
  check('Actual Chromium two-touch input cancels item editing without a replacement drag');

  await load('editing-group');
  await drag(button('Chair in 3D'), 40, 15);
  await button('Save Draft').click();
  const group = await page.evaluate(() => window.previewSavedLayout.items);
  assert.equal(group[1].x - group[0].x, 40); assert.equal(group[0].y, group[1].y);
  check('Actual 3D group drag preserves member offsets in the saved layout');
  await load('editing-group-locked');
  const lockedTag = await button('Chair in 3D').boundingBox();
  await page.mouse.move(lockedTag.x + lockedTag.width / 2, lockedTag.y + lockedTag.height / 2); await page.mouse.down(); await page.mouse.move(lockedTag.x + 60, lockedTag.y + 20); await page.mouse.up();
  await button('Save Draft').click();
  assert.deepEqual((await page.evaluate(() => window.previewSavedLayout.items)).map(item => item.x), [300, 340]);
  check('A locked group member prevents the whole group move in the actual scene');

  await page.setViewportSize({ width: 390, height: 844 }); await load('editing');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  await page.screenshot({ path: `${out}/mobile-3d-editing.png` });
  check('Editable 3D controls and map fit a 390px mobile viewport');
  await button('Toggle admin review').click(); await button('3D preview').click();
  await page.getByRole('region', { name: 'Event 3D preview' }).locator('canvas').waitFor({ state: 'visible' });
  assert.equal(await button('Add item in 3D').count(), 0); assert.equal(await button('Save Draft').count(), 0);
  await button('Toggle feedback placement').click();
  assert.equal(await button('2D layout').getAttribute('aria-pressed'), 'true'); assert.equal(await button('3D preview').isDisabled(), true);
  check('Admin stays read-only and feedback placement still requires 2D');
  assert.deepEqual(report.pageErrors, []); report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL'; report.error = error.stack || String(error);
  await page.screenshot({ path: `${out}/failure.png` }).catch(() => {}); process.exitCode = 1;
} finally { fs.writeFileSync(`${out}/browser-results.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify({ status: report.status, checks: report.checks.length, errors: report.pageErrors, error: report.error }, null, 2)); await browser.close(); }

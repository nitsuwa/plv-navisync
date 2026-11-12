import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(`${process.env.USERPROFILE}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`)); }
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  await page.route('**/*', r => ['localhost', '127.0.0.1'].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort());
  await page.route('**/__confirmation_smoke', r => r.fulfill({ contentType: 'text/html', body: '<html><body><button id="trigger">Confirmation smoke fixture</button></body></html>' }));
  const base = process.env.CONFIRMATION_SMOKE_URL || 'http://127.0.0.1:5174/';
  await page.goto(new URL('/__confirmation_smoke', base).href, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    const refresh = await import('/@react-refresh');
    refresh.default.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {};
    window.$RefreshSig$ = () => type => type;
    window.__vite_plugin_react_preamble_installed__ = true;
    await import('/src/styles/index.css');
  });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(async () => {
      const { confirmAction } = await import('/src/lib/confirmAction.ts');
      window.decision = null;
      void confirmAction({ title: 'Sign out?', message: 'End this session.', confirmLabel: 'Sign out' }).then(v => window.decision = v);
    });
    await page.getByRole('dialog', { name: 'Sign out?', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.waitForFunction(() => window.decision === false);
    await page.evaluate(async () => {
      const { confirmAction } = await import('/src/lib/confirmAction.ts');
      window.attempts = 0;
      void confirmAction({ title: 'Publish event?', message: 'Students will see this event.', confirmLabel: 'Publish', action: async () => { if (++window.attempts === 1) throw Error('Offline test'); } }).then(v => window.decision = v);
    });
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    await page.getByText(/Offline test/).waitFor();
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    await page.waitForFunction(() => window.decision === true);
    assert.equal(await page.evaluate(() => window.attempts), 2);
    console.log(`PASS ${width}px: cancel, confirm and failure/retry`);
  }
} finally { await browser.close(); }

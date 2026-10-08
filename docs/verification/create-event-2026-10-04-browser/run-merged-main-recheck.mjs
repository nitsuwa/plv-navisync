// Run one pre-reviewed UI QA runner at a time on the merged-main checkout.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const allowed = new Set([
  'run-admin-event-ui.mjs',
  'run-poster-browser.mjs',
  'run-poster-constraints.mjs',
  'run-pending-update.mjs',
  'run-admin-queue.mjs',
  'run-duplicate-browser.mjs',
  'run-preview-controls.mjs',
  'run-location-switch-after-save.mjs',
  'run-feedback-browser.mjs',
]);
const selected = process.argv[2];
if (!allowed.has(selected)) {
  console.error(`Choose one approved browser runner: ${[...allowed].join(', ')}`);
  process.exit(2);
}
const here = path.dirname(fileURLToPath(import.meta.url));
const result = spawnSync(process.execPath, [path.join(here, selected)], {
  cwd: process.cwd(),
  stdio: 'inherit',
  shell: false,
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);

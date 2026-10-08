import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
const root = process.cwd();
const require = createRequire(import.meta.url);
// TypeScript 7 exposes its native CLI, not the old JS compiler API.
const compiler = path.resolve(path.dirname(require.resolve('typescript')), '../bin/tsc');
const tempRoot = path.resolve(os.tmpdir());
const baselineRoot = fs.mkdtempSync(path.join(tempRoot, 'plv-first-batch-types-'));
function diagnostics(cwd) {
  const run = spawnSync(process.execPath, [compiler, '--noEmit'], { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (run.error || (run.status !== 0 && run.status !== 1)) throw run.error ?? new Error(run.stderr || 'TypeScript did not finish');
  const rows = [];
  for (const line of run.stdout.replaceAll('\\', '/').split(/\r?\n/)) {
    const match = /^(.*?)\(\d+,\d+\): error (TS\d+): (.*)$/.exec(line);
    if (match) rows.push({ file: match[1], code: match[2], message: match[3] });
    else if (line.trim() && rows.length) rows.at(-1).message += ` ${line.trim()}`;
  }
  return rows;
}
try {
  const archive = path.join(baselineRoot, 'head-src.tar');
  fs.writeFileSync(archive, execFileSync('git', ['archive', '--format=tar', 'HEAD', 'src', 'tsconfig.json'], { maxBuffer: 100 * 1024 * 1024 }));
  execFileSync('tar', ['-xf', archive, '-C', baselineRoot]);
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(baselineRoot, 'node_modules'), 'junction');
  const current = diagnostics(root), baseline = diagnostics(baselineRoot);
  // Native TypeScript can reorder large union descriptions across identical runs.
  // Compare diagnostic multiplicities per file/code, keeping new diagnostics intact.
  const key = d => JSON.stringify([d.file, d.code]);
  const previous = new Map();
  for (const d of baseline) previous.set(key(d), (previous.get(key(d)) ?? 0) + 1);
  const introduced = current.filter(d => {
    const remaining = previous.get(key(d)) ?? 0;
    if (!remaining) return true;
    previous.set(key(d), remaining - 1); return false;
  });
  const result = { comparison: 'diagnostic count per file and code; ignores shifted lines and native union-description ordering', baselineCount: baseline.length, currentCount: current.length, introduced };
  fs.writeFileSync('docs/verification/event-clarity-first-batch/type-comparison.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result)); process.exitCode = introduced.length ? 1 : 0;
} finally {
  // Verify the generated absolute path before recursively removing our own snapshot.
  if (path.dirname(path.resolve(baselineRoot)).toLowerCase() !== tempRoot.toLowerCase() || !path.basename(baselineRoot).startsWith('plv-first-batch-types-')) throw new Error('Unsafe temporary baseline cleanup path');
  const link = path.join(baselineRoot, 'node_modules');
  if (fs.existsSync(link)) fs.unlinkSync(link);
  fs.rmSync(baselineRoot, { recursive: true, force: true });
}

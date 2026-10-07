// Read-only provenance check for the failing incoming persistence suite.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const root = process.cwd();
const visited = new Set();
function walk(file) {
  if (visited.has(file)) return;
  visited.add(file);
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/(?:from\s*|import\s*\(|import\s*|require\s*\()(["'])(\.{1,2}\/[^"']+)\1/g)) {
    const base = path.resolve(path.dirname(file), match[2]);
    const dependency = [base, ...['.ts', '.tsx', '.js', '.mjs', '.json', '/index.ts', '/index.tsx'].map(ext => base + ext)].find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
    if (dependency && /\.[cm]?[jt]sx?$/.test(dependency)) walk(dependency);
  }
}
walk(path.resolve(root, 'src/services/__tests__/campusStructurePersistence.test.ts'));
const files = [...visited].map(file => path.relative(root, file).replaceAll('\\', '/'));
const changed = execFileSync('git', ['diff', '--name-only', 'origin/main', '--', ...files], { encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean);
const report = { comparedAgainst: execFileSync('git', ['rev-parse', 'origin/main'], { encoding: 'utf8' }).trim(), dependencyFiles: files.length, locallyChangedDependencies: changed };
fs.writeFileSync('docs/verification/create-event-2026-10-06-ui/github-sync-dependencies.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
if (changed.length) process.exitCode = 1;

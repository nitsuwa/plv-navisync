import fs from 'node:fs';
const baselinePath = 'verification-artifacts/follow-camera-qa-typescript-20261021.txt';
const currentPath = 'verification-artifacts/follow-camera-current/typescript-current.txt';
const parse = (path) => {
  const buffer = fs.readFileSync(path);
  const contents = (buffer[0] === 0xff && buffer[1] === 0xfe ? buffer.toString('utf16le') : buffer.toString('utf8')).replace(/^\uFEFF/, '');
  return contents.split(/\r?\n/).map((line) => {
    const match = line.match(/^(.*?)\(\d+,\d+\): error (TS\d+): (.*)$/);
    return match ? `${match[1]} ${match[2]} ${match[3]}` : null;
  }).filter(Boolean);
};
const baseline = parse(baselinePath);
const current = parse(currentPath);
const baselineIds = new Set(baseline);
const currentIds = new Set(current);
const added = [...new Set(current.filter((id) => !baselineIds.has(id)))];
const removed = [...new Set(baseline.filter((id) => !currentIds.has(id)))];
const touched = ['src/components/map/IndoorFloor3DRenderer.tsx', 'src/components/map/StudentCampus3DRenderer.tsx', 'src/components/map/UnifiedRoutePlannerDialog.tsx', 'src/components/map/RouteMapOverlay.tsx', 'src/pages/CampusMapPage.tsx', 'src/lib/student3dInput.ts', 'src/lib/studentRouteFlow.ts'];
const comparison = {
  baseline: baselinePath,
  current: currentPath,
  baselineDiagnosticCount: baseline.length,
  currentDiagnosticCount: current.length,
  newDiagnosticIdentities: added.length,
  resolvedDiagnosticIdentities: removed.length,
  newTouchedFileDiagnostics: added.filter((id) => touched.some((file) => id.startsWith(`${file} `))),
  newSamples: added.slice(0, 12),
};
fs.writeFileSync('verification-artifacts/follow-camera-current/typescript-diagnostic-comparison.json', `${JSON.stringify(comparison, null, 2)}\n`);
console.log(JSON.stringify(comparison, null, 2));

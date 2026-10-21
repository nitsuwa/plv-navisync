const fs = require("node:fs");
const baselinePath = "verification-artifacts/follow-camera-qa-typescript-20261021.txt";
const currentPath = "verification-artifacts/follow-camera-20261021/typescript-current-rerun.txt";
const parse = (path) => {
  const buffer = fs.readFileSync(path);
  const content = (buffer[0] === 0xff && buffer[1] === 0xfe ? buffer.toString("utf16le") : buffer.toString("utf8")).replace(/^\uFEFF/, "");
  return content.split(/\r?\n/).map((line) => {
    const match = line.match(/^(.*?)\(\d+,\d+\): error (TS\d+): (.*)$/);
    return match ? `${match[1]} ${match[2]} ${match[3]}` : null;
  }).filter(Boolean);
};
const baseline = parse(baselinePath), current = parse(currentPath);
const baselineIds = new Set(baseline), currentIds = new Set(current);
const added = [...new Set(current.filter((item) => !baselineIds.has(item)))];
const removed = [...new Set(baseline.filter((item) => !currentIds.has(item)))];
const touched = ["src/components/map/StudentCampus3DRenderer.tsx", "src/components/map/IndoorFloor3DRenderer.tsx", "src/lib/student3dInput.ts", "src/lib/student3dCameraFocus.ts", "src/lib/__tests__/student3dInput.test.ts", "src/lib/__tests__/student3dCameraFocus.test.ts", "src/lib/__tests__/studentRouteFlow.test.ts", "src/components/map/__tests__/RoutePlannerStudentUx.test.tsx", "src/pages/CampusMapPage.tsx", "src/components/map/UnifiedRoutePlannerDialog.tsx"];
const result = { baseline: baselinePath, current: currentPath, baselineDiagnosticCount: baseline.length, currentDiagnosticCount: current.length, newDiagnosticIdentities: added.length, resolvedDiagnosticIdentities: removed.length, newTouchedFileDiagnostics: added.filter(item => touched.some(file => item.startsWith(`${file} `))), newSamples: added.slice(0, 12), resolvedSamples: removed.slice(0, 12) };
fs.writeFileSync("verification-artifacts/follow-camera-20261021/typescript-diagnostic-comparison-rerun.json", `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));

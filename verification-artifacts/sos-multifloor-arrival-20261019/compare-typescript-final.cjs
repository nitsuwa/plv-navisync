const fs = require("node:fs");
const baselinePath = "verification-artifacts/assembly-point-connectivity-20261018/typescript-current.txt";
const currentPath = "verification-artifacts/sos-multifloor-arrival-20261019/typescript-current-final.txt";
const parse = (file) => {
  const buffer = fs.readFileSync(file);
  const contents = buffer[0] === 0xff && buffer[1] === 0xfe ? buffer.toString("utf16le") : buffer.toString("utf8");
  return contents.replace(/^\uFEFF/, "").split(/\r?\n/).map((line) => {
    const match = line.match(/^(.*?)\(\d+,\d+\): error (TS\d+): (.*)$/);
    return match ? `${match[1]} ${match[2]} ${match[3]}` : null;
  }).filter(Boolean);
};
const baseline = parse(baselinePath);
const current = parse(currentPath);
const baselineIds = new Set(baseline);
const currentIds = new Set(current);
const added = [...new Set(current.filter((identity) => !baselineIds.has(identity)))];
const removed = [...new Set(baseline.filter((identity) => !currentIds.has(identity)))];
const touched = ["src/lib/studentEmergencyNavigation.ts", "src/lib/studentEmergencyEvacuation.ts", "src/lib/studentRouteFlow.ts", "src/lib/routePlanner.ts", "src/components/map-builder/TestNavigationPanel.tsx", "src/lib/__tests__/smartMultiExitEvacuation.integration.test.ts", "src/lib/__tests__/smartMultiExitEvacuation.workflow.integration.test.tsx", "src/lib/__tests__/studentRouteFlow.test.ts"];
const result = {
  baseline: baselinePath,
  current: currentPath,
  baselineDiagnostics: baseline.length,
  currentDiagnostics: current.length,
  newDiagnosticIdentities: added.length,
  resolvedDiagnosticIdentities: removed.length,
  newTouchedFileDiagnostics: added.filter((identity) => touched.some((file) => identity.startsWith(`${file} `))),
  newSamples: added.slice(0, 12),
};
fs.writeFileSync("verification-artifacts/sos-multifloor-arrival-20261019/typescript-diagnostic-comparison-final.json", `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

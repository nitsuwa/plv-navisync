import fs from "node:fs";

const baselinePath = "verification-artifacts/follow-camera-qa-typescript-20261021.txt";
const currentPath = "verification-artifacts/session-stability-20261021/typescript-current-final.txt";
const parse = (path) => {
  const buffer = fs.readFileSync(path);
  const content = (buffer[0] === 0xff && buffer[1] === 0xfe ? buffer.toString("utf16le") : buffer.toString("utf8"))
    .replace(/^\uFEFF/, "");
  return content.split(/\r?\n/).map((line) => {
    const match = line.match(/^(.*?)\(\d+,\d+\): error (TS\d+): (.*)$/);
    return match ? `${match[1]} ${match[2]} ${match[3]}` : null;
  }).filter(Boolean);
};

const baseline = parse(baselinePath);
const current = parse(currentPath);
const baselineIds = new Set(baseline);
const currentIds = new Set(current);
const added = [...new Set(current.filter((item) => !baselineIds.has(item)))];
const removed = [...new Set(baseline.filter((item) => !currentIds.has(item)))];
const touched = [
  "src/contexts/StudentAuthContext.tsx",
  "src/app/App.tsx",
  "src/hooks/usePublishedCampus.ts",
  "src/hooks/__tests__/usePublishedCampus.resilience.test.tsx",
  "src/contexts/__tests__/StudentAuthContext.sessionRefresh.test.tsx",
  "src/components/map/StudentSelectedPlaceCard.tsx",
  "src/components/map/__tests__/StudentSelectedPlaceCard.roomInformation.test.tsx",
];
const comparison = {
  baseline: baselinePath,
  current: currentPath,
  baselineDiagnosticCount: baseline.length,
  currentDiagnosticCount: current.length,
  newDiagnosticIdentities: added.length,
  resolvedDiagnosticIdentities: removed.length,
  newTouchedFileDiagnostics: added.filter((item) => touched.some((file) => item.startsWith(`${file} `))),
  newSamples: added.slice(0, 12),
};

fs.writeFileSync("verification-artifacts/session-stability-20261021/typescript-diagnostic-comparison.json", `${JSON.stringify(comparison, null, 2)}\n`);
console.log(JSON.stringify(comparison, null, 2));

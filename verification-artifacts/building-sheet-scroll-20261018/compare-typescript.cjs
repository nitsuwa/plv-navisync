const fs = require("node:fs");

const baselinePath = "verification-artifacts/room-video-admin-polish-20261018/typescript-current.txt";
const currentPath = "verification-artifacts/building-sheet-scroll-20261018/typescript-current.txt";
const parse = (file) => {
  const buffer = fs.readFileSync(file);
  const text = (buffer[0] === 0xff && buffer[1] === 0xfe ? buffer.toString("utf16le") : buffer.toString("utf8"))
    .replace(/^\uFEFF/, "");
  return text.split(/\r?\n/).map((line) => {
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
const touched = [
  "src/components/map/MobileBuildingSheet.tsx",
  "src/components/map/BuildingDetailsSections.tsx",
  "src/pages/CampusMapPage.tsx",
  "src/lib/studentMapUtilityLayout.ts",
];
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

fs.writeFileSync("verification-artifacts/building-sheet-scroll-20261018/typescript-diagnostic-comparison.json", `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

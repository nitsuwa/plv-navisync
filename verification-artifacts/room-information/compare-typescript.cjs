const fs = require("node:fs");

const baselinePath = "verification-artifacts/sos-multifloor-arrival-20261019/typescript-current-final.txt";
const currentPath = "verification-artifacts/room-information/typecheck.log";
const touched = new Set([
  "src/components/map-builder/FloorEditor.tsx",
  "src/components/map-builder/FloorPropertiesPanel.tsx",
  "src/components/map-builder/RoomPhotoAdminSection.tsx",
  "src/components/map/StudentSelectedPlaceCard.tsx",
  "src/pages/CampusMapPage.tsx",
  "src/lib/mapDataAdapter.ts",
  "src/services/roomPhotoService.ts",
]);

function parse(file) {
  const buffer = fs.readFileSync(file);
  const content = (buffer[0] === 0xff && buffer[1] === 0xfe ? buffer.toString("utf16le") : buffer.toString("utf8")).replace(/^\uFEFF/, "");
  return content.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^(.*?)\((\d+),(\d+)\): error (TS\d+): (.*)$/);
    return match ? [{ path: match[1].replaceAll("\\", "/"), code: match[4], message: match[5] }] : [];
  });
}

const baseline = parse(baselinePath);
const current = parse(currentPath);
const identity = (item) => `${item.path} ${item.code} ${item.message}`;
const baselineIds = new Set(baseline.map(identity));
const currentIds = new Set(current.map(identity));
const introduced = [...new Set(current.filter((item) => !baselineIds.has(identity(item))).map(identity))];
const resolved = [...new Set(baseline.filter((item) => !currentIds.has(identity(item))).map(identity))];
const output = {
  baselinePath,
  currentPath,
  baselineDiagnostics: baseline.length,
  currentDiagnostics: current.length,
  introducedDiagnosticIdentities: introduced.length,
  resolvedDiagnosticIdentities: resolved.length,
  introducedInTouchedFiles: introduced.filter((entry) => touched.has(entry.split(" ")[0])),
  introducedSamples: introduced.slice(0, 30),
};
fs.writeFileSync("verification-artifacts/room-information/typescript-diagnostic-comparison.json", `${JSON.stringify(output, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);

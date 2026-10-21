const fs = require("node:fs");
const files = [
  "verification-artifacts/emergency-route-final/typescript-current.txt",
  "verification-artifacts/navigation-reliability-20261017/tsc-current.txt",
];
const parse = (file) => {
  const buffer = fs.readFileSync(file);
  const contents = buffer[0] === 0xff && buffer[1] === 0xfe
    ? buffer.toString("utf16le")
    : buffer.toString("utf8");
  return contents.replace(/^\uFEFF/, "").split(/\r?\n/).map((line) => {
  const match = line.match(/^(.*?)\((\d+),(\d+)\): error (TS\d+): (.*)$/);
  return match ? { path: match[1], line: Number(match[2]), col: Number(match[3]), code: match[4], message: match[5] } : null;
  }).filter(Boolean);
};
const [baseline, current] = files.map(parse);
const identity = (diagnostic) => `${diagnostic.path} ${diagnostic.code} ${diagnostic.message}`;
const baselineIds = new Set(baseline.map(identity));
const currentIds = new Set(current.map(identity));
const newIdentities = [...new Set(current.filter((diagnostic) => !baselineIds.has(identity(diagnostic))).map(identity))];
const removedIdentities = [...new Set(baseline.filter((diagnostic) => !currentIds.has(identity(diagnostic))).map(identity))];
process.stdout.write(`${JSON.stringify({
  baselineDiagnostics: baseline.length,
  currentDiagnostics: current.length,
  baselineIdentities: baselineIds.size,
  currentIdentities: currentIds.size,
  newIdentities: newIdentities.length,
  removedIdentities: removedIdentities.length,
  newSamples: newIdentities,
  removedSamples: removedIdentities.slice(0, 40),
}, null, 2)}\n`);

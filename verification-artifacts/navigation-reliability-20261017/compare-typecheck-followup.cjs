const fs = require("node:fs");

const files = [
  "verification-artifacts/emergency-route-final/typescript-current.txt",
  "verification-artifacts/navigation-reliability-20261017/tsc-final-followup-20261017.txt",
];

const parse = (file) => {
  const buffer = fs.readFileSync(file);
  const contents = buffer[0] === 0xff && buffer[1] === 0xfe
    ? buffer.toString("utf16le")
    : buffer.toString("utf8");
  return contents.replace(/^\uFEFF/, "").split(/\r?\n/).map((line) => {
  const match = line.match(/^(.*?)\(\d+,\d+\): error (TS\d+): (.*)$/);
  return match ? `${match[1]} ${match[2]} ${match[3]}` : null;
  }).filter(Boolean);
};

const [baseline, current] = files.map(parse);
const baselineIds = new Set(baseline);
const currentIds = new Set(current);
const added = [...new Set(current.filter((identity) => !baselineIds.has(identity)))];
const removed = [...new Set(baseline.filter((identity) => !currentIds.has(identity)))];

process.stdout.write(`${JSON.stringify({
  baselineDiagnostics: baseline.length,
  currentDiagnostics: current.length,
  newIdentities: added.length,
  removedIdentities: removed.length,
  newSamples: added,
  removedSamples: removed,
}, null, 2)}\n`);

const fs = require("node:fs");

const baselinePath = "verification-artifacts/navigation-reliability-20261017/tsc-final-20261017.txt";
const currentPath = "verification-artifacts/route-preview-mobile-fix/typescript-current.txt";
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

const baseline = parse(baselinePath);
const current = parse(currentPath);
const baselineIds = new Set(baseline);
const currentIds = new Set(current);
const added = [...new Set(current.filter((identity) => !baselineIds.has(identity)))];
const removed = [...new Set(baseline.filter((identity) => !currentIds.has(identity)))];
const result = {
  baseline: baselinePath,
  current: currentPath,
  baselineDiagnostics: baseline.length,
  currentDiagnostics: current.length,
  newDiagnosticIdentities: added.length,
  resolvedDiagnosticIdentities: removed.length,
  newSamples: added.slice(0, 30),
  resolvedSamples: removed.slice(0, 30),
};
fs.writeFileSync("verification-artifacts/route-preview-mobile-fix/typescript-diagnostic-comparison.json", `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

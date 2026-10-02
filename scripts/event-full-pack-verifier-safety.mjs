const fixedStaleRevision = "2000-01-01T00:00:00.000Z";

export function makeStaleRevision(actualUpdatedAt) {
  const actualTime = Date.parse(actualUpdatedAt ?? "");
  if (!Number.isFinite(actualTime)) throw new Error("The disposable probe event has no valid updated_at revision.");
  if (Date.parse(fixedStaleRevision) !== actualTime) return fixedStaleRevision;
  return "2000-01-01T00:00:01.000Z";
}

export function isExpectedPrivateRowDenial(result) {
  const error = result?.error;
  if (error) return error.code === "42501" || error.code === "PGRST301" || error.status === 401 || error.status === 403;
  return result?.data == null;
}

export function assertAllowlistedPublicEventPreview(value, path = "event") {
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertAllowlistedPublicEventPreview(child, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (["createdByUserId", "adminComment", "locationFeedback", "created_by"].includes(key)) {
      throw new Error(`Private key ${path}.${key} appeared in the public event feed.`);
    }
    if (key === "assetConfig" && child != null) {
      if (typeof child !== "object" || Array.isArray(child) || Object.keys(child).some((configKey) => configKey !== "style")) {
        throw new Error(`Non-allowlisted assetConfig appeared in the public event feed at ${path}.`);
      }
      if (child.style !== undefined && typeof child.style !== "string") {
        throw new Error(`Non-string assetConfig.style appeared in the public event feed at ${path}.`);
      }
    }
    assertAllowlistedPublicEventPreview(child, `${path}.${key}`);
  }
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

export function probeSnapshotUnchanged(before, after) {
  return JSON.stringify(canonicalize(before)) === JSON.stringify(canonicalize(after));
}

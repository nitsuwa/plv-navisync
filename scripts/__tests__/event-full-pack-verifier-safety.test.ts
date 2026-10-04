import { describe, expect, it } from "vitest";
import { isExpectedPrivateRowDenial, makeStaleRevision, probeSnapshotUnchanged } from "../event-full-pack-verifier-safety.mjs";

describe("event staging verifier safety", () => {
  it("rejects nested resolution metadata and student acknowledgement identity", async () => {
    const { assertAllowlistedPublicEventPreview } = await import('../event-full-pack-verifier-safety.mjs');
    expect(() => assertAllowlistedPublicEventPreview({ locations: [{ feedbackResolutions: {} }] })).toThrow(/Private key/);
    expect(() => assertAllowlistedPublicEventPreview({ locations: [{ addressedBy: 'owner' }] })).toThrow(/Private key/);
  });
  it("accepts an empty exact-row query or a recognized permission error as a private-row denial", () => {
    expect(isExpectedPrivateRowDenial({ data: null, error: null })).toBe(true);
    expect(isExpectedPrivateRowDenial({ data: null, error: { code: "42501" } })).toBe(true);
    expect(isExpectedPrivateRowDenial({ data: null, error: { status: 403 } })).toBe(true);
  });

  it("does not treat network, missing-relation, or returned-row results as proof of privacy", () => {
    expect(isExpectedPrivateRowDenial({ data: null, error: { code: "PGRST205" } })).toBe(false);
    expect(isExpectedPrivateRowDenial({ data: null, error: { code: "ECONNRESET" } })).toBe(false);
    expect(isExpectedPrivateRowDenial({ data: { id: "private-event" }, error: null })).toBe(false);
  });

  it("rejects non-allowlisted nested public asset configuration while retaining a string style", async () => {
    const { assertAllowlistedPublicEventPreview } = await import("../event-full-pack-verifier-safety.mjs");
    expect(typeof assertAllowlistedPublicEventPreview).toBe("function");
    const preview = {
      locations: [{ eventFurniture: [{ assetConfig: { style: "accessible", owner: true } }] }],
    };
    expect(() => assertAllowlistedPublicEventPreview(preview)).toThrow(/non-allowlisted assetConfig/i);
    expect(() => assertAllowlistedPublicEventPreview({
      locations: [{ eventFurniture: [{ assetConfig: { style: "accessible" } }] }],
    })).not.toThrow();
  });

  it("always provides a valid stale revision distinct from the fixture's current revision", () => {
    expect(Date.parse(makeStaleRevision("2026-10-02T01:30:00.000Z"))).not.toBe(Date.parse("2026-10-02T01:30:00.000Z"));
    expect(Date.parse(makeStaleRevision("2000-01-01T00:00:00.000Z"))).not.toBe(Date.parse("2000-01-01T00:00:00.000Z"));
    expect(() => makeStaleRevision("not-a-timestamp")).toThrow(/valid updated_at revision/i);
  });

  it("compares both probe metadata and relevant activity rows before accepting a stale rejection", () => {
    const before = { event: { id: "probe", metadata: { isActive: false } }, activity: [] };
    const sameState = { activity: [], event: { metadata: { isActive: false }, id: "probe" } };
    expect(probeSnapshotUnchanged(before, sameState)).toBe(true);
    expect(probeSnapshotUnchanged(before, { ...sameState, activity: [{ action: "unexpected" }] })).toBe(false);
    expect(probeSnapshotUnchanged(before, { ...sameState, event: { id: "probe", metadata: { isActive: true } } })).toBe(false);
  });
});

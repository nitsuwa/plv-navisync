import { describe, it, expect } from "vitest";
import { mergeOutdoorStack, reorderOutdoorStack, effectiveStackKey } from "../campusStack";
import type { LayerOrderAction } from "../campusLayerOrder";

interface B { id: string; name: string; zOrder?: number }
interface D { id: string; type: string; zOrder?: number }

function bldg(id: string, zOrder?: number): B {
  return zOrder === undefined ? { id, name: id } : { id, name: id, zOrder };
}
function decor(id: string, zOrder?: number): D {
  return zOrder === undefined ? { id, type: id } : { id, type: id, zOrder };
}

function mergedIds(buildings: B[], decor: D[]): string[] {
  return mergeOutdoorStack(buildings, decor).map((e) => e.item.id);
}

function run(buildings: B[], decor: D[], sel: string[], action: LayerOrderAction) {
  return reorderOutdoorStack(buildings, decor, new Set(sel), action);
}

describe("mergeOutdoorStack — legacy default stacking", () => {
  it("legacy campuses (no zOrder) render buildings below decor assets, array order kept", () => {
    const b = [bldg("b1"), bldg("b2")];
    const d = [decor("da1"), decor("da2")];
    expect(mergedIds(b, d)).toEqual(["b1", "b2", "da1", "da2"]);
  });

  it("explicit zOrder drives cross-type order (bench can be in front of a building)", () => {
    const b = [bldg("b1", 1), bldg("b2", 3)];
    const d = [decor("da1", 0), decor("da2", 2)];
    expect(mergedIds(b, d)).toEqual(["da1", "b1", "da2", "b2"]);
  });

  it("new objects without zOrder keep legacy keys (deterministic tie-break with explicit zOrders)", () => {
    // bNew (no zOrder) uses legacy building index 1, tying da1's explicit
    // zOrder 1; stable sort keeps the original array order (buildings first).
    const b = [bldg("b1", 0), bldg("bNew")]; // bNew has no zOrder
    const d = [decor("da1", 1)];
    expect(mergedIds(b, d)).toEqual(["b1", "bNew", "da1"]);
  });

  it("empty arrays merge cleanly", () => {
    expect(mergeOutdoorStack([], [])).toEqual([]);
    expect(mergeOutdoorStack([bldg("b1")], [])).toHaveLength(1);
  });
});

describe("effectiveStackKey", () => {
  it("legacy buildings use array index; legacy decor sits above them", () => {
    expect(effectiveStackKey("building", undefined, 2)).toBe(2);
    // Even a legacy decor at array index 0 sits above any realistic building index.
    expect(effectiveStackKey("decorAsset", undefined, 0)).toBeGreaterThan(effectiveStackKey("building", undefined, 99));
  });
  it("zOrder overrides the legacy defaults", () => {
    expect(effectiveStackKey("building", 5, 0)).toBe(5);
    expect(effectiveStackKey("decorAsset", 5, 7)).toBe(5);
  });
});

describe("reorderOutdoorStack — cross-type layer ordering", () => {
  it("bring to front moves the selected object above buildings AND decor", () => {
    const b = [bldg("b1"), bldg("b2"), bldg("b3")];
    const d = [decor("da1"), decor("da2")];
    const res = run(b, d, ["b1"], "front");
    expect(res.changed).toBe(true);
    expect(mergedIds(res.buildings, res.decorAssets)).toEqual(["b2", "b3", "da1", "da2", "b1"]);
  });

  it("send to back moves a decor asset below all buildings", () => {
    const b = [bldg("b1"), bldg("b2")];
    const d = [decor("da1"), decor("da2")];
    const res = run(b, d, ["da2"], "back");
    expect(mergedIds(res.buildings, res.decorAssets)).toEqual(["da2", "b1", "b2", "da1"]);
  });

  it("bring forward steps one position in the MERGED stack (decor ↔ building)", () => {
    const b = [bldg("b1"), bldg("b2")];
    const d = [decor("da1")];
    // da1 is already at the front; moving b2 forward steps it past da1.
    const res = run(b, d, ["b2"], "forward");
    expect(mergedIds(res.buildings, res.decorAssets)).toEqual(["b1", "da1", "b2"]);
  });

  it("send backward steps one position in the merged stack", () => {
    const b = [bldg("b1"), bldg("b2")];
    const d = [decor("da1")];
    // da1 (front) steps backward past b2 → [b1, da1, b2].
    const res = run(b, d, ["da1"], "backward");
    expect(mergedIds(res.buildings, res.decorAssets)).toEqual(["b1", "da1", "b2"]);
  });

  it("multi-selection moves as one block preserving internal relative order", () => {
    const b = [bldg("b1"), bldg("b2"), bldg("b3")];
    const d = [decor("da1"), decor("da2")];
    // Select b2 + da1 (mixed, non-contiguous in the merged stack [b1,b2,b3,da1,da2]).
    const res = run(b, d, ["b2", "da1"], "front");
    expect(mergedIds(res.buildings, res.decorAssets)).toEqual(["b1", "b3", "da2", "b2", "da1"]);
    // Internal relative order of the selected block preserved (b2 before da1).
    const merged = mergeOutdoorStack(res.buildings, res.decorAssets);
    const selPos = merged.map((e) => e.item.id).filter((id) => id === "b2" || id === "da1");
    expect(selPos).toEqual(["b2", "da1"]);
  });

  it("boundary no-ops return changed:false (no history entry)", () => {
    const b = [bldg("b1"), bldg("b2")];
    const d = [decor("da1")];
    // da1 is already the TOP of the merged stack.
    expect(run(b, d, ["da1"], "front").changed).toBe(false);
    expect(run(b, d, ["da1"], "forward").changed).toBe(false);
    // b1 is already the BOTTOM.
    expect(run(b, d, ["b1"], "back").changed).toBe(false);
    expect(run(b, d, ["b1"], "backward").changed).toBe(false);
    // Unknown/empty selection.
    expect(run(b, d, [], "front").changed).toBe(false);
    expect(run(b, d, ["nope"], "front").changed).toBe(false);
  });

  it("assigns explicit integer zOrder to every object on a real change (persisted, backward compatible)", () => {
    const b = [bldg("b1"), bldg("b2")];
    const d = [decor("da1")];
    const res = run(b, d, ["b1"], "front");
    expect(res.buildings.every((x) => typeof x.zOrder === "number")).toBe(true);
    expect(res.decorAssets.every((x) => typeof x.zOrder === "number")).toBe(true);
    // New merged order is [b2, da1, b1]; the arrays keep their own order and
    // each object carries the index of its merged position as zOrder.
    expect(res.buildings[0].zOrder).toBe(2); // b1 → last position (on top)
    expect(res.buildings[1].zOrder).toBe(0); // b2 → first position (on bottom)
    expect(res.decorAssets[0].zOrder).toBe(1); // da1 → middle
  });

  it("geometry and identity are untouched — only the optional zOrder is added", () => {
    const b = [bldg("b1"), bldg("b2")];
    const d = [decor("da1")];
    const res = run(b, d, ["b1"], "front");
    expect(res.buildings[0].name).toBe("b1");
    expect(res.buildings[1].name).toBe("b2");
    expect(res.decorAssets[0].type).toBe("da1");
  });

  it("no-op returns the ORIGINAL arrays (reference equality)", () => {
    const b = [bldg("b1"), bldg("b2")];
    const d = [decor("da1")];
    const res = run(b, d, ["da1"], "front");
    expect(res.buildings).toBe(b);
    expect(res.decorAssets).toBe(d);
  });
});

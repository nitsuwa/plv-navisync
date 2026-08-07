import { describe, it, expect } from "vitest";
import { reorderLayer } from "../campusLayerOrder";
import type { LayerOrderAction } from "../campusLayerOrder";

interface Item {
  id: string;
  tag?: string;
}

function items(...ids: string[]): Item[] {
  return ids.map((id) => ({ id, tag: `t-${id}` }));
}

function idsOf(list: Item[]): string[] {
  return list.map((i) => i.id);
}

function sel(...ids: string[]): Set<string> {
  return new Set(ids);
}

/** Runs every action for a given selection and returns the resulting id order. */
function run(list: Item[], selection: Set<string>, action: LayerOrderAction): string[] {
  return idsOf(reorderLayer(list, selection, action).items);
}

describe("reorderLayer — single object", () => {
  const base = items("a", "b", "c", "d");

  it("bring forward moves the object up one position", () => {
    expect(run(base, sel("b"), "forward")).toEqual(["a", "c", "b", "d"]);
    expect(run(base, sel("a"), "forward")).toEqual(["b", "a", "c", "d"]);
  });

  it("send backward moves the object down one position", () => {
    expect(run(base, sel("c"), "backward")).toEqual(["a", "c", "b", "d"]);
    expect(run(base, sel("d"), "backward")).toEqual(["a", "b", "d", "c"]);
  });

  it("bring to front moves the object above all others", () => {
    expect(run(base, sel("a"), "front")).toEqual(["b", "c", "d", "a"]);
    expect(run(base, sel("c"), "front")).toEqual(["a", "b", "d", "c"]);
  });

  it("send to back moves the object below all others", () => {
    expect(run(base, sel("d"), "back")).toEqual(["d", "a", "b", "c"]);
    expect(run(base, sel("b"), "back")).toEqual(["b", "a", "c", "d"]);
  });

  it("does not modify object properties or reuse clones (same references)", () => {
    const result = reorderLayer(base, sel("b"), "front");
    expect(result.items[3]).toBe(base[1]); // same object reference
    expect(result.items[3].tag).toBe("t-b");
  });
});

describe("reorderLayer — no-ops", () => {
  const base = items("a", "b", "c", "d");

  it("returns changed:false when already at the top (front / forward)", () => {
    expect(reorderLayer(base, sel("d"), "front").changed).toBe(false);
    expect(reorderLayer(base, sel("d"), "forward").changed).toBe(false);
  });

  it("returns changed:false when already at the bottom (back / backward)", () => {
    expect(reorderLayer(base, sel("a"), "back").changed).toBe(false);
    expect(reorderLayer(base, sel("a"), "backward").changed).toBe(false);
  });

  it("returns changed:false for an empty selection or unmatched ids", () => {
    expect(reorderLayer(base, new Set(), "front").changed).toBe(false);
    expect(reorderLayer(base, sel("zzz"), "front").changed).toBe(false);
  });

  it("returns changed:false for an empty array", () => {
    expect(reorderLayer([], sel("a"), "front").changed).toBe(false);
  });

  it("returns the ORIGINAL array reference on no-op so callers can skip work", () => {
    const r = reorderLayer(base, sel("d"), "front");
    expect(r.items).toBe(base);
    expect(r.changed).toBe(false);
  });
});

describe("reorderLayer — multi-selection ordering", () => {
  const base = items("a", "b", "c", "d", "e");

  it("bring forward moves every selected item up one step, preserving internal order", () => {
    // Contiguous block {b, c} swaps up past d as one unit.
    expect(run(base, sel("b", "c"), "forward")).toEqual(["a", "d", "b", "c", "e"]);
    // Non-contiguous {b, d}: b steps past c, d steps past e.
    expect(run(base, sel("b", "d"), "forward")).toEqual(["a", "c", "b", "e", "d"]);
  });

  it("send backward moves every selected item down one step", () => {
    expect(run(base, sel("c", "d"), "backward")).toEqual(["a", "c", "d", "b", "e"]);
    // b steps past a; e steps past d → [b, a, c, e, d]
    expect(run(base, sel("b", "e"), "backward")).toEqual(["b", "a", "c", "e", "d"]);
  });

  it("bring to front moves the block above all others, preserving internal order", () => {
    expect(run(base, sel("b", "d"), "front")).toEqual(["a", "c", "e", "b", "d"]);
    expect(run(base, sel("c", "d"), "front")).toEqual(["a", "b", "e", "c", "d"]);
  });

  it("send to back moves the block below all others, preserving internal order", () => {
    expect(run(base, sel("b", "d"), "back")).toEqual(["b", "d", "a", "c", "e"]);
    expect(run(base, sel("a", "c"), "back")).toEqual(["a", "c", "b", "d", "e"]);
  });

  it("already-at-boundary multi-selection is a no-op", () => {
    expect(reorderLayer(base, sel("d", "e"), "front").changed).toBe(false);
    expect(reorderLayer(base, sel("a", "b"), "back").changed).toBe(false);
    expect(reorderLayer(base, sel("d", "e"), "forward").changed).toBe(false);
    expect(reorderLayer(base, sel("a", "b"), "backward").changed).toBe(false);
  });

  it("selected AND unselected objects keep their relative order in every action", () => {
    for (const action of ["front", "forward", "backward", "back"] as const) {
      const out = run(base, sel("b", "d"), action);
      const unselected = out.filter((id) => !sel("b", "d").has(id));
      expect(unselected, `unselected order for ${action}`).toEqual(["a", "c", "e"]);
      const selectedIds = out.filter((id) => sel("b", "d").has(id));
      expect(selectedIds, `selected order for ${action}`).toEqual(["b", "d"]);
    }
  });
});

describe("reorderLayer — mixed building/decor arrays behave independently", () => {
  it("same action applied to two arrays keeps each array's own semantics", () => {
    const bldgs = items("b1", "b2", "b3");
    const decor = items("d1", "d2", "d3");
    const ids = sel("b1", "d3");

    const bRes = reorderLayer(bldgs, ids, "front");
    const dRes = reorderLayer(decor, ids, "front");

    // Building b1 → top; decor d3 → top.
    expect(idsOf(bRes.items)).toEqual(["b2", "b3", "b1"]);
    expect(idsOf(dRes.items)).toEqual(["d1", "d2", "d3"]);
    expect(bRes.changed).toBe(true);
    expect(dRes.changed).toBe(false); // d3 already at the front → no-op on this array

    // Only one array changing still reports changed:true on that array only.
    const d2Res = reorderLayer(decor, sel("d2"), "back");
    expect(idsOf(d2Res.items)).toEqual(["d2", "d1", "d3"]);
  });
});

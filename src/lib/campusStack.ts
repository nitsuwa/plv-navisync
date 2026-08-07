/**
 * Cross-type visual stacking for the outdoor campus canvas.
 *
 * B2 phase 2 reordered buildings and decorative assets WITHIN their own
 * arrays, so a building could never be drawn in front of a decorative asset.
 * Manual testing called that out: on a single shared outdoor canvas, a bench
 * may sit in front of part of a building, a tree behind it, a sign on top.
 *
 * Architecture (no database migration):
 *  - Both `CampusBuilding` and `CampusDecorAsset` gain an OPTIONAL `zOrder`
 *    number. The field round-trips through the existing JSON `metadata.ui`
 *    persistence, so old campus data stays valid (missing zOrder → legacy
 *    defaults below) and saved campuses keep their stacking.
 *  - Rendering merges buildings + decor assets into ONE list sorted by
 *    effective stack key, so document order == visual stacking across types.
 *  - Reordering REUSES the already-tested `reorderLayer` on the merged id
 *    list (selection treated as one rigid block, internal order preserved,
 *    no-op detection), then writes explicit integer zOrder values 0..N-1 for
 *    every object. One action → one history entry.
 *
 * Legacy default: buildings keep array order below decor assets (keys
 * 0..n-1 vs. 1e9 + index), matching the pre-B2 canvas render grouping.
 */

import { reorderLayer } from "./campusLayerOrder";
import type { LayerOrderAction } from "./campusLayerOrder";

export type OutdoorKind = "building" | "decorAsset";

/** Legacy decor assets render above legacy buildings (current behavior). */
const LEGACY_DECOR_BASE = 1_000_000_000;

/** Objects without a zOrder are ordered by (kind, array index). */
export function effectiveStackKey(kind: OutdoorKind, zOrder: number | undefined, index: number): number {
  if (typeof zOrder === "number" && Number.isFinite(zOrder)) return zOrder;
  return kind === "building" ? index : LEGACY_DECOR_BASE + index;
}

export interface OutdoorStackEntry<B, D> {
  kind: OutdoorKind;
  item: B | D;
  key: number;
}

/**
 * Merge buildings and decor assets into one render list sorted by effective
 * stacking key (lowest key = drawn first / at the back). Pure — no React/DOM.
 */
export function mergeOutdoorStack<B extends { id: string }, D extends { id: string }>(
  buildings: B[],
  decorAssets: D[]
): OutdoorStackEntry<B, D>[] {
  const entries: OutdoorStackEntry<B, D>[] = [
    ...buildings.map((item, i) => ({ kind: "building" as const, item, key: effectiveStackKey("building", (item as unknown as { zOrder?: number }).zOrder, i) })),
    ...decorAssets.map((item, i) => ({ kind: "decorAsset" as const, item, key: effectiveStackKey("decorAsset", (item as unknown as { zOrder?: number }).zOrder, i) })),
  ];
  return entries.sort((a, b) => a.key - b.key);
}

export interface ReorderOutdoorResult<B, D> {
  /** Buildings with explicit zOrder assigned (0..N-1 in the new merged order). */
  buildings: B[];
  /** Decor assets with explicit zOrder assigned. */
  decorAssets: D[];
  /** False when the action was a no-op — callers MUST NOT push history. */
  changed: boolean;
}

/**
 * Apply a layer-order action across the merged building+decor stack.
 *
 * 1. Build the current merged id list (in render order).
 * 2. Reuse `reorderLayer` on it (rigid selected block, relative order kept).
 * 3. On a real change, assign explicit integer zOrder values to every object
 *    so the saved campus carries its stacking (backward compatible: zOrder is
 *    optional and defaults are defined for objects without it).
 */
export function reorderOutdoorStack<B extends { id: string }, D extends { id: string }>(
  buildings: B[],
  decorAssets: D[],
  selectedIds: ReadonlySet<string>,
  action: LayerOrderAction
): ReorderOutdoorResult<B, D> {
  if (selectedIds.size === 0) {
    return { buildings, decorAssets, changed: false };
  }
  const merged = mergeOutdoorStack(buildings, decorAssets).map((e) => ({ id: e.item.id, kind: e.kind }));
  const result = reorderLayer(merged, selectedIds, action);
  if (!result.changed) {
    return { buildings, decorAssets, changed: false };
  }

  const buildingZ = new Map<string, number>();
  const decorZ = new Map<string, number>();
  result.items.forEach((entry, idx) => {
    (entry.kind === "building" ? buildingZ : decorZ).set(entry.id, idx);
  });

  const nextBuildings = buildings.map((b) =>
    buildingZ.has(b.id) ? { ...b, zOrder: buildingZ.get(b.id) } : b
  );
  const nextDecor = decorAssets.map((d) =>
    decorZ.has(d.id) ? { ...d, zOrder: decorZ.get(d.id) } : d
  );

  return { buildings: nextBuildings, decorAssets: nextDecor, changed: true };
}

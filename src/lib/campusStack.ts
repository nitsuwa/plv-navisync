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
 *  - Rendering merges buildings + foreground decor assets into ONE list sorted
 *    by effective stack key, while area decor stays in a separately ordered
 *    ground layer below paths and buildings.
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
import { isDecorAreaType } from "../components/map-builder/constants";

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

function isBackgroundDecorAsset(item: unknown): boolean {
  const type = (item as { type?: unknown } | null)?.type;
  return typeof type === "string" && isDecorAreaType(type);
}

function explicitStackOrder(item: unknown, fallback: number): number {
  const zOrder = (item as { zOrder?: unknown } | null)?.zOrder;
  return typeof zOrder === "number" && Number.isFinite(zOrder) ? zOrder : fallback;
}

/**
 * Return area assets in the order in which the background layer should draw
 * them.  Explicit zOrder values are honoured; legacy records retain their
 * source-array order when no value exists.
 */
export function sortOutdoorGroundAssets<D extends { id: string }>(decorAssets: D[]): D[] {
  return decorAssets
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => isBackgroundDecorAsset(item))
    .sort((a, b) => explicitStackOrder(a.item, -1000) - explicitStackOrder(b.item, -1000) || a.index - b.index)
    .map(({ item }) => item);
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
 * Apply a layer-order action across the outdoor visual layers. Buildings and
 * foreground decor share one cross-type stack; area decor is reordered within
 * the dedicated ground layer so every asset type has a visible, meaningful
 * layer-order action without allowing ground material to cover buildings.
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

  // Area assets are a dedicated ground/background layer in the canvas.  They
  // still need working layer controls, but must never be reordered through the
  // foreground building/decor stack (doing so changed zOrder without changing
  // what was drawn).  Reorder each semantic layer independently in one action:
  // foreground objects share the cross-type building stack, while Lawn,
  // Garden, Plaza, Parking, and legacy Ground Area records share their own
  // background stack.
  const background = sortOutdoorGroundAssets(decorAssets);
  const foregroundDecor = decorAssets.filter((item) => !isBackgroundDecorAsset(item));
  const selectedBackground = new Set([...selectedIds].filter((id) => background.some((item) => item.id === id)));
  const selectedForeground = new Set([...selectedIds].filter((id) =>
    buildings.some((item) => item.id === id) || foregroundDecor.some((item) => item.id === id),
  ));

  const foregroundResult = selectedForeground.size > 0
    ? reorderLayer(
      mergeOutdoorStack(buildings, foregroundDecor).map((entry) => ({ id: entry.item.id, kind: entry.kind })),
      selectedForeground,
      action,
    )
    : { items: [] as { id: string; kind: OutdoorKind }[], changed: false };
  const backgroundResult = selectedBackground.size > 0
    ? reorderLayer(background, selectedBackground, action)
    : { items: [] as D[], changed: false };

  if (!foregroundResult.changed && !backgroundResult.changed) {
    return { buildings, decorAssets, changed: false };
  }

  const buildingZ = new Map<string, number>();
  const foregroundDecorZ = new Map<string, number>();
  foregroundResult.items.forEach((entry, idx) => {
    (entry.kind === "building" ? buildingZ : foregroundDecorZ).set(entry.id, idx);
  });
  // Keep background zOrder in a separate numeric range so an area can never
  // accidentally become part of the foreground stack if it is later rendered
  // by a legacy consumer.  Canvas sorts the area layer by this value.
  const backgroundZ = new Map<string, number>();
  backgroundResult.items.forEach((item, idx) => backgroundZ.set(item.id, -1_000_000 + idx));

  const nextBuildings = buildings.map((b) =>
    buildingZ.has(b.id) ? { ...b, zOrder: buildingZ.get(b.id) } : b,
  );
  const nextDecor = decorAssets.map((d) => {
    if (foregroundDecorZ.has(d.id)) return { ...d, zOrder: foregroundDecorZ.get(d.id) };
    if (backgroundZ.has(d.id)) return { ...d, zOrder: backgroundZ.get(d.id) };
    return d;
  });

  return { buildings: nextBuildings, decorAssets: nextDecor, changed: true };
}

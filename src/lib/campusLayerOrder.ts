/**
 * Pure helpers for B2 layer ordering (bring forward / send backward /
 * bring to front / send to back) on the outdoor campus canvas.
 *
 * Data-model approach: ordering operates WITHIN each object type using array
 * order. The canvas renders `campus.buildings` and `campus.decorAssets` in
 * array order, so reordering the array changes visual stacking with NO schema
 * change, zIndex field, or migration — matching the approved B2 decision:
 * "layer ordering operates within each object type using array order; do not
 * introduce cross-type zIndex, database fields, or type-schema changes."
 * Cross-type stacking is fixed by the canvas render grouping
 * (paths → buildings → decorAssets → markers), which is unchanged.
 *
 * These functions contain no React or DOM logic so they can be unit-tested
 * directly (see src/lib/__tests__/campusLayerOrder.test.ts).
 */

export type LayerOrderAction = "front" | "forward" | "backward" | "back";

export interface ReorderResult<T extends { id: string }> {
  /** The reordered array (same item references — properties are untouched). */
  items: T[];
  /**
   * False when the action was a no-op (empty selection, nothing matched, or
   * the selection is already at the requested boundary). Callers MUST NOT
   * create an undo-history entry for no-op calls.
   */
  changed: boolean;
}

function sameOrder<T extends { id: string }>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return false;
  }
  return true;
}

/**
 * Reorder `items` so the selected objects change stacking position. Every
 * unselected object keeps its relative order, and the selected objects are
 * treated as ONE rigid block (their internal relative order is preserved).
 *
 * - `"front"`: the selected block moves above all other objects of this type
 *   (to the end of the array — the last rendered item is on top).
 * - `"back"`: the selected block moves below all other objects of this type
 *   (to the start of the array).
 * - `"forward"`: every selected item moves up exactly one position, swapping
 *   with the unselected item directly above it (standard multi-layer
 *   behavior). Both the selected items' internal order and every unselected
 *   item's relative order are preserved.
 * - `"backward"`: every selected item moves down exactly one position,
 *   swapping with the unselected item directly below it (same invariants).
 *
 * Stray ids in `selectedIds` that are not present in `items` are ignored.
 *
 * @returns `{ items, changed }` — `changed: false` (and the ORIGINAL array
 * back, so callers can cheaply detect no-ops) when nothing moved, e.g. the
 * selection is already at the front/back boundary.
 */
export function reorderLayer<T extends { id: string }>(
  items: T[],
  selectedIds: ReadonlySet<string>,
  action: LayerOrderAction
): ReorderResult<T> {
  if (selectedIds.size === 0 || items.length === 0) {
    return { items, changed: false };
  }

  const selected: T[] = [];
  const others: T[] = [];
  for (const item of items) {
    (selectedIds.has(item.id) ? selected : others).push(item);
  }
  if (selected.length === 0) {
    return { items, changed: false };
  }

  let reordered: T[];
  switch (action) {
    case "front":
      reordered = [...others, ...selected];
      break;
    case "back":
      reordered = [...selected, ...others];
      break;
    case "forward":
    case "backward": {
      reordered = [...items];
      if (action === "forward") {
        // Walk from the top down; each selected item swaps with the unselected
        // item directly above it (exactly one step per selected item).
        for (let i = reordered.length - 2; i >= 0; i--) {
          if (selectedIds.has(reordered[i].id) && !selectedIds.has(reordered[i + 1].id)) {
            const t = reordered[i];
            reordered[i] = reordered[i + 1];
            reordered[i + 1] = t;
          }
        }
      } else {
        // Walk from the bottom up; each selected item swaps with the unselected
        // item directly below it.
        for (let i = 1; i < reordered.length; i++) {
          if (selectedIds.has(reordered[i].id) && !selectedIds.has(reordered[i - 1].id)) {
            const t = reordered[i];
            reordered[i] = reordered[i - 1];
            reordered[i - 1] = t;
          }
        }
      }
      break;
    }
  }

  // Return the ORIGINAL array reference on no-ops so callers can skip work.
  const changed = !sameOrder(items, reordered);
  return { items: changed ? reordered : items, changed };
}

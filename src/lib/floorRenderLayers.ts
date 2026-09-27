/** Semantic draw bands keep local zOrder values inside their architectural role. */
const FLOOR_RENDER_LAYER_BANDS: Record<string, number> = {
  room: 100,
  furniture: 200,
  wall: 300,
  door: 400,
  open_passage: 400,
  window: 400,
  stairs: 450,
  ramp: 450,
  elevator: 450,
  exteriorZone: 460,
  entranceSteps: 470,
  entranceRamp: 470,
  label: 500,
  overlay: 600,
};

export type FloorLayerAction = "send-back" | "send-backward" | "bring-forward" | "bring-front";
export type FloorLayerActionAvailability = Record<FloorLayerAction, boolean>;

export interface LocalZOrderedItem {
  id: string;
  zOrder?: number;
}

export function getFloorLayerBand(type: string): number {
  return FLOOR_RENDER_LAYER_BANDS[type] ?? FLOOR_RENDER_LAYER_BANDS.overlay;
}

/** Sort within a semantic band. Equal/missing zOrder values retain saved array order. */
export function sortFloorItemsByLocalZ<T extends LocalZOrderedItem>(items: readonly T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (a.item.zOrder ?? 0) - (b.item.zOrder ?? 0) || a.index - b.index)
    .map(({ item }) => item);
}

/** Sort render entries first by semantic band, then by their local zOrder. */
export function sortFloorRenderEntries<T extends { type: string; item: LocalZOrderedItem }>(items: readonly T[]): T[] {
  return items
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => getFloorLayerBand(a.entry.type) - getFloorLayerBand(b.entry.type)
      || (a.entry.item.zOrder ?? 0) - (b.entry.item.zOrder ?? 0)
      || a.index - b.index)
    .map(({ entry }) => entry);
}

/** Reorder a single semantic domain, reindexing only after an actual move. */
export function reorderFloorLayerItems<T extends LocalZOrderedItem>(
  items: readonly T[],
  selectedIds: Iterable<string>,
  action: FloorLayerAction,
): T[] {
  if (items.length < 2) return items as T[];
  const selected = new Set(selectedIds);
  if (selected.size === 0) return items as T[];

  const ordered = sortFloorItemsByLocalZ(items);
  const isSelected = (item: T) => selected.has(item.id);
  let next: T[];
  if (action === "send-back" || action === "bring-front") {
    const chosen = ordered.filter(isSelected);
    const rest = ordered.filter((item) => !isSelected(item));
    next = action === "send-back" ? [...chosen, ...rest] : [...rest, ...chosen];
  } else {
    next = [...ordered];
    if (action === "bring-forward") {
      for (let index = next.length - 2; index >= 0; index -= 1) {
        if (isSelected(next[index]) && !isSelected(next[index + 1])) {
          [next[index], next[index + 1]] = [next[index + 1], next[index]];
        }
      }
    } else {
      for (let index = 1; index < next.length; index += 1) {
        if (isSelected(next[index]) && !isSelected(next[index - 1])) {
          [next[index], next[index - 1]] = [next[index - 1], next[index]];
        }
      }
    }
  }

  if (next.every((item, index) => item.id === ordered[index]?.id)) return items as T[];
  const zById = new Map(next.map((item, index) => [item.id, index]));
  return items.map((item) => {
    const zOrder = zById.get(item.id);
    return zOrder === undefined || zOrder === item.zOrder ? item : { ...item, zOrder };
  });
}

export function floorLayerActionAvailability<T extends LocalZOrderedItem>(
  items: readonly T[],
  selectedIds: Iterable<string>,
): FloorLayerActionAvailability {
  const ids = new Set(selectedIds);
  const order = sortFloorItemsByLocalZ(items).map((item) => item.id);
  const can = (action: FloorLayerAction) => {
    const next = reorderFloorLayerItems(items, ids, action);
    const nextOrder = sortFloorItemsByLocalZ(next).map((item) => item.id);
    return order.some((id, index) => id !== nextOrder[index]);
  };
  return {
    "send-back": can("send-back"),
    "send-backward": can("send-backward"),
    "bring-forward": can("bring-forward"),
    "bring-front": can("bring-front"),
  };
}

export interface LayoutItem {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}

export type LayoutAction =
  | "align-left"
  | "align-center"
  | "align-top"
  | "align-middle"
  | "distribute-horizontal"
  | "distribute-vertical";

export function snapValue(value: number, grid: number): number {
  return grid > 0 ? Math.round(value / grid) * grid : value;
}

export interface LayoutSnapGuide {
  axis: "x" | "y";
  value: number;
  kind: "grid" | "edge" | "center";
  itemId?: string;
}

export interface SnapLayoutPositionInput {
  item: LayoutItem;
  x: number;
  y: number;
  items: readonly LayoutItem[];
  selectedIds: readonly string[];
  grid?: number;
  threshold?: number;
  snapToGrid?: boolean;
}

export interface SnapLayoutPositionResult {
  x: number;
  y: number;
  guides: LayoutSnapGuide[];
}

/**
 * Finds nearby alignment targets for a moving item without ever mutating the
 * layout. Sibling edges/centers are considered before the grid so an explicit
 * relationship between event items wins when both targets are equally close.
 */
export function snapLayoutPosition({
  item,
  x,
  y,
  items,
  selectedIds,
  grid = 10,
  threshold = 6,
  snapToGrid = true,
}: SnapLayoutPositionInput): SnapLayoutPositionResult {
  const selected = new Set(selectedIds);
  const safeThreshold = Math.max(0, threshold);
  const xCandidates: Array<{ position: number; guide: LayoutSnapGuide }> = [];
  const yCandidates: Array<{ position: number; guide: LayoutSnapGuide }> = [];

  items
    .filter((candidate) => candidate.id !== item.id && !selected.has(candidate.id))
    .forEach((candidate) => {
      xCandidates.push(
        { position: candidate.x, guide: { axis: "x", value: candidate.x, kind: "edge", itemId: candidate.id } },
        { position: candidate.x - item.width, guide: { axis: "x", value: candidate.x, kind: "edge", itemId: candidate.id } },
        {
          position: candidate.x + candidate.width / 2 - item.width / 2,
          guide: { axis: "x", value: candidate.x + candidate.width / 2, kind: "center", itemId: candidate.id },
        },
        {
          position: candidate.x + candidate.width - item.width,
          guide: { axis: "x", value: candidate.x + candidate.width, kind: "edge", itemId: candidate.id },
        },
        {
          position: candidate.x + candidate.width,
          guide: { axis: "x", value: candidate.x + candidate.width, kind: "edge", itemId: candidate.id },
        },
      );
      yCandidates.push(
        { position: candidate.y, guide: { axis: "y", value: candidate.y, kind: "edge", itemId: candidate.id } },
        { position: candidate.y - item.height, guide: { axis: "y", value: candidate.y, kind: "edge", itemId: candidate.id } },
        {
          position: candidate.y + candidate.height / 2 - item.height / 2,
          guide: { axis: "y", value: candidate.y + candidate.height / 2, kind: "center", itemId: candidate.id },
        },
        {
          position: candidate.y + candidate.height - item.height,
          guide: { axis: "y", value: candidate.y + candidate.height, kind: "edge", itemId: candidate.id },
        },
        {
          position: candidate.y + candidate.height,
          guide: { axis: "y", value: candidate.y + candidate.height, kind: "edge", itemId: candidate.id },
        },
      );
    });

  if (snapToGrid && grid > 0) {
    const snappedX = snapValue(x, grid);
    const snappedY = snapValue(y, grid);
    xCandidates.push({ position: snappedX, guide: { axis: "x", value: snappedX, kind: "grid" } });
    yCandidates.push({ position: snappedY, guide: { axis: "y", value: snappedY, kind: "grid" } });
  }

  const choose = (
    requested: number,
    candidates: Array<{ position: number; guide: LayoutSnapGuide }>,
  ) => {
    return candidates
      .filter((candidate) => Math.abs(candidate.position - requested) <= safeThreshold)
      .reduce<{ position: number; guide: LayoutSnapGuide } | null>((closest, candidate) => {
        if (!closest) return candidate;
        return Math.abs(candidate.position - requested) < Math.abs(closest.position - requested)
          ? candidate
          : closest;
      }, null);
  };
  const xMatch = choose(x, xCandidates);
  const yMatch = choose(y, yCandidates);

  return {
    x: xMatch?.position ?? x,
    y: yMatch?.position ?? y,
    guides: [xMatch?.guide, yMatch?.guide].filter((guide): guide is LayoutSnapGuide => Boolean(guide)),
  };
}

export function nudgeItems<T extends LayoutItem>(
  items: readonly T[],
  ids: readonly string[],
  dx: number,
  dy: number,
  bounds: { width: number; height: number },
): T[] {
  const selected = new Set(ids);
  const moving = items.filter((item) => selected.has(item.id));
  if (moving.length === 0) return items.map((item) => ({ ...item }));

  const minDx = Math.max(...moving.map((item) => -item.x));
  const maxDx = Math.min(...moving.map((item) => bounds.width - item.width - item.x));
  const minDy = Math.max(...moving.map((item) => -item.y));
  const maxDy = Math.min(...moving.map((item) => bounds.height - item.height - item.y));
  const safeDx = Math.min(maxDx, Math.max(minDx, dx));
  const safeDy = Math.min(maxDy, Math.max(minDy, dy));

  return items.map((item) => selected.has(item.id)
    ? { ...item, x: item.x + safeDx, y: item.y + safeDy }
    : { ...item });
}

export function applyLayoutAction<T extends LayoutItem>(
  items: readonly T[],
  ids: readonly string[],
  action: LayoutAction,
): T[] {
  const selected = new Set(ids);
  const targets = items.filter((item) => selected.has(item.id));
  if (targets.length < 2) return items.map((item) => ({ ...item }));

  const selectedIds = new Set(targets.map((item) => item.id));
  const next = items.map((item) => ({ ...item }));
  const minX = Math.min(...targets.map((item) => item.x));
  const minY = Math.min(...targets.map((item) => item.y));
  const maxRight = Math.max(...targets.map((item) => item.x + item.width));
  const maxBottom = Math.max(...targets.map((item) => item.y + item.height));
  const centerX = (minX + maxRight) / 2;
  const centerY = (minY + maxBottom) / 2;

  const update = (id: string, changes: Partial<LayoutItem>) => {
    const index = next.findIndex((item) => item.id === id);
    if (index >= 0) next[index] = { ...next[index], ...changes };
  };

  if (action === "align-left") targets.forEach((item) => update(item.id, { x: minX }));
  if (action === "align-center") targets.forEach((item) => update(item.id, { x: centerX - item.width / 2 }));
  if (action === "align-top") targets.forEach((item) => update(item.id, { y: minY }));
  if (action === "align-middle") targets.forEach((item) => update(item.id, { y: centerY - item.height / 2 }));

  if (action === "distribute-horizontal" && targets.length > 2) {
    const ordered = [...targets].sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
    const span = (ordered.at(-1)!.x + ordered.at(-1)!.width) - ordered[0].x;
    const totalWidth = ordered.reduce((sum, item) => sum + item.width, 0);
    const gap = (span - totalWidth) / (ordered.length - 1);
    let cursor = ordered[0].x;
    ordered.forEach((item) => {
      update(item.id, { x: cursor });
      cursor += item.width + gap;
    });
  }
  if (action === "distribute-vertical" && targets.length > 2) {
    const ordered = [...targets].sort((a, b) => a.y - b.y || a.id.localeCompare(b.id));
    const span = (ordered.at(-1)!.y + ordered.at(-1)!.height) - ordered[0].y;
    const totalHeight = ordered.reduce((sum, item) => sum + item.height, 0);
    const gap = (span - totalHeight) / (ordered.length - 1);
    let cursor = ordered[0].y;
    ordered.forEach((item) => {
      update(item.id, { y: cursor });
      cursor += item.height + gap;
    });
  }

  // Keep this explicit so adding future actions cannot accidentally mutate an
  // item outside the requested selection.
  return next.map((item) => selectedIds.has(item.id) ? item : { ...item });
}

export function selectionBounds(
  items: readonly LayoutItem[],
  ids: readonly string[],
): { x: number; y: number; width: number; height: number } | null {
  const selected = items.filter((item) => ids.includes(item.id));
  if (selected.length === 0) return null;
  const minX = Math.min(...selected.map((item) => item.x));
  const minY = Math.min(...selected.map((item) => item.y));
  const maxRight = Math.max(...selected.map((item) => item.x + item.width));
  const maxBottom = Math.max(...selected.map((item) => item.y + item.height));
  return { x: minX, y: minY, width: maxRight - minX, height: maxBottom - minY };
}

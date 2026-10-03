export interface LayoutItem {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}

export interface LayoutRect { x: number; y: number; width: number; height: number }

/** Returns items touched by a drag rectangle, including rotated item extents. */
export function itemsIntersectingRect(items: readonly LayoutItem[], rect: LayoutRect): string[] {
  const left = Math.min(rect.x, rect.x + rect.width);
  const right = Math.max(rect.x, rect.x + rect.width);
  const top = Math.min(rect.y, rect.y + rect.height);
  const bottom = Math.max(rect.y, rect.y + rect.height);
  return items.filter((item) => {
    const radians = (item.rotation ?? 0) * Math.PI / 180;
    const halfW = (Math.abs(Math.cos(radians)) * item.width + Math.abs(Math.sin(radians)) * item.height) / 2;
    const halfH = (Math.abs(Math.sin(radians)) * item.width + Math.abs(Math.cos(radians)) * item.height) / 2;
    const centerX = item.x + item.width / 2;
    const centerY = item.y + item.height / 2;
    return centerX + halfW >= left && centerX - halfW <= right && centerY + halfH >= top && centerY - halfH <= bottom;
  }).map((item) => item.id);
}

export type LayoutAction =
  | "align-left"
  | "align-center"
  | "align-top"
  | "align-middle"
  | "distribute-horizontal"
  | "distribute-vertical";

const DISTRIBUTION_GAP = 16;

function rotatedLayoutExtent(item: LayoutItem) {
  const radians = (item.rotation ?? 0) * Math.PI / 180;
  return {
    width: Math.abs(Math.cos(radians)) * item.width + Math.abs(Math.sin(radians)) * item.height,
    height: Math.abs(Math.sin(radians)) * item.width + Math.abs(Math.cos(radians)) * item.height,
  };
}

function rotatedLayoutBounds(item: LayoutItem) {
  const extent = rotatedLayoutExtent(item);
  const centerX = item.x + item.width / 2;
  const centerY = item.y + item.height / 2;
  return {
    left: centerX - extent.width / 2,
    right: centerX + extent.width / 2,
    top: centerY - extent.height / 2,
    bottom: centerY + extent.height / 2,
    ...extent,
  };
}

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

export interface LayoutMoveSnapshot {
  anchor: LayoutItem;
  movingItems: readonly LayoutItem[];
  furnitureItems: readonly LayoutItem[];
  selectedIds: readonly string[];
  startPointer: { x: number; y: number };
  bounds: { width: number; height: number };
  grid?: number;
  threshold?: number;
  snapToGrid?: boolean;
  /** Disable both grid and sibling attraction while preserving free movement. */
  snapEnabled?: boolean;
}

export interface LayoutMoveResult {
  anchor: { x: number; y: number };
  delta: { x: number; y: number };
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
    const compareCodePoint = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
    const compareCandidates = (
      left: { position: number; guide: LayoutSnapGuide },
      right: { position: number; guide: LayoutSnapGuide },
    ) => {
      const distanceDelta = Math.abs(left.position - requested) - Math.abs(right.position - requested);
      if (distanceDelta !== 0) return distanceDelta;

      // Sibling relationships are more intentional than grid attraction.
      const leftKindRank = left.guide.kind === "grid" ? 1 : 0;
      const rightKindRank = right.guide.kind === "grid" ? 1 : 0;
      if (leftKindRank !== rightKindRank) return leftKindRank - rightKindRank;

      const itemIdDelta = compareCodePoint(left.guide.itemId ?? "", right.guide.itemId ?? "");
      if (itemIdDelta !== 0) return itemIdDelta;

      const leftEdgeRank = left.guide.kind === "edge" ? 0 : 1;
      const rightEdgeRank = right.guide.kind === "edge" ? 0 : 1;
      if (leftEdgeRank !== rightEdgeRank) return leftEdgeRank - rightEdgeRank;

      if (left.position !== right.position) return left.position - right.position;
      return left.guide.value - right.guide.value;
    };

    return candidates
      .filter((candidate) => Math.abs(candidate.position - requested) <= safeThreshold)
      .reduce<{ position: number; guide: LayoutSnapGuide } | null>((closest, candidate) => {
        if (!closest || compareCandidates(candidate, closest) < 0) return candidate;
        return closest;
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

/**
 * Resolve an absolute pointer sample against immutable gesture-start geometry.
 * This prevents drag movement from accumulating rounding and render-lag errors
 * when snapping or React rendering occurs between pointer samples.
 */
export function resolveLayoutMoveFromSnapshot(
  snapshot: LayoutMoveSnapshot,
  pointer: { x: number; y: number },
): LayoutMoveResult {
  const requestedX = snapshot.anchor.x + pointer.x - snapshot.startPointer.x;
  const requestedY = snapshot.anchor.y + pointer.y - snapshot.startPointer.y;
  const snapped = snapshot.snapEnabled !== false && snapshot.movingItems.length === 1
    ? snapLayoutPosition({
      item: snapshot.anchor,
      x: requestedX,
      y: requestedY,
      items: snapshot.furnitureItems,
      selectedIds: snapshot.selectedIds,
      grid: snapshot.grid,
      threshold: snapshot.threshold,
      snapToGrid: snapshot.snapToGrid,
    })
    : { x: requestedX, y: requestedY, guides: [] };

  const movingItems = snapshot.movingItems;
  if (movingItems.length === 0) {
    return { anchor: { x: snapshot.anchor.x, y: snapshot.anchor.y }, delta: { x: 0, y: 0 }, guides: [] };
  }

  const requestedDeltaX = snapped.x - snapshot.anchor.x;
  const requestedDeltaY = snapped.y - snapshot.anchor.y;
  // Include the gesture origin in the legal interval. This preserves an
  // existing malformed placement for the first frame instead of repairing it
  // by teleporting it to the boundary as soon as the pointer moves.
  const axisLimits = (items: readonly LayoutItem[], axis: "x" | "y", limit: number) => {
    const limits = items.map((item) => {
      const position = axis === "x" ? item.x : item.y;
      const size = axis === "x" ? item.width : item.height;
      const lower = -position;
      const upper = limit - size - position;
      if (size > limit) {
        // An oversized legacy item cannot be fully contained. Keep the origin
        // reachable while allowing it to move far enough to recover visibility.
        return { min: Math.min(0, lower, upper), max: Math.max(0, lower, upper) };
      }
      return {
        min: position < 0 ? 0 : lower,
        max: position + size > limit ? 0 : upper,
      };
    });
    const min = Math.max(...limits.map((value) => value.min));
    const max = Math.min(...limits.map((value) => value.max));
    return { min: Math.min(min, 0), max: Math.max(max, 0) };
  };
  const xLimits = axisLimits(movingItems, "x", snapshot.bounds.width);
  const yLimits = axisLimits(movingItems, "y", snapshot.bounds.height);
  const deltaX = Math.min(xLimits.max, Math.max(xLimits.min, requestedDeltaX));
  const deltaY = Math.min(yLimits.max, Math.max(yLimits.min, requestedDeltaY));

  return {
    anchor: { x: snapshot.anchor.x + deltaX, y: snapshot.anchor.y + deltaY },
    delta: { x: deltaX, y: deltaY },
    guides: snapped.guides.filter((guide) => {
      if (guide.axis === "x") return Math.abs(deltaX - requestedDeltaX) < 0.0001;
      return Math.abs(deltaY - requestedDeltaY) < 0.0001;
    }),
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
  bounds?: { width: number; height: number },
): T[] {
  const selected = new Set(ids);
  const targets = items.filter((item) => selected.has(item.id));
  if (targets.length < 2) return items.map((item) => ({ ...item }));

  const selectedIds = new Set(targets.map((item) => item.id));
  const next = items.map((item) => ({ ...item }));
  const visualBounds = targets.map((item) => ({ item, bounds: rotatedLayoutBounds(item) }));

  const update = (id: string, changes: Partial<LayoutItem>) => {
    const index = next.findIndex((item) => item.id === id);
    if (index >= 0) next[index] = { ...next[index], ...changes };
  };

  if (action === "align-left") {
    const largestExtent = Math.max(...visualBounds.map(({ bounds }) => bounds.width));
    const requestedLeft = Math.min(...visualBounds.map(({ bounds }) => bounds.left));
    const left = bounds
      ? Math.max(0, Math.min(requestedLeft, bounds.width - largestExtent))
      : requestedLeft;
    visualBounds.forEach(({ item, bounds: itemBounds }) => update(item.id, {
      x: item.x + left - itemBounds.left,
    }));
  }
  if (action === "align-center") {
    const largestExtent = Math.max(...visualBounds.map(({ bounds }) => bounds.width));
    const minLeft = Math.min(...visualBounds.map(({ bounds }) => bounds.left));
    const maxRight = Math.max(...visualBounds.map(({ bounds }) => bounds.right));
    const requestedCenter = (minLeft + maxRight) / 2;
    const centerX = bounds
      ? largestExtent > bounds.width
        ? bounds.width / 2
        : Math.max(largestExtent / 2, Math.min(requestedCenter, bounds.width - largestExtent / 2))
      : requestedCenter;
    targets.forEach((item) => update(item.id, { x: centerX - item.width / 2 }));
  }
  if (action === "align-top") {
    const largestExtent = Math.max(...visualBounds.map(({ bounds }) => bounds.height));
    const requestedTop = Math.min(...visualBounds.map(({ bounds }) => bounds.top));
    const top = bounds
      ? Math.max(0, Math.min(requestedTop, bounds.height - largestExtent))
      : requestedTop;
    visualBounds.forEach(({ item, bounds: itemBounds }) => update(item.id, {
      y: item.y + top - itemBounds.top,
    }));
  }
  if (action === "align-middle") {
    const largestExtent = Math.max(...visualBounds.map(({ bounds }) => bounds.height));
    const minTop = Math.min(...visualBounds.map(({ bounds }) => bounds.top));
    const maxBottom = Math.max(...visualBounds.map(({ bounds }) => bounds.bottom));
    const requestedCenter = (minTop + maxBottom) / 2;
    const centerY = bounds
      ? largestExtent > bounds.height
        ? bounds.height / 2
        : Math.max(largestExtent / 2, Math.min(requestedCenter, bounds.height - largestExtent / 2))
      : requestedCenter;
    targets.forEach((item) => update(item.id, { y: centerY - item.height / 2 }));
  }

  const distribute = (axis: "x" | "y") => {
    const horizontal = axis === "x";
    const measured = targets.map((item) => {
      const extent = rotatedLayoutExtent(item);
      const centerX = item.x + item.width / 2;
      const centerY = item.y + item.height / 2;
      const size = horizontal ? extent.width : extent.height;
      const crossSize = horizontal ? extent.height : extent.width;
      const center = horizontal ? centerX : centerY;
      return { item, size, crossSize, start: center - size / 2, end: center + size / 2, center };
    }).sort((a, b) => a.start - b.start || (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0));

    const currentStart = Math.min(...measured.map((entry) => entry.start));
    const currentEnd = Math.max(...measured.map((entry) => entry.end));
    const totalSize = measured.reduce((sum, entry) => sum + entry.size, 0);
    const axisLimit = bounds ? (horizontal ? bounds.width : bounds.height) : undefined;
    if (axisLimit !== undefined && totalSize > axisLimit) return;

    // Grow tightly selected items to a clear, even row/column instead of
    // calculating a negative gap that makes assets overlap.
    const desiredSpan = Math.max(currentEnd - currentStart, totalSize + DISTRIBUTION_GAP * (measured.length - 1));
    const span = axisLimit === undefined ? desiredSpan : Math.min(desiredSpan, axisLimit);
    const gap = Math.max(0, (span - totalSize) / (measured.length - 1));
    const currentCenter = (currentStart + currentEnd) / 2;
    const requestedStart = currentCenter - span / 2;
    const start = axisLimit === undefined
      ? requestedStart
      : Math.max(0, Math.min(requestedStart, axisLimit - span));

    const crossLimit = bounds ? (horizontal ? bounds.height : bounds.width) : undefined;
    const crossStart = Math.min(...measured.map((entry) => entry.center - entry.crossSize / 2));
    const crossEnd = Math.max(...measured.map((entry) => entry.center + entry.crossSize / 2));
    const largestCrossHalf = Math.max(...measured.map((entry) => entry.crossSize / 2));
    const crossCenter = crossLimit === undefined
      ? (crossStart + crossEnd) / 2
      : crossLimit < largestCrossHalf * 2
        ? crossLimit / 2
        : Math.max(largestCrossHalf, Math.min((crossStart + crossEnd) / 2, crossLimit - largestCrossHalf));

    let cursor = start;
    measured.forEach(({ item, size }) => {
      const itemCenterX = horizontal ? cursor + size / 2 : crossCenter;
      const itemCenterY = horizontal ? crossCenter : cursor + size / 2;
      update(item.id, { x: itemCenterX - item.width / 2, y: itemCenterY - item.height / 2 });
      cursor += size + gap;
    });
  };

  if (action === "distribute-horizontal") distribute("x");
  if (action === "distribute-vertical") distribute("y");

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

import { navAlignSnap, type NavAlignGuide } from "./indoorNavigationGraph";

export interface NavigationAlignmentCandidate {
  id?: string;
  x: number;
  y: number;
}

interface IndexedCandidate {
  candidate: NavigationAlignmentCandidate;
  order: number;
}

export interface NavigationAlignmentIndex {
  candidates: NavigationAlignmentCandidate[];
  byX: IndexedCandidate[];
  byY: IndexedCandidate[];
}

export function createNavigationAlignmentIndex(
  candidates: NavigationAlignmentCandidate[],
): NavigationAlignmentIndex {
  const indexed = candidates.map((candidate, order) => ({ candidate, order }));
  return {
    candidates,
    byX: [...indexed].sort((a, b) => a.candidate.x - b.candidate.x || a.order - b.order),
    byY: [...indexed].sort((a, b) => a.candidate.y - b.candidate.y || a.order - b.order),
  };
}

function lowerBound(items: IndexedCandidate[], value: number, axis: "x" | "y"): number {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (items[mid].candidate[axis] < value) low = mid + 1;
    else high = mid;
  }
  return low;
}

/**
 * Run the existing alignment resolver against only candidates able to align
 * either axis within the threshold. The authored order is restored before
 * delegating, preserving navAlignSnap's connected-first and tie behavior.
 */
export function navAlignSnapIndexed(
  point: { x: number; y: number },
  index: NavigationAlignmentIndex,
  threshold: number,
  connectedIds?: Set<string>,
  excludeId?: string,
): { x: number; y: number; guides: NavAlignGuide[] } {
  const selected = new Set<number>();
  const collectRange = (items: IndexedCandidate[], value: number, axis: "x" | "y") => {
    const start = lowerBound(items, value - threshold, axis);
    for (let i = start; i < items.length && items[i].candidate[axis] <= value + threshold; i += 1) {
      const candidate = items[i].candidate;
      if (candidate.id !== excludeId) selected.add(items[i].order);
    }
  };
  collectRange(index.byX, point.x, "x");
  collectRange(index.byY, point.y, "y");
  if (selected.size === 0) return { ...point, guides: [] };
  const nearby = [...selected].sort((a, b) => a - b).map((order) => index.candidates[order]);
  return navAlignSnap(point, nearby, threshold, connectedIds);
}

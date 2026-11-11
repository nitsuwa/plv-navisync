export type PreviousDiscoverTourTarget =
  | { kind: "building"; index: number }
  | { kind: "none" };

/** Move backward through the ordered published stops, wrapping from the first stop to the last. */
export function previousDiscoverTourTarget(index: number, stopCount: number): PreviousDiscoverTourTarget {
  if (!Number.isInteger(stopCount) || stopCount <= 0) return { kind: "none" };
  if (!Number.isInteger(index)) return { kind: "none" };
  return { kind: "building", index: ((index - 1) % stopCount + stopCount) % stopCount };
}

import type { Campus, FloorPlan } from "../components/map-builder/types";

/** Collect identity-shaped strings from a campus/building graph for fresh-ID allocators. */
export function collectIdentityIds(value: unknown): Set<string> {
  const ids = new Set<string>();
  const visited = new WeakSet<object>();
  const identityKey = /(?:^id$|Id$|Ids$|_id$|_ids$)/i;
  const visit = (current: unknown, key = "") => {
    if (typeof current === "string") {
      if (identityKey.test(key) && current) ids.add(current);
      return;
    }
    if (!current || typeof current !== "object") return;
    if (visited.has(current)) return;
    visited.add(current);
    if (Array.isArray(current)) {
      current.forEach((item) => visit(item, key));
      return;
    }
    Object.entries(current as Record<string, unknown>).forEach(([childKey, child]) => visit(child, childKey));
  };
  visit(value);
  return ids;
}

export function physicalSaveErrorMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error ?? "The save was rejected.");
  if (/(?:T5 persistence verification|ID ownership collision|ID collision|ownership collision|campus save verification failed)/i.test(detail)) {
    return "Some floor content could not be saved safely. Your changes are still preserved. Please try again.";
  }
  return detail;
}

export const PHYSICAL_FLOOR_COLLECTIONS = [
  "rooms", "paths", "walls", "doors", "windows", "furniture", "stairs", "ramps", "elevators", "labels",
  "exteriorZones", "entranceSteps", "entranceRamps", "extensions",
] as const;

export type PhysicalFloorCounts = Record<(typeof PHYSICAL_FLOOR_COLLECTIONS)[number], number>;

export function physicalFloorCounts(floor: Partial<FloorPlan>): PhysicalFloorCounts {
  return Object.fromEntries(PHYSICAL_FLOOR_COLLECTIONS.map((key) => [key, Array.isArray(floor[key]) ? floor[key]!.length : 0])) as PhysicalFloorCounts;
}

const FLOOR_COMPARE_PRECISION = 6;

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return `__non_finite_${String(value)}__`;
    const rounded = Number(value.toFixed(FLOOR_COMPARE_PRECISION));
    return Object.is(rounded, -0) ? 0 : rounded;
  }
  if (value && typeof value === "object") {
    // JSON-backed editor state treats an omitted optional value and null as
    // the same unset value. Keep every authored non-null field in the check.
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined && item !== null)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonicalValue(item)]));
  }
  return value;
}

function canonicalWall(wall: FloorPlan["walls"][number]): unknown {
  const detached = { ...wall } as Record<string, unknown>;
  // The persisted wall geometry is x1/y1/x2/y2. Older editor state can also
  // carry accidental non-numeric x/y fields; JSON turns NaN/Infinity into
  // null and hydration intentionally removes every non-finite value. These
  // fields are not wall geometry and must not make T6 reject an identical Floor.
  for (const key of ["x", "y"] as const) {
    const value = detached[key];
    if (!Number.isFinite(value as number)) delete detached[key];
  }
  return canonicalValue(detached);
}

/** Canonical representation of persisted authored Floor state. Collection
 * order is irrelevant, but point/vertex order remains meaningful. */
export function canonicalPersistedFloorSnapshot(floor: Partial<FloorPlan>): unknown {
  const collections = Object.fromEntries(PHYSICAL_FLOOR_COLLECTIONS.map((key) => [
    key,
    [...(Array.isArray(floor[key]) ? floor[key]! : [])]
      .sort((a, b) => String(a.id ?? "").localeCompare(String(b.id ?? "")))
      .map((item) => key === "walls" ? canonicalWall(item as FloorPlan["walls"][number]) : canonicalValue(item)),
  ]));
  const settings = {
    id: floor.id,
    buildingId: floor.buildingId,
    number: floor.number,
    label: floor.label,
    canvasW: floor.canvasW,
    canvasH: floor.canvasH,
    backgroundColor: floor.backgroundColor,
    appearance: floor.appearance,
    showGrid: floor.showGrid,
    gridSize: floor.gridSize,
    showWallJunctions: floor.showWallJunctions,
    backgroundImage: floor.backgroundImage,
    calibration: floor.calibration,
  };
  return canonicalValue({ settings, collections });
}

/**
 * Stable visual/physical signature for the exact collections persisted as
 * Floor data. It intentionally excludes campus navigation graph state.
 */
export function physicalFloorSignature(floor: Partial<FloorPlan>): string {
  return JSON.stringify(canonicalPersistedFloorSnapshot(floor));
}

export function physicalFloorMismatch(expected: Partial<FloorPlan>, actual: Partial<FloorPlan>, stage: string): string | null {
  const expectedSnapshot = canonicalPersistedFloorSnapshot(expected);
  const actualSnapshot = canonicalPersistedFloorSnapshot(actual);
  if (JSON.stringify(expectedSnapshot) === JSON.stringify(actualSnapshot)) return null;
  const difference = firstDifference(expectedSnapshot, actualSnapshot, "");
  const detail = difference
    ? `first difference at ${difference.path}: expected ${displayValue(difference.expected)}, hydrated ${displayValue(difference.actual)} (material: true)`
    : "canonical physical state differs";
  return `Floor ${stage} verification failed for "${expected.label ?? expected.id ?? "unknown"}" (${expected.id ?? "unknown id"}): ${detail}.`;
}

function firstDifference(expected: unknown, actual: unknown, path: string): { path: string; expected: unknown; actual: unknown } | null {
  if (Object.is(expected, actual)) return null;
  if (Array.isArray(expected) && Array.isArray(actual)) {
    const length = Math.max(expected.length, actual.length);
    for (let index = 0; index < length; index += 1) {
      const left = expected[index];
      const right = actual[index];
      if (index >= expected.length || index >= actual.length) {
        const present = (left ?? right) as { id?: unknown } | undefined;
        const itemPath = present && typeof present === "object" && typeof present.id === "string"
          ? `${path}[id=${present.id}]`
          : `${path}[${index}]`;
        return { path: itemPath, expected: left, actual: right };
      }
      const id = left && right && typeof left === "object" && typeof right === "object"
        && "id" in left && "id" in right && left.id === right.id
        ? `[id=${String(left.id)}]`
        : `[${index}]`;
      const difference = firstDifference(left, right, `${path}${id}`);
      if (difference) return difference;
    }
    return null;
  }
  if (expected && actual && typeof expected === "object" && typeof actual === "object") {
    const left = expected as Record<string, unknown>;
    const right = actual as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    for (const key of keys) {
      if (!(key in left) || !(key in right)) return { path: path ? `${path}.${key}` : key, expected: left[key], actual: right[key] };
      const difference = firstDifference(left[key], right[key], path ? `${path}.${key}` : key);
      if (difference) return difference;
    }
    return null;
  }
  return { path: path || "<root>", expected, actual };
}

function displayValue(value: unknown): string {
  if (value === undefined) return "<missing>";
  const text = JSON.stringify(value);
  return text === undefined ? String(value) : text;
}

export function replaceFloorInCampus(campus: Campus, floor: FloorPlan): Campus {
  let found = false;
  const buildings = campus.buildings.map((building) => {
    if (building.id !== floor.buildingId) return building;
    return {
      ...building,
      floors: building.floors.map((candidate) => {
        if (candidate.id !== floor.id) return candidate;
        found = true;
        return structuredClone(floor);
      }),
    };
  });
  if (!found) throw new Error(`The active Floor "${floor.id}" is missing from the current Campus save candidate.`);
  return { ...campus, buildings };
}

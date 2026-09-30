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

const PERSISTED_FLOOR_ELEMENT_COLLECTIONS = [
  "rooms", "paths", "walls", "doors", "windows", "furniture", "stairs", "ramps", "elevators", "labels",
] as const;

type PersistedFloorElementCollection = typeof PERSISTED_FLOOR_ELEMENT_COLLECTIONS[number] | "eventOverlays";

export interface RepairedFloorElementIdentity {
  collection: PersistedFloorElementCollection;
  scope: "Floor" | "Campus";
  oldId: string;
  newId: string;
  name?: string;
  buildingId: string;
  buildingName: string;
  floorId: string;
  floorLabel: string;
}

const PERSISTED_ELEMENT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Repair malformed legacy map-element IDs once, before serialization. Floor
 * physical IDs are changed together with known Room/Door/Wall/path and
 * navigation references. Legacy Event Organizer IDs are also repaired while
 * retaining the complete event payload. Navigation node and edge IDs are kept.
 */
export function repairInvalidFloorMapElementIds(campus: Campus): {
  campus: Campus;
  repairs: RepairedFloorElementIdentity[];
} {
  type ElementRecord = {
    collection: PersistedFloorElementCollection;
    scope: "Floor" | "Campus";
    item: Record<string, unknown>;
    oldId: string;
    buildingId: string;
    buildingName: string;
    floorId: string;
    floorLabel: string;
  };

  const records: ElementRecord[] = [];
  for (const building of campus.buildings ?? []) {
    for (const floor of building.floors ?? []) {
      for (const collection of PERSISTED_FLOOR_ELEMENT_COLLECTIONS) {
        const items = (floor as unknown as Record<string, unknown>)[collection];
        if (!Array.isArray(items)) continue;
        for (const rawItem of items) {
          if (!rawItem || typeof rawItem !== "object") continue;
          const item = rawItem as Record<string, unknown>;
          const oldId = typeof item.id === "string" ? item.id : "";
          if (PERSISTED_ELEMENT_UUID.test(oldId)) continue;
          records.push({
            collection,
            scope: "Floor",
            item,
            oldId,
            buildingId: building.id,
            buildingName: building.name || building.code || building.id,
            floorId: floor.id,
            floorLabel: floor.label || floor.id,
          });
        }
      }
    }
  }
  const buildingsById = new Map((campus.buildings ?? []).map((building) => [building.id, building]));
  for (const overlay of campus.eventOverlays ?? []) {
    const oldId = typeof overlay.id === "string" ? overlay.id : "";
    if (PERSISTED_ELEMENT_UUID.test(oldId)) continue;
    const building = overlay.locationRef?.buildingId
      ? buildingsById.get(overlay.locationRef.buildingId)
      : undefined;
    records.push({
      collection: "eventOverlays",
      scope: "Campus",
      item: overlay as unknown as Record<string, unknown>,
      oldId,
      buildingId: building?.id ?? "",
      buildingName: building?.name || building?.code || building?.id || "Campus",
      floorId: "",
      floorLabel: "",
    });
  }
  if (records.length === 0) return { campus, repairs: [] };

  const byInvalidId = new Map<string, ElementRecord[]>();
  for (const record of records) {
    if (!record.oldId) continue;
    const matches = byInvalidId.get(record.oldId) ?? [];
    matches.push(record);
    byInvalidId.set(record.oldId, matches);
  }
  const ambiguous = [...byInvalidId.entries()].filter(([, matches]) => matches.length > 1);
  if (ambiguous.length > 0) {
    const details = ambiguous.flatMap(([id, matches]) => matches.map((record) => {
      const itemName = [record.item.name, record.item.title, record.item.label, record.item.text]
        .find((value): value is string => typeof value === "string" && value.trim().length > 0);
      const name = itemName ? ` '${itemName.trim()}'` : "";
      return `${record.collection.replace(/s$/, "")}${name} on ${record.floorLabel} in ${record.buildingName} (ID '${id}')`;
    }));
    throw new Error(`Map element IDs cannot be repaired safely because an invalid ID is shared by multiple objects: ${details.join("; ")}.`);
  }

  const reservedIds = new Set<string>();
  const reserveItems = (items: unknown) => {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      if (item && typeof item === "object" && typeof (item as Record<string, unknown>).id === "string") {
        reservedIds.add((item as Record<string, string>).id);
      }
    }
  };
  for (const building of campus.buildings ?? []) {
    reservedIds.add(building.id);
    for (const floor of building.floors ?? []) {
      reservedIds.add(floor.id);
      for (const collection of PERSISTED_FLOOR_ELEMENT_COLLECTIONS) {
        reserveItems((floor as unknown as Record<string, unknown>)[collection]);
      }
    }
  }
  for (const collection of ["markers", "paths", "routes", "accessibilityFeatures", "assemblyPoints", "decorAssets", "eventOverlays"] as const) {
    reserveItems((campus as unknown as Record<string, unknown>)[collection]);
  }
  const idRemap = new Map<string, string>();
  const repairedIdsByItem = new Map<ElementRecord["item"], string>();
  const repairs: RepairedFloorElementIdentity[] = records.map((record) => {
    let newId = "";
    do {
      if (typeof globalThis.crypto?.randomUUID !== "function") {
        throw new Error("A secure UUID generator is unavailable; Floor object identity repair was not applied.");
      }
      newId = globalThis.crypto.randomUUID();
    } while (reservedIds.has(newId));
    reservedIds.add(newId);
    if (record.oldId) idRemap.set(record.oldId, newId);
    repairedIdsByItem.set(record.item, newId);
    const itemName = [record.item.name, record.item.title, record.item.label, record.item.text]
      .find((value): value is string => typeof value === "string" && value.trim().length > 0);
    return {
      collection: record.collection,
      scope: record.scope,
      oldId: record.oldId,
      newId,
      name: itemName?.trim(),
      buildingId: record.buildingId,
      buildingName: record.buildingName,
      floorId: record.floorId,
      floorLabel: record.floorLabel,
    };
  });
  const remap = (value: unknown) => typeof value === "string" ? idRemap.get(value) ?? value : value;

  const buildings = (campus.buildings ?? []).map((building) => ({
    ...building,
    floors: (building.floors ?? []).map((floor) => {
      const updated = { ...floor } as typeof floor;
      for (const collection of PERSISTED_FLOOR_ELEMENT_COLLECTIONS) {
        const items = (floor as unknown as Record<string, unknown>)[collection];
        if (!Array.isArray(items)) continue;
        const mapped = items.map((rawItem) => {
          if (!rawItem || typeof rawItem !== "object") return rawItem;
          const item = rawItem as Record<string, unknown>;
          const repairedId = repairedIdsByItem.get(item);
          const next = { ...item, ...(repairedId ? { id: repairedId } : {}) };
          if (collection === "rooms") {
            if (typeof item.accessDoorId === "string" && idRemap.has(item.accessDoorId)) next.accessDoorId = remap(item.accessDoorId);
            if (Array.isArray(item.accessDoorIds) && item.accessDoorIds.some((id) => typeof id === "string" && idRemap.has(id))) {
              next.accessDoorIds = item.accessDoorIds.map(remap);
            }
          }
          if ((collection === "doors" || collection === "windows") && typeof item.wallId === "string" && idRemap.has(item.wallId)) {
            next.wallId = remap(item.wallId);
          }
          if (collection === "walls") {
            for (const key of ["startAnchor", "endAnchor"] as const) {
              const anchor = item[key];
              if (anchor && typeof anchor === "object") {
                const value = anchor as Record<string, unknown>;
                if (typeof value.roomId === "string" && idRemap.has(value.roomId)) next[key] = { ...value, roomId: remap(value.roomId) };
              }
            }
          }
          return next;
        });
        (updated as unknown as Record<string, unknown>)[collection] = mapped;
      }
      return updated;
    }),
  }));

  const remapNodeReference = (node: Campus["navNodes"] extends (infer T)[] | undefined ? T : never) => {
    const updated = { ...node } as typeof node;
    let changed = false;
    for (const field of ["roomId", "doorId", "stairId", "rampId", "elevatorId"] as const) {
      const value = node[field];
      if (typeof value === "string" && idRemap.has(value)) {
        (updated as Record<string, unknown>)[field] = remap(value);
        changed = true;
      }
    }
    if (node.generatedFromPathVertices?.some((vertex) => idRemap.has(vertex.pathId))) {
      updated.generatedFromPathVertices = node.generatedFromPathVertices.map((vertex) => ({ ...vertex, pathId: remap(vertex.pathId) as string }));
      changed = true;
    }
    return changed ? updated : node;
  };
  const navNodes = campus.navNodes?.map(remapNodeReference);
  const navEdges = campus.navEdges?.map((edge) => edge.generatedFromPathIds?.some((id) => idRemap.has(id))
    ? { ...edge, generatedFromPathIds: edge.generatedFromPathIds.map((id) => remap(id) as string) }
    : edge);
  const eventOverlays = campus.eventOverlays?.map((overlay) => {
    const normalizedId = repairedIdsByItem.get(overlay as unknown as Record<string, unknown>);
    let changed = Boolean(normalizedId);
    const locationRef = overlay.locationRef?.roomId && idRemap.has(overlay.locationRef.roomId)
      ? { ...overlay.locationRef, roomId: remap(overlay.locationRef.roomId) as string }
      : overlay.locationRef;
    if (locationRef !== overlay.locationRef) changed = true;
    const locations = overlay.locations?.map((location) => {
      const nextRef = location.locationRef.roomId && idRemap.has(location.locationRef.roomId)
        ? { ...location.locationRef, roomId: remap(location.locationRef.roomId) as string }
        : location.locationRef;
      if (nextRef === location.locationRef) return location;
      changed = true;
      return { ...location, locationRef: nextRef };
    });
    return changed ? {
      ...overlay,
      ...(normalizedId ? { id: normalizedId } : {}),
      ...(locationRef ? { locationRef } : {}),
      ...(locations ? { locations } : {}),
    } : overlay;
  });

  return {
    campus: { ...campus, buildings, ...(navNodes ? { navNodes } : {}), ...(navEdges ? { navEdges } : {}), ...(eventOverlays ? { eventOverlays } : {}) },
    repairs,
  };
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

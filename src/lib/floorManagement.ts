import { genId } from "../components/map-builder/constants";
import { createDefaultFloor, duplicateFloorForBuilding, type FloorDuplicateIdMaps } from "./floorPlanNormalization";
import { remapIndoorNavForFloorCopy } from "./indoorNavigationGraph";
import type { FloorPlan, NavigationEdge, NavigationNode } from "../components/map-builder/types";

/**
 * Shared, pure floor-management helpers used by BOTH the Floor Editor and the
 * outdoor Hierarchy panel. Every mutation here returns a new floors array and
 * never touches the original, so callers stay in control of history, toasts,
 * and active-floor switching. Keeping one implementation prevents the same
 * duplicate/delete/reorder logic from drifting across surfaces.
 */

/** Number of authored objects on a floor (used by delete confirmations). */
export function countFloorAuthoredItems(floor: FloorPlan): number {
  return (floor.rooms?.length ?? 0)
    + (floor.walls?.length ?? 0)
    + (floor.doors?.length ?? 0)
    + (floor.windows?.length ?? 0)
    + (floor.furniture?.length ?? 0)
    + (floor.stairs?.length ?? 0)
    + (floor.ramps?.length ?? 0)
    + (floor.elevators?.length ?? 0)
    + (floor.labels?.length ?? 0)
    + (floor.paths?.length ?? 0);
}

/** Append a new default floor (600x450, empty, normalized) to the collection. */
export function addFloorToBuilding(floors: FloorPlan[], buildingId: string): { floors: FloorPlan[]; floor: FloorPlan } {
  const nextNumber = Math.max(0, ...floors.map((f) => f.number ?? 0)) + 1;
  const floor = createDefaultFloor({ id: genId("fl"), buildingId, number: nextNumber });
  return { floors: [...floors, floor], floor };
}

/** Rename a floor, trimming whitespace. Returns the same array when unchanged. */
export function renameFloorInBuilding(floors: FloorPlan[], floorId: string, label: string): FloorPlan[] {
  const trimmed = label.trim();
  if (!trimmed) return floors;
  let changed = false;
  const next = floors.map((f) => {
    if (f.id !== floorId || f.label === trimmed) return f;
    changed = true;
    return { ...f, label: trimmed };
  });
  return changed ? next : floors;
}

export interface DuplicateFloorResult {
  floors: FloorPlan[];
  copy: FloorPlan | null;
  /** Remapped campus-level indoor nav graph for the copied floor (B5 Phase 2). */
  navNodes?: NavigationNode[];
  navEdges?: NavigationEdge[];
}

/**
 * Deep-duplicate a floor with brand-new IDs for every element, remapping
 * room→wall anchors, door/window wallId references, and perimeter identity.
 * When `navNodes`/`navEdges` (campus-level) are provided, the source floor's
 * indoor nav graph is cloned with new node/edge IDs, floorId pointing at the
 * copy, and linked room/door/stair/elevator/ramp refs remapped to the copy's
 * objects — the duplicate graph is fully independent of the original.
 */
export function duplicateFloorInBuilding(
  floors: FloorPlan[],
  buildingId: string,
  floorId: string,
  navNodes?: NavigationNode[],
  navEdges?: NavigationEdge[]
): DuplicateFloorResult {
  const source = floors.find((f) => f.id === floorId);
  if (!source) return { floors: [...floors], copy: null };
  const nextNumber = Math.max(0, ...floors.map((f) => f.number ?? 0)) + 1;
  const idMaps: FloorDuplicateIdMaps = {
    rooms: new Map(), walls: new Map(), doors: new Map(), windows: new Map(),
    stairs: new Map(), ramps: new Map(), elevators: new Map(),
  };
  const copy = duplicateFloorForBuilding(source, {
    id: genId("fl"),
    buildingId,
    number: nextNumber,
    label: `${source.label} Copy`,
  }, idMaps);
  const result: DuplicateFloorResult = { floors: [...floors, copy], copy };
  if (navNodes && navEdges) {
    const remapped = remapIndoorNavForFloorCopy(navNodes, navEdges, source.id, copy.id, idMaps);
    result.navNodes = remapped.navNodes;
    result.navEdges = remapped.navEdges;
  }
  return result;
}

/**
 * Move a floor one step in the array. direction -1 = up/left (toward index 0),
 * +1 = down/right. This is the single ordering primitive behind both the
 * horizontal tab "Move Left / Move Right" and the hierarchy "Move Up / Move Down".
 */
export function moveFloorInBuilding(floors: FloorPlan[], floorId: string, direction: -1 | 1): { floors: FloorPlan[]; moved: boolean } {
  const index = floors.findIndex((f) => f.id === floorId);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= floors.length) return { floors, moved: false };
  const reordered = [...floors];
  [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
  return { floors: reordered, moved: true };
}

/**
 * Remove a floor. nextActiveId is the recommended replacement active floor
 * (the floor now at the deleted index, otherwise the previous one) — callers
 * only use it when the deleted floor was the active floor.
 */
export function deleteFloorFromBuilding(floors: FloorPlan[], floorId: string): {
  floors: FloorPlan[];
  deleted: FloorPlan | null;
  nextActiveId: string | null;
} {
  const index = floors.findIndex((f) => f.id === floorId);
  if (index < 0) return { floors, deleted: null, nextActiveId: null };
  const deleted = floors[index];
  const remaining = floors.filter((f) => f.id !== floorId);
  if (remaining.length === 0) return { floors: remaining, deleted, nextActiveId: null };
  return {
    floors: remaining,
    deleted,
    nextActiveId: remaining[Math.min(index, remaining.length - 1)].id,
  };
}

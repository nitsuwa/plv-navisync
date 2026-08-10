import { genId } from "../components/map-builder/constants";
import { createDefaultFloor, duplicateFloorForBuilding } from "./floorPlanNormalization";
import type { FloorPlan } from "../components/map-builder/types";

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

/**
 * Deep-duplicate a floor with brand-new IDs for every element, remapping
 * room→wall anchors, door/window wallId references, and perimeter identity.
 */
export function duplicateFloorInBuilding(floors: FloorPlan[], buildingId: string, floorId: string): { floors: FloorPlan[]; copy: FloorPlan | null } {
  const source = floors.find((f) => f.id === floorId);
  if (!source) return { floors: [...floors], copy: null };
  const nextNumber = Math.max(0, ...floors.map((f) => f.number ?? 0)) + 1;
  const copy = duplicateFloorForBuilding(source, {
    id: genId("fl"),
    buildingId,
    number: nextNumber,
    label: `${source.label} Copy`,
  });
  return { floors: [...floors, copy], copy };
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

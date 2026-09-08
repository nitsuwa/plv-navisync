import { genId } from "../components/map-builder/constants";
import { createDefaultFloor, duplicateFloorForBuilding, type FloorDuplicateIdMaps } from "./floorPlanNormalization";
import { remapIndoorNavForFloorCopy } from "./indoorNavigationGraph";
import type { FloorPlan, NavigationEdge, NavigationNode, StairDirection } from "../components/map-builder/types";

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
    + (floor.paths?.length ?? 0)
    + (floor.exteriorZones?.length ?? 0)
    + (floor.entranceSteps?.length ?? 0)
    + (floor.entranceRamps?.length ?? 0);
}

/**
 * Next unused floor number for a building (max existing number + 1). Uses the
 * CURRENT floors array only — callers must pass the freshest persisted floors
 * (never a UI tab index or a stale snapshot) so the DB's
 * `floors_building_number_uq (building_id, floor_number)` constraint can never
 * be hit by a new floor. Non-finite numbers are ignored (treated as 0).
 */
export function nextFloorNumberForBuilding(floors: Array<Pick<FloorPlan, "number">>): number {
  return Math.max(0, ...floors.map((f) => (Number.isFinite(f.number) ? (f.number as number) : 0))) + 1;
}

/**
 * Stair directions that are physically meaningful on a given floor of a
 * building, based on the building's ordered floor numbers.
 *
 * - lowest floor: Up allowed when a higher floor exists; Down impossible;
 *   Both only valid when BOTH lower AND higher served floors exist.
 * - highest floor: Down allowed when a lower floor exists; Up impossible;
 *   Both only valid when BOTH lower AND higher served floors exist.
 * - middle floor: Up, Down and Both are all allowed.
 * - single-floor building: no cross-floor direction is meaningful.
 */
export function stairDirectionsForFloorInOrder(floorId: string, floors: Array<Pick<FloorPlan, "id">>): StairDirection[] {
  const index = floors.findIndex((f) => f.id === floorId);
  if (index < 0 || floors.length <= 1) return [];
  const hasLower = index > 0;
  const hasHigher = index < floors.length - 1;
  const allowed: StairDirection[] = [];
  if (hasHigher) allowed.push("up");
  if (hasLower) allowed.push("down");
  if (hasLower && hasHigher) allowed.push("both");
  return allowed;
}

/**
 * Context-aware default stair direction for a NEW stair on a floor:
 * lowest with a higher floor → Up, highest with a lower floor → Down,
 * middle → Both, single-floor building → "both" (neutral, no cross-floor
 * connection is implied — nothing links because no other floor exists).
 */
export function defaultStairDirectionForFloorInOrder(floorId: string, floors: Array<Pick<FloorPlan, "id">>): StairDirection {
  const allowed = stairDirectionsForFloorInOrder(floorId, floors);
  if (allowed.includes("both")) return "both";
  if (allowed.includes("up")) return "up";
  if (allowed.includes("down")) return "down";
  return "both";
}

/**
 * Whether a Stair occurrence may continue from one ordered floor to another
 * according to its authored direction.  The floor array is the source of
 * truth; numeric floor labels are intentionally not consulted here.  This is
 * shared by the continuation picker and its status presentation so an
 * impossible lower/higher candidate can never be offered in one place and
 * shown as valid in another.
 */
export function stairContinuationDirectionAllows(
  direction: StairDirection | undefined,
  fromFloorIndex: number,
  toFloorIndex: number,
): boolean {
  if (fromFloorIndex < 0 || toFloorIndex < 0 || fromFloorIndex === toFloorIndex) return false;
  if (direction === "up") return toFloorIndex > fromFloorIndex;
  if (direction === "down") return toFloorIndex < fromFloorIndex;
  return true;
}

export type StairContinuationValidationState = "none" | "direction-mismatch" | "missing";

export interface StairContinuationValidation {
  /** No explicit continuation identity is configured for this occurrence. */
  state: StairContinuationValidationState;
  /** Floors occupied by the same physical Stair identity. */
  continuationFloorIds: string[];
  /** Same-identity floors that conflict with the authored direction. */
  invalidDirectionFloorIds: string[];
  /** Same-direction floors without an adjacent, traversable transition. */
  unavailableFloorIds: string[];
}

/**
 * Validate one Stair occurrence against its explicit shared continuation and
 * the currently-derived floor transition graph.  This is intentionally a
 * small authoring/readiness helper: it does not mutate the graph or alter A*.
 * The building's ordered floor array is authoritative, and a Stair may only
 * continue to an adjacent floor.  A missing local nav node is left to the
 * existing Navigation connectivity issue so this check does not collapse two
 * different authoring problems into one warning.
 */
export function validateStairContinuation(
  stair: Pick<FloorStairs, "id" | "sharedId" | "direction">,
  floorId: string,
  floors: Array<Pick<FloorPlan, "id" | "stairs">>,
  navNodes?: Array<Pick<NavigationNode, "id" | "floorId" | "stairId">>,
  navEdges?: Array<Pick<NavigationEdge, "startNodeId" | "endNodeId" | "type" | "bidirectional" | "closed">>,
): StairContinuationValidation {
  if (!stair.sharedId) {
    return { state: "none", continuationFloorIds: [], invalidDirectionFloorIds: [], unavailableFloorIds: [] };
  }
  const fromIndex = floors.findIndex((floor) => floor.id === floorId);
  if (fromIndex < 0) {
    return { state: "none", continuationFloorIds: [], invalidDirectionFloorIds: [], unavailableFloorIds: [] };
  }
  const occurrences = floors.flatMap((floor, index) => (floor.stairs ?? [])
    .filter((candidate) => candidate.sharedId === stair.sharedId && !(floor.id === floorId && candidate.id === stair.id))
    .map((candidate) => ({ floor, index, candidate })));
  const continuationFloorIds = [...new Set(occurrences.map(({ floor }) => floor.id))];
  if (occurrences.length === 0) {
    // A newly placed, non-navigation Stair may carry an auto-generated
    // sharedId before the admin has authored its continuation.  Keep that
    // ordinary authoring state quiet; once the local anchor is linked, the
    // missing continuation becomes actionable and is surfaced here.
    const linkedLocally = navNodes?.some((node) => node.floorId === floorId && node.stairId === stair.id);
    return { state: linkedLocally ? "missing" : "none", continuationFloorIds, invalidDirectionFloorIds: [], unavailableFloorIds: [] };
  }

  // A multi-floor Stair identity commonly has occurrences on both sides of a
  // middle floor.  Direction only governs which *adjacent* transition can be
  // traversed from this occurrence; an otherwise valid upper (or lower)
  // connection must not be reported as invalid merely because the same
  // physical stair also exists on the opposite side.  Non-adjacent occurrences
  // are context, not required direct continuations.
  const adjacentOccurrences = occurrences.filter(({ index }) => Math.abs(index - fromIndex) === 1);
  const validDirectionOccurrences = adjacentOccurrences.filter(({ index }) =>
    stairContinuationDirectionAllows(stair.direction, fromIndex, index)
  );
  const invalidDirectionFloorIds = [...new Set(adjacentOccurrences
    .filter(({ index }) => !stairContinuationDirectionAllows(stair.direction, fromIndex, index))
    .map(({ floor }) => floor.id))];
  if (invalidDirectionFloorIds.length > 0 && validDirectionOccurrences.length === 0) {
    return { state: "direction-mismatch", continuationFloorIds, invalidDirectionFloorIds, unavailableFloorIds: [] };
  }

  const localNode = navNodes?.find((node) => node.floorId === floorId && node.stairId === stair.id);
  const unavailableFloorIds = [...new Set(validDirectionOccurrences
    .filter(({ index, floor, candidate }) => {
      // When no graph snapshot is supplied, structural validity is all this
      // helper can assess.  FloorEditor supplies the canonical snapshot.
      if (!navNodes || !navEdges || !localNode) return false;
      // Resolve the exact occurrence on this floor instead of pairing by
      // coordinates or by label.
      const targetNodeIds = new Set(navNodes.filter((node) => node.floorId === floor.id && node.stairId === candidate.id).map((node) => node.id));
      if (targetNodeIds.size === 0) return true;
      // `cross_floor` is the legacy spelling used by older saved campuses;
      // current writes use `floor_transition`.  Both represent the same
      // authored Stair continuation here, while exact endpoint identity and
      // direction checks remain authoritative.
      return !navEdges.some((edge) => (edge.type === "floor_transition" || edge.type === "cross_floor") && !edge.closed && (
        (edge.startNodeId === localNode.id && targetNodeIds.has(edge.endNodeId))
        || (edge.bidirectional && edge.endNodeId === localNode.id && targetNodeIds.has(edge.startNodeId))
      ));
    })
    .map(({ floor }) => floor.id))];
  return {
    state: unavailableFloorIds.length > 0 ? "missing" : "none",
    continuationFloorIds,
    invalidDirectionFloorIds,
    unavailableFloorIds,
  };
}

export interface StairDirectionAdjustment {
  floorId: string;
  floorLabel: string;
  stairId: string;
  stairLabel: string;
  from: StairDirection;
  to: StairDirection;
}

/**
 * Reconcile persisted Stair direction values after the canonical floor order
 * changes.  Valid, intentional middle-floor choices are preserved; only an
 * impossible boundary value (or a one-floor value with cross-floor meaning)
 * is replaced with that floor's safe default.  The helper is pure so callers
 * can keep the mutation in their existing history/save pipeline and surface a
 * small UI notice when an adjustment actually occurred.
 */
export function reconcileStairDirectionsForFloorOrder(floors: FloorPlan[]): {
  floors: FloorPlan[];
  adjustments: StairDirectionAdjustment[];
} {
  const adjustments: StairDirectionAdjustment[] = [];
  const nextFloors = floors.map((floor) => {
    const allowed = stairDirectionsForFloorInOrder(floor.id, floors);
    let changed = false;
    const nextStairs = (floor.stairs ?? []).map((stair) => {
      const direction = stair.direction;
      const isValid = floors.length > 1 && allowed.includes(direction);
      if (isValid) return stair;
      const nextDirection = defaultStairDirectionForFloorInOrder(floor.id, floors);
      if (nextDirection === direction) return stair;
      changed = true;
      adjustments.push({
        floorId: floor.id,
        floorLabel: floor.label,
        stairId: stair.id,
        stairLabel: stair.label?.trim() || "Stair",
        from: direction,
        to: nextDirection,
      });
      return { ...stair, direction: nextDirection };
    });
    return changed ? { ...floor, stairs: nextStairs } : floor;
  });
  return { floors: nextFloors, adjustments };
}

export function stairDirectionsForFloor(floorNumber: number, floorNumbers: number[]): StairDirection[] {
  return stairDirectionsForFloorInOrder(String(floorNumber), floorNumbers.map((number) => ({ id: String(number) })));
}

export function defaultStairDirectionForFloor(floorNumber: number, floorNumbers: number[]): StairDirection {
  return defaultStairDirectionForFloorInOrder(String(floorNumber), floorNumbers.map((number) => ({ id: String(number) })));
}

/**
 * The authored entry side is the corridor-facing side of the Stair.  PLV's
 * physical Stair labels intentionally use the opposite side name, so this
 * helper is the single source of truth for generated defaults.
 */
export function stairLabelForEntrySide(flip: boolean | undefined): string {
  return flip ? "Left Stair" : "Right Stair";
}

/**
 * Labels in this set are generated by the editor and may safely follow an
 * Entry Side change.  Any other label is admin-authored and must be preserved.
 */
export function isDefaultStairLabel(label: string | undefined): boolean {
  const normalized = label?.trim().toLocaleLowerCase();
  return normalized === "stairs" || normalized === "stair" || normalized === "left stair" || normalized === "right stair";
}

/** Append a new default floor (600x450, empty, normalized) to the collection. */
export function addFloorToBuilding(floors: FloorPlan[], buildingId: string): { floors: FloorPlan[]; floor: FloorPlan } {
  const nextNumber = nextFloorNumberForBuilding(floors);
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
  const nextNumber = nextFloorNumberForBuilding(floors);
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
 * Move a floor one step in the canonical array. direction -1 = up (toward
 * index 0), +1 = down.
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

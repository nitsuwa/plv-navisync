/**
 * Pure campus validation for the Map Builder.
 *
 * Extracted from CampusEditor.tsx so the pre-publish / pre-save checks can be
 * unit-tested and reused without React. Emergency egress readiness is kept
 * semantic here: a ready Building-owned Exterior Emergency Stair satisfies
 * the dedicated-egress check alongside a designated Emergency Exit entrance.
 *
 * This is the B1 baseline slice of the editor's validation; the complete
 * validation and issues workflow is owned by package B7.
 */

import type { CampusBuilding, CampusMarker, NavigationEdge, NavigationNode } from "../components/map-builder/types";
import { getRotatedAABB } from "../components/map-builder/constants";
import { normalizeBuildingEntrances, normalizeEntranceType, primaryEligibleEntrances } from "./buildingEntrances";
import { canonicalExteriorEmergencyStairsForBuilding, exteriorEmergencyStairReadiness, exteriorEmergencyStairRouteReadiness } from "./exteriorEmergencyStairs";
import { campusGates, outdoorNetworkReachesCampusGate } from "./campusGates";
import type { ValidationIssue } from "../components/map-builder/ValidationErrorsDialog";

/** The subset of Campus that the baseline validation reads. */
export interface CampusValidationInput {
  name: string;
  canvasW: number;
  canvasH: number;
  buildings: CampusBuilding[];
  /** Optional live graph used for semantic Emergency readiness.  Older pure
   * validation callers may omit these and retain structural-only checks. */
  navNodes?: NavigationNode[];
  navEdges?: NavigationEdge[];
  markers?: CampusMarker[];
}

/**
 * Detect pairs of buildings whose rotated axis-aligned bounding boxes overlap.
 * Returns the ids of every building involved in at least one overlap.
 */
export function computeBuildingOverlaps(buildings: CampusBuilding[]): Set<string> {
  const overlapping = new Set<string>();
  for (let i = 0; i < buildings.length; i++) {
    for (let j = i + 1; j < buildings.length; j++) {
      const a = getRotatedAABB(buildings[i].x, buildings[i].y, buildings[i].width, buildings[i].height, buildings[i].rotation ?? 0);
      const b = getRotatedAABB(buildings[j].x, buildings[j].y, buildings[j].width, buildings[j].height, buildings[j].rotation ?? 0);
      if (
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y
      ) {
        overlapping.add(buildings[i].id);
        overlapping.add(buildings[j].id);
      }
    }
  }
  return overlapping;
}

/**
 * Run the baseline validation checks against a campus:
 *
 * - missing_campus_name   – campus name is empty/whitespace
 * - missing_name          – building name is empty or still "New Building"
 * - missing_code          – building code is empty or still "NEW"
 * - boundary              – building AABB extends beyond the canvas
 * - no_floors             – building has no floors
 * - overlap               – building overlaps another building
 *
 * @param campus    the campus data to validate
 * @param overlaps  pre-computed overlapping building ids. When omitted, the
 *                  overlaps are derived from the building geometry (the editor
 *                  passes its live overlap state, which is kept in sync with
 *                  the same derivation).
 */
export function validateCampusData(
  campus: CampusValidationInput,
  overlaps?: Set<string>,
  includeEmergencyExitWarnings = false,
): ValidationIssue[] {
  const errors: ValidationIssue[] = [];
  const seenIds = new Set<string>();

  if (!campus.name || campus.name.trim() === "") {
    errors.push({ type: "missing_campus_name", message: "Please enter a name for the campus." });
  }
  const bldgs = campus.buildings;
  for (const b of bldgs) {
    // Every building-scoped issue shares one locate target: select the
    // building on the campus canvas in Design mode.
    const buildingTarget = {
      scope: "campus" as const,
      mode: "design" as const,
      buildingId: b.id,
      selectionType: "building" as const,
      id: b.id,
    };
    if (!b.name || b.name === "New Building") {
      const key = `${b.id}-missing_name`;
      if (!seenIds.has(key)) {
        seenIds.add(key);
        errors.push({
          type: "missing_name",
          message: `Please enter a name for Building "${b.code}".`,
          buildingId: b.id,
          target: buildingTarget,
        });
      }
    }
    if (!b.code || b.code === "NEW") {
      const key = `${b.id}-missing_code`;
      if (!seenIds.has(key)) {
        seenIds.add(key);
        errors.push({
          type: "missing_code",
          message: `Please assign a building code to "${b.name}".`,
          buildingId: b.id,
          target: buildingTarget,
        });
      }
    }
    // Use rotated AABB for boundary check so it matches what the user sees
    const bAABB = getRotatedAABB(b.x, b.y, b.width, b.height, b.rotation ?? 0);
    if (bAABB.x < 0 || bAABB.y < 0 || bAABB.x + bAABB.width > campus.canvasW || bAABB.y + bAABB.height > campus.canvasH) {
      const key = `${b.id}-boundary`;
      if (!seenIds.has(key)) {
        seenIds.add(key);
        errors.push({
          type: "boundary",
          message: `The building "${b.code}" extends beyond the campus boundary. Move or resize it so it fits within the map.`,
          buildingId: b.id,
          target: buildingTarget,
        });
      }
    }
    if (b.floors.length === 0) {
      const key = `${b.id}-no_floors`;
      if (!seenIds.has(key)) {
        seenIds.add(key);
        errors.push({
          type: "no_floors",
          message: `Please add at least one floor to Building "${b.code}".`,
          buildingId: b.id,
          target: buildingTarget,
        });
      }
    }
    const entrances = normalizeBuildingEntrances(b);
    const primaryEntrances = primaryEligibleEntrances(entrances);
    if (entrances.length === 0) {
      const key = `${b.id}-no_building_entrance`;
      if (!seenIds.has(key)) {
        seenIds.add(key);
        errors.push({
          type: "no_building_entrance",
          message: `Building "${b.code}" has no entrance. Add a General entrance before navigation setup.`,
          buildingId: b.id,
          target: buildingTarget,
        });
      }
    } else if (primaryEntrances.length === 0) {
      const key = `${b.id}-no_primary_entrance`;
      if (!seenIds.has(key)) {
        seenIds.add(key);
        errors.push({
          type: "no_primary_entrance",
          message: `Building "${b.code}" has no primary entrance. Mark one General entrance as Primary.`,
          buildingId: b.id,
          target: buildingTarget,
        });
      }
    } else if (primaryEntrances.length > 1) {
      const key = `${b.id}-multiple_primary_entrances`;
      if (!seenIds.has(key)) {
        seenIds.add(key);
        errors.push({
          type: "multiple_primary_entrances",
          message: `Building "${b.code}" has more than one primary entrance. Keep only one Primary entrance.`,
          buildingId: b.id,
          target: buildingTarget,
        });
      }
    }
    const hasDesignatedEmergencyExit = entrances.some((entrance) => normalizeEntranceType(entrance.type) === "emergency_exit");
    const exteriorStairs = canonicalExteriorEmergencyStairsForBuilding(b);
    const hasGraph = Array.isArray(campus.navNodes) && Array.isArray(campus.navEdges);
    const stairStatuses = exteriorStairs.map((stair) => hasGraph
      ? exteriorEmergencyStairRouteReadiness(b, stair, campus.navNodes, campus.navEdges)
      : exteriorEmergencyStairReadiness(b, stair));
    const gates = campusGates({ markers: campus.markers ?? [] });
    // Fully hydrated editor campuses always carry a markers array. A stair is
    // a complete emergency egress only when that outdoor graph can reach an
    // authored Campus Gate; undefined markers denotes a legacy pure-validation
    // payload and keeps its structural-only behavior backwards compatible.
    const gateReachable = (status: typeof stairStatuses[number]) => campus.markers === undefined
      || (gates.length > 0 && !!status.outdoorNodeId && outdoorNetworkReachesCampusGate(status.outdoorNodeId, campus.navNodes ?? [], campus.navEdges ?? []));
    const readyExteriorStair = stairStatuses.find((status) => status.ready && gateReachable(status));
    const readyStairWithoutCampusExit = stairStatuses.find((status) => status.ready && !gateReachable(status));
    if (includeEmergencyExitWarnings && readyStairWithoutCampusExit) {
      const key = `${b.id}-no_reachable_campus_gate`;
      if (!seenIds.has(key)) {
        seenIds.add(key);
        errors.push({
          type: "exterior_emergency_stair_no_campus_exit",
          severity: "warning",
          message: "Emergency route reaches the Ground discharge but cannot reach a Campus Gate.",
          buildingId: b.id,
          target: buildingTarget,
        });
      }
    }
    if (includeEmergencyExitWarnings && !hasDesignatedEmergencyExit && !readyExteriorStair && !readyStairWithoutCampusExit) {
      const key = `${b.id}-no_emergency_exit_configured`;
      if (!seenIds.has(key)) {
        seenIds.add(key);
        const stairIssue = stairStatuses
          .map((status) => status.issue)
          .find((issue): issue is string => Boolean(issue));
        errors.push(stairIssue
          ? {
              type: "exterior_emergency_stair_incomplete",
              severity: "warning",
              message: stairIssue,
              buildingId: b.id,
              target: buildingTarget,
            }
          : {
              type: "no_emergency_exit_configured",
              severity: "warning",
              message: `No dedicated emergency egress configured for Building "${b.code}". This Building has no designated Emergency Exit or Exterior Emergency Stair. Emergency routing may use a safe General Entrance as fallback.`,
              buildingId: b.id,
              target: buildingTarget,
            });
      }
    }
    // B7 Phase 1: duplicate room names WITHIN the same floor. Comparison is
    // case-insensitive and whitespace-normalized; matching names on different
    // floors are NOT duplicates. Each affected room after the first canonical
    // occurrence gets its own locatable warning so every duplicate can be
    // fixed individually. Empty/whitespace-only names are ignored.
    for (const floor of b.floors ?? []) {
      const seenNames = new Set<string>();
      for (const room of floor.rooms ?? []) {
        const raw = room.name?.trim();
        if (!raw) continue;
        const normalized = raw.replace(/\s+/g, " ");
        const key = normalized.toLowerCase();
        if (seenNames.has(key)) {
          errors.push({
            type: "duplicate_room_name",
            severity: "warning",
            message: `Room name "${normalized}" is duplicated on floor "${floor.label || `Floor ${floor.number}`}". Rename one of the rooms.`,
            buildingId: b.id,
            floorId: floor.id,
            roomId: room.id,
            target: {
              scope: "floor",
              mode: "design",
              buildingId: b.id,
              floorId: floor.id,
              selectionType: "room",
              id: room.id,
            },
          });
        } else {
          seenNames.add(key);
        }
      }
    }
  }

  const overlapIds = overlaps ?? computeBuildingOverlaps(bldgs);
  if (overlapIds.size > 0) {
    for (const id of overlapIds) {
      const b = bldgs.find((x) => x.id === id);
      if (!b) continue;
      const key = `${id}-overlap`;
      if (!seenIds.has(key)) {
        seenIds.add(key);
        errors.push({
          type: "overlap",
          message: `Building "${b.code}" overlaps with another building. Adjust its position to resolve the overlap.`,
          buildingId: id,
          target: {
            scope: "campus",
            mode: "design",
            buildingId: id,
            selectionType: "building",
            id,
          },
        });
      }
    }
  }

  return errors;
}

/**
 * eventLocationData — shared resolution between the student campus map and
 * the student org event editor.
 *
 * The student campus map (CampusMapPage) renders either the live published
 * campus (buildings with map-builder ids like "b_scb") or, when no campus is
 * available, the legacy demo data (ids "b1".."b7"). Event overlays must be
 * anchored to the SAME building/floor ids the map uses, or approved layouts
 * will never appear on the map.
 *
 * This module mirrors that two-tier source so the event location picker and
 * the event floor editor always resolve the exact building/floor the map will
 * render. The canonical floor id is `${buildingId}-f${floorNumber}` and the
 * canvas is 440×290 — matching the map's floor viewBox.
 */
import { FLOOR_PLANS as LEGACY_FLOOR_PLANS, ROOM_COLORS } from "../data/floorPlans";
import { MOCK_BUILDINGS as LEGACY_BUILDINGS } from "../data/mockData";
import type {
  Campus,
  CampusBuilding,
  FloorPlan,
  FloorRoom,
} from "../components/map-builder/types";

export const EVENT_CANVAS_W = 440;
export const EVENT_CANVAS_H = 290;

export function floorLookupId(buildingId: string, floorNumber: number): string {
  return `${buildingId}-f${floorNumber}`;
}

export interface EventBuildingOption {
  buildingId: string;
  buildingName: string;
  floors: { number: number; label: string }[];
}

const FALLBACK_FILL = "#e5e7eb";

/** Pick a stable fill for a room from the demo room palette when possible. */
function typeFill(type: string, explicitColor?: string): string {
  if (explicitColor) return explicitColor;
  const entry = ROOM_COLORS[type as keyof typeof ROOM_COLORS];
  return entry?.fill ?? FALLBACK_FILL;
}

function buildingHasFloors(building: CampusBuilding): boolean {
  return Array.isArray(building.floors) && building.floors.length > 0;
}

/**
 * List the buildings/floor options for the create-event location picker.
 * Mirrors CampusMapPage's source: active campus buildings when available,
 * otherwise the legacy demo dataset.
 */
export function eventBuildingOptions(
  activeCampus: Campus | null
): EventBuildingOption[] {
  if (activeCampus && activeCampus.buildings) {
    return activeCampus.buildings
      .filter((b) => b.visible !== false && buildingHasFloors(b))
      .map((b) => ({
        buildingId: b.id,
        buildingName: b.name,
        floors: b.floors.map((f) => ({
          number: f.number,
          label: f.label,
        })),
      }));
  }

  // Legacy demo fallback — only buildings that have floor plans AND appear on
  // the legacy campus map can host events students can actually see.
  const mapIds = new Set(LEGACY_BUILDINGS.map((b) => b.id));
  return Object.keys(LEGACY_FLOOR_PLANS)
    .filter((key) => mapIds.has(key))
    .map((key) => ({
      buildingId: LEGACY_FLOOR_PLANS[key].buildingId,
      buildingName: LEGACY_FLOOR_PLANS[key].buildingName,
      floors: LEGACY_FLOOR_PLANS[key].floors.map((f) => ({
        number: f.number,
        label: f.label,
      })),
    }));
}

/**
 * Resolve the demo building + floor referenced by an overlay's locationRef
 * when no live campus is active (legacy demo mode).
 */
function resolveLegacyFloorPlan(
  buildingId: string,
  floorNumber?: number
): FloorPlan | null {
  const building = LEGACY_FLOOR_PLANS[buildingId];
  if (!building) return null;
  const demoFloor =
    building.floors.find((f) => f.number === floorNumber) ??
    building.floors[0];
  if (!demoFloor) return null;

  const floorId = floorLookupId(building.buildingId, demoFloor.number);
  const rooms: FloorRoom[] = demoFloor.rooms.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    x: r.x,
    y: r.y,
    w: r.w,
    h: r.h,
    color: typeFill(r.type, undefined),
    floorId,
    buildingId: building.buildingId,
  }));

  return {
    id: floorId,
    buildingId: building.buildingId,
    number: demoFloor.number,
    label: demoFloor.label,
    canvasW: EVENT_CANVAS_W,
    canvasH: EVENT_CANVAS_H,
    backgroundColor: "#f8f9fa",
    showGrid: true,
    gridSize: 20,
    rooms,
    paths: [],
    walls: [],
    doors: [],
    windows: [],
    furniture: [],
    stairs: [],
    ramps: [],
    elevators: [],
    labels: [],
  };
}

/**
 * Resolve the floor plan (same source the student map renders) for an event
 * overlay, given the active campus. Falls back to legacy demo data when no
 * campus is active.
 */
export function resolveFloorPlanForEvent(
  buildingId: string,
  floorNumber?: number,
  activeCampus?: Campus | null
): FloorPlan | null {
  // Live campus mode — find the building and floor inside the campus data the
  // map uses, so event furniture lands in the exact same coordinates.
  if (activeCampus?.buildings) {
    const building = activeCampus.buildings.find(
      (b) => b.id === buildingId && b.visible !== false
    );
    const sourceFloor = building?.floors.find((f) => f.number === floorNumber);
    const floor = sourceFloor ?? building?.floors[0];
    if (building && floor) {
      const floorId = floorLookupId(building.id, floor.number);
      const rooms: FloorRoom[] = (floor.rooms ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        x: r.x,
        y: r.y,
        w: r.w,
        h: r.h,
        color: r.color || typeFill(r.type, undefined),
        floorId,
        buildingId: building.id,
      }));

      // Rooms only — the student map renders the same room rectangles (via
      // floorPlansFromCampus) inside its 440×290 floor viewBox, so the org
      // editor is WYSIWYG with what students will see. Other base structure
      // (walls/doors/furniture) is deliberately excluded: it is read-only and
      // the campus map's own floor view shows only rooms.
      return {
        id: floorId,
        buildingId: building.id,
        number: floor.number,
        label: floor.label,
        canvasW: EVENT_CANVAS_W,
        canvasH: EVENT_CANVAS_H,
        backgroundColor: floor.backgroundColor || "#f8f9fa",
        showGrid: true,
        gridSize: 20,
        rooms,
        paths: [],
        walls: [],
        doors: [],
        windows: [],
        furniture: [],
        stairs: [],
        ramps: [],
        elevators: [],
        labels: [],
      };
    }
    // Building/floor not found in the live campus — do not silently fall back
    // to a different building's demo floor; the overlay is simply unresolved.
    return null;
  }

  return resolveLegacyFloorPlan(buildingId, floorNumber);
}

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
 * canvas dimensions come from the published floor plan, with the legacy
 * constants below retained as a fallback for older floor records.
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
export const CAMPUS_GROUNDS_ID = "campus";

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
  if (buildingId === CAMPUS_GROUNDS_ID) {
    const campusW = activeCampus?.canvasW || 1200;
    const campusH = activeCampus?.canvasH || 900;
    const campusBuildings = activeCampus?.buildings ?? [];
    const rooms: FloorRoom[] = campusBuildings.map((b) => ({
      id: b.id,
      name: b.name,
      type: "building",
      x: b.x,
      y: b.y,
      w: b.width,
      h: b.height,
      color: b.color || "#cccccc",
      floorId: "campus",
      buildingId: "campus",
      rotation: b.rotation || 0,
    }));

    return {
      id: "campus",
      buildingId: "campus",
      number: 0,
      label: "Campus Grounds",
      canvasW: campusW,
      canvasH: campusH,
      backgroundColor: activeCampus?.backgroundColor || "#f0f0f0",
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
      const rooms: FloorRoom[] = (floor.rooms ?? []).map((room) => ({
        ...room,
        color: room.color || typeFill(room.type, undefined),
        floorId,
        buildingId: building.id,
      }));

      // Preserve the complete administrator-authored floor snapshot. The
      // event editor keeps every base layer read-only, then composes event
      // furniture and labels above it. This makes the planning canvas truly
      // WYSIWYG with the published map instead of reducing it to room boxes.
      return {
        ...floor,
        id: floorId,
        buildingId: building.id,
        number: floor.number,
        label: floor.label,
        canvasW: floor.canvasW ?? EVENT_CANVAS_W,
        canvasH: floor.canvasH ?? EVENT_CANVAS_H,
        backgroundColor: floor.backgroundColor || "#f8f9fa",
        showGrid: floor.showGrid !== false,
        gridSize: floor.gridSize ?? 20,
        rooms,
        paths: [...(floor.paths ?? [])],
        walls: [...(floor.walls ?? [])],
        doors: [...(floor.doors ?? [])],
        windows: [...(floor.windows ?? [])],
        furniture: [...(floor.furniture ?? [])],
        stairs: [...(floor.stairs ?? [])],
        ramps: [...(floor.ramps ?? [])],
        elevators: [...(floor.elevators ?? [])],
        labels: [...(floor.labels ?? [])],
        exteriorZones: [...(floor.exteriorZones ?? [])],
        entranceSteps: [...(floor.entranceSteps ?? [])],
        entranceRamps: [...(floor.entranceRamps ?? [])],
      };
    }
    // Building/floor not found in the live campus — do not silently fall back
    // to a different building's demo floor; the overlay is simply unresolved.
    return null;
  }

  return resolveLegacyFloorPlan(buildingId, floorNumber);
}

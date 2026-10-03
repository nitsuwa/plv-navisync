/**
 * Adapter that converts Map Builder Campus data into the legacy formats
 * used by the public CampusMapPage (B_POS, FLOOR_PLANS, etc.).
 *
 * This allows the public map to display data created in the Map Builder.
 */

import type { Campus, CampusBuilding, FloorPlan, FloorRoom } from "../components/map-builder/types";
import { entranceDescription, entranceDisplayName } from "./buildingEntrances";

type CampusWithOptionalBuildings = Campus & { buildings: CampusBuilding[] };

function visibleBuildings(campus: CampusWithOptionalBuildings): CampusBuilding[] {
  return campus.buildings.filter((building) => building.visible !== false);
}

// ── Building position map (legacy B_POS format) ────────────────────────────
export interface BuildingPosition {
  x: number; y: number; w: number; h: number; color: string;
}

export function buildingPositionsFromCampus(campus: CampusWithOptionalBuildings): Record<string, BuildingPosition> {
  const result: Record<string, BuildingPosition> = {};
  for (const b of visibleBuildings(campus)) {
    result[b.id] = { x: b.x, y: b.y, w: b.width, h: b.height, color: b.color };
  }
  return result;
}

// ── Floor plan data (legacy FLOOR_PLANS format) ────────────────────────────
interface LegacyRoom {
  id: string; name: string; x: number; y: number; w: number; h: number; type: string;
  shapePoints?: Array<{ x: number; y: number }>;
  accessibility?: boolean;
}
interface LegacyFloor {
  number: number; label: string; rooms: LegacyRoom[];
}
interface LegacyFloorPlan {
  buildingId: string; buildingName: string; floors: LegacyFloor[];
}

export function floorPlansFromCampus(campus: CampusWithOptionalBuildings): Record<string, LegacyFloorPlan> {
  const result: Record<string, LegacyFloorPlan> = {};
  for (const b of visibleBuildings(campus)) {
    if (!b.floors || b.floors.length === 0) continue;
    result[b.id] = {
      buildingId: b.id,
      buildingName: b.name,
      floors: b.floors.map((f: FloorPlan) => ({
        number: f.number,
        label: f.label,
        rooms: (f.rooms || []).map((r: FloorRoom) => ({
          id: r.id,
          name: r.name,
          x: r.x,
          y: r.y,
          w: r.w,
          h: r.h,
          type: r.type,
          shapePoints: r.shapePoints,
          accessibility: r.accessibility,
        })),
      })),
    };
  }
  return result;
}

// ── Building info (legacy MOCK_BUILDINGS format) ──────────────────────────
import type { Building } from "../types";

type LegacyBuilding = Building;

type PublicBuildingMetadata = CampusBuilding & {
  departments?: unknown;
  facilities?: unknown;
  accessibility?: unknown;
};

function cleanStringList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return [...new Set(
    value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean),
  )];
}

const ROOM_FACILITY_LABELS: Record<string, string> = {
  classroom: "Classrooms",
  lab: "Laboratories",
  laboratory: "Laboratories",
  office: "Offices",
  restroom: "Restrooms",
  canteen: "Canteen",
  clinic: "Clinic",
  kitchen: "Kitchen",
  library: "Library",
  lounge: "Student Lounge",
  lobby: "Lobby",
  stairs: "Stairs",
  elevator: "Elevator",
};

function facilitiesFromFloorPlans(building: CampusBuilding): string[] {
  const labels = new Set<string>();
  for (const floor of building.floors ?? []) {
    for (const room of floor.rooms ?? []) {
      const label = ROOM_FACILITY_LABELS[room.type?.trim().toLowerCase() ?? ""];
      if (label) labels.add(label);
    }
    if (floor.elevators?.length) labels.add("Elevator");
    if (floor.stairs?.length) labels.add("Stairs");
  }
  return [...labels];
}

export function buildingsFromCampus(campus: CampusWithOptionalBuildings): LegacyBuilding[] {
  return visibleBuildings(campus).map(b => {
    const metadata = b as PublicBuildingMetadata;
    return {
      id: b.id,
      name: b.name,
      code: b.code,
      description: b.description || "",
      category: b.category.toLowerCase() as Building["category"],
      floor_count: b.floors.length,
      image_url: undefined,
      operating_hours: undefined,
      contact: undefined,
      departments: cleanStringList(metadata.departments) ?? cleanStringList(metadata.facilities) ?? [],
      created_at: new Date().toISOString(),
    };
  });
}

// ── Building status (legacy) ───────────────────────────────────────────────
export const STATUS: Record<string, "Open" | "Busy" | "Closed"> = {};
export const STATUS_COLOR = { Open: "text-green-500", Busy: "text-amber-500", Closed: "text-red-500" };
export const STATUS_DOT = { Open: "bg-green-500", Busy: "bg-amber-500", Closed: "bg-red-500" };

// ── Facilities & accessibility (helpers from building data) ────────────────
export function facilitiesFromCampus(campus: CampusWithOptionalBuildings): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const b of visibleBuildings(campus)) {
    const explicit = cleanStringList((b as PublicBuildingMetadata).facilities);
    result[b.id] = explicit ?? facilitiesFromFloorPlans(b);
  }
  return result;
}

const ACCESSIBILITY_TYPE_LABELS: Record<string, string> = {
  ramp: "Ramp Access",
  elevator: "Elevator Available",
  accessible_entrance: "Accessible Entrance",
  accessible_restroom: "Accessible Restroom",
  wide_corridor: "Wide Corridors",
};

export function accessibilityFromCampus(campus: CampusWithOptionalBuildings): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const b of visibleBuildings(campus)) {
    const metadata = b as PublicBuildingMetadata;
    const items = new Set<string>(cleanStringList(metadata.accessibility) ?? []);
    const acc = metadata.accessibility;
    if (acc && typeof acc === "object" && !Array.isArray(acc)) {
      const summary = acc as Record<string, unknown>;
      if (summary.wheelchairAccessible) items.add("Wheelchair Accessible");
      if (summary.hasElevator) items.add("Elevator Available");
      if (summary.hasRamp) items.add("Ramp Access");
      if (summary.accessibleEntrance) items.add("Accessible Entrance");
    }
    for (const feature of campus.accessibilityFeatures ?? []) {
      if (feature.buildingId !== b.id || feature.status !== "present") continue;
      items.add(feature.label?.trim() || ACCESSIBILITY_TYPE_LABELS[feature.type] || "Accessibility Feature");
    }
    if (b.entrances?.some((entrance) => entrance.accessible === true)) items.add("Accessible Entrance");
    result[b.id] = [...items];
  }
  return result;
}

// ── Location entities for the admin Locations page ─────────────────────────
// Extracts rooms, entrances, and facilities from a published campus and
// converts them to CampusLocation[] so they appear in AdminLocationsPage.

import type { CampusLocation } from "../types";

/**
 * Map a floor-room type string to a CampusLocation type.
 */
function mapRoomTypeToLocationType(roomType: string): CampusLocation["type"] {
  const lower = roomType.toLowerCase();
  if (lower === "restroom") return "restroom";
  if (lower === "canteen") return "canteen";
  if (lower === "clinic")  return "clinic";
  return "landmark";
}

/**
 * Map a campus-marker type string to a CampusLocation type.
 */
function mapMarkerTypeToLocationType(markerType: string): CampusLocation["type"] {
  const lower = markerType.toLowerCase();
  const valid: CampusLocation["type"][] = ["entrance", "parking", "landmark", "restroom", "canteen", "atm", "clinic"];
  if (valid.includes(lower as CampusLocation["type"])) return lower as CampusLocation["type"];
  return "landmark";
}

/**
 * Derive CampusLocation[] from a published campus's buildings, floors,
 * and markers.  Prefixes IDs with `campus-` to distinguish from manual
 * locations.
 */
export function locationsFromCampus(campus: CampusWithOptionalBuildings): CampusLocation[] {
  const locations: CampusLocation[] = [];

  // 1. Outdoor markers (entrances, parking, landmarks, etc.)
  for (const m of campus.markers || []) {
    locations.push({
      id: `campus-${m.id}`,
      name: m.name,
      type: mapMarkerTypeToLocationType(m.type),
      description: `Auto-generated from campus map marker`,
      building_id: undefined,
    });
  }

  // 2. Rooms inside each building/floor
  for (const b of visibleBuildings(campus)) {
    // Add building itself as a landmark location
    locations.push({
      id: `campus-${b.id}`,
      name: b.name,
      type: "landmark",
      description: b.description || `${b.code} — ${b.category}`,
      building_id: b.id,
    });

    for (const [idx, entrance] of (b.entrances ?? []).entries()) {
      locations.push({
        id: `campus-${entrance.id}`,
        name: entranceDisplayName(entrance, idx),
        type: "entrance",
        description: entranceDescription(entrance, b.name),
        building_id: b.id,
      });
    }

    for (const f of b.floors || []) {
      for (const r of f.rooms || []) {
        // Skip hallways and structural spaces that aren't destinations
        const roomType = r.type?.toLowerCase() ?? "";
        if (roomType === "hallway" || roomType === "corridor") continue;
        if (roomType === "staircase" || roomType === "stairs") continue;
        if (roomType === "elevator") continue;

        const label = buildRoomLabel(b, f, r);
        locations.push({
          id: `campus-${r.id}`,
          name: label,
          type: mapRoomTypeToLocationType(r.type),
          description: r.description
            ? `${r.description} — ${b.name}, ${f.label}`
            : `${b.name}, ${f.label} — ${r.name}`,
          building_id: b.id,
        });
      }

      // Elevators as facility locations
      for (const e of f.elevators || []) {
        locations.push({
          id: `campus-${e.id || `${b.id}-elevator-${f.number}`}`,
          name: e.label || `${b.name} Elevator (${f.label})`,
          type: "landmark",
          description: `Elevator in ${b.name}, ${f.label}`,
          building_id: b.id,
        });
      }

      // Stairs as facility locations
      for (const s of f.stairs || []) {
        locations.push({
          id: `campus-${s.id || `${b.id}-stairs-${f.number}`}`,
          name: s.label || `${b.name} Stairs (${f.label})`,
          type: "landmark",
          description: `Stairway in ${b.name}, ${f.label}`,
          building_id: b.id,
        });
      }
    }
  }

  return locations;
}

/** Build a human-readable room label, e.g. "Room 204 — Computer Laboratory" */
function buildRoomLabel(
  building: CampusBuilding,
  floor: { number: number; label: string },
  room: { name: string; type?: string }
): string {
  const prefix = room.name;
  const typeReadable = room.type
    ? room.type.charAt(0).toUpperCase() + room.type.slice(1)
    : "";
  if (typeReadable && !prefix.toLowerCase().includes(typeReadable.toLowerCase())) {
    return `${prefix} — ${typeReadable}`;
  }
  return prefix;
}

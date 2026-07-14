/**
 * Adapter that converts Map Builder Campus data into the legacy formats
 * used by the public CampusMapPage (B_POS, FLOOR_PLANS, etc.).
 *
 * This allows the public map to display data created in the Map Builder.
 */

import type { SharedCampusData, SharedBuilding } from "../contexts/CampusDataContext";

// ── Building position map (legacy B_POS format) ────────────────────────────
export interface BuildingPosition {
  x: number; y: number; w: number; h: number; color: string;
}

export function buildingPositionsFromCampus(campus: SharedCampusData): Record<string, BuildingPosition> {
  const result: Record<string, BuildingPosition> = {};
  for (const b of campus.buildings) {
    result[b.id] = { x: b.x, y: b.y, w: b.width, h: b.height, color: b.color };
  }
  return result;
}

// ── Floor plan data (legacy FLOOR_PLANS format) ────────────────────────────
interface LegacyRoom {
  id: string; name: string; x: number; y: number; w: number; h: number; type: string;
}
interface LegacyFloor {
  number: number; label: string; rooms: LegacyRoom[];
}
interface LegacyFloorPlan {
  buildingId: string; buildingName: string; floors: LegacyFloor[];
}

export function floorPlansFromCampus(campus: SharedCampusData): Record<string, LegacyFloorPlan> {
  const result: Record<string, LegacyFloorPlan> = {};
  for (const b of campus.buildings) {
    if (!b.floors || b.floors.length === 0) continue;
    result[b.id] = {
      buildingId: b.id,
      buildingName: b.name,
      floors: b.floors.map(f => ({
        number: f.number,
        label: f.label,
        rooms: f.rooms.map(r => ({
          id: r.id,
          name: r.name,
          x: r.x, y: r.y, w: r.w, h: r.h,
          type: r.type,
        })),
      })),
    };
  }
  return result;
}

// ── Building info (legacy MOCK_BUILDINGS format) ──────────────────────────
interface LegacyBuilding {
  id: string; name: string; code: string;
  description: string; category: string;
  floor_count: number;
  image_url?: string;
  latitude?: number; longitude?: number;
  departments?: string[];
  operating_hours?: string;
  contact?: string;
  created_at: string;
}

export function buildingsFromCampus(campus: SharedCampusData): LegacyBuilding[] {
  return campus.buildings.map(b => ({
    id: b.id,
    name: b.name,
    code: b.code,
    description: b.description || "",
    category: b.category.toLowerCase(),
    floor_count: b.floors.length,
    image_url: b.image_url,
    operating_hours: b.operating_hours,
    contact: b.contact,
    departments: b.facilities || [],
    created_at: new Date().toISOString(),
  }));
}

// ── Building status (legacy) ───────────────────────────────────────────────
export const STATUS: Record<string, "Open" | "Busy" | "Closed"> = {};
export const STATUS_COLOR = { Open: "text-green-500", Busy: "text-amber-500", Closed: "text-red-500" };
export const STATUS_DOT = { Open: "bg-green-500", Busy: "bg-amber-500", Closed: "bg-red-500" };

// ── Facilities & accessibility (helpers from building data) ────────────────
export function facilitiesFromCampus(campus: SharedCampusData): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const b of campus.buildings) {
    result[b.id] = b.facilities || [];
  }
  return result;
}

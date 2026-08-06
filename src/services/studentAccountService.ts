import type { Building } from "../types";
import { MOCK_BUILDINGS } from "../data/mockData";

const SAVED_BUILDINGS_KEY = "plv_student_saved_buildings_v1";
const RECENT_DESTINATIONS_KEY = "plv_student_recent_destinations_v1";

export interface RecentDestination {
  id: string;
  name: string;
  code?: string;
  buildingId?: string;
  timestamp: string;
}

// Get student's bookmarked buildings
export async function getSavedBuildings(): Promise<Building[]> {
  const savedIds: string[] = getLocalSavedBuildingIds();
  if (savedIds.length === 0) return [];

  // Filter MOCK_BUILDINGS matching by id, code, or lowercased id/code
  const savedBuildings = MOCK_BUILDINGS.filter((b) =>
    savedIds.some(
      (id) =>
        id === b.id ||
        id.toLowerCase() === b.code.toLowerCase() ||
        id.toLowerCase() === b.id.toLowerCase() ||
        b.name.toLowerCase().includes(id.toLowerCase())
    )
  );
  return savedBuildings;
}

// Toggle bookmark for a building
export async function toggleSaveBuilding(buildingId: string): Promise<boolean> {
  const currentIds = getLocalSavedBuildingIds();
  const exists = currentIds.includes(buildingId);
  let updatedIds: string[];

  if (exists) {
    updatedIds = currentIds.filter((id) => id !== buildingId);
  } else {
    updatedIds = [buildingId, ...currentIds.filter((id) => id !== buildingId)];
  }

  try {
    localStorage.setItem(SAVED_BUILDINGS_KEY, JSON.stringify(updatedIds));
  } catch {
    // Ignore storage write errors
  }

  return !exists;
}

// Get recent map search destinations
export function getRecentDestinations(): RecentDestination[] {
  try {
    const raw = localStorage.getItem(RECENT_DESTINATIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // Ignore parse errors
  }
  return [];
}

// Add to recent map search destinations
export function addRecentDestination(item: { id: string; name: string; code?: string; buildingId?: string }): void {
  try {
    const existing = getRecentDestinations();
    const newItem: RecentDestination = {
      ...item,
      timestamp: new Date().toISOString(),
    };
    const updated = [newItem, ...existing.filter((d) => d.id !== item.id)].slice(0, 10);
    localStorage.setItem(RECENT_DESTINATIONS_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage errors
  }
}

// Helpers
function getLocalSavedBuildingIds(): string[] {
  try {
    const raw = localStorage.getItem(SAVED_BUILDINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // Ignore parse errors
  }
  // Default demo saved buildings if empty
  return ["b1", "b3"];
}

export const studentAccountService = {
  getSavedBuildings,
  toggleSaveBuilding,
  getRecentDestinations,
  addRecentDestination,
};

import type { Building } from "../types";

const SAVED_BUILDINGS_KEY = "plv_student_saved_buildings_v1";
const RECENT_DESTINATIONS_KEY = "plv_student_recent_destinations_v1";

export interface RecentDestination {
  id: string;
  name: string;
  code?: string;
  buildingId?: string;
  timestamp: string;
}

// Get student's bookmarked building IDs
export async function getSavedBuildings(allBuildings?: Building[]): Promise<Building[]> {
  const savedIds: string[] = getLocalSavedBuildingIds();
  if (savedIds.length === 0) return [];
  if (!allBuildings || allBuildings.length === 0) return [];

  // Resolve saved IDs against the provided building list (published campus data)
  const savedBuildings = allBuildings.filter((b) =>
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

// Get raw saved building IDs (for pages that resolve IDs themselves)
export function getSavedBuildingIds(): string[] {
  return getLocalSavedBuildingIds();
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
  // Default demo saved buildings if empty (real PLV campus ids)
  return ["b_scb", "b_caba"];
}

export const studentAccountService = {
  getSavedBuildings,
  getSavedBuildingIds,
  toggleSaveBuilding,
  getRecentDestinations,
  addRecentDestination,
};

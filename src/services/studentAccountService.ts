import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "../types/database.generated";
import type { Building } from "../types";
import { supabase } from "../lib/supabase";

const SAVED_BUILDINGS_KEY = "plv_student_saved_buildings_v1";
const RECENT_DESTINATIONS_KEY = "plv_student_recent_destinations_v1";

export interface RecentDestination {
  id: string;
  name: string;
  code?: string;
  buildingId?: string;
  timestamp: string;
}

type StudentClient = SupabaseClient<Database>;

export function getSavedBuildingStorageKey(scope = "guest"): string {
  return `${SAVED_BUILDINGS_KEY}:${scope || "guest"}`;
}

function getLocalSavedBuildingIds(scope = "guest"): string[] {
  try {
    const raw = localStorage.getItem(getSavedBuildingStorageKey(scope));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function writeLocalSavedBuildingIds(ids: string[], scope = "guest"): void {
  try {
    localStorage.setItem(getSavedBuildingStorageKey(scope), JSON.stringify(ids));
  } catch {
    // Local storage is only the demo fallback.
  }
}

type RemoteUserResult = { client: StudentClient | null; user: User | null };

async function resolveRemoteUser(client?: StudentClient): Promise<RemoteUserResult> {
  const activeClient = client ?? supabase;
  if (!activeClient) return { client: null, user: null };
  try {
    const { data, error } = await activeClient.auth.getUser();
    if (error) return { client: null, user: null };
    return { client: activeClient, user: data.user ?? null };
  } catch {
    // A configured Supabase client can still have no active session. Treat
    // that state like the guest/local fallback instead of rejecting UI reads.
    return { client: null, user: null };
  }
}

export function getSavedBuildingIds(scope = "guest"): string[] {
  return getLocalSavedBuildingIds(scope);
}

export async function getSavedBuildingIdsAsync(client?: StudentClient): Promise<string[]> {
  const { client: activeClient, user } = await resolveRemoteUser(client);
  if (!activeClient || !user) return getLocalSavedBuildingIds("guest");

  const { data, error } = await activeClient
    .from("favorites")
    .select("building_id")
    .eq("user_id", user.id);
  if (error) throw error;

  return (data ?? [])
    .map((favorite) => favorite.building_id)
    .filter((buildingId): buildingId is string => Boolean(buildingId));
}

export async function getSavedBuildings(allBuildings: Building[] = [], client?: StudentClient): Promise<Building[]> {
  const savedIds = await getSavedBuildingIdsAsync(client);
  if (savedIds.length === 0 || allBuildings.length === 0) return [];

  return allBuildings.filter((building) =>
    savedIds.some(
      (id) =>
        id === building.id ||
        id.toLowerCase() === building.code.toLowerCase() ||
        id.toLowerCase() === building.id.toLowerCase() ||
        building.name.toLowerCase().includes(id.toLowerCase()),
    ),
  );
}

async function resolveCampusId(client: StudentClient, buildingId: string): Promise<string | null> {
  const { data, error } = await client
    .from("buildings")
    .select("campus_id")
    .eq("id", buildingId)
    .maybeSingle();
  if (error) throw error;
  return data?.campus_id ?? null;
}

export async function toggleSaveBuilding(
  buildingId: string,
  campusId?: string,
  client?: StudentClient,
): Promise<boolean> {
  const { client: activeClient, user } = await resolveRemoteUser(client);
  if (!activeClient || !user) {
    const scope = user ? user.id : "guest";
    const currentIds = getLocalSavedBuildingIds(scope);
    const exists = currentIds.includes(buildingId);
    const updatedIds = exists
      ? currentIds.filter((id) => id !== buildingId)
      : [buildingId, ...currentIds.filter((id) => id !== buildingId)];
    writeLocalSavedBuildingIds(updatedIds, scope);
    return !exists;
  }

  const { data: favorites, error: lookupError } = await activeClient
    .from("favorites")
    .select("id, building_id")
    .eq("user_id", user.id);
  if (lookupError) throw lookupError;

  const existing = (favorites ?? []).find((favorite) => favorite.building_id === buildingId);
  if (existing) {
    const { error } = await activeClient
      .from("favorites")
      .delete()
      .eq("id", existing.id)
      .eq("user_id", user.id);
    if (error) throw error;
    return false;
  }

  const resolvedCampusId = campusId ?? (await resolveCampusId(activeClient, buildingId));
  if (!resolvedCampusId) throw new Error("favorite_campus_required");

  const { error } = await activeClient.from("favorites").insert({
    user_id: user.id,
    campus_id: resolvedCampusId,
    building_id: buildingId,
  });
  if (error) throw error;
  return true;
}

export function getRecentDestinations(): RecentDestination[] {
  try {
    const raw = localStorage.getItem(RECENT_DESTINATIONS_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as RecentDestination[];
    }
  } catch {
    // Ignore parse errors.
  }
  return [];
}

export function addRecentDestination(item: { id: string; name: string; code?: string; buildingId?: string }): void {
  try {
    const existing = getRecentDestinations();
    const newItem: RecentDestination = { ...item, timestamp: new Date().toISOString() };
    const updated = [newItem, ...existing.filter((destination) => destination.id !== item.id)].slice(0, 10);
    localStorage.setItem(RECENT_DESTINATIONS_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage errors.
  }
}

export const studentAccountService = {
  getSavedBuildings,
  getSavedBuildingIds,
  getSavedBuildingIdsAsync,
  getSavedBuildingStorageKey,
  toggleSaveBuilding,
  getRecentDestinations,
  addRecentDestination,
};

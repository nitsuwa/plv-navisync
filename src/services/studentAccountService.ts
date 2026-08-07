import type { Building } from "../types";
import { MOCK_BUILDINGS } from "../data/mockData";
import { getSupabase } from "../lib/supabase";
import { campusStructureService } from "./campusStructureService";

const SAVED_BUILDINGS_KEY = "plv_student_saved_buildings_v1";
const RECENT_DESTINATIONS_KEY = "plv_student_recent_destinations_v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface RecentDestination {
  id: string; name: string; code?: string; buildingId?: string; timestamp: string;
}

function localIds(): string[] {
  try { const value = JSON.parse(localStorage.getItem(SAVED_BUILDINGS_KEY) ?? "[]"); return Array.isArray(value) ? value : []; } catch { return []; }
}
function writeLocalIds(ids: string[]) { try { localStorage.setItem(SAVED_BUILDINGS_KEY, JSON.stringify(ids)); } catch { /* offline cache is best effort */ } }

function directoryBuilding(entry: Awaited<ReturnType<typeof campusStructureService.publishedDirectory>>[number]): Building {
  return { id: entry.id, name: entry.name, code: entry.code ?? "", description: "", category: "facility",
    floor_count: 0, created_at: new Date(0).toISOString() };
}

export async function getSavedBuildings(): Promise<Building[]> {
  const supabase = getSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (auth.user) {
    const { data, error } = await supabase.from("favorites").select("building_id").eq("user_id", auth.user.id).not("building_id", "is", null);
    if (!error) {
      const ids = new Set((data ?? []).map((row) => row.building_id).filter((id): id is string => Boolean(id)));
      if (ids.size === 0) return [];
      const directory = await campusStructureService.publishedDirectory();
      return directory.filter((entry) => entry.kind === "building" && ids.has(entry.id)).map(directoryBuilding);
    }
  }
  const ids = localIds();
  return MOCK_BUILDINGS.filter((building) => ids.some((id) => id === building.id || id.toLowerCase() === building.code.toLowerCase()));
}

export async function toggleSaveBuilding(buildingId: string): Promise<boolean> {
  const supabase = getSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (auth.user && UUID.test(buildingId)) {
    const existing = await supabase.from("favorites").select("id").eq("user_id", auth.user.id).eq("building_id", buildingId).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) { const removed = await supabase.from("favorites").delete().eq("id", existing.data.id); if (removed.error) throw removed.error; return false; }
    const directory = (await campusStructureService.publishedDirectory()).find((entry) => entry.id === buildingId && entry.kind === "building");
    if (!directory) throw new Error("Only a building from the published campus map can be saved.");
    const inserted = await supabase.from("favorites").insert({ user_id: auth.user.id, campus_id: directory.campusId, building_id: buildingId });
    if (inserted.error) throw inserted.error;
    return true;
  }
  const ids = localIds(); const exists = ids.includes(buildingId);
  writeLocalIds(exists ? ids.filter((id) => id !== buildingId) : [buildingId, ...ids]);
  return !exists;
}

export function getRecentDestinations(): RecentDestination[] {
  try { const value = JSON.parse(localStorage.getItem(RECENT_DESTINATIONS_KEY) ?? "[]"); return Array.isArray(value) ? value : []; } catch { return []; }
}

export async function listRecentDestinations(): Promise<RecentDestination[]> {
  const supabase = getSupabase(); const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return getRecentDestinations();
  const { data, error } = await supabase.from("recent_destinations").select("building_id,map_element_id,name,code,last_visited_at").eq("user_id", auth.user.id).order("last_visited_at", { ascending: false }).limit(10);
  if (error) throw error;
  return (data ?? []).map((row) => ({ id: row.map_element_id ?? row.building_id!, buildingId: row.building_id ?? undefined,
    name: row.name, code: row.code ?? undefined, timestamp: row.last_visited_at }));
}

export async function addRecentDestination(item: { id: string; name: string; code?: string; buildingId?: string }): Promise<void> {
  const local: RecentDestination = { ...item, timestamp: new Date().toISOString() };
  try { localStorage.setItem(RECENT_DESTINATIONS_KEY, JSON.stringify([local, ...getRecentDestinations().filter((v) => v.id !== item.id)].slice(0, 10))); } catch { /* best effort */ }
  if (!UUID.test(item.id)) return;
  const supabase = getSupabase(); const { data: auth } = await supabase.auth.getUser(); if (!auth.user) return;
  const directory = (await campusStructureService.publishedDirectory()).find((entry) => entry.id === item.id); if (!directory) return;
  const target = directory.kind === "building" ? { building_id: item.id, map_element_id: null } : { building_id: null, map_element_id: item.id };
  const existing = directory.kind === "building"
    ? await supabase.from("recent_destinations").select("id,visit_count").eq("user_id", auth.user.id).eq("building_id", item.id).maybeSingle()
    : await supabase.from("recent_destinations").select("id,visit_count").eq("user_id", auth.user.id).eq("map_element_id", item.id).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) {
    const updated = await supabase.from("recent_destinations").update({ name: item.name, code: item.code ?? null,
      visit_count: existing.data.visit_count + 1, last_visited_at: new Date().toISOString() }).eq("id", existing.data.id);
    if (updated.error) throw updated.error;
  } else {
    const inserted = await supabase.from("recent_destinations").insert({ user_id: auth.user.id, campus_id: directory.campusId,
      ...target, name: item.name, code: item.code ?? null }); if (inserted.error) throw inserted.error;
  }
}

export const studentAccountService = { getSavedBuildings, toggleSaveBuilding, getRecentDestinations, listRecentDestinations, addRecentDestination };

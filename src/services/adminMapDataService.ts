import { getSupabase } from "../lib/supabase";
import type { Tables } from "../types/database.generated";

export interface AdminMapInventory {
  campuses: Tables<"campuses">[];
  buildings: Tables<"buildings">[];
  floors: Tables<"floors">[];
  elements: Tables<"map_elements">[];
  nodes: Tables<"navigation_nodes">[];
  edges: Tables<"navigation_edges">[];
}

/**
 * Current administrator authoring rows. These are read-only consumers of the
 * same normalized tables used by persistence; no Map Builder state or helpers
 * are imported here.
 */
export async function loadAdminMapInventory(): Promise<AdminMapInventory> {
  const client = getSupabase();
  const [campusesResult, buildingsResult, floorsResult, elementsResult, nodesResult, edgesResult] =
    await Promise.all([
      client.from("campuses").select("*").is("archived_at", null).order("name"),
      client.from("buildings").select("*").is("archived_at", null).order("name"),
      client.from("floors").select("*").is("archived_at", null).order("display_order"),
      client.from("map_elements").select("*").is("archived_at", null).order("name"),
      client.from("navigation_nodes").select("*").order("name"),
      client.from("navigation_edges").select("*").order("updated_at", { ascending: false }),
    ]);

  const firstError = [
    campusesResult.error,
    buildingsResult.error,
    floorsResult.error,
    elementsResult.error,
    nodesResult.error,
    edgesResult.error,
  ].find(Boolean);
  if (firstError) throw firstError;

  return {
    campuses: campusesResult.data ?? [],
    buildings: buildingsResult.data ?? [],
    floors: floorsResult.data ?? [],
    elements: elementsResult.data ?? [],
    nodes: nodesResult.data ?? [],
    edges: edgesResult.data ?? [],
  };
}

export const ADMIN_MAP_REALTIME_TABLES = [
  "campuses",
  "buildings",
  "floors",
  "map_elements",
  "navigation_nodes",
  "navigation_edges",
] as const;

export const adminMapDataService = {
  loadInventory: loadAdminMapInventory,
};


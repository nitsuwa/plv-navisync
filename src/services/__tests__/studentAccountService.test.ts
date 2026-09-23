import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database.generated";
import {
  getSavedBuildingIds,
  getSavedBuildingIdsAsync,
  getSavedBuildings,
  getSavedBuildingStorageKey,
  toggleSaveBuilding,
} from "../studentAccountService";

function favoritesClient(rows: Array<{ id?: string; building_id: string | null }> = []) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: rows[0] ?? null, error: null });
  const select = vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle, data: rows, error: null })) }));
  const insert = vi.fn().mockResolvedValue({ error: null });
  const deleteQuery = vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })) }));
  const from = vi.fn(() => ({ select, insert, delete: deleteQuery }));
  const getUser = vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  return {
    client: { auth: { getUser }, from } as unknown as SupabaseClient<Database>,
    getUser,
    from,
    insert,
    deleteQuery,
  };
}

describe("student account favorites", () => {
  beforeEach(() => localStorage.clear());

  it("starts with no demo favorites", () => {
    expect(getSavedBuildingIds()).toEqual([]);
  });

  it("uses an account-scoped local fallback", () => {
    localStorage.setItem(getSavedBuildingStorageKey("user-1"), JSON.stringify(["b1"]));
    expect(getSavedBuildingIds("user-1")).toEqual(["b1"]);
  });

  it("loads authenticated favorite IDs from the existing favorites table", async () => {
    const { client, from } = favoritesClient([{ building_id: "b1" }, { building_id: "b2" }]);
    await expect(getSavedBuildingIdsAsync(client)).resolves.toEqual(["b1", "b2"]);
    expect(from).toHaveBeenCalledWith("favorites");
  });

  it("inserts and removes one canonical remote favorite", async () => {
    const { client, insert } = favoritesClient([]);
    await expect(toggleSaveBuilding("b1", "campus-1", client)).resolves.toBe(true);
    expect(insert).toHaveBeenCalledWith({ user_id: "user-1", campus_id: "campus-1", building_id: "b1" });
  });

  it("resolves saved building records from IDs without seeded demo data", async () => {
    const { client } = favoritesClient([{ building_id: "b2" }]);
    await expect(getSavedBuildings([
      { id: "b1", code: "B1", name: "One" } as any,
      { id: "b2", code: "B2", name: "Two" } as any,
    ], client)).resolves.toEqual([expect.objectContaining({ id: "b2" })]);
  });
});

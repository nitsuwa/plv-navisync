/**
 * Building service — uses Supabase when connected, mock data otherwise.
 *
 * ✅ Works immediately after connecting Supabase — no code changes needed!
 * Just set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.
 */

import { getAll, getById, create, update, remove, seedMockData } from "./database";
import { MOCK_BUILDINGS } from "../data/mockData";
import type { DbBuilding, PaginatedResponse } from "./types";

// Seed mock data on first import
seedMockData("buildings", MOCK_BUILDINGS as unknown as DbBuilding[]);

/**
 * List buildings with pagination, search, and filtering.
 * This is the method expected by useDataList in AdminBuildingsPage.
 */
async function list(params: {
  page: number;
  pageSize: number;
  search: string;
  filter?: Record<string, string>;
}): Promise<PaginatedResponse<DbBuilding>> {
  const all = await getAll<DbBuilding>("buildings", { orderBy: "name", ascending: true });
  
  // Apply search filter by name, code, or description
  let filtered = all;
  if (params.search) {
    const q = params.search.toLowerCase();
    filtered = all.filter(
      (b) =>
        b.name?.toLowerCase().includes(q) ||
        b.code?.toLowerCase().includes(q) ||
        b.description?.toLowerCase().includes(q) ||
        b.category?.toLowerCase().includes(q)
    );
  }

  // Apply category filter
  if (params.filter?.category) {
    filtered = filtered.filter((b) => b.category === params.filter!.category);
  }

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / params.pageSize));
  const start = (params.page - 1) * params.pageSize;
  const data = filtered.slice(start, start + params.pageSize);

  return {
    data,
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages,
  };
}

export const buildingService = {
  list,
  getAll: () => getAll<DbBuilding>("buildings", { orderBy: "name", ascending: true }),
  getById: (id: string) => getById<DbBuilding>("buildings", id),
  create: (item: Omit<DbBuilding, "id" | "created_at" | "updated_at">) =>
    create<DbBuilding>("buildings", item),
  update: (id: string, updates: Partial<DbBuilding>) =>
    update<DbBuilding>("buildings", id, updates),
  delete: (id: string) => remove("buildings", id),
};

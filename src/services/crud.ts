/**
 * Generic CRUD service factory.
 *
 * Delegates to the unified database.ts layer so all services share
 * one mock store. When Supabase is connected, database.ts swaps to
 * real API calls automatically.
 *
 * Entity services use this internally:
 * ```
 * export const buildingService = getCrudService<DbBuilding>("buildings");
 * ```
 */

import { DEFAULTS } from "../config/constants";
import { isConnected } from "../lib/supabase";
import { getAll, getById, create, update, remove, seedMockData } from "./database";
import type { PaginatedResponse } from "./types";

// Re-export seedMockData for backward compatibility
export { seedMockData };

// ── Mock CRUD implementation (uses database.ts unified store) ──────────────

function createMockService<T extends { id: string }>(table: string) {
  return {
    async list(params?: {
      page?: number;
      pageSize?: number;
      search?: string;
      filter?: Record<string, string>;
    }): Promise<PaginatedResponse<T>> {
      const page = params?.page ?? 1;
      const pageSize = params?.pageSize ?? DEFAULTS.PAGE_SIZE;
      let data = await getAll<T>(table);

      if (params?.search) {
        const q = params.search.toLowerCase();
        data = data.filter((item) => JSON.stringify(item).toLowerCase().includes(q));
      }

      if (params?.filter) {
        data = data.filter((item) =>
          Object.entries(params.filter!).every(
            ([key, val]) => (item as any)[key]?.toString().toLowerCase() === val.toLowerCase()
          )
        );
      }

      const total = data.length;
      const start = (page - 1) * pageSize;
      const paged = data.slice(start, start + pageSize);

      return { data: paged, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
    },

    getById: (id: string) => getById<T>(table, id),

    create: (item: Omit<T, "id">) => create<T>(table, item as any),

    async update(id: string, changes: Partial<T>): Promise<T | null> {
      try {
        return await update<T>(table, id, changes);
      } catch {
        return null;
      }
    },

    async remove(id: string): Promise<boolean> {
      try {
        await remove(table, id);
        return true;
      } catch {
        return false;
      }
    },

    async count(filter?: Record<string, string>): Promise<number> {
      let data = await getAll<T>(table);
      if (filter) {
        data = data.filter((item) =>
          Object.entries(filter).every(([key, val]) => (item as any)[key]?.toString() === val)
        );
      }
      return data.length;
    },
  };
}

// ── Public factory ─────────────────────────────────────────────────────────

export function getCrudService<T extends { id: string }>(table: string) {
  return createMockService<T>(table);
}

// Legacy alias
export const createCrudService = getCrudService;

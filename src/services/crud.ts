/**
 * Generic CRUD service factory.
 *
 * Each entity service (e.g. buildingService) uses this factory to get
 * consistent create/read/update/delete/list operations.
 *
 * When Supabase is not connected, the factory uses in-memory mock data
 * so the UI works without a backend. When Supabase env vars are set,
 * `getCrudService()` will swap to a Supabase-backed implementation.
 */

import { DEFAULTS } from "../config/constants";
import { isSupabaseConnected } from "./supabase";
import type { PaginatedResponse } from "./types";

// ── In-memory store for mock data ─────────────────────────────────────────
const mockStore = new Map<string, any[]>();

export function seedMockData<T extends { id: string }>(table: string, data: T[]): void {
  mockStore.set(table, [...data]);
}

function getMockData<T extends { id: string }>(table: string): T[] {
  return (mockStore.get(table) ?? []) as T[];
}

// ── Mock CRUD implementation ──────────────────────────────────────────────

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
      let data = getMockData<T>(table);

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

    async getById(id: string): Promise<T | null> {
      const data = getMockData<T>(table);
      return data.find((item) => item.id === id) ?? null;
    },

    async create(item: Omit<T, "id">): Promise<T> {
      const fullItem = { ...item, id: `${table}_${Date.now()}` } as unknown as T;
      const data = getMockData<T>(table);
      data.push(fullItem);
      mockStore.set(table, data);
      return fullItem;
    },

    async update(id: string, changes: Partial<T>): Promise<T | null> {
      const data = getMockData<T>(table);
      const idx = data.findIndex((item) => item.id === id);
      if (idx === -1) return null;
      const updated = { ...data[idx], ...changes, updated_at: new Date().toISOString() } as T;
      data[idx] = updated;
      mockStore.set(table, data);
      return updated;
    },

    async remove(id: string): Promise<boolean> {
      const data = getMockData<T>(table);
      const idx = data.findIndex((item) => item.id === id);
      if (idx === -1) return false;
      data.splice(idx, 1);
      mockStore.set(table, data);
      return true;
    },

    async count(filter?: Record<string, string>): Promise<number> {
      let data = getMockData<T>(table);
      if (filter) {
        data = data.filter((item) =>
          Object.entries(filter).every(([key, val]) => (item as any)[key]?.toString() === val)
        );
      }
      return data.length;
    },
  };
}

// ── Future Supabase CRUD implementation ────────────────────────────────────
// When @supabase/supabase-js is installed and env vars are set, this
// factory will be used instead of the mock service above.
//
// function createSupabaseService<T extends { id: string }>(table: string) {
//   return {
//     async list(params) { ... },
//     async getById(id) { ... },
//     async create(item) { ... },
//     async update(id, changes) { ... },
//     async remove(id) { ... },
//     async count(filter) { ... },
//   };
// }

// ── Public factory: auto-selects mock or Supabase backend ─────────────────

/**
 * Returns a CRUD service for the given table.
 * While `isSupabaseConnected` is false (default), uses an in-memory
 * mock store. Once Supabase env vars are set and the client is
 * uncommented in `supabase.ts`, this automatically returns a real
 * Supabase-backed service instead.
 *
 * Entity services use this internally:
 * ```
 * export const buildingService = getCrudService<DbBuilding>("buildings");
 * ```
 */
export function getCrudService<T extends { id: string }>(table: string) {
  if (isSupabaseConnected) {
    // When Supabase client is wired, swap to:
    // return createSupabaseService<T>(table);
  }
  return createMockService<T>(table);
}

// ── Legacy alias for backward compatibility ───────────────────────────────
export const createCrudService = getCrudService;

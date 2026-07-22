/**
 * Typed database operations for PLV NaviSync.
 *
 * Each function tries Supabase first. If Supabase is not configured,
 * it falls back to the mock in-memory store (which was populated by
 * the seed scripts in each service file).
 *
 * This means you can develop locally with mock data, then switch to
 * real data by just setting your .env file.
 */

import { supabase, isConnected } from "../lib/supabase";
import { TABLES } from "../config/constants";

// ── In-memory mock store (fallback when Supabase is not connected) ────────
const mockStore = new Map<string, any[]>();

export function seedMockData(table: string, data: any[]) {
  if (!mockStore.has(table)) {
    mockStore.set(table, [...data]);
  }
}

// ── Generic CRUD operations ──────────────────────────────────────────────

export async function getAll<T extends { id: string }>(
  table: string,
  options?: { orderBy?: string; ascending?: boolean }
): Promise<T[]> {
  if (isConnected && supabase) {
    const query = supabase.from(table).select("*");
    if (options?.orderBy) {
      query.order(options.orderBy, { ascending: options.ascending ?? true });
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as T[];
  }
  // Mock fallback
  const items = mockStore.get(table) ?? [];
  if (options?.orderBy) {
    const key = options.orderBy as keyof T;
    items.sort((a, b) => {
      if (a[key] < b[key]) return options.ascending !== false ? -1 : 1;
      if (a[key] > b[key]) return options.ascending !== false ? 1 : -1;
      return 0;
    });
  }
  return items as T[];
}

export async function getById<T extends { id: string }>(
  table: string,
  id: string
): Promise<T | null> {
  if (isConnected && supabase) {
    const { data, error } = await supabase.from(table).select("*").eq("id", id).single();
    if (error) throw error;
    return data as T;
  }
  const items = mockStore.get(table) ?? [];
  return (items.find((i) => i.id === id) as T) ?? null;
}

export async function create<T extends { id: string }>(
  table: string,
  item: Omit<T, "id" | "created_at" | "updated_at">
): Promise<T> {
  if (isConnected && supabase) {
    const { data, error } = await supabase
      .from(table)
      .insert({ ...item, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .select()
      .single();
    if (error) throw error;
    return data as T;
  }
  const newItem = {
    ...item,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as unknown as T;
  const items = mockStore.get(table) ?? [];
  items.push(newItem);
  mockStore.set(table, items);
  return newItem;
}

export async function update<T extends { id: string }>(
  table: string,
  id: string,
  updates: Partial<T>
): Promise<T> {
  if (isConnected && supabase) {
    const { data, error } = await supabase
      .from(table)
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data as T;
  }
  const items = mockStore.get(table) ?? [];
  const index = items.findIndex((i) => i.id === id);
  if (index === -1) throw new Error(`[DB] ${table} item ${id} not found`);
  items[index] = { ...items[index], ...updates, updated_at: new Date().toISOString() };
  mockStore.set(table, items);
  return items[index] as T;
}

export async function remove(
  table: string,
  id: string
): Promise<void> {
  if (isConnected && supabase) {
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) throw error;
    return;
  }
  const items = mockStore.get(table) ?? [];
  const index = items.findIndex((i) => i.id === id);
  if (index !== -1) {
    items.splice(index, 1);
    mockStore.set(table, items);
  }
}

// ── Specialized queries ──────────────────────────────────────────────────

export async function searchBuildings(query: string): Promise<any[]> {
  const all = await getAll<any>("buildings");
  const q = query.toLowerCase();
  return all.filter(
    (b: any) =>
      b.name?.toLowerCase().includes(q) ||
      b.code?.toLowerCase().includes(q) ||
      b.category?.toLowerCase().includes(q)
  );
}

export async function getBuildingsByCategory(category: string): Promise<any[]> {
  const all = await getAll<any>("buildings");
  return all.filter((b: any) => b.category === category);
}

export async function getAnnouncementsByPriority(priority: string): Promise<any[]> {
  const all = await getAll<any>("announcements", { orderBy: "published_at", ascending: false });
  if (priority === "all") return all;
  return all.filter((a: any) => a.priority === priority);
}

// ── Export mock store for direct access (used by service files) ──────────
export { mockStore };

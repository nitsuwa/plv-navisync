import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Building2, Layers3, Map, Search, ShieldCheck } from "lucide-react";
import { EmptyState } from "../components/ui/EmptyState";
import { TablePageSkeleton } from "../components/ui/PageSkeleton";
import { LiveDataStatus } from "../components/admin/LiveDataStatus";
import { cn } from "../lib/utils";
import { useSupabaseRealtimeData } from "../hooks/useSupabaseRealtimeData";
import {
  ADMIN_MAP_REALTIME_TABLES,
  loadAdminMapInventory,
} from "../services/adminMapDataService";

const ROOM_TYPES = new Set([
  "room", "classroom", "laboratory", "office", "restroom", "clinic",
  "library", "canteen", "information_desk", "storage", "custom",
]);

export function AdminBuildingsPage() {
  const [search, setSearch] = useState("");
  const [campusFilter, setCampusFilter] = useState("all");
  const live = useSupabaseRealtimeData({
    channel: "buildings-inventory",
    tables: ADMIN_MAP_REALTIME_TABLES,
    load: loadAdminMapInventory,
  });

  const rows = useMemo(() => {
    if (!live.data) return [];
    const campuses = new Map(live.data.campuses.map((campus) => [campus.id, campus]));
    return live.data.buildings.map((building) => {
      const floors = live.data!.floors.filter((floor) => floor.building_id === building.id);
      const rooms = live.data!.elements.filter(
        (element) => element.building_id === building.id && ROOM_TYPES.has(element.element_type),
      );
      return { building, campus: campuses.get(building.campus_id), floors: floors.length, rooms: rooms.length };
    });
  }, [live.data]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter(({ building, campus }) => {
      if (campusFilter !== "all" && building.campus_id !== campusFilter) return false;
      if (!query) return true;
      return [building.name, building.code, building.category, campus?.name]
        .some((value) => value?.toLowerCase().includes(query));
    });
  }, [campusFilter, rows, search]);

  if (live.loading && !live.data) return <TablePageSkeleton rows={6} />;

  const accessible = rows.filter(({ building }) => building.is_accessible).length;
  const visible = rows.filter(({ building }) => building.is_visible).length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">Buildings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live building inventory from the administrator authoring database.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <LiveDataStatus connected={live.realtimeConnected} refreshing={live.refreshing} lastUpdatedAt={live.lastUpdatedAt} onRefresh={() => void live.refresh()} />
          <Link to="/admin-dashboard/map-builder" className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground hover:bg-primary/90">
            <Map className="h-3.5 w-3.5" /> Open Map Builder
          </Link>
        </div>
      </div>

      {live.error && <div className="rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">{live.error}</div>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Buildings", value: rows.length, icon: Building2 },
          { label: "Visible", value: visible, icon: ShieldCheck },
          { label: "Accessible", value: accessible, icon: ShieldCheck },
          { label: "Floors", value: live.data?.floors.length ?? 0, icon: Layers3 },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between"><p className="text-xs font-bold text-muted-foreground">{label}</p><Icon className="h-4 w-4 text-primary" /></div>
            <p className="text-2xl font-extrabold text-foreground">{value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row">
        <label className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search building, code, category, or campus" className="h-10 w-full rounded-xl border border-border bg-input-background pl-9 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30" />
        </label>
        <select value={campusFilter} onChange={(event) => setCampusFilter(event.target.value)} className="h-10 rounded-xl border border-border bg-input-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30">
          <option value="all">All campuses</option>
          {live.data?.campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Building2} title="No buildings found" description="No live database rows match the current filters." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead className="border-b border-border bg-muted/40 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground"><tr><th className="px-4 py-3">Building</th><th className="px-4 py-3">Campus</th><th className="px-4 py-3">Category</th><th className="px-4 py-3 text-center">Floors</th><th className="px-4 py-3 text-center">Rooms</th><th className="px-4 py-3">Status</th></tr></thead>
              <tbody className="divide-y divide-border">
                {filtered.map(({ building, campus, floors, rooms }) => (
                  <tr key={building.id} className="hover:bg-muted/25">
                    <td className="px-4 py-3"><p className="text-sm font-bold text-foreground">{building.name}</p><p className="mt-0.5 text-[11px] font-mono text-muted-foreground">{building.code}</p></td>
                    <td className="px-4 py-3 text-sm text-foreground">{campus?.name ?? "Unknown campus"}</td>
                    <td className="px-4 py-3 text-sm capitalize text-foreground">{building.category}</td>
                    <td className="px-4 py-3 text-center text-sm font-bold text-foreground">{floors}</td>
                    <td className="px-4 py-3 text-center text-sm font-bold text-foreground">{rooms}</td>
                    <td className="px-4 py-3"><span className={cn("rounded-full px-2 py-1 text-[10px] font-bold", building.is_visible ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground")}>{building.is_visible ? "Visible" : "Hidden"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

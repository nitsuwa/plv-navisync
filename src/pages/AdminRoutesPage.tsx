import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Accessibility, AlertTriangle, Map, Route, Search, Waypoints } from "lucide-react";
import { LiveDataStatus } from "../components/admin/LiveDataStatus";
import { EmptyState } from "../components/ui/EmptyState";
import { TablePageSkeleton } from "../components/ui/PageSkeleton";
import { useSupabaseRealtimeData } from "../hooks/useSupabaseRealtimeData";
import { ADMIN_MAP_REALTIME_TABLES, loadAdminMapInventory } from "../services/adminMapDataService";

export function AdminRoutesPage() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const live = useSupabaseRealtimeData({ channel: "navigation-routes", tables: ADMIN_MAP_REALTIME_TABLES, load: loadAdminMapInventory });

  const routes = useMemo(() => {
    if (!live.data) return [];
    const nodes = new Map(live.data.nodes.map((node) => [node.id, node]));
    const campuses = new Map(live.data.campuses.map((campus) => [campus.id, campus.name]));
    const buildings = new Map(live.data.buildings.map((building) => [building.id, building.name]));
    const floors = new Map(live.data.floors.map((floor) => [floor.id, floor.name]));
    return live.data.edges.map((edge) => {
      const from = nodes.get(edge.from_node_id);
      const to = nodes.get(edge.to_node_id);
      const buildingId = from?.building_id ?? to?.building_id ?? null;
      const floorId = from?.floor_id ?? to?.floor_id ?? null;
      return {
        edge,
        from,
        to,
        campusName: campuses.get(edge.campus_id) ?? "Unknown campus",
        buildingName: buildingId ? buildings.get(buildingId) ?? "Unknown building" : "Outdoor campus",
        floorName: floorId ? floors.get(floorId) ?? "Unknown floor" : "Campus level",
      };
    });
  }, [live.data]);

  const types = useMemo(() => [...new Set(routes.map((route) => route.edge.edge_type))].sort(), [routes]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return routes.filter((route) => {
      if (typeFilter !== "all" && route.edge.edge_type !== typeFilter) return false;
      if (!query) return true;
      return [route.from?.name, route.to?.name, route.campusName, route.buildingName, route.floorName, route.edge.edge_type]
        .some((value) => value?.toLowerCase().includes(query));
    });
  }, [routes, search, typeFilter]);

  if (live.loading && !live.data) return <TablePageSkeleton rows={6} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-extrabold text-foreground">Navigation Routes</h1><p className="mt-1 text-sm text-muted-foreground">Live navigation edges resolved against their current database nodes.</p></div>
        <div className="flex items-center gap-2"><LiveDataStatus connected={live.realtimeConnected} refreshing={live.refreshing} lastUpdatedAt={live.lastUpdatedAt} onRefresh={() => void live.refresh()} /><Link to="/admin-dashboard/map-builder" className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground hover:bg-primary/90"><Map className="h-3.5 w-3.5" /> Edit network</Link></div>
      </div>

      {live.error && <div className="rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">{live.error}</div>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Route segments", value: routes.length, icon: Route },
          { label: "Waypoints", value: live.data?.nodes.length ?? 0, icon: Waypoints },
          { label: "Accessible", value: routes.filter((route) => route.edge.is_accessible).length, icon: Accessibility },
          { label: "Temporarily closed", value: routes.filter((route) => route.edge.is_temporarily_closed).length, icon: AlertTriangle },
        ].map(({ label, value, icon: Icon }) => <div key={label} className="rounded-2xl border border-border bg-card p-4 shadow-sm"><div className="mb-2 flex items-center justify-between"><p className="text-xs font-bold text-muted-foreground">{label}</p><Icon className="h-4 w-4 text-primary" /></div><p className="text-2xl font-extrabold text-foreground">{value}</p></div>)}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row">
        <label className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search endpoints, campus, building, or floor" className="h-10 w-full rounded-xl border border-border bg-input-background pl-9 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30" /></label>
        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="h-10 rounded-xl border border-border bg-input-background px-3 text-sm capitalize text-foreground outline-none focus:ring-2 focus:ring-primary/30"><option value="all">All route types</option>{types.map((type) => <option key={type} value={type}>{type}</option>)}</select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Route} title="No route segments found" description="No live navigation edges match the current filters." />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {filtered.map(({ edge, from, to, campusName, buildingName, floorName }) => (
            <article key={edge.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-extrabold text-foreground">{from?.name ?? from?.node_type ?? "Unknown node"} <span className="text-muted-foreground">→</span> {to?.name ?? to?.node_type ?? "Unknown node"}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-primary">{edge.edge_type}</p></div><span className={`rounded-full px-2 py-1 text-[9px] font-bold ${edge.is_temporarily_closed ? "bg-red-500/10 text-red-600" : "bg-emerald-500/10 text-emerald-600"}`}>{edge.is_temporarily_closed ? "Closed" : "Active"}</span></div>
              <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-muted/35 p-3 text-xs"><div><p className="text-[9px] font-bold uppercase text-muted-foreground">Distance</p><p className="font-extrabold text-foreground">{edge.distance_m.toFixed(1)} m</p></div><div><p className="text-[9px] font-bold uppercase text-muted-foreground">Direction</p><p className="font-extrabold text-foreground">{edge.is_bidirectional ? "Two-way" : "One-way"}</p></div></div>
              <div className="mt-3 space-y-1 text-[11px] text-muted-foreground"><p>{campusName}</p><p>{buildingName} · {floorName}</p><div className="flex flex-wrap gap-1.5 pt-1">{edge.is_accessible && <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-bold text-emerald-600">Accessible</span>}{edge.is_emergency_safe && <span className="rounded bg-blue-500/10 px-1.5 py-0.5 font-bold text-blue-600">Emergency safe</span>}</div></div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

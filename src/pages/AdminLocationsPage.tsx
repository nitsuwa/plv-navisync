import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Accessibility, Building2, Map, MapPin, Search } from "lucide-react";
import { LiveDataStatus } from "../components/admin/LiveDataStatus";
import { EmptyState } from "../components/ui/EmptyState";
import { ListCardSkeleton } from "../components/ui/PageSkeleton";
import { useSupabaseRealtimeData } from "../hooks/useSupabaseRealtimeData";
import { ADMIN_MAP_REALTIME_TABLES, loadAdminMapInventory } from "../services/adminMapDataService";

const STRUCTURAL_TYPES = new Set(["wall", "window", "door", "furniture"]);

export function AdminLocationsPage() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const live = useSupabaseRealtimeData({
    channel: "campus-locations",
    tables: ADMIN_MAP_REALTIME_TABLES,
    load: loadAdminMapInventory,
  });

  const locations = useMemo(() => {
    if (!live.data) return [];
    const campuses = new Map(live.data.campuses.map((row) => [row.id, row.name]));
    const buildings = new Map(live.data.buildings.map((row) => [row.id, row.name]));
    const floors = new Map(live.data.floors.map((row) => [row.id, row.name]));
    return live.data.elements
      .filter((element) => !STRUCTURAL_TYPES.has(element.element_type))
      .map((element) => ({
        ...element,
        campusName: campuses.get(element.campus_id) ?? "Unknown campus",
        buildingName: element.building_id ? buildings.get(element.building_id) ?? "Unknown building" : "Outdoor",
        floorName: element.floor_id ? floors.get(element.floor_id) ?? "Unknown floor" : "Campus level",
      }));
  }, [live.data]);

  const types = useMemo(() => [...new Set(locations.map((location) => location.element_type))].sort(), [locations]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return locations.filter((location) => {
      if (typeFilter !== "all" && location.element_type !== typeFilter) return false;
      if (!query) return true;
      return [location.name, location.code, location.campusName, location.buildingName, location.floorName]
        .some((value) => value?.toLowerCase().includes(query));
    });
  }, [locations, search, typeFilter]);

  if (live.loading && !live.data) return <ListCardSkeleton cards={6} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">Campus Locations</h1>
          <p className="mt-1 text-sm text-muted-foreground">Live searchable rooms, facilities, and circulation assets from map elements.</p>
        </div>
        <div className="flex items-center gap-2">
          <LiveDataStatus connected={live.realtimeConnected} refreshing={live.refreshing} lastUpdatedAt={live.lastUpdatedAt} onRefresh={() => void live.refresh()} />
          <Link to="/admin-dashboard/map-builder" className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground hover:bg-primary/90"><Map className="h-3.5 w-3.5" /> Manage in Map Builder</Link>
        </div>
      </div>

      {live.error && <div className="rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">{live.error}</div>}

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Live locations", value: locations.length, icon: MapPin },
          { label: "Location types", value: types.length, icon: Building2 },
          { label: "Accessible", value: locations.filter((item) => item.is_accessible).length, icon: Accessibility },
        ].map(({ label, value, icon: Icon }) => <div key={label} className="rounded-2xl border border-border bg-card p-4 shadow-sm"><div className="mb-2 flex items-center justify-between"><p className="text-xs font-bold text-muted-foreground">{label}</p><Icon className="h-4 w-4 text-primary" /></div><p className="text-2xl font-extrabold text-foreground">{value}</p></div>)}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row">
        <label className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search locations" className="h-10 w-full rounded-xl border border-border bg-input-background pl-9 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30" /></label>
        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="h-10 rounded-xl border border-border bg-input-background px-3 text-sm capitalize text-foreground outline-none focus:ring-2 focus:ring-primary/30"><option value="all">All types</option>{types.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={MapPin} title="No locations found" description="No live map elements match the current filters." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((location) => (
            <article key={location.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><MapPin className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-sm font-extrabold text-foreground">{location.name}</h2>{location.is_accessible && <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-600">Accessible</span>}</div><p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-primary">{location.element_type.replaceAll("_", " ")}</p></div>
              </div>
              <div className="mt-4 space-y-1.5 border-t border-border pt-3 text-xs text-muted-foreground"><p><span className="font-bold text-foreground">Campus:</span> {location.campusName}</p><p><span className="font-bold text-foreground">Building:</span> {location.buildingName}</p><p><span className="font-bold text-foreground">Floor:</span> {location.floorName}</p><p className="font-mono text-[10px]">Position {Math.round(location.x)}, {Math.round(location.y)}</p></div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

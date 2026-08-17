import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Building2, FileImage, Layers3, Map, Shapes } from "lucide-react";
import { LiveDataStatus } from "../components/admin/LiveDataStatus";
import { EmptyState } from "../components/ui/EmptyState";
import { TablePageSkeleton } from "../components/ui/PageSkeleton";
import { useSupabaseRealtimeData } from "../hooks/useSupabaseRealtimeData";
import { ADMIN_MAP_REALTIME_TABLES, loadAdminMapInventory } from "../services/adminMapDataService";

export function AdminFloorPlansPage() {
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const live = useSupabaseRealtimeData({
    channel: "floor-plans-inventory",
    tables: ADMIN_MAP_REALTIME_TABLES,
    load: loadAdminMapInventory,
  });

  const buildings = useMemo(() => {
    if (!live.data) return [];
    const campuses = new Map(live.data.campuses.map((campus) => [campus.id, campus.name]));
    return live.data.buildings
      .map((building) => ({
        building,
        campusName: campuses.get(building.campus_id) ?? "Unknown campus",
        floors: live.data!.floors.filter((floor) => floor.building_id === building.id),
      }))
      .filter((row) => row.floors.length > 0);
  }, [live.data]);

  const selected = buildings.find((row) => row.building.id === selectedBuildingId) ?? buildings[0] ?? null;
  const selectedFloors = useMemo(() => {
    if (!selected || !live.data) return [];
    return [...selected.floors]
      .sort((a, b) => a.display_order - b.display_order || a.floor_number - b.floor_number)
      .map((floor) => {
        const elements = live.data!.elements.filter((element) => element.floor_id === floor.id);
        const byType = new Map<string, number>();
        elements.forEach((element) => byType.set(element.element_type, (byType.get(element.element_type) ?? 0) + 1));
        return { floor, elements, byType };
      });
  }, [live.data, selected]);

  if (live.loading && !live.data) return <TablePageSkeleton rows={6} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-extrabold text-foreground">Floor Plans</h1><p className="mt-1 text-sm text-muted-foreground">Live floor and authored-element inventory from Supabase.</p></div>
        <div className="flex items-center gap-2"><LiveDataStatus connected={live.realtimeConnected} refreshing={live.refreshing} lastUpdatedAt={live.lastUpdatedAt} onRefresh={() => void live.refresh()} /><Link to="/admin-dashboard/map-builder" className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground hover:bg-primary/90"><Map className="h-3.5 w-3.5" /> Edit in Map Builder</Link></div>
      </div>

      {live.error && <div className="rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">{live.error}</div>}

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Buildings with floors", value: buildings.length, icon: Building2 },
          { label: "Active floors", value: live.data?.floors.filter((floor) => floor.is_visible).length ?? 0, icon: Layers3 },
          { label: "Floor elements", value: live.data?.elements.filter((element) => element.floor_id).length ?? 0, icon: Shapes },
        ].map(({ label, value, icon: Icon }) => <div key={label} className="rounded-2xl border border-border bg-card p-4 shadow-sm"><div className="mb-2 flex items-center justify-between"><p className="text-xs font-bold text-muted-foreground">{label}</p><Icon className="h-4 w-4 text-primary" /></div><p className="text-2xl font-extrabold text-foreground">{value}</p></div>)}
      </div>

      {buildings.length === 0 ? (
        <EmptyState icon={FileImage} title="No floor plans found" description="The live database has no active floors yet." />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
          <aside className="rounded-2xl border border-border bg-card p-3 shadow-sm">
            <p className="px-2 pb-2 text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Buildings</p>
            <div className="space-y-1">
              {buildings.map((row) => {
                const active = selected?.building.id === row.building.id;
                return <button key={row.building.id} type="button" onClick={() => setSelectedBuildingId(row.building.id)} className={`w-full rounded-xl px-3 py-2.5 text-left transition-colors ${active ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}><p className="truncate text-sm font-bold">{row.building.name}</p><p className={`mt-0.5 text-[10px] ${active ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{row.campusName} · {row.floors.length} floors</p></button>;
              })}
            </div>
          </aside>

          <section className="space-y-3">
            <div className="rounded-2xl border border-border bg-card px-5 py-4 shadow-sm"><h2 className="font-extrabold text-foreground">{selected?.building.name}</h2><p className="mt-1 text-xs text-muted-foreground">{selected?.building.code} · {selected?.campusName}</p></div>
            {selectedFloors.map(({ floor, elements, byType }) => (
              <article key={floor.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-sm font-extrabold text-foreground">{floor.name}</h3><p className="mt-1 text-[11px] text-muted-foreground">Floor {floor.floor_number} · {floor.canvas_width} × {floor.canvas_height} canvas</p></div><div className="flex items-center gap-2"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${floor.is_visible ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}>{floor.is_visible ? "Visible" : "Hidden"}</span>{floor.floor_plan_path && <span title="Uploaded floor plan"><FileImage className="h-4 w-4 text-primary" /></span>}</div></div>
                <div className="mt-4 flex flex-wrap gap-2">{byType.size === 0 ? <span className="text-xs text-muted-foreground">No authored elements</span> : [...byType.entries()].sort().map(([type, count]) => <span key={type} className="rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-[10px] font-bold capitalize text-foreground">{type.replaceAll("_", " ")} · {count}</span>)}</div>
                <p className="mt-3 text-xs font-semibold text-muted-foreground">{elements.length} total elements</p>
              </article>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}

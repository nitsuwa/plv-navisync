import { useMemo } from "react";
import { Link } from "react-router";
import { Accessibility, ArrowUpDown, Building2, CheckCircle2, Map, Route, Triangle } from "lucide-react";
import { LiveDataStatus } from "../components/admin/LiveDataStatus";
import { EmptyState } from "../components/ui/EmptyState";
import { ListCardSkeleton } from "../components/ui/PageSkeleton";
import { cn } from "../lib/utils";
import { useSupabaseRealtimeData } from "../hooks/useSupabaseRealtimeData";
import { ADMIN_MAP_REALTIME_TABLES, loadAdminMapInventory } from "../services/adminMapDataService";

export function AdminAccessibilityPage() {
  const live = useSupabaseRealtimeData({ channel: "accessibility-inventory", tables: ADMIN_MAP_REALTIME_TABLES, load: loadAdminMapInventory });

  const buildings = useMemo(() => {
    if (!live.data) return [];
    const campuses = new Map(live.data.campuses.map((campus) => [campus.id, campus.name]));
    const nodes = new Map(live.data.nodes.map((node) => [node.id, node]));
    return live.data.buildings.map((building) => {
      const elements = live.data!.elements.filter((element) => element.building_id === building.id && element.is_visible);
      const buildingNodes = live.data!.nodes.filter((node) => node.building_id === building.id && node.is_active);
      const edges = live.data!.edges.filter((edge) => nodes.get(edge.from_node_id)?.building_id === building.id || nodes.get(edge.to_node_id)?.building_id === building.id);
      const accessibleEdges = edges.filter((edge) => edge.is_accessible && !edge.is_temporarily_closed);
      const ramps = elements.filter((element) => element.element_type === "ramp" && element.is_accessible);
      const elevators = elements.filter((element) => element.element_type === "elevator" && element.is_accessible);
      const accessibleEntrances = buildingNodes.filter((node) => node.node_type === "entrance" && node.is_accessible);
      const accessibleRooms = elements.filter((element) => element.is_accessible && !["ramp", "elevator", "stairs"].includes(element.element_type));
      const routeCoverage = edges.length === 0 ? 0 : Math.round((accessibleEdges.length / edges.length) * 100);
      const checks = [building.is_accessible, ramps.length > 0, elevators.length > 0, accessibleEntrances.length > 0, routeCoverage >= 75];
      const score = checks.filter(Boolean).length;
      return { building, campusName: campuses.get(building.campus_id) ?? "Unknown campus", ramps, elevators, accessibleEntrances, accessibleRooms, edges, accessibleEdges, routeCoverage, score };
    });
  }, [live.data]);

  if (live.loading && !live.data) return <ListCardSkeleton cards={6} />;
  const compliant = buildings.filter((row) => row.score >= 4).length;
  const partial = buildings.filter((row) => row.score >= 2 && row.score < 4).length;
  const needsWork = buildings.filter((row) => row.score < 2).length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-extrabold text-foreground">Accessibility</h1><p className="mt-1 text-sm text-muted-foreground">Live accessibility coverage derived from buildings, map assets, nodes, and route edges.</p></div>
        <div className="flex items-center gap-2"><LiveDataStatus connected={live.realtimeConnected} refreshing={live.refreshing} lastUpdatedAt={live.lastUpdatedAt} onRefresh={() => void live.refresh()} /><Link to="/admin-dashboard/map-builder" className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground hover:bg-primary/90"><Map className="h-3.5 w-3.5" /> Edit accessibility</Link></div>
      </div>

      {live.error && <div className="rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">{live.error}</div>}

      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between"><p className="text-sm font-bold text-foreground">Live compliance overview</p><p className="text-xs text-muted-foreground">{buildings.length} buildings</p></div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: "Strong coverage", value: compliant, color: "text-emerald-600 bg-emerald-500/10" },
            { label: "Partial coverage", value: partial, color: "text-amber-600 bg-amber-500/10" },
            { label: "Needs work", value: needsWork, color: "text-red-600 bg-red-500/10" },
          ].map((item) => <div key={item.label} className={cn("rounded-xl p-3", item.color)}><p className="text-2xl font-extrabold">{item.value}</p><p className="text-[10px] font-bold uppercase tracking-wider">{item.label}</p></div>)}
        </div>
      </div>

      {buildings.length === 0 ? (
        <EmptyState icon={Accessibility} title="No buildings found" description="The live database has no active buildings to assess." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {buildings.map((row) => {
            const level = row.score >= 4 ? "Strong" : row.score >= 2 ? "Partial" : "Needs work";
            const color = row.score >= 4 ? "text-emerald-600 bg-emerald-500/10" : row.score >= 2 ? "text-amber-600 bg-amber-500/10" : "text-red-600 bg-red-500/10";
            return (
              <article key={row.building.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h2 className="truncate text-sm font-extrabold text-foreground">{row.building.name}</h2><p className="mt-0.5 text-[10px] text-muted-foreground">{row.building.code} · {row.campusName}</p></div><span className={cn("rounded-full px-2 py-1 text-[9px] font-bold", color)}>{level}</span></div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {[
                    { label: "Accessible flag", value: row.building.is_accessible ? "Yes" : "No", icon: CheckCircle2 },
                    { label: "Ramps", value: row.ramps.length, icon: Triangle },
                    { label: "Elevators", value: row.elevators.length, icon: ArrowUpDown },
                    { label: "Entrances", value: row.accessibleEntrances.length, icon: Building2 },
                    { label: "Accessible rooms", value: row.accessibleRooms.length, icon: Accessibility },
                    { label: "Route coverage", value: `${row.routeCoverage}%`, icon: Route },
                  ].map(({ label, value, icon: Icon }) => <div key={label} className="rounded-xl border border-border bg-muted/30 p-2.5"><Icon className="mb-1 h-3.5 w-3.5 text-primary" /><p className="text-base font-extrabold text-foreground">{value}</p><p className="text-[9px] font-bold text-muted-foreground">{label}</p></div>)}
                </div>
                <p className="mt-3 text-[10px] text-muted-foreground">{row.accessibleEdges.length} of {row.edges.length} active route segments are accessible.</p>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

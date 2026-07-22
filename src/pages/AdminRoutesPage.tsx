import { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
import { ListCardSkeleton } from "../components/ui/PageSkeleton";
import {
  Route, Plus, Pencil, Trash2, X, Navigation, Clock, Ruler,
  CheckCircle2, XCircle, Search, Filter, Eye,
} from "lucide-react";
import { useToast } from "../hooks/useToast";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { EmptyState } from "../components/ui/EmptyState";
import { SearchBar } from "../components/ui/SearchBar";
import { cn } from "../lib/utils";
import {
  INITIAL_ROUTES, INITIAL_MARKERS, INITIAL_PATHS, INITIAL_BUILDINGS,
  CANVAS_W, CANVAS_H, MARKER_STYLES,
} from "../data/mapData";
import type { MapRoute } from "../types/map";

// ── Mini map preview ──────────────────────────────────────────────────────────
function MiniMapPreview({ route }: { route: MapRoute }) {
  const fromMarker = INITIAL_MARKERS.find(m => m.id === route.from_marker_id);
  const toMarker   = INITIAL_MARKERS.find(m => m.id === route.to_marker_id);
  const scale = 0.22;

  return (
    <svg
      viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
      className="w-full h-full"
      style={{ pointerEvents: "none" }}
    >
      {/* Background */}
      <rect width={CANVAS_W} height={CANVAS_H} fill="#eef2fb" className="dark:fill-[#111827]" />

      {/* Roads */}
      {INITIAL_PATHS.filter(p => p.type === "road").map(path => (
        <polyline key={path.id}
          points={path.points.map(p => `${p.x},${p.y}`).join(" ")}
          fill="none" stroke={path.color} strokeWidth={path.width}
          strokeLinecap="round" opacity={0.5}
        />
      ))}

      {/* Buildings */}
      {INITIAL_BUILDINGS.map(b => (
        <rect key={b.id} x={b.x} y={b.y} width={b.width} height={b.height}
          rx={6} fill={b.color} opacity={0.5} />
      ))}

      {/* Route path */}
      <polyline
        points={route.waypoints.map(p => `${p.x},${p.y}`).join(" ")}
        fill="none"
        stroke={route.type === "accessible" ? "#16a34a" : route.type === "emergency" ? "#dc2626" : "#0e2a6e"}
        strokeWidth={8}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={route.type === "accessible" ? "16 8" : undefined}
        opacity={0.85}
      />

      {/* From marker */}
      {fromMarker && (
        <g>
          <circle cx={fromMarker.x} cy={fromMarker.y} r={14} fill="#16a34a" stroke="white" strokeWidth={2} />
          <text x={fromMarker.x} y={fromMarker.y + 4}
            textAnchor="middle" fill="white" fontSize={10} fontWeight="900">A</text>
        </g>
      )}

      {/* To marker */}
      {toMarker && (
        <g>
          <circle cx={toMarker.x} cy={toMarker.y} r={14} fill="#dc2626" stroke="white" strokeWidth={2} />
          <text x={toMarker.x} y={toMarker.y + 4}
            textAnchor="middle" fill="white" fontSize={10} fontWeight="900">B</text>
        </g>
      )}

      {/* Waypoint dots */}
      {route.waypoints.slice(1, -1).map((pt, i) => (
        <circle key={i} cx={pt.x} cy={pt.y} r={5}
          fill={route.type === "accessible" ? "#16a34a" : "#0e2a6e"}
          stroke="white" strokeWidth={1.5} opacity={0.7} />
      ))}
    </svg>
  );
}

const ROUTE_TYPE_CONFIG = {
  walking:    { label: "Walking",    color: "bg-primary/10 text-primary",       dot: "bg-primary" },
  accessible: { label: "Accessible", color: "bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400", dot: "bg-green-500" },
  emergency:  { label: "Emergency",  color: "bg-destructive/10 text-destructive", dot: "bg-destructive" },
};

// ── Main component ─────────────────────────────────────────────────────────────
export function AdminRoutesPage() {
  const [routes,    setRoutes]    = useState<MapRoute[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setRoutes(INITIAL_ROUTES);
      setLoading(false);
    }, 350);
    return () => clearTimeout(timer);
  }, []);

  if (loading) return <ListCardSkeleton cards={4} />;
  const [typeFilter, setTypeFilter] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<MapRoute | null>(null);
  const [deleteId,  setDeleteId]  = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "", description: "",
    from_marker_id: INITIAL_MARKERS[0]?.id ?? "",
    to_marker_id:   INITIAL_MARKERS[1]?.id ?? "",
    type: "walking" as MapRoute["type"],
    distance_m: 0, duration_min: 0,
    is_active: true,
  });
  const toast = useToast();

  const filtered = routes.filter(r => {
    const matchType = typeFilter === "all" || r.type === typeFilter;
    const q = search.toLowerCase();
    const matchSearch = !q || r.name.toLowerCase().includes(q) || (r.description ?? "").toLowerCase().includes(q);
    return matchType && matchSearch;
  });

  const openAdd = () => {
    setForm({
      name: "", description: "",
      from_marker_id: INITIAL_MARKERS[0]?.id ?? "",
      to_marker_id:   INITIAL_MARKERS[1]?.id ?? "",
      type: "walking", distance_m: 0, duration_min: 0, is_active: true,
    });
    setEditTarget(null);
    setShowModal(true);
  };

  const openEdit = (r: MapRoute) => {
    setForm({
      name: r.name, description: r.description ?? "",
      from_marker_id: r.from_marker_id, to_marker_id: r.to_marker_id,
      type: r.type, distance_m: r.distance_m, duration_min: r.duration_min, is_active: r.is_active,
    });
    setEditTarget(r);
    setShowModal(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    if (editTarget) {
      setRoutes(prev => prev.map(r => r.id === editTarget.id
        ? { ...r, ...form } : r
      ));
      toast.success("Route updated", `${form.name} has been updated.`);
    } else {
      // For a new route, derive waypoints from marker positions
      const fromM = INITIAL_MARKERS.find(m => m.id === form.from_marker_id);
      const toM   = INITIAL_MARKERS.find(m => m.id === form.to_marker_id);
      const nr: MapRoute = {
        id: `r${Date.now()}`,
        ...form,
        waypoints: fromM && toM
          ? [{ x: fromM.x, y: fromM.y }, { x: toM.x, y: toM.y }]
          : [],
        created_at: new Date().toISOString(),
      };
      setRoutes(prev => [...prev, nr]);
      toast.success("Route added", `${form.name} has been added.`);
    }
    setShowModal(false);
  };

  const toggleActive = (id: string) =>
    setRoutes(prev => prev.map(r => r.id === id ? { ...r, is_active: !r.is_active } : r));

  const stats = {
    total:      routes.length,
    active:     routes.filter(r => r.is_active).length,
    walking:    routes.filter(r => r.type === "walking").length,
    accessible: routes.filter(r => r.type === "accessible").length,
  };

  const previewRoute = routes.find(r => r.id === previewId);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">Route Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Define and manage navigation routes across the PLV campus.
          </p>
        </div>
        <Button variant="primary" onClick={openAdd}>
          <Plus className="h-4 w-4" /> Add Route
        </Button>
      </div>

      {/* Stats */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
        className="grid grid-cols-2 sm:grid-cols-4 gap-4"
      >
        {[
          { label: "Total Routes",     value: stats.total,      icon: Route,      cx: "bg-primary/10 text-primary" },
          { label: "Active",           value: stats.active,     icon: CheckCircle2, cx: "bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400" },
          { label: "Walking Routes",   value: stats.walking,    icon: Navigation, cx: "bg-primary/10 text-primary" },
          { label: "Accessible",       value: stats.accessible, icon: Navigation, cx: "bg-accent/15 text-accent" },
        ].map(({ label, value, icon: Icon, cx }) => (
          <motion.div
            key={label}
            variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="bg-card rounded-2xl border border-border shadow-sm p-4 flex items-center justify-between hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
          >
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{label}</p>
              <p className="text-2xl font-extrabold text-foreground mt-1">{value}</p>
            </div>
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", cx)}>
              <Icon className="h-5 w-5" />
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 max-w-sm">
          <SearchBar
            placeholder="Search routes..."
            value={search}
            onSearch={setSearch}
            onClear={() => setSearch("")}
            showShortcutHint
            size="md"
          />
        </div>
        <div className="flex gap-1.5">
          {["all", "walking", "accessible", "emergency"].map(t => (
            <button key={t} type="button" onClick={() => setTypeFilter(t)}
              className={cn("px-3 py-1.5 rounded-xl text-xs font-bold transition-all capitalize active:scale-[0.97]",
                typeFilter === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-secondary")}>
              {t === "all" ? "All" : t}
            </button>
          ))}
        </div>
      </div>

      {/* Route grid */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.05 } } }}
        className="grid lg:grid-cols-2 gap-5"
      >
        {filtered.map(route => {
          const cfg  = ROUTE_TYPE_CONFIG[route.type];
          const fromM = INITIAL_MARKERS.find(m => m.id === route.from_marker_id);
          const toM   = INITIAL_MARKERS.find(m => m.id === route.to_marker_id);
          const isPreviewing = previewId === route.id;

          return (
            <motion.div
              key={route.id}
              variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
            >
              {/* Map preview */}
              <div className="relative h-36 bg-muted/30 overflow-hidden border-b border-border">
                <MiniMapPreview route={route} />
                <div className="absolute top-2 right-2 flex gap-1.5">
                  <button
                    onClick={() => toggleActive(route.id)}
                    className={cn("text-xs font-bold px-2 py-1 rounded-lg transition-all active:scale-[0.97]",
                      route.is_active
                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200"
                        : "bg-muted text-muted-foreground hover:bg-secondary"
                    )}>
                    {route.is_active ? "Active" : "Inactive"}
                  </button>
                </div>
                {/* Route type badge */}
                <div className="absolute bottom-2 left-2">
                  <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1", cfg.color)}>
                    <span className={cn("w-1.5 h-1.5 rounded-full", cfg.dot)} />
                    {cfg.label}
                  </span>
                </div>
              </div>

              <div className="p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h3 className="font-extrabold text-foreground text-sm">{route.name}</h3>
                    {route.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{route.description}</p>
                    )}
                  </div>
                </div>

                {/* From → To */}
                <div className="flex items-center gap-2 mb-3 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-green-500 text-white font-extrabold text-[9px] flex items-center justify-center">A</span>
                    <span className="font-semibold text-foreground truncate max-w-[80px]">{fromM?.name ?? "Unknown"}</span>
                  </div>
                  <div className="flex-1 h-px bg-border relative">
                    <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-1 text-muted-foreground text-[10px]">→</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-destructive text-white font-extrabold text-[9px] flex items-center justify-center">B</span>
                    <span className="font-semibold text-foreground truncate max-w-[80px]">{toM?.name ?? "Unknown"}</span>
                  </div>
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
                  <span className="flex items-center gap-1">
                    <Ruler className="h-3 w-3" />
                    <span className="font-mono font-bold text-foreground">{route.distance_m}m</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span className="font-mono font-bold text-foreground">{route.duration_min} min</span>
                  </span>
                  <span>{route.waypoints.length} waypoints</span>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2 border-t border-border">
                  <button onClick={() => openEdit(route)}
                    className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-xl bg-muted text-foreground text-xs font-bold hover:bg-secondary active:scale-[0.97] transition-all">
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button onClick={() => setDeleteId(route.id)}
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive active:scale-90 transition-all">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      {filtered.length === 0 && (
        <EmptyState
          icon={search || typeFilter !== "all" ? Search : Route}
          title={search || typeFilter !== "all" ? "No matching routes" : "No routes yet"}
          description={(search || typeFilter !== "all")
            ? "No routes match your current filters. Try different search terms."
            : "Create navigation routes between campus landmarks to help students navigate."
          }
          action={(search || typeFilter !== "all") ? (
            <button
              onClick={() => { setSearch(""); setTypeFilter("all"); }}
              className="inline-flex items-center gap-2 h-10 px-5 rounded-xl border border-border text-sm font-bold text-foreground hover:bg-muted transition-all"
            >
              Clear Filters
            </button>
          ) : (
            <Button variant="primary" size="sm" onClick={openAdd}>
              <Plus className="h-3.5 w-3.5" /> Add Route
            </Button>
          )}
        />
      )}

      {/* ── Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in" role="dialog" aria-modal="true" aria-label="Route form">           <div className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-scale-in scrollbar-show-on-hover">
             <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card rounded-t-2xl z-10">
              <h2 className="font-extrabold text-foreground text-sm">{editTarget ? "Edit Route" : "Add Route"}</h2>
              <button type="button" aria-label="Close modal" onClick={() => setShowModal(false)} className="w-8 h-8 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label htmlFor="route-name" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wide">Route Name <span className="text-destructive">*</span></label>
                <input id="route-name" type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Main Gate to Library"
                  className={"w-full h-10 px-4 rounded-xl border bg-input-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm " + (form.name.trim() ? "border-border" : "border-destructive/50")} />
                <div className="flex items-center justify-between mt-1">
                  <p className="text-[10px] text-muted-foreground">A clear, descriptive name for this navigation route</p>
                  <span className="text-[10px] text-muted-foreground tabular-nums">{form.name.length}/{100}</span>
                </div>
                {!form.name.trim() && <p className="text-[10px] text-destructive mt-1 font-medium">Route name is required</p>}
              </div>
              <div>
                <label htmlFor="route-description" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wide">Description</label>
                <textarea id="route-description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                  rows={2} placeholder="Describe this route..."
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-input-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm resize-y min-h-[44px] transition-all duration-200" />
                <div className="flex items-center justify-end mt-1">
                  <span className="text-[10px] text-muted-foreground tabular-nums">{form.description.length}/{300}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="route-from" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wide">From</label>
                  <select id="route-from" value={form.from_marker_id} onChange={e => setForm({ ...form, from_marker_id: e.target.value })}
                    className="custom-select w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground text-sm">
                    {INITIAL_MARKERS.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="route-to" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wide">To</label>
                  <select id="route-to" value={form.to_marker_id} onChange={e => setForm({ ...form, to_marker_id: e.target.value })}
                    className="custom-select w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground text-sm">
                    {INITIAL_MARKERS.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wide">Route Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["walking", "accessible", "emergency"] as const).map(t => {
                    const cfg = ROUTE_TYPE_CONFIG[t];
                    return (
                      <button key={t} type="button" onClick={() => setForm({ ...form, type: t })}
                        className={cn(
                          "flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-xs font-bold transition-all capitalize",
                          form.type === t ? "border-primary bg-primary/8 text-primary" : "border-border text-muted-foreground hover:border-primary/30"
                        )}>
                        <span className={cn("w-3 h-3 rounded-full", cfg.dot)} />
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="route-distance" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wide">Distance (m)</label>
                  <input id="route-distance" type="number" min={0} value={form.distance_m}
                    onChange={e => setForm({ ...form, distance_m: parseInt(e.target.value) || 0 })}
                    className="w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <div>
                  <label htmlFor="route-duration" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wide">Duration (min)</label>
                  <input id="route-duration" type="number" min={0} value={form.duration_min}
                    onChange={e => setForm({ ...form, duration_min: parseInt(e.target.value) || 0 })}
                    className="w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
                <div>
                  <p className="text-sm font-bold text-foreground">Active Route</p>
                  <p className="text-xs text-muted-foreground">Show this route to students on the campus map</p>
                </div>
                <button type="button" onClick={() => setForm({ ...form, is_active: !form.is_active })}
                  className={cn("relative inline-flex w-11 h-6 rounded-full transition-all",
                    form.is_active ? "bg-primary" : "bg-muted")}>
                  <span className="inline-block w-5 h-5 rounded-full bg-white shadow-sm transition-transform mt-0.5"
                    style={{ transform: form.is_active ? "translateX(22px)" : "translateX(2px)" }} />
                </button>
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <Button variant="outline" onClick={() => setShowModal(false)} className="flex-1">Cancel</Button>
              <Button variant="primary" onClick={handleSave} className="flex-1" disabled={!form.name.trim()}>
                {editTarget ? "Save Changes" : "Add Route"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Confirm delete route">           <div className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-sm p-6 text-center animate-scale-in">
            <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="h-7 w-7 text-destructive" />
            </div>
            <h3 className="font-extrabold text-foreground mb-1">Delete Route?</h3>
            <p className="text-sm text-muted-foreground mb-5">This navigation route will be permanently removed. All waypoints and directions will be lost. Consider deactivating it instead if it may be needed again.</p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setDeleteId(null)} className="flex-1">Cancel</Button>
              <Button variant="danger" onClick={() => { const deleted = routes.find(r => r.id === deleteId); setRoutes(p => p.filter(r => r.id !== deleteId)); setDeleteId(null); if (deleted) toast.success("Route deleted", `${deleted.name} has been removed.`); }} className="flex-1">Delete Route</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

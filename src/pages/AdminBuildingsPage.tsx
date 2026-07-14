import { useState } from "react";
import { motion } from "motion/react";
import {
  Building2, Plus, Search, Pencil, Trash2, Eye, MapPin, Clock, Phone,
  Layers, School, ExternalLink, Sparkles, Users, GraduationCap,
} from "lucide-react";
import { Link } from "react-router";
import { cn } from "../lib/utils";
import { Button } from "../components/ui/Button";
import { BuildingCategoryBadge } from "../components/ui/Badge";
import { StatCard } from "../components/ui/StatCard";
import { TablePageSkeleton } from "../components/ui/PageSkeleton";
import { useDataList, useCrudModal, useToast } from "../hooks";
import { buildingService } from "../services";
import { FLOOR_PLANS } from "../data/floorPlans";
import type { DbBuilding } from "../services/types";
import type { Building } from "../types";

// ── Adapt DbBuilding → Building (UI type) ─────────────────────────────────
function toUiBuilding(db: DbBuilding): Building {
  return {
    id: db.id,
    name: db.name,
    code: db.code,
    description: db.description,
    category: db.category,
    floor_count: db.floor_count,
    image_url: db.image_url,
    latitude: db.latitude,
    longitude: db.longitude,
    departments: db.departments,
    operating_hours: db.operating_hours,
    contact: db.contact,
    created_at: db.created_at,
  };
}

const initialForm = {
  name: "", code: "", description: "", category: "academic" as Building["category"],
  floor_count: 1, operating_hours: "", contact: "",
};

// ── Derived category counts ────────────────────────────────────────────────
interface CategoryCount {
  key: string;
  label: string;
  icon: React.ElementType;
  variant: "primary" | "accent" | "success" | "warning" | "secondary";
}

const CATEGORIES: CategoryCount[] = [
  { key: "academic",  label: "Academic",  icon: GraduationCap, variant: "primary"  },
  { key: "admin",     label: "Admin",     icon: School,        variant: "accent"   },
  { key: "facility",  label: "Facility",  icon: Layers,        variant: "success"  },
  { key: "sports",    label: "Sports",    icon: Users,         variant: "warning"  },
];

export function AdminBuildingsPage() {
  const toast = useToast();
  const {
    data: buildings,
    loading,
    search,
    setSearch,
  } = useDataList({
    fetcher: (params) => buildingService.list(params),
    pageSize: 50,
  });

  const [categoryFilter, setCategoryFilter] = useState("all");
  const [form, setForm] = useState(initialForm);
  const modal = useCrudModal<Building>();

  // Page-level category filter; search is handled server-side by useDataList
  const filtered = buildings
    .map(toUiBuilding)
    .filter((b) => categoryFilter === "all" || b.category === categoryFilter);

  // Enrich with floor plan data
  const enriched = filtered.map((b) => {
    const fp = FLOOR_PLANS[b.id];
    return {
      ...b,
      hasFloorPlan: !!fp,
      floorPlanFloors: fp?.floors.length ?? 0,
      totalRooms: fp?.floors.reduce((s, f) => s + f.rooms.length, 0) ?? 0,
    };
  });

  // Category counts
  const catCounts = CATEGORIES.map((c) => ({
    ...c,
    count: buildings.map(toUiBuilding).filter((b) => b.category === c.key).length,
  }));

  const openAdd = () => {
    setForm(initialForm);
    modal.openAdd();
  };

  const openEdit = (b: Building) => {
    setForm({
      name: b.name, code: b.code, description: b.description,
      category: b.category, floor_count: b.floor_count,
      operating_hours: b.operating_hours ?? "", contact: b.contact ?? "",
    });
    modal.openEdit(b);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.code.trim()) return;
    if (modal.editTarget) {
      await buildingService.update(modal.editTarget.id, form);
      toast.success("Building updated", `${form.name} has been updated.`);
    } else {
      await buildingService.create(form as unknown as Omit<DbBuilding, "id">);
      toast.success("Building added", `${form.name} has been added.`);
    }
    modal.close();
  };

  const handleDelete = async (id: string) => {
    const deleted = buildings.find((b) => b.id === id) as DbBuilding | undefined;
    if (deleted) {
      await buildingService.remove(id);
      toast.success("Building deleted", `${deleted.name} has been removed.`);
    }
  };

  if (loading) return <TablePageSkeleton rows={6} />;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ═══════════════════════════════════════════════════════════════
           HEADER
         ═══════════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="flex items-start justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">Manage Buildings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {buildings.length} buildings in the directory · {Object.keys(FLOOR_PLANS).length} with floor plans
          </p>
        </div>
        <Button onClick={openAdd} variant="primary">
          <Plus className="h-4 w-4" /> Add Building
        </Button>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════════
           SUMMARY METRICS ROW
         ═══════════════════════════════════════════════════════════════ */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.04 } } }}
        className="grid grid-cols-2 sm:grid-cols-4 gap-3"
      >
        {/* Total */}
        <motion.div
          variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
        >
          <StatCard
            title="Total Buildings"
            value={buildings.length}
            subtitle={`${Object.keys(FLOOR_PLANS).length} with plans`}
            icon={Building2}
            variant="primary"
          />
        </motion.div>
        {catCounts.map((c) => (
          <motion.div
            key={c.key}
            variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
          >
            <StatCard
              title={c.label}
              value={c.count}
              icon={c.icon}
              variant={c.variant}
            />
          </motion.div>
        ))}
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════════
           SEARCH & FILTERS
         ═══════════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.3 }}
        className="flex flex-col sm:flex-row gap-3 items-start sm:items-center"
      >
        <div className="relative flex-1 max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search buildings by name, code, or department..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-9 pr-4 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm transition-shadow"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar w-full sm:w-auto">
          {[
            { key: "all", label: "All", icon: Building2 },
            { key: "academic", label: "Academic", icon: GraduationCap },
            { key: "admin", label: "Admin", icon: School },
            { key: "facility", label: "Facility", icon: Layers },
            { key: "sports", label: "Sports", icon: Users },
          ].map((c) => {
            const Icon = c.icon;
            return (
              <button
                key={c.key}
                onClick={() => setCategoryFilter(c.key)}
                className={cn(
                  "shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all",
                  categoryFilter === c.key
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-secondary"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {c.label}
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════════
           BUILDING CARDS GRID
         ═══════════════════════════════════════════════════════════════ */}
      {enriched.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center py-16 gap-3 bg-card rounded-2xl border border-border shadow-sm"
        >
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
            <Building2 className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-sm font-bold text-foreground">No buildings found</p>
          <p className="text-xs text-muted-foreground">Try adjusting your search or filters.</p>
          <Button variant="outline" onClick={() => { setSearch(""); setCategoryFilter("all"); }}>
            Clear Filters
          </Button>
        </motion.div>
      ) : (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.03 } } }}
          className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {enriched.map((b, i) => (
            <motion.div
              key={b.id}
              variants={{
                hidden: { opacity: 0, y: 16 },
                visible: { opacity: 1, y: 0 },
              }}
            >
              <div
                className="group relative flex flex-col bg-card rounded-2xl border border-border shadow-sm overflow-hidden
                            hover:shadow-lg hover:-translate-y-1 hover:border-primary/20 transition-all duration-300"
              >
                {/* Image section */}
                <div className="relative h-36 overflow-hidden bg-muted shrink-0">
                  {b.image_url ? (
                    <img
                      src={b.image_url}
                      alt={b.name}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-secondary to-muted">
                      <Building2 className="h-12 w-12 text-muted-foreground/30" />
                    </div>
                  )}
                  {/* Gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />

                  {/* Category badge */}
                  <div className="absolute top-3 left-3">
                    <BuildingCategoryBadge category={b.category} />
                  </div>

                  {/* Code badge */}
                  <div className="absolute top-3 right-3 bg-primary/90 backdrop-blur-sm text-primary-foreground text-xs font-mono font-bold px-2.5 py-1 rounded-lg shadow-sm">
                    {b.code}
                  </div>

                  {/* Floor plan indicator */}
                  {b.hasFloorPlan && (
                    <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-black/50 backdrop-blur-sm text-white/90 text-[10px] font-bold px-2 py-1 rounded-lg">
                      <Layers className="h-3 w-3" />
                      {b.floorPlanFloors} floors · {b.totalRooms} rooms
                    </div>
                  )}
                </div>

                {/* Content section */}
                <div className="flex-1 flex flex-col p-4">
                  {/* Name */}
                  <h3 className="font-bold text-foreground text-sm leading-snug mb-1 group-hover:text-primary transition-colors line-clamp-1">
                    {b.name}
                  </h3>

                  {/* Description */}
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mb-3 flex-1" style={{ fontFamily: "var(--font-body)" }}>
                    {b.description}
                  </p>

                  {/* Meta rows */}
                  <div className="space-y-1.5 text-[11px] text-muted-foreground mb-3">
                    {b.operating_hours && (
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3 w-3 shrink-0 text-primary/60" />
                        <span className="truncate">{b.operating_hours}</span>
                      </div>
                    )}
                    {b.contact && (
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-3 w-3 shrink-0 text-primary/60" />
                        <span>{b.contact}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3 w-3 shrink-0 text-primary/60" />
                      <span>
                        {b.floor_count} {b.floor_count === 1 ? "story" : "stories"}
                        {b.departments && b.departments.length > 0 && ` · ${b.departments.length} dept${b.departments.length > 1 ? "s" : ""}`}
                      </span>
                    </div>
                  </div>

                  {/* Departments */}
                  {b.departments && b.departments.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {b.departments.slice(0, 3).map((d) => (
                        <span
                          key={d}
                          className="text-[9px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md truncate max-w-[120px]"
                        >
                          {d}
                        </span>
                      ))}
                      {b.departments.length > 3 && (
                        <span className="text-[9px] text-muted-foreground font-bold">
                          +{b.departments.length - 3}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Actions footer */}
                  <div className="pt-3 border-t border-border flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <Link to={`/buildings/${b.id}`} target="_blank">
                        <button
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
                          title="View public page"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      </Link>
                      <button
                        onClick={() => openEdit(b)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-primary/10 hover:text-primary transition-all"
                        title="Edit building"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => modal.confirmDelete(b.id)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all"
                        title="Delete building"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <Link
                      to={`/buildings/${b.id}`}
                      target="_blank"
                      className="flex items-center gap-1 text-[10px] font-bold text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      Details <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
           ADD/EDIT MODAL
         ═══════════════════════════════════════════════════════════════ */}
      {modal.isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={modal.close}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: "spring", duration: 0.4, bounce: 0.25 }}
            className="bg-card rounded-3xl border border-border shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto scrollbar-show-on-hover"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card rounded-t-3xl z-10">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  {modal.editTarget ? <Pencil className="h-4 w-4 text-primary" /> : <Plus className="h-4 w-4 text-primary" />}
                </div>
                <div>
                  <h2 className="font-extrabold text-foreground text-sm">
                    {modal.editTarget ? "Edit Building" : "Add Building"}
                  </h2>
                  <p className="text-[10px] text-muted-foreground">
                    {modal.editTarget ? `Editing ${modal.editTarget.name}` : "Create a new campus building"}
                  </p>
                </div>
              </div>
              <button onClick={modal.close} className="w-8 h-8 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors shrink-0">
                <span className="text-lg leading-none">×</span>
              </button>
            </div>

            {/* Modal body */}
            <div className="p-6 space-y-4">
              {[
                { label: "Building Name", key: "name", placeholder: "e.g. Main Academic Building" },
                { label: "Building Code", key: "code", placeholder: "e.g. MAB" },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label htmlFor={`bldg-${key}`} className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wide">{label}</label>
                  <input id={`bldg-${key}`} type="text" value={(form as any)[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} placeholder={placeholder}
                    className="w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm transition-shadow" />
                </div>
              ))}
              <div>
                <label htmlFor="bldg-description" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wide">Description</label>
                <textarea id="bldg-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Brief description..." rows={3}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-input-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm resize-none transition-shadow" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="bldg-category" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wide">Category</label>
                  <select id="bldg-category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as Building["category"] })}
                    className="w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm transition-shadow">
                    {["academic", "admin", "facility", "sports", "dormitory"].map((c) => (
                      <option key={c} value={c} className="capitalize">{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="bldg-floors" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wide">Floors</label>
                  <input id="bldg-floors" type="number" min={1} value={form.floor_count} onChange={(e) => setForm({ ...form, floor_count: parseInt(e.target.value) || 1 })}
                    className="w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm transition-shadow" />
                </div>
              </div>
              <div>
                <label htmlFor="bldg-hours" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wide">Operating Hours</label>
                <input id="bldg-hours" type="text" value={form.operating_hours} onChange={(e) => setForm({ ...form, operating_hours: e.target.value })} placeholder="Mon–Fri 7:00 AM – 8:00 PM"
                  className="w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm transition-shadow" />
              </div>
              <div>
                <label htmlFor="bldg-contact" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wide">Contact</label>
                <input id="bldg-contact" type="text" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="(02) 8293-0000 loc. 101"
                  className="w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm transition-shadow" />
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex gap-3 px-6 pb-6">
              <Button variant="outline" onClick={modal.close} className="flex-1">Cancel</Button>
              <Button variant="primary" onClick={handleSave} className="flex-1" disabled={!form.name.trim()}>
                {modal.editTarget ? "Save Changes" : "Add Building"}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
           DELETE CONFIRMATION
         ═══════════════════════════════════════════════════════════════ */}
      {modal.deleteId && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: "spring", duration: 0.35, bounce: 0.2 }}
            className="bg-card rounded-3xl border border-border shadow-2xl w-full max-w-sm p-6 text-center"
          >
            <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="h-7 w-7 text-destructive" />
            </div>
            <h3 className="font-extrabold text-foreground mb-1">Delete Building?</h3>
            <p className="text-sm text-muted-foreground mb-5" style={{ fontFamily: "var(--font-body)" }}>
              This action cannot be undone and will remove all associated data including floor plans and routes.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={modal.cancelDelete} className="flex-1">Cancel</Button>
              <Button variant="danger" onClick={() => modal.executeDelete(handleDelete)} className="flex-1">Delete</Button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
           FOOTER
         ═══════════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="flex items-center justify-between px-5 py-3 rounded-2xl border border-border bg-card/50"
      >
        <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
          <span>{buildings.length} buildings total</span>
          <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
          <span>{filtered.length} shown</span>
          <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
          <span>{Object.keys(FLOOR_PLANS).length} with floor plans</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Sparkles className="h-3 w-3" />
          <span>Updated just now</span>
        </div>
      </motion.div>
    </div>
  );
}

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ListCardSkeleton } from "../components/ui/PageSkeleton";
import { MapPin, Plus, Search, Pencil, Trash2, X, Flag, Navigation } from "lucide-react";
import { useToast } from "../hooks/useToast";
import { MOCK_LOCATIONS } from "../data/mockData";
import { useCampusData } from "../contexts/CampusDataContext";
import { locationsFromCampus } from "../lib/mapDataAdapter";
import type { CampusLocation } from "../types";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { FormField } from "../components/ui/FormField";
import { EmptyState } from "../components/ui/EmptyState";
import { SearchBar } from "../components/ui/SearchBar";
import { highlightSearch } from "../hooks/useSearchHighlight";
import { cn } from "../lib/utils";

const LOCATION_TYPES: CampusLocation["type"][] = ["entrance", "parking", "landmark", "restroom", "canteen", "atm", "clinic"];

const typeColors: Record<string, string> = {
  entrance: "default",
  parking: "secondary",
  landmark: "accent",
  restroom: "secondary",
  canteen: "success",
  atm: "warning",
  clinic: "danger",
};

/** True if a location's id starts with the campus- prefix */
function isCampusDerived(id: string) {
  return id.startsWith("campus-");
}

export function AdminLocationsPage() {
  const [locations, setLocations] = useState<CampusLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const campusData = useCampusData();

  // Derive locations from the first published campus
  const campusLocations: CampusLocation[] = useMemo(() => {
    const activeCampus = campusData.campuses.find(
      (c) => c.publishStatus !== "draft" && c.status !== "archived"
    );
    if (!activeCampus) return [];
    return locationsFromCampus(activeCampus);
  }, [campusData.campuses]);

  // Merge: manual locations first, then campus-derived (deduplicated by id)
  const allLocations = useMemo(() => {
    const campusIds = new Set(campusLocations.map((l) => l.id));
    const manual = locations.filter((l) => !campusIds.has(l.id));
    return [...manual, ...campusLocations];
  }, [locations, campusLocations]);
  const [search, setSearch] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<CampusLocation | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "", type: "landmark" as CampusLocation["type"], description: "",
    latitude: "", longitude: "",
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const toast = useToast();

  useEffect(() => {
    const timer = setTimeout(() => {
      setLocations(MOCK_LOCATIONS);
      setLoading(false);
    }, 350);
    return () => clearTimeout(timer);
  }, []);

  if (loading) return <ListCardSkeleton cards={6} />;

  const filtered = allLocations.filter((l) =>
    l.name.toLowerCase().includes(search.toLowerCase()) ||
    l.type.toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => {
    setForm({ name: "", type: "landmark", description: "", latitude: "", longitude: "" });
    setFormErrors({});
    setEditTarget(null);
    setShowModal(true);
  };

  const openEdit = (l: CampusLocation) => {
    setForm({
      name: l.name, type: l.type, description: l.description ?? "",
      latitude: l.latitude?.toString() ?? "", longitude: l.longitude?.toString() ?? "",
    });
    setFormErrors({});
    setEditTarget(l);
    setShowModal(true);
  };

  const handleSave = () => {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = "Location name is required";
    if (!form.latitude.trim() || isNaN(parseFloat(form.latitude))) errors.latitude = "Valid latitude required";
    if (!form.longitude.trim() || isNaN(parseFloat(form.longitude))) errors.longitude = "Valid longitude required";
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }
    setFormErrors({});
    if (editTarget) {
      setLocations((prev) => prev.map((l) => l.id === editTarget.id ? {
        ...l, ...form, latitude: form.latitude ? parseFloat(form.latitude) : undefined,
        longitude: form.longitude ? parseFloat(form.longitude) : undefined,
      } : l));
      toast.success("Location updated", `${form.name} has been updated.`);
    } else {
      const nl: CampusLocation = {
        id: `l${Date.now()}`, ...form,
        latitude: form.latitude ? parseFloat(form.latitude) : undefined,
        longitude: form.longitude ? parseFloat(form.longitude) : undefined,
      };
      setLocations((prev) => [...prev, nl]);
      toast.success("Location added", `${form.name} has been added.`);
    }
    setShowModal(false);
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="flex items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">Manage Locations</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{allLocations.length} mapped locations on campus</p>
        </div>
        <Button onClick={openAdd} variant="primary">
          <Plus className="h-3.5 w-3.5" /> Add Location
        </Button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.3 }}
        className="max-w-sm"
      >
        <SearchBar
          placeholder="Search locations..."
          value={search}
          onSearch={setSearch}
          onClear={() => setSearch("")}
          showShortcutHint
          size="md"
        />
      </motion.div>

      {/* Grid cards */}
      <motion.div
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.04 } } }}
        className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        {filtered.map((loc) => (
          <motion.div
            key={loc.id}
            variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="bg-card rounded-2xl border border-border shadow-sm p-4 hover:shadow-lg hover:-translate-y-0.5 hover:border-primary/20 transition-all duration-200 group"
          >
            <div className="flex items-start justify-between gap-3 mb-3">                <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <MapPin className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-foreground text-sm">
                    {search
                      ? highlightSearch(loc.name, search).map((seg, i) =>
                          seg.isHighlight ? <mark key={i} className="bg-primary/20 text-foreground rounded-sm px-0.5">{seg.text}</mark> : <span key={i}>{seg.text}</span>
                        )
                      : loc.name
                    }
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <Badge variant={(typeColors[loc.type] as string) ?? "default"} className="capitalize">{loc.type}</Badge>
                    {isCampusDerived(loc.id) && (
                      <Badge variant="default" className="text-[9px] px-1 py-0.5 opacity-60">auto</Badge>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {isCampusDerived(loc.id) ? (
                  <span className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground/40 cursor-default" title="Auto-generated from Map Builder">
                    <Pencil className="h-3.5 w-3.5" />
                  </span>
                ) : (
                  <button type="button" aria-label="Edit location" onClick={() => openEdit(loc)} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
                {!isCampusDerived(loc.id) && (
                  <button type="button" aria-label="Delete location" onClick={() => setDeleteId(loc.id)} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive active:scale-90 transition-all">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
            {loc.description && (
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mb-2">{loc.description}</p>
            )}
            {(loc.latitude || loc.longitude) && (
              <p className="text-[10px] font-mono text-muted-foreground">
                {loc.latitude?.toFixed(4)}, {loc.longitude?.toFixed(4)}
              </p>
            )}
          </motion.div>
        ))}
      </motion.div>

      {filtered.length === 0 && (
        <EmptyState
          icon={search ? Search : Flag}
          title={search ? "No matching locations" : "No locations yet"}
          description={search
            ? "No locations match your search criteria. Try a different keyword."
            : "Add campus landmarks, entrances, and facilities to help students navigate."
          }
          action={search ? (
            <Button variant="outline" size="sm" onClick={() => setSearch("")}>
              Clear Search
            </Button>
          ) : (
            <Button variant="primary" size="sm" onClick={openAdd}>
              <Plus className="h-3.5 w-3.5" /> Add Location
            </Button>
          )}
        />
      )}

      {/* Modal */}
      {showModal && (
        <AnimatePresence>
          <motion.div
            key="location-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowModal(false)}
            role="dialog" aria-modal="true" aria-label="Location form"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: "spring", duration: 0.4, bounce: 0.25 }}
              className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto scrollbar-show-on-hover"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card rounded-t-2xl z-10">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    {editTarget ? <Pencil className="h-4 w-4 text-primary" /> : <Plus className="h-4 w-4 text-primary" />}
                  </div>
                  <div>
                    <h2 className="font-extrabold text-foreground text-sm">{editTarget ? "Edit Location" : "Add Location"}</h2>
                  </div>
                </div>
                <button type="button" aria-label="Close modal" onClick={() => setShowModal(false)} className="w-8 h-8 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors shrink-0">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <FormField
                  label="Location Name" id="location-name" value={form.name}
                  onChange={(v) => { setForm(f => ({ ...f, name: v })); if (formErrors.name) setFormErrors(prev => { const n = {...prev}; delete n.name; return n; }); }}
                  error={formErrors.name} placeholder="e.g. Main Gate" required
                />
                <div>
                  <label htmlFor="location-type" className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wide">Type <span className="text-destructive">*</span></label>
                  <select id="location-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as CampusLocation["type"] })}
                    className="custom-select w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground text-sm transition-all">
                    {LOCATION_TYPES.map((t) => (
                      <option key={t} value={t} className="capitalize">{t}</option>
                    ))}
                  </select>
                </div>
                <FormField
                  label="Description" id="location-description" value={form.description}
                  onChange={(v) => setForm(f => ({ ...f, description: v }))}
                  placeholder="Brief description..." rows={2} maxLength={500} showCharCount
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    label="Latitude" id="location-latitude" value={form.latitude}
                    onChange={(v) => { setForm(f => ({ ...f, latitude: v })); if (formErrors.latitude) setFormErrors(prev => { const n = {...prev}; delete n.latitude; return n; }); }}
                    error={formErrors.latitude} placeholder="14.7116" type="number" mono
                    helper={!formErrors.latitude ? "Decimal degrees (DD) format" : undefined}
                  />
                  <FormField
                    label="Longitude" id="location-longitude" value={form.longitude}
                    onChange={(v) => { setForm(f => ({ ...f, longitude: v })); if (formErrors.longitude) setFormErrors(prev => { const n = {...prev}; delete n.longitude; return n; }); }}
                    error={formErrors.longitude} placeholder="120.9660" type="number" mono
                    helper={!formErrors.longitude ? "Decimal degrees (DD) format" : undefined}
                  />
                </div>
              </div>
              <div className="flex gap-3 px-6 pb-6">
                <Button variant="outline" onClick={() => setShowModal(false)} className="flex-1">Cancel</Button>
                <Button variant="primary" onClick={handleSave} className="flex-1">
                  {editTarget ? "Save Changes" : "Add Location"}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        </AnimatePresence>
      )}

      {/* Delete confirm */}
      <AnimatePresence>
        {deleteId && (
          <motion.div
            key="location-delete-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: "spring", duration: 0.35, bounce: 0.2 }}
              className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-sm p-6 text-center"
            >
              <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
                <Trash2 className="h-7 w-7 text-destructive" />
              </div>
              <h3 className="font-extrabold text-foreground mb-1">Delete Location?</h3>
              <p className="text-sm text-muted-foreground mb-5">This location will be permanently removed from the campus map. Consider hiding it instead if it may be needed again.</p>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setDeleteId(null)} className="flex-1">Cancel</Button>
                <Button variant="danger" onClick={() => { const deleted = locations.find(l => l.id === deleteId); setLocations((p) => p.filter((l) => l.id !== deleteId)); setDeleteId(null); if (deleted) toast.success("Location deleted", `${deleted.name} has been removed.`); }} className="flex-1">Delete Location</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

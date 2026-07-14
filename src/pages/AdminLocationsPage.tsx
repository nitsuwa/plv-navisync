import { useState } from "react";
import { MapPin, Plus, Search, Pencil, Trash2, X } from "lucide-react";
import { MOCK_LOCATIONS } from "../data/mockData";
import type { CampusLocation } from "../types";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
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

export function AdminLocationsPage() {
  const [locations, setLocations] = useState<CampusLocation[]>(MOCK_LOCATIONS);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<CampusLocation | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "", type: "landmark" as CampusLocation["type"], description: "",
    latitude: "", longitude: "",
  });

  const filtered = locations.filter((l) =>
    l.name.toLowerCase().includes(search.toLowerCase()) ||
    l.type.toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => {
    setForm({ name: "", type: "landmark", description: "", latitude: "", longitude: "" });
    setEditTarget(null);
    setShowModal(true);
  };

  const openEdit = (l: CampusLocation) => {
    setForm({
      name: l.name, type: l.type, description: l.description ?? "",
      latitude: l.latitude?.toString() ?? "", longitude: l.longitude?.toString() ?? "",
    });
    setEditTarget(l);
    setShowModal(true);
  };

  const handleSave = () => {
    if (editTarget) {
      setLocations((prev) => prev.map((l) => l.id === editTarget.id ? {
        ...l, ...form, latitude: form.latitude ? parseFloat(form.latitude) : undefined,
        longitude: form.longitude ? parseFloat(form.longitude) : undefined,
      } : l));
    } else {
      const nl: CampusLocation = {
        id: `l${Date.now()}`, ...form,
        latitude: form.latitude ? parseFloat(form.latitude) : undefined,
        longitude: form.longitude ? parseFloat(form.longitude) : undefined,
      };
      setLocations((prev) => [...prev, nl]);
    }
    setShowModal(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Manage Locations</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{locations.length} mapped locations on campus</p>
        </div>
        <Button onClick={openAdd} variant="primary">
          <Plus className="h-4 w-4" /> Add Location
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input type="text" placeholder="Search locations..." value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm h-10 pl-9 pr-4 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm" />
      </div>

      {/* Grid cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((loc) => (
          <div key={loc.id} className="bg-card rounded-2xl border border-border shadow-sm p-4 hover:shadow-md hover:border-primary/20 transition-all group">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <MapPin className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-foreground text-sm">{loc.name}</p>
                  <Badge variant={(typeColors[loc.type] as any) ?? "default"} className="mt-0.5 capitalize">{loc.type}</Badge>
                </div>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => openEdit(loc)} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors">
                  <Pencil className="h-3 w-3" />
                </button>
                <button onClick={() => setDeleteId(loc.id)} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                  <Trash2 className="h-3 w-3" />
                </button>
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
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="flex flex-col items-center py-12 text-center">
          <MapPin className="h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No locations match your search.</p>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card rounded-3xl border border-border shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto scrollbar-show-on-hover">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card rounded-t-3xl">
              <h2 className="font-bold text-foreground">{editTarget ? "Edit Location" : "Add Location"}</h2>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label htmlFor="location-name" className="block text-sm font-semibold text-foreground mb-1.5">Location Name</label>
                <input id="location-name" type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Main Gate" className="w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm" />
              </div>
              <div>
                <label htmlFor="location-type" className="block text-sm font-semibold text-foreground mb-1.5">Type</label>
                <select id="location-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as CampusLocation["type"] })}
                  className="w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm">
                  {LOCATION_TYPES.map((t) => (
                    <option key={t} value={t} className="capitalize">{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="location-description" className="block text-sm font-semibold text-foreground mb-1.5">Description</label>
                <textarea id="location-description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Brief description..." rows={2}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-input-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="location-latitude" className="block text-sm font-semibold text-foreground mb-1.5">Latitude</label>
                  <input id="location-latitude" type="number" step="0.0001" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                    placeholder="14.7116" className="w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm font-mono" />
                </div>
                <div>
                  <label htmlFor="location-longitude" className="block text-sm font-semibold text-foreground mb-1.5">Longitude</label>
                  <input id="location-longitude" type="number" step="0.0001" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })}
                    placeholder="120.9660" className="w-full h-10 px-4 rounded-xl border border-border bg-input-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm font-mono" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-6">
              <Button variant="outline" onClick={() => setShowModal(false)} className="flex-1">Cancel</Button>
              <Button variant="primary" onClick={handleSave} className="flex-1">
                {editTarget ? "Save Changes" : "Add Location"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-sm p-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="h-6 w-6 text-destructive" />
            </div>
            <h3 className="font-bold text-foreground mb-1">Delete Location?</h3>
            <p className="text-sm text-muted-foreground mb-5">This action cannot be undone.</p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setDeleteId(null)} className="flex-1">Cancel</Button>
              <Button variant="danger" onClick={() => { setLocations((p) => p.filter((l) => l.id !== deleteId)); setDeleteId(null); }} className="flex-1">Delete</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

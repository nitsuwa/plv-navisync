import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";import {
  Accessibility, Flame, Star, Plus, Trash2, Eye, EyeOff,
  MapPin, DoorOpen, Stethoscope, Phone, Tent, Mic,
  UtensilsCrossed, ClipboardCheck, ArrowUpDown, ChevronDown, ChevronUp,
  CircleDot, CheckCircle2,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { genId } from "../map-builder/constants";
import { useToast } from "../../hooks/useToast";
import type { Campus, AccessibilityFeature, CampusEventOverlay } from "../map-builder/types";

// ── Props ────────────────────────────────────────────────────────────────────

interface LayersTabProps {
  campus: Campus;
  onUpdate: (campus: Campus) => void;
}

// ── Layer definitions ────────────────────────────────────────────────────────

interface LayerDef {
  id: string;
  icon: React.ElementType;
  label: string;
  description: string;
  color: string;
  accent: string;
}

const LAYER_DEFS: LayerDef[] = [
  {
    id: "accessibility",
    icon: Accessibility,
    label: "Accessibility",
    description: "Mark accessible paths, entrances, restrooms, elevators, and ramps.",
    color: "#2563eb",
    accent: "#dbeafe",
  },
  {
    id: "emergency",
    icon: Flame,
    label: "Emergency",
    description: "Place fire exits, extinguishers, assembly areas, and first aid stations.",
    color: "#dc2626",
    accent: "#fee2e2",
  },
  {
    id: "events",
    icon: Star,
    label: "Events",
    description: "Add temporary map objects like booths, tents, stages, and food stalls.",
    color: "#d97706",
    accent: "#fef3c7",
  },
];

// ── Accessibility feature types ──────────────────────────────────────────────

const ACCESSIBILITY_TYPES = [
  { id: "ramp", label: "Ramp", icon: ArrowUpDown },
  { id: "elevator", label: "Elevator", icon: ArrowUpDown },
  { id: "accessible_entrance", label: "Accessible Entrance", icon: DoorOpen },
  { id: "accessible_restroom", label: "Accessible Restroom", icon: CircleDot },
  { id: "wide_corridor", label: "Wide Corridor", icon: MapPin },
];

// ── Emergency item types ─────────────────────────────────────────────────────

const EMERGENCY_TYPES = [
  { id: "fire_exit", label: "Fire Exit", icon: DoorOpen },
  { id: "fire_extinguisher", label: "Fire Extinguisher", icon: Flame },
  { id: "assembly_area", label: "Assembly Area", icon: MapPin },
  { id: "first_aid", label: "First Aid Station", icon: Stethoscope },
  { id: "emergency_phone", label: "Emergency Phone", icon: Phone },
];

// ── Event overlay types ──────────────────────────────────────────────────────

const EVENT_TYPES = [
  { id: "booth", label: "Booth", icon: Tent },
  { id: "tent", label: "Tent", icon: Tent },
  { id: "stage", label: "Stage", icon: Mic },
  { id: "food_stall", label: "Food Stall", icon: UtensilsCrossed },
  { id: "registration", label: "Registration Area", icon: ClipboardCheck },
];

// ══════════════════════════════════════════════════════════════════════════════

export function LayersTab({ campus, onUpdate }: LayersTabProps) {
  const [activeLayer, setActiveLayer] = useState<string>("accessibility");
  const [expandedFeatures, setExpandedFeatures] = useState<Set<string>>(new Set());
  const toast = useToast();

  const accessibilityFeatures = campus.accessibilityFeatures ?? [];
  const eventOverlays = campus.eventOverlays ?? [];

  const toggleFeature = (id: string) => {
    setExpandedFeatures((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Add accessibility feature ──────────────────────────────────────────────
  const addAccessibilityFeature = useCallback((type: string) => {
    const buildingId = campus.buildings[0]?.id ?? "unknown";
    const typeDef = ACCESSIBILITY_TYPES.find((t) => t.id === type);
    const newFeature: AccessibilityFeature = {
      id: genId("af"),
      buildingId,
      type: type as AccessibilityFeature["type"],
      label: typeDef?.label ?? type,
      status: "present",
    };
    onUpdate({ ...campus, accessibilityFeatures: [...accessibilityFeatures, newFeature] });
    toast.success(`${typeDef?.label ?? type} added`);
  }, [campus, accessibilityFeatures, onUpdate, toast]);

  const removeAccessibilityFeature = useCallback((id: string) => {
    onUpdate({ ...campus, accessibilityFeatures: accessibilityFeatures.filter((f) => f.id !== id) });
    toast.success("Feature removed");
  }, [campus, accessibilityFeatures, onUpdate, toast]);

  // ── Add event overlay ──────────────────────────────────────────────────────
  const addEvent = useCallback(() => {
    const newEvent: CampusEventOverlay = {
      id: genId("evt"),
      title: "New Event",
      description: "",
      dateStart: new Date().toISOString().slice(0, 10),
      dateEnd: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      organizer: "",
      markers: [],
      restrictedAreas: [],
      isActive: true,
    };
    onUpdate({ ...campus, eventOverlays: [...eventOverlays, newEvent] });
    toggleFeature(newEvent.id);
    toast.success("Event added");
  }, [campus, eventOverlays, onUpdate, toast]);

  const updateEvent = useCallback((id: string, updates: Partial<CampusEventOverlay>) => {
    onUpdate({
      ...campus,
      eventOverlays: eventOverlays.map((e) => (e.id === id ? { ...e, ...updates } : e)),
    });
  }, [campus, eventOverlays, onUpdate]);

  const removeEvent = useCallback((id: string) => {
    onUpdate({ ...campus, eventOverlays: eventOverlays.filter((e) => e.id !== id) });
    toast.success("Event removed");
  }, [campus, eventOverlays, onUpdate, toast]);

  const activeDef = LAYER_DEFS.find((l) => l.id === activeLayer)!;

  return (
    <div className="flex w-full h-full overflow-hidden">
      {/* ── Layer selector sidebar ─────────────────────────────────────────── */}
      <div className="w-56 border-r border-border bg-card p-3 space-y-2 shrink-0 overflow-y-auto">
        <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider px-1 mb-2">Layers</p>
        {LAYER_DEFS.map((layer) => {
          const Icon = layer.icon;
          const isActive = activeLayer === layer.id;
          const count = layer.id === "accessibility"
            ? accessibilityFeatures.length
            : layer.id === "events"
            ? eventOverlays.length
            : 0;
          return (
            <button
              key={layer.id}
              onClick={() => setActiveLayer(layer.id)}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all text-left group",
                isActive
                  ? "shadow-sm border"
                  : "hover:bg-muted border border-transparent"
              )}
              style={isActive ? { backgroundColor: layer.accent + "40", borderColor: layer.color + "30", color: layer.color } : {}}
            >
              <div
                className="flex items-center justify-center w-7 h-7 rounded-lg shrink-0"
                style={{ backgroundColor: layer.color + "15" }}
              >
                <Icon className="h-4 w-4" style={{ color: layer.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate">{layer.label}</p>
              </div>
              {count > 0 && (
                <span className="flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full text-[9px] font-bold"
                  style={{ backgroundColor: layer.color + "15", color: layer.color }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}

        {/* Layer info */}
        <div className="mt-4 p-3 rounded-xl bg-muted/30 border border-border/50">
          <p className="text-[10px] text-muted-foreground leading-relaxed">{activeDef.description}</p>
        </div>
      </div>

      {/* ── Content area ─────────────────────────────────────────────────────── */}
      <div className="flex-1 p-5 overflow-y-auto bg-muted/10">
        {/* ── ACCESSIBILITY LAYER ──────────────────────────────────────────── */}
        {activeLayer === "accessibility" && (
          <div className="max-w-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-extrabold text-foreground">Accessibility Features</h2>
            </div>

            {/* Add feature buttons */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ACCESSIBILITY_TYPES.map((type) => {
                const Icon = type.icon;
                return (
                  <button
                    key={type.id}
                    onClick={() => addAccessibilityFeature(type.id)}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-border/60 bg-card hover:bg-muted/60 hover:border-border transition-all group"
                  >
                    <Icon className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                    <span className="text-[10px] font-bold text-muted-foreground group-hover:text-foreground text-center">
                      {type.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Features list */}
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-muted-foreground">
                {accessibilityFeatures.length} feature{accessibilityFeatures.length !== 1 ? "s" : ""}
              </p>
              {accessibilityFeatures.length === 0 && (
                <p className="text-xs text-muted-foreground/60 p-4 text-center">
                  No accessibility features yet. Click the buttons above to add some.
                </p>
              )}
              {accessibilityFeatures.map((feat) => {
                const def = ACCESSIBILITY_TYPES.find((t) => t.id === feat.type);
                const Icon = def?.icon ?? MapPin;
                return (
                  <div key={feat.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-card border border-border/60 hover:border-border transition-all group"
                  >
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/20 shrink-0">
                      <Icon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-foreground">{feat.label}</p>
                      <p className="text-[9px] text-muted-foreground capitalize">{feat.type.replace(/_/g, " ")}</p>
                    </div>
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-[9px] font-bold",
                      feat.status === "present" ? "bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400" :
                      feat.status === "under_maintenance" ? "bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400" :
                      "bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400"
                    )}>
                      {feat.status.replace(/_/g, " ")}
                    </span>
                    <button onClick={() => removeAccessibilityFeature(feat.id)}
                      className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── EMERGENCY LAYER ──────────────────────────────────────────────── */}
        {activeLayer === "emergency" && (
          <div className="max-w-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-extrabold text-foreground">Emergency Features</h2>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {EMERGENCY_TYPES.map((type) => {
                const Icon = type.icon;
                return (
                  <button
                    key={type.id}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-border/60 bg-card hover:bg-muted/60 hover:border-border transition-all group"
                    onClick={() => toast.info(`${type.label} — coming soon`)}
                  >
                    <Icon className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                    <span className="text-[10px] font-bold text-muted-foreground group-hover:text-foreground text-center">
                      {type.label}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="p-6 rounded-2xl bg-muted/30 border border-border/50 text-center">
              <Flame className="h-8 w-8 text-red-400 mx-auto mb-2" />
              <p className="text-sm font-bold text-foreground">Emergency Features Coming Soon</p>
              <p className="text-xs text-muted-foreground mt-1">Fire exits, extinguishers, and assembly areas will be available in the next update.</p>
            </div>
          </div>
        )}

        {/* ── EVENTS LAYER ─────────────────────────────────────────────────── */}
        {activeLayer === "events" && (
          <div className="max-w-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-extrabold text-foreground">Event Overlays</h2>
              <button
                onClick={addEvent}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-all"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Event
              </button>
            </div>

            {eventOverlays.length === 0 && (
              <div className="p-6 rounded-2xl bg-muted/30 border border-border/50 text-center">
                <Star className="h-8 w-8 text-amber-400 mx-auto mb-2" />
                <p className="text-sm font-bold text-foreground">No Events Yet</p>
                <p className="text-xs text-muted-foreground mt-1">Add temporary map overlays for campus events, booths, and stages.</p>
              </div>
            )}

            <div className="space-y-2">
              {eventOverlays.map((event) => {
                const isExpanded = expandedFeatures.has(event.id);
                return (
                  <motion.div
                    key={event.id}
                    layout
                    className="rounded-xl bg-card border border-border/60 overflow-hidden"
                  >
                    <button
                      onClick={() => toggleFeature(event.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-all"
                    >
                      <Star className="h-4 w-4 text-amber-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground truncate">{event.title}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {event.dateStart} → {event.dateEnd}
                        </p>
                      </div>
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-[9px] font-bold",
                        event.isActive ? "bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700" : "bg-muted text-muted-foreground"
                      )}>
                        {event.isActive ? "Active" : "Inactive"}
                      </span>
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </button>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Event Name</label>
                                <input type="text" value={event.title}
                                  onChange={(e) => updateEvent(event.id, { title: e.target.value })}
                                  className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs font-semibold mt-1 focus:outline-none focus:ring-2 focus:ring-primary/30" />
                              </div>
                              <div>
                                <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Organizer</label>
                                <input type="text" value={event.organizer}
                                  onChange={(e) => updateEvent(event.id, { organizer: e.target.value })}
                                  className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs font-semibold mt-1 focus:outline-none focus:ring-2 focus:ring-primary/30" />
                              </div>
                              <div>
                                <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Start Date</label>
                                <input type="date" value={event.dateStart}
                                  onChange={(e) => updateEvent(event.id, { dateStart: e.target.value })}
                                  className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs font-semibold mt-1 focus:outline-none focus:ring-2 focus:ring-primary/30" />
                              </div>
                              <div>
                                <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">End Date</label>
                                <input type="date" value={event.dateEnd}
                                  onChange={(e) => updateEvent(event.id, { dateEnd: e.target.value })}
                                  className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs font-semibold mt-1 focus:outline-none focus:ring-2 focus:ring-primary/30" />
                              </div>
                            </div>
                            <div>
                              <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Description</label>
                              <textarea value={event.description}
                                onChange={(e) => updateEvent(event.id, { description: e.target.value })}
                                rows={2}
                                className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs mt-1 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
                            </div>
                            <div className="flex items-center gap-2 pt-1">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={event.isActive}
                                  onChange={(e) => updateEvent(event.id, { isActive: e.target.checked })}
                                  className="rounded border-border" />
                                <span className="text-xs font-semibold text-foreground">Active</span>
                              </label>
                              <button onClick={() => removeEvent(event.id)}
                                className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all">
                                <Trash2 className="h-3.5 w-3.5" />
                                Delete
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

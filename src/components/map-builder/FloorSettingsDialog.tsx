import { useEffect, useState, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Ruler, Grid3X3, Check, Save } from "lucide-react";
import { cn } from "../../lib/utils";
import { MIN_FLOOR_CANVAS, normalizeFloorCanvasSize } from "../../lib/floorGeometry";
import { WALL_THICKNESSES } from "./constants";
import type { FloorPlan } from "./types";

const ColorPickerImpl = lazy(() => import("../ui/ColorPicker"));
function ColorPicker(props: { value: string; onChange: (c: string) => void }) {
  return (
    <Suspense fallback={<div className="h-10 rounded-xl border border-border bg-muted/30 animate-pulse" />}>
      <ColorPickerImpl {...props} />
    </Suspense>
  );
}

export interface FloorSettingsDraft {
  label: string;
  canvasW: number;
  canvasH: number;
  backgroundColor: string;
  showGrid: boolean;
  perimeterEnabled: boolean;
  perimeterThickness: number;
  perimeterMaterial: string;
  perimeterColor: string;
}

interface FloorSettingsDialogProps {
  open: boolean;
  floor: FloorPlan;
  /** Applies the draft as one floor edit. Returns false when the change is blocked (e.g. invalid shrink). */
  onApply: (draft: FloorSettingsDraft) => boolean;
  onClose: () => void;
}

/** Restrained floor-surface presets that keep walls/furniture/selection readable. */
const FLOOR_BACKGROUND_PRESETS = [
  { label: "White", value: "#ffffff" },
  { label: "Warm White", value: "#faf7f0" },
  { label: "Light Gray", value: "#e7e5e4" },
  { label: "Blueprint", value: "#e8eef7" },
];

const WALL_MATERIALS = [
  { value: "drywall", label: "Drywall" },
  { value: "glass", label: "Glass" },
  { value: "brick", label: "Brick" },
  { value: "wood", label: "Wood" },
  { value: "concrete", label: "Concrete" },
];

function perimeterDraftFromFloor(floor: FloorPlan) {
  const perimeterWalls = floor.walls.filter((wall) => wall.managedKind === "perimeter");
  const first = perimeterWalls[0];
  return {
    perimeterEnabled: perimeterWalls.length > 0,
    perimeterThickness: first?.thickness ?? 6,
    perimeterMaterial: first?.material ?? "concrete",
    perimeterColor: first?.color ?? "#334155",
  };
}

export function FloorSettingsDialog({ open, floor, onApply, onClose }: FloorSettingsDialogProps) {
  const [draft, setDraft] = useState<FloorSettingsDraft>(() => ({
    label: floor.label,
    canvasW: normalizeFloorCanvasSize(floor.canvasW, floor.canvasH).w,
    canvasH: normalizeFloorCanvasSize(floor.canvasW, floor.canvasH).h,
    backgroundColor: floor.backgroundColor ?? "#e8e1d7",
    showGrid: floor.showGrid !== false,
    ...perimeterDraftFromFloor(floor),
  }));

  // Re-seed the draft whenever the dialog OPENS so it always reflects the floor.
  // (`floor` is intentionally not a dependency — normalizeFloor produces a fresh
  // object each editor render, which would otherwise wipe in-progress drafts.)
  useEffect(() => {
    if (!open) return;
    const canvas = normalizeFloorCanvasSize(floor.canvasW, floor.canvasH);
    setDraft({
      label: floor.label,
      canvasW: canvas.w,
      canvasH: canvas.h,
      backgroundColor: floor.backgroundColor ?? "#e8e1d7",
      showGrid: floor.showGrid !== false,
      ...perimeterDraftFromFloor(floor),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const canvas = normalizeFloorCanvasSize(draft.canvasW, draft.canvasH);
  const floorPerimeter = perimeterDraftFromFloor(floor);
  const isDirty =
    canvas.w !== normalizeFloorCanvasSize(floor.canvasW, floor.canvasH).w ||
    canvas.h !== normalizeFloorCanvasSize(floor.canvasW, floor.canvasH).h ||
    draft.label !== floor.label ||
    draft.backgroundColor !== (floor.backgroundColor ?? "#e8e1d7") ||
    draft.showGrid !== (floor.showGrid !== false) ||
    draft.perimeterEnabled !== floorPerimeter.perimeterEnabled ||
    draft.perimeterThickness !== floorPerimeter.perimeterThickness ||
    draft.perimeterMaterial !== floorPerimeter.perimeterMaterial ||
    draft.perimeterColor !== floorPerimeter.perimeterColor;

  const handleSave = () => {
    const normalized = normalizeFloorCanvasSize(draft.canvasW, draft.canvasH);
    if (onApply({ ...draft, canvasW: normalized.w, canvasH: normalized.h })) {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[150] flex items-center justify-center bg-background/70 backdrop-blur-sm p-4"
          onClick={onClose}
          data-testid="floor-settings-dialog"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Ruler className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-foreground">Floor Settings</h3>
                  <p className="text-xs text-muted-foreground">Canvas size and floor appearance</p>
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Close floor settings"
                className="w-8 h-8 rounded-xl hover:bg-muted flex items-center justify-center text-muted-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="max-h-[60vh] overflow-y-auto p-5 space-y-5">
              {/* ── General ── */}
              <section className="space-y-2">
                <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">
                  <span className="text-primary">01</span> General
                </div>
                <label className="block">
                  <span className="block text-[9px] font-bold uppercase tracking-wider mb-1 text-muted-foreground">Floor Name</span>
                  <input
                    aria-label="Floor name"
                    value={draft.label}
                    onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
                    className="w-full h-9 px-3 rounded-xl border border-border bg-input-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                  />
                </label>
              </section>

              {/* ── Canvas ── */}
              <section className="space-y-2">
                <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">
                  <span className="text-primary">02</span> Canvas
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="block text-[9px] font-bold uppercase tracking-wider mb-1 text-muted-foreground">Width</span>
                    <input
                      aria-label="Floor canvas width"
                      type="number"
                      min={MIN_FLOOR_CANVAS.w}
                      value={draft.canvasW}
                      onChange={(e) => setDraft((d) => ({ ...d, canvasW: Number(e.target.value) || MIN_FLOOR_CANVAS.w }))}
                      className="w-full h-9 px-3 rounded-xl border border-border bg-input-background text-foreground text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-[9px] font-bold uppercase tracking-wider mb-1 text-muted-foreground">Height</span>
                    <input
                      aria-label="Floor canvas height"
                      type="number"
                      min={MIN_FLOOR_CANVAS.h}
                      value={draft.canvasH}
                      onChange={(e) => setDraft((d) => ({ ...d, canvasH: Number(e.target.value) || MIN_FLOOR_CANVAS.h }))}
                      className="w-full h-9 px-3 rounded-xl border border-border bg-input-background text-foreground text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </label>
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Expanding keeps existing coordinates. Shrinking is blocked when authored objects would fall outside the new floor size.
                </p>
              </section>

              {/* ── Appearance ── */}
              <section className="space-y-2">
                <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">
                  <span className="text-primary">03</span> Appearance
                </div>
                <div>
                  <span className="block text-[9px] font-bold uppercase tracking-wider mb-1.5 text-muted-foreground">Floor Background Color</span>
                  <div className="flex items-center gap-2 flex-wrap">
                    {FLOOR_BACKGROUND_PRESETS.map((preset) => {
                      const active = draft.backgroundColor.toLowerCase() === preset.value;
                      return (
                        <button
                          key={preset.value}
                          type="button"
                          title={preset.label}
                          aria-label={`Background ${preset.label}`}
                          onClick={() => setDraft((d) => ({ ...d, backgroundColor: preset.value }))}
                          className={cn(
                            "h-9 rounded-xl border-2 transition-all flex items-center gap-1.5 px-2.5 text-[10px] font-bold",
                            active
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-muted/20 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                          )}
                        >
                          <span className="w-4 h-4 rounded border border-border/50 shrink-0" style={{ background: preset.value }} />
                          {preset.label}
                          {active && <Check className="h-3 w-3" />}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-2">
                    <span className="block text-[9px] font-bold uppercase tracking-wider mb-1 text-muted-foreground">Custom Color</span>
                    <ColorPicker
                      value={draft.backgroundColor}
                      onChange={(c) => setDraft((d) => ({ ...d, backgroundColor: c }))}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, showGrid: !d.showGrid }))}
                  aria-pressed={draft.showGrid}
                  className={cn(
                    "w-full h-10 px-3 rounded-xl border flex items-center gap-2 text-xs font-bold transition-all",
                    draft.showGrid
                      ? "border-primary/40 bg-primary/5 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted/60"
                  )}
                >
                  <Grid3X3 className={cn("h-3.5 w-3.5", draft.showGrid ? "text-primary" : "text-muted-foreground/60")} />
                  Show canvas grid
                  <span className="ml-auto text-[9px] opacity-70">{draft.showGrid ? "Visible" : "Hidden"}</span>
                </button>

                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  The floor surface stays readable — presets are light tones so walls, rooms, furniture, and selection outlines remain clearly visible.
                </p>
              </section>

              <section className="space-y-3">
                <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">
                  <span className="text-primary">04</span> Perimeter Wall
                </div>
                <button
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, perimeterEnabled: !d.perimeterEnabled }))}
                  aria-pressed={draft.perimeterEnabled}
                  className={cn(
                    "w-full h-10 px-3 rounded-xl border flex items-center gap-2 text-xs font-bold transition-all",
                    draft.perimeterEnabled
                      ? "border-primary/40 bg-primary/5 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted/60"
                  )}
                >
                  <Ruler className={cn("h-3.5 w-3.5", draft.perimeterEnabled ? "text-primary" : "text-muted-foreground/60")} />
                  Enable structural perimeter walls
                  <span className="ml-auto text-[9px] opacity-70">{draft.perimeterEnabled ? "Managed" : "Off"}</span>
                </button>

                {draft.perimeterEnabled && (
                  <>
                    <div>
                      <span className="block text-[9px] font-bold uppercase tracking-wider mb-1.5 text-muted-foreground">Thickness</span>
                      <div className="flex gap-1.5 flex-wrap">
                        {WALL_THICKNESSES.map((thickness) => (
                          <button
                            key={thickness.value}
                            type="button"
                            onClick={() => setDraft((d) => ({ ...d, perimeterThickness: thickness.value }))}
                            className={cn(
                              "h-8 px-2.5 rounded-xl border text-[10px] font-bold transition-all",
                              draft.perimeterThickness === thickness.value
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border text-muted-foreground hover:bg-muted/60"
                            )}
                          >
                            {thickness.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className="block text-[9px] font-bold uppercase tracking-wider mb-1.5 text-muted-foreground">Material</span>
                      <div className="flex gap-1.5 flex-wrap">
                        {WALL_MATERIALS.map((material) => (
                          <button
                            key={material.value}
                            type="button"
                            onClick={() => setDraft((d) => ({ ...d, perimeterMaterial: material.value }))}
                            className={cn(
                              "h-8 px-2.5 rounded-xl border text-[10px] font-bold transition-all",
                              draft.perimeterMaterial === material.value
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border text-muted-foreground hover:bg-muted/60"
                            )}
                          >
                            {material.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className="block text-[9px] font-bold uppercase tracking-wider mb-1 text-muted-foreground">Wall Color</span>
                      <ColorPicker
                        value={draft.perimeterColor}
                        onChange={(c) => setDraft((d) => ({ ...d, perimeterColor: c }))}
                      />
                    </div>
                  </>
                )}
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  The floor boundary remains a visual canvas edge unless this managed wall set is enabled.
                </p>
              </section>
            </div>

            {/* Footer */}
            <div className="flex items-center gap-2 px-5 py-4 border-t border-border bg-muted/15">
              <button
                onClick={onClose}
                className="flex-1 h-10 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!isDirty}
                className={cn(
                  "flex-1 h-10 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1.5",
                  isDirty
                    ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                    : "bg-muted text-muted-foreground cursor-not-allowed"
                )}
              >
                <Save className="h-3.5 w-3.5" /> Save Changes
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

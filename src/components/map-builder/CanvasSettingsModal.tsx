import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X, Ruler, Grid3X3, Palette, ZoomIn, CheckCircle2, Save,
  AlertTriangle, Maximize2, Magnet, RotateCcw, Loader2,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { CANVAS_SIZES } from "./constants";
import { PLVLogo } from "../ui/PLVLogo";
import { ColorPicker } from "../ui/ColorPicker";
import type { Campus, CanvasSizeOption, MeasurementUnit } from "./types";

// ── Props ──────────────────────────────────────────────────────────────────

interface CanvasSettingsModalProps {
  open: boolean;
  campus: Campus;
  onSave: (updates: Partial<Campus>) => void;
  onClose: () => void;
}

// ── Resize impact analysis ─────────────────────────────────────────────────

interface ResizeImpact {
  buildingsOutside: number;
  markersOutside: number;
  totalBuildings: number;
  totalMarkers: number;
  maxX: number;
  maxY: number;
}

function analyzeResizeImpact(campus: Campus, newW: number, newH: number): ResizeImpact {
  let buildingsOutside = 0;
  let markersOutside = 0;
  let maxX = 0;
  let maxY = 0;

  for (const b of campus.buildings) {
    const right = b.x + b.width;
    const bottom = b.y + b.height;
    if (right > newW || bottom > newH) buildingsOutside++;
    maxX = Math.max(maxX, right);
    maxY = Math.max(maxY, bottom);
  }

  for (const m of campus.markers) {
    if (m.x > newW || m.y > newH) markersOutside++;
    maxX = Math.max(maxX, m.x);
    maxY = Math.max(maxY, m.y);
  }

  return {
    buildingsOutside,
    markersOutside,
    totalBuildings: campus.buildings.length,
    totalMarkers: campus.markers.length,
    maxX,
    maxY,
  };
}

// ── Saving overlay (loading screen) ──────────────────────────────────────────

function SavingOverlay({ campusName }: { campusName: string }) {
  const [phase, setPhase] = useState(0);
  const steps = [
    "Validating settings…",
    "Applying grid changes…",
    "Updating canvas…",
    "Finalizing…",
    "Ready!",
  ];

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    steps.forEach((_, i) => {
      timers.push(setTimeout(() => setPhase(i), i * 250));
    });
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: "radial-gradient(ellipse 80% 60% at 50% 40%, #0d2470 0%, #071440 55%, #020a1c 100%)" }}
    >
      <div className="flex flex-col items-center gap-6">
        <div style={{ animation: "hero-breathe 2s ease-in-out infinite" }}>
          <PLVLogo size={64} />
        </div>
        <div className="text-center">
          <p className="text-white/40 text-xs font-semibold tracking-widest uppercase mb-1">{campusName}</p>
          <h2 className="text-lg font-extrabold text-white tracking-tight">Saving Settings</h2>
        </div>
        <div className="w-56 space-y-2">
          {steps.map((label, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all duration-300",
                i < phase ? "bg-green-400" : i === phase ? "bg-white/20 ring-2 ring-white/40" : "bg-white/5"
              )}>
                {i < phase && <CheckCircle2 className="w-3 h-3 text-white" />}
                {i === phase && <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
              </div>
              <span className={cn("text-[11px] font-medium transition-colors duration-300",
                i <= phase ? "text-white/80" : "text-white/20"
              )}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function CanvasSettingsModal({ open, campus, onSave, onClose }: CanvasSettingsModalProps) {
  // ── Canvas dimensions ──
  const [canvasW, setCanvasW] = useState(campus.canvasW);
  const [canvasH, setCanvasH] = useState(campus.canvasH);

  // ── Grid & Units ──
  const [gridSize, setGridSize] = useState(campus.gridSize ?? 20);
  const [snapToGrid, setSnapToGrid] = useState(campus.snapToGrid ?? true);
  const [measurementUnit, setMeasurementUnit] = useState<MeasurementUnit>(campus.measurementUnit ?? "pixels");

  // ── Appearance ──
  const [canvasColor, setCanvasColor] = useState((campus as unknown as { canvasColor?: string }).canvasColor ?? "#f5f3ef");
  const [defaultZoom, setDefaultZoom] = useState(campus.defaultZoom ?? 1);

  // ── Resize confirmation state ──
  const [showResizeConfirm, setShowResizeConfirm] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<Partial<Campus> | null>(null);

  // ── Dirty state & confirmation flow ──
  const [hasChanges, setHasChanges] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [showSaving, setShowSaving] = useState(false);
  const [showUnsaved, setShowUnsaved] = useState(false);

  const markChanged = () => setHasChanges(true);

  // Reset local state when campus changes
  useEffect(() => {
    setCanvasW(campus.canvasW);
    setCanvasH(campus.canvasH);
    setGridSize(campus.gridSize ?? 20);
    setSnapToGrid(campus.snapToGrid ?? true);
    setMeasurementUnit(campus.measurementUnit ?? "pixels");
    setCanvasColor((campus as unknown as { canvasColor?: string }).canvasColor ?? "#f5f3ef");
    setDefaultZoom(campus.defaultZoom ?? 1);
    setShowResizeConfirm(false);
    setPendingChanges(null);
    setHasChanges(false);
    setShowSaveConfirm(false);
    setShowSaving(false);
    setShowUnsaved(false);
  }, [campus, open]);

  const hasObjects = campus.buildings.length > 0 || campus.markers.length > 0 || campus.paths.length > 0;
  const dimensionsChanged = canvasW !== campus.canvasW || canvasH !== campus.canvasH;
  const impact = analyzeResizeImpact(campus, canvasW, canvasH);
  const willClip = impact.buildingsOutside > 0 || impact.markersOutside > 0;

  const buildUpdates = useCallback((): Partial<Campus> => ({
    canvasW: Math.max(200, Math.min(5000, canvasW)),
    canvasH: Math.max(200, Math.min(5000, canvasH)),
    gridSize,
    snapToGrid,
    measurementUnit,
    canvasColor: canvasColor || undefined,
    defaultZoom,
  }), [canvasW, canvasH, gridSize, snapToGrid, measurementUnit, canvasColor, defaultZoom]);

  // ── Close with unsaved-changes guard ──
  const handleClose = useCallback(() => {
    if (hasChanges) {
      setShowUnsaved(true);
    } else {
      onClose();
    }
  }, [hasChanges, onClose]);

  const handleSave = useCallback(() => {
    const updates = buildUpdates();

    // If resizing and there are objects that might be affected, show confirmation
    if (dimensionsChanged && hasObjects && willClip) {
      setPendingChanges(updates);
      setShowResizeConfirm(true);
      return;
    }

    // Show save confirmation
    setShowSaveConfirm(true);
  }, [buildUpdates, dimensionsChanged, hasObjects, willClip]);

  const handleConfirmSave = useCallback(() => {
    setShowSaveConfirm(false);
    setShowSaving(true);
    const updates = buildUpdates();
    // Show loading for ~1.5s to let changes reflect, then save & close
    setTimeout(() => {
      onSave({ ...updates, canvasConfigured: true });
      setShowSaving(false);
      setHasChanges(false);
      onClose();
    }, 1500);
  }, [buildUpdates, onSave, onClose]);

  const handleConfirmResize = useCallback(() => {
    if (pendingChanges) {
      setShowResizeConfirm(false);
      setShowSaving(true);
      setTimeout(() => {
        onSave({ ...pendingChanges, canvasConfigured: true });
        setPendingChanges(null);
        setShowSaving(false);
        setHasChanges(false);
        onClose();
      }, 1500);
    }
  }, [pendingChanges, onSave, onClose]);

  if (!open) return null;

  const hasChangesSummary = [
    canvasW !== campus.canvasW ? "Canvas size" : null,
    canvasH !== campus.canvasH ? "Canvas size" : null,
    gridSize !== (campus.gridSize ?? 20) ? "Grid size" : null,
    snapToGrid !== (campus.snapToGrid ?? true) ? "Snap setting" : null,
    measurementUnit !== (campus.measurementUnit ?? "pixels") ? "Measurement unit" : null,
    canvasColor !== ((campus as unknown as { canvasColor?: string }).canvasColor ?? "#f5f3ef") ? "Canvas color" : null,
    defaultZoom !== (campus.defaultZoom ?? 1) ? "Default zoom" : null,
  ].filter(Boolean);

  return (
    <>
      {/* ── Main settings panel ── */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden"
          style={{ maxHeight: "90vh" }}
        >
          {/* ── Header ── */}
          <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-border shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center shrink-0 ring-1 ring-primary/10">
                <Ruler className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="font-extrabold text-foreground text-base">Canvas Settings</h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Adjust the canvas for {campus.name}
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center hover:bg-secondary transition-colors text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* ── Content ── */}
          <div className="flex-1 overflow-y-auto scrollbar-show-on-hover scroll-smooth px-6 py-4 space-y-5" style={{ maxHeight: "55vh" }}>
            {/* ── Dimensions section ── */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Maximize2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-extrabold text-foreground uppercase tracking-wide">Canvas Dimensions</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5 text-muted-foreground">Width (px)</label>
                  <input
                    type="number"
                    min={200}
                    max={5000}
                    value={canvasW}
                    onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v) && v > 0) setCanvasW(v); else if (e.target.value === "") setCanvasW(0); markChanged(); }}
                    className="w-full h-10 px-3.5 rounded-xl border border-border bg-input-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5 text-muted-foreground">Height (px)</label>
                  <input
                    type="number"
                    min={200}
                    max={5000}
                    value={canvasH}
                    onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v) && v > 0) setCanvasH(v); else if (e.target.value === "") setCanvasH(0); markChanged(); }}
                    className="w-full h-10 px-3.5 rounded-xl border border-border bg-input-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
                  />
                </div>
              </div>

              {/* Resize impact warning */}
              {dimensionsChanged && hasObjects && (
                <div className={cn(
                  "mt-3 flex items-start gap-2.5 p-3 rounded-xl border text-xs leading-relaxed",
                  willClip
                    ? "bg-amber-50/50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/30 text-amber-800 dark:text-amber-300"
                    : "bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800/30 text-blue-800 dark:text-blue-300"
                )}>
                  {willClip ? (
                    <>
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
                      <div>
                        <p className="font-bold">Resize may clip {impact.buildingsOutside + impact.markersOutside} object{impact.buildingsOutside + impact.markersOutside !== 1 ? "s" : ""}</p>
                        <p className="mt-0.5 opacity-80">
                          {impact.buildingsOutside > 0 && `${impact.buildingsOutside} building${impact.buildingsOutside > 1 ? "s" : ""} `}
                          {impact.markersOutside > 0 && `${impact.markersOutside} marker${impact.markersOutside > 1 ? "s" : ""} `}
                          extend beyond the new canvas boundary. A confirmation dialog will appear before saving.
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-blue-500" />
                      <div>
                        <p className="font-bold">All objects fit within the new dimensions</p>
                        <p className="mt-0.5 opacity-80">Existing buildings and markers will be preserved.</p>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Current canvas size indicator */}
              {!dimensionsChanged && (
                <div className="mt-3 flex items-center gap-2 text-[10px] text-muted-foreground/60">
                  <span className="font-mono">Current: {campus.canvasW} × {campus.canvasH}px</span>
                </div>
              )}
            </div>

            <div className="h-px bg-border" />

            {/* ── Grid & Units section ── */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Grid3X3 className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-extrabold text-foreground uppercase tracking-wide">Grid & Units</span>
              </div>

              {/* Grid size */}
              <div className="mb-4">
                <label className="block text-[10px] font-bold uppercase tracking-wide mb-2 text-muted-foreground">Grid Size</label>
                <div className="flex items-center gap-2">
                  {[10, 20, 40, 80].map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => { setGridSize(size); markChanged(); }}
                      className={cn(
                        "flex-1 h-10 rounded-xl font-bold text-xs transition-all border",
                        gridSize === size
                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                          : "bg-input-background text-muted-foreground border-border hover:border-primary/30 hover:text-foreground"
                      )}
                    >
                      {size}px
                    </button>
                  ))}
                </div>
              </div>

              {/* Snap to grid */}
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-border bg-muted/20 mb-4">
                <div className="flex items-center gap-2.5">
                  <Magnet className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs font-bold text-foreground">Snap to Grid</p>
                    <p className="text-[10px] text-muted-foreground">Elements snap to grid intersections</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setSnapToGrid((v) => !v); markChanged(); }}
                  className={cn(
                    "relative w-10 h-5 rounded-full transition-colors",
                    snapToGrid ? "bg-primary" : "bg-muted-foreground/30"
                  )}
                >
                  <div className={cn(
                    "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform",
                    snapToGrid ? "translate-x-5" : "translate-x-0.5"
                  )} />
                </button>
              </div>

              {/* Measurement units */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide mb-2 text-muted-foreground">Measurement Units</label>
                <div className="flex items-center gap-2">
                  {(["pixels", "meters", "feet"] as MeasurementUnit[]).map((unit) => (
                    <button
                      key={unit}
                      type="button"
                      onClick={() => { setMeasurementUnit(unit); markChanged(); }}
                      className={cn(
                        "flex-1 h-10 rounded-xl font-bold text-xs transition-all border capitalize",
                        measurementUnit === unit
                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                          : "bg-input-background text-muted-foreground border-border hover:border-primary/30 hover:text-foreground"
                      )}
                    >
                      {unit}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="h-px bg-border" />

            {/* ── Appearance section ── */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Palette className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-extrabold text-foreground uppercase tracking-wide">Canvas Background</span>
              </div>

              {/* Canvas background color — using the same ColorPicker from CampusWizard */}
              <div className="mb-4">
                <label className="block text-[10px] font-bold uppercase tracking-wide mb-2 text-muted-foreground">Background Color</label>
                <ColorPicker
                  value={canvasColor}
                  onChange={(c) => { setCanvasColor(c); markChanged(); }}
                />
              </div>

              {/* Default zoom */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide mb-2 text-muted-foreground flex items-center gap-1.5">
                  <ZoomIn className="h-3 w-3" />
                  Default Zoom
                </label>
                <div className="flex items-center gap-2">
                  {[0.5, 0.75, 1, 1.25, 1.5].map((z) => (
                    <button
                      key={z}
                      type="button"
                      onClick={() => { setDefaultZoom(z); markChanged(); }}
                      className={cn(
                        "flex-1 h-10 rounded-xl font-bold text-xs transition-all border",
                        Math.abs(defaultZoom - z) < 0.01
                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                          : "bg-input-background text-muted-foreground border-border hover:border-primary/30 hover:text-foreground"
                      )}
                    >
                      {Math.round(z * 100)}%
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── Footer ── */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-border shrink-0 bg-muted/20">
            <button
              onClick={() => {
                // Reset to original values
                setCanvasW(campus.canvasW);
                setCanvasH(campus.canvasH);
                setGridSize(campus.gridSize ?? 20);
                setSnapToGrid(campus.snapToGrid ?? true);
                setMeasurementUnit(campus.measurementUnit ?? "pixels");
                setCanvasColor((campus as unknown as { canvasColor?: string }).canvasColor ?? "#f5f3ef");
                setDefaultZoom(campus.defaultZoom ?? 1);
                setHasChanges(false);
              }}
              className="flex items-center gap-1.5 h-10 px-4 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 h-10 px-5 rounded-xl bg-primary text-primary-foreground text-xs font-extrabold hover:bg-primary/90 transition-all shadow-sm"
            >
              <Save className="h-4 w-4" />
              Save Settings
            </button>
          </div>
        </motion.div>
      </div>

      {/* ── Save confirmation overlay ── */}
      <AnimatePresence>
        {showSaveConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[150] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="flex items-start gap-4 p-5">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Save className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <h3 className="text-sm font-extrabold text-foreground">Save Changes?</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {hasChangesSummary.length > 0
                      ? `Apply changes to ${[...new Set(hasChangesSummary)].join(", ")}? The editor will update to reflect your new settings.`
                      : "Save your canvas settings? The editor will update to reflect your changes."}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 px-5 pb-5">
                <button
                  onClick={() => setShowSaveConfirm(false)}
                  className="flex-1 h-10 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmSave}
                  className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-xs font-extrabold hover:bg-primary/90 shadow-sm transition-all flex items-center justify-center gap-1.5"
                >
                  <Save className="h-3.5 w-3.5" />
                  Save Changes
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Unsaved changes dialog ── */}
      <AnimatePresence>
        {showUnsaved && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[150] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="flex items-start gap-4 p-5">
                <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <h3 className="text-sm font-extrabold text-foreground">Discard Changes?</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    You have unsaved changes to your canvas settings. If you close now, these changes will be lost.
                  </p>
                </div>
              </div>
              <div className="flex gap-2 px-5 pb-5">
                <button
                  onClick={() => setShowUnsaved(false)}
                  className="flex-1 h-10 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:bg-muted transition-colors"
                >
                  Keep Editing
                </button>
                <button
                  onClick={() => { setShowUnsaved(false); setHasChanges(false); onClose(); }}
                  className="flex-1 h-10 rounded-xl bg-destructive text-destructive-foreground text-xs font-extrabold hover:bg-destructive/90 shadow-sm transition-all"
                >
                  Discard
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Saving overlay (loading screen) ── */}
      <AnimatePresence>
        {showSaving && (
          <SavingOverlay campusName={campus.name} />
        )}
      </AnimatePresence>

      {/* ── Resize confirmation overlay ── */}
      <AnimatePresence>
        {showResizeConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
            onClick={() => setShowResizeConfirm(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-sm overflow-hidden rounded-2xl border shadow-2xl"
              style={{ background: "var(--card)", borderColor: "var(--amber-200, #fde68a)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col items-center px-6 pt-6 pb-2 text-center">
                <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
                  style={{ background: "color-mix(in srgb, #f59e0b 12%, transparent)" }}>
                  <AlertTriangle className="h-6 w-6 text-amber-500" />
                </div>
                <h3 className="text-base font-extrabold text-foreground">Resize Canvas?</h3>
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed max-w-[280px]">
                  Changing the canvas dimensions from <span className="font-mono font-bold">{campus.canvasW}×{campus.canvasH}</span> to{" "}
                  <span className="font-mono font-bold">{canvasW}×{canvasH}</span> may affect existing objects.
                </p>

                {/* Impact summary */}
                <div className="w-full mt-4 space-y-2 text-left">
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border text-xs">
                    <span className="text-muted-foreground">Buildings affected</span>
                    <span className={cn("font-bold tabular-nums", impact.buildingsOutside > 0 ? "text-amber-500" : "text-green-500")}>
                      {impact.buildingsOutside} / {impact.totalBuildings}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border text-xs">
                    <span className="text-muted-foreground">Markers affected</span>
                    <span className={cn("font-bold tabular-nums", impact.markersOutside > 0 ? "text-amber-500" : "text-green-500")}>
                      {impact.markersOutside} / {impact.totalMarkers}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border text-xs">
                    <span className="text-muted-foreground">Largest object extent</span>
                    <span className="font-mono font-bold text-foreground">{impact.maxX} × {impact.maxY}</span>
                  </div>
                </div>

                <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
                  Objects extending beyond the new boundary will be preserved at their current coordinates but may be clipped visually.
                </p>
              </div>
              <div className="flex gap-2.5 px-6 pb-6 pt-3">
                <button
                  onClick={() => { setShowResizeConfirm(false); setPendingChanges(null); }}
                  className="flex-1 h-10 rounded-xl border text-xs font-bold text-foreground hover:bg-muted transition-colors"
                  style={{ borderColor: "var(--border)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmResize}
                  className="flex-1 h-10 rounded-xl text-xs font-extrabold text-white transition-colors shadow-sm bg-amber-500 hover:bg-amber-600"
                >
                  Apply Resize
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

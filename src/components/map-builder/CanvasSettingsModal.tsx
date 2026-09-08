import { useState, useCallback, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X, Ruler, Palette, ZoomIn, CheckCircle2, Save,
  AlertTriangle, Maximize2, RotateCcw,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { CANVAS_SIZES } from "./constants";
import { PLVLogo } from "../ui/PLVLogo";
import { ColorPicker } from "../ui/ColorPicker";
import type { Campus } from "./types";
import { CAMPUS_GROUND_DEFAULTS, CAMPUS_GROUND_MATERIALS, campusGroundAppearance, normalizeCampusGroundTexture, normalizeCampusGroundMaterial, fitCampusCanvas, centeredRotatedBounds } from "../../lib/campusCanvas";
import { DECOR_ASSET_MAP, isDecorAreaType } from "./constants";
import { decorWorldSize } from "../../lib/decorVisual";
import { CompactDropdown } from "./CompactDropdown";
import { CampusGroundPreview } from "./CampusGroundPreview";

// ── Props ──────────────────────────────────────────────────────────────────

interface CanvasSettingsModalProps {
  open: boolean;
  campus: Campus;
  /** Persist the complete settings update. A rejected promise keeps this
   * dialog open so a transient backend/auth failure cannot discard the local
   * appearance draft. */
  onSave: (updates: Partial<Campus>) => Promise<void> | void;
  onClose: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function aspectRatioLabel(w: number, h: number): string {
  if (w <= 0 || h <= 0) return "";
  const g = gcd(w, h);
  const aw = w / g;
  const ah = h / g;
  // Clamp to reasonable ratios for display
  if (aw > 50 || ah > 50) return `${Math.round(w / h * 10) / 10}:1`;
  return `${aw}:${ah}`;
}

function orientationLabel(w: number, h: number): string {
  if (w > h) return "Landscape";
  if (h > w) return "Portrait";
  return "Square";
}

// ── Resize impact analysis ─────────────────────────────────────────────────

interface ResizeImpact {
  buildingsOutside: number;
  markersOutside: number;
  pathsOutside: number;
  nodesOutside: number;
  decorOutside: number;
  totalBuildings: number;
  totalMarkers: number;
  maxX: number;
  maxY: number;
}

function analyzeResizeImpact(campus: Campus, newW: number, newH: number): ResizeImpact {
  let buildingsOutside = 0;
  let markersOutside = 0;
  let pathsOutside = 0;
  let nodesOutside = 0;
  let decorOutside = 0;
  let maxX = 0;
  let maxY = 0;
  const outside = (bounds: { minX: number; minY: number; maxX: number; maxY: number }) =>
    bounds.minX < 0 || bounds.minY < 0 || bounds.maxX > newW || bounds.maxY > newH;

  for (const b of campus.buildings) {
    const bounds = centeredRotatedBounds(b.x + b.width / 2, b.y + b.height / 2, b.width, b.height, b.rotation ?? 0);
    if (outside(bounds)) buildingsOutside++;
    maxX = Math.max(maxX, bounds.maxX);
    maxY = Math.max(maxY, bounds.maxY);
  }

  for (const m of campus.markers) {
    // Gate markers may intentionally sit on the perimeter; the anchor is the
    // semantic extent for those records. Other physical markers use their
    // rendered dimensions so a clipped frame cannot be applied silently.
    const bounds = m.type === "gate" || m.purpose
      ? { minX: m.x, minY: m.y, maxX: m.x, maxY: m.y }
      : centeredRotatedBounds(m.x, m.y, m.width ?? 24, m.height ?? 24);
    if (outside(bounds)) markersOutside++;
    maxX = Math.max(maxX, bounds.maxX);
    maxY = Math.max(maxY, bounds.maxY);
  }

  for (const path of campus.paths ?? []) {
    const halfWidth = Math.max(0, Number(path.width) || 0) / 2;
    if ((path.points ?? []).some((point) => outside({ minX: point.x - halfWidth, minY: point.y - halfWidth, maxX: point.x + halfWidth, maxY: point.y + halfWidth }))) pathsOutside++;
    for (const point of path.points ?? []) {
      maxX = Math.max(maxX, point.x + halfWidth);
      maxY = Math.max(maxY, point.y + halfWidth);
    }
  }
  for (const node of campus.navNodes ?? []) {
    if (node.x > newW || node.y > newH || node.x < 0 || node.y < 0) nodesOutside++;
    maxX = Math.max(maxX, node.x);
    maxY = Math.max(maxY, node.y);
  }
  for (const asset of campus.decorAssets ?? []) {
    if (asset.visible === false) continue;
    if (asset.surfaceCells?.length) {
      const cellSize = Math.max(1, asset.surfaceCellSize ?? campus.gridSize ?? 20);
      let assetOutside = false;
      for (const cell of asset.surfaceCells) {
        const right = (cell.x + 1) * cellSize;
        const bottom = (cell.y + 1) * cellSize;
        if (cell.x * cellSize < 0 || cell.y * cellSize < 0 || right > newW || bottom > newH) assetOutside = true;
        maxX = Math.max(maxX, right);
        maxY = Math.max(maxY, bottom);
      }
      if (assetOutside) decorOutside++;
      continue;
    }
    const template = DECOR_ASSET_MAP[asset.type];
    const size = isDecorAreaType(asset.type)
      ? { width: asset.width ?? template?.defaultWidth ?? 0, height: asset.height ?? template?.defaultHeight ?? 0 }
      : template
        ? decorWorldSize(template, asset.scale)
        : { width: asset.width ?? 0, height: asset.height ?? 0 };
    const bounds = centeredRotatedBounds(asset.x, asset.y, size.width, size.height, asset.rotation ?? 0);
    if (outside(bounds)) decorOutside++;
    maxX = Math.max(maxX, bounds.maxX);
    maxY = Math.max(maxY, bounds.maxY);
  }

  return {
    buildingsOutside,
    markersOutside,
    pathsOutside,
    nodesOutside,
    decorOutside,
    totalBuildings: campus.buildings.length,
    totalMarkers: campus.markers.length,
    maxX,
    maxY,
  };
}

// ── Dimension presets ──────────────────────────────────────────────────────

const DIMENSION_PRESETS = [
  { id: "small", label: "Small", w: 600, h: 480, icon: "▭" as const },
  { id: "medium", label: "Medium", w: 900, h: 680, icon: "▬" as const },
  { id: "large", label: "Large", w: 1200, h: 900, icon: "▮" as const },
  { id: "hd", label: "Wide", w: 1400, h: 800, icon: "▬" as const },
  { id: "square", label: "Square", w: 800, h: 800, icon: "◻" as const },
];

// ── Saving overlay (loading screen) ──────────────────────────────────────────

function SavingOverlay({ campusName }: { campusName: string }) {
  const [phase, setPhase] = useState(0);
  const steps = [
    "Validating settings…",
    "Applying canvas changes…",
    "Updating editor…",
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

  // ── Validation ──
  const [validationError, setValidationError] = useState<string | null>(null);

  // ── Appearance ──
  const initialGround = campusGroundAppearance(campus);
  const [groundMaterial, setGroundMaterial] = useState(initialGround.material);
  const [groundColor, setGroundColor] = useState(initialGround.color);
  const [groundTexture, setGroundTexture] = useState(initialGround.texture);
  // Keep the legacy local name as an alias for existing preview/reset paths.
  const canvasColor = groundColor;
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

  // ── Validate dimensions ──
  const validateDimensions = useCallback((w: number, h: number): string | null => {
    if (w < 100 || h < 100) return "Dimensions must be at least 100px";
    if (w > 5000 || h > 5000) return "Dimensions cannot exceed 5000px";
    if (w * h > 25_000_000) return "Total area exceeds 25 million px². Consider smaller dimensions.";
    return null;
  }, []);

  // Reset local state when campus opens
  useEffect(() => {
    setCanvasW(campus.canvasW);
    setCanvasH(campus.canvasH);
    const appearance = campusGroundAppearance(campus);
    setGroundMaterial(appearance.material);
    setGroundColor(appearance.color);
    setGroundTexture(appearance.texture);
    setDefaultZoom(campus.defaultZoom ?? 1);
    setShowResizeConfirm(false);
    setPendingChanges(null);
    setHasChanges(false);
    setShowSaveConfirm(false);
    setShowSaving(false);
    setShowUnsaved(false);
    setValidationError(null);
  }, [campus, open]);

  // ── Memoized derived values ──
  const aspectRatio = useMemo(() => aspectRatioLabel(canvasW, canvasH), [canvasW, canvasH]);
  const orientation = useMemo(() => orientationLabel(canvasW, canvasH), [canvasW, canvasH]);

  const hasObjects = campus.buildings.length > 0 || campus.markers.length > 0 || campus.paths.length > 0
    || (campus.navNodes?.length ?? 0) > 0 || (campus.decorAssets ?? []).some((asset) => asset.visible !== false);
  const dimensionsChanged = canvasW !== campus.canvasW || canvasH !== campus.canvasH;
  const impact = analyzeResizeImpact(campus, canvasW, canvasH);
  const willClip = impact.buildingsOutside > 0 || impact.markersOutside > 0 || impact.pathsOutside > 0 || impact.nodesOutside > 0 || impact.decorOutside > 0;
  const clippedCount = impact.buildingsOutside + impact.markersOutside + impact.pathsOutside + impact.nodesOutside + impact.decorOutside;
  const fittedCanvas = useMemo(() => fitCampusCanvas(campus), [campus]);

  const buildUpdates = useCallback((): Partial<Campus> => ({
    canvasW: Math.max(100, Math.min(5000, canvasW)),
    canvasH: Math.max(100, Math.min(5000, canvasH)),
    canvasGroundMaterial: groundMaterial,
    canvasGroundColor: groundColor || undefined,
    canvasGroundTexture: groundTexture,
    // Preserve this legacy field for older snapshots/readers.
    canvasColor: groundColor || undefined,
    defaultZoom,
  }), [canvasW, canvasH, groundMaterial, groundColor, groundTexture, defaultZoom]);

  // ── Apply preset ──
  const applyPreset = useCallback((w: number, h: number) => {
    setCanvasW(w);
    setCanvasH(h);
    setValidationError(validateDimensions(w, h));
    markChanged();
  }, [validateDimensions]);

  // ── Close with unsaved-changes guard ──
  const handleClose = useCallback(() => {
    if (hasChanges) {
      setShowUnsaved(true);
    } else {
      onClose();
    }
  }, [hasChanges, onClose]);

  const handleSave = useCallback(() => {
    const err = validateDimensions(canvasW, canvasH);
    if (err) {
      setValidationError(err);
      return;
    }

    const updates = buildUpdates();

    // If resizing and there are objects that might be affected, show confirmation
    if (dimensionsChanged && hasObjects && willClip) {
      setPendingChanges(updates);
      setShowResizeConfirm(true);
      return;
    }

    // Show save confirmation
    setShowSaveConfirm(true);
  }, [buildUpdates, dimensionsChanged, hasObjects, willClip, canvasW, canvasH, validateDimensions]);

  const handleConfirmSave = useCallback(async () => {
    setShowSaveConfirm(false);
    setShowSaving(true);
    const updates = buildUpdates();
    try {
      await onSave({ ...updates, canvasConfigured: true });
      setShowSaving(false);
      setHasChanges(false);
      onClose();
    } catch {
      // The parent owns the user-facing error toast. Keep this editor mounted
      // with its local values intact so the admin can retry without losing the
      // appearance draft or being redirected by a failed save.
      setShowSaving(false);
    }
  }, [buildUpdates, onSave, onClose]);

  const handleConfirmResize = useCallback(async () => {
    if (!pendingChanges) return;
    // A shrink that clips authored content is not safe to apply from this
    // confirmation. Keep the draft and warning visible so the admin can
    // choose a larger size (or Fit to Content) instead of silently committing
    // a canvas that renders objects outside its authored frame.
    if (willClip) return;
    setShowResizeConfirm(false);
    setShowSaving(true);
    try {
      await onSave({ ...pendingChanges, canvasConfigured: true });
      setPendingChanges(null);
      setShowSaving(false);
      setHasChanges(false);
      onClose();
    } catch {
      // Keep pendingChanges and the modal state available for a retry after a
      // transient persistence/auth failure.
      setShowSaving(false);
    }
  }, [pendingChanges, onSave, onClose, willClip]);

  if (!open) return null;

  const hasChangesSummary = [
    canvasW !== campus.canvasW || canvasH !== campus.canvasH ? "Canvas dimensions" : null,
    groundMaterial !== campusGroundAppearance(campus).material || groundColor !== campusGroundAppearance(campus).color || groundTexture !== campusGroundAppearance(campus).texture ? "Canvas appearance" : null,
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

              {/* Preset size buttons */}
              <div className="grid grid-cols-5 gap-1.5 mb-4">
                {DIMENSION_PRESETS.map((preset) => {
                  const isActive = canvasW === preset.w && canvasH === preset.h;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyPreset(preset.w, preset.h)}
                      className={cn(
                        "flex flex-col items-center gap-0.5 py-2 px-1 rounded-xl text-[10px] font-bold transition-all border",
                        isActive
                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                          : "bg-input-background text-muted-foreground border-border hover:border-primary/30 hover:text-foreground"
                      )}
                    >
                      <span className="text-sm leading-none">{preset.icon}</span>
                      <span>{preset.label}</span>
                      <span className="text-[8px] font-mono opacity-70">{preset.w}×{preset.h}</span>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => applyPreset(fittedCanvas.width, fittedCanvas.height)}
                className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2 text-[10px] font-extrabold text-primary transition-colors hover:bg-primary/10"
              >
                <Maximize2 className="h-3.5 w-3.5" />
                Fit to Content
                <span className="font-mono text-[9px] opacity-60">{fittedCanvas.width}×{fittedCanvas.height}</span>
              </button>

              {/* Width & Height inputs */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5 text-muted-foreground">Width (px)</label>
                  <input
                    type="number"
                    min={100}
                    max={5000}
                    value={canvasW}
                    onChange={(e) => {
                      const v = parseInt(e.target.value);
                      if (!isNaN(v) && v > 0) {
                        setCanvasW(v);
                        setValidationError(validateDimensions(v, canvasH));
                      } else if (e.target.value === "") {
                        setCanvasW(0);
                        setValidationError(null);
                      }
                      markChanged();
                    }}
                    className={cn(
                      "w-full h-10 px-3.5 rounded-xl border bg-input-background text-foreground text-sm focus:outline-none focus:ring-2 transition-shadow",
                      validationError ? "border-destructive focus:ring-destructive/30" : "border-border focus:ring-primary/30"
                    )}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5 text-muted-foreground">Height (px)</label>
                  <input
                    type="number"
                    min={100}
                    max={5000}
                    value={canvasH}
                    onChange={(e) => {
                      const v = parseInt(e.target.value);
                      if (!isNaN(v) && v > 0) {
                        setCanvasH(v);
                        setValidationError(validateDimensions(canvasW, v));
                      } else if (e.target.value === "") {
                        setCanvasH(0);
                        setValidationError(null);
                      }
                      markChanged();
                    }}
                    className={cn(
                      "w-full h-10 px-3.5 rounded-xl border bg-input-background text-foreground text-sm focus:outline-none focus:ring-2 transition-shadow",
                      validationError ? "border-destructive focus:ring-destructive/30" : "border-border focus:ring-primary/30"
                    )}
                  />
                </div>
              </div>

              {/* Validation error */}
              {validationError && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-destructive"
                >
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  {validationError}
                </motion.div>
              )}

              {/* Aspect ratio & orientation badge */}
              {canvasW > 0 && canvasH > 0 && !validationError && (
                <div className="mt-3 flex items-center gap-2">
                  <div className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border",
                    orientation === "Landscape"
                      ? "bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800/30 text-blue-700 dark:text-blue-300"
                      : orientation === "Portrait"
                        ? "bg-purple-50/50 dark:bg-purple-900/10 border-purple-200 dark:border-purple-800/30 text-purple-700 dark:text-purple-300"
                        : "bg-green-50/50 dark:bg-green-900/10 border-green-200 dark:border-green-800/30 text-green-700 dark:text-green-300"
                  )}>
                    <span>{orientation}</span>
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground/60">
                    {canvasW} × {canvasH} px
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground/40">
                    ({aspectRatio})
                  </span>
                  {/* Megapixel badge */}
                  <span className="text-[9px] font-mono text-muted-foreground/30 ml-auto">
                    {(canvasW * canvasH / 1_000_000).toFixed(1)} MP
                  </span>
                </div>
              )}

              {/* Visual aspect-ratio preview */}
              {canvasW > 0 && canvasH > 0 && !validationError && (
                <div className="mt-3 rounded-xl border border-border bg-muted/15 p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[8px] font-extrabold uppercase tracking-widest text-muted-foreground/50">Preview</span>
                    <span className="text-[8px] font-mono text-muted-foreground/30">{orientation} · {aspectRatio}</span>
                  </div>
                  <div
                    className="rounded-lg mx-auto border border-border/40 overflow-hidden transition-all duration-300 relative"
                    style={{
                      width: "100%", maxWidth: 240,
                      aspectRatio: `${canvasW} / ${canvasH}`,
                    }}
                  >
                    <CampusGroundPreview material={groundMaterial} color={groundColor} texture={groundTexture} width={canvasW} height={canvasH} />
                    {/* Dimension label */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-[10px] font-mono font-bold text-foreground/20 select-none">
                        {canvasW} × {canvasH}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Resize impact warning */}
              {dimensionsChanged && hasObjects && !validationError && (
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
                        <p className="font-bold">Resize may clip {clippedCount} authored item{clippedCount !== 1 ? "s" : ""}</p>
                        <p className="mt-0.5 opacity-80">
                          {impact.buildingsOutside > 0 && `${impact.buildingsOutside} building${impact.buildingsOutside > 1 ? "s" : ""} `}
                          {impact.markersOutside > 0 && `${impact.markersOutside} marker${impact.markersOutside > 1 ? "s" : ""} `}
                          {impact.pathsOutside > 0 && `${impact.pathsOutside} path${impact.pathsOutside > 1 ? "s" : ""} `}
                          {impact.nodesOutside > 0 && `${impact.nodesOutside} navigation node${impact.nodesOutside > 1 ? "s" : ""} `}
                          {impact.decorOutside > 0 && `${impact.decorOutside} decor item${impact.decorOutside > 1 ? "s" : ""} `}
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

            {/* ── Appearance section ── */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Palette className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-extrabold text-foreground uppercase tracking-wide">Canvas Appearance</span>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label htmlFor="canvas-ground-material" className="block text-[10px] font-bold uppercase tracking-wide mb-2 text-muted-foreground">Ground Material</label>
                  <CompactDropdown
                    value={groundMaterial}
                    options={[...CAMPUS_GROUND_MATERIALS]}
                    ariaLabel="Ground material"
                    id="canvas-ground-material"
                    testId="canvas-ground-material"
                    onChange={(value) => {
                      const next = normalizeCampusGroundMaterial(value);
                      setGroundMaterial(next);
                      setGroundColor(CAMPUS_GROUND_DEFAULTS[next]);
                      markChanged();
                    }}
                    className="h-10 rounded-xl px-3 text-xs font-bold"
                  />
                </div>
                <div>
                  <label htmlFor="canvas-ground-texture" className="block text-[10px] font-bold uppercase tracking-wide mb-2 text-muted-foreground">Texture</label>
                  <CompactDropdown
                    value={groundTexture}
                    options={[{ value: "subtle", label: "Subtle" }, { value: "none", label: "None" }]}
                    ariaLabel="Ground texture"
                    id="canvas-ground-texture"
                    testId="canvas-ground-texture"
                    onChange={(value) => { setGroundTexture(normalizeCampusGroundTexture(value)); markChanged(); }}
                    className="h-10 rounded-xl px-3 text-xs font-bold"
                  />
                </div>
              </div>

              {/* Canvas ground color */}
              <div className="mb-4">
                <label className="block text-[10px] font-bold uppercase tracking-wide mb-2 text-muted-foreground">Ground Color</label>
                <ColorPicker
                  value={groundColor}
                  // A custom tint should not discard the selected material.
                  // Keep Grass/Concrete/Pavers/Asphalt active so their tiled
                  // renderer remains visible; choosing Custom in the material
                  // dropdown is still available when a neutral custom surface
                  // is desired.
                  onChange={(c) => { setGroundColor(c); markChanged(); }}
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
                setCanvasW(campus.canvasW);
                setCanvasH(campus.canvasH);
                const appearance = campusGroundAppearance(campus);
                setGroundMaterial(appearance.material);
                setGroundColor(appearance.color);
                setGroundTexture(appearance.texture);
                setDefaultZoom(campus.defaultZoom ?? 1);
                setHasChanges(false);
                setValidationError(null);
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
                  {willClip
                    ? "Increase the canvas size or use Fit to Content before applying this shrink."
                    : "All authored content fits inside the proposed canvas boundary."}
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
                  disabled={willClip}
                  className="flex-1 h-10 rounded-xl text-xs font-extrabold text-white transition-colors shadow-sm bg-amber-500 hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {willClip ? "Resize blocked" : "Apply Resize"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

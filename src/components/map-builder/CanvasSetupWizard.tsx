import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X, Ruler, Grid3X3, Palette, ZoomIn, CheckCircle2,
  ArrowRight, ArrowLeft, Maximize2, Magnet, Sparkles,
  AlertTriangle,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { CANVAS_SIZES, CANVAS_SIZE_RECOMMENDED, GRID_PRESETS } from "./constants";
import { PLVLogo } from "../ui/PLVLogo";
import type { Campus, MeasurementUnit } from "./types";

// ── Props ──────────────────────────────────────────────────────────────────

interface CanvasSetupWizardProps {
  open: boolean;
  campus: Campus;
  onComplete: (updates: Partial<Campus>) => void;
  onClose: () => void;
}

// ── Step definitions ───────────────────────────────────────────────────────

type SetupStep = "size" | "grid" | "appearance" | "review";

const STEP_INFO: { step: SetupStep; label: string; icon: React.ElementType }[] = [
  { step: "size",       label: "Size",     icon: Maximize2 },
  { step: "grid",       label: "Grid",     icon: Grid3X3 },
  { step: "appearance", label: "Look",     icon: Palette },
  { step: "review",     label: "Review",   icon: CheckCircle2 },
];

// ── Unit helpers ───────────────────────────────────────────────────────────

function unitSuffix(unit: MeasurementUnit): string {
  if (unit === "meters") return "m";
  if (unit === "feet") return "ft";
  return "px";
}

function gridLabel(size: number, unit: MeasurementUnit): string {
  if (unit === "pixels") return `${size} px`;
  if (unit === "meters") {
    const m = size / 40; // 40px = 1m approx
    return m >= 1 ? `${m} m` : `${(m * 100).toFixed(0)} cm`;
  }
  // feet: 1m ≈ 3.281ft
  const ft = (size / 40) * 3.281;
  return ft >= 1 ? `${ft.toFixed(1)} ft` : `${(ft * 12).toFixed(0)} in`;
}

// ── Loading overlay ────────────────────────────────────────────────────────

function LoadingOverlay({ campusName }: { campusName: string }) {
  const [phase, setPhase] = useState(0);
  const steps = [
    "Preparing canvas…",
    "Generating workspace…",
    "Applying settings…",
    "Finalizing…",
    "Opening editor…",
  ];

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    steps.forEach((_, i) => {
      timers.push(setTimeout(() => setPhase(i), i * 200));
    });
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: "radial-gradient(ellipse 80% 60% at 50% 40%, #0d2470 0%, #071440 55%, #020a1c 100%)" }}
    >
      <div className="flex flex-col items-center gap-6">
        <div style={{ animation: "hero-breathe 2s ease-in-out infinite" }}>
          <PLVLogo size={72} />
        </div>
        <div className="text-center">
          <p className="text-white/40 text-xs font-semibold tracking-widest uppercase mb-1">{campusName}</p>
          <h2 className="text-lg font-extrabold text-white tracking-tight">Creating Canvas</h2>
        </div>
        <div className="w-64 space-y-2">
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
    </div>
  );
}

// ── Success overlay ────────────────────────────────────────────────────────

function SuccessOverlay({ onDismiss }: { onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 2000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="flex flex-col items-center gap-4"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 15, delay: 0.1 }}
          className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center"
        >
          <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-center"
        >
          <h3 className="text-lg font-extrabold text-foreground">Canvas Ready!</h3>
          <p className="text-sm text-muted-foreground mt-1">Your workspace has been created successfully.</p>
        </motion.div>
      </motion.div>
    </div>
  );
}

// ── Unsaved changes dialog ─────────────────────────────────────────────────

function UnsavedDialog({ open, onContinue, onDiscard }: {
  open: boolean;
  onContinue: () => void;
  onDiscard: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-background/70 backdrop-blur-sm p-4" onClick={onDiscard}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4 p-5">
          <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <h3 className="text-sm font-extrabold text-foreground">Discard Canvas Setup?</h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Your canvas has not been created yet. Any settings you configured will be lost.
            </p>
          </div>
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button onClick={onContinue} className="flex-1 h-10 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:bg-muted transition-colors">
            Continue Editing
          </button>
          <button onClick={onDiscard} className="flex-1 h-10 rounded-xl bg-destructive text-destructive-foreground text-xs font-extrabold hover:bg-destructive/90 shadow-sm transition-all">
            Discard
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function CanvasSetupWizard({ open, campus, onComplete, onClose }: CanvasSetupWizardProps) {
  // ── Canvas size state ──
  const [selectedSizeId, setSelectedSizeId] = useState(CANVAS_SIZE_RECOMMENDED);
  // Store as strings so typing "1920" doesn't get clamped mid-keystroke
  const [customWStr, setCustomWStr] = useState("900");
  const [customHStr, setCustomHStr] = useState("680");
  const [sizeError, setSizeError] = useState<string | null>(null);
  // Parse validated dimensions — only clamp when the string is non-empty and valid
  const parsedW = parseInt(customWStr);
  const parsedH = parseInt(customHStr);
  const customW = customWStr.trim() !== "" && !isNaN(parsedW) ? parsedW : 900;
  const customH = customHStr.trim() !== "" && !isNaN(parsedH) ? parsedH : 680;

  // ── Grid & Units state ──
  const [gridSize, setGridSize] = useState(20);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [measurementUnit, setMeasurementUnit] = useState<MeasurementUnit>("pixels");

  // ── Appearance state ──
  const [canvasColor, setCanvasColor] = useState("#f5f3ef");
  const [defaultZoom, setDefaultZoom] = useState(1);


  // ── Current step ──
  const [step, setStep] = useState<SetupStep>("size");
  const [direction, setDirection] = useState(1);

  // ── Loading & success states ──
  const [showLoading, setShowLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // ── Unsaved changes dialog ──
  const [showUnsaved, setShowUnsaved] = useState(false);

  // ── Track if user has made changes ──
  const [hasChanges, setHasChanges] = useState(false);
  const markChanged = () => setHasChanges(true);

  const handleClose = useCallback(() => {
    if (hasChanges) {
      setShowUnsaved(true);
    } else {
      onClose();
    }
  }, [hasChanges, onClose]);

  const getCanvasDimensions = useCallback(() => {
    if (selectedSizeId === "custom") {
      return { w: customW, h: customH };
    }
    const preset = CANVAS_SIZES.find((s) => s.id === selectedSizeId);
    return preset ? { w: preset.w, h: preset.h } : { w: 900, h: 680 };
  }, [selectedSizeId, customW, customH]);

  const dims = getCanvasDimensions();

  const handleComplete = useCallback(() => {
    setShowLoading(true);
    setTimeout(() => {
      setShowLoading(false);
      setShowSuccess(true);
      setTimeout(() => {
        onComplete({
          canvasW: dims.w,
          canvasH: dims.h,
          canvasConfigured: true,
          gridSize,
          snapToGrid,
          measurementUnit,
          canvasColor: canvasColor || undefined,
          defaultZoom,
        });
        setShowSuccess(false);
      }, 1500);
    }, 1200);
  }, [dims, gridSize, snapToGrid, measurementUnit, canvasColor, defaultZoom, onComplete]);

  const totalSteps = STEP_INFO.length;
  const currentIdx = STEP_INFO.findIndex((s) => s.step === step);
  const canAdvance = selectedSizeId !== "custom"
    ? dims.w >= 200 && dims.h >= 200
    : customWStr.trim() !== "" && customHStr.trim() !== "" && !isNaN(parsedW) && !isNaN(parsedH) && parsedW >= 200 && parsedH >= 200 && parsedW <= 5000 && parsedH <= 5000;

  const goNext = useCallback(() => {
    const next = STEP_INFO[currentIdx + 1]?.step;
    if (next) { setDirection(1); setStep(next); }
  }, [currentIdx]);

  const goBack = useCallback(() => {
    const prev = STEP_INFO[currentIdx - 1]?.step;
    if (prev) { setDirection(-1); setStep(prev); }
  }, [currentIdx]);

  // ── Keyboard: Escape to close, Arrow keys for step navigation ──
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
      // Don't navigate steps when typing in inputs
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement).isContentEditable) return;
      if (e.key === "ArrowRight" && currentIdx < totalSteps - 1 && !showLoading && !showSuccess) {
        goNext();
      }
      if (e.key === "ArrowLeft" && currentIdx > 0 && !showLoading && !showSuccess) {
        goBack();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, handleClose, currentIdx, totalSteps, showLoading, showSuccess, goNext, goBack]);

  // ── Slide variants ──
  const slideVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? 40 : -40, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -20 : 20, opacity: 0, position: "absolute" as const }),
  };

  if (!open) return null;

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Set Up Your Canvas"
        className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-background/70 backdrop-blur-sm p-3 sm:p-4 pt-16 sm:pt-4 overflow-y-auto"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 16 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
          style={{ maxHeight: "85vh" }}
        >
          {/* ── Header ── */}
          <div className="flex items-center justify-between px-5 pt-4 pb-2.5 border-b border-border shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center shrink-0 ring-1 ring-primary/10">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <h2 className="font-extrabold text-foreground text-sm truncate">Set Up Your Canvas</h2>
                <p className="text-[10px] text-muted-foreground truncate">{campus.name}</p>
              </div>
            </div>
            <button onClick={handleClose} className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center hover:bg-secondary transition-colors text-muted-foreground shrink-0">
              <X className="h-3.5 h-3.5" />
            </button>
          </div>

          {/* ── Step Indicator ── */}
          <div className="flex items-center justify-center px-5 pt-2.5 pb-1 shrink-0">
            {STEP_INFO.map((s, idx) => {
              const Icon = s.icon;
              const isActive = s.step === step;
              const isDone = idx < currentIdx;
              return (
                <div key={s.step} className="flex items-center">
                  <button
                    onClick={() => { if (idx < currentIdx) { setDirection(-1); setStep(s.step); } }}
                    className="flex flex-col items-center gap-0.5 cursor-pointer group"
                    disabled={idx > currentIdx}
                    aria-current={isActive ? "step" : undefined}
                    aria-label={`Step ${idx + 1}: ${s.label}${isDone ? " (completed)" : isActive ? " (current)" : ""}`}
                  >
                    <motion.div
                      animate={{ scale: isActive ? 1.1 : 1 }}
                      transition={{ type: "spring", stiffness: 400, damping: 20 }}
                      className={cn(
                        "flex items-center justify-center w-6 h-6 rounded-full text-[9px] font-extrabold transition-colors duration-300",
                        isActive
                          ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20 ring-1 ring-primary/30"
                          : isDone
                            ? "bg-primary/15 text-primary border border-primary/25"
                            : "bg-muted text-muted-foreground/40 border border-border group-hover:border-muted-foreground/20"
                      )}
                    >
                      {isDone ? <CheckCircle2 className="h-3 w-3" /> : idx + 1}
                    </motion.div>
                    <span className={cn(
                      "text-[7px] font-bold tracking-tight transition-colors duration-200",
                      isActive ? "text-primary" : isDone ? "text-primary/60" : "text-muted-foreground/30"
                    )}>{s.label}</span>
                  </button>
                  {idx < totalSteps - 1 && (
                    <div className={cn(
                      "w-6 sm:w-10 h-px mx-1 mt-0 transition-colors duration-300",
                      idx < currentIdx ? "bg-primary/30" : "bg-border"
                    )} />
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Animated Content ── */}
          <div className="relative overflow-hidden">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={step}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-y-auto scrollbar-show-on-hover scroll-smooth px-5 py-3 space-y-3.5"
                style={{ maxHeight: "55vh" }}
              >
                {/* ══════ Step: Size ══════ */}
                {step === "size" && (
                  <>
                    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-muted/40 border border-border">
                      <Ruler className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Pick a canvas size for your campus map. You can change this later in <span className="font-semibold text-foreground/70">Canvas Settings</span> inside the editor.
                      </p>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {CANVAS_SIZES.filter((s) => s.id !== "custom").map((cs) => {
                        const sel = selectedSizeId === cs.id;
                        const isRecommended = cs.id === CANVAS_SIZE_RECOMMENDED;
                        return (
                          <motion.button
                            key={cs.id}
                            type="button"
                            onClick={() => { setSelectedSizeId(cs.id); markChanged(); }}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className={cn(
                              "relative flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-center group",
                              sel
                                ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20"
                                : "border-border hover:border-primary/20 hover:bg-muted/30"
                            )}
                          >
                            {isRecommended && (
                              <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-[7px] font-extrabold tracking-wide shadow-sm">
                                Recommended
                              </span>
                            )}
                            <div className={cn(
                              "w-full aspect-[4/3] rounded-lg flex items-center justify-center transition-colors",
                              sel ? "bg-primary/8" : "bg-muted/60"
                            )}>
                              <div
                                className="rounded border-2 transition-all duration-300"
                                style={{
                                  width: `${(cs.w / 1200) * 75}%`,
                                  height: `${(cs.h / 900) * 65}%`,
                                  borderColor: sel ? "var(--primary)" : "var(--border)",
                                  background: sel ? "color-mix(in srgb, var(--primary) 8%, transparent)" : "transparent",
                                }}
                              />
                            </div>
                            <p className="text-[11px] font-extrabold text-foreground leading-tight">{cs.label}</p>
                            <p className="text-[9px] font-mono text-muted-foreground">{cs.w}×{cs.h} px</p>
                            <p className="text-[8px] text-muted-foreground/60 leading-tight">{cs.desc}</p>
                          </motion.button>
                        );
                      })}
                    </div>

                    {/* Custom size */}
                    <button
                      type="button"
                      onClick={() => {
                        // When switching to custom, populate with the currently selected preset's dimensions
                        if (selectedSizeId !== "custom") {
                          const preset = CANVAS_SIZES.find((s) => s.id === selectedSizeId);
                          if (preset) {
                            setCustomWStr(String(preset.w));
                            setCustomHStr(String(preset.h));
                          }
                        }
                        setSelectedSizeId("custom");
                        setSizeError(null);
                        markChanged();
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all",
                        selectedSizeId === "custom"
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/20 hover:bg-muted/30"
                      )}
                    >
                      <div className={cn(
                        "w-9 h-9 rounded-lg flex items-center justify-center transition-colors shrink-0",
                        selectedSizeId === "custom" ? "bg-primary/10" : "bg-muted"
                      )}>
                        <Maximize2 className={cn("h-4 w-4", selectedSizeId === "custom" ? "text-primary" : "text-muted-foreground")} />
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-extrabold text-foreground">Custom Size</p>
                        <p className="text-[10px] text-muted-foreground">Set your own width and height</p>
                      </div>
                      <div className="ml-auto">
                        <div className={cn(
                          "w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors",
                          selectedSizeId === "custom" ? "border-primary" : "border-muted-foreground/30"
                        )}>
                          {selectedSizeId === "custom" && <div className="w-2 h-2 rounded-full bg-primary" />}
                        </div>
                      </div>
                    </button>

                    {selectedSizeId === "custom" && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="grid grid-cols-2 gap-2.5 overflow-hidden"
                      >                            <div>
                          <label className="block text-[9px] font-bold uppercase tracking-wider mb-1 text-muted-foreground">Width ({unitSuffix(measurementUnit)})</label>
                          <input
                            type="text" inputMode="numeric" pattern="[0-9]*"
                            value={customWStr}
                            onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ""); setCustomWStr(v); setSizeError(null); markChanged(); }}
                            onBlur={() => {
                              const v = parseInt(customWStr);
                              if (customWStr.trim() === "" || isNaN(v)) { setSizeError("Width is required"); }
                              else if (v < 200) { setSizeError("Width must be at least 200"); }
                              else if (v > 5000) { setSizeError("Width cannot exceed 5000"); }
                              else { setSizeError(null); }
                            }}
                            className={cn("w-full h-9 px-3 rounded-xl border bg-input-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow",
                              sizeError ? "border-destructive" : "border-border"
                            )}
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] font-bold uppercase tracking-wider mb-1 text-muted-foreground">Height ({unitSuffix(measurementUnit)})</label>
                          <input
                            type="text" inputMode="numeric" pattern="[0-9]*"
                            value={customHStr}
                            onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ""); setCustomHStr(v); setSizeError(null); markChanged(); }}
                            onBlur={() => {
                              const v = parseInt(customHStr);
                              if (customHStr.trim() === "" || isNaN(v)) { setSizeError("Height is required"); }
                              else if (v < 200) { setSizeError("Height must be at least 200"); }
                              else if (v > 5000) { setSizeError("Height cannot exceed 5000"); }
                              else { setSizeError(null); }
                            }}
                            className={cn("w-full h-9 px-3 rounded-xl border bg-input-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow",
                              sizeError ? "border-destructive" : "border-border"
                            )}
                          />
                        </div>
                        {sizeError && (
                          <motion.div
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="col-span-2 flex items-center gap-1.5 text-[10px] font-bold text-destructive"
                          >
                            <AlertTriangle className="h-3 w-3 shrink-0" />
                            {sizeError}
                          </motion.div>
                        )}
                      </motion.div>
                    )}

                    {/* Live preview */}
                    <div className="rounded-xl border border-border bg-muted/15 p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-[8px] font-extrabold uppercase tracking-widest text-muted-foreground/50">Preview</p>
                        <p className="text-[9px] font-mono text-muted-foreground/60">{dims.w} × {dims.h} {unitSuffix(measurementUnit)}</p>
                      </div>
                      <div
                        className="rounded-lg mx-auto flex items-center justify-center overflow-hidden border border-border/40 transition-all duration-300"
                        style={{
                          width: "100%", maxWidth: 220,
                          aspectRatio: `${dims.w} / ${dims.h}`,
                          background: "repeating-conic-gradient(var(--muted) 0% 25%, transparent 0% 50%) 0px 0px / 10px 10px",
                        }}
                      >
                        <span className="text-[9px] font-mono text-muted-foreground/40">{dims.w}×{dims.h}</span>
                      </div>
                    </div>
                  </>
                )}

                {/* ══════ Step: Grid & Units ══════ */}
                {step === "grid" && (
                  <>
                    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-muted/40 border border-border">
                      <Grid3X3 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Set grid spacing and measurement units — helps align buildings and paths precisely on the canvas.
                      </p>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5 text-foreground/70">Grid Size</label>
                      <div className="grid grid-cols-4 gap-1.5">
                        {GRID_PRESETS.map((gp) => (
                          <button
                            key={gp.size}
                            type="button"
                            onClick={() => { setGridSize(gp.size); markChanged(); }}
                            className={cn(
                              "flex flex-col items-center gap-1 p-2 rounded-xl font-bold transition-all border",
                              gridSize === gp.size
                                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                : "bg-input-background text-muted-foreground border-border hover:border-primary/20 hover:text-foreground"
                            )}
                          >
                            {/* Mini grid preview SVG */}
                            <div className="w-8 h-8 flex items-center justify-center">
                            <svg width="32" height="32" viewBox="0 0 32 32">
                              {(() => {
                                const spacing = gp.size <= 10 ? 4 : gp.size <= 20 ? 6 : gp.size <= 40 ? 10 : 16;
                                const offsetX = (32 - Math.floor(32 / spacing) * spacing) / 2 + spacing / 2;
                                const offsetY = (32 - Math.floor(32 / spacing) * spacing) / 2 + spacing / 2;
                                const dots: React.ReactNode[] = [];
                                for (let x = offsetX; x < 32; x += spacing) {
                                  for (let y = offsetY; y < 32; y += spacing) {
                                    dots.push(
                                      <circle
                                        key={`${x}-${y}`}
                                        cx={x}
                                        cy={y}
                                        r={gp.size <= 10 ? 0.8 : gp.size <= 20 ? 1 : gp.size <= 40 ? 1.2 : 1.4}
                                        fill="currentColor"
                                        opacity={gridSize === gp.size ? 0.9 : 0.4}
                                      />
                                    );
                                  }
                                }
                                return dots;
                              })()}
                            </svg>
                            </div>
                            <span className="text-[10px] leading-tight">{gp.label}</span>
                            <span className="text-[8px] opacity-70 leading-tight">{gridLabel(gp.size, measurementUnit)}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/15">
                      <div className="flex items-center gap-2.5">
                        <Magnet className="h-3.5 w-3.5 text-muted-foreground" />
                        <div>
                          <p className="text-xs font-bold text-foreground">Snap to Grid</p>
                          <p className="text-[9px] text-muted-foreground/60">
                            {snapToGrid ? "Objects automatically align to the nearest grid intersection" : "Objects can move freely"}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setSnapToGrid((v) => !v); markChanged(); }}
                        className={cn(
                          "relative w-9 h-[17px] rounded-full transition-colors shrink-0",
                          snapToGrid ? "bg-primary" : "bg-muted-foreground/25"
                        )}
                      >
                        <motion.div
                          animate={{ x: snapToGrid ? 19 : 2 }}
                          transition={{ type: "spring", stiffness: 500, damping: 30 }}
                          className="absolute top-[2px] w-[13px] h-[13px] rounded-full bg-white shadow-sm"
                        />
                      </button>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5 text-foreground/70">Measurement Units</label>
                      <div className="flex gap-1.5">
                        {(["pixels", "meters", "feet"] as MeasurementUnit[]).map((unit) => (
                          <button
                            key={unit}
                            type="button"
                            onClick={() => { setMeasurementUnit(unit); markChanged(); }}
                            className={cn(
                              "flex-1 h-8 rounded-lg font-bold text-[11px] transition-all border capitalize",
                              measurementUnit === unit
                                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                : "bg-input-background text-muted-foreground border-border hover:border-primary/20 hover:text-foreground"
                            )}
                          >
                            {unit}
                          </button>
                        ))}
                      </div>
                      <p className="text-[9px] text-muted-foreground/50 mt-1">How distances display in the editor. Grid labels update automatically.</p>
                    </div>
                  </>
                )}

                {/* ══════ Step: Appearance ══════ */}
                {step === "appearance" && (
                  <>
                    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-muted/40 border border-border">
                      <Palette className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Choose a background color for your canvas. This is the base color students will see on the map.
                      </p>
                    </div>

                    {/* Canvas background color */}
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider mb-2 text-foreground/70">Canvas Background Color</label>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { color: "#f5f3ef", label: "Warm White" },
                          { color: "#ffffff", label: "White" },
                          { color: "#f0f4f8", label: "Cool Gray" },
                          { color: "#e8f5e9", label: "Light Green" },
                          { color: "#e3f2fd", label: "Light Blue" },
                          { color: "#fff8e1", label: "Cream" },
                          { color: "#fce4ec", label: "Light Pink" },
                          { color: "#f3e5f5", label: "Light Purple" },
                        ].map((c) => (
                          <button
                            key={c.color}
                            type="button"
                            onClick={() => { setCanvasColor(c.color); markChanged(); }}
                            className={cn(
                              "flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all",
                              canvasColor === c.color
                                ? "border-primary shadow-sm ring-1 ring-primary/20"
                                : "border-border hover:border-primary/20"
                            )}
                          >
                            <div
                              className="w-8 h-8 rounded-lg border border-black/10"
                              style={{ backgroundColor: c.color }}
                            />
                            <span className="text-[8px] font-bold text-muted-foreground">{c.label}</span>
                          </button>
                        ))}
                      </div>
                      {/* Custom color input */}
                      <div className="flex items-center gap-2 mt-3">
                        <input
                          type="color"
                          value={canvasColor}
                          onChange={(e) => { setCanvasColor(e.target.value); markChanged(); }}
                          className="w-8 h-8 rounded-lg cursor-pointer border border-border p-0.5"
                        />
                        <input
                          type="text"
                          value={canvasColor}
                          onChange={(e) => { if (/^#[0-9a-f]{0,6}$/i.test(e.target.value)) setCanvasColor(e.target.value); markChanged(); }}
                          placeholder="#f5f3ef"
                          className="flex-1 h-8 px-3 rounded-lg border border-border bg-input-background text-foreground text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
                        />
                      </div>
                    </div>

                    {/* Default Zoom */}
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5 text-foreground/70 flex items-center gap-1.5">
                        <ZoomIn className="h-3 w-3" />
                        Default Zoom
                      </label>
                      <div className="flex gap-1.5">
                        {[0.5, 0.75, 1, 1.25, 1.5].map((z) => (
                          <button
                            key={z}
                            type="button"
                            onClick={() => { setDefaultZoom(z); markChanged(); }}
                            className={cn(
                              "flex-1 h-8 rounded-lg font-bold text-[11px] transition-all border",
                              Math.abs(defaultZoom - z) < 0.01
                                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                : "bg-input-background text-muted-foreground border-border hover:border-primary/20 hover:text-foreground"
                            )}
                          >
                            {Math.round(z * 100)}%
                          </button>
                        ))}
                      </div>
                      <p className="text-[9px] text-muted-foreground/50 mt-1">Initial zoom when opening the editor.</p>
                    </div>
                  </>
                )}

                {/* ══════ Step: Review ══════ */}
                {step === "review" && (
                  <>
                    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-green-50/40 dark:bg-green-900/8 border border-green-200/60 dark:border-green-800/20">
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        All set! Review your choices below. You can adjust everything later from <span className="font-semibold text-foreground/70">Canvas Settings</span>.
                      </p>
                    </div>

                    {/* Summary cards */}
                    <div className="space-y-2">
                      {[
                        { icon: Ruler, label: "Canvas Size", value: `${dims.w} × ${dims.h} ${unitSuffix(measurementUnit)}`, editStep: "size" as SetupStep },
                        { icon: Grid3X3, label: "Grid", value: `${gridLabel(gridSize, measurementUnit)} · ${snapToGrid ? "Snap ON" : "Snap OFF"}`, editStep: "grid" as SetupStep },
                        { icon: Ruler, label: "Measurement Unit", value: measurementUnit, editStep: "grid" as SetupStep },
                        { icon: ZoomIn, label: "Default Zoom", value: `${Math.round(defaultZoom * 100)}%`, editStep: "appearance" as SetupStep },
                        { icon: Palette as React.ElementType, label: "Background Color", value: canvasColor, editStep: "appearance" as SetupStep },
                      ].map(({ icon: Icon, label, value, editStep }, i) => (
                        <motion.div
                          key={label}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.06 }}
                          className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-muted/15"
                        >
                          <div className="flex items-center gap-2">
                            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                            <div>
                              <p className="text-[10px] font-bold text-foreground">{label}</p>
                              <p className="text-[10px] font-mono text-primary font-bold">{value}</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => { setDirection(-1); setStep(editStep); }}
                            className="text-[9px] font-bold text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded-lg hover:bg-primary/10"
                          >
                            Edit
                          </button>
                        </motion.div>
                      ))}
                    </div>

                    {/* Preview */}
                    <div className="rounded-xl border border-border p-2.5">
                      <p className="text-[8px] font-extrabold uppercase tracking-widest text-muted-foreground/50 mb-1.5">Canvas Preview</p>
                      <div
                        className="rounded-lg mx-auto border border-border/40 overflow-hidden transition-all duration-300"
                        style={{
                          width: "100%", maxWidth: 200,
                          aspectRatio: `${dims.w} / ${dims.h}`,
                          background: canvasColor || "#f5f3ef",
                        }}
                      >
                        <div className="w-full h-full flex items-center justify-center bg-black/5">
                          <span className="text-[8px] font-mono text-muted-foreground/30">{dims.w}×{dims.h}</span>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* ── Footer ── */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-border shrink-0 bg-muted/15">
            {currentIdx > 0 ? (
              <button
                onClick={goBack}
                className="flex items-center gap-1 h-8 px-3 rounded-lg border border-border text-[11px] font-bold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <ArrowLeft className="h-3 w-3" />
                Back
              </button>
            ) : (
              <div />
            )}

            {step !== "review" ? (
              <button
                onClick={goNext}
                disabled={!canAdvance}
                className={cn(
                  "flex items-center gap-1 h-8 px-4 rounded-lg text-[11px] font-extrabold transition-all",
                  canAdvance
                    ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm active:scale-[0.97]"
                    : "bg-muted text-muted-foreground/40 cursor-not-allowed"
                )}
              >
                Continue
                <ArrowRight className="h-3 w-3" />
              </button>
            ) : (
              <button
                onClick={handleComplete}
                className="flex items-center gap-1.5 h-8 px-4 rounded-lg bg-primary text-primary-foreground text-[11px] font-extrabold hover:bg-primary/90 transition-all shadow-sm active:scale-[0.97]"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Create Canvas
              </button>
            )}
          </div>
        </motion.div>
      </div>

      {/* ── Overlays ── */}
      {showLoading && <LoadingOverlay campusName={campus.name} />}
      {showSuccess && <SuccessOverlay onDismiss={() => setShowSuccess(false)} />}
      <UnsavedDialog
        open={showUnsaved}
        onContinue={() => setShowUnsaved(false)}
        onDiscard={() => { setShowUnsaved(false); onClose(); }}
      />
    </>
  );
}

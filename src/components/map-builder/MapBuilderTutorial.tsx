import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  MousePointer2, Square, CheckCircle2, HelpCircle,
  ChevronLeft, ChevronRight, X, Maximize2, Grid3X3,
  BookOpen,
} from "lucide-react";
import { cn } from "../../lib/utils";

const TUTORIAL_KEY = "plv-mb-tutorial-done";

// ── Step definitions ────────────────────────────────────────────────────────

interface TutorialStep {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  /** CSS selector of element to spotlight (empty = no spotlight, center tooltip) */
  spotlight?: string;
  /** Where to position the tooltip relative to the spotlight */
  tooltipPosition?: "top" | "bottom" | "left" | "right" | "center";
  /** Whether to auto-scroll/pan to the target */
  autoFocus?: boolean;
  /** Tool to auto-activate when reaching this step */
  autoTool?: string;
}

const STEPS: TutorialStep[] = [
  {
    id: "welcome",
    title: "Welcome to the Map Builder",
    description:
      "This is where you design interactive campus maps. Let's walk through creating your first building using click-and-drag.",
    icon: HelpCircle,
    spotlight: "",
    tooltipPosition: "center",
  },
  {
    id: "building-tool",
    title: "1. Select the Building Tool",
    description:
      "Click the Building tool (or press B) in the left toolbar. This switches to drawing mode so you can create buildings by dragging on the canvas.",
    icon: Square,
    spotlight: "[data-tutorial='building-tool']",
    tooltipPosition: "right",
    autoFocus: true,
    autoTool: "building",
  },
  {
    id: "drag-to-create",
    title: "2. Click & Drag to Create",
    description:
      "Click anywhere on the canvas and drag to define the building's size. A live preview shows dimensions as you drag. Release to create the building.",
    icon: MousePointer2,
    spotlight: "",
    tooltipPosition: "center",
  },
  {
    id: "properties",
    title: "3. Edit Properties",
    description:
      "After creating a building, the Properties Panel opens automatically on the right. Edit the name, code, color, and more. Switch between Basic, Style, and Advanced tabs.",
    icon: Maximize2,
    spotlight: "",
    tooltipPosition: "center",
  },
  {
    id: "grid-snap",
    title: "4. Snap to Grid",
    description:
      "Toggle grid snapping (Ctrl+G) to align buildings perfectly. The snap button in the toolbar lights up blue when active. Buildings snap to 20px grid increments.",
    icon: Grid3X3,
    spotlight: "[data-tutorial='snap-tool']",
    tooltipPosition: "right",
    autoFocus: true,
  },
  {
    id: "done",
    title: "You're Ready!",
    description:
      "You can also add markers, draw paths, manage floors, and publish your map. Explore the tools — right-click any building for more options like Duplicate, Lock, or Delete.",
    icon: CheckCircle2,
    spotlight: "",
    tooltipPosition: "center",
  },
];

// ── Props ───────────────────────────────────────────────────────────────────

interface MapBuilderTutorialProps {
  open: boolean;
  onClose: () => void;
  onSetTool: (tool: string) => void;
}

// ── Spotlight highlight component ───────────────────────────────────────────

function Spotlight({ selector, stepKey }: { selector: string; stepKey: string }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selector) {
      setRect(null);
      return;
    }
    const updateRect = () => {
      const el = document.querySelector(selector);
      if (el) {
        const r = el.getBoundingClientRect();
        setRect(r);
      }
    };

    // Initial measurement
    updateRect();

    // Auto-scroll to element
    const el = document.querySelector(selector);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    // Watch for layout changes
    const observer = new MutationObserver(updateRect);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    // Also re-measure on resize/scroll
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [selector, stepKey]);

  if (!rect) return null;

  const padding = 6;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const rx = (Math.max(rect.width, rect.height) / 2) * 1.4 + padding;
  const r = Math.max(rx, 60);

  return (
    <>
      {/* Full dim overlay with spotlight cutout via mask */}
      <div
        ref={overlayRef}
        className="fixed inset-0 z-[200]"
        style={{
          background: "rgba(0,0,0,0.45)",
          maskImage: `radial-gradient(circle at ${cx}px ${cy}px, transparent ${r}px, black ${r + 20}px)`,
          WebkitMaskImage: `radial-gradient(circle at ${cx}px ${cy}px, transparent ${r}px, black ${r + 20}px)`,
          pointerEvents: "auto",
        }}
      />
      {/* Pulsing ring around spotlighted element */}
      <motion.div
        className="fixed z-[201] pointer-events-none"
        style={{
          left: rect.left - 4,
          top: rect.top - 4,
          width: rect.width + 8,
          height: rect.height + 8,
          borderRadius: 14,
          border: "2.5px solid var(--accent)",
          boxShadow: "0 0 20px rgba(var(--accent-rgb, 14,42,110), 0.3)",
        }}
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: [0.6, 1, 0.6], scale: 1 }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      />
    </>
  );
}

// ── Tooltip position calculator ─────────────────────────────────────────────

function getTooltipPosition(
  tooltipPosition: string,
  selector: string
): { className: string } {
  if (!selector || tooltipPosition === "center") {
    return { className: "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" };
  }
  switch (tooltipPosition) {
    case "right":
      return { className: "left-[88px] top-1/2 -translate-y-1/2" };
    case "left":
      return { className: "right-[88px] top-1/2 -translate-y-1/2" };
    case "bottom":
      return { className: "left-1/2 -translate-x-1/2 top-[62%]" };
    case "top":
      return { className: "left-1/2 -translate-x-1/2 top-[8%]" };
    default:
      return { className: "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" };
  }
}

// ── Main component ──────────────────────────────────────────────────────────

export function MapBuilderTutorial({ open, onClose, onSetTool }: MapBuilderTutorialProps) {
  const [stepIdx, setStepIdx] = useState(0);
  const [animateKey, setAnimateKey] = useState(0);

  const step = STEPS[stepIdx];
  const isFirst = stepIdx === 0;
  const isLast = stepIdx === STEPS.length - 1;
  const total = STEPS.length;

  // ── Navigation ──────────────────────────────────────────────────────────
  const goToStep = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= total) return;
      const s = STEPS[idx];
      if (s.autoTool) onSetTool(s.autoTool);
      setStepIdx(idx);
      setAnimateKey((k) => k + 1);
    },
    [total, onSetTool]
  );

  const handleNext = useCallback(() => {
    if (stepIdx < total - 1) goToStep(stepIdx + 1);
  }, [stepIdx, total, goToStep]);

  const handlePrev = useCallback(() => {
    if (stepIdx > 0) goToStep(stepIdx - 1);
  }, [stepIdx, goToStep]);

  const handleDone = useCallback(() => {
    try {
      localStorage.setItem(TUTORIAL_KEY, "true");
    } catch {}
    onClose();
  }, [onClose]);

  const handleSkip = useCallback(() => {
    handleDone();
  }, [handleDone]);

  // ── Reset when opened ───────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setStepIdx(0);
      setAnimateKey((k) => k + 1);
    }
  }, [open]);

  const Icon = step.icon;

  // ── Progress percentage ─────────────────────────────────────────────────
  const progressPct = Math.round(((stepIdx + 1) / total) * 100);

  const pos = getTooltipPosition(step.tooltipPosition ?? "center", step.spotlight ?? "");

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* ── Base dim overlay (always present to block interactions) ── */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="fixed inset-0 z-[200]"
            style={{
              background: step.spotlight ? "rgba(0,0,0,0.45)" : "rgba(0,0,0,0.45)",
              pointerEvents: "auto",
            }}
            onWheel={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.preventDefault()}
          />

          {/* ── Spotlight cutout overlay (rendered on top of base, creates hole) ── */}
          {step.spotlight && (
            <Spotlight selector={step.spotlight} stepKey={step.id} />
          )}

          {/* ── Tutorial tooltip card ── */}
          <motion.div
            key={`${step.id}-${animateKey}`}
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{
              type: "spring",
              stiffness: 350,
              damping: 28,
              mass: 0.8,
            }}
            className={cn("fixed z-[210] w-full max-w-sm", pos.className)}
            style={{ pointerEvents: "auto" }}
          >
            <div className="bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
              {/* ── Progress bar ── */}
              <div className="h-1 bg-muted/50">
                <motion.div
                  className="h-full bg-primary"
                  initial={{ width: `${((stepIdx) / total) * 100}%` }}
                  animate={{ width: `${progressPct}%` }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                />
              </div>

              {/* ── Header with icon ── */}
              <div className="flex items-start gap-3 px-5 pt-5 pb-3">
                <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3
                    className="text-sm font-extrabold text-foreground"
                    style={{ fontFamily: "var(--font-sans)" }}
                  >
                    {step.title}
                  </h3>
                  <p
                    className="text-xs text-muted-foreground mt-1.5 leading-relaxed"
                    style={{ fontFamily: "var(--font-body)", lineHeight: 1.6 }}
                  >
                    {step.description}
                  </p>
                </div>
              </div>

              {/* ── Step counter ── */}
              <div className="px-5 pb-2">
                <span className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
                  Step {stepIdx + 1} of {total}
                </span>
              </div>

              {/* ── Progress dots ── */}
              <div className="flex items-center gap-1.5 px-5 pb-4">
                {STEPS.map((s, i) => (
                  <button
                    key={s.id}
                    onClick={() => goToStep(i)}
                    className={cn(
                      "h-1.5 rounded-full transition-all duration-300",
                      i === stepIdx
                        ? "w-6 bg-primary"
                        : i < stepIdx
                          ? "w-2 bg-primary/40"
                          : "w-2 bg-muted-foreground/20 hover:bg-muted-foreground/40"
                    )}
                    aria-label={`Go to step ${i + 1}: ${s.title}`}
                    tabIndex={0}
                  />
                ))}
              </div>

              {/* ── Actions ── */}
              <div className="flex items-center justify-between gap-2 px-5 pb-5">
                <button
                  onClick={handleSkip}
                  className="flex items-center gap-1 h-9 px-3 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                  aria-label="Skip tutorial"
                >
                  <X className="h-3.5 w-3.5" />
                  Skip
                </button>

                <div className="flex items-center gap-2">
                  {!isFirst && (
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={handlePrev}
                      className="flex items-center gap-1 h-9 px-3 rounded-xl border border-border text-xs font-bold text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                      aria-label="Previous step"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      Back
                    </motion.button>
                  )}
                  {isLast ? (
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={handleDone}
                      className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-extrabold hover:bg-primary/90 transition-colors shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
                      aria-label="Finish tutorial"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Got it
                    </motion.button>
                  ) : (
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={handleNext}
                      className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-extrabold hover:bg-primary/90 transition-colors shadow-sm"
                      aria-label="Next step"
                    >
                      Next
                      <ChevronRight className="h-3.5 w-3.5" />
                    </motion.button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/** Check if the user has completed the tutorial before */
export function hasSeenTutorial(): boolean {
  try {
    return localStorage.getItem(TUTORIAL_KEY) === "true";
  } catch {
    return false;
  }
}

/** Reset the tutorial flag — call `resetTutorial()` in dev tools to replay */
export function resetTutorial(): void {
  try {
    localStorage.removeItem(TUTORIAL_KEY);
  } catch {}
}

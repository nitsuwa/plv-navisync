import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  MousePointer2, Square, CheckCircle2, HelpCircle,
  ChevronLeft, ChevronRight, X, Maximize2, Grid3X3,
} from "lucide-react";
import { cn } from "../../lib/utils";

const TUTORIAL_KEY = "plv-mb-tutorial-done";

// ── Step definitions ────────────────────────────────────────────────────────

interface TutorialStep {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  /** CSS selector of element to spotlight (or empty for center overlay) */
  spotlight?: string;
  /** Where to position the tooltip relative to the spotlight */
  tooltipPosition?: "top" | "bottom" | "left" | "right";
}

const STEPS: TutorialStep[] = [
  {
    id: "welcome",
    title: "Welcome to the Map Builder",
    description:
      "This is where you design interactive campus maps. Let's walk through creating your first building using click-and-drag.",
    icon: HelpCircle,
    spotlight: "",
  },
  {
    id: "building-tool",
    title: "1. Select the Building Tool",
    description:
      "Click the Building tool (or press B) in the left toolbar. This switches to drawing mode so you can create buildings by dragging on the canvas.",
    icon: Square,
    spotlight: "[data-tutorial='building-tool']",
    tooltipPosition: "right",
  },
  {
    id: "drag-to-create",
    title: "2. Click & Drag to Create",
    description:
      "Click anywhere on the canvas and drag to define the building's size. A live preview shows dimensions as you drag. Release to create the building.",
    icon: MousePointer2,
    spotlight: "",
  },
  {
    id: "properties",
    title: "3. Edit Properties",
    description:
      "After creating a building, the Properties Panel opens automatically on the right. Edit the name, code, color, and more. Switch between Basic, Style, and Advanced tabs.",
    icon: Maximize2,
    spotlight: "",
  },
  {
    id: "grid-snap",
    title: "4. Snap to Grid",
    description:
      "Toggle grid snapping (Ctrl+G) to align buildings perfectly. The snap button in the toolbar lights up blue when active. Buildings snap to 20px grid increments.",
    icon: Grid3X3,
    spotlight: "[data-tutorial='snap-tool']",
    tooltipPosition: "right",
  },
  {
    id: "done",
    title: "You're Ready!",
    description:
      "You can also add markers, draw paths, manage floors, and publish your map. Explore the tools — right-click any building for more options like Duplicate, Lock, or Delete.",
    icon: CheckCircle2,
    spotlight: "",
  },
];

// ── Props ───────────────────────────────────────────────────────────────────

interface MapBuilderTutorialProps {
  open: boolean;
  onClose: () => void;
  onSetTool: (tool: string) => void;
}

// ── Spotlight highlight component ───────────────────────────────────────────

function Spotlight({ selector }: { selector: string }) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!selector) {
      setRect(null);
      return;
    }
    const el = document.querySelector(selector);
    if (el) {
      const r = el.getBoundingClientRect();
      setRect(r);
    }
    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        const r = el.getBoundingClientRect();
        setRect(r);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    return () => observer.disconnect();
  }, [selector]);

  if (!rect) return null;

  return (
    <>
      {/* Dim overlay with cutout */}
      <div
        className="fixed inset-0 z-[60] pointer-events-none"
        style={{
          background: "rgba(0,0,0,0.35)",
          maskImage: `radial-gradient(circle at ${rect.left + rect.width / 2}px ${rect.top + rect.height / 2}px, transparent ${Math.max(rect.width, rect.height) * 0.8}px, black ${Math.max(rect.width, rect.height) * 0.9}px)`,
          WebkitMaskImage: `radial-gradient(circle at ${rect.left + rect.width / 2}px ${rect.top + rect.height / 2}px, transparent ${Math.max(rect.width, rect.height) * 0.8}px, black ${Math.max(rect.width, rect.height) * 0.9}px)`,
        }}
      />
      {/* Pulsing ring around element */}
      <motion.div
        className="fixed z-[61] pointer-events-none"
        style={{
          left: rect.left - 4,
          top: rect.top - 4,
          width: rect.width + 8,
          height: rect.height + 8,
          borderRadius: 14,
          border: "2.5px solid var(--accent)",
        }}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: [0.6, 1, 0.6], scale: 1 }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      />
    </>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function MapBuilderTutorial({ open, onClose, onSetTool }: MapBuilderTutorialProps) {
  const [stepIdx, setStepIdx] = useState(0);

  const step = STEPS[stepIdx];
  const isFirst = stepIdx === 0;
  const isLast = stepIdx === STEPS.length - 1;
  const total = STEPS.length;

  const handleNext = useCallback(() => {
    if (stepIdx < total - 1) {
      // Auto-select building tool when reaching step 1
      if (stepIdx === 0) {
        onSetTool("building");
      }
      setStepIdx((i) => i + 1);
    }
  }, [stepIdx, total, onSetTool]);

  const handlePrev = useCallback(() => {
    if (stepIdx > 0) {
      setStepIdx((i) => i - 1);
    }
  }, [stepIdx]);

  const handleDone = useCallback(() => {
    try {
      localStorage.setItem(TUTORIAL_KEY, "true");
    } catch {}
    onClose();
  }, [onClose]);

  const handleSkip = useCallback(() => {
    handleDone();
  }, [handleDone]);

  const Icon = step.icon;

  // Reset to first step when opened
  useEffect(() => {
    if (open) setStepIdx(0);
  }, [open]);

  // Escape key to dismiss
  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleSkip();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [open, handleSkip]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Spotlight on specific element */}
          {step.spotlight && <Spotlight selector={step.spotlight} />}

          {/* Full dim overlay (only when no spotlight) */}
          {!step.spotlight && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="fixed inset-0 z-[60] bg-background/70 backdrop-blur-sm"
              onClick={handleSkip}
            />
          )}

          {/* Tooltip card */}
          <motion.div
            key={step.id}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 350, damping: 25 }}
            className={cn(
              "fixed z-[62] w-full max-w-sm",
              step.spotlight && step.tooltipPosition === "right"
                ? "left-[84px] top-1/2 -translate-y-1/2"
                : step.spotlight && step.tooltipPosition === "bottom"
                  ? "left-1/2 -translate-x-1/2 top-[60%]"
                  : "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            )}
          >
            <div className="bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-start gap-3 px-5 pt-5 pb-3">
                <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-extrabold text-foreground" style={{ fontFamily: "var(--font-sans)" }}>
                    {step.title}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed" style={{ fontFamily: "var(--font-body)" }}>
                    {step.description}
                  </p>
                </div>
              </div>

              {/* Progress dots */}
              <div className="flex items-center gap-1.5 px-5 pb-4">
                {STEPS.map((s, i) => (
                  <button
                    key={s.id}
                    onClick={() => setStepIdx(i)}
                    className={cn(
                      "h-1.5 rounded-full transition-all duration-300",
                      i === stepIdx
                        ? "w-6 bg-primary"
                        : i < stepIdx
                          ? "w-2 bg-primary/40"
                          : "w-2 bg-muted-foreground/20 hover:bg-muted-foreground/40"
                    )}
                  />
                ))}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between gap-2 px-5 pb-5">
                <button
                  onClick={handleSkip}
                  className="flex items-center gap-1 h-9 px-3 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                  Skip
                </button>

                <div className="flex items-center gap-2">
                  {!isFirst && (
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={handlePrev}
                      className="flex items-center gap-1 h-9 px-3 rounded-xl border border-border text-xs font-bold text-foreground hover:bg-muted transition-colors"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      Back
                    </motion.button>
                  )}
                  {isLast ? (
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={handleDone}
                      className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-extrabold hover:bg-primary/90 transition-colors shadow-sm"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Got it
                    </motion.button>
                  ) : (
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={handleNext}
                      className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-extrabold hover:bg-primary/90 transition-colors shadow-sm"
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

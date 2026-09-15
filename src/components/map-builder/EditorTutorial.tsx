import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { useReducedMotion } from "../../hooks/useReducedMotion";

export type EditorTutorialKind = "outdoor" | "floor";
export type TutorialPreference = "unseen" | "dismissed" | "completed";
export type TutorialPlacement = "top" | "right" | "bottom" | "left";

export interface TutorialStep {
  id: string;
  target: string;
  title: string;
  description: string;
  placement?: TutorialPlacement;
  beforeStep?: () => void;
  /** Opt in for responsive/optional targets that may be skipped if unavailable. */
  skipWhenMissing?: boolean;
}

export interface EditorTutorialController {
  open: boolean;
  invitationOpen: boolean;
  stepIndex: number;
  preference: TutorialPreference;
  start: () => void;
  replay: () => void;
  next: () => void;
  back: () => void;
  skip: () => void;
  finish: () => void;
  maybeLater: () => void;
}

const STORAGE_PREFIX = "plv-navisync:tutorial:";
const VERSION = "v1";

function storageKey(kind: EditorTutorialKind) {
  return `${STORAGE_PREFIX}${kind}:${VERSION}`;
}

function readPreference(kind: EditorTutorialKind): TutorialPreference {
  if (typeof window === "undefined") return "unseen";
  try {
    const value = window.localStorage.getItem(storageKey(kind));
    return value === "completed" || value === "dismissed" ? value : "unseen";
  } catch {
    return "unseen";
  }
}

function writePreference(kind: EditorTutorialKind, value: TutorialPreference) {
  try {
    window.localStorage.setItem(storageKey(kind), value);
  } catch {
    // Private browsing/storage-disabled environments should still have a
    // completely functional in-session tour.
  }
}

export function useEditorTutorial(kind: EditorTutorialKind, stepCount: number): EditorTutorialController {
  const [preference, setPreference] = useState<TutorialPreference>(() => readPreference(kind));
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const sessionLater = useRef(false);

  const setStored = useCallback((value: TutorialPreference) => {
    setPreference(value);
    writePreference(kind, value);
  }, [kind]);

  const start = useCallback(() => {
    sessionLater.current = false;
    setStepIndex(0);
    setOpen(true);
  }, []);

  const replay = useCallback(() => {
    sessionLater.current = false;
    setStepIndex(0);
    setOpen(true);
  }, []);

  const finish = useCallback(() => {
    setOpen(false);
    setStored("completed");
  }, [setStored]);

  const skip = useCallback(() => {
    setOpen(false);
    setStored("dismissed");
  }, [setStored]);

  const maybeLater = useCallback(() => {
    sessionLater.current = true;
    setOpen(false);
    setStored("dismissed");
  }, [setStored]);

  const next = useCallback(() => {
    if (stepIndex >= Math.max(0, stepCount - 1)) finish();
    else setStepIndex((value) => value + 1);
  }, [finish, stepCount, stepIndex]);

  const back = useCallback(() => setStepIndex((value) => Math.max(0, value - 1)), []);

  return {
    open,
    invitationOpen: !open && preference === "unseen" && !sessionLater.current,
    stepIndex,
    preference,
    start,
    replay,
    next,
    back,
    skip,
    finish,
    maybeLater,
  };
}

interface TutorialInvitationProps {
  open: boolean;
  kind: EditorTutorialKind;
  onStart: () => void;
  onMaybeLater: () => void;
}

export function TutorialInvitation({ open, kind, onStart, onMaybeLater }: TutorialInvitationProps) {
  const reducedMotion = useReducedMotion();
  if (!open) return null;
  const label = kind === "floor" ? "Floor Editor" : "Outdoor Map Builder";
  return createPortal(
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: reducedMotion ? 0 : 0.2 }}
      role="dialog"
      aria-label={`${label} tutorial invitation`}
      className="fixed bottom-4 right-4 z-[140] w-[min(330px,calc(100vw-32px))] rounded-2xl border border-primary/20 bg-card p-4 text-card-foreground shadow-2xl"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-primary">New to {label}?</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Take a quick tour of the main tools and authoring workflow.</p>
        </div>
        <button type="button" onClick={onMaybeLater} aria-label="Dismiss tutorial invitation" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onMaybeLater} className="h-8 rounded-lg px-3 text-[10px] font-bold text-muted-foreground hover:bg-muted hover:text-foreground">Maybe Later</button>
        <button type="button" onClick={onStart} className="h-8 rounded-lg bg-primary px-3 text-[10px] font-extrabold text-primary-foreground shadow-sm hover:bg-primary/90">Start Tour</button>
      </div>
    </motion.div>,
    document.body,
  );
}

interface EditorTutorialProps {
  kind: EditorTutorialKind;
  steps: TutorialStep[];
  controller: EditorTutorialController;
  /** Harmless editor-UI exposure used by steps such as Outdoor Hierarchy/Assets. */
  onStepChange?: (step: TutorialStep) => void;
}

function targetSelector(target: string) {
  return `[data-tutorial="${target.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`;
}

export function EditorTutorial({ kind, steps, controller, onStepChange }: EditorTutorialProps) {
  const reducedMotion = useReducedMotion();
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [cardPosition, setCardPosition] = useState({ left: 16, top: 16, width: 320 });
  const cardRef = useRef<HTMLDivElement>(null);
  const missingStepRef = useRef<string | null>(null);
  const targetRetryRef = useRef<{ id: string | null; attempts: number }>({ id: null, attempts: 0 });
  const retryFrameRef = useRef<number | null>(null);
  const skipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousStepIndexRef = useRef(controller.stepIndex);
  const wasOpenRef = useRef(false);
  const navigationDirectionRef = useRef<"forward" | "back">("forward");
  const measureRef = useRef<() => void>(() => undefined);
  const activeStep = steps[controller.stepIndex];

  const measure = useCallback(() => {
    if (!activeStep) return;
    const element = document.querySelector<HTMLElement>(targetSelector(activeStep.target));
    if (!element) {
      setTargetRect(null);
      if (targetRetryRef.current.id !== activeStep.id) targetRetryRef.current = { id: activeStep.id, attempts: 0 };
      // Exposed tutorial panels (for example Hierarchy → Assets) need a
      // render opportunity before their target can be measured. Retry only a
      // few animation frames, then treat the target as genuinely unavailable.
      if (targetRetryRef.current.attempts < 3) {
        targetRetryRef.current.attempts += 1;
        retryFrameRef.current = window.requestAnimationFrame(() => measureRef.current());
        return;
      }
      // Required steps stay visible when their target is temporarily absent.
      // Only explicitly responsive/optional steps may advance automatically.
      if (activeStep.skipWhenMissing === true && navigationDirectionRef.current !== "back" && missingStepRef.current !== activeStep.id) {
        missingStepRef.current = activeStep.id;
        skipTimeoutRef.current = window.setTimeout(() => {
          skipTimeoutRef.current = null;
          controller.next();
        }, 0);
      }
      return;
    }
    missingStepRef.current = null;
    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) {
      setTargetRect(null);
      if (targetRetryRef.current.id !== activeStep.id) targetRetryRef.current = { id: activeStep.id, attempts: 0 };
      if (targetRetryRef.current.attempts < 3) {
        targetRetryRef.current.attempts += 1;
        retryFrameRef.current = window.requestAnimationFrame(() => measureRef.current());
        return;
      }
      // Keep the same explicit opt-in rule for targets that render with zero
      // dimensions (for example a collapsed responsive control).
      if (activeStep.skipWhenMissing === true && navigationDirectionRef.current !== "back" && missingStepRef.current !== activeStep.id) {
        missingStepRef.current = activeStep.id;
        skipTimeoutRef.current = window.setTimeout(() => {
          skipTimeoutRef.current = null;
          controller.next();
        }, 0);
      }
      return;
    }
    targetRetryRef.current = { id: null, attempts: 0 };
    // A responsive target may appear just after the bounded retry window. If
    // it did, cancel any pending optional-step skip before it can advance.
    if (skipTimeoutRef.current !== null) {
      window.clearTimeout(skipTimeoutRef.current);
      skipTimeoutRef.current = null;
    }
    setTargetRect(rect);
    const margin = 16;
    const gap = 14;
    // Keep the card inside very narrow tablet/mobile viewports while retaining
    // the comfortable desktop width.
    const width = Math.min(340, Math.max(0, window.innerWidth - margin * 2));
    const estimatedHeight = Math.max(150, cardRef.current?.offsetHeight ?? 190);
    const preferred = activeStep.placement ?? "bottom";
    const fits = {
      top: rect.top >= estimatedHeight + gap + margin,
      right: window.innerWidth - rect.right >= width + gap + margin,
      bottom: window.innerHeight - rect.bottom >= estimatedHeight + gap + margin,
      left: rect.left >= width + gap + margin,
    };
    const fallbackOrder: TutorialPlacement[] = preferred === "top"
      ? ["top", "bottom", "right", "left"]
      : preferred === "bottom"
        ? ["bottom", "top", "right", "left"]
        : preferred === "left"
          ? ["left", "right", "bottom", "top"]
          : ["right", "left", "bottom", "top"];
    const placement = fits[preferred] ? preferred : fallbackOrder.find((candidate) => fits[candidate]) ?? preferred;
    let left = rect.left + rect.width / 2 - width / 2;
    let top = rect.bottom + gap;
    if (placement === "top") {
      left = rect.left + rect.width / 2 - width / 2;
      top = rect.top - estimatedHeight - gap;
    } else if (placement === "right") {
      left = rect.right + gap;
      top = rect.top + rect.height / 2 - estimatedHeight / 2;
    } else if (placement === "left") {
      left = rect.left - width - gap;
      top = rect.top + rect.height / 2 - estimatedHeight / 2;
    }
    setCardPosition({
      left: Math.max(margin, Math.min(left, window.innerWidth - width - margin)),
      top: Math.max(margin, Math.min(top, window.innerHeight - estimatedHeight - margin)),
      width,
    });
  }, [activeStep, controller.next]);
  measureRef.current = measure;

  useLayoutEffect(() => {
    if (!controller.open || !activeStep) return;
    // Never leave the previous step's spotlight visible while a harmless
    // beforeStep callback exposes a new panel/tab.
    setTargetRect(null);
    missingStepRef.current = null;
    navigationDirectionRef.current = !wasOpenRef.current || controller.stepIndex >= previousStepIndexRef.current ? "forward" : "back";
    wasOpenRef.current = true;
    previousStepIndexRef.current = controller.stepIndex;
    targetRetryRef.current = { id: activeStep.id, attempts: 0 };
    if (skipTimeoutRef.current !== null) {
      window.clearTimeout(skipTimeoutRef.current);
      skipTimeoutRef.current = null;
    }
    if (retryFrameRef.current !== null) {
      window.cancelAnimationFrame(retryFrameRef.current);
      retryFrameRef.current = null;
    }
    activeStep.beforeStep?.();
    onStepChange?.(activeStep);
    const element = document.querySelector<HTMLElement>(targetSelector(activeStep.target));
    element?.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "smooth" });
    const raf = window.requestAnimationFrame(measure);
    const onReposition = () => measure();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.cancelAnimationFrame(raf);
      if (retryFrameRef.current !== null) {
        window.cancelAnimationFrame(retryFrameRef.current);
        retryFrameRef.current = null;
      }
      if (skipTimeoutRef.current !== null) {
        window.clearTimeout(skipTimeoutRef.current);
        skipTimeoutRef.current = null;
      }
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [activeStep, controller.open, measure, onStepChange]);

  useEffect(() => {
    if (controller.open) return;
    // A replay starts a fresh forward traversal; do not inherit the previous
    // tour's final index and accidentally treat the welcome step as Back.
    wasOpenRef.current = false;
    previousStepIndexRef.current = 0;
    navigationDirectionRef.current = "forward";
  }, [controller.open]);

  useEffect(() => {
    if (!controller.open) return;
    cardRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        controller.skip();
        return;
      }
      if (event.key !== "Tab" || !cardRef.current) return;
      const controls = Array.from(cardRef.current.querySelectorAll<HTMLElement>("button:not([disabled])"));
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [controller, controller.open, controller.stepIndex]);

  if (!controller.open || !activeStep) return null;
  const progress = `${controller.stepIndex + 1} of ${steps.length}`;
  const radius = targetRect ? Math.max(32, Math.max(targetRect.width, targetRect.height) / 2 + 12) : 0;
  const center = targetRect ? `${targetRect.left + targetRect.width / 2}px ${targetRect.top + targetRect.height / 2}px` : "50% 50%";
  const overlayBackground = targetRect
    ? `radial-gradient(ellipse ${radius}px ${radius}px at ${center}, transparent 0%, transparent 72%, rgba(15, 23, 42, 0.7) 100%)`
    : "rgba(15, 23, 42, 0.7)";

  return createPortal(
    <AnimatePresence>
      <motion.div key="editor-tutorial" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0 : 0.18 }} className="fixed inset-0 z-[200]" aria-hidden="true">
        <div className="absolute inset-0 bg-slate-950/60" style={{ WebkitMaskImage: overlayBackground, maskImage: overlayBackground }} />
        {targetRect && <div className="pointer-events-none fixed rounded-xl border-2 border-primary/80 shadow-[0_0_0_5px_rgba(59,130,246,0.18),0_0_32px_rgba(59,130,246,0.2)]" style={{ left: targetRect.left - 6, top: targetRect.top - 6, width: targetRect.width + 12, height: targetRect.height + 12 }} />}
        <div className="absolute inset-0" onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }} onClick={(event) => { event.preventDefault(); event.stopPropagation(); }} />
      </motion.div>
      <motion.div
        ref={cardRef}
        key={`tutorial-card-${activeStep.id}`}
        role="dialog"
        aria-modal="true"
        aria-label={`${kind === "floor" ? "Floor Editor" : "Outdoor Map Builder"} tutorial`}
        tabIndex={-1}
        initial={{ opacity: 0, y: 6, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: reducedMotion ? 0 : 0.18 }}
        className="fixed z-[210] rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-2xl outline-none"
        style={{ left: cardPosition.left, top: cardPosition.top, width: cardPosition.width }}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Check className="h-4 w-4" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-primary">{activeStep.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{activeStep.description}</p>
          </div>
          <button type="button" onClick={controller.skip} aria-label="Skip tutorial" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <button type="button" onClick={controller.skip} className="text-[10px] font-bold text-muted-foreground hover:text-foreground">Skip Tour</button>
          <span className="text-[10px] font-bold tabular-nums text-muted-foreground">{progress}</span>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={controller.back} disabled={controller.stepIndex === 0} className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 text-[10px] font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"><ArrowLeft className="h-3 w-3" />Back</button>
            <button type="button" onClick={controller.next} className={cn("inline-flex h-8 items-center gap-1 rounded-lg px-3 text-[10px] font-extrabold shadow-sm", "bg-primary text-primary-foreground hover:bg-primary/90")}>
              {controller.stepIndex === steps.length - 1 ? "Finish" : "Next"}<ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

/* legacy definitions retained only in git history */
/* const OUTDOOR_TUTORIAL_STEPS_LEGACY: TutorialStep[] = [
  { id: "welcome", target: "outdoor-canvas", title: "Outdoor Map Builder", description: "Build the physical campus layout, then prepare its walking network for navigation.", placement: "bottom" },
  { id: "hierarchy", target: "outdoor-hierarchy", title: "Hierarchy", description: "View and manage the campus structure, including Buildings, Floors, Rooms, and other authored elements. Use the hierarchy to quickly locate and select existing map content.", placement: "right" },
  { id: "assets", target: "outdoor-assets", title: "Assets Library", description: "Place Buildings, Gates, landscape objects, Areas, and other campus elements.", placement: "right" },
  { id: "select", target: "outdoor-select-tool", title: "Select", description: "Select and edit authored objects on the canvas. Drag across empty canvas space to marquee-select multiple editable objects. Selecting an object opens its available properties and object-specific editing options. Tip: Hold Spacebar to temporarily pan without leaving Select mode.", placement: "bottom" },
  { id: "welcome", target: "outdoor-canvas", title: "Outdoor Map Builder", description: "Build the physical campus layout, then prepare its walking network for navigation.", placement: "bottom" },
  { id: "assets", target: "outdoor-assets", title: "Assets Library", description: "Place Buildings, Gates, landscape objects, Areas, and other campus elements.", placement: "right" },
  { id: "select", target: "outdoor-select-tool", title: "Select", description: "Select, move, resize, and edit campus objects. Drag an empty area to marquee-select multiple editable objects.", placement: "bottom" },
  { id: "pan", target: "outdoor-pan-tool", title: "Pan", description: "Drag to move around the campus without changing the authored layout.", placement: "bottom" },
  { id: "building", target: "outdoor-building-tool", title: "Building", description: "Draw a building footprint, then configure its identity, floors, and entrances in Properties.", placement: "bottom" },
  { id: "pathways", target: "outdoor-pathways", title: "Pathways", description: "Pathways represent the physical walking network used by campus navigation.", placement: "bottom" },
  { id: "walking-point", target: "outdoor-walking-point", title: "Walking Point", description: "Add a routing point when a physical pathway does not provide the waypoint you need.", placement: "bottom" },
  { id: "connect", target: "outdoor-connect", title: "Connect", description: "Connect Entrances, Gates, Pathways, and eligible navigation points. Connect can target existing waypoints or compatible Pathway segments.", placement: "bottom" },
  { id: "remove", target: "outdoor-remove-tool", title: "Remove", description: "Remove an authored object or navigation item from the active workspace.", placement: "bottom" },
  { id: "navigation", target: "outdoor-navigation-visibility", title: "Navigation View", description: "Use Navigation view to inspect authored waypoints and connections.", placement: "bottom" },
  { id: "test-route", target: "outdoor-test-route", title: "Test Route", description: "Choose a start and destination to check whether the walking network can produce a valid route.", placement: "bottom" },
  { id: "undo", target: "outdoor-undo", title: "Undo", description: "Reverse your most recent authoring change.", placement: "bottom" },
  { id: "redo", target: "outdoor-redo", title: "Redo", description: "Restore the most recently undone authoring change.", placement: "bottom" },
  { id: "grid-snap", target: "outdoor-grid-snap", title: "Grid Snap", description: "Toggle alignment to the outdoor authoring grid while placing or moving objects.", placement: "bottom", skipWhenMissing: true },
  { id: "edge-snap", target: "outdoor-edge-snap", title: "Edge Snap", description: "Toggle alignment to nearby object and path edges.", placement: "bottom", skipWhenMissing: true },
  { id: "zoom-in", target: "outdoor-zoom-in", title: "Zoom In", description: "Zoom closer to inspect and edit campus details.", placement: "bottom", skipWhenMissing: true },
  { id: "zoom-out", target: "outdoor-zoom-out", title: "Zoom Out", description: "Zoom farther out to see more of the campus at once.", placement: "bottom", skipWhenMissing: true },
  { id: "reset-view", target: "outdoor-reset-view", title: "Reset View", description: "Return the canvas to its default zoom and position.", placement: "bottom", skipWhenMissing: true },
  { id: "canvas-settings", target: "outdoor-canvas-settings", title: "Canvas Settings", description: "Configure the outdoor canvas, snapping, ground appearance, and canvas resize.", placement: "bottom" },
  { id: "keyboard-shortcuts", target: "outdoor-keyboard-shortcuts", title: "Keyboard Shortcuts", description: "Open the shortcut reference for the Map Builder's tools and commands.", placement: "bottom", skipWhenMissing: true },
  { id: "save", target: "outdoor-save", title: "Save", description: "Save the current campus draft before reviewing or publishing it.", placement: "bottom" },
  { id: "review-publish", target: "outdoor-review-publish", title: "Review & Publish", description: "Resolve issues, test routes, then publish the saved campus for students.", placement: "bottom" },
];

const FLOOR_TUTORIAL_STEPS_LEGACY: TutorialStep[] = [
  { id: "welcome", target: "floor-canvas", title: "Floor Editor", description: "Create the physical indoor floor plan first, then prepare circulation and navigation.", placement: "bottom" },
  { id: "floor-navigator", target: "floor-navigator", title: "Floor Navigator", description: "Switch Floors, add a Floor, or manage the current Floor. New Floors can start blank or use a visual Floor Template.", placement: "bottom" },
  { id: "object-library", target: "floor-library", title: "Object Library", description: "Add Rooms, Walls, Furniture, circulation objects, and exterior architecture from the library.", placement: "right" },
  { id: "floor-templates", target: "floor-templates", title: "Floor Templates", description: "Reuse a saved physical Floor layout. Templates contain no navigation, so configure Doors, circulation, and routes manually afterward.", placement: "right" },
  { id: "rooms-walls-doors", target: "floor-build-tools", title: "Rooms, Walls & Doors", description: "Create the structural floor layout with Rooms, Walls, and Doors.", placement: "right" },
  { id: "furniture", target: "floor-furniture", title: "Furniture", description: "Furnish classrooms, laboratories, offices, libraries, restrooms, and other spaces using the curated asset library.", placement: "right" },
  { id: "select", target: "floor-select-tool", title: "Select", description: "Select and edit floor objects. Drag an empty area to marquee-select multiple editable items.", placement: "bottom" },
  { id: "pan", target: "floor-pan-tool", title: "Pan", description: "Drag to navigate a large floor plan without changing selection or content.", placement: "bottom" },
  { id: "walking-point", target: "floor-walking-point-tool", title: "Walking Point", description: "Place a routing point along an indoor circulation area when manual authoring needs one.", placement: "bottom" },
  { id: "connect", target: "floor-connect-tool", title: "Connect", description: "Connect compatible indoor navigation points after the physical layout is ready.", placement: "bottom" },
  { id: "remove", target: "floor-remove-tool", title: "Remove", description: "Remove a selected walking point or walking path from the indoor navigation workspace.", placement: "bottom" },
  { id: "navigation", target: "floor-navigation-visibility", title: "Navigation View", description: "Show or hide indoor navigation anchors and connections for inspection.", placement: "bottom" },
  { id: "test-route", target: "floor-test-route", title: "Test Route", description: "Choose a start and destination to verify a floor route.", placement: "bottom" },
  { id: "undo", target: "floor-undo", title: "Undo", description: "Reverse your most recent floor authoring change.", placement: "bottom" },
  { id: "redo", target: "floor-redo", title: "Redo", description: "Restore the most recently undone floor change.", placement: "bottom" },
  { id: "grid-snap", target: "floor-grid-snap", title: "Grid Snap", description: "Toggle snapping while placing or moving floor objects.", placement: "bottom" },
  { id: "fit-view", target: "floor-fit-view", title: "Fit View", description: "Fit the current floor content inside the visible canvas.", placement: "bottom" },
  { id: "issues", target: "floor-issues", title: "Issues", description: "Review floor items that need attention before publishing.", placement: "bottom" },
  { id: "shortcuts", target: "floor-keyboard-shortcuts", title: "Keyboard Shortcuts", description: "Open the shortcut reference for the floor editing tools.", placement: "bottom", skipWhenMissing: true },
  { id: "locking", target: "floor-locking", title: "Lock for Furnishing", description: "Lock a completed Room to prevent accidental movement while selecting or marquee-editing Furniture inside it. Click empty locked Room space to select it again and unlock it.", placement: "left" },
  { id: "floor-settings", target: "floor-settings", title: "Floor Settings", description: "Configure snapping, floor appearance, grid options, and resize the Floor on canvas.", placement: "bottom" },
  { id: "transform", target: "floor-properties", title: "Transform & Properties", description: "Move, resize, rotate, layer, duplicate, lock, and edit physical Floor objects.", placement: "left" },
  { id: "save", target: "floor-save", title: "Save", description: "Save the current Floor draft and keep your physical layout persisted.", placement: "bottom" },
  { id: "publish", target: "floor-publish", title: "Publish", description: "After the physical layout and navigation are ready, publish the saved Floor for students.", placement: "bottom" },
]; */

// Keep the walkthrough concise by spotlighting individual authoring tools,
// while combining controls that are used as one utility cluster.
export const OUTDOOR_TUTORIAL_STEPS: TutorialStep[] = [
  { id: "welcome", target: "outdoor-canvas", title: "Outdoor Map Builder", description: "Build the physical campus layout, then prepare its walking network for navigation.", placement: "bottom" },
  { id: "hierarchy", target: "outdoor-hierarchy", title: "Hierarchy", description: "View and manage the campus structure, including Buildings, Floors, Rooms, and other authored elements. Use the hierarchy to quickly locate and select existing map content.", placement: "right" },
  { id: "assets", target: "outdoor-assets", title: "Assets Library", description: "Place Buildings, Gates, landscape objects, Areas, and other campus elements.", placement: "right" },
  { id: "select", target: "outdoor-select-tool", title: "Select", description: "Select and edit authored objects on the canvas. Drag across empty canvas space to marquee-select multiple editable objects. Selecting an object opens its available properties and object-specific editing options. Tip: Hold Spacebar to temporarily pan without leaving Select mode.", placement: "bottom" },
  { id: "pan", target: "outdoor-pan-tool", title: "Pan", description: "Drag to move around the campus without changing the authored layout.", placement: "bottom" },
  { id: "building", target: "outdoor-building-tool", title: "Building", description: "Draw a building footprint, then configure its identity, floors, and entrances in Properties.", placement: "bottom" },
  { id: "pathways", target: "outdoor-pathways", title: "Pathways", description: "Use clicks to author the physical walking route. Pathways form part of the navigation network; Escape cancels the current draft.", placement: "bottom" },
  { id: "walking-point", target: "outdoor-walking-point", title: "Walking Point", description: "Add a routing point when a physical pathway does not provide the waypoint you need.", placement: "bottom" },
  { id: "connect", target: "outdoor-connect", title: "Connect", description: "Connect Entrances, Gates, Pathways, and eligible navigation points. Connect can target existing waypoints or compatible Pathway segments.", placement: "bottom" },
  { id: "remove", target: "outdoor-remove-tool", title: "Remove", description: "Remove an authored object or navigation item from the active workspace. Tip: Ctrl+Z restores the last deleted authoring change.", placement: "bottom" },
  { id: "navigation", target: "outdoor-navigation-visibility", title: "Navigation View", description: "Use Navigation view to inspect authored waypoints and connections.", placement: "bottom" },
  { id: "test-route", target: "outdoor-test-route", title: "Test Route", description: "Choose a start and destination to check whether the walking network can produce a valid route.", placement: "bottom" },
  { id: "history", target: "outdoor-undo-redo", title: "Undo + Redo", description: "Undo reverses the latest authoring change; Redo restores a change you just undid.", placement: "bottom" },
  { id: "canvas-settings", target: "outdoor-canvas-settings", title: "Canvas Settings", description: "Configure the outdoor canvas, snapping, ground appearance, and canvas resize. Use the canvas or Ctrl+scroll to zoom without changing the authored layout.", placement: "bottom" },
  { id: "keyboard-shortcuts", target: "outdoor-keyboard-shortcuts", title: "Keyboard Shortcuts", description: "Open the shortcut reference for the Map Builder's tools and commands.", placement: "bottom", skipWhenMissing: true },
  { id: "save-publish", target: "outdoor-save-publish", title: "Save + Review & Publish", description: "Save authored changes, resolve issues, test routes, then review and publish the campus for students.", placement: "bottom" },
];

export const FLOOR_TUTORIAL_STEPS: TutorialStep[] = [
  { id: "welcome", target: "floor-canvas", title: "Floor Editor", description: "Create the physical indoor floor plan first, then prepare circulation and navigation.", placement: "bottom" },
  { id: "floor-navigator", target: "floor-navigator", title: "Floor Navigator", description: "Switch Floors, add a Floor, or manage the current Floor. New Floors can start blank or use a visual Floor Template.", placement: "bottom" },
  { id: "object-library", target: "floor-library", title: "Object Library", description: "Add Rooms, Walls, Furniture, circulation objects, and exterior architecture from the library.", placement: "right" },
  { id: "floor-templates", target: "floor-templates", title: "Floor Templates", description: "Reuse a saved physical Floor layout. Templates contain no navigation, so configure Doors, circulation, and routes manually afterward.", placement: "right" },
  { id: "rooms-walls-doors", target: "floor-build-tools", title: "Rooms, Walls & Doors", description: "Create the structural floor layout with Rooms, Walls, and Doors.", placement: "right" },
  { id: "circulation", target: "floor-circulation", title: "Circulation", description: "Add Stairs and Elevators to represent how people move between Floors. These are physical circulation elements first; cross-floor navigation relationships are configured through the existing workflow.", placement: "right" },
  { id: "furniture", target: "floor-furniture", title: "Furniture", description: "Furnish classrooms, laboratories, offices, libraries, restrooms, and other spaces using the curated Furniture library. Categories can be expanded and searched as needed. Tip: Lock a finished Room to avoid moving it accidentally while arranging Furniture inside; click empty locked Room space to select and unlock it again.", placement: "right" },
  { id: "select", target: "floor-select-tool", title: "Select", description: "Select authored objects to edit them and access object-specific properties. Drag an empty area to marquee-select multiple editable items. Tip: Hold Spacebar to temporarily pan without leaving Select mode.", placement: "bottom" },
  { id: "pan", target: "floor-pan-tool", title: "Pan", description: "Drag to navigate a large floor plan without changing selection or content.", placement: "bottom" },
  { id: "walking-point", target: "floor-walking-point-tool", title: "Walking Point", description: "Place a routing point along an indoor circulation area when manual authoring needs one.", placement: "bottom" },
  { id: "connect", target: "floor-connect-tool", title: "Connect", description: "Connect compatible indoor navigation points after the physical layout is ready.", placement: "bottom" },
  { id: "remove", target: "floor-remove-tool", title: "Remove", description: "Remove a selected walking point or walking path from the indoor navigation workspace.", placement: "bottom" },
  { id: "navigation", target: "floor-navigation-visibility", title: "Navigation View", description: "Show or hide indoor navigation anchors and connections for inspection.", placement: "bottom" },
  { id: "test-route", target: "floor-test-route", title: "Test Route", description: "Choose a start and destination to verify a floor route.", placement: "bottom" },
  { id: "history", target: "floor-undo-redo", title: "Undo + Redo", description: "Undo reverses the latest floor authoring change; Redo restores a change you just undid.", placement: "bottom" },
  { id: "view-tools", target: "floor-view-tools", title: "Fit View + Issues", description: "Fit the floor to the visible canvas and review items that need attention before publishing. Grid snapping remains available in Floor Settings.", placement: "bottom" },
  { id: "shortcuts", target: "floor-keyboard-shortcuts", title: "Keyboard Shortcuts", description: "Open the shortcut reference for the floor editing tools. Tip: Ctrl+scroll zooms around the canvas when the pointer is over the editor.", placement: "bottom" },
  { id: "floor-settings", target: "floor-settings", title: "Floor Settings", description: "Configure snapping, floor appearance, grid options, and resize the Floor on canvas.", placement: "bottom" },
  { id: "save-publish", target: "floor-save-test", title: "Save + Publish", description: "Save the Floor, resolve validation issues, and publish once the physical layout and navigation are ready.", placement: "bottom" },
];

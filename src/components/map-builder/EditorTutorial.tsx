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
  /** Missing targets are skipped once rather than blocking the tour. */
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
}

function targetSelector(target: string) {
  return `[data-tutorial="${target.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`;
}

export function EditorTutorial({ kind, steps, controller }: EditorTutorialProps) {
  const reducedMotion = useReducedMotion();
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [cardPosition, setCardPosition] = useState({ left: 16, top: 16, width: 320 });
  const cardRef = useRef<HTMLDivElement>(null);
  const missingStepRef = useRef<string | null>(null);
  const activeStep = steps[controller.stepIndex];

  const measure = useCallback(() => {
    if (!activeStep) return;
    const element = document.querySelector<HTMLElement>(targetSelector(activeStep.target));
    if (!element) {
      setTargetRect(null);
      if (activeStep.skipWhenMissing !== false && missingStepRef.current !== activeStep.id) {
        missingStepRef.current = activeStep.id;
        window.setTimeout(controller.next, 0);
      }
      return;
    }
    missingStepRef.current = null;
    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) {
      setTargetRect(null);
      if (activeStep.skipWhenMissing !== false && missingStepRef.current !== activeStep.id) {
        missingStepRef.current = activeStep.id;
        window.setTimeout(controller.next, 0);
      }
      return;
    }
    setTargetRect(rect);
    const margin = 16;
    const gap = 14;
    const width = Math.min(340, Math.max(260, window.innerWidth - margin * 2));
    const estimatedHeight = Math.max(150, cardRef.current?.offsetHeight ?? 190);
    const preferred = activeStep.placement ?? "bottom";
    const fits = {
      top: rect.top >= estimatedHeight + gap + margin,
      right: window.innerWidth - rect.right >= width + gap + margin,
      bottom: window.innerHeight - rect.bottom >= estimatedHeight + gap + margin,
      left: rect.left >= width + gap + margin,
    };
    const placement = fits[preferred] ? preferred : (["bottom", "right", "top", "left"] as TutorialPlacement[]).find((candidate) => fits[candidate]) ?? "bottom";
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

  useLayoutEffect(() => {
    if (!controller.open || !activeStep) return;
    activeStep.beforeStep?.();
    const element = document.querySelector<HTMLElement>(targetSelector(activeStep.target));
    element?.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "smooth" });
    const raf = window.requestAnimationFrame(measure);
    const onReposition = () => measure();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [activeStep, controller.open, measure]);

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

export const OUTDOOR_TUTORIAL_STEPS: TutorialStep[] = [
  { id: "welcome", target: "outdoor-canvas", title: "Outdoor Map Builder", description: "Build the physical campus layout, then prepare its walking network for navigation.", placement: "bottom" },
  { id: "assets", target: "outdoor-assets", title: "Assets Library", description: "Place Buildings, Gates, landscape objects, Areas, and other campus elements.", placement: "right" },
  { id: "select", target: "outdoor-select-tool", title: "Select & Marquee", description: "Click objects to edit them or drag a marquee to select multiple editable objects. Locked objects stay protected from accidental transforms.", placement: "bottom" },
  { id: "properties", target: "outdoor-properties", title: "Properties", description: "Adjust a selected object's name, size, rotation, visibility, lock, and available object-specific settings.", placement: "left" },
  { id: "canvas-settings", target: "outdoor-canvas-settings", title: "Canvas Settings", description: "Configure the outdoor canvas, snapping, ground appearance, and canvas resize.", placement: "bottom" },
  { id: "pathways", target: "outdoor-pathways", title: "Pathways", description: "Pathways represent the physical walking network used by campus navigation.", placement: "bottom" },
  { id: "connect", target: "outdoor-connect", title: "Connect", description: "Connect Entrances, Gates, Pathways, and eligible navigation points. Connect can target existing waypoints or compatible Pathway segments.", placement: "bottom" },
  { id: "navigation", target: "outdoor-navigation-visibility", title: "Navigation View", description: "Use Navigation view to inspect authored waypoints and connections.", placement: "bottom" },
  { id: "test-route", target: "outdoor-test-route", title: "Test Route & Issues", description: "Validate the campus and test routes before publishing.", placement: "bottom" },
  { id: "save-publish", target: "outdoor-save-publish", title: "Save & Publish", description: "Save authored changes, resolve issues, test routes, then publish for students.", placement: "bottom" },
];

export const FLOOR_TUTORIAL_STEPS: TutorialStep[] = [
  { id: "welcome", target: "floor-canvas", title: "Floor Editor", description: "Create the physical indoor floor plan first, then prepare circulation and navigation.", placement: "bottom" },
  { id: "floor-navigator", target: "floor-navigator", title: "Floor Navigator", description: "Switch Floors, add a Floor, or manage the current Floor. New Floors can start blank or use a visual Floor Template.", placement: "bottom" },
  { id: "object-library", target: "floor-library", title: "Object Library", description: "Add Rooms, Walls, Furniture, circulation objects, and exterior architecture from the library.", placement: "right" },
  { id: "room-templates", target: "floor-templates", title: "Room Templates", description: "Use visual Room Templates to quickly create common PLV spaces. Templates create physical layouts only; navigation is configured manually.", placement: "right" },
  { id: "rooms-walls-doors", target: "floor-build-tools", title: "Rooms, Walls & Doors", description: "Create the structural floor layout with Rooms, Walls, and Doors.", placement: "right" },
  { id: "furniture", target: "floor-furniture", title: "Furniture", description: "Furnish classrooms, laboratories, offices, libraries, restrooms, and other spaces using the curated asset library.", placement: "right" },
  { id: "locking", target: "floor-locking", title: "Lock for Furnishing", description: "Lock a completed Room to prevent accidental movement while selecting or marquee-editing Furniture inside it. Click empty locked Room space to select it again and unlock it.", placement: "left" },
  { id: "floor-settings", target: "floor-settings", title: "Floor Settings", description: "Configure snapping, floor appearance, grid options, and resize the Floor on canvas.", placement: "bottom" },
  { id: "transform", target: "floor-properties", title: "Transform & Properties", description: "Move, resize, rotate, layer, duplicate, lock, and edit physical Floor objects.", placement: "left" },
  { id: "circulation", target: "floor-navigation-tools", title: "Circulation & Navigation", description: "After the physical layout is ready, add Doors, Stairs, Elevators, Ramps, and configure the navigation network.", placement: "bottom" },
  { id: "save-test", target: "floor-save-test", title: "Save & Test", description: "Save the Floor, resolve validation issues, and test routes before publishing.", placement: "bottom" },
];

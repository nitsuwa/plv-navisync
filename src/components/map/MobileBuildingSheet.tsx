import { useRef, useCallback, useEffect, useState } from "react";
import { ArrowLeft, X } from "lucide-react";
import { motion, useMotionValue, useTransform, animate, useReducedMotion } from "motion/react";
import type { Building } from "../../types";
import type { StudentAuthState } from "../../hooks/useStudentAuth";
import { useEscToClose } from "../../hooks/useEscToClose";
import { BuildingCover } from "./BuildingCover";
import { BuildingDetailsActions } from "./BuildingDetailsActions";
import { BuildingDetailsSections } from "./BuildingDetailsSections";
import { LocationQR } from "./LocationQR";

export type MobileBuildingSheetState = "peek" | "default" | "expanded";

interface MobileBuildingSheetProps {
  selected: Building;
  campusId?: string;
  onClose: () => void;
  onDirections: (building: Building) => void;
  onEnterBuilding: (building: Building) => void;
  onSave: (id: string) => void;
  onReport: (building: Building) => void;
  onSignInPrompt: (message: string) => void;
  saved: Set<string>;
  studentAuth: StudentAuthState;
  hasFloorPlans: boolean;
  floorPlanCount: number;
  facilities: string[];
  accessibility: string[];
  showQR: boolean;
  onToggleQR: () => void;
  interactionPaused?: boolean;
  onStateChange?: (state: MobileBuildingSheetState) => void;
  onBackToRoutePlanner?: () => void;
}

const HEIGHTS: Record<MobileBuildingSheetState, string> = {
  peek: "clamp(220px, 35dvh, 270px)",
  default: "clamp(330px, 56dvh, 410px)",
  expanded: "min(66dvh, 620px)",
};
const STATES: MobileBuildingSheetState[] = ["peek", "default", "expanded"];

export function mobileBuildingSheetSnapHeights(
  viewportHeight: number,
  availableHeight = viewportHeight - 84,
): Record<MobileBuildingSheetState, number> {
  availableHeight = Math.max(0, Math.min(viewportHeight, availableHeight));
  const peek = Math.min(availableHeight, Math.max(220, Math.min(viewportHeight * 0.35, 270)));
  const defaultHeight = Math.min(availableHeight, Math.max(peek + 48, Math.max(330, Math.min(viewportHeight * 0.56, 410))));
  const expanded = Math.min(availableHeight, 620, Math.max(defaultHeight, viewportHeight * 0.66));
  return { peek, default: defaultHeight, expanded };
}

export function resolveMobileBuildingSheetSnap(
  current: MobileBuildingSheetState,
  offsetY: number,
  velocityY: number,
  heights: Record<MobileBuildingSheetState, number>,
): MobileBuildingSheetState {
  const currentIndex = STATES.indexOf(current);
  if (Math.abs(velocityY) >= 560) {
    return STATES[Math.max(0, Math.min(STATES.length - 1, currentIndex + (velocityY < 0 ? 1 : -1)))];
  }

  const projectedHeight = heights[current] - offsetY;
  return STATES.reduce((nearest, candidate) =>
    Math.abs(heights[candidate] - projectedHeight) < Math.abs(heights[nearest] - projectedHeight) ? candidate : nearest,
  STATES[0]);
}

export function MobileBuildingSheet({
  selected, campusId, onClose, onDirections, onEnterBuilding, onSave, onReport,
  onSignInPrompt, saved, studentAuth, hasFloorPlans, floorPlanCount, facilities,
  accessibility, showQR, onToggleQR, onStateChange,
  onBackToRoutePlanner,
  interactionPaused = false,
}: MobileBuildingSheetProps) {
  useEscToClose(onClose, !interactionPaused);
  const gestureRef = useRef<{
    pointerId: number;
    startY: number;
    lastY: number;
    lastTime: number;
    velocityY: number;
    moved: boolean;
    target: HTMLButtonElement;
  } | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const snapAnimationRef = useRef<ReturnType<typeof animate> | null>(null);
  const handleMovedRef = useRef(false);
  const reducedMotion = useReducedMotion();
  const [sheetState, setSheetState] = useState<MobileBuildingSheetState>("default");
  const [isDragging, setIsDragging] = useState(false);
  const dragY = useMotionValue(0);
  const sheetOpacity = useTransform(dragY, [-100, 0, 100], [0.985, 1, 0.985]);

  const readSnapHeights = useCallback(() => {
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const surface = sheetRef.current?.closest<HTMLElement>("[data-testid='student-map-surface']");
    const safeTop = Number.parseFloat(surface
      ? window.getComputedStyle(surface).getPropertyValue("--student-map-controls-safe-top")
      : "") || 68;
    const computedMaxHeight = Number.parseFloat(sheetRef.current ? window.getComputedStyle(sheetRef.current).maxHeight : "");
    const availableHeight = Number.isFinite(computedMaxHeight) && computedMaxHeight > 0
      ? computedMaxHeight
      : viewportHeight - safeTop - 136;
    return mobileBuildingSheetSnapHeights(viewportHeight, availableHeight);
  }, []);

  const setState = useCallback((value: MobileBuildingSheetState) => {
    setSheetState(value);
    onStateChange?.(value);
  }, [onStateChange]);

  const settleDrag = useCallback((onComplete?: () => void) => {
    snapAnimationRef.current?.stop();
    if (reducedMotion) {
      dragY.set(0);
      onComplete?.();
      return;
    }
    snapAnimationRef.current = animate(dragY, 0, { duration: 0.2, ease: [0.2, 0.8, 0.2, 1], onComplete });
  }, [dragY, reducedMotion]);

  const finishGesture = useCallback((cancelled: boolean, pointerId?: number, releaseY?: number) => {
    const gesture = gestureRef.current;
    if (!gesture || (pointerId !== undefined && gesture.pointerId !== pointerId)) return;
    if (!cancelled && releaseY !== undefined && releaseY !== gesture.lastY) {
      const now = performance.now();
      const elapsed = Math.max(1, now - gesture.lastTime);
      const heights = readSnapHeights();
      const delta = releaseY - gesture.startY;
      const minOffset = heights[sheetState] - heights.expanded;
      const maxOffset = heights[sheetState] - heights.peek;
      dragY.set(Math.max(minOffset, Math.min(maxOffset, delta)));
      gesture.velocityY = ((releaseY - gesture.lastY) / elapsed) * 1000;
      gesture.moved ||= Math.abs(delta) > 8;
    }
    gestureRef.current = null;
    setIsDragging(false);
    handleMovedRef.current = !cancelled && gesture.moved;
    const next = resolveMobileBuildingSheetSnap(
      sheetState,
      dragY.get(),
      cancelled ? 0 : gesture.velocityY,
      readSnapHeights(),
    );
    setState(next);
    settleDrag();
    try {
      if (gesture.target.hasPointerCapture(gesture.pointerId)) gesture.target.releasePointerCapture(gesture.pointerId);
    } catch {
      // Some embedded browsers release capture before dispatching pointerup.
    }
  }, [dragY, readSnapHeights, setState, settleDrag, sheetState]);

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (interactionPaused || gestureRef.current) return;
    snapAnimationRef.current?.stop();
    handleMovedRef.current = false;
    gestureRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      lastY: event.clientY,
      lastTime: performance.now(),
      velocityY: 0,
      moved: false,
      target: event.currentTarget,
    };
    setIsDragging(true);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Continue with bubbling pointer events when capture is unavailable.
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || interactionPaused) return;
    const now = performance.now();
    const elapsed = Math.max(1, now - gesture.lastTime);
    const delta = event.clientY - gesture.startY;
    const heights = readSnapHeights();
    const minOffset = heights[sheetState] - heights.expanded;
    const maxOffset = heights[sheetState] - heights.peek;
    dragY.set(Math.max(minOffset, Math.min(maxOffset, delta)));
    gesture.velocityY = ((event.clientY - gesture.lastY) / elapsed) * 1000;
    gesture.lastY = event.clientY;
    gesture.lastTime = now;
    if (Math.abs(delta) > 8) gesture.moved = true;
    if (gesture.moved) event.preventDefault();
  };

  useEffect(() => {
    dragY.set(0);
    setState("default");
  }, [selected.id, dragY, setState]);

  useEffect(() => {
    if (interactionPaused && gestureRef.current) finishGesture(true, gestureRef.current.pointerId);
  }, [finishGesture, interactionPaused]);

  useEffect(() => {
    if (showQR && sheetState !== "expanded") setState("expanded");
  }, [showQR, setState, sheetState]);

  const cycleState = () => {
    const next: Record<MobileBuildingSheetState, MobileBuildingSheetState> = {
      peek: "default", default: "expanded", expanded: "default",
    };
    setState(next[sheetState]);
  };

  return (
      <motion.div
      ref={sheetRef}
      data-no-drag
      data-testid="mobile-building-sheet"
      data-map-layer="building-sheet"
      data-sheet-state={sheetState}
      data-dragging={isDragging}
      data-interaction-paused={interactionPaused}
      className="map-layer-building-sheet md:hidden fixed inset-x-3 will-change-transform transition-[height] duration-[200ms] ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none landscape-minimized"
      style={{
        bottom: "calc(4.75rem + env(safe-area-inset-bottom, 0px))",
        height: HEIGHTS[sheetState],
        maxHeight: "min(calc(100dvh - 5.25rem - env(safe-area-inset-bottom, 0px)), calc(100dvh - var(--student-map-controls-safe-top, 4.25rem) - 8.5rem - env(safe-area-inset-bottom, 0px)))",
        y: dragY,
        opacity: sheetOpacity,
      }}
      initial={reducedMotion ? false : { y: "100%", opacity: 0.96 }}
      animate={{ y: 0, opacity: 1 }}
      exit={reducedMotion ? { opacity: 0 } : { y: "100%", opacity: 0 }}
      transition={reducedMotion ? { duration: 0.01 } : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-border/80 bg-card/97 shadow-[0_12px_42px_rgba(15,23,42,0.22)] backdrop-blur-2xl">
        <button
          type="button"
          aria-expanded={sheetState === "expanded"}
          aria-disabled={interactionPaused}
          aria-label={sheetState === "expanded" ? "Collapse building details" : sheetState === "peek" ? "Show building details" : "Expand building details"}
          className="flex h-7 shrink-0 touch-none cursor-grab items-center justify-center active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={(event) => finishGesture(false, event.pointerId, event.clientY)}
          onPointerCancel={(event) => finishGesture(true, event.pointerId)}
          onLostPointerCapture={(event) => finishGesture(true, event.pointerId)}
          onClick={(event) => {
            if (interactionPaused || handleMovedRef.current) {
              handleMovedRef.current = false;
              event.preventDefault();
              return;
            }
            cycleState();
          }}
        >
          <span className="h-1 w-9 rounded-full bg-muted-foreground/25" />
        </button>

        {onBackToRoutePlanner && (
          <div className="shrink-0 px-3 pb-1">
            <button
              type="button"
              onClick={onBackToRoutePlanner}
              aria-label="Back to route planner"
              className="inline-flex min-h-7 items-center gap-1 rounded-lg px-2 text-[10px] font-extrabold text-primary transition-colors hover:bg-primary/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <ArrowLeft className="h-3 w-3" aria-hidden="true" />
              Back to route planner
            </button>
          </div>
        )}

        {sheetState !== "peek" && (
          <div data-testid="building-sheet-image" data-building-sheet-image className={`mx-3 shrink-0 overflow-hidden rounded-2xl transition-[height] duration-200 motion-reduce:transition-none ${sheetState === "expanded" ? "h-[160px]" : "h-[96px]"}`}>
            <BuildingCover imageUrl={selected.image_url} code={selected.code} name={selected.name} className="h-full aspect-auto rounded-2xl" />
          </div>
        )}

        <header className={`flex shrink-0 items-start justify-between gap-3 px-4 ${sheetState === "peek" ? "pb-2 pt-1" : sheetState === "default" ? "pb-1 pt-2" : "pb-2 pt-2"}`}>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex min-w-0 items-center gap-2">
              <span className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-extrabold text-primary">{selected.code}</span>
              <span className="truncate text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{selected.category?.replace(/[_-]+/g, " ") || "Campus building"}</span>
              {floorPlanCount > 0 && <span className="ml-auto shrink-0 text-[10px] font-semibold text-muted-foreground">{floorPlanCount}F</span>}
            </div>
            <h2 className="line-clamp-2 pr-1 text-[15px] font-extrabold leading-[1.1] tracking-tight text-foreground">{selected.name}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close building details" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted/80 text-muted-foreground transition hover:bg-muted active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className={`shrink-0 px-3 ${sheetState === "peek" ? "pb-3" : "pb-2"}`}>
          <BuildingDetailsActions
            building={selected}
            campusId={campusId}
            hasFloorPlans={hasFloorPlans}
            saved={saved}
            studentAuth={studentAuth}
            showQR={showQR}
            showSecondaryActions={sheetState !== "peek"}
            onDirections={onDirections}
            onEnterBuilding={onEnterBuilding}
            onSave={onSave}
            onReport={onReport}
            onSignInPrompt={onSignInPrompt}
            onToggleQR={onToggleQR}
          />
        </div>

        {sheetState === "default" && (
          <div className="shrink-0 px-4 pb-1">
            <BuildingDetailsSections building={selected} facilities={facilities} accessibility={accessibility} floorCount={floorPlanCount} variant="compact" />
          </div>
        )}

        {sheetState === "expanded" && (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))] scrollbar-show-on-hover" style={{ WebkitOverflowScrolling: "touch" }}>
            <BuildingDetailsSections
              building={selected}
              facilities={facilities}
              accessibility={accessibility}
              floorCount={floorPlanCount}
              showQR={showQR}
              qrContent={<LocationQR campusId={campusId} buildingId={selected.id} buildingName={selected.name} />}
            />
          </div>
        )}
      </div>
    </motion.div>
  );
}

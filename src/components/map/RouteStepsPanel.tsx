import {
  Navigation, Flag, Footprints, ArrowUp, MoveVertical, DoorOpen,
  CircleCheck, Info, Maximize2, RotateCcw,
} from "lucide-react";
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { PlannedRoute, RouteMode, RouteStepIcon } from "../../lib/routePlanner";
import { cn } from "../../lib/utils";

const MOBILE_PANEL_MIN_HEIGHT = 190;
const MOBILE_PANEL_DEFAULT_HEIGHT = 300;
const MOBILE_PANEL_MAX_HEIGHT = 560;

interface RouteStepsPanelProps {
  route: PlannedRoute;
  mode: RouteMode;
  toName: string;
  /** Called when the user ends navigation */
  onEnd: () => void;
  /** Called to zoom the map to fit the route */
  onZoom: () => void;
  /** 0..1 walk progress — when provided, the active step is highlighted */
  walkProgress?: number;
  /** Replays the walk animation */
  onReplay?: () => void;
  /**
   * Optional authored sub-leg currently being walked. This keeps indoor
   * progress scoped to its own steps instead of applying it to the complete
   * room-to-room journey and prematurely announcing the final arrival.
   */
  activeLeg?: {
    steps: PlannedRoute["steps"];
    distanceM: number;
    progress: number;
    statusInstruction?: string;
  };
  /** Condensed layout for the small floating mobile navigation card. */
  compact?: boolean;
}

/** Index of the step currently being walked, based on cumulative distance. */
function activeStepIndex(
  steps: PlannedRoute["steps"],
  progress: number,
  totalDist: number
): number {
  if (steps.length === 0) return 0;
  if (progress <= 0) return 0;
  if (progress >= 1) return steps.length - 1;
  if (!Number.isFinite(totalDist) || totalDist <= 0) return 0;

  const distances = steps.map((step) => {
    const distance = step.distanceM;
    return typeof distance === "number" && Number.isFinite(distance) && distance >= 0 ? distance : null;
  });
  const knownDistance = distances.reduce<number>((sum, distance) => sum + (distance ?? 0), 0);
  const missingCount = distances.filter((distance) => distance === null).length;

  // Mixed routes can omit distances for transitions or indoor/enter steps.
  // Do not treat those steps as zero-length: that makes the loop fall through
  // to the final arrival step at the first non-zero progress update. Share
  // any remaining route distance across missing steps; if the data is unsafe,
  // conservatively keep the first step active.
  if (missingCount > 0) {
    const remainingDistance = totalDist - knownDistance;
    if (!Number.isFinite(remainingDistance) || remainingDistance < 0) return 0;
    const fallbackDistance = remainingDistance / missingCount;
    if (!Number.isFinite(fallbackDistance)) return 0;
    for (let i = 0; i < distances.length; i++) {
      if (distances[i] === null) distances[i] = fallbackDistance;
    }
  }

  const traveled = progress * totalDist;
  let acc = 0;
  for (let i = 0; i < steps.length; i++) {
    acc += distances[i] ?? 0;
    if (acc >= traveled) return i;
  }
  return steps.length - 1;
}

function StepIcon({ icon }: { icon: RouteStepIcon }) {
  const cls = "h-3.5 w-3.5 shrink-0";
  switch (icon) {
    case "start": return <Flag className={`${cls} text-green-500`} />;
    case "stairs": return <ArrowUp className={`${cls} text-purple-500`} />;
    case "elevator": return <MoveVertical className={`${cls} text-purple-500`} />;
    case "enter": return <DoorOpen className={`${cls} text-blue-500`} />;
    case "arrive": return <CircleCheck className={`${cls} text-destructive`} />;
    case "info": return <Info className={`${cls} text-muted-foreground`} />;
    default: return <Footprints className={`${cls} text-primary`} />;
  }
}

function stepDot(isFirst: boolean, isLast: boolean) {
  if (isFirst) return "bg-green-500 border-green-500";
  if (isLast) return "bg-destructive border-destructive";
  return "bg-card border-primary/50";
}

/** Keep internal graph-node names and synthetic distance labels out of
 * student-facing directions. */
function presentInstruction(instruction: string): string | null {
  const trimmed = instruction.trim();
  const floorWaypoint = trimmed.match(/^Continue to floor waypoint(?:\s+\d+)?\.?$/i);
  if (floorWaypoint) return "Continue along the connected indoor path.";
  if (/\b(?:walking point|waypoint)\b/i.test(trimmed)) return null;
  if (/^Start from (?:the )?Door\.?$/i.test(trimmed)) return "Start at the room door.";
  return trimmed
    .replace(/\b\d+(?:\.\d+)?\s*m\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .trim() || null;
}

/**
 * Turn-by-turn navigation panel — shows every student-facing step with an icon.
 * Floor changes are included inline in the directions,
 * so users see each transition once. Positioned by the parent
 * (desktop bottom-left card, mobile sheet).
 */
export function RouteStepsPanel({
  route, mode, toName, onEnd, onZoom, walkProgress, onReplay, activeLeg, compact = false,
}: RouteStepsPanelProps) {
  const [mobilePanelHeight, setMobilePanelHeight] = useState(MOBILE_PANEL_DEFAULT_HEIGHT);
  const [panelOffset, setPanelOffset] = useState({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);
  const resizeStartRef = useRef<{ y: number; height: number } | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; offset: { x: number; y: number } } | null>(null);
  const hasActiveLegSteps = Boolean(activeLeg?.steps.length);
  const steps = hasActiveLegSteps ? activeLeg!.steps : route.steps;
  const trackedProgress = activeLeg?.progress ?? walkProgress;
  const trackedDistance = activeLeg?.distanceM ?? route.dist;
  const modeColor =
    mode === "accessible" ? "#16a34a" : mode === "emergency" ? "#dc2626" : "var(--primary)";
  const activeIndex =
    typeof trackedProgress === "number" && (!activeLeg || hasActiveLegSteps)
      ? activeStepIndex(steps, trackedProgress, trackedDistance)
      : steps.length > 0 ? 0 : null;
  const currentInstruction = activeLeg?.statusInstruction
    ? presentInstruction(activeLeg.statusInstruction)
    : activeIndex !== null && steps[activeIndex]
      ? presentInstruction(steps[activeIndex].instruction)
      : undefined;
  const visibleSteps = steps
    .map((step, index) => ({ step, index, instruction: presentInstruction(step.instruction) }))
    .filter(({ instruction }) => Boolean(instruction));
  const clampMobilePanelHeight = (height: number) => Math.min(
    MOBILE_PANEL_MAX_HEIGHT,
    Math.max(MOBILE_PANEL_MIN_HEIGHT, height),
  );
  const handleResizePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    resizeStartRef.current = { y: event.clientY, height: mobilePanelHeight };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const handleResizePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = resizeStartRef.current;
    if (!start) return;
    event.preventDefault();
    event.stopPropagation();
    setMobilePanelHeight(clampMobilePanelHeight(start.height + start.y - event.clientY));
  };
  const handleResizePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    resizeStartRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };
  const handleResizeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 80 : 32;
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setMobilePanelHeight(height => clampMobilePanelHeight(height + step));
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setMobilePanelHeight(height => clampMobilePanelHeight(height - step));
    } else if (event.key === "Home") {
      event.preventDefault();
      setMobilePanelHeight(MOBILE_PANEL_MIN_HEIGHT);
    } else if (event.key === "End") {
      event.preventDefault();
      setMobilePanelHeight(MOBILE_PANEL_MAX_HEIGHT);
    }
  };
  const handleDragPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    dragStartRef.current = { x: event.clientX, y: event.clientY, offset: panelOffset };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const handleDragPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current;
    if (!start) return;
    event.preventDefault();
    event.stopPropagation();

    let nextX = start.offset.x + event.clientX - start.x;
    let nextY = start.offset.y + event.clientY - start.y;
    const rect = panelRef.current?.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0 && typeof window !== "undefined" && window.innerWidth > 0 && window.innerHeight > 0) {
      const baseLeft = rect.left - start.offset.x;
      const baseTop = rect.top - start.offset.y;
      nextX = Math.max(8 - baseLeft, Math.min(window.innerWidth - rect.width - 8 - baseLeft, nextX));
      nextY = Math.max(8 - baseTop, Math.min(window.innerHeight - rect.height - 8 - baseTop, nextY));
    }
    setPanelOffset({ x: nextX, y: nextY });
  };
  const handleDragPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    dragStartRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  return (
    <div
      ref={panelRef}
      className={cn(
        "rounded-2xl border border-border/60 shadow-xl overflow-hidden will-change-transform",
        compact && "flex min-h-0 flex-col rounded-xl",
      )}
      role="region"
      aria-label={`Active route to ${toName}`}
      data-testid="route-steps-panel"
      style={{
        background: "var(--card)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        transform: `translate3d(${panelOffset.x}px, ${panelOffset.y}px, 0)`,
        ...(compact ? { height: `${mobilePanelHeight}px`, maxHeight: "calc(100dvh - 8rem)" } : {}),
      }}>
      {compact && (
        <div
          role="slider"
          tabIndex={0}
          aria-label="Resize route panel"
          aria-orientation="vertical"
          aria-valuemin={MOBILE_PANEL_MIN_HEIGHT}
          aria-valuemax={MOBILE_PANEL_MAX_HEIGHT}
          aria-valuenow={mobilePanelHeight}
          data-testid="route-panel-resize-handle"
          className="flex h-5 shrink-0 touch-none cursor-row-resize items-center justify-center bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerEnd}
          onPointerCancel={handleResizePointerEnd}
          onKeyDown={handleResizeKeyDown}
        >
          <span aria-hidden="true" className="h-1 w-10 rounded-full bg-muted-foreground/40" />
        </div>
      )}
      {/* Header — destination name + live indicator */}
      <div
        data-testid="route-panel-drag-handle"
        title="Drag to move route panel"
        className={cn("flex cursor-grab touch-none select-none items-center gap-2 px-3 py-2 active:cursor-grabbing", compact && "gap-1.5 px-2.5 py-1.5")}
        onPointerDown={handleDragPointerDown}
        onPointerMove={handleDragPointerMove}
        onPointerUp={handleDragPointerEnd}
        onPointerCancel={handleDragPointerEnd}
        style={{ background: modeColor }}
      >
        <Navigation className="h-3.5 w-3.5 text-white shrink-0" />
        <span data-testid="route-destination" className={cn("text-[11px] font-extrabold text-white truncate flex-1", compact && "text-[10px]")}>To {toName}</span>
        <span className="w-1.5 h-1.5 rounded-full bg-green-300 animate-pulse shrink-0" />
      </div>

      <p data-testid="active-route-source" className={cn("px-3 pt-2 text-[9px] font-semibold text-muted-foreground", compact && "px-2 pt-1.5 text-[8px]")}>
        {route.isAuthoredGraph
          ? "Following the admin-authored map paths"
          : route.isGraphBased
            ? "Following the built-in walkway graph"
            : "Approximate route — map path not published"}
      </p>

      {currentInstruction && (
        <p
          role="status"
          aria-live="polite"
          aria-atomic="true"
          data-testid="current-route-step"
          className="sr-only"
        >
          Current step: {currentInstruction}
        </p>
      )}

      {/* Step-by-step directions */}
      <div className={cn(
        "px-3 pt-2 pb-1 max-h-32 overflow-y-auto scrollbar-show-on-hover",
        compact && "min-h-0 flex-1 px-2 pt-1.5 max-h-none",
      )}>
        <div className="relative pl-4 border-l-2 border-primary/30 space-y-1.5">
          {visibleSteps.map(({ step, index: originalIndex, instruction }, i) => {
            const isFirst = i === 0;
            const isLast = i === visibleSteps.length - 1;
            const isActive = activeIndex === originalIndex;
            return (
              <div
                key={step.id}
                aria-current={isActive ? "step" : undefined}
                data-testid={isActive ? "active-route-step" : "route-step"}
                className={cn(
                  "relative flex items-start gap-2 rounded-lg transition-all",
                  isActive && "bg-primary/10 ring-1 ring-primary/30 px-1.5 -mx-1.5 py-1"
                )}
              >
                <span className={cn(
                  "absolute -left-[11px] w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0",
                  stepDot(isFirst, isLast)
                )}>
                  {isFirst ? <Flag className="h-2 w-2 text-white" /> : isLast ? <CircleCheck className="h-2 w-2 text-white" /> : null}
                </span>
                <StepIcon icon={step.icon} />
                <div className="min-w-0 flex-1">
                  <p className={cn(
                    "text-[10px] leading-snug pt-0.5",
                    isLast ? "font-bold text-foreground" : "text-muted-foreground"
                  )}>
                    {instruction}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className={cn("flex items-center gap-1.5 px-3 pb-2.5", compact && "gap-1 px-2 pb-2")}>
        <button
          onClick={onEnd}
          className={cn("flex-1 h-7 rounded-lg border border-destructive/30 text-destructive text-[10px] font-bold hover:bg-destructive/10 transition-colors", compact && "h-8")}
        >
          End
        </button>
        {onReplay && (
          <button
            onClick={onReplay}
            className={cn("h-7 px-2 rounded-lg border border-border text-muted-foreground flex items-center gap-1 hover:bg-muted transition-colors", compact && "h-8 px-1.5")}
            title="Replay walk animation"
            aria-label="Replay walk animation"
          >
            <RotateCcw className="h-3 w-3" />
            <span className="text-[10px] font-bold hidden sm:inline">Replay</span>
          </button>
        )}
        <button
          onClick={onZoom}
          className={cn("w-7 h-7 rounded-lg border border-border text-muted-foreground flex items-center justify-center hover:bg-muted transition-colors", compact && "h-8 w-8")}
          title="Zoom to route"
          aria-label="Zoom to route"
        >
          <Maximize2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

import {
  Navigation, Flag, Footprints, ArrowUp, MoveVertical, DoorOpen,
  CircleCheck, Info, Maximize2, RotateCcw,
} from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { PlannedRoute, RouteMode, RouteStepIcon } from "../../lib/routePlanner";
import { cn } from "../../lib/utils";

const MOBILE_PANEL_MIN_HEIGHT = 190;
const MOBILE_PANEL_DEFAULT_HEIGHT = 300;
const MOBILE_PANEL_MAX_HEIGHT = 560;
const MOBILE_PANEL_TOP_CLEARANCE = 120;

interface RouteStepsPanelProps {
  route: PlannedRoute;
  mode: RouteMode;
  toName: string;
  originRoomName?: string;
  originBuildingName?: string;
  destinationRoomName?: string;
  destinationBuildingName?: string;
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
    phase?: "origin-indoor" | "outdoor" | "destination-indoor";
  };
  /** Full-width, resizable mobile navigation sheet. */
  compact?: boolean;
  /** Temporarily hide route details while another mobile map picker is open. */
  minimized?: boolean;
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
  route, mode, toName, originRoomName, originBuildingName, destinationRoomName,
  destinationBuildingName, onEnd, onZoom, walkProgress, onReplay, activeLeg, compact = false, minimized = false,
}: RouteStepsPanelProps) {
  const [mobilePanelHeight, setMobilePanelHeight] = useState(MOBILE_PANEL_DEFAULT_HEIGHT);
  const [mobilePanelMaxHeight, setMobilePanelMaxHeight] = useState(MOBILE_PANEL_MAX_HEIGHT);
  const [panelOffset, setPanelOffset] = useState({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);
  const resizeStartRef = useRef<{ y: number; height: number } | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; offset: { x: number; y: number } } | null>(null);
  const steps = [...route.steps];
  const instructionKey = (instruction: string) => instruction.trim().toLowerCase().replace(/[.!?]+$/, "");
  const baseStepCounts = new Map<string, number>();
  steps.forEach((step) => {
    const key = instructionKey(step.instruction);
    baseStepCounts.set(key, (baseStepCounts.get(key) ?? 0) + 1);
  });
  const matchedBaseInstructions = new Set<string>();
  const supplementalInstructions = new Set<string>();
  const missingOriginSteps: PlannedRoute["steps"] = [];
  const missingDestinationStartSteps: PlannedRoute["steps"] = [];
  const missingDestinationSteps: PlannedRoute["steps"] = [];
  const missingDestinationEndSteps: PlannedRoute["steps"] = [];
  const keepIfMissing = (step: PlannedRoute["steps"][number], target: PlannedRoute["steps"]) => {
    const key = instructionKey(step.instruction);
    const count = baseStepCounts.get(key) ?? 0;
    if (count > 0) {
      baseStepCounts.set(key, count - 1);
      matchedBaseInstructions.add(key);
      return;
    }
    if (matchedBaseInstructions.has(key) || supplementalInstructions.has(key)) return;
    target.push(step);
    supplementalInstructions.add(key);
  };
  const indoorSegments = route.indoorSegments ?? [];
  const hasOriginIndoorLeg = indoorSegments.some((segment) => !segment.afterOutdoor)
    || activeLeg?.phase === "origin-indoor";
  const hasDestinationIndoorLeg = indoorSegments.some((segment) => Boolean(segment.afterOutdoor))
    || activeLeg?.phase === "destination-indoor";
  if (originRoomName && hasOriginIndoorLeg) {
    keepIfMissing({
      id: "route-origin-room-start",
      icon: "start",
      instruction: `Start at the door of ${originRoomName}.`,
    }, missingOriginSteps);
  }
  if (destinationRoomName && destinationBuildingName && hasDestinationIndoorLeg) {
    keepIfMissing({
      id: "route-destination-room-enter",
      icon: "enter",
      instruction: `Enter ${destinationBuildingName} building.`,
    }, missingDestinationStartSteps);
  }
  const collectActiveIndoorSteps = (phase: "origin-indoor" | "destination-indoor") => {
    if (activeLeg?.phase !== phase) return;
    const isBeforePath = (icon: PlannedRoute["steps"][number]["icon"]) =>
      phase === "origin-indoor" ? icon === "start" : icon === "enter";
    activeLeg.steps.filter((step) => isBeforePath(step.icon)).forEach((step) => {
      keepIfMissing(
        step,
        phase === "origin-indoor" ? missingOriginSteps : missingDestinationStartSteps,
      );
    });
  };
  collectActiveIndoorSteps("origin-indoor");
  collectActiveIndoorSteps("destination-indoor");
  const appendIndoorSegmentSteps = (afterOutdoor: boolean) => {
    const segments = indoorSegments.filter((segment) => Boolean(segment.afterOutdoor) === afterOutdoor);
    const target = afterOutdoor ? missingDestinationSteps : missingOriginSteps;
    segments.forEach((segment, index) => {
      segment.steps.forEach((step) => keepIfMissing(step, target));
      const next = segments[index + 1];
      const transition = next && segment.floorId && next.floorId
        && segment.buildingId === next.buildingId
        && route.transitionDetails?.find((candidate) =>
        candidate.fromFloorId === segment.floorId && candidate.toFloorId === next.floorId,
      );
      if (!transition) return;
      const targetFloor = next.floorNumber === undefined
        ? "the connected floor"
        : next.floorNumber === 1 ? "Ground Floor" : `Floor ${next.floorNumber}`;
      const place = transition.label.trim() || (transition.kind === "elevator" ? "elevator" : "stairs");
      const lowerPlace = place.toLowerCase();
      const hasArticle = lowerPlace.startsWith("the ") || lowerPlace.startsWith("a ") || lowerPlace.startsWith("an ");
      const articlePlace = hasArticle ? place : `the ${place}`;
      const direction = segment.floorNumber !== undefined && next.floorNumber !== undefined
        ? next.floorNumber > segment.floorNumber ? " up" : " down"
        : "";
      const instruction = transition.kind === "elevator"
        ? `Take ${articlePlace} to ${targetFloor}.`
        : `Take ${articlePlace}${direction} to ${targetFloor}.`;
      keepIfMissing({
        id: `route-transition-${transition.nodeId}`,
        icon: transition.kind === "elevator" ? "elevator" : "stairs",
        instruction,
      }, target);
    });
  };
  appendIndoorSegmentSteps(false);
  appendIndoorSegmentSteps(true);
  if (activeLeg?.phase === "origin-indoor" || activeLeg?.phase === "destination-indoor") {
    const target = activeLeg.phase === "origin-indoor" ? missingOriginSteps : missingDestinationSteps;
    activeLeg.steps.filter((step) => ["walk", "stairs", "elevator"].includes(step.icon)).forEach((step) => {
      keepIfMissing(step, target);
    });
  }
  const collectActiveIndoorAfterSteps = (phase: "origin-indoor" | "destination-indoor") => {
    if (activeLeg?.phase !== phase) return;
    const isAfterPath = (icon: PlannedRoute["steps"][number]["icon"]) =>
      phase === "origin-indoor" ? icon === "enter" : icon === "arrive";
    activeLeg.steps.filter((step) => isAfterPath(step.icon)).forEach((step) => {
      keepIfMissing(
        step,
        phase === "origin-indoor" ? missingOriginSteps : missingDestinationEndSteps,
      );
    });
  };
  collectActiveIndoorAfterSteps("origin-indoor");
  collectActiveIndoorAfterSteps("destination-indoor");
  if (originRoomName && originBuildingName && hasOriginIndoorLeg
    && route.steps.some((step) => step.instruction.toLowerCase().includes("campus path"))) {
    keepIfMissing({
      id: "route-origin-room-exit",
      icon: "enter",
      instruction: `Exit ${originBuildingName} building.`,
    }, missingOriginSteps);
  }
  if (destinationRoomName && destinationBuildingName && hasDestinationIndoorLeg) {
    keepIfMissing({
      id: "route-destination-room-arrive",
      icon: "arrive",
      instruction: `Arrive at ${destinationRoomName}.`,
    }, missingDestinationEndSteps);
  } else if (route.steps.some((step) => step.instruction.toLowerCase().includes("campus path"))) {
    keepIfMissing({
      id: "route-building-arrive",
      icon: "arrive",
      instruction: `Arrive at ${toName}.`,
    }, missingDestinationEndSteps);
  }
  const campusStepIndex = steps.findIndex((step) => step.instruction.toLowerCase().includes("campus path"));
  const sourceExitIndex = steps.findIndex((step) => /^exit\b/i.test(step.instruction));
  const originInsertIndex = sourceExitIndex >= 0
    ? sourceExitIndex
    : campusStepIndex >= 0 ? campusStepIndex : steps.length;
  steps.splice(originInsertIndex, 0, ...missingOriginSteps);
  const updatedCampusIndex = steps.findIndex((step) => step.instruction.toLowerCase().includes("campus path"));
  const destinationStartIndex = updatedCampusIndex >= 0 ? updatedCampusIndex + 1 : 0;
  const destinationFirstStepIndex = steps.findIndex((step, index) =>
    index >= destinationStartIndex && /^(enter|follow the indoor path|take )\b/i.test(step.instruction),
  );
  steps.splice(
    destinationFirstStepIndex >= 0 ? destinationFirstStepIndex : destinationStartIndex,
    0,
    ...missingDestinationStartSteps,
  );
  const destinationArrivalIndex = steps.findIndex((step, index) =>
    index >= destinationStartIndex && /^arrive\b/i.test(step.instruction),
  );
  const destinationInsertIndex = destinationArrivalIndex >= 0 ? destinationArrivalIndex : steps.length;
  steps.splice(destinationInsertIndex, 0, ...missingDestinationSteps);
  const updatedDestinationArrivalIndex = steps.findIndex((step, index) =>
    index >= destinationStartIndex && /^arrive\b/i.test(step.instruction),
  );
  steps.splice(
    updatedDestinationArrivalIndex >= 0 ? updatedDestinationArrivalIndex : steps.length,
    0,
    ...missingDestinationEndSteps,
  );
  const modeColor =
    mode === "accessible" ? "#16a34a" : mode === "emergency" ? "#dc2626" : "var(--primary)";
  const legStepIndex = activeLeg?.steps.length
    ? activeStepIndex(activeLeg.steps, activeLeg.progress, activeLeg.distanceM)
    : null;
  const legStep = legStepIndex === null ? undefined : activeLeg?.steps[legStepIndex];
  const normalizeInstruction = instructionKey;
  const routeCampusStepIndex = steps.findIndex((step) => /\bcampus path\b/i.test(step.instruction));
  const activeLegRouteIndex = legStep
    ? steps.findIndex((step, index) => {
        if (normalizeInstruction(step.instruction) !== normalizeInstruction(legStep.instruction)) return false;
        if (activeLeg?.phase === "origin-indoor") return routeCampusStepIndex < 0 || index < routeCampusStepIndex;
        if (activeLeg?.phase === "destination-indoor") return routeCampusStepIndex < 0 || index > routeCampusStepIndex;
        if (activeLeg?.phase === "outdoor") return step.id === legStep.id || index === routeCampusStepIndex;
        return true;
      })
    : -1;
  const activeIndex = activeLegRouteIndex >= 0
    ? activeLegRouteIndex
    : typeof walkProgress === "number"
      ? activeStepIndex(steps, walkProgress, route.dist)
      : steps.length > 0 ? 0 : null;
  const currentInstruction = activeLeg?.statusInstruction
    ? presentInstruction(activeLeg.statusInstruction)
    : activeIndex !== null && steps[activeIndex]
      ? presentInstruction(steps[activeIndex].instruction)
      : undefined;
  const visibleSteps = steps
    .map((step, index) => ({ step, index, instruction: presentInstruction(step.instruction) }))
    .filter(({ instruction }) => Boolean(instruction));
  const clampMobilePanelHeight = (height: number, maximum = mobilePanelMaxHeight) => Math.min(
    maximum,
    Math.max(MOBILE_PANEL_MIN_HEIGHT, height),
  );
  useEffect(() => {
    if (!compact) return;
    const mapSurface = panelRef.current?.closest("[data-testid='student-map-surface']") as HTMLElement | null;
    const updateMaxHeight = () => {
      const availableHeight = mapSurface
        ? mapSurface.clientHeight - MOBILE_PANEL_TOP_CLEARANCE
        : window.innerHeight - MOBILE_PANEL_TOP_CLEARANCE;
      setMobilePanelMaxHeight(Math.max(
        MOBILE_PANEL_MIN_HEIGHT,
        Math.min(MOBILE_PANEL_MAX_HEIGHT, Math.floor(availableHeight)),
      ));
    };
    updateMaxHeight();
    const observer = mapSurface && typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(updateMaxHeight)
      : null;
    if (mapSurface) observer?.observe(mapSurface);
    window.addEventListener("resize", updateMaxHeight);
    window.visualViewport?.addEventListener("resize", updateMaxHeight);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateMaxHeight);
      window.visualViewport?.removeEventListener("resize", updateMaxHeight);
    };
  }, [compact]);
  useEffect(() => {
    setMobilePanelHeight((height) => Math.min(mobilePanelMaxHeight, Math.max(MOBILE_PANEL_MIN_HEIGHT, height)));
  }, [mobilePanelMaxHeight]);
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
      setMobilePanelHeight(mobilePanelMaxHeight);
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
        compact && "flex w-full min-h-0 flex-col rounded-t-2xl rounded-b-none transition-[height] duration-200 ease-out motion-reduce:duration-0",
      )}
      role="region"
      aria-label={`Active route to ${toName}`}
      data-testid="route-steps-panel"
      style={{
        background: "var(--card)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        transform: compact ? undefined : `translate3d(${panelOffset.x}px, ${panelOffset.y}px, 0)`,
        ...(compact ? {
          height: `${minimized ? 44 : mobilePanelHeight}px`,
          maxHeight: `${mobilePanelMaxHeight}px`,
        } : {}),
        boxSizing: "border-box",
        width: compact ? "100%" : undefined,
        touchAction: compact ? "auto" : undefined,
      }}>
      {compact && !minimized && (
        <div
          role="slider"
          tabIndex={0}
          aria-label="Resize route panel"
          aria-orientation="vertical"
          aria-valuemin={MOBILE_PANEL_MIN_HEIGHT}
          aria-valuemax={mobilePanelMaxHeight}
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
        className={cn("flex cursor-grab touch-none select-none items-center gap-2 px-3 py-2 active:cursor-grabbing", compact && "cursor-default touch-auto gap-1.5 px-2.5 py-1.5")}
        onPointerDown={compact ? undefined : handleDragPointerDown}
        onPointerMove={compact ? undefined : handleDragPointerMove}
        onPointerUp={compact ? undefined : handleDragPointerEnd}
        onPointerCancel={compact ? undefined : handleDragPointerEnd}
        style={{ background: modeColor }}
      >
        <Navigation className="h-3.5 w-3.5 text-white shrink-0" />
        <span data-testid="route-destination" className={cn("text-[11px] font-extrabold text-white truncate flex-1", compact && "text-[10px]")}>To {toName}</span>
        <span className="w-1.5 h-1.5 rounded-full bg-green-300 animate-pulse shrink-0" />
      </div>

      {!minimized && <div
        data-testid="active-route-source"
        className={cn(
          "mx-3 mt-2 mb-1 inline-flex w-fit max-w-[calc(100%-1.5rem)] items-center gap-1.5 rounded-full border border-primary/15 bg-primary/[0.06] px-2.5 py-1 text-[10px] font-semibold leading-none text-primary",
          compact && "mt-1.5 text-[10px]",
        )}
      >
        <Footprints aria-hidden="true" className="h-3 w-3 shrink-0 opacity-80" />
        <span className="min-w-0 truncate">
          {route.isAuthoredGraph
            ? "Following the admin-authored map paths"
            : route.isGraphBased
              ? "Following the built-in walkway graph"
              : "Approximate route — map path not published"}
        </span>
      </div>}

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
      {!minimized && <div className={cn(
        "px-3 pt-2 pb-1 max-h-32 overflow-y-auto scrollbar-show-on-hover",
        compact && "min-h-0 flex-1 px-3 pt-1.5 max-h-none",
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
                  isActive && "bg-primary/10 ring-1 ring-primary/30 px-1.5 py-1",
                  compact && "px-2.5 py-1.5",
                )}
              >
                <span className={cn(
                  "absolute -left-6 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0",
                  stepDot(isFirst, isLast)
                )}>
                  {isFirst ? <Flag className="h-2 w-2 text-white" /> : isLast ? <CircleCheck className="h-2 w-2 text-white" /> : null}
                </span>
                <StepIcon icon={step.icon} />
                <div className="min-w-0 flex-1">
                  <p className={cn(
                    "text-[10px] leading-snug pt-0.5",
                    isLast ? "font-bold text-foreground" : "text-muted-foreground",
                    compact && "text-xs leading-normal",
                  )}>
                    {instruction}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>}

      {/* Actions */}
      {!minimized && <div className={cn("flex items-center gap-1.5 px-3 pb-2.5", compact && "gap-1 px-2 pb-2")}>
        <button
          onClick={onEnd}
          className={cn("flex-1 h-7 rounded-lg border border-destructive/30 text-destructive text-[10px] font-bold hover:bg-destructive/10 transition-colors", compact && "h-8")}
        >
          End
        </button>
        {onReplay && (
          <button
            onClick={onReplay}
            className={cn("h-7 min-w-7 rounded-lg border border-border text-muted-foreground flex items-center justify-center gap-1 px-2 hover:bg-muted transition-colors", compact && "h-8 min-w-8 px-1.5")}
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
      </div>}
    </div>
  );
}

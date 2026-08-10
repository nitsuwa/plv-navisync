import {
  Navigation, Flag, Footprints, ArrowUp, MoveVertical, DoorOpen,
  CircleCheck, Info, Maximize2, Accessibility, RotateCcw,
} from "lucide-react";
import type { PlannedRoute, RouteMode, RouteStepIcon } from "../../lib/routePlanner";
import { formatDistance, formatMinutes } from "../../lib/routePlanner";
import { cn } from "../../lib/utils";

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
  const traveled = progress * totalDist;
  let acc = 0;
  for (let i = 0; i < steps.length; i++) {
    acc += steps[i].distanceM ?? 0;
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

/**
 * Turn-by-turn navigation panel — shows total distance/ETA, every step with
 * an icon and distance, and floor-transition badges. Positioned by the parent
 * (desktop bottom-left card, mobile sheet).
 */
export function RouteStepsPanel({
  route, mode, toName, onEnd, onZoom, walkProgress, onReplay,
}: RouteStepsPanelProps) {
  const steps = route.steps;
  const modeColor =
    mode === "accessible" ? "#16a34a" : mode === "emergency" ? "#dc2626" : "var(--primary)";
  const activeIndex =
    typeof walkProgress === "number"
      ? activeStepIndex(steps, walkProgress, route.dist)
      : null;

  return (
    <div className="rounded-2xl border border-border/60 shadow-xl overflow-hidden animate-slide-up"
      style={{ background: "var(--card)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}>
      {/* Header — destination name + live indicator */}
      <div className="flex items-center gap-2 px-3 py-2" style={{ background: modeColor }}>
        <Navigation className="h-3.5 w-3.5 text-white shrink-0" />
        <span className="text-[11px] font-extrabold text-white truncate flex-1">{toName}</span>
        <span className="w-1.5 h-1.5 rounded-full bg-green-300 animate-pulse shrink-0" />
      </div>

      {/* Stats row: distance, time, mode */}
      <div className="flex gap-2 px-3 pt-2.5 pb-2 border-b border-border">
        <div className="flex-1 px-2 py-1.5 rounded-lg bg-primary/8 text-center">
          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Dist</p>
          <p className="text-sm font-extrabold text-foreground">{formatDistance(route.dist)}</p>
        </div>
        <div className="flex-1 px-2 py-1.5 rounded-lg bg-primary/8 text-center">
          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Time</p>
          <p className="text-sm font-extrabold text-foreground">{formatMinutes(route.mins)}</p>
        </div>
        <div className="flex-1 px-2 py-1.5 rounded-lg bg-primary/8 text-center">
          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Via</p>
          <p className="text-sm font-extrabold text-foreground">
            {mode === "accessible" ? <Accessibility className="h-4 w-4 inline-block align-middle" /> :
             mode === "emergency" ? "SOS" : "Walk"}
          </p>
        </div>
      </div>

      {/* Floor-transition badges */}
      {route.transitions.length > 0 && (
        <div className="px-3 pt-2 flex flex-col gap-1">
          {route.transitions.map((t, i) => (
            <div key={`tr-${i}`} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-700 dark:text-purple-400">
              <MoveVertical className="h-3 w-3 shrink-0" />
              <span className="text-[10px] font-bold">{t}</span>
            </div>
          ))}
        </div>
      )}

      {/* Step-by-step directions */}
      <div className="px-3 pt-2 pb-1 max-h-32 overflow-y-auto scrollbar-show-on-hover">
        <div className="relative pl-4 border-l-2 border-primary/30 space-y-1.5">
          {steps.map((step, i) => {
            const isFirst = i === 0;
            const isLast = i === steps.length - 1;
            const isActive = activeIndex === i;
            return (
              <div
                key={step.id}
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
                    {step.instruction}
                  </p>
                  {step.distanceM !== undefined && (
                    <span className="text-[10px] text-muted-foreground font-semibold">
                      {formatDistance(step.distanceM)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 px-3 pb-2.5">
        <button
          onClick={onEnd}
          className="flex-1 h-7 rounded-lg border border-destructive/30 text-destructive text-[10px] font-bold hover:bg-destructive/10 transition-colors"
        >
          End
        </button>
        {onReplay && (
          <button
            onClick={onReplay}
            className="h-7 px-2 rounded-lg border border-border text-muted-foreground flex items-center gap-1 hover:bg-muted transition-colors"
            title="Replay walk animation"
            aria-label="Replay walk animation"
          >
            <RotateCcw className="h-3 w-3" />
            <span className="text-[10px] font-bold hidden sm:inline">Replay</span>
          </button>
        )}
        <button
          onClick={onZoom}
          className="w-7 h-7 rounded-lg border border-border text-muted-foreground flex items-center justify-center hover:bg-muted transition-colors"
          title="Zoom to route"
          aria-label="Zoom to route"
        >
          <Maximize2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

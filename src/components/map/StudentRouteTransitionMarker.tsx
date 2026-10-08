import { RouteTransitionMarker, type TransitionMarkerViewport } from "../map-builder/RouteTransitionMarker";
import type { TestRouteContext, TestRouteTransitionMarker as AdminTransitionMarker } from "../map-builder/TestNavigationPanel";
import type { StudentRouteTransitionKind } from "../../lib/studentRouteFlow";

interface StudentRouteTransitionMarkerProps {
  x: number;
  y: number;
  kind: StudentRouteTransitionKind;
  label: string;
  markerId?: string;
  reducedMotion?: boolean;
  /** Preview cues stay passive; the active route cue executes its transition. */
  active?: boolean;
  onActivate?: () => void;
  context?: TestRouteContext;
  targetContext?: TestRouteContext;
  zoom?: number;
  viewport?: TransitionMarkerViewport;
}

/** Student adapter around the Admin Test Route transition renderer. */
export function StudentRouteTransitionMarker({
  x,
  y,
  kind,
  label,
  markerId,
  reducedMotion = false,
  active = true,
  onActivate,
  context,
  targetContext,
  zoom = 1,
  viewport,
}: StudentRouteTransitionMarkerProps) {
  const markerKind: AdminTransitionMarker["kind"] = kind === "enter_building" || kind === "exit_building"
    ? "entrance"
    : kind === "stairs" ? "stair" : "elevator";
  const fromContext = context ?? (kind === "exit_building" ? { kind: "floor" as const } : { kind: "outdoor" as const });
  const toContext = targetContext ?? (kind === "enter_building" ? { kind: "floor" as const } : kind === "exit_building" ? { kind: "outdoor" as const } : { kind: "floor" as const });
  const direction = /\bdown\b/i.test(label) ? "down" : /\bup\b/i.test(label) ? "up" : undefined;
  const targetLabel = label.match(/\b(?:to|up to|down to)\s+(.+?)(?:[.!?]|$)/i)?.[1];
  const shortTarget = targetLabel?.replace(/\s+building$/i, "");
  const directionLabel = direction === "down" ? "Down" : direction === "up" ? "Up" : "";
  const displayInstruction = kind === "enter_building"
    ? `Enter ${(label.replace(/^enter\s+/i, "").replace(/\s+building$/i, "").replace(/[.!?]$/, ""))}`
    : kind === "exit_building" ? "Exit to Campus"
      : kind === "elevator" ? `Elevator${shortTarget ? ` · ${shortTarget}` : ""}`
        : `Stairs${directionLabel ? ` ${directionLabel}` : ""}${shortTarget ? ` · ${shortTarget}` : ""}`;
  const studentPassiveLabel = kind === "elevator" ? "Elevator"
    : kind === "stairs" ? `Stairs${directionLabel ? ` ${directionLabel}` : ""}`
      : undefined;
  const marker: AdminTransitionMarker = {
    id: markerId ?? `${kind}:${x}:${y}`,
    x,
    y,
    kind: markerKind,
    context: fromContext,
    targetContext: toContext,
    ...(targetLabel ? { targetLabel } : {}),
    ...(direction ? { direction } : {}),
    instruction: label,
  };

  return (
    <g data-testid={active ? "student-active-transition-marker" : "student-route-preview-transition-marker"}
      data-student-marker-layer="route-transition-cues"
      data-student-transition-kind={kind} data-transition-id={marker.id}>
      <RouteTransitionMarker
        marker={marker}
        zoom={zoom}
        viewport={viewport}
        reducedMotion={reducedMotion}
        studentRouteCue
        showLabel={active}
        screenSpaceHitTarget={active}
        studentInteractionFeedback={active}
        displayInstruction={displayInstruction}
        studentPassiveLabel={studentPassiveLabel}
        onClick={active && onActivate ? () => onActivate() : undefined}
      />
    </g>
  );
}

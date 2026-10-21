import { RouteTransitionMarker, type TransitionMarkerViewport } from "../map-builder/RouteTransitionMarker";
import type { TestRouteContext, TestRouteTransitionMarker as AdminTransitionMarker } from "../map-builder/TestNavigationPanel";
import type { SyntheticEvent } from "react";
import type { StudentRouteExploreTransitionChoice, StudentRouteTransitionKind } from "../../lib/studentRouteFlow";
import { StudentExploreTransitionChoiceControl } from "./StudentExploreTransitionChoiceControl";

interface StudentRouteTransitionMarkerProps {
  x: number;
  y: number;
  kind: StudentRouteTransitionKind;
  label: string;
  displayLabel?: string;
  markerId?: string;
  reducedMotion?: boolean;
  /** Preview cues stay passive; the active route cue executes its transition. */
  active?: boolean;
  onActivate?: () => void;
  context?: TestRouteContext;
  targetContext?: TestRouteContext;
  zoom?: number;
  viewport?: TransitionMarkerViewport;
  choices?: readonly StudentRouteExploreTransitionChoice[];
}

export function studentRouteTransitionViewportFromCamera({
  width,
  height,
  zoom,
  center,
  pan,
  contentOffset = { x: 0, y: 0 },
  screenSpaceScale = 1,
}: {
  width: number;
  height: number;
  zoom: number;
  center: { x: number; y: number };
  pan: { x: number; y: number };
  contentOffset?: { x: number; y: number };
  screenSpaceScale?: number;
}): TransitionMarkerViewport {
  const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  return {
    width,
    height,
    screenSpaceScale: Number.isFinite(screenSpaceScale) && screenSpaceScale > 0 ? screenSpaceScale : 1,
    pan: {
      x: center.x * (1 - scale) + pan.x + contentOffset.x * scale,
      y: center.y * (1 - scale) + pan.y + contentOffset.y * scale,
    },
  };
}

/** Student adapter around the Admin Test Route transition renderer. */
export function StudentRouteTransitionMarker({
  x,
  y,
  kind,
  label,
  displayLabel,
  markerId,
  reducedMotion = false,
  active = true,
  onActivate,
  context,
  targetContext,
  zoom = 1,
  viewport,
  choices = [],
}: StudentRouteTransitionMarkerProps) {
  const groupedChoices = choices.length > 1;
  const markerKind: AdminTransitionMarker["kind"] = kind === "enter_building" || kind === "exit_building"
    ? "entrance"
    : kind === "stairs" ? "stair" : "elevator";
  const fromContext = context ?? (kind === "exit_building" ? { kind: "floor" as const } : { kind: "outdoor" as const });
  const toContext = targetContext ?? (kind === "enter_building" ? { kind: "floor" as const } : kind === "exit_building" ? { kind: "outdoor" as const } : { kind: "floor" as const });
  const direction = /\bdown(?:stairs)?\b/i.test(label) ? "down" : /\bup(?:stairs)?\b/i.test(label) ? "up" : undefined;
  const continuingStairs = kind === "stairs" && /\bcontinue\b/i.test(label);
  const targetLabel = label.match(/\b(?:to|up to|down to)\s+(.+?)(?:[.!?]|$)/i)?.[1];
  const shortTarget = targetLabel?.replace(/\s+building$/i, "");
  const directionLabel = direction === "down" ? "Down" : direction === "up" ? "Up" : "";
  const computedDisplayInstruction = kind === "enter_building"
    ? `Enter ${(label.replace(/^enter\s+/i, "").replace(/\s+building$/i, "").replace(/[.!?]$/, ""))}`
    : kind === "exit_building" ? "Exit to Campus"
      : kind === "elevator" ? `Elevator${directionLabel ? ` ${directionLabel}` : ""}${shortTarget ? ` · ${shortTarget}` : ""}`
        : `${continuingStairs ? `Continue ${direction === "down" ? "Downstairs" : "Upstairs"}` : `Stairs${directionLabel ? ` ${directionLabel}` : ""}`}${shortTarget ? ` · ${shortTarget}` : ""}`;
  const resolvedDisplayInstruction = displayLabel ?? computedDisplayInstruction;
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

  if (groupedChoices) {
    const stopPointer = (event: SyntheticEvent) => {
      event.stopPropagation();
    };
    return (
      <g
        data-testid="student-active-transition-marker"
        data-student-marker-layer="route-transition-cues"
        data-student-transition-kind={kind}
        data-transition-id={marker.id}
        data-transition-choice-count={choices.length}
      >
        <g transform={`translate(${x} ${y})`} className="student-map-screen-marker">
          <foreignObject x={-22} y={-22} width={44} height={44}>
            <div
              className="h-11 w-11"
              onPointerDown={stopPointer}
              onClick={stopPointer}
            >
              <StudentExploreTransitionChoiceControl
                kind={kind}
                choices={choices}
                testId="student-explore-transition-marker"
              />
            </div>
          </foreignObject>
        </g>
      </g>
    );
  }

  // A one-choice Explore group keeps the compact direct-action marker. The
  // page may only have supplied `choices` (rather than a duplicate callback)
  // so retain that cue's view-only action instead of rendering a passive cue.
  const directExploreAction = choices.length === 1 ? choices[0]?.onActivate : undefined;

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
        displayInstruction={resolvedDisplayInstruction}
        studentPassiveLabel={studentPassiveLabel}
        onClick={active && (onActivate || directExploreAction)
          ? () => (onActivate ?? directExploreAction)?.()
          : undefined}
      />
    </g>
  );
}

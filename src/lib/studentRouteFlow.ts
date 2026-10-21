import type { PlannedRoute, RouteContextHandoff, RouteContextLeg, RouteIndoorSegment, RouteStep, RouteTransitionDetail } from "./routePlanner";
import type { FloorPlan, NavigationEdge, NavigationNode } from "../components/map-builder/types";
import { pointAlongPolyline } from "./geo";

export type StudentRoutePhase = "idle" | "planning" | "preview" | "navigating" | "arrived";
export type StudentPlaybackState = "playing" | "paused";
export type StudentCameraMode = "follow" | "explore";
export type StudentRoutePrimaryAction = "continue-transition" | "resume" | "pause" | "done";

/** Resolve Follow's primary control from the active authored step and player
 * state. Unconfirmed physical handoffs use Continue; a paused, already
 * authorized vertical run resumes without asking for the same handoff again. */
export function studentRoutePrimaryAction(options: {
  phase: StudentRoutePhase;
  playback: StudentPlaybackState;
  hasAuthoredTransition: boolean;
  isArrival?: boolean;
  /** A previously authorized same-transition run was paused at a safe floor boundary. */
  hasAuthorizedVerticalRun?: boolean;
}): StudentRoutePrimaryAction {
  if (options.phase === "arrived" || options.isArrival) return "done";
  if (options.phase === "navigating" && options.playback === "paused" && options.hasAuthorizedVerticalRun) {
    return "resume";
  }
  if (options.phase === "navigating" && options.playback === "paused" && options.hasAuthoredTransition) {
    return "continue-transition";
  }
  return options.playback === "paused" ? "resume" : "pause";
}

/** Transition completion may resume only when the student has not explicitly
 * held the route for the Emergency Video Guide. */
export function studentRouteCanResumeAfterTransition(
  transitionResumeRequested: boolean,
  emergencyVideoPauseLatched: boolean,
): boolean {
  return transitionResumeRequested && !emergencyVideoPauseLatched;
}

export interface StudentRouteFocusTarget {
  context: "campus" | "floor";
  point: { x: number; y: number };
}

/** Keep emergency Assembly Point arrival framed at the route's actual endpoint,
 * even when the selected origin building remains in the planner state. */
export function studentRouteArrivalCameraPoint(
  route: Pick<PlannedRoute, "emergencyAssemblyPointId">,
  endpointPoint: { x: number; y: number },
  buildingCenter?: { x: number; y: number } | null,
  campusPlacePoint?: { x: number; y: number } | null,
): { x: number; y: number } {
  if (route.emergencyAssemblyPointId) return endpointPoint;
  return buildingCenter ?? campusPlacePoint ?? endpointPoint;
}

/** User-facing Floor name, preferring the published label over graph indices. */
export function studentRouteFloorLabel(
  segment?: Pick<RouteIndoorSegment, "floorNumber" | "floorLabel"> | null,
  fallback = "the next Floor",
): string {
  if (!segment) return fallback;
  return segment.floorLabel
    || (segment.floorNumber === undefined ? fallback : segment.floorNumber === 1 ? "Ground Floor" : `Floor ${segment.floorNumber}`);
}

/** Resolve Recenter from the same route progress used by the moving marker. */
export function studentRouteFocusAtProgress(
  phase: string,
  campusPoints: readonly { x: number; y: number }[],
  campusProgress: number,
  indoorSegment: RouteIndoorSegment | null | undefined,
  indoorProgress: number,
): StudentRouteFocusTarget {
  const floorContext = (phase === "origin-indoor" || phase === "destination-indoor") && indoorSegment;
  return floorContext
    ? { context: "floor", point: pointAlongPolyline(indoorSegment.waypoints, indoorProgress) }
    : { context: "campus", point: pointAlongPolyline(campusPoints, campusProgress) };
}

export interface StudentRouteUiState {
  phase: StudentRoutePhase;
  playback: StudentPlaybackState;
  resumePlaybackAfterExplore: StudentPlaybackState | null;
  camera: StudentCameraMode;
  collapsed: boolean;
}

/** Follow must restore the canonical route context before playback resumes. */
export function studentRouteFollowNeedsCameraReacquisition(input: {
  routeContextIsElsewhere: boolean;
  cameraDetached: boolean;
  cameraReacquiring: boolean;
}): boolean {
  return input.routeContextIsElsewhere || input.cameraDetached || input.cameraReacquiring;
}

/** While attached Follow owns framing; map selections must not steal its camera. */
export function studentRouteFollowOwnsCamera(input: {
  phase: StudentRoutePhase;
  camera: StudentCameraMode;
  cameraDetached: boolean;
}): boolean {
  return input.phase === "navigating" && input.camera === "follow" && !input.cameraDetached;
}

/** An authored handoff must remain paused until the student activates Continue. */
export function studentRoutePlaybackAfterCameraReacquisition(hasPendingTransition: boolean): StudentPlaybackState {
  return hasPendingTransition ? "paused" : "playing";
}

/** Preserve the required action when camera recovery returns to a handoff. */
export function studentRoutePauseReasonAfterCameraReacquisition(
  _resumePlayback: StudentPlaybackState | undefined,
  hasPendingTransition: boolean,
): "transition" | null {
  return hasPendingTransition ? "transition" : null;
}

export type StudentRouteUiAction =
  | { type: "OPEN_PLAN" }
  | { type: "FOUND_ROUTE"; preserveCamera?: boolean }
  | { type: "EDIT_ROUTE" }
  | { type: "CANCEL_ROUTE_EDIT"; restore: StudentRouteUiState }
  | { type: "START_NAVIGATION"; waitAtTransition?: boolean; camera?: StudentCameraMode }
  | { type: "SEEK_STEP" }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "ENTER_EXPLORE" }
  | { type: "SET_CAMERA_MODE"; camera: StudentCameraMode }
  | { type: "RESUME_EXPLORE" }
  | { type: "RECENTER"; resumePlayback?: StudentPlaybackState }
  | { type: "RECENTER_COMPLETE"; pauseAtTransition?: boolean }
  | { type: "COLLAPSE" }
  | { type: "EXPAND" }
  | { type: "END_NAVIGATION" }
  | { type: "ARRIVE" }
  | { type: "CLEAR_ROUTE" }
  | { type: "DONE" };

export const initialStudentRouteUiState: StudentRouteUiState = {
  phase: "idle",
  playback: "paused",
  resumePlaybackAfterExplore: null,
  camera: "follow",
  collapsed: false,
};

export function studentRouteUiReducer(state: StudentRouteUiState, action: StudentRouteUiAction): StudentRouteUiState {
  switch (action.type) {
    case "OPEN_PLAN":
      return { ...state, phase: "planning", playback: "paused", collapsed: false };
    case "FOUND_ROUTE":
      // A newly calculated route starts with Follow selected, regardless of
      // camera exploration performed before planning or in an older session.
      // A route alternative within the current session may explicitly retain
      // the selected mode while its candidate and instructions are replaced.
      return {
        ...state,
        phase: "preview",
        playback: "paused",
        resumePlaybackAfterExplore: null,
        camera: action.preserveCamera ? state.camera : "follow",
        collapsed: false,
      };
    case "EDIT_ROUTE":
      return { ...state, phase: "planning", playback: "paused", collapsed: false };
    case "CANCEL_ROUTE_EDIT":
      return state.phase === "planning" ? action.restore : state;
    case "START_NAVIGATION":
      {
        const camera = action.camera ?? state.camera;
        const playback = action.waitAtTransition || camera === "explore" ? "paused" : "playing";
        return {
          ...state,
          phase: "navigating",
          playback,
          // Starting in Explore is an explicit pause of simulated movement.
          // Remember the intended Follow state so an explicit return to Follow
          // begins the route without resetting its canonical cursor.
          resumePlaybackAfterExplore: camera === "explore" && !action.waitAtTransition ? "playing" : null,
          camera,
          collapsed: true,
        };
      }
    case "SEEK_STEP":
      return state.phase === "navigating"
        ? { ...state, playback: "paused", resumePlaybackAfterExplore: null }
        : state;
    case "PAUSE":
      return state.phase === "navigating"
        ? state.camera === "explore"
          ? { ...state, playback: "paused", resumePlaybackAfterExplore: "paused" }
          : { ...state, playback: "paused", resumePlaybackAfterExplore: null }
        : state;
    case "RESUME":
      return state.phase === "navigating"
        ? state.camera === "explore"
          ? { ...state, playback: "paused", resumePlaybackAfterExplore: "playing" }
          : { ...state, playback: "playing" }
        : state;
    case "ENTER_EXPLORE":
      return state.phase === "navigating" && state.camera !== "explore"
        ? { ...state, camera: "explore", resumePlaybackAfterExplore: state.playback, playback: "paused" }
        : state;
    case "SET_CAMERA_MODE":
      if (action.camera === state.camera) return state;
      if (state.phase !== "navigating") return { ...state, camera: action.camera };
      if (action.camera === "explore") {
        return {
          ...state,
          camera: "explore",
          playback: "paused",
          resumePlaybackAfterExplore: state.playback,
        };
      }
      return {
        ...state,
        camera: "follow",
        playback: state.resumePlaybackAfterExplore ?? state.playback,
        resumePlaybackAfterExplore: null,
      };
    case "RESUME_EXPLORE":
      return state.phase === "navigating" && state.camera === "explore"
        ? { ...state, playback: "paused", resumePlaybackAfterExplore: "playing" }
        : state;
    case "RECENTER":
      return state.phase === "navigating"
        ? {
            ...state,
            camera: "follow",
            // Keep the route still while the camera returns to the canonical
            // cursor. Playback resumes only when the active renderer reports
            // that its camera reacquisition has completed.
            playback: "paused",
            resumePlaybackAfterExplore: action.resumePlayback ?? state.resumePlaybackAfterExplore ?? state.playback,
          }
        : state;
    case "RECENTER_COMPLETE":
      return state.phase === "navigating" && state.camera === "follow"
        ? {
            ...state,
            playback: action.pauseAtTransition ? "paused" : state.resumePlaybackAfterExplore ?? state.playback,
            resumePlaybackAfterExplore: null,
          }
        : state;
    case "COLLAPSE":
      return state.phase === "planning" ? state : { ...state, collapsed: true };
    case "EXPAND":
      return { ...state, collapsed: false };
    case "END_NAVIGATION":
      return { ...state, phase: "preview", playback: "paused", resumePlaybackAfterExplore: null, collapsed: false };
    case "ARRIVE":
      return state.phase === "navigating"
        ? { ...state, phase: "arrived", playback: "paused", resumePlaybackAfterExplore: null, collapsed: false }
        : state;
    case "CLEAR_ROUTE":
    case "DONE":
      return initialStudentRouteUiState;
    default:
      return state;
  }
}

/** Keep node IDs, graph jargon, and waypoint-by-waypoint noise out of student directions. */
export function studentFacingRouteSteps(route: PlannedRoute): RouteStep[] {
  const authoredSteps = route.steps.map((step) => ({ ...step }));
  const hidden = new Set<number>();

  // An emergency route's display destination may be a policy label (for
  // example, the explicitly permitted Campus Gate fallback) while the
  // authored graph endpoint retains its physical exit/node name. Keep that
  // graph identity and geometry untouched, but make the final student
  // instruction agree with the destination shown in the route preview.
  const emergencyDestinationLabel = route.mode === "emergency"
    ? route.emergencyDestinationLabel?.trim()
    : undefined;
  if (emergencyDestinationLabel) {
    let finalArrivalIndex = -1;
    for (let index = authoredSteps.length - 1; index >= 0; index -= 1) {
      if (authoredSteps[index]?.icon === "arrive") {
        finalArrivalIndex = index;
        break;
      }
    }
    if (finalArrivalIndex >= 0) {
      authoredSteps[finalArrivalIndex] = {
        ...authoredSteps[finalArrivalIndex]!,
        instruction: `Arrive at ${emergencyDestinationLabel}.`,
      };
    }
  }

  // A building selected as the route origin resolves to its authored entrance.
  // When the destination room is in that same building, the planner can emit a
  // zero-distance "Start at the entrance" row immediately before the real
  // entry handoff. That row is a location label, not a navigation action; keep
  // the single authored Enter step as the first visible instruction instead of
  // starting Follow at Step 2.
  const firstStep = route.steps[0];
  const firstTransition = route.steps[1]
    ? routeTransitionForStep(route, route.steps, 1)
    : null;
  const firstHandoff = firstTransition?.kind === "enter_building" ? firstTransition.handoff : undefined;
  const firstSourceLegIndex = firstStep?.contextLegIndex ?? firstHandoff?.fromContextLegIndex;
  const firstSourceLeg = firstSourceLegIndex === undefined ? undefined : route.contextLegs?.[firstSourceLegIndex];
  const firstSourceGeometryLength = firstSourceLeg?.waypoints.slice(1).reduce((distance, point, index) => {
    const previous = firstSourceLeg.waypoints[index]!;
    return distance + Math.hypot(point.x - previous.x, point.y - previous.y);
  }, 0);
  const firstEntryBuildingId = firstHandoff?.buildingId ?? firstTransition?.detail?.buildingId;
  if (firstStep?.icon === "start"
    && route.destinationRoom
    && firstTransition?.kind === "enter_building"
    && firstEntryBuildingId === route.destinationRoom.buildingId
    && firstSourceLeg?.kind === "campus"
    && firstSourceLeg.distanceM <= 0.1
    && firstSourceGeometryLength !== undefined
    && firstSourceGeometryLength <= 0.1) {
    hidden.add(0);
  }

  // Room routes begin at the authored Room Door. This zero-distance origin cue
  // describes where the student is standing; it is not an action to play or a
  // numbered route step. Keep the origin in the route summary and start the
  // numbered itinerary with the first real walk or transition.
  if (firstStep?.icon === "start"
    && !routeTransitionForStep(route, route.steps, 0)
    && /^start\s+(?:at|from)\s+(?:the\s+)?door\b/i.test(firstStep.instruction.trim())) {
    hidden.add(0);
  }

  authoredSteps.forEach((step, index) => {
    if (step.icon !== "elevator" && step.icon !== "stairs") return;
    const resolved = routeTransitionForStep(route, route.steps, index)?.detail;
    if (!resolved?.toFloorId) return;
    const originalStepIndex = route.steps.findIndex((candidate) => candidate.id === step.id);
    const originalDetails = route.transitionDetails ?? [];
    const precedingTransitions = route.steps.slice(0, Math.max(0, originalStepIndex))
      .filter((candidate) => candidate.icon === step.icon).length;
    const original = originalDetails.filter((detail) => detail.kind === step.icon)[precedingTransitions];
    if (!original) return;
    const sourceSegment = route.indoorSegments?.find((segment) => segment.floorId === original.fromFloorId);
    const targetSegment = route.indoorSegments?.find((segment) => segment.floorId === resolved.toFloorId
      && (!sourceSegment || segment.buildingId === sourceSegment.buildingId)
      && Boolean(segment.afterOutdoor) === Boolean(sourceSegment?.afterOutdoor));
    if (!targetSegment) return;
    const targetFloor = studentRouteFloorLabel(targetSegment, "the connected Floor");
    const label = resolved.label.trim() || (step.icon === "stairs" ? "stairs" : "elevator");
    if (step.icon === "stairs") {
      const sourceFloorNumber = sourceSegment?.floorNumber;
      const targetFloorNumber = targetSegment.floorNumber;
      const direction = typeof sourceFloorNumber === "number" && typeof targetFloorNumber === "number"
        ? targetFloorNumber < sourceFloorNumber ? "down" : "up"
        : /\bup\b/i.test(step.instruction) ? "up" : "down";
      authoredSteps[index] = {
        ...step,
        instruction: `Take ${/^(the|a|an)\s/i.test(label) ? label : `the ${label}`} ${direction} to ${targetFloor}.`,
      };
      return;
    }
    if (original.toFloorId === resolved.toFloorId) return;
    const normalize = (instruction: string) => studentInstructionWithoutUncalibratedDistance(instruction)
      .toLocaleLowerCase().replace(/[.!?]+$/g, "").replace(/\s+/g, " ").trim();
    const targetInstruction = targetSegment.steps[0]?.instruction;
    const targetWalkIndex = targetInstruction
      ? route.steps.findIndex((candidate, candidateIndex) => candidateIndex > index
        && candidate.icon === "walk" && normalize(candidate.instruction) === normalize(targetInstruction))
      : -1;
    if (targetWalkIndex <= index + 1) return;
    for (let skipped = index + 1; skipped < targetWalkIndex; skipped += 1) hidden.add(skipped);
    authoredSteps[index] = {
      ...step,
      instruction: `Take ${/^(the|a|an)\s/i.test(label) ? label : `the ${label}`} to ${targetFloor}.`,
    };
  });

  // Emergency paths can cross from a Floor-local segment to Campus through a
  // Building-owned Exterior Emergency Stair / Emergency Exit. The authored
  // graph represents that boundary as reaching the physical egress node,
  // followed by a synthetic "Start from …" row for the Campus segment. Make
  // the boundary an explicit, actionable exit Step and remove that duplicate
  // start row. The planned geometry and emergency eligibility are unchanged.
  const hasEmergencyFloorToCampusLeg = route.mode === "emergency"
    && (route.campusPoints ?? route.points).length >= 2
    && (route.indoorSegments ?? []).some((segment) => !segment.afterOutdoor);
  if (hasEmergencyFloorToCampusLeg) {
    authoredSteps.forEach((step, index) => {
      if (step.icon === "walk" || step.icon === "start" || step.icon === "arrive") return;
      const egressName = step.instruction.match(/\b(?:already at|reached|at)\s+(.+?)(?:[.!?]|$)/i)?.[1];
      if (!egressName || !/\b(?:exterior\s+emergency\s+stair|exterior\s+stair|emergency\s+exit)\b/i.test(egressName)) return;

      authoredSteps[index] = {
        ...step,
        icon: "enter",
        instruction: `Exit via ${egressName.trim()} to Campus.`,
      };
      const duplicateStartIndex = authoredSteps.findIndex((candidate, candidateIndex) =>
        candidateIndex > index
        && candidate.icon !== "walk"
        && /^start from\s+/i.test(candidate.instruction)
        && candidate.instruction.toLocaleLowerCase().includes(egressName.trim().toLocaleLowerCase()),
      );
      if (duplicateStartIndex >= 0) hidden.add(duplicateStartIndex);
    });

    // Graph-generated SOS itineraries can encode the final floor-to-campus
    // boundary as a synthetic "Start from Exterior Stair …" row instead of
    // an "Already at …" row. Keep that authored handoff actionable, and use
    // its context indices so the following walk/arrival resolve to Campus.
    const handoffs = route.contextHandoffs ?? [];
    const exitHandoffIndex = handoffs.findIndex((handoff) => handoff.kind === "exit_building"
      && route.contextLegs?.[handoff.fromContextLegIndex]?.kind === "floor"
      && route.contextLegs?.[handoff.toContextLegIndex]?.kind === "campus");
    const exitHandoff = exitHandoffIndex >= 0 ? handoffs[exitHandoffIndex] : undefined;
    if (exitHandoff) {
      const matchedHandoffSteps = new Map<number, number>();
      handoffs.forEach((handoff, handoffIndex) => {
        const transitionStepIndex = route.steps.findIndex((_, index) => {
          const transition = routeTransitionForStep(route, route.steps, index);
          if (transition?.kind !== handoff.kind) return false;
          const handoffNodeId = handoff.detail?.nodeId ?? handoff.nodeId;
          return handoffNodeId
            ? transition.detail?.nodeId === handoffNodeId
            : transition.handoff?.fromContextLegIndex === handoff.fromContextLegIndex;
        });
        if (transitionStepIndex >= 0) matchedHandoffSteps.set(transitionStepIndex, handoffIndex);
      });

      const firstVerticalTransition = [...matchedHandoffSteps.entries()]
        .filter(([, handoffIndex]) => handoffs[handoffIndex]?.kind === "stairs" || handoffs[handoffIndex]?.kind === "elevator")
        .sort(([left], [right]) => left - right)[0];
      if (firstVerticalTransition) {
        const [transitionStepIndex, handoffIndex] = firstVerticalTransition;
        const startIndex = transitionStepIndex - 1;
        const startStep = authoredSteps[startIndex];
        const approachStep = authoredSteps[startIndex - 1];
        const handoffLabel = handoffs[handoffIndex].label.toLocaleLowerCase().replace(/[.!?]+$/g, "").trim();
        const startLabel = startStep?.instruction.replace(/^start from\s+/i, "").replace(/[.!?]+$/g, "").toLocaleLowerCase().trim();
        if (startStep && /^start from\s+/i.test(startStep.instruction)
          && approachStep?.icon === "walk"
          && startLabel === handoffLabel) {
          // This start row follows the indoor approach to the first stair and
          // otherwise leaves Follow paused before the actual transition.
          // The walk already supplies that location; the stair step is next.
          hidden.add(startIndex);
        }
      }

      const lastPriorTransitionStep = [...matchedHandoffSteps.keys()]
        .filter((stepIndex) => matchedHandoffSteps.get(stepIndex) !== exitHandoffIndex)
        .reduce((last, stepIndex) => Math.max(last, stepIndex), -1);
      const normalizedExitLabel = exitHandoff.label.toLocaleLowerCase().replace(/[.!?]+$/g, "").trim();
      const syntheticExitStepIndex = authoredSteps.reduce((match, step, index) => {
        if (index <= lastPriorTransitionStep || !/^start from\s+/i.test(step.instruction)) return match;
        const startLabel = step.instruction.replace(/^start from\s+/i, "").replace(/[.!?]+$/g, "").toLocaleLowerCase().trim();
        return startLabel === normalizedExitLabel ? index : match;
      }, -1);
      if (syntheticExitStepIndex >= 0) {
        const exitLabel = exitHandoff.label.trim() || "the emergency exit";
        authoredSteps[syntheticExitStepIndex] = {
          ...authoredSteps[syntheticExitStepIndex],
          icon: "enter",
          instruction: `Exit via ${exitLabel} to Campus.`,
          contextLegIndex: exitHandoff.fromContextLegIndex,
          contextHandoffIndex: exitHandoffIndex,
        };
        matchedHandoffSteps.set(syntheticExitStepIndex, exitHandoffIndex);
      }

      // A route may have several zero-walk stair floors. Associate each
      // transition with its exact source context, then carry the destination
      // context forward to the next step. This keeps Previous/Next, Follow,
      // the visible Floor, and the final outdoor leg on the same itinerary.
      let contextLegIndex = 0;
      authoredSteps.forEach((step, index) => {
        const handoffIndex = matchedHandoffSteps.get(index);
        if (handoffIndex !== undefined) {
          const handoff = handoffs[handoffIndex];
          contextLegIndex = handoff.fromContextLegIndex;
          authoredSteps[index] = {
            ...step,
            contextLegIndex: handoff.fromContextLegIndex,
            contextHandoffIndex: handoffIndex,
          };
          contextLegIndex = handoff.toContextLegIndex;
          return;
        }
        if (step.contextLegIndex !== undefined) {
          contextLegIndex = step.contextLegIndex;
          return;
        }
        authoredSteps[index] = { ...step, contextLegIndex };
      });
    }
  }

  // A connected stair run can contain authored Floor contexts with no walking
  // geometry between two landings. Those contexts still remain in the route
  // and in the transition sequence, but a zero-movement "Follow the indoor
  // path" row is not a student action. Removing only this narrow case keeps
  // the visible step counter sequential while preserving any real corridor
  // walk, even when it leads to the same stairwell.
  authoredSteps.forEach((step, index) => {
    if (hidden.has(index) || step.icon !== "walk" || step.distanceM !== undefined && step.distanceM > 0.1) return;
    const beforeIndex = index - 1;
    const afterIndex = index + 1;
    const before = beforeIndex >= 0 ? routeTransitionForStep(route, route.steps, beforeIndex) : null;
    const after = afterIndex < route.steps.length ? routeTransitionForStep(route, route.steps, afterIndex) : null;
    if ((before?.kind !== "stairs" && before?.kind !== "elevator")
      || before.kind !== after?.kind
      || !before.detail || !after?.detail
      || before.detail.toFloorId && after.detail.fromFloorId && before.detail.toFloorId !== after.detail.fromFloorId
      || studentRouteVerticalTransitionRunId(route, route.steps, beforeIndex) === null
      || studentRouteVerticalTransitionRunId(route, route.steps, beforeIndex) !== studentRouteVerticalTransitionRunId(route, route.steps, afterIndex)) return;

    const target = studentRouteSeekTarget(route, route.steps, index);
    const segment = target.segment;
    const contextLeg = target.contextLegIndex === undefined ? undefined : route.contextLegs?.[target.contextLegIndex];
    const points = contextLeg?.waypoints ?? segment?.waypoints ?? [];
    const geometryLength = points.slice(1).reduce((sum, point, pointIndex) => {
      const previous = points[pointIndex]!;
      return sum + Math.hypot(point.x - previous.x, point.y - previous.y);
    }, 0);
    const measuredDistance = Math.max(
      Number.isFinite(segment?.distanceM) ? Math.max(0, segment!.distanceM) : 0,
      Number.isFinite(contextLeg?.distanceM) ? Math.max(0, contextLeg!.distanceM) : 0,
    );
    if (measuredDistance <= 0.1 && geometryLength <= 0.1) hidden.add(index);
  });

  const visible = authoredSteps.filter((step, index) => !hidden.has(index)).filter((step) => {
    const instruction = step.instruction.trim();
    return instruction.length > 0
      && !/\b(?:walking point|waypoint|graph node|node[- ]\w+|edge[- ]\w+)\b/i.test(instruction)
      && !/^continue to floor waypoint/i.test(instruction);
  }).map((step) => ({ ...step, instruction: studentInstructionWithoutUncalibratedDistance(step.instruction) }));
  return visible.length > 0 ? visible : [{ id: "route-overview", icon: "walk", instruction: "Follow the route to your destination." }];
}

/** Render only the human-facing string from a structured route instruction. */
export function studentRouteStepInstruction(
  steps: readonly RouteStep[],
  index: number,
  fallback: string,
): string {
  return steps[index]?.instruction ?? fallback;
}

/** Explicit inspection focus wins over an older route destination. */
export function studentRoomFocusTargetId(
  searchRoomId?: string | null,
  selectedRoomId?: string | null,
  destinationRoomId?: string | null,
): string | null {
  return searchRoomId ?? selectedRoomId ?? destinationRoomId ?? null;
}

/** Resolve the already-planned indoor leg for the Floor the student is viewing. */
export function studentIndoorSegmentForFloor(
  route: PlannedRoute | null | undefined,
  buildingId: string,
  floorId: string | undefined,
  floorNumber: number,
): RouteIndoorSegment | null {
  return route?.indoorSegments?.find((segment) =>
    segment.buildingId === buildingId
    && (floorId
      ? segment.floorId === floorId || (!segment.floorId && segment.floorNumber === floorNumber)
      : segment.floorNumber === floorNumber),
  ) ?? null;
}

/** Map local Floor playback progress back to the matching human-facing route step. */
export function studentRouteProgressForIndoorSegment(
  route: PlannedRoute,
  steps: readonly RouteStep[],
  segment: RouteIndoorSegment,
  segmentProgress: number,
  contextLegIndex?: number,
): number {
  let stepIndex = steps.findIndex((step, index) => {
    if (step.icon !== "walk") return false;
    const target = studentRouteSeekTarget(route, steps, index);
    return target.segment === segment && (contextLegIndex === undefined || target.contextLegIndex === contextLegIndex);
  });
  const targetInstruction = segment.steps[0]?.instruction;
  const targetText = targetInstruction ? studentInstructionWithoutUncalibratedDistance(targetInstruction) : "";
  if (stepIndex < 0) stepIndex = steps.findIndex((step) => step.icon === "walk" && step.instruction === targetText);
  if (stepIndex < 0) {
    const routeWalkSteps = steps.map((step, index) => ({ step, index })).filter(({ step }) => step.icon === "walk");
    const routeSegments = route.indoorSegments ?? [];
    const segmentIndex = routeSegments.indexOf(segment);
    const floorSegmentsBefore = routeSegments.slice(0, Math.max(0, segmentIndex)).filter((candidate) => candidate.buildingId === segment.buildingId && Boolean(candidate.afterOutdoor) === Boolean(segment.afterOutdoor)).length;
    stepIndex = routeWalkSteps[floorSegmentsBefore]?.index ?? -1;
  }
  if (stepIndex < 0 || steps.length === 0) return Math.max(0, Math.min(1, segmentProgress));

  const progress = Math.max(0, Math.min(1, segmentProgress));
  const weights = steps.map((step) => Number.isFinite(step.distanceM) && (step.distanceM ?? 0) > 0 ? step.distanceM! : 0);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total > 0) {
    const before = weights.slice(0, stepIndex).reduce((sum, weight) => sum + weight, 0);
    const current = weights[stepIndex] ?? 0;
    return Math.max(0, Math.min(1, (before + current * progress) / total));
  }
  return Math.max(0, Math.min(1, (stepIndex + progress) / steps.length));
}

/** Replace legacy SVG-unit distance text with a useful direction. Map scale is
 * not a reliable physical calibration, so student instructions never expose it. */
export function studentInstructionWithoutUncalibratedDistance(instruction: string): string {
  const text = instruction.trim();
  const walkDistance = text.match(/^walk\s+[\d,.]+\s*(?:m|meters?)\s+(?:to|toward)\s+(.+?)\.?$/i);
  if (walkDistance?.[1]) return `Follow the path toward ${walkDistance[1].replace(/[.]+$/, "")}.`;
  if (/^walk\s+[\d,.]+\s*(?:m|meters?)\.?$/i.test(text)) return "Continue along the route.";
  const withoutDistance = text
    .replace(/\b\d+(?:\.\d+)?\s*(?:m|meters?)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,])/g, "$1")
    .trim();
  return withoutDistance || "Continue along the route.";
}

/**
 * ONE canonical active route step. The same index drives the instruction, the
 * highlighted Steps row, the completed/active route segment, the active
 * transition marker, the Building/Floor context, and the camera target.
 *
 * Precedence:
 * 1. Explore inspection (student pressed Previous/Next while inspecting) —
 *    presentation only; playback progress is preserved separately.
 * 2. Transition guidance pin — during Follow, an in-flight building/floor
 *    transition keeps its own step active until the context has settled, so
 *    the instruction never advances before the transition completes.
 * 3. Playback progress — the distance-weighted step for actual progress.
 */
export function canonicalActiveRouteStepIndex(options: {
  playbackIndex: number;
  transitionIndex?: number;
  camera: StudentCameraMode;
  inspectedIndex?: number | null;
  totalSteps: number;
}): number {
  const last = Math.max(0, options.totalSteps - 1);
  const clamp = (value: number) => Math.max(0, Math.min(last, value));
  if (options.camera === "explore" && options.inspectedIndex != null) return clamp(options.inspectedIndex);
  if (options.transitionIndex != null && options.transitionIndex >= 0) return clamp(options.transitionIndex);
  return clamp(options.playbackIndex);
}

/** Route progress rendered for the canonical step. Explore inspection renders
 * the inspected step's position without ever mutating real playback progress,
 * so Return to Follow resumes from the actual preserved progress. */
export function studentDisplayedRouteProgress(
  steps: readonly RouteStep[],
  playbackProgress: number,
  camera: StudentCameraMode,
  inspectedIndex: number | null,
): number {
  if (camera === "explore" && inspectedIndex != null) return routeProgressForStepIndex([...steps], inspectedIndex);
  return playbackProgress;
}

export function routeStepIndexForProgress(steps: RouteStep[], progress: number): number {
  if (steps.length < 2 || progress <= 0) return 0;
  if (progress >= 1) return steps.length - 1;
  const weights = steps.map((step) => Number.isFinite(step.distanceM) && (step.distanceM ?? 0) > 0 ? step.distanceM! : 0);
  const known = weights.reduce((sum, value) => sum + value, 0);
  if (known === 0) return Math.min(steps.length - 1, Math.floor(progress * steps.length));
  const target = known * progress;
  let consumed = 0;
  for (let index = 0; index < weights.length; index += 1) {
    consumed += weights[index];
    if (consumed >= target) return index;
  }
  return steps.length - 1;
}

export type StudentRouteTransitionKind = "enter_building" | "exit_building" | "stairs" | "elevator";

function routeContextHandoffForStep(
  route: PlannedRoute,
  steps: readonly RouteStep[],
  stepIndex: number,
  kind: StudentRouteTransitionKind,
  nodeId?: string,
): RouteContextHandoff | undefined {
  const explicitIndex = steps[stepIndex]?.contextHandoffIndex;
  if (explicitIndex !== undefined) {
    const explicit = route.contextHandoffs?.[explicitIndex];
    if (explicit) return explicit;
  }
  const candidates = (route.contextHandoffs ?? []).filter((handoff) => handoff.kind === kind);
  if (nodeId) {
    const byNode = candidates.find((handoff) => (handoff.detail?.nodeId ?? handoff.nodeId) === nodeId);
    if (byNode) return byNode;
  }
  const occurrence = steps.slice(0, Math.max(0, stepIndex)).filter((step) => {
    if (kind === "enter_building" || kind === "exit_building") {
      if (step.icon !== "enter") return false;
      return (/^\s*exit\b/i.test(step.instruction) ? "exit_building" : "enter_building") === kind;
    }
    return step.icon === kind;
  }).length;
  return candidates[occurrence];
}

/** Resolve the authored transition associated with one human-facing instruction. */
export function routeTransitionForStep(
  route: PlannedRoute,
  steps: readonly RouteStep[],
  stepIndex: number,
): { kind: StudentRouteTransitionKind; detail?: RouteTransitionDetail; handoff?: RouteContextHandoff } | null {
  const step = steps[stepIndex];
  if (!step) return null;
  if (step.icon === "enter") {
    // Authored context is authoritative. Older route rows can still say
    // "Already at Primary Entrance" for an indoor-to-campus boundary; deriving
    // direction from the row's word "entrance" would misclassify an exit as an
    // entry and leave Continue with no valid handoff to perform.
    const indexedHandoff = step.contextHandoffIndex === undefined
      ? undefined
      : route.contextHandoffs?.[step.contextHandoffIndex];
    const explicitAction = /^\s*(enter|exit)\b/i.exec(step.instruction)?.[1]?.toLocaleLowerCase();
    const kind = indexedHandoff?.kind
      ?? (explicitAction === "exit" ? "exit_building" : "enter_building");
    const handoff = indexedHandoff ?? routeContextHandoffForStep(route, steps, stepIndex, kind);
    // Older graph rows use the `enter` icon for any instruction mentioning an
    // entrance. A start label or a walk that ends at a Primary Entrance is a
    // location description, not an instruction to cross a building boundary.
    // Only an authored handoff or an explicit Enter/Exit action is actionable.
    if (!handoff && !explicitAction) return null;
    return {
      kind,
      ...(handoff ? { handoff } : {}),
    };
  }
  if (step.icon !== "stairs" && step.icon !== "elevator") return null;

  const kind = step.icon;
  const details = route.transitionDetails ?? [];
  const instruction = step.instruction.toLocaleLowerCase();
  const originalStepIndex = route.steps.findIndex((candidate) => candidate.id === step.id);
  const precedingSameKind = route.steps.slice(0, Math.max(0, originalStepIndex))
    .filter((candidate) => candidate.icon === kind).length;
  const orderedDetails = details.filter((detail) => detail.kind === kind);
  const orderedMatch = orderedDetails[precedingSameKind];
  const handoff = routeContextHandoffForStep(route, steps, stepIndex, kind, orderedMatch?.nodeId);
  const detailForStep = originalStepIndex >= 0 ? orderedMatch : handoff?.detail ?? orderedMatch;
  const resolve = (detail?: RouteTransitionDetail) => {
    const transition = detail ? resolveDirectElevatorTransition(route, detail, handoff) : { detail, handoff };
    return {
      kind,
      ...(transition.detail ? { detail: transition.detail } : {}),
      ...(transition.handoff ? { handoff: transition.handoff } : {}),
    };
  };
  if (handoff && detailForStep) return resolve(detailForStep);
  const namedMatches = orderedDetails.filter((detail) => detail.label.trim().length > 0
    && instruction.includes(detail.label.trim().toLocaleLowerCase()));
  // Authored stair/elevator labels are often repeated (for example, "Left
  // Stair" on several Floors). Keep each one associated with its route-order
  // occurrence instead of repeatedly resolving the first identical label.
  if (orderedMatch && instruction.includes(orderedMatch.label.trim().toLocaleLowerCase())) {
    return resolve(orderedMatch);
  }
  if (namedMatches.length === 1) return resolve(namedMatches[0]);
  if (namedMatches.length > 1) {
    const orderedNamedMatch = namedMatches.find((detail) => detail.nodeId === orderedMatch?.nodeId);
    if (orderedNamedMatch) return resolve(orderedNamedMatch);
  }
  // Legacy instructions may omit an authored marker label. Preserve route
  // order so repeated stairs/elevators still resolve to their correct shaft.
  return resolve(orderedMatch);
}

/** Return the first authored Enter step when it is the route's first real
 * action. A zero-distance doorway instruction is not an outdoor walking leg;
 * Follow should wait at that physical boundary for Continue. */
export function studentRouteInitialPhysicalTransitionStepIndex(
  route: PlannedRoute,
  steps: readonly RouteStep[],
): number | null {
  const transitionIndex = steps.findIndex((_, index) => routeTransitionForStep(route, steps, index) !== null);
  if (transitionIndex < 0 || routeTransitionForStep(route, steps, transitionIndex)?.kind !== "enter_building") return null;
  const precedingWalks = steps.slice(0, transitionIndex).filter((step) => step.icon === "walk");
  const hasMeaningfulApproach = precedingWalks.some((step) => {
    const contextDistance = step.contextLegIndex === undefined
      ? undefined
      : route.contextLegs?.[step.contextLegIndex]?.distanceM;
    const distance = step.distanceM ?? contextDistance;
    // Unknown walking distance must be treated as a real approach. Only an
    // explicitly zero-length authored segment can be skipped at route start.
    return distance === undefined || distance > 0.1;
  });
  return hasMeaningfulApproach ? null : transitionIndex;
}

/** Resolve the route's true starting map context from its authored itinerary.
 * A building-origin route whose first action is entering its selected
 * entrance starts on Campus, even when its Campus leg has no walking distance.
 * Room origins remain on their authored Floor. */
export function studentRouteInitialContext(
  route: PlannedRoute,
  steps: readonly RouteStep[],
  startsInsideBuilding = false,
): "campus" | "floor" {
  if (startsInsideBuilding) return "floor";

  const entryIndex = studentRouteInitialPhysicalTransitionStepIndex(route, steps);
  if (entryIndex !== null) {
    const entry = routeTransitionForStep(route, steps, entryIndex);
    const target = studentRouteSeekTarget(route, steps, entryIndex);
    if (entry?.kind === "enter_building" && target.context === "campus") return "campus";
  }

  const campusWalk = route.contextLegs?.some((leg) => leg.kind === "campus"
    && leg.waypoints.length > 1 && (leg.distanceM > 0.1
      || leg.waypoints.some((point, index) => index > 0
        && Math.hypot(point.x - leg.waypoints[index - 1]!.x, point.y - leg.waypoints[index - 1]!.y) > 0.1)))
    ?? ((route.campusPoints ?? route.points).length > 1);
  if (campusWalk) return "campus";
  if (route.destinationRoom && (route.indoorSegments?.length ?? 0) > 0) return "floor";
  return "campus";
}

/** Collapse zero-walk intermediate stops when the same authored elevator
 * shaft continues directly through those Floors. Stairs and Floors with real
 * indoor walking remain explicit itinerary legs. */
function resolveDirectElevatorTarget(route: PlannedRoute, transition: RouteTransitionDetail): RouteTransitionDetail {
  if (transition.kind !== "elevator" || !transition.transitionSharedId || !transition.toFloorId) return transition;
  const details = route.transitionDetails ?? [];
  const firstIndex = details.indexOf(transition);
  if (firstIndex < 0) return transition;
  const buildingId = transition.buildingId
    ?? route.indoorSegments?.find((segment) => segment.floorId === transition.fromFloorId)?.buildingId;
  let last = transition;
  for (let index = firstIndex + 1; index < details.length; index += 1) {
    const next = details[index];
    if (next.kind !== "elevator" || next.transitionSharedId !== transition.transitionSharedId
      || buildingId && next.buildingId && next.buildingId !== buildingId
      || next.fromFloorId !== last.toFloorId) break;
    const intermediate = route.indoorSegments?.find((segment) => segment.floorId === last.toFloorId
      && (!buildingId || segment.buildingId === buildingId)
      && Boolean(segment.afterOutdoor) === Boolean(route.indoorSegments?.find((candidate) => candidate.floorId === transition.fromFloorId)?.afterOutdoor));
    // A zero-length Floor context is just the elevator passing that Floor. If
    // it contains a walking leg, the student must leave the elevator and the
    // authored intermediate stop remains part of the route.
    if (!intermediate || !isZeroLengthElevatorLanding(route, intermediate)) break;
    last = next;
  }
  return last === transition ? transition : { ...transition, toFloorId: last.toFloorId };
}

/** A through-floor can only be skipped when both its authored distance and
 * geometry confirm that it is a zero-walk landing. Missing or contradictory
 * route measurements keep the stop explicit. */
function isZeroLengthElevatorLanding(route: PlannedRoute, segment: RouteIndoorSegment): boolean {
  if (!Number.isFinite(segment.distanceM) || segment.distanceM > 0.1) return false;
  const segmentIndex = route.indoorSegments?.indexOf(segment) ?? -1;
  const contextLeg = route.contextLegs?.find((leg) => leg.kind === "floor"
    && (leg.segmentIndex === segmentIndex || leg.floorId === segment.floorId));
  if (contextLeg && (!Number.isFinite(contextLeg.distanceM) || contextLeg.distanceM > 0.1)) return false;
  const points = segment.waypoints ?? [];
  for (let index = 1; index < points.length; index += 1) {
    if (Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y) > 1e-6) return false;
  }
  return true;
}

/** Keep a direct elevator instruction and its physical handoff aimed at the
 * same authored landing. The first per-floor edge identifies the source
 * elevator; when zero-walk stops collapse, Continue must hand off to the last
 * connected landing in that same shaft. */
function resolveDirectElevatorTransition(
  route: PlannedRoute,
  transition: RouteTransitionDetail,
  handoff?: RouteContextHandoff,
): { detail: RouteTransitionDetail; handoff?: RouteContextHandoff } {
  const detail = resolveDirectElevatorTarget(route, transition);
  if (detail.toFloorId === transition.toFloorId || transition.kind !== "elevator") {
    return { detail, ...(handoff ? { handoff } : {}) };
  }
  const handoffs = route.contextHandoffs ?? [];
  if (handoffs.length === 0 || !handoff) return { detail, ...(handoff ? { handoff } : {}) };
  const directHandoff = handoffs.find((candidate) => {
    if (candidate.kind !== "elevator" || candidate.fromContextLegIndex < handoff.toContextLegIndex) return false;
    const candidateDetail = candidate.detail;
    const targetLeg = route.contextLegs?.[candidate.toContextLegIndex];
    return candidateDetail?.kind === "elevator"
      && candidateDetail.toFloorId === detail.toFloorId
      && targetLeg?.kind === "floor"
      && targetLeg.floorId === detail.toFloorId
      && (!transition.buildingId || candidate.buildingId === transition.buildingId)
      && (!transition.transitionSharedId || candidateDetail.transitionSharedId === transition.transitionSharedId);
  });
  if (!directHandoff) {
    // Do not expose a direct destination if playback cannot prove the matching
    // authored handoff. Keep both cue and Follow at the immediate landing.
    return { detail: transition, handoff };
  }
  return {
    detail,
    handoff: {
      ...handoff,
      toContextLegIndex: directHandoff.toContextLegIndex,
      targetPoint: directHandoff.targetPoint,
      detail,
    },
  };
}

/** Return the authored physical-run identity when the route can continue through the
 * next floor without a meaningful walk or a change of vertical connection.
 * Follow uses this to auto-advance only the mechanical middle of a continuous
 * stair/elevator journey; the full human-facing step list remains unchanged. */
export function studentRouteVerticalTransitionGroupId(
  route: PlannedRoute,
  steps: readonly RouteStep[],
  stepIndex: number,
): string | null {
  const current = routeTransitionForStep(route, steps, stepIndex);
  const currentDetail = current?.detail;
  const currentRunId = studentRouteVerticalTransitionRunId(route, steps, stepIndex);
  if ((current?.kind !== "stairs" && current?.kind !== "elevator")
    || !currentRunId || !currentDetail?.toFloorId) return null;

  const nextFloorTarget = studentRouteSeekTarget(route, steps, stepIndex + 1);
  const nextSegment = nextFloorTarget.context === "floor" ? nextFloorTarget.segment : null;
  if (!nextSegment || nextSegment.distanceM > 0.1
    || currentDetail.buildingId && nextSegment.buildingId !== currentDetail.buildingId
    || currentDetail.toFloorId && nextSegment.floorId && currentDetail.toFloorId !== nextSegment.floorId) return null;

  for (let nextIndex = stepIndex + 1; nextIndex < steps.length; nextIndex += 1) {
    const next = routeTransitionForStep(route, steps, nextIndex);
    if (!next) continue;
    const nextDetail = next.detail;
    if (next.kind !== current.kind || !nextDetail
      || studentRouteVerticalTransitionRunId(route, steps, nextIndex) !== currentRunId
      || nextDetail.buildingId && currentDetail.buildingId && nextDetail.buildingId !== currentDetail.buildingId
      || nextDetail.fromFloorId && nextSegment.floorId && nextDetail.fromFloorId !== nextSegment.floorId) return null;
    const nextSource = studentRouteSeekTarget(route, steps, nextIndex);
    return nextSource.context === "floor" && nextSource.segment === nextSegment
      ? currentRunId
      : null;
  }
  return null;
}

/** Return the physical identity used to authorize one uninterrupted vertical
 * Follow run. Exterior Emergency Stairs use their owner ID because per-Floor
 * shared IDs and display labels are not sufficient to prove the same assembly.
 * Route mode affects path selection, not whether the same authored shaft can
 * be traversed as one continuous Follow action. */
export function studentRouteVerticalTransitionRunId(
  route: PlannedRoute,
  steps: readonly RouteStep[],
  stepIndex: number,
): string | null {
  const transition = routeTransitionForStep(route, steps, stepIndex);
  const detail = transition?.detail;
  if (!transition || !detail) return null;
  if (transition.kind === "stairs" && detail.exteriorEmergencyStairId) {
    const source = studentRouteSeekTarget(route, steps, stepIndex);
    const buildingId = detail.buildingId ?? source.segment?.buildingId ?? "";
    return `exterior-emergency-stair:${buildingId}:${detail.exteriorEmergencyStairId}`;
  }
  return (transition.kind === "stairs" || transition.kind === "elevator")
    && detail.transitionSharedId
    ? detail.transitionSharedId
    : null;
}

/** True when an already-confirmed same-assembly run may activate this exact
 * authored transition, including the final transition in that run. The group
 * id is established by the preceding transition; checking the current step's
 * authored id lets the run finish without asking for one more Continue. */
export function studentRouteVerticalTransitionContinuesRun(
  route: PlannedRoute,
  steps: readonly RouteStep[],
  stepIndex: number,
  continuingRunId?: string | null,
): boolean {
  if (!continuingRunId) return false;
  return studentRouteVerticalTransitionRunId(route, steps, stepIndex) === continuingRunId;
}

/** Keep a zero-distance approach instruction visible when it leads to a new
 * stair/elevator decision. The only exception is an already-confirmed,
 * same-shaft traversal group, which may continue through its middle floors. */
export function studentRouteShouldPauseAtZeroWalkVerticalAccess(
  route: PlannedRoute,
  steps: readonly RouteStep[],
  stepIndex: number,
  continuingRunId?: string | null,
): boolean {
  const step = steps[stepIndex];
  if (step?.icon !== "walk") return false;
  const target = studentRouteSeekTarget(route, steps, stepIndex);
  if (target.context !== "floor" || !target.segment
    || !Number.isFinite(target.segment.distanceM) || (target.segment.distanceM ?? 0) > 0.1) return false;
  const nextTransition = routeTransitionForStep(route, steps, stepIndex + 1);
  if (nextTransition?.kind !== "stairs" && nextTransition?.kind !== "elevator") return false;
  // Keep the final same-shaft handoff inside an already-confirmed run too.
  // It has no following transition of its own, so asking whether it starts a
  // new group incorrectly pauses at the zero-distance approach and shows a
  // dead Resume action before the final floor change.
  return !continuingRunId
    || !studentRouteVerticalTransitionContinuesRun(route, steps, stepIndex + 1, continuingRunId);
}

export function routeStepIndexForAuthoredTransition(
  route: PlannedRoute,
  steps: RouteStep[],
  transition: RouteTransitionDetail,
): number {
  return steps.findIndex((_, index) => routeTransitionForStep(route, steps, index)?.detail?.nodeId === transition.nodeId);
}

export function routeStepIndexForBuildingTransition(steps: RouteStep[], direction: "enter" | "exit"): number {
  return steps.findIndex((step) => step.icon === "enter"
    && (direction === "exit" ? /^\s*exit\b/i.test(step.instruction) : !/^\s*exit\b/i.test(step.instruction)));
}

/** Resolve a rendered route cue back to its canonical instruction index. */
export function studentRouteTransitionCueStepIndex(
  route: PlannedRoute,
  steps: readonly RouteStep[],
  cueId: string,
): number {
  const instructionIndex = steps.findIndex((step, index) =>
    step.id === cueId && routeTransitionForStep(route, steps, index) !== null,
  );
  if (instructionIndex >= 0) return instructionIndex;
  return steps.findIndex((_, index) => routeTransitionForStep(route, steps, index)?.detail?.nodeId === cueId);
}

/** Previewing a transition lands at the next authored route-step boundary. */
export function studentRoutePreviewTransitionTarget(
  route: PlannedRoute,
  steps: readonly RouteStep[],
  cueId: string,
): (StudentRouteSeekTarget & { transitionStepIndex: number; targetStepIndex: number }) | null {
  const transitionStepIndex = studentRouteTransitionCueStepIndex(route, steps, cueId);
  if (transitionStepIndex < 0 || steps.length === 0) return null;
  const targetStepIndex = Math.min(steps.length - 1, transitionStepIndex + 1);
  return {
    ...studentRouteSeekTarget(route, steps, targetStepIndex),
    transitionStepIndex,
    targetStepIndex,
  };
}

/** Resolve a route transition node to its visible authored stair/elevator footprint. */
export function authoredFloorTransitionPoint(
  floor: FloorPlan,
  nodes: readonly NavigationNode[],
  transition: RouteTransitionDetail,
): { x: number; y: number } | null {
  const routeNode = nodes.find((candidate) => candidate.id === transition.nodeId);
  const node = routeNode && (!routeNode.floorId || routeNode.floorId === floor.id)
    ? routeNode
    : routeNode?.transitionSharedId
      ? nodes.find((candidate) => candidate.transitionSharedId === routeNode.transitionSharedId && candidate.floorId === floor.id)
      : undefined;
  if (!node) return null;
  if (transition.kind === "stairs" && node.stairId) {
    const stairs = (floor.stairs ?? []).find((item) => item.id === node.stairId);
    if (stairs) return { x: stairs.x + stairs.width / 2, y: stairs.y + stairs.height / 2 };
  }
  if (transition.kind === "elevator" && node.elevatorId) {
    const elevator = (floor.elevators ?? []).find((item) => item.id === node.elevatorId);
    if (elevator) return { x: elevator.x + elevator.width / 2, y: elevator.y + elevator.height / 2 };
  }
  return { x: node.x, y: node.y };
}

export type StudentRouteMapContext =
  | { kind: "campus" }
  | { kind: "floor"; buildingId: string; floor: FloorPlan; floorNumber?: number };

export interface StudentRouteTransitionCue {
  id: string;
  kind: StudentRouteTransitionKind;
  label: string;
  /** Compact visual cue derived from the same authored transition as label. */
  displayLabel?: string;
  /** Physical authored connector identity, used to group only choices that
   * belong to the same stairwell/elevator in Explore. */
  groupId?: string;
  point: { x: number; y: number };
  /** Explore-only return cue; activating it inspects the preceding route step. */
  returnToStepIndex?: number;
  /** Destination floor context where the reverse connection is authored. */
  viewOnSegmentIndex?: number;
}

export interface StudentRouteExploreTransitionChoice {
  id: string;
  kind: StudentRouteTransitionKind;
  groupId?: string;
  label: string;
  displayLabel?: string;
  point: { x: number; y: number };
  onActivate: () => void;
}

export interface StudentRouteExploreTransitionMarker extends StudentRouteExploreTransitionChoice {
  /** Authored choices sharing one physical location. A one-choice group keeps
   * the existing direct activation behavior and does not open a menu. */
  choices: readonly StudentRouteExploreTransitionChoice[];
}

/** Merge colliding route cues into one Explore marker. Distinct vertical
 * connectors stay separate even when projected positions overlap; nearby
 * building access actions can join a vertical group at a shared landing. The
 * anchor remains authored, so grouping never invents map geometry. */
export function groupStudentRouteExploreTransitions<T extends StudentRouteExploreTransitionChoice>(
  cues: readonly T[],
  mergeDistance = 34,
  screenPosition: (cue: T) => { x: number; y: number } = (cue) => cue.point,
): Array<Omit<T, "choices"> & { choices: readonly T[] }> {
  const clusters: T[][] = [];
  const maxDistance = Number.isFinite(mergeDistance) ? Math.max(0, mergeDistance) : 34;

  for (const cue of cues) {
    const isVertical = cue.kind === "stairs" || cue.kind === "elevator";
    const cuePosition = screenPosition(cue);
    const cluster = clusters.find((candidate) => candidate.every((member) => {
      const memberIsVertical = member.kind === "stairs" || member.kind === "elevator";
      const position = screenPosition(member);
      if (Math.hypot(position.x - cuePosition.x, position.y - cuePosition.y) > maxDistance) return false;
      if (isVertical && memberIsVertical) return Boolean(cue.groupId && member.groupId === cue.groupId);
      return true;
    }));
    if (cluster) cluster.push(cue);
    else clusters.push([cue]);
  }

  return clusters.map((choices) => {
    const anchor = choices.length === 1
      ? choices[0]!
      : choices.reduce((best, candidate) => {
        const distance = (entry: T) => choices.reduce((sum, other) => {
          const point = screenPosition(entry);
          const otherPoint = screenPosition(other);
          return sum + Math.hypot(point.x - otherPoint.x, point.y - otherPoint.y);
        }, 0);
        return distance(candidate) < distance(best) ? candidate : best;
      }, choices[0]!);
    return {
      ...anchor,
      id: choices.length > 1 ? `explore-group:${choices.map((choice) => choice.id).join("+")}` : anchor.id,
      point: anchor.point,
      choices,
    };
  });
}

/** Camera pan for centering an authored route point after zooming. */
export function panForRouteFocusPoint(
  point: { x: number; y: number },
  viewportCenter: { x: number; y: number },
  mapCenter: { x: number; y: number },
  zoom: number,
): { x: number; y: number } {
  return {
    x: viewportCenter.x - mapCenter.x * (1 - zoom) - point.x * zoom,
    y: viewportCenter.y - mapCenter.y * (1 - zoom) - point.y * zoom,
  };
}

/** Scale map-anchored student markers against both the SVG viewport and the
 * camera zoom so their authored-world anchors stay fixed while the glyph stays
 * legible in CSS pixels. */
export function screenSpaceMarkerScale(worldUnitsPerCssPixel: number, zoom: number): number {
  if (!Number.isFinite(worldUnitsPerCssPixel) || worldUnitsPerCssPixel <= 0
    || !Number.isFinite(zoom) || zoom <= 0) return 1;
  return worldUnitsPerCssPixel / zoom;
}

/** Keep student transition glyphs legible near the map while reducing their
 * footprint continuously at overview zoom. The invisible hit target uses the
 * separate inverse-camera scale and is not affected by this visual LOD. */
export function studentTransitionMarkerLodScale(zoom: number): number {
  // Match the Admin badge's authored size at normal interaction zoom. The
  // outer screen-space wrapper cancels camera zoom; only far overview zoom
  // compacts crowded badges.
  if (!Number.isFinite(zoom) || zoom <= 0) return 0.4;
  if (zoom >= 0.85) return 1;
  if (zoom >= 0.55) return 0.9 + ((zoom - 0.55) / 0.3) * 0.1;
  if (zoom >= 0.35) return 0.72 + ((zoom - 0.35) / 0.2) * 0.18;
  if (zoom >= 0.2) return 0.52 + ((zoom - 0.2) / 0.15) * 0.2;
  return 0.4 + (Math.max(0, zoom) / 0.2) * 0.12;
}

/** Identify redundant badges at a crowded overview without relocating any
 * authored doorway. Every badge stays mounted and fades back in as the camera
 * approaches. Only badges with identical authored directions share a group. */
export function studentOverviewDuplicateIds(
  entries: readonly { id: string; x: number; y: number; direction: string }[],
  activeId?: string | null,
): ReadonlySet<string> {
  const duplicates = new Set<string>();
  const kept: typeof entries[number][] = [];
  const ordered = activeId
    ? [...entries].sort((left, right) => Number(right.id === activeId) - Number(left.id === activeId))
    : entries;
  const overviewPixelsPerWorldUnit = 0.35;
  const separationPx = 15 * studentTransitionMarkerLodScale(overviewPixelsPerWorldUnit) + 2;
  for (const entry of ordered) {
    if (entry.id !== activeId && kept.some((prior) => prior.direction === entry.direction
      && Math.hypot(entry.x - prior.x, entry.y - prior.y) * overviewPixelsPerWorldUnit < separationPx)) {
      duplicates.add(entry.id);
    } else {
      kept.push(entry);
    }
  }
  return duplicates;
}

/**
 * Build map cues from the same authored route facts used by route planning:
 * human route steps for building handoffs, and canonical transitionDetails for
 * stairs/elevators. This is presentation only; no route is recalculated.
 */
export function studentRouteTransitionCues(
  route: PlannedRoute,
  steps: readonly RouteStep[],
  context: StudentRouteMapContext,
  nodes: readonly NavigationNode[] = [],
  edges: readonly NavigationEdge[] = [],
  mode: PlannedRoute["mode"] = route.mode,
): StudentRouteTransitionCue[] {
  const cues: StudentRouteTransitionCue[] = [];
  const campusPoints = route.campusPoints?.length ? route.campusPoints : route.points;
  const physicalTransitionGroupId = (detail: RouteTransitionDetail, fallbackBuildingId?: string): string => {
    const node = nodes.find((candidate) => candidate.id === detail.nodeId);
    const buildingId = detail.buildingId ?? node?.buildingId ?? fallbackBuildingId ?? "";
    const physicalId = detail.exteriorEmergencyStairId
      ?? detail.transitionSharedId
      ?? node?.transitionSharedId
      ?? (detail.kind === "stairs" ? node?.stairId : node?.elevatorId)
      ?? detail.nodeId;
    return `${detail.kind}:${buildingId}:${physicalId}`;
  };

  steps.forEach((step, index) => {
    const transition = routeTransitionForStep(route, steps, index);
    if (!transition) return;
    // A transition belongs to the context the route leaves. Using the target
    // Floor as well caused duplicate controls to appear before and after the
    // same transition, and made exits look like campus-side actions.
    const source = studentRouteSeekTarget(route, steps, index);
    const sourceIsVisible = source.context === context.kind && (context.kind === "campus"
      || Boolean(source.segment
        && source.segment.buildingId === context.buildingId
        && (source.segment.floorId
          ? source.segment.floorId === context.floor.id
          : source.segment.floorNumber === context.floorNumber)));
    if (!sourceIsVisible) return;

    if (transition.kind === "enter_building" || transition.kind === "exit_building") {
      const isExit = transition.kind === "exit_building";
      let point: { x: number; y: number } | undefined;
      if (!isExit && context.kind === "campus") {
        point = transition.handoff?.sourcePoint
          ?? (source.contextLegIndex === undefined ? undefined : route.contextLegs?.[source.contextLegIndex]?.waypoints.at(-1))
          ?? campusPoints.at(-1);
      } else {
        point = isExit && context.kind === "floor"
          ? transition.handoff?.sourcePoint ?? source.segment?.waypoints.at(-1)
          : undefined;
      }
      if (point) cues.push({ id: step.id, kind: transition.kind, label: step.instruction, point });
      return;
    }

    if (context.kind !== "floor" || !transition.detail
      || transition.detail.fromFloorId && source.segment?.floorId
        && transition.detail.fromFloorId !== source.segment.floorId) return;
    const point = authoredFloorTransitionPoint(context.floor, nodes, transition.detail);
    if (!point) return;

    const sourceFloor = source.segment?.floorNumber;
    const targetLeg = transition.handoff
      ? route.contextLegs?.[transition.handoff.toContextLegIndex]
      : undefined;
    const targetSegment = targetLeg?.kind === "floor" && targetLeg.segmentIndex !== undefined
      ? route.indoorSegments?.[targetLeg.segmentIndex]
      : route.indoorSegments?.find((segment) => segment.floorId === transition.detail?.toFloorId
        && (!transition.detail?.buildingId || segment.buildingId === transition.detail.buildingId));
    const targetFloor = targetSegment?.floorNumber;
    const direction = typeof sourceFloor === "number" && typeof targetFloor === "number" && sourceFloor !== targetFloor
      ? targetFloor > sourceFloor ? "up" : "down"
      : undefined;
    let continuesStairRun = false;
    const stairRunId = transition.kind === "stairs" ? studentRouteVerticalTransitionRunId(route, steps, index) : null;
    if (direction && stairRunId && transition.detail?.toFloorId) {
      for (let nextIndex = index + 1; nextIndex < steps.length; nextIndex += 1) {
        const next = routeTransitionForStep(route, steps, nextIndex);
        if (!next) continue;
        if (next.kind === "enter_building" || next.kind === "exit_building") break;
        // Only call this a continuation when the authored route actually
        // leaves the current landing through the same physical stair run.
        continuesStairRun = next.kind === "stairs"
          && next.detail?.fromFloorId === transition.detail.toFloorId
          && studentRouteVerticalTransitionRunId(route, steps, nextIndex) === stairRunId;
        break;
      }
    }
    const targetFloorLabel = targetSegment ? studentRouteFloorLabel(targetSegment, "the connected Floor") : undefined;
    const displayLabel = targetFloorLabel
      ? transition.kind === "elevator"
        ? `Elevator${direction ? ` ${direction === "up" ? "Up" : "Down"}` : ""} — ${targetFloorLabel}`
        : continuesStairRun
          ? `Continue ${direction === "down" ? "Downstairs" : "Upstairs"} — ${targetFloorLabel}`
          : `Stairs${direction ? ` ${direction === "up" ? "Up" : "Down"}` : ""} — ${targetFloorLabel}`
      : undefined;
    cues.push({
      id: transition.detail.nodeId,
      kind: transition.kind,
      groupId: physicalTransitionGroupId(transition.detail, source.segment?.buildingId),
      label: step.instruction,
      ...(displayLabel ? { displayLabel } : {}),
      point,
    });
  });

  // A route's vertical transition is authored in its source context. In
  // Explore, expose a reverse inspection cue on the destination landing only
  // when the same physical shaft has a real reverse/bidirectional graph edge.
  if (context.kind === "floor") {
    for (const detail of route.transitionDetails ?? []) {
      if ((detail.kind !== "stairs" && detail.kind !== "elevator")
        || !detail.fromFloorId
        || detail.toFloorId !== context.floor.id
        || detail.buildingId && detail.buildingId !== context.buildingId) continue;
      const transitionStepIndex = steps.findIndex((_, index) => {
        const stepTransition = routeTransitionForStep(route, steps, index);
        return stepTransition?.detail?.nodeId === detail.nodeId;
      });
      if (transitionStepIndex < 0) continue;
      const segmentIndex = (route.indoorSegments ?? []).findIndex((segment) =>
        segment.buildingId === context.buildingId && segment.floorId === context.floor.id);
      if (segmentIndex < 0) continue;
      const routeNode = nodes.find((node) => node.id === detail.nodeId);
      const sharedId = detail.transitionSharedId ?? routeNode?.transitionSharedId;
      if (!sharedId) continue;
      const sourceNode = nodes.find((node) => node.buildingId === context.buildingId
        && node.floorId === detail.fromFloorId && node.transitionSharedId === sharedId);
      const destinationNode = nodes.find((node) => node.buildingId === context.buildingId
        && node.floorId === context.floor.id
        && node.transitionSharedId === sharedId
        && (detail.kind === "elevator" ? Boolean(node.elevatorId || node.type === "elevator") : Boolean(node.stairId || node.type === "stair")));
      if (!sourceNode || !destinationNode) continue;
      const reverseConnectionExists = edges.some((edge) => {
        if (edge.closed) return false;
        const reverse = edge.startNodeId === destinationNode.id && edge.endNodeId === sourceNode.id;
        const authoredBidirectional = edge.startNodeId === sourceNode.id && edge.endNodeId === destinationNode.id && edge.bidirectional;
        if (!reverse && !authoredBidirectional) return false;
        if (mode === "accessible" && (!edge.accessible || sourceNode.accessible === false || destinationNode.accessible === false)) return false;
        if (mode === "emergency" && (edge.emergencySafe === false || sourceNode.emergencySafe === false || destinationNode.emergencySafe === false)) return false;
        return true;
      });
      if (!reverseConnectionExists) continue;

      const sourceSegment = (route.indoorSegments ?? []).find((segment) =>
        segment.buildingId === context.buildingId && segment.floorId === detail.fromFloorId);
      if (!sourceSegment) continue;
      const reverseDetail: RouteTransitionDetail = {
        ...detail,
        nodeId: destinationNode.id,
        fromFloorId: detail.toFloorId,
        toFloorId: detail.fromFloorId,
      };
      const point = authoredFloorTransitionPoint(context.floor, nodes, reverseDetail);
      if (!point) continue;
      const direction = typeof sourceSegment.floorNumber === "number" && typeof context.floorNumber === "number"
        ? sourceSegment.floorNumber < context.floorNumber ? "down" : "up"
        : undefined;
      const targetFloorLabel = studentRouteFloorLabel(sourceSegment, "previous Floor");
      const instruction = detail.kind === "elevator"
        ? `Take ${detail.label} ${direction ?? "back"} to ${targetFloorLabel}.`
        : `Return ${direction === "up" ? "upstairs" : "downstairs"} to ${targetFloorLabel} using ${detail.label}.`;
      const displayLabel = detail.kind === "elevator"
        ? `Elevator${direction ? ` ${direction === "down" ? "Down" : "Up"}` : ""} · Return to ${targetFloorLabel}`
        : `Return ${direction === "up" ? "Upstairs" : "Downstairs"} · ${targetFloorLabel}`;
      cues.push({
        id: `return:${detail.nodeId}:${detail.fromFloorId}`,
        kind: detail.kind,
        groupId: physicalTransitionGroupId(reverseDetail, context.buildingId),
        label: instruction,
        displayLabel,
        point,
        returnToStepIndex: transitionStepIndex,
        viewOnSegmentIndex: segmentIndex,
      });
    }
  }

  return cues;
}

/** Pick the next authored transition cue on the context being inspected.
 * Explore uses this view-only cue to move between route legs; it never seeks
 * Follow playback or authorizes a physical transition. */
export function studentRouteExploreTransitionCue(
  route: PlannedRoute,
  steps: readonly RouteStep[],
  cues: readonly StudentRouteTransitionCue[],
  inspectedStepIndex: number,
): { cue: StudentRouteTransitionCue; transitionStepIndex: number } | null {
  return studentRouteExploreTransitionCues(route, steps, cues, inspectedStepIndex)[0] ?? null;
}

/** Label a view-only transition cue without implying that navigation advanced. */
export function studentRouteInspectionTransitionDisplayLabel(
  kind: StudentRouteTransitionKind,
  instruction: string,
): string {
  const clean = instruction.trim().replace(/[.!?]+$/, "");
  if (kind === "stairs" || kind === "elevator") {
    const target = clean.match(/\bto\s+(.+)$/i)?.[1]
      ?.split(/\s+(?:using|via)\s+/i)[0]
      .trim();
    if (target && /\b(?:floor|level)\b/i.test(target)) {
      return `View ${target.charAt(0).toLocaleUpperCase()}${target.slice(1)}`;
    }
    return kind === "stairs" ? "View Staircase" : "View Connected Floor";
  }
  if (kind === "enter_building") {
    const building = clean.match(/^(?:enter|go into)\s+(?:the\s+)?(.+)$/i)?.[1]
      ?.replace(/\s+building$/i, "").trim();
    return building ? `View ${building} interior` : "View building interior";
  }
  return "View Exit";
}

/** Return every upcoming route-authored transition on the inspected leg. */
export function studentRouteExploreTransitionCues(
  route: PlannedRoute,
  steps: readonly RouteStep[],
  cues: readonly StudentRouteTransitionCue[],
  inspectedStepIndex: number,
): Array<{ cue: StudentRouteTransitionCue; transitionStepIndex: number }> {
  if (steps.length === 0 || inspectedStepIndex < 0 || inspectedStepIndex >= steps.length) return [];
  const inspected = studentRouteExploreInspectionTarget(route, steps, inspectedStepIndex);
  const candidates = cues.flatMap((cue) => {
    const transitionStepIndex = cue.returnToStepIndex ?? studentRouteTransitionCueStepIndex(route, steps, cue.id);
    if (cue.returnToStepIndex !== undefined) {
      return inspected.context === "floor" && inspected.segmentIndex === cue.viewOnSegmentIndex
        ? [{ cue, transitionStepIndex }]
        : [];
    }
    const source = studentRouteSeekTarget(route, steps, transitionStepIndex);
    if (source.context !== inspected.context) return [];
    if (source.contextLegIndex !== undefined && inspected.contextLegIndex !== undefined
      && source.contextLegIndex !== inspected.contextLegIndex) return [];
    if (source.context === "floor" && inspected.context === "floor") {
      if (source.segment?.buildingId !== inspected.segment?.buildingId) return [];
      const sameFloor = source.segment?.floorId && inspected.segment?.floorId
        ? source.segment.floorId === inspected.segment.floorId
        : source.segment?.floorNumber === inspected.segment?.floorNumber;
      if (!sameFloor) return [];
    }
    return [{ cue, transitionStepIndex }];
  });
  return candidates.sort((left, right) => left.transitionStepIndex - right.transitionStepIndex);
}

/** Position the route preview at the middle of a meaningful instruction. */
export function routeProgressForStepIndex(steps: RouteStep[], index: number): number {
  if (steps.length < 2 || index <= 0) return 0;
  if (index >= steps.length - 1) return 1;
  const weights = steps.map((step) => Number.isFinite(step.distanceM) && (step.distanceM ?? 0) > 0 ? step.distanceM! : 0);
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (total === 0) return index / (steps.length - 1);
  const before = weights.slice(0, index).reduce((sum, value) => sum + value, 0);
  const current = weights[index] ?? 0;
  return Math.max(0, Math.min(1, (before + current / 2) / total));
}

export interface StudentRouteSeekTarget {
  context: "campus" | "floor";
  phase: "outdoor" | "origin-indoor" | "destination-indoor";
  segment: RouteIndoorSegment | null;
  segmentIndex: number;
  contextLegIndex?: number;
  /** Progress within the selected authored segment; walking steps begin at 0. */
  segmentProgress: number;
  /** Canonical progress on the outdoor route, used when the selected context is Campus. */
  routeProgress: number;
}

export interface StudentRoutePlaybackTarget extends StudentRouteSeekTarget {
  /** Continuous ordered route-step cursor used by the player during a seek. */
  position: number;
}

function studentRouteTargetForContextLeg(
  route: PlannedRoute,
  contextLegIndex: number,
  atEnd: boolean,
): StudentRouteSeekTarget | null {
  const leg = route.contextLegs?.[contextLegIndex];
  if (!leg) return null;
  const segment = leg.kind === "floor" && leg.segmentIndex !== undefined
    ? (route.indoorSegments ?? [])[leg.segmentIndex] ?? null
    : null;
  const progress = atEnd ? 1 : 0;
  return {
    context: leg.kind,
    phase: leg.kind === "campus" ? "outdoor" : segment?.afterOutdoor ? "destination-indoor" : "origin-indoor",
    segment,
    segmentIndex: leg.kind === "floor" ? leg.segmentIndex ?? -1 : -1,
    contextLegIndex,
    segmentProgress: progress,
    routeProgress: progress,
  };
}

/** Clamp explicit Previous/Next requests against the full planned sequence. */
export function studentRouteStepSeekIndex(currentIndex: number, delta: -1 | 1, totalSteps: number): number {
  return Math.max(0, Math.min(Math.max(0, totalSteps - 1), Math.trunc(currentIndex) + delta));
}

/** Resolve a human-facing route step to the already planned Campus/Floor leg.
 * Step seeking is presentation/playback navigation only; it never computes a
 * new path. Instructions between two walk legs stay at the end of the source
 * segment (the authored transition point), while the next walk starts on its
 * destination segment. */
export function studentRouteSeekTarget(
  route: PlannedRoute,
  steps: readonly RouteStep[],
  stepIndex: number,
): StudentRouteSeekTarget {
  const safeIndex = Math.max(0, Math.min(steps.length - 1, stepIndex));
  const indoorSegments = route.indoorSegments ?? [];
  const authoredLegs = route.contextLegs;
  const activeTransition = routeTransitionForStep(route, steps, safeIndex);
  if (activeTransition?.kind === "enter_building" && activeTransition.handoff) {
    const source = studentRouteTargetForContextLeg(route, activeTransition.handoff.fromContextLegIndex, true);
    if (source?.context === "campus") return source;
  }
  // Room-route guidance may be assembled from legacy steps without a stable
  // contextLegIndex. The final walk and arrival still belong to the actual
  // destination room's floor, even if an earlier floor segment has similar
  // or missing instruction metadata.
  const lastWalkIndex = steps.reduce((last, step, index) => step.icon === "walk" ? index : last, -1);
  if (route.destinationRoom && (safeIndex === lastWalkIndex || steps[safeIndex]?.icon === "arrive")) {
    const reverseDestinationSegmentIndex = [...indoorSegments].reverse().findIndex((segment) =>
      segment.buildingId === route.destinationRoom?.buildingId
      && segment.floorNumber === route.destinationRoom?.floorNumber,
    );
    const destinationSegmentIndex = reverseDestinationSegmentIndex < 0
      ? -1
      : indoorSegments.length - 1 - reverseDestinationSegmentIndex;
    const destinationSegment = destinationSegmentIndex >= 0 ? indoorSegments[destinationSegmentIndex] : undefined;
    if (destinationSegment) {
      const contextLegIndex = authoredLegs?.findIndex((leg) => leg.kind === "floor" && leg.segmentIndex === destinationSegmentIndex) ?? -1;
      const destinationTarget = contextLegIndex >= 0
        ? studentRouteTargetForContextLeg(route, contextLegIndex, steps[safeIndex]?.icon === "arrive")
        : null;
      return destinationTarget ?? {
        context: "floor",
        phase: destinationSegment.afterOutdoor ? "destination-indoor" : "origin-indoor",
        segment: destinationSegment,
        segmentIndex: destinationSegmentIndex,
        ...(destinationSegment.contextLegIndex === undefined ? {} : { contextLegIndex: destinationSegment.contextLegIndex }),
        segmentProgress: steps[safeIndex]?.icon === "arrive" ? 1 : 0,
        routeProgress: 0,
      };
    }
  }
  const authoredLegIndex = steps[safeIndex]?.contextLegIndex;
  if (authoredLegs && authoredLegIndex !== undefined) {
    const step = steps[safeIndex];
    const target = studentRouteTargetForContextLeg(
      route,
      authoredLegIndex,
      step.icon !== "walk" && step.icon !== "start",
    );
    if (target) return target;
  }
  // When a cue click lands on the first row after a handoff, trust the
  // authored destination leg even for legacy guidance rows without an
  // explicit contextLegIndex. This keeps building entry on its entry floor
  // and building exit on that building's outgoing Campus leg.
  for (let previousIndex = safeIndex - 1; previousIndex >= 0; previousIndex -= 1) {
    if (steps[previousIndex]?.icon === "walk") break;
    const previousTransition = routeTransitionForStep(route, steps, previousIndex);
    if (!previousTransition) continue;
    const step = steps[safeIndex];
    const destination = previousTransition.handoff
      ? studentRouteTargetForContextLeg(route, previousTransition.handoff.toContextLegIndex,
          safeIndex >= steps.length - 1 || step?.icon === "arrive")
      : null;
    if (destination) return destination;
    break;
  }
  const walkStepIndexes = steps.flatMap((step, index) => step.icon === "walk" ? [index] : []);
  const explicitCampusWalkOrdinal = walkStepIndexes.findIndex((index) => /\bcampus path\b/i.test(steps[index]?.instruction ?? ""));
  // Authored itinerary order is the order in which the planner emitted the
  // floor-local segments. Resolve each visible walking instruction against
  // the segment's own instruction first; use ordered adjacency only for older
  // routes whose segment metadata has no matching instruction.
  const inferredCampusWalkOrdinal = explicitCampusWalkOrdinal >= 0
    ? explicitCampusWalkOrdinal
    : walkStepIndexes.length > indoorSegments.length
      ? Math.min(indoorSegments.filter((segment) => !segment.afterOutdoor).length, walkStepIndexes.length - 1)
      : -1;
  const campusLegIndexForWalk = (walkStepIndex: number): number | undefined => {
    const authoredIndex = steps[walkStepIndex]?.contextLegIndex;
    if (authoredIndex !== undefined && authoredLegs?.[authoredIndex]?.kind === "campus") return authoredIndex;

    // Older planned routes can omit contextLegIndex on the campus walk row,
    // while the adjacent Enter/Exit step still carries the authored handoff.
    // Resolve that same leg identity here so a seek between the walk and its
    // transition interpolates along the campus polyline instead of switching
    // between unrelated endpoints at the handoff midpoint.
    let followingEntry: { stepIndex: number; contextLegIndex: number } | null = null;
    let precedingExit: { stepIndex: number; contextLegIndex: number } | null = null;
    for (let candidate = 0; candidate < steps.length; candidate += 1) {
      const transition = routeTransitionForStep(route, steps, candidate);
      const handoff = transition?.handoff;
      if (!handoff) continue;
      if (transition.kind === "enter_building"
        && candidate >= walkStepIndex
        && authoredLegs?.[handoff.fromContextLegIndex]?.kind === "campus"
        && (!followingEntry || candidate < followingEntry.stepIndex)) {
        followingEntry = { stepIndex: candidate, contextLegIndex: handoff.fromContextLegIndex };
      }
      if (transition.kind === "exit_building"
        && candidate < walkStepIndex
        && authoredLegs?.[handoff.toContextLegIndex]?.kind === "campus"
        && (!precedingExit || candidate > precedingExit.stepIndex)) {
        precedingExit = { stepIndex: candidate, contextLegIndex: handoff.toContextLegIndex };
      }
    }
    if (followingEntry) return followingEntry.contextLegIndex;
    if (precedingExit) return precedingExit.contextLegIndex;
    const onlyCampusLeg = authoredLegs?.flatMap((leg, index) => leg.kind === "campus" ? [index] : []);
    return onlyCampusLeg?.length === 1 ? onlyCampusLeg[0] : undefined;
  };
  const mapped: Array<Omit<StudentRouteSeekTarget, "segmentProgress" | "routeProgress"> & { stepIndex: number }> = [];
  let segmentCursor = 0;
  let campusAssigned = false;
  const normalizeInstruction = (instruction: string) => studentInstructionWithoutUncalibratedDistance(instruction)
    .toLocaleLowerCase()
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  walkStepIndexes.forEach((stepIndex, walkOrdinal) => {
    if (walkOrdinal === inferredCampusWalkOrdinal) {
      campusAssigned = true;
      const contextLegIndex = campusLegIndexForWalk(stepIndex);
      const campusTarget = contextLegIndex === undefined
        ? null
        : studentRouteTargetForContextLeg(route, contextLegIndex, false);
      mapped.push({
        ...(campusTarget?.context === "campus"
          ? campusTarget
          : { context: "campus" as const, phase: "outdoor" as const, segment: null, segmentIndex: -1 }),
        stepIndex,
      });
      return;
    }
    const instruction = normalizeInstruction(steps[stepIndex]?.instruction ?? "");
    let matchedIndex = -1;
    for (let index = segmentCursor; index < indoorSegments.length; index += 1) {
      const segmentInstructions = indoorSegments[index].steps.map((segmentStep) => normalizeInstruction(segmentStep.instruction));
      if (instruction && segmentInstructions.includes(instruction)) {
        matchedIndex = index;
        break;
      }
    }
    if (matchedIndex < 0 && segmentCursor < indoorSegments.length) matchedIndex = segmentCursor;
    if (matchedIndex < 0) {
      // A malformed/legacy route may omit segment metadata for a campus walk.
      // Keep it on Campus only when the planned route actually has a Campus
      // leg; vertical transitions never infer an outdoor destination.
      if (!campusAssigned && walkStepIndexes.length > indoorSegments.length) {
        campusAssigned = true;
        mapped.push({ context: "campus", phase: "outdoor", segment: null, segmentIndex: -1, stepIndex });
      }
      return;
    }
    const segment = indoorSegments[matchedIndex];
    segmentCursor = matchedIndex + 1;
    mapped.push({
      context: "floor",
      phase: segment.afterOutdoor ? "destination-indoor" : "origin-indoor",
      segment,
      segmentIndex: matchedIndex,
      stepIndex,
    });
  });
  const progressAtStepStart = routeProgressAtStepStart(steps, safeIndex);
  if (mapped.length === 0) {
    return { context: "campus", phase: "outdoor", segment: null, segmentIndex: -1, segmentProgress: 0, routeProgress: progressAtStepStart };
  }

  const matchingWalk = mapped.find((target) => target.stepIndex === safeIndex);
  if (matchingWalk) {
    return { ...matchingWalk, segmentProgress: 0, routeProgress: matchingWalk.context === "campus" ? 0 : progressAtStepStart };
  }

  // Some short room-to-building routes finish immediately after the physical
  // exit instruction. They have an authored Floor → Campus handoff but no
  // separate Campus walk instruction, so the generic "nearest walk" fallback
  // would incorrectly keep the arrival step on the source Floor. Resolve that
  // boundary from the authored handoff instead of inferring context from the
  // previous visible walking step.
  let immediatelyPreviousExitIndex = -1;
  for (let candidate = safeIndex - 1; candidate >= 0; candidate -= 1) {
    if (steps[candidate]?.icon === "walk") break;
    if (routeTransitionForStep(route, steps, candidate)?.kind === "exit_building") {
      immediatelyPreviousExitIndex = candidate;
      break;
    }
  }
  if (immediatelyPreviousExitIndex >= 0) {
    const sourceWalk = [...mapped].reverse().find((target) => target.stepIndex < immediatelyPreviousExitIndex);
    const sourceLegIndex = sourceWalk
      ? authoredLegs?.findIndex((leg) => leg.kind === "floor" && leg.segmentIndex === sourceWalk.segmentIndex) ?? -1
      : -1;
    const transition = routeTransitionForStep(route, steps, immediatelyPreviousExitIndex);
    const handoff = transition?.handoff ?? route.contextHandoffs?.find((candidate) =>
      candidate.kind === "exit_building"
      && (sourceLegIndex >= 0
        ? candidate.fromContextLegIndex === sourceLegIndex
        : candidate.buildingId === sourceWalk?.segment?.buildingId),
    );
    const campusLegIndex = handoff?.toContextLegIndex
      ?? authoredLegs?.findIndex((leg, index) => leg.kind === "campus" && (sourceLegIndex < 0 || index > sourceLegIndex))
      ?? -1;
    const atEnd = safeIndex >= steps.length - 1 || steps[safeIndex]?.icon === "arrive";
    const handoffTarget = campusLegIndex >= 0
      ? studentRouteTargetForContextLeg(route, campusLegIndex, atEnd)
      : null;
    if (handoffTarget?.context === "campus") return handoffTarget;

    // The transition itself declares that the next context is Campus even for
    // a legacy route that has no explicit context-leg record.
    if (transition?.kind === "exit_building") {
      const progress = atEnd ? 1 : 0;
      return {
        context: "campus",
        phase: "outdoor",
        segment: null,
        segmentIndex: -1,
        ...(handoff ? { contextLegIndex: handoff.toContextLegIndex } : {}),
        segmentProgress: progress,
        routeProgress: progress,
      };
    }
  }

  const previous = [...mapped].reverse().find((target) => target.stepIndex < safeIndex);
  const next = mapped.find((target) => target.stepIndex > safeIndex);
  const selected = safeIndex === 0 && next ? next : previous ?? next ?? mapped.at(-1)!;
  const atSegmentEnd = Boolean(previous && selected === previous) || safeIndex >= steps.length - 1;
  return {
    ...selected,
    segmentProgress: atSegmentEnd ? 1 : 0,
    routeProgress: selected.context === "campus" ? (atSegmentEnd ? 1 : 0) : 0,
  };
}

/** Resolve the one canonical endpoint target used by every Arrived presentation. */
export function studentRouteArrivalTarget(
  route: PlannedRoute | null | undefined,
  steps: readonly RouteStep[],
): StudentRouteSeekTarget | null {
  if (!route || steps.length === 0 || steps.at(-1)?.icon !== "arrive") return null;
  return studentRouteSeekTarget(route, steps, steps.length - 1);
}

/** Canonical arrival gate shared by playback completion and manual seeking.
 * Animation callbacks do not own arrival: the route cursor, destination
 * context and endpoint progress must all agree, with no physical handoff in
 * flight. */
export function studentRouteReachedFinalEndpoint(options: {
  route: PlannedRoute | null | undefined;
  steps: readonly RouteStep[];
  cursor: number;
  context: "campus" | "floor";
  phase: string;
  segment?: RouteIndoorSegment | null;
  progress: number;
  pendingTransition?: boolean;
}): boolean {
  const { route, steps } = options;
  if (!route || steps.length === 0 || options.pendingTransition) return false;
  const finalIndex = steps.length - 1;
  const endpoint = studentRouteArrivalTarget(route, steps);
  if (!endpoint || options.cursor < finalIndex - 0.000001
    || routeTransitionForStep(route, steps, finalIndex)
    || options.progress < 1 - 0.000001) return false;
  if (endpoint.context !== options.context || endpoint.phase !== options.phase) return false;
  if (endpoint.context === "campus") return options.phase === "outdoor";
  if (!endpoint.segment || !options.segment) return false;
  return endpoint.segment.buildingId === options.segment.buildingId
    && (endpoint.segment.floorId && options.segment.floorId
      ? endpoint.segment.floorId === options.segment.floorId
      : endpoint.segment.floorNumber === options.segment.floorNumber);
}

/** Resolve the Campus polyline owned by the currently inspected canonical
 * step. A building entry remains on its source-side Campus leg until Continue;
 * after a building exit, the next Campus walk resolves to that building's own
 * outgoing leg instead of reusing route-wide progress from an earlier leg. */
export function studentRouteCampusMarkerTarget(
  route: PlannedRoute,
  steps: readonly RouteStep[],
  stepIndex: number,
): { contextLegIndex: number; leg: RouteContextLeg } | null {
  const target = studentRouteSeekTarget(route, steps, stepIndex);
  if (target.context !== "campus" || target.contextLegIndex === undefined) return null;
  const leg = route.contextLegs?.[target.contextLegIndex];
  return leg?.kind === "campus" ? { contextLegIndex: target.contextLegIndex, leg } : null;
}

/**
 * Resolve the presentation context after inspecting a planned transition in
 * Explore. This deliberately reuses the canonical transition/step resolvers;
 * callers may display the returned target without writing the Follow cursor.
 */
export function studentRouteExploreTransitionTarget(
  route: PlannedRoute,
  steps: readonly RouteStep[],
  transitionStepIndex: number,
): { transition: NonNullable<ReturnType<typeof routeTransitionForStep>>; targetStepIndex: number; target: StudentRouteSeekTarget } | null {
  const transition = routeTransitionForStep(route, steps, transitionStepIndex);
  if (!transition || steps.length === 0) return null;
  const nextIndex = Math.min(steps.length - 1, Math.max(0, transitionStepIndex) + 1);
  let targetStepIndex = nextIndex;
  let resolvedVerticalDestination = false;
  if ((transition.kind === "elevator" || transition.kind === "stairs") && transition.detail?.toFloorId) {
    const source = studentRouteSeekTarget(route, steps, transitionStepIndex);
    const buildingId = transition.detail.buildingId ?? source.segment?.buildingId;
    const expectedBuildingId = buildingId
      ?? (transition.handoff ? route.contextLegs?.[transition.handoff.toContextLegIndex]?.buildingId : undefined);
    for (let candidate = nextIndex; candidate < steps.length; candidate += 1) {
      const candidateTarget = studentRouteSeekTarget(route, steps, candidate);
      const candidateLeg = candidateTarget.contextLegIndex === undefined
        ? undefined
        : route.contextLegs?.[candidateTarget.contextLegIndex];
      const candidateSegment = candidateTarget.segment
        ?? (candidateLeg?.segmentIndex === undefined ? undefined : route.indoorSegments?.[candidateLeg.segmentIndex]);
      const candidateFloorId = candidateSegment?.floorId ?? candidateLeg?.floorId;
      const candidateBuildingId = candidateSegment?.buildingId ?? candidateLeg?.buildingId;
      const isAuthoredDestinationFloor = candidateTarget.context === "floor"
        && candidateFloorId === transition.detail?.toFloorId
        && (!expectedBuildingId || candidateBuildingId === expectedBuildingId);
      if (isAuthoredDestinationFloor) {
        targetStepIndex = candidate;
        resolvedVerticalDestination = true;
        break;
      }
      // A route may have several elevator/stair edges across zero-walk
      // landings. Keep searching those authored vertical handoffs, but never
      // cross into another Building or a Campus handoff while looking for the
      // resolved destination Floor.
      if (candidateTarget.context === "campus") break;
      if (candidateTarget.context === "floor" && expectedBuildingId
        && candidateBuildingId && candidateBuildingId !== expectedBuildingId) break;
      const candidateTransition = routeTransitionForStep(route, steps, candidate);
      if (candidateTransition && candidateTransition.kind !== "elevator" && candidateTransition.kind !== "stairs") break;
    }
  }
  if (!resolvedVerticalDestination && transition.handoff) {
    for (let candidate = nextIndex; candidate < steps.length; candidate += 1) {
      const candidateTarget = studentRouteSeekTarget(route, steps, candidate);
      if (candidateTarget.contextLegIndex === transition.handoff.toContextLegIndex) {
        targetStepIndex = candidate;
        break;
      }
      // The first row after a physical handoff is its authored destination
      // boundary; do not scan across a later route transition looking for a
      // coincidentally matching Floor.
      if (candidate > nextIndex && routeTransitionForStep(route, steps, candidate)) break;
    }
  }
  return {
    transition,
    targetStepIndex,
    target: studentRouteSeekTarget(route, steps, targetStepIndex),
  };
}

/** Resolve the location described by an Explore instruction. A transition
 * instruction is anchored at its source boundary; activating its separate map
 * cue is what opens the authored destination context. */
export function studentRouteExploreInspectionTarget(
  route: PlannedRoute,
  steps: readonly RouteStep[],
  inspectedStepIndex: number,
): StudentRouteSeekTarget {
  return studentRouteSeekTarget(route, steps, inspectedStepIndex);
}

/**
 * Resolve a fractional cursor between canonical route-step boundaries. Within
 * one authored leg, progress interpolates along that leg's existing geometry.
 * At a Building/Floor handoff, the cursor stays at the source boundary, then
 * switches to the destination boundary halfway through the short transition.
 */
export function studentRoutePlaybackTarget(
  route: PlannedRoute,
  steps: readonly RouteStep[],
  position: number,
): StudentRoutePlaybackTarget {
  const last = Math.max(0, steps.length - 1);
  const bounded = Math.max(0, Math.min(last, Number.isFinite(position) ? position : 0));
  const fromIndex = Math.floor(bounded);
  const toIndex = Math.min(last, fromIndex + 1);
  const fraction = bounded - fromIndex;
  const from = studentRouteSeekTarget(route, steps, fromIndex);
  if (fromIndex === toIndex || fraction <= 0) return { ...from, position: bounded };
  const to = studentRouteSeekTarget(route, steps, toIndex);
  const sameLeg = from.context === to.context
    && from.phase === to.phase
    && from.segmentIndex === to.segmentIndex
    && from.contextLegIndex === to.contextLegIndex;
  if (!sameLeg) return { ...(fraction < 0.5 ? from : to), position: bounded };
  return {
    ...from,
    routeProgress: from.routeProgress + (to.routeProgress - from.routeProgress) * fraction,
    segmentProgress: from.segmentProgress + (to.segmentProgress - from.segmentProgress) * fraction,
    position: bounded,
  };
}

/** Estimate only the authored distance traversed by a manual seek. Context
 * handoffs contribute no artificial straight-line distance: the map changes
 * context at the handoff and each continuous leg is measured independently. */
export function studentRouteSeekDistanceM(
  route: PlannedRoute,
  steps: readonly RouteStep[],
  fromPosition: number,
  toPosition: number,
): number {
  if (steps.length < 2 || !Number.isFinite(fromPosition) || !Number.isFinite(toPosition)) return 0;
  const from = Math.max(0, Math.min(steps.length - 1, fromPosition));
  const to = Math.max(0, Math.min(steps.length - 1, toPosition));
  if (from === to) return 0;
  const lower = Math.min(from, to);
  const upper = Math.max(from, to);
  const boundaries = [lower];
  for (let index = Math.floor(lower) + 1; index < upper; index += 1) boundaries.push(index);
  boundaries.push(upper);

  let distance = 0;
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = studentRoutePlaybackTarget(route, steps, boundaries[index]);
    const end = studentRoutePlaybackTarget(route, steps, boundaries[index + 1]);
    const sameLeg = start.context === end.context
      && start.phase === end.phase
      && start.segmentIndex === end.segmentIndex
      && start.contextLegIndex === end.contextLegIndex;
    if (!sameLeg) continue;
    const startProgress = start.context === "floor" ? start.segmentProgress : start.routeProgress;
    const endProgress = end.context === "floor" ? end.segmentProgress : end.routeProgress;
    const contextDistance = start.contextLegIndex === undefined
      ? undefined
      : route.contextLegs?.[start.contextLegIndex]?.distanceM;
    const legDistance = contextDistance
      ?? start.segment?.distanceM
      ?? (start.context === "campus" ? route.dist : 0);
    if (Number.isFinite(legDistance) && legDistance > 0) {
      distance += legDistance * Math.abs(endProgress - startProgress);
    }
  }
  return distance;
}

/**
 * Measure only the authored map geometry crossed by a seek. This is a visual
 * distance fallback for legacy legs whose physical distance metadata is zero;
 * context handoffs still contribute no artificial line between buildings or
 * floors.
 */
export function studentRouteSeekGeometryDistance(
  route: PlannedRoute,
  steps: readonly RouteStep[],
  fromPosition: number,
  toPosition: number,
): number {
  if (steps.length < 2 || !Number.isFinite(fromPosition) || !Number.isFinite(toPosition)) return 0;
  const from = Math.max(0, Math.min(steps.length - 1, fromPosition));
  const to = Math.max(0, Math.min(steps.length - 1, toPosition));
  if (from === to) return 0;
  const lower = Math.min(from, to);
  const upper = Math.max(from, to);
  const boundaries = [lower];
  for (let index = Math.floor(lower) + 1; index < upper; index += 1) boundaries.push(index);
  boundaries.push(upper);
  let distance = 0;
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = studentRoutePlaybackTarget(route, steps, boundaries[index]);
    const end = studentRoutePlaybackTarget(route, steps, boundaries[index + 1]);
    if (start.context !== end.context || start.phase !== end.phase
      || start.segmentIndex !== end.segmentIndex || start.contextLegIndex !== end.contextLegIndex) continue;
    const context = start.contextLegIndex === undefined ? undefined : route.contextLegs?.[start.contextLegIndex];
    const points = start.context === "floor"
      ? start.segment?.waypoints ?? context?.waypoints ?? []
      : context?.waypoints ?? route.campusPoints ?? route.points;
    let length = 0;
    for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
      length += Math.hypot(points[pointIndex].x - points[pointIndex - 1].x, points[pointIndex].y - points[pointIndex - 1].y);
    }
    const startProgress = start.context === "floor" ? start.segmentProgress : start.routeProgress;
    const endProgress = end.context === "floor" ? end.segmentProgress : end.routeProgress;
    distance += length * Math.abs(endProgress - startProgress);
  }
  return distance;
}

/** Find the ordered walk-step cursor for a currently rendered authored leg. */
export function studentRoutePositionForLeg(
  route: PlannedRoute,
  steps: readonly RouteStep[],
  phase: StudentRouteSeekTarget["phase"],
  segment: RouteIndoorSegment | null,
  progress: number,
  currentPosition = 0,
  contextLegIndex?: number,
): number {
  const walkIndices = steps.flatMap((step, index) => step.icon === "walk" ? [index] : []);
  const matchingWalks: number[] = [];
  for (const stepIndex of walkIndices) {
    const target = studentRouteSeekTarget(route, steps, stepIndex);
    if (target.phase === phase
      && target.segmentIndex === (segment ? (route.indoorSegments ?? []).indexOf(segment) : -1)
      && (contextLegIndex === undefined || target.contextLegIndex === contextLegIndex)) {
      matchingWalks.push(stepIndex);
    }
  }

  // Some published routes contain authored indoor segments that have no
  // matching student-facing instruction (for example, a connector segment
  // emitted by the graph). When that happens, resetting to step zero makes
  // the player, instruction, and visible Floor disagree at a context handoff.
  // Keep the canonical cursor already established by the route transition.
  const boundedCurrent = Math.max(0, Math.min(Math.max(0, steps.length - 1), Number.isFinite(currentPosition) ? currentPosition : 0));
  const stepIndex = matchingWalks.find((candidate) => candidate >= Math.floor(boundedCurrent));
  if (stepIndex === undefined) return boundedCurrent;

  // The current walk owns every position strictly before its endpoint. At
  // the endpoint the next canonical step becomes active exactly once.
  const boundedProgress = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  const cursor = boundedProgress >= 1 ? stepIndex + 1 : stepIndex + boundedProgress;
  return Math.min(Math.max(0, steps.length - 1), cursor);
}

/** Put a seek at the beginning of the selected instruction. A tiny interior
 * offset keeps the progress-to-step resolver on that step at exact boundaries. */
export function routeProgressAtStepStart(steps: readonly RouteStep[], index: number): number {
  if (steps.length < 2 || index <= 0) return 0;
  if (index >= steps.length - 1) return 1;
  const weights = steps.map((step) => Number.isFinite(step.distanceM) && (step.distanceM ?? 0) > 0 ? step.distanceM! : 0);
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return Math.min(0.999999, (index + 0.001) / steps.length);
  const before = weights.slice(0, index).reduce((sum, value) => sum + value, 0);
  const epsilon = Math.min(0.0001, Math.max(0.000001, (weights[index] || total) / total * 0.001));
  return Math.min(0.999999, before / total + epsilon);
}

/** Only authored graph facts are shown; no SVG-unit metre or time estimates. */
export function studentRouteFacts(route: PlannedRoute, preference: "best" | "stairs" | "elevator"): string[] {
  const facts: string[] = [];
  const hasCampusLeg = (route.campusPoints ?? route.points).length > 1;
  const indoorSegments = route.indoorSegments ?? [];
  facts.push(indoorSegments.length > 0 ? (hasCampusLeg ? "Indoor + outdoor" : "Indoor route") : "Outdoor route");

  const transitions = route.transitionDetails ?? [];
  const transitionKinds = [...new Set(transitions.map((item) => item.kind))];
  if (transitionKinds.includes("elevator")) facts.push("Elevator");
  if (transitionKinds.includes("stairs")) facts.push("Stairs");
  if (transitions.length === 0 && route.transitions.some((label) => /elevator/i.test(label))) facts.push("Elevator");
  if (transitions.length === 0 && route.transitions.some((label) => /stairs?/i.test(label))) facts.push("Stairs");

  const entries = route.steps.filter((step) => step.icon === "enter" && !/^\s*exit\b/i.test(step.instruction)).length;
  if (entries > 0) facts.push(`${entries} building ${entries === 1 ? "entry" : "entries"}`);
  const floors = [...new Set(indoorSegments.map((segment) => segment.floorLabel
    || (segment.floorNumber === undefined ? undefined : `Floor ${segment.floorNumber}`))
    .filter((value): value is string => Boolean(value)))];
  if (floors.length > 1) facts.push(`${floors[0]} → ${floors[floors.length - 1]}`);
  if (route.mode === "accessible") facts.push("Accessible");
  else if (route.mode === "emergency") facts.push("Emergency route");
  else if (preference !== "best") {
    const preferredKind = preference === "stairs" ? "stairs" : "elevator";
    if (transitions.length > 0 && !transitionKinds.includes(preferredKind)) {
      facts.push(preference === "stairs" ? "No stair route available" : "No elevator route available");
    } else {
      facts.push(preference === "stairs" ? "Prefers stairs" : "Prefers elevator");
    }
  }
  return [...new Set(facts)];
}

/** Explain when a Standard route could not honor a requested vertical mode.
 * Preference remains a ranking hint, so the pathfinder may return the best
 * complete route when the preferred connector is not traversable. */
export function studentRoutePreferenceFallbackNotice(
  route: PlannedRoute | null | undefined,
  preference: "best" | "stairs" | "elevator",
): string | null {
  if (!route || route.mode !== "standard" || preference === "best") return null;
  const kinds = route.transitionDetails?.map((transition) => transition.kind)
    ?? route.transitions.map((transition) => /elevator|lift/i.test(transition) ? "elevator" : /stairs?/i.test(transition) ? "stairs" : null)
      .filter((kind): kind is "stairs" | "elevator" => kind !== null);
  if (kinds.length === 0 || kinds.includes(preference)) return null;

  const actual = kinds.includes("elevator") ? "the elevator" : "the stairs";
  return `No connected route using ${preference} is available; this route uses ${actual}.`;
}

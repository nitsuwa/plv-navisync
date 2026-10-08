import type { PlannedRoute, RouteIndoorSegment, RouteStep, RouteTransitionDetail } from "./routePlanner";
import type { FloorPlan, NavigationNode } from "../components/map-builder/types";
import { pointAlongPolyline } from "./geo";

export type StudentRoutePhase = "idle" | "planning" | "preview" | "navigating" | "arrived";
export type StudentPlaybackState = "playing" | "paused";
export type StudentCameraMode = "follow" | "explore";

export interface StudentRouteFocusTarget {
  context: "campus" | "floor";
  point: { x: number; y: number };
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

export type StudentRouteUiAction =
  | { type: "OPEN_PLAN" }
  | { type: "FOUND_ROUTE" }
  | { type: "EDIT_ROUTE" }
  | { type: "START_NAVIGATION" }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "ENTER_EXPLORE" }
  | { type: "RECENTER" }
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
      return { ...state, phase: "preview", playback: "paused", resumePlaybackAfterExplore: null, camera: "explore", collapsed: false };
    case "EDIT_ROUTE":
      return { ...state, phase: "planning", playback: "paused", collapsed: false };
    case "START_NAVIGATION":
      return { ...state, phase: "navigating", playback: "playing", resumePlaybackAfterExplore: null, camera: "follow", collapsed: true };
    case "PAUSE":
      return state.phase === "navigating"
        ? state.camera === "explore"
          ? { ...state, playback: "paused", resumePlaybackAfterExplore: "paused" }
          : { ...state, playback: "paused" }
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
    case "RECENTER":
      return state.phase === "navigating"
        ? { ...state, camera: "follow", playback: state.resumePlaybackAfterExplore ?? state.playback, resumePlaybackAfterExplore: null }
        : state;
    case "COLLAPSE":
      return state.phase === "planning" ? state : { ...state, collapsed: true };
    case "EXPAND":
      return { ...state, collapsed: false };
    case "END_NAVIGATION":
      return { ...state, phase: "preview", playback: "paused", resumePlaybackAfterExplore: null, camera: "explore", collapsed: false };
    case "ARRIVE":
      return state.phase === "navigating" && state.playback === "playing"
        ? { ...state, phase: "arrived", playback: "paused", resumePlaybackAfterExplore: null }
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
  authoredSteps.forEach((step, index) => {
    if (step.icon !== "elevator") return;
    const resolved = routeTransitionForStep(route, route.steps, index)?.detail;
    if (!resolved?.toFloorId) return;
    const originalStepIndex = route.steps.findIndex((candidate) => candidate.id === step.id);
    const originalDetails = route.transitionDetails ?? [];
    const precedingElevators = route.steps.slice(0, Math.max(0, originalStepIndex)).filter((candidate) => candidate.icon === "elevator").length;
    const original = originalDetails.filter((detail) => detail.kind === "elevator")[precedingElevators];
    if (!original || original.toFloorId === resolved.toFloorId) return;
    const sourceSegment = route.indoorSegments?.find((segment) => segment.floorId === original.fromFloorId);
    const targetSegment = route.indoorSegments?.find((segment) => segment.floorId === resolved.toFloorId
      && (!sourceSegment || segment.buildingId === sourceSegment.buildingId)
      && Boolean(segment.afterOutdoor) === Boolean(sourceSegment?.afterOutdoor));
    if (!targetSegment) return;
    const normalize = (instruction: string) => studentInstructionWithoutUncalibratedDistance(instruction)
      .toLocaleLowerCase().replace(/[.!?]+$/g, "").replace(/\s+/g, " ").trim();
    const targetInstruction = targetSegment.steps[0]?.instruction;
    const targetWalkIndex = targetInstruction
      ? route.steps.findIndex((candidate, candidateIndex) => candidateIndex > index
        && candidate.icon === "walk" && normalize(candidate.instruction) === normalize(targetInstruction))
      : -1;
    if (targetWalkIndex <= index + 1) return;
    for (let skipped = index + 1; skipped < targetWalkIndex; skipped += 1) hidden.add(skipped);
    const targetFloor = targetSegment.floorNumber === undefined
      ? "the connected Floor"
      : targetSegment.floorNumber === 1 ? "Ground Floor" : `Floor ${targetSegment.floorNumber}`;
    const label = resolved.label.trim() || "elevator";
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
  }
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
): number {
  let stepIndex = steps.findIndex((step, index) => step.icon === "walk"
    && studentRouteSeekTarget(route, steps, index).segment === segment);
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

/** Resolve the authored transition associated with one human-facing instruction. */
export function routeTransitionForStep(
  route: PlannedRoute,
  steps: readonly RouteStep[],
  stepIndex: number,
): { kind: StudentRouteTransitionKind; detail?: RouteTransitionDetail } | null {
  const step = steps[stepIndex];
  if (!step) return null;
  if (step.icon === "enter") {
    return { kind: /^\s*exit\b/i.test(step.instruction) ? "exit_building" : "enter_building" };
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
  const namedMatches = orderedDetails.filter((detail) => detail.label.trim().length > 0
    && instruction.includes(detail.label.trim().toLocaleLowerCase()));
  // Authored stair/elevator labels are often repeated (for example, "Left
  // Stair" on several Floors). Keep each one associated with its route-order
  // occurrence instead of repeatedly resolving the first identical label.
  if (orderedMatch && instruction.includes(orderedMatch.label.trim().toLocaleLowerCase())) {
    return { kind, detail: resolveDirectElevatorTarget(route, orderedMatch) };
  }
  if (namedMatches.length === 1) return { kind, detail: resolveDirectElevatorTarget(route, namedMatches[0]) };
  if (namedMatches.length > 1) {
    const orderedNamedMatch = namedMatches.find((detail) => detail.nodeId === orderedMatch?.nodeId);
    if (orderedNamedMatch) return { kind, detail: resolveDirectElevatorTarget(route, orderedNamedMatch) };
  }
  // Legacy instructions may omit an authored marker label. Preserve route
  // order so repeated stairs/elevators still resolve to their correct shaft.
  return { kind, ...(orderedMatch ? { detail: resolveDirectElevatorTarget(route, orderedMatch) } : {}) };
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
    if (!intermediate || intermediate.distanceM > 0.1) break;
    last = next;
  }
  return last === transition ? transition : { ...transition, toFloorId: last.toFloorId };
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
  point: { x: number; y: number };
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
): StudentRouteTransitionCue[] {
  const cues: StudentRouteTransitionCue[] = [];
  const campusPoints = route.campusPoints?.length ? route.campusPoints : route.points;

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
        point = campusPoints.at(-1);
      } else {
        point = isExit && context.kind === "floor" ? source.segment?.waypoints.at(-1) : undefined;
      }
      if (point) cues.push({ id: step.id, kind: transition.kind, label: step.instruction, point });
      return;
    }

    if (context.kind !== "floor" || !transition.detail
      || transition.detail.fromFloorId && source.segment?.floorId
        && transition.detail.fromFloorId !== source.segment.floorId) return;
    const point = authoredFloorTransitionPoint(context.floor, nodes, transition.detail);
    if (point) cues.push({ id: transition.detail.nodeId, kind: transition.kind, label: step.instruction, point });
  });

  return cues;
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
  /** Progress within the selected authored segment; walking steps begin at 0. */
  segmentProgress: number;
  /** Canonical progress on the outdoor route, used when the selected context is Campus. */
  routeProgress: number;
}

export interface StudentRoutePlaybackTarget extends StudentRouteSeekTarget {
  /** Continuous ordered route-step cursor used by the player during a seek. */
  position: number;
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
      mapped.push({ context: "campus", phase: "outdoor", segment: null, segmentIndex: -1, stepIndex });
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
    && from.segmentIndex === to.segmentIndex;
  if (!sameLeg) return { ...(fraction < 0.5 ? from : to), position: bounded };
  return {
    ...from,
    routeProgress: from.routeProgress + (to.routeProgress - from.routeProgress) * fraction,
    segmentProgress: from.segmentProgress + (to.segmentProgress - from.segmentProgress) * fraction,
    position: bounded,
  };
}

/** Find the ordered walk-step cursor for a currently rendered authored leg. */
export function studentRoutePositionForLeg(
  route: PlannedRoute,
  steps: readonly RouteStep[],
  phase: StudentRouteSeekTarget["phase"],
  segment: RouteIndoorSegment | null,
  progress: number,
): number {
  const walkIndices = steps.flatMap((step, index) => step.icon === "walk" ? [index] : []);
  for (const stepIndex of walkIndices) {
    const target = studentRouteSeekTarget(route, steps, stepIndex);
    if (target.phase === phase && target.segmentIndex === (segment ? (route.indoorSegments ?? []).indexOf(segment) : -1)) {
      // The current walk owns every position strictly before its endpoint.
      // At the endpoint the next canonical step becomes active exactly once.
      // Capping at .999 kept the walk highlighted forever and led the UI to
      // compensate by showing the next transition early using a loose .78
      // progress threshold.
      const boundedProgress = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
      const cursor = boundedProgress >= 1 ? stepIndex + 1 : stepIndex + boundedProgress;
      return Math.min(Math.max(0, steps.length - 1), cursor);
    }
  }
  return 0;
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

  const entries = route.steps.filter((step) => step.icon === "enter").length;
  if (entries > 0) facts.push(`${entries} building ${entries === 1 ? "entry" : "entries"}`);
  const floors = [...new Set(indoorSegments.map((segment) => segment.floorNumber).filter((value): value is number => Number.isFinite(value)))];
  if (floors.length > 1) facts.push(`Floor ${floors[0]} → Floor ${floors[floors.length - 1]}`);
  if (route.mode === "accessible") facts.push("Accessible");
  else if (route.mode === "emergency") facts.push("Emergency route");
  else if (preference !== "best") facts.push(preference === "stairs" ? "Prefers stairs" : "Prefers elevator");
  return [...new Set(facts)];
}

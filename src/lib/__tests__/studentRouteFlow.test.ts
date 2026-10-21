import { describe, expect, it } from "vitest";
import type { PlannedRoute } from "../routePlanner";
import type { FloorPlan, NavigationEdge, NavigationNode } from "../../components/map-builder/types";
import {
  authoredFloorTransitionPoint,
  canonicalActiveRouteStepIndex,
  initialStudentRouteUiState,
  panForRouteFocusPoint,
  routeStepIndexForProgress,
  routeStepIndexForAuthoredTransition,
  routeStepIndexForBuildingTransition,
  routeProgressForStepIndex,
  studentRouteSeekTarget,
  studentRouteArrivalTarget,
  studentRouteArrivalCameraPoint,
  studentRouteInitialPhysicalTransitionStepIndex,
  studentRouteInitialContext,
  studentRouteReachedFinalEndpoint,
  studentRouteCampusMarkerTarget,
  studentRouteExploreTransitionTarget,
  studentRouteExploreInspectionTarget,
  studentRouteExploreTransitionCue,
  studentRouteExploreTransitionCues,
  studentRouteInspectionTransitionDisplayLabel,
  groupStudentRouteExploreTransitions,
  studentRoutePreviewTransitionTarget,
  studentRouteTransitionCueStepIndex,
  studentRoutePlaybackTarget,
  studentRouteSeekDistanceM,
  studentRouteSeekGeometryDistance,
  studentRouteStepSeekIndex,
  studentRoomFocusTargetId,
  screenSpaceMarkerScale,
  studentOverviewDuplicateIds,
  studentTransitionMarkerLodScale,
  studentIndoorSegmentForFloor,
  studentRouteStepInstruction,
  studentRouteFloorLabel,
  studentRouteProgressForIndoorSegment,
  studentRouteShouldPauseAtZeroWalkVerticalAccess,
  routeTransitionForStep,
  studentFacingRouteSteps,
  studentRouteFacts,
  studentRoutePreferenceFallbackNotice,
  studentInstructionWithoutUncalibratedDistance,
  studentDisplayedRouteProgress,
  studentRouteFocusAtProgress,
  studentRoutePositionForLeg,
  studentRouteVerticalTransitionGroupId,
  studentRouteVerticalTransitionContinuesRun,
  studentRouteVerticalTransitionRunId,
  studentRoutePrimaryAction,
  studentRouteCanResumeAfterTransition,
  studentRouteFollowNeedsCameraReacquisition,
  studentRouteFollowOwnsCamera,
  studentRoutePlaybackAfterCameraReacquisition,
  studentRoutePauseReasonAfterCameraReacquisition,
  studentRouteTransitionCues,
  studentRouteUiReducer,
} from "../studentRouteFlow";

const sampleRoute: PlannedRoute = {
  points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
  campusPoints: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
  indoorSegments: [
    { buildingId: "science", floorNumber: 1, waypoints: [{ x: 0, y: 0 }], distanceM: 0, seconds: 0, steps: [] },
    { buildingId: "science", floorNumber: 4, waypoints: [{ x: 2, y: 2 }], distanceM: 10, seconds: 10, steps: [] },
  ],
  dist: 1000,
  mins: 999,
  steps: [
    { id: "start", icon: "start", instruction: "Start at Campus Gate." },
    { id: "noise", icon: "walk", instruction: "Continue to floor waypoint 14." },
    { id: "elevator", icon: "elevator", instruction: "Take the elevator to Floor 4." },
    { id: "arrive", icon: "arrive", instruction: "Arrive at the destination." },
  ],
  isGraphBased: true,
  isAuthoredGraph: true,
  mode: "standard",
  fromCode: "GATE",
  toCode: "SCI",
  transitions: ["Elevator to Floor 4"],
  transitionDetails: [{ kind: "elevator", nodeId: "lift", label: "Main elevator" }],
};

describe("student route state flow", () => {
  it("keeps world-anchored transition glyphs screen-sized across viewport scale and camera zoom", () => {
    expect(screenSpaceMarkerScale(1, 1)).toBe(1);
    expect(screenSpaceMarkerScale(3, 0.5)).toBe(6);
    expect(screenSpaceMarkerScale(0, 2)).toBe(1);
  });

  it("does not auto-resume a route transition while video handoff pause is latched", () => {
    expect(studentRouteCanResumeAfterTransition(true, false)).toBe(true);
    expect(studentRouteCanResumeAfterTransition(true, true)).toBe(false);
    expect(studentRouteCanResumeAfterTransition(false, false)).toBe(false);
  });

  it("shrinks transition marker artwork smoothly for far overview without shrinking touch targets", () => {
    expect(studentTransitionMarkerLodScale(1)).toBe(1);
    expect(studentTransitionMarkerLodScale(0.7)).toBeLessThan(1);
    expect(studentTransitionMarkerLodScale(0.2)).toBeLessThan(studentTransitionMarkerLodScale(0.35));
    expect(studentTransitionMarkerLodScale(0.15)).toBeGreaterThan(0.3);
  });

  it("condenses same-direction overview badges without changing any doorway coordinate", () => {
    const entries = [
      { id: "a", x: 100, y: 100, direction: "both" },
      { id: "b", x: 102, y: 100, direction: "both" },
      { id: "one-way", x: 103, y: 100, direction: "exit_only" },
    ];
    expect([...studentOverviewDuplicateIds(entries)]).toEqual(["b"]);
    expect([...studentOverviewDuplicateIds(entries, "b")]).toEqual(["a"]);
    expect(entries[1]).toEqual({ id: "b", x: 102, y: 100, direction: "both" });
  });

  it("renders a structured route step as its instruction text and resolves authored Floor segments", () => {
    const steps = studentFacingRouteSteps(sampleRoute);
    expect(studentRouteStepInstruction(steps, 1, "Destination")).toBe("Take the elevator to Floor 4.");
    expect(typeof studentRouteStepInstruction(steps, 1, "Destination")).toBe("string");
    expect(studentIndoorSegmentForFloor(sampleRoute, "science", undefined, 1)).toBe(sampleRoute.indoorSegments?.[0]);
    expect(studentIndoorSegmentForFloor(sampleRoute, "science", undefined, 4)).toBe(sampleRoute.indoorSegments?.[1]);
    expect(studentIndoorSegmentForFloor(sampleRoute, "science", undefined, 2)).toBeNull();
  });

  it("maps indoor playback to the corresponding route instruction rather than resetting to step one", () => {
    const first = { buildingId: "science", floorId: "floor-1", floorNumber: 1, afterOutdoor: true, waypoints: [{ x: 0, y: 0 }, { x: 5, y: 5 }], distanceM: 20, seconds: 10, steps: [{ id: "walk-1", icon: "walk" as const, instruction: "Follow the indoor path to the elevator.", distanceM: 20 }] };
    const second = { buildingId: "science", floorId: "floor-4", floorNumber: 4, afterOutdoor: true, waypoints: [{ x: 5, y: 5 }, { x: 20, y: 20 }], distanceM: 40, seconds: 20, steps: [{ id: "walk-2", icon: "walk" as const, instruction: "Follow the indoor path to the door of Room 402.", distanceM: 40 }] };
    const route = { ...sampleRoute, indoorSegments: [first, second], steps: [
      { id: "start", icon: "start" as const, instruction: "Start at Campus Gate." },
      first.steps[0],
      { id: "lift", icon: "elevator" as const, instruction: "Take the elevator to Floor 4." },
      second.steps[0],
      { id: "arrive", icon: "arrive" as const, instruction: "Arrive at Room 402." },
    ] };
    const steps = studentFacingRouteSteps(route);
    expect(studentRouteProgressForIndoorSegment(route, steps, first, 0.5)).toBeCloseTo(1 / 6);
    expect(studentRouteProgressForIndoorSegment(route, steps, second, 0.5)).toBeCloseTo(2 / 3);
  });

  it("groups only zero-walk intermediate Floors on the same authored stair shaft", () => {
    const floors = [5, 4, 3, 2, 1].map((number, index) => ({
      buildingId: "coed",
      floorId: `coed-${number}`,
      floorNumber: number,
      floorLabel: number === 1 ? "Ground Floor" : `Floor ${number}`,
      afterOutdoor: true,
      waypoints: [{ x: index, y: index }],
      distanceM: 0,
      seconds: 0,
      steps: [],
    }));
    const details = floors.slice(0, -1).map((floor, index) => ({
      kind: "stairs" as const,
      nodeId: `left-stair-${index}`,
      label: "Left Stair",
      fromFloorId: floor.floorId,
      toFloorId: floors[index + 1].floorId,
      transitionSharedId: "coed-left-stair",
      buildingId: "coed",
    }));
    const handoffs = details.map((detail, index) => ({
      fromContextLegIndex: index,
      toContextLegIndex: index + 1,
      kind: "stairs" as const,
      buildingId: "coed",
      label: "Left Stair",
      nodeId: detail.nodeId,
      detail,
      sourcePoint: { x: index, y: index },
      targetPoint: { x: index + 1, y: index + 1 },
    }));
    const steps = [
      { id: "start", icon: "start" as const, instruction: "Start on Floor 5.", contextLegIndex: 0 },
      { id: "walk-5", icon: "walk" as const, instruction: "Follow the indoor path to the Left Stair.", contextLegIndex: 0 },
      ...details.map((detail, index) => ({
        id: `transition-${index}`,
        icon: "stairs" as const,
        instruction: `Take the Left Stair down to Floor ${4 - index}.`,
        contextLegIndex: index,
        contextHandoffIndex: index,
      })),
      { id: "walk-1", icon: "walk" as const, instruction: "Follow the indoor path to your destination.", contextLegIndex: 4 },
      { id: "arrive", icon: "arrive" as const, instruction: "Arrive on Ground Floor.", contextLegIndex: 4 },
    ];
    const contextLegs = floors.map((segment, segmentIndex) => ({
      kind: "floor" as const,
      buildingId: "coed",
      floorId: segment.floorId,
      floorNumber: segment.floorNumber,
      floorLabel: segment.floorLabel,
      segmentIndex,
      waypoints: segment.waypoints,
      distanceM: segment.distanceM,
    }));
    const route: PlannedRoute = {
      ...sampleRoute,
      indoorSegments: floors,
      contextLegs,
      contextHandoffs: handoffs,
      transitionDetails: details,
      steps,
    };

    expect(studentRouteVerticalTransitionGroupId(route, steps, 2)).toBe("coed-left-stair");
    expect(studentRouteVerticalTransitionGroupId(route, steps, 3)).toBe("coed-left-stair");
    expect(studentRouteVerticalTransitionGroupId(route, steps, 4)).toBe("coed-left-stair");
    expect(studentRouteVerticalTransitionGroupId(route, steps, 5)).toBeNull();
    expect(studentRouteVerticalTransitionContinuesRun(route, steps, 5, "coed-left-stair")).toBe(true);
    expect(studentRouteVerticalTransitionContinuesRun(route, steps, 5, "different-shaft")).toBe(false);
    const emergencyRoute = { ...route, mode: "emergency" as const };
    expect(studentRouteVerticalTransitionRunId(emergencyRoute, steps, 2)).toBe("coed-left-stair");
    expect(studentRouteVerticalTransitionGroupId(emergencyRoute, steps, 2)).toBe("coed-left-stair");
    expect(studentRouteVerticalTransitionGroupId(emergencyRoute, steps, 3)).toBe("coed-left-stair");
    expect([2, 3, 4, 5].every((index) =>
      studentRouteVerticalTransitionContinuesRun(emergencyRoute, steps, index, "coed-left-stair"))).toBe(true);
    // Route details stay canonical and floor-by-floor; authorization only
    // changes Follow playback, not the itinerary or manual step controls.
    expect(steps.filter((step) => step.icon === "stairs")).toHaveLength(4);
    expect(steps.map((step) => step.instruction)).toContain("Take the Left Stair down to Floor 2.");
    expect(steps.map((step) => step.instruction)).toContain("Follow the indoor path to the Left Stair.");
    expect(steps).toHaveLength(8);

    const walkedIntermediateFloors = {
      ...route,
      indoorSegments: floors.map((segment, index) => index === 1 ? { ...segment, distanceM: 8 } : segment),
    };
    expect(studentRouteVerticalTransitionGroupId(walkedIntermediateFloors, steps, 2)).toBeNull();

    const differentShaft = {
      ...emergencyRoute,
      transitionDetails: details.map((detail, index) => index === 1
        ? { ...detail, transitionSharedId: "coed-right-stair" }
        : detail),
    };
    expect(studentRouteVerticalTransitionGroupId(differentShaft, steps, 2)).toBeNull();
  });

  it("authorizes one contiguous Exterior Emergency Stair run by its canonical assembly ID, including SOS routes", () => {
    const floors = [6, 5, 4, 3, 2, 1].map((number, index) => ({
      buildingId: "student-center",
      floorId: `sc-${number}`,
      floorNumber: number,
      floorLabel: number === 1 ? "Ground Floor" : `Floor ${number}`,
      afterOutdoor: false,
      waypoints: [{ x: 20, y: index * 10 }],
      distanceM: 0,
      seconds: 0,
      steps: [],
    }));
    const details = floors.slice(0, -1).map((floor, index) => ({
      kind: "stairs" as const,
      nodeId: `exterior-stair-2-${index}`,
      label: "Exterior Stair 2",
      fromFloorId: floor.floorId,
      toFloorId: floors[index + 1].floorId,
      // These occurrence-level IDs may differ. The authored exterior stair
      // owner is the physical identity shared by every served landing.
      transitionSharedId: `floor-occurrence-${index}`,
      exteriorEmergencyStairId: "sc-exterior-stair-2",
      buildingId: "student-center",
    }));
    const steps = [
      { id: "start", icon: "start" as const, instruction: "Start on Floor 6.", contextLegIndex: 0 },
      { id: "walk-to-stair", icon: "walk" as const, instruction: "Follow the emergency path to Exterior Stair 2.", contextLegIndex: 0 },
      ...details.map((detail, index) => ({
        id: `exterior-transition-${index}`,
        icon: "stairs" as const,
        instruction: `Take Exterior Stair 2 down to ${index === 4 ? "Ground Floor" : `Floor ${5 - index}`}.`,
        contextLegIndex: index,
      })),
      { id: "exit-building", icon: "enter" as const, instruction: "Exit via Exterior Stair 2 to Campus.", contextLegIndex: 5 },
      { id: "arrive", icon: "arrive" as const, instruction: "Arrive on Campus.", contextLegIndex: 5 },
    ];
    const route: PlannedRoute = {
      ...sampleRoute,
      mode: "emergency",
      indoorSegments: floors,
      contextLegs: floors.map((segment, segmentIndex) => ({
        kind: "floor" as const,
        buildingId: segment.buildingId,
        floorId: segment.floorId,
        floorNumber: segment.floorNumber,
        segmentIndex,
        waypoints: segment.waypoints,
        distanceM: segment.distanceM,
      })),
      transitionDetails: details,
      steps,
    };

    const runId = "exterior-emergency-stair:student-center:sc-exterior-stair-2";
    expect(studentRouteVerticalTransitionRunId(route, steps, 2)).toBe(runId);
    expect(studentRouteVerticalTransitionGroupId(route, steps, 2)).toBe(runId);
    expect(studentRouteVerticalTransitionGroupId(route, steps, 3)).toBe(runId);
    expect(studentRouteVerticalTransitionGroupId(route, steps, 5)).toBe(runId);
    // The last authored floor handoff has no next transition to group, but
    // remains authorized by the run started at Floor 6.
    expect(studentRouteVerticalTransitionGroupId(route, steps, 6)).toBeNull();
    expect(studentRouteVerticalTransitionContinuesRun(route, steps, 6, runId)).toBe(true);
    expect(studentRouteVerticalTransitionContinuesRun(route, steps, 6, "exterior-emergency-stair:student-center:other-stair")).toBe(false);
    expect(studentRouteVerticalTransitionRunId(route, steps, 7)).toBeNull();
    expect(studentRouteVerticalTransitionContinuesRun(route, steps, 7, runId)).toBe(false);
    expect(steps.filter((step) => step.icon === "stairs")).toHaveLength(5);
    expect(steps.map((step) => step.instruction)).toEqual(expect.arrayContaining([
      "Take Exterior Stair 2 down to Floor 5.",
      "Take Exterior Stair 2 down to Floor 4.",
      "Take Exterior Stair 2 down to Floor 3.",
      "Take Exterior Stair 2 down to Floor 2.",
      "Take Exterior Stair 2 down to Ground Floor.",
    ]));

    const differentAssembly = {
      ...route,
      transitionDetails: details.map((detail, index) => index === 1
        ? { ...detail, exteriorEmergencyStairId: "sc-exterior-stair-1" }
        : detail),
    };
    expect(studentRouteVerticalTransitionGroupId(differentAssembly, steps, 2)).toBeNull();

    const walkedIntermediateFloor = {
      ...route,
      indoorSegments: floors.map((segment, index) => index === 1 ? { ...segment, distanceM: 4 } : segment),
    };
    expect(studentRouteVerticalTransitionGroupId(walkedIntermediateFloor, steps, 2)).toBeNull();
  });

  it("keeps zero-distance stair access steps visible unless the same shaft continues", () => {
    const floors = [
      { buildingId: "coed", floorId: "coed-5", floorNumber: 5, afterOutdoor: true, waypoints: [{ x: 0, y: 0 }], distanceM: 10, seconds: 5, steps: [] },
      { buildingId: "coed", floorId: "coed-4", floorNumber: 4, afterOutdoor: true, waypoints: [{ x: 1, y: 1 }], distanceM: 0, seconds: 0, steps: [] },
      { buildingId: "coed", floorId: "coed-3", floorNumber: 3, afterOutdoor: true, waypoints: [{ x: 2, y: 2 }], distanceM: 0, seconds: 0, steps: [] },
      { buildingId: "coed", floorId: "coed-1", floorNumber: 1, afterOutdoor: true, waypoints: [{ x: 3, y: 3 }], distanceM: 10, seconds: 5, steps: [] },
    ];
    const contextLegs = floors.map((floor, segmentIndex) => ({
      kind: "floor" as const, buildingId: floor.buildingId, floorId: floor.floorId,
      floorNumber: floor.floorNumber, segmentIndex, waypoints: floor.waypoints, distanceM: floor.distanceM,
    }));
    const steps = [
      { id: "start", icon: "start" as const, instruction: "Start on Floor 5.", contextLegIndex: 0 },
      { id: "first-stair", icon: "stairs" as const, instruction: "Take West Stair down.", contextLegIndex: 0 },
      { id: "middle-walk", icon: "walk" as const, instruction: "Follow the indoor path to the East Stair.", contextLegIndex: 1 },
      { id: "second-stair", icon: "stairs" as const, instruction: "Take East Stair down.", contextLegIndex: 1 },
      { id: "middle-walk-2", icon: "walk" as const, instruction: "Continue to the East Stair.", contextLegIndex: 2 },
      { id: "third-stair", icon: "stairs" as const, instruction: "Take East Stair down.", contextLegIndex: 2 },
      { id: "last-walk", icon: "walk" as const, instruction: "Follow the indoor path to the destination.", contextLegIndex: 3 },
      { id: "arrive", icon: "arrive" as const, instruction: "Arrive.", contextLegIndex: 3 },
    ];
    const makeRoute = (firstSharedId: string, secondSharedId: string): PlannedRoute => ({
      ...sampleRoute,
      indoorSegments: floors,
      contextLegs,
      transitionDetails: [
        { kind: "stairs", nodeId: "west", label: "West Stair", fromFloorId: "coed-5", toFloorId: "coed-4", transitionSharedId: firstSharedId, buildingId: "coed" },
        { kind: "stairs", nodeId: "east", label: "East Stair", fromFloorId: "coed-4", toFloorId: "coed-3", transitionSharedId: secondSharedId, buildingId: "coed" },
        { kind: "stairs", nodeId: "east-ground", label: "East Stair", fromFloorId: "coed-3", toFloorId: "coed-1", transitionSharedId: secondSharedId, buildingId: "coed" },
      ],
      steps,
    });
    const differentShafts = makeRoute("west-shaft", "east-shaft");
    const sameShaft = makeRoute("shared-shaft", "shared-shaft");

    expect(studentRouteShouldPauseAtZeroWalkVerticalAccess(differentShafts, steps, 2, "west-shaft")).toBe(true);
    expect(studentRouteShouldPauseAtZeroWalkVerticalAccess(sameShaft, steps, 2, "shared-shaft")).toBe(false);
    expect(studentRouteShouldPauseAtZeroWalkVerticalAccess(differentShafts, steps, 4, "shared-shaft")).toBe(true);
    expect(studentRouteShouldPauseAtZeroWalkVerticalAccess(sameShaft, steps, 4, "shared-shaft")).toBe(false);
    expect(studentRouteShouldPauseAtZeroWalkVerticalAccess(differentShafts, steps, 6, null)).toBe(false);
  });

  it("keeps repeated visits to one Floor segment on their canonical route context", () => {
    const segment = {
      buildingId: "canteen",
      floorId: "canteen-ground",
      floorNumber: 1,
      afterOutdoor: true,
      waypoints: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      distanceM: 10,
      seconds: 5,
      steps: [],
    };
    const route: PlannedRoute = {
      ...sampleRoute,
      indoorSegments: [segment],
      contextLegs: [
        { kind: "floor", buildingId: "canteen", floorId: segment.floorId, floorNumber: 1, segmentIndex: 0, waypoints: segment.waypoints, distanceM: 10 },
        { kind: "campus", waypoints: [{ x: 10, y: 0 }, { x: 20, y: 0 }], distanceM: 10 },
        { kind: "floor", buildingId: "canteen", floorId: segment.floorId, floorNumber: 1, segmentIndex: 0, waypoints: segment.waypoints, distanceM: 10 },
      ],
      steps: [
        { id: "start", icon: "start", instruction: "Start in Canteen.", contextLegIndex: 0 },
        { id: "walk-first", icon: "walk", instruction: "Follow the canteen path.", contextLegIndex: 0 },
        { id: "exit", icon: "enter", instruction: "Exit Canteen.", contextLegIndex: 0 },
        { id: "campus", icon: "walk", instruction: "Follow the campus path.", contextLegIndex: 1 },
        { id: "enter", icon: "enter", instruction: "Enter Canteen.", contextLegIndex: 1 },
        { id: "walk-second", icon: "walk", instruction: "Continue through Canteen.", contextLegIndex: 2 },
        { id: "arrive", icon: "arrive", instruction: "Arrive in Canteen.", contextLegIndex: 2 },
      ],
    };
    const steps = studentFacingRouteSteps(route);

    expect(studentRoutePositionForLeg(route, steps, "destination-indoor", segment, 0.4, 0, 2)).toBeCloseTo(5.4);
    expect(studentRouteProgressForIndoorSegment(route, steps, segment, 0.4, 2)).toBeCloseTo(5.4 / steps.length);
    expect(steps.map((step) => step.id)).toContain("walk-first");
    expect(steps.map((step) => step.id)).toContain("walk-second");
    expect(steps.map((step, index) => studentRouteSeekTarget(route, steps, index).contextLegIndex))
      .toEqual([0, 0, 0, 1, 1, 2, 2]);
    expect(steps.map((step, index) => studentRouteSeekTarget(route, steps, index).context))
      .toEqual(["floor", "floor", "floor", "campus", "campus", "floor", "floor"]);
  });

  it("resolves step seeks to authored Campus, source Floor, and destination Floor boundaries", () => {
    const source = { buildingId: "science", floorId: "g", floorNumber: 1, afterOutdoor: false, waypoints: [{ x: 1, y: 1 }, { x: 2, y: 2 }], distanceM: 10, seconds: 5, steps: [] };
    const destination = { buildingId: "library", floorId: "f4", floorNumber: 4, afterOutdoor: true, waypoints: [{ x: 8, y: 8 }, { x: 9, y: 9 }], distanceM: 20, seconds: 10, steps: [] };
    const route: PlannedRoute = { ...sampleRoute, indoorSegments: [source, destination], steps: [
      { id: "start", icon: "start", instruction: "Start." },
      { id: "source-walk", icon: "walk", instruction: "Follow the indoor path to the exit.", distanceM: 10 },
      { id: "exit", icon: "enter", instruction: "Exit Science Hall." },
      { id: "campus-walk", icon: "walk", instruction: "Follow the campus path to the entrance.", distanceM: 30 },
      { id: "enter", icon: "enter", instruction: "Enter Library." },
      { id: "destination-walk", icon: "walk", instruction: "Follow the indoor path to Room 4.", distanceM: 20 },
      { id: "arrive", icon: "arrive", instruction: "Arrive at Room 4." },
    ] };
    const steps = studentFacingRouteSteps(route);
    expect(studentRouteSeekTarget(route, steps, 1)).toMatchObject({ context: "floor", phase: "origin-indoor", segment: source, segmentProgress: 0 });
    expect(studentRouteSeekTarget(route, steps, 2)).toMatchObject({ context: "floor", phase: "origin-indoor", segment: source, segmentProgress: 1 });
    expect(studentRouteSeekTarget(route, steps, 3)).toMatchObject({ context: "campus", phase: "outdoor", segmentProgress: 0 });
    expect(studentRouteSeekTarget(route, steps, 4)).toMatchObject({ context: "campus", phase: "outdoor", segmentProgress: 1 });
    expect(studentRouteSeekTarget(route, steps, 5)).toMatchObject({ context: "floor", phase: "destination-indoor", segment: destination, segmentProgress: 0 });
    expect(studentRouteSeekTarget(route, steps, 6)).toMatchObject({ context: "floor", phase: "destination-indoor", segment: destination, segmentProgress: 1 });
  });

  it("keeps entry and exit Follow markers on the canonical Campus leg for that building handoff", () => {
    const makeFloor = (buildingId: string, floorId: string, points: { x: number; y: number }[]) => ({
      buildingId,
      floorId,
      floorNumber: 1,
      afterOutdoor: true,
      waypoints: points,
      distanceM: 10,
      seconds: 5,
      steps: [{ id: `${buildingId}-walk`, icon: "walk" as const, instruction: `Follow the indoor path through ${buildingId}.` }],
    });
    const floorA = makeFloor("building-a", "a-ground", [{ x: 10, y: 10 }, { x: 20, y: 20 }]);
    const floorB = makeFloor("building-b", "b-ground", [{ x: 50, y: 50 }, { x: 60, y: 60 }]);
    const floorC = makeFloor("building-c", "c-ground", [{ x: 90, y: 90 }, { x: 100, y: 100 }]);
    const campusAB = { kind: "campus" as const, waypoints: [{ x: 20, y: 20 }, { x: 30, y: 30 }, { x: 40, y: 40 }], distanceM: 20 };
    const campusBC = { kind: "campus" as const, waypoints: [{ x: 61, y: 60 }, { x: 75, y: 70 }, { x: 89, y: 90 }], distanceM: 20 };
    const handoff = (fromContextLegIndex: number, toContextLegIndex: number, kind: "enter_building" | "exit_building", buildingId: string) => ({
      fromContextLegIndex,
      toContextLegIndex,
      kind,
      buildingId,
      label: `${kind === "enter_building" ? "Enter" : "Exit"} ${buildingId}`,
      sourcePoint: { x: fromContextLegIndex * 10, y: fromContextLegIndex * 10 },
      targetPoint: { x: toContextLegIndex * 10, y: toContextLegIndex * 10 },
    });
    const route: PlannedRoute = {
      ...sampleRoute,
      points: [{ x: -100, y: -100 }, { x: -50, y: -50 }],
      indoorSegments: [floorA, floorB, floorC],
      contextLegs: [
        { kind: "floor", buildingId: "building-a", floorId: floorA.floorId, segmentIndex: 0, waypoints: floorA.waypoints, distanceM: floorA.distanceM },
        campusAB,
        { kind: "floor", buildingId: "building-b", floorId: floorB.floorId, segmentIndex: 1, waypoints: floorB.waypoints, distanceM: floorB.distanceM },
        campusBC,
        { kind: "floor", buildingId: "building-c", floorId: floorC.floorId, segmentIndex: 2, waypoints: floorC.waypoints, distanceM: floorC.distanceM },
      ],
      contextHandoffs: [
        handoff(0, 1, "exit_building", "Building A"),
        handoff(1, 2, "enter_building", "Building B"),
        handoff(2, 3, "exit_building", "Building B"),
        handoff(3, 4, "enter_building", "Building C"),
      ],
      steps: [
        { id: "start-a", icon: "start", instruction: "Start in Building A.", contextLegIndex: 0 },
        { id: "walk-a", icon: "walk", instruction: "Follow the indoor path through building-a.", contextLegIndex: 0 },
        { id: "exit-a", icon: "enter", instruction: "Exit Building A.", contextLegIndex: 0, contextHandoffIndex: 0 },
        { id: "campus-to-b", icon: "walk", instruction: "Follow the campus path to Building B.", contextLegIndex: 1 },
        { id: "enter-b", icon: "enter", instruction: "Enter Building B.", contextLegIndex: 1, contextHandoffIndex: 1 },
        { id: "walk-b", icon: "walk", instruction: "Follow the indoor path through building-b.", contextLegIndex: 2 },
        { id: "exit-b", icon: "enter", instruction: "Exit Building B.", contextLegIndex: 2, contextHandoffIndex: 2 },
        { id: "campus-to-c", icon: "walk", instruction: "Follow the campus path to Building C.", contextLegIndex: 3 },
        { id: "enter-c", icon: "enter", instruction: "Enter Building C.", contextLegIndex: 3, contextHandoffIndex: 3 },
        { id: "walk-c", icon: "walk", instruction: "Follow the indoor path through building-c.", contextLegIndex: 4 },
        { id: "arrive", icon: "arrive", instruction: "Arrive in Building C.", contextLegIndex: 4 },
      ],
    };
    const steps = studentFacingRouteSteps(route);

    expect(steps[4]?.instruction).toBe("Enter Building B.");
    expect(routeTransitionForStep(route, steps, 4)).toMatchObject({ kind: "enter_building", handoff: { fromContextLegIndex: 1, toContextLegIndex: 2 } });
    const enterBTarget = studentRouteSeekTarget(route, steps, 4);
    expect(enterBTarget).toMatchObject({ context: "campus", contextLegIndex: 1, routeProgress: 1 });
    expect(studentRouteCampusMarkerTarget(route, steps, 4)).toEqual({ contextLegIndex: 1, leg: campusAB });
    expect(studentRouteFocusAtProgress(enterBTarget.phase, campusAB.waypoints, enterBTarget.routeProgress, enterBTarget.segment, enterBTarget.segmentProgress))
      .toEqual({ context: "campus", point: campusAB.waypoints.at(-1) });
    // Activating Continue selects the following authored indoor leg at its
    // exact entrance point; the transition step itself remains Campus-side.
    const insideBTarget = studentRouteSeekTarget(route, steps, 5);
    expect(insideBTarget).toMatchObject({ context: "floor", segment: floorB, segmentProgress: 0 });
    expect(studentRouteCampusMarkerTarget(route, steps, 5)).toBeNull();
    expect(studentRouteFocusAtProgress(insideBTarget.phase, campusAB.waypoints, insideBTarget.routeProgress, insideBTarget.segment, insideBTarget.segmentProgress))
      .toEqual({ context: "floor", point: floorB.waypoints[0] });
    const exitBTarget = studentRouteSeekTarget(route, steps, 6);
    expect(exitBTarget).toMatchObject({ context: "floor", segment: floorB, segmentProgress: 1 });
    expect(routeTransitionForStep(route, steps, 6)).toMatchObject({ kind: "exit_building", handoff: { fromContextLegIndex: 2, toContextLegIndex: 3 } });
    expect(studentRouteCampusMarkerTarget(route, steps, 6)).toBeNull();
    expect(studentRouteFocusAtProgress(exitBTarget.phase, campusBC.waypoints, exitBTarget.routeProgress, exitBTarget.segment, exitBTarget.segmentProgress))
      .toEqual({ context: "floor", point: floorB.waypoints.at(-1) });
    // After Continue on Exit Building B, the next canonical Campus walk owns
    // Building B's authored outgoing connection, not route.points[0].
    const campusAfterBTarget = studentRouteSeekTarget(route, steps, 7);
    expect(campusAfterBTarget).toMatchObject({ context: "campus", contextLegIndex: 3, routeProgress: 0 });
    expect(studentRouteCampusMarkerTarget(route, steps, 7)).toEqual({ contextLegIndex: 3, leg: campusBC });
    expect(studentRouteCampusMarkerTarget(route, steps, 8)).toEqual({ contextLegIndex: 3, leg: campusBC });
    expect(studentRouteFocusAtProgress(campusAfterBTarget.phase, campusBC.waypoints, campusAfterBTarget.routeProgress, campusAfterBTarget.segment, campusAfterBTarget.segmentProgress))
      .toEqual({ context: "campus", point: campusBC.waypoints[0] });
    expect(studentRouteCampusMarkerTarget(route, steps, 9)).toBeNull();
    expect(studentRouteCampusMarkerTarget(route, steps, 7)?.leg.waypoints[0]).not.toEqual(route.points[0]);
  });

  it("resolves a fresh Follow itinerary through a direct elevator without inventing intermediate Floors", () => {
    const source = { buildingId: "coed", floorId: "coed-g", floorNumber: 1, afterOutdoor: false, waypoints: [{ x: 1, y: 1 }, { x: 2, y: 2 }], distanceM: 12, seconds: 8, steps: [{ id: "source-walk", icon: "walk" as const, instruction: "Follow the indoor path to the building exit door.", distanceM: 12 }] };
    const ground = { buildingId: "coed", floorId: "coed-g", floorNumber: 1, afterOutdoor: true, waypoints: [{ x: 3, y: 3 }, { x: 4, y: 4 }], distanceM: 10, seconds: 6, steps: [{ id: "ground-walk", icon: "walk" as const, instruction: "Follow the indoor path to the main elevator.", distanceM: 10 }] };
    const floor4 = { buildingId: "coed", floorId: "coed-4", floorNumber: 4, afterOutdoor: true, waypoints: [{ x: 5, y: 5 }, { x: 8, y: 8 }], distanceM: 30, seconds: 18, steps: [{ id: "floor4-walk", icon: "walk" as const, instruction: "Follow the indoor path to the door of Garden Atrium.", distanceM: 30 }] };
    const route: PlannedRoute = {
      ...sampleRoute,
      indoorSegments: [source, ground, floor4],
      transitionDetails: [{ kind: "elevator", nodeId: "coed-lift", label: "Main Elevator", fromFloorId: "coed-g", toFloorId: "coed-4" }],
      steps: [
        { id: "start", icon: "start", instruction: "Start at the door of Room 101." },
        source.steps[0],
        { id: "exit", icon: "enter", instruction: "Exit CABA building." },
        { id: "campus", icon: "walk", instruction: "Follow the campus path to the entrance of COED building." },
        { id: "enter", icon: "enter", instruction: "Enter COED building." },
        ground.steps[0],
        { id: "elevator", icon: "elevator", instruction: "Take the Main Elevator to Floor 4." },
        floor4.steps[0],
        { id: "arrive", icon: "arrive", instruction: "Arrive at Garden Atrium." },
      ],
    };
    const steps = studentFacingRouteSteps(route);

    // No visited/explored state is provided: every planned step already has a
    // stable context immediately after Find Route.
    expect(steps[0]?.instruction).toBe("Follow the indoor path to the building exit door.");
    expect(studentRouteSeekTarget(route, steps, 2)).toMatchObject({ context: "campus", phase: "outdoor" });
    expect(studentRouteSeekTarget(route, steps, 3)).toMatchObject({ context: "campus", phase: "outdoor", routeProgress: 1 });
    expect(studentRouteSeekTarget(route, steps, 4)).toMatchObject({ context: "floor", segment: ground, segmentProgress: 0 });
    expect(routeTransitionForStep(route, steps, 5)).toMatchObject({ kind: "elevator", detail: { fromFloorId: "coed-g", toFloorId: "coed-4" } });
    expect(studentRouteSeekTarget(route, steps, 5)).toMatchObject({ context: "floor", segment: ground, segmentProgress: 1 });
    expect(studentRouteSeekTarget(route, steps, 6)).toMatchObject({ context: "floor", segment: floor4, segmentProgress: 0 });
    expect(studentRoutePositionForLeg(route, steps, "destination-indoor", floor4, 0)).toBe(6);
  });

  it("preserves the active Follow cursor when an authored indoor segment has no matching student instruction", () => {
    const segments = [
      { buildingId: "canteen", floorId: "canteen-g", floorNumber: 1, afterOutdoor: true, waypoints: [{ x: 0, y: 0 }, { x: 1, y: 1 }], distanceM: 8, seconds: 5, steps: [{ id: "connector", icon: "walk" as const, instruction: "Follow the connected indoor path." }] },
      { buildingId: "coed", floorId: "coed-g", floorNumber: 1, afterOutdoor: true, waypoints: [{ x: 1, y: 1 }, { x: 2, y: 2 }], distanceM: 10, seconds: 6, steps: [{ id: "ground", icon: "walk" as const, instruction: "Follow the indoor path to Elevator 1." }] },
      { buildingId: "coed", floorId: "coed-3", floorNumber: 3, afterOutdoor: true, waypoints: [{ x: 2, y: 2 }, { x: 3, y: 3 }], distanceM: 10, seconds: 6, steps: [{ id: "third", icon: "walk" as const, instruction: "Follow the indoor path to Elevator 1." }] },
      { buildingId: "coed", floorId: "coed-4", floorNumber: 4, afterOutdoor: true, waypoints: [{ x: 3, y: 3 }, { x: 4, y: 4 }], distanceM: 12, seconds: 8, steps: [{ id: "destination", icon: "walk" as const, instruction: "Follow the indoor path to the door of COED 301." }] },
    ];
    const route: PlannedRoute = {
      ...sampleRoute,
      indoorSegments: segments,
      steps: [
        { id: "start", icon: "start", instruction: "Start at Campus Gate." },
        { id: "campus", icon: "walk", instruction: "Follow the campus path to the entrance of COED." },
        { id: "enter", icon: "enter", instruction: "Enter COED building." },
        { id: "door", icon: "walk", instruction: "Follow the indoor path to the door of COED 301." },
        { id: "elevator-walk", icon: "walk", instruction: "Follow the indoor path to Elevator 1." },
        { id: "elevator", icon: "elevator", instruction: "Take Elevator 1 to Floor 4." },
        { id: "destination-walk", icon: "walk", instruction: "Follow the indoor path to the door of COED 301." },
        { id: "arrive", icon: "arrive", instruction: "Arrive at COED 301." },
      ],
    };
    const steps = studentFacingRouteSteps(route);

    // The authored route contains an early COED floor segment, but the
    // Student itinerary currently has no matching instruction for it. Once
    // Enter is activated, playback must not jump back to Start at Campus Gate.
    expect(studentRoutePositionForLeg(route, steps, "destination-indoor", segments[1], 0.42, 3)).toBe(3);
    expect(studentRoutePositionForLeg(route, steps, "destination-indoor", segments[3], 0.42, 6)).toBeCloseTo(6.42);
  });

  it("collapses zero-walk intermediate stops on one authored elevator shaft", () => {
    const floors = [1, 2, 3, 4].map((floorNumber) => ({
      buildingId: "coed",
      floorId: `coed-${floorNumber}`,
      floorNumber,
      afterOutdoor: true,
      waypoints: [{ x: floorNumber, y: floorNumber }],
      distanceM: floorNumber === 1 || floorNumber === 4 ? 12 : 0,
      seconds: 0,
      steps: [{ id: `walk-${floorNumber}`, icon: "walk" as const, instruction: floorNumber === 4
        ? "Follow the indoor path to the door of Garden Atrium."
        : "Follow the indoor path to Main Elevator.", distanceM: floorNumber === 1 || floorNumber === 4 ? 12 : 0 }],
    }));
    const route: PlannedRoute = {
      ...sampleRoute,
      indoorSegments: floors,
      transitionDetails: [1, 2, 3].map((floorNumber) => ({
        kind: "elevator" as const,
        nodeId: `lift-${floorNumber}`,
        label: "Main Elevator",
        fromFloorId: `coed-${floorNumber}`,
        toFloorId: `coed-${floorNumber + 1}`,
        transitionSharedId: "coed-lift-shaft",
        buildingId: "coed",
      })),
      steps: [
        { id: "start", icon: "start", instruction: "Start at Campus Gate." },
        { id: "campus", icon: "walk", instruction: "Follow the campus path to the entrance of COED building." },
        { id: "enter", icon: "enter", instruction: "Enter COED building." },
        floors[0].steps[0],
        { id: "elevator-1", icon: "elevator", instruction: "Take the Main Elevator to Floor 2." },
        floors[1].steps[0],
        { id: "elevator-2", icon: "elevator", instruction: "Take the Main Elevator to Floor 3." },
        floors[2].steps[0],
        { id: "elevator-3", icon: "elevator", instruction: "Take the Main Elevator to Floor 4." },
        floors[3].steps[0],
        { id: "arrive", icon: "arrive", instruction: "Arrive at Garden Atrium." },
      ],
    };
    const steps = studentFacingRouteSteps(route);

    expect(steps.map((step) => step.instruction)).toEqual([
      "Start at Campus Gate.",
      "Follow the campus path to the entrance of COED building.",
      "Enter COED building.",
      "Follow the indoor path to Main Elevator.",
      "Take the Main Elevator to Floor 4.",
      "Follow the indoor path to the door of Garden Atrium.",
      "Arrive at Garden Atrium.",
    ]);
    expect(studentRouteSeekTarget(route, steps, 5).segment).toBe(floors[3]);
    expect(routeTransitionForStep(route, steps, 4)).toMatchObject({
      kind: "elevator",
      detail: { fromFloorId: "coed-1", toFloorId: "coed-4", transitionSharedId: "coed-lift-shaft" },
    });

    const sameBuildingSegments = floors.map((segment) => ({ ...segment, afterOutdoor: false }));
    const sameBuildingRoute: PlannedRoute = {
      ...route,
      campusPoints: [],
      points: [],
      indoorSegments: sameBuildingSegments,
      steps: [
        { id: "start-room", icon: "start", instruction: "Start at the door of Room 101." },
        floors[0].steps[0],
        { id: "same-building-elevator-1", icon: "elevator", instruction: "Take the Main Elevator to Floor 2." },
        floors[1].steps[0],
        { id: "same-building-elevator-2", icon: "elevator", instruction: "Take the Main Elevator to Floor 3." },
        floors[2].steps[0],
        { id: "same-building-elevator-3", icon: "elevator", instruction: "Take the Main Elevator to Floor 4." },
        floors[3].steps[0],
        { id: "arrive-room", icon: "arrive", instruction: "Arrive at Garden Atrium." },
      ],
    };
    const sameBuildingSteps = studentFacingRouteSteps(sameBuildingRoute);
    expect(sameBuildingSteps).toHaveLength(4);
    expect(studentRoutePositionForLeg(sameBuildingRoute, sameBuildingSteps, "origin-indoor", sameBuildingSegments[0], 1)).toBe(1);
    expect(studentRouteSeekTarget(sameBuildingRoute, sameBuildingSteps, 2)).toMatchObject({
      context: "floor",
      phase: "origin-indoor",
      segment: sameBuildingSegments[3],
      segmentProgress: 0,
    });
    expect(studentRouteSeekTarget(sameBuildingRoute, sameBuildingSteps, 3)).toMatchObject({
      context: "floor",
      phase: "origin-indoor",
      segment: sameBuildingSegments[3],
      segmentProgress: 1,
    });
    expect(routeTransitionForStep(sameBuildingRoute, sameBuildingSteps, 1)).toMatchObject({
      kind: "elevator",
      detail: { fromFloorId: "coed-1", toFloorId: "coed-4" },
    });
  });

  it("uses published Floor labels instead of internal graph numbers in elevator guidance and route facts", () => {
    const route: PlannedRoute = {
      ...sampleRoute,
      indoorSegments: [
        { buildingId: "coed", floorId: "coed-ground", floorNumber: 1, floorLabel: "Ground Floor", afterOutdoor: true, waypoints: [{ x: 0, y: 0 }, { x: 1, y: 1 }], distanceM: 12, seconds: 8, steps: [{ id: "ground", icon: "walk", instruction: "Follow the indoor path to Elevator 1.", distanceM: 12 }] },
        { buildingId: "coed", floorId: "coed-stop", floorNumber: 3, floorLabel: "Floor 2", afterOutdoor: true, waypoints: [{ x: 1, y: 1 }], distanceM: 0, seconds: 0, steps: [{ id: "stop", icon: "walk", instruction: "Follow the indoor path to Elevator 1.", distanceM: 0 }] },
        { buildingId: "coed", floorId: "coed-destination", floorNumber: 4, floorLabel: "Floor 3", afterOutdoor: true, waypoints: [{ x: 1, y: 1 }, { x: 2, y: 2 }], distanceM: 15, seconds: 9, steps: [{ id: "destination", icon: "walk", instruction: "Follow the indoor path to the door of COED 301.", distanceM: 15 }] },
      ],
      transitionDetails: [
        { kind: "elevator", nodeId: "elevator-ground", label: "Elevator 1", fromFloorId: "coed-ground", toFloorId: "coed-stop", transitionSharedId: "coed-elevator", buildingId: "coed" },
        { kind: "elevator", nodeId: "elevator-stop", label: "Elevator 1", fromFloorId: "coed-stop", toFloorId: "coed-destination", transitionSharedId: "coed-elevator", buildingId: "coed" },
      ],
      steps: [
        { id: "start", icon: "start", instruction: "Start at COED 101." },
        { id: "walk", icon: "walk", instruction: "Follow the indoor path to Elevator 1.", distanceM: 12 },
        { id: "elevator-ground", icon: "elevator", instruction: "Take Elevator 1 to Floor 2." },
        { id: "walk-stop", icon: "walk", instruction: "Follow the indoor path to Elevator 1.", distanceM: 0 },
        { id: "elevator-stop", icon: "elevator", instruction: "Take Elevator 1 to Floor 4." },
        { id: "destination-walk", icon: "walk", instruction: "Follow the indoor path to the door of COED 301.", distanceM: 15 },
        { id: "arrive", icon: "arrive", instruction: "Arrive at COED 301." },
      ],
    };
    const steps = studentFacingRouteSteps(route);

    expect(steps.map((step) => step.instruction)).toContain("Take the Elevator 1 to Floor 3.");
    expect(steps.map((step) => step.instruction)).not.toContain("Take the Elevator 1 to Floor 4.");
    expect(studentRouteFacts(route, "best")).toContain("Ground Floor → Floor 3");
    expect(studentRouteFloorLabel(route.indoorSegments?.[2])).toBe("Floor 3");
  });

  it("uses published destination Floor labels in down-stair guidance", () => {
    const route: PlannedRoute = {
      ...sampleRoute,
      indoorSegments: [
        { buildingId: "science", floorId: "science-4", floorNumber: 5, floorLabel: "Floor 4", afterOutdoor: false, waypoints: [{ x: 0, y: 0 }, { x: 1, y: 1 }], distanceM: 12, seconds: 8, steps: [] },
        { buildingId: "science", floorId: "science-3", floorNumber: 4, floorLabel: "Floor 3", afterOutdoor: false, waypoints: [{ x: 1, y: 1 }], distanceM: 0, seconds: 0, steps: [] },
        { buildingId: "science", floorId: "science-ground", floorNumber: 1, floorLabel: "Ground Floor", afterOutdoor: false, waypoints: [{ x: 1, y: 1 }, { x: 2, y: 2 }], distanceM: 15, seconds: 9, steps: [] },
      ],
      transitionDetails: [
        { kind: "stairs", nodeId: "right-stair-4", label: "Right Stair", fromFloorId: "science-4", toFloorId: "science-3", buildingId: "science" },
        { kind: "stairs", nodeId: "left-stair-3", label: "Left Stair", fromFloorId: "science-3", toFloorId: "science-ground", buildingId: "science" },
      ],
      steps: [
        { id: "start", icon: "start", instruction: "Start at Lecture Room 401." },
        { id: "walk-4", icon: "walk", instruction: "Follow the indoor path to the Right Stair." },
        { id: "right-stair-4", icon: "stairs", instruction: "Take the Right Stair down to Floor 4." },
        { id: "walk-3", icon: "walk", instruction: "Follow the indoor path to the Left Stair." },
        { id: "left-stair-3", icon: "stairs", instruction: "Take the Left Stair down to Floor 3." },
        { id: "arrive", icon: "arrive", instruction: "Arrive at Ground Floor." },
      ],
    };

    const steps = studentFacingRouteSteps(route);
    expect(steps[2]?.instruction).toBe("Take the Right Stair down to Floor 3.");
    expect(steps[4]?.instruction).toBe("Take the Left Stair down to Ground Floor.");
  });

  it("turns an emergency stair-to-Campus boundary into one actionable exit Step", () => {
    const inside = {
      buildingId: "caba", floorId: "caba-g", floorNumber: 1, afterOutdoor: false,
      waypoints: [{ x: 1, y: 1 }, { x: 8, y: 8 }], distanceM: 12, seconds: 8,
      steps: [{ id: "inside-walk", icon: "walk" as const, instruction: "Follow the path toward Exterior Stair 1.", distanceM: 12 }],
    };
    const route: PlannedRoute = {
      ...sampleRoute,
      mode: "emergency",
      indoorSegments: [inside],
      steps: [
        { id: "start", icon: "start", instruction: "Start from Door" },
        inside.steps[0],
        { id: "egress", icon: "info", instruction: "Already at Exterior Stair 1." },
        { id: "duplicate-start", icon: "start", instruction: "Start from Exterior Stair 1" },
        { id: "campus-walk", icon: "walk", instruction: "Follow the path toward Campus Gate." },
        { id: "arrive", icon: "arrive", instruction: "Arrive at the safe exit." },
      ],
    };

    const steps = studentFacingRouteSteps(route);
    expect(steps.map((step) => step.instruction)).toEqual([
      "Follow the path toward Exterior Stair 1.",
      "Exit via Exterior Stair 1 to Campus.",
      "Follow the path toward Campus Gate.",
      "Arrive at the safe exit.",
    ]);
    expect(routeTransitionForStep(route, steps, 1)).toEqual({ kind: "exit_building" });
    expect(studentRouteSeekTarget(route, steps, 1)).toMatchObject({ context: "floor", segment: inside, segmentProgress: 1 });
    expect(studentRouteSeekTarget(route, steps, 2)).toMatchObject({ context: "campus", phase: "outdoor" });
  });

  it("uses an authored building-exit handoff when a legacy row says Already at Entrance", () => {
    const handoff = {
      fromContextLegIndex: 0,
      toContextLegIndex: 1,
      kind: "exit_building" as const,
      buildingId: "ceit",
      label: "Primary Entrance",
      nodeId: "ceit-primary-entrance",
      sourcePoint: { x: 20, y: 10 },
      targetPoint: { x: 20, y: 10 },
    };
    const route: PlannedRoute = {
      ...sampleRoute,
      contextHandoffs: [handoff],
      steps: [
        { id: "start", icon: "start", instruction: "Start at CEIT." },
        { id: "legacy-entrance", icon: "enter", instruction: "Already at Primary Entrance.", contextHandoffIndex: 0 },
        { id: "campus-walk", icon: "walk", instruction: "Follow the campus path to Campus Gate." },
        { id: "arrive", icon: "arrive", instruction: "Arrive at Campus Gate." },
      ],
    };

    expect(routeTransitionForStep(route, route.steps, 1)).toMatchObject({
      kind: "exit_building",
      handoff,
    });
  });

  it("keeps a multi-floor SOS stair descent and final Campus exit on their authored contexts", () => {
    const floors = [7, 6, 5, 4, 3, 1].map((floorNumber, index) => ({
      buildingId: "coed",
      floorId: `coed-${floorNumber}`,
      floorNumber,
      afterOutdoor: false,
      waypoints: [{ x: index, y: index }, { x: index + 1, y: index + 1 }],
      distanceM: index === 0 ? 40 : 0,
      seconds: index === 0 ? 24 : 0,
      steps: [{ id: `floor-${floorNumber}`, icon: "walk" as const, instruction: `Follow the path on Floor ${floorNumber}.` }],
    }));
    const campusLegIndex = floors.length;
    const stairTransitions = floors.slice(0, -1).map((floor, index) => ({
      kind: "stairs" as const,
      nodeId: `stair-${index}`,
      label: "Exterior Stair 1",
      fromFloorId: floor.floorId,
      toFloorId: floors[index + 1].floorId,
      buildingId: "coed",
    }));
    const stairHandoffs = stairTransitions.map((detail, index) => ({
      fromContextLegIndex: index,
      toContextLegIndex: index + 1,
      kind: "stairs" as const,
      buildingId: "coed",
      label: "Exterior Stair 1",
      nodeId: detail.nodeId,
      detail,
      sourcePoint: { x: index + 1, y: index + 1 },
      targetPoint: { x: index + 1, y: index + 1 },
    }));
    const exitHandoff = {
      fromContextLegIndex: floors.length - 1,
      toContextLegIndex: campusLegIndex,
      kind: "exit_building" as const,
      buildingId: "coed",
      buildingCode: "COED",
      label: "Exterior Stair 1",
      nodeId: "coed-ground-discharge",
      sourcePoint: { x: 8, y: 8 },
      targetPoint: { x: 80, y: 80 },
    };
    const route: PlannedRoute = {
      ...sampleRoute,
      mode: "emergency",
      points: [{ x: 80, y: 80 }, { x: 90, y: 90 }],
      campusPoints: [{ x: 80, y: 80 }, { x: 90, y: 90 }],
      indoorSegments: floors,
      contextLegs: [
        ...floors.map((floor, segmentIndex) => ({
          kind: "floor" as const,
          buildingId: floor.buildingId,
          floorId: floor.floorId,
          floorNumber: floor.floorNumber,
          segmentIndex,
          waypoints: floor.waypoints,
          distanceM: floor.distanceM,
        })),
        { kind: "campus", waypoints: [{ x: 80, y: 80 }, { x: 90, y: 90 }], distanceM: 20 },
      ],
      contextHandoffs: [...stairHandoffs, exitHandoff],
      transitionDetails: stairTransitions,
      steps: [
        { id: "start", icon: "start", instruction: "Start from Door" },
        { id: "walk-to-stair", icon: "walk", instruction: "Follow the path toward Exterior Stair 1." },
        { id: "start-stair-descent", icon: "info", instruction: "Start from Exterior Stair 1" },
        ...stairTransitions.map((_, index) => ({
          id: `stair-step-${index}`,
          icon: "stairs" as const,
          instruction: "Take the stairs to Exterior Stair 1",
        })),
        { id: "start-campus-exit", icon: "info", instruction: "Start from Exterior Stair 1" },
        { id: "walk-to-campus-gate", icon: "walk", instruction: "Walk 9m to Campus Gate" },
        { id: "arrive", icon: "arrive", instruction: "Arrive at Campus Gate" },
      ],
    };

    const steps = studentFacingRouteSteps(route);
    const exitIndex = steps.findIndex((step) => step.instruction === "Exit via Exterior Stair 1 to Campus.");
    const campusWalkIndex = steps.findIndex((step) => step.instruction === "Follow the path toward Campus Gate.");
    const arrivalIndex = steps.findIndex((step) => step.icon === "arrive");

    expect(steps.map((step) => step.instruction)).not.toContain("Start from Exterior Stair 1");
    expect(exitIndex).toBeGreaterThan(0);
    expect(routeTransitionForStep(route, steps, exitIndex)).toMatchObject({ kind: "exit_building", handoff: exitHandoff });
    expect(studentRouteSeekTarget(route, steps, exitIndex)).toMatchObject({
      context: "floor",
      segment: floors.at(-1),
      contextLegIndex: floors.length - 1,
      segmentProgress: 1,
    });
    for (let index = 0; index < stairTransitions.length; index += 1) {
      const stepIndex = steps.findIndex((step) => step.id === `stair-step-${index}`);
      expect(studentRouteSeekTarget(route, steps, stepIndex)).toMatchObject({
        context: "floor",
        segment: floors[index],
        contextLegIndex: index,
        segmentProgress: 1,
      });
    }
    expect(studentRouteSeekTarget(route, steps, campusWalkIndex)).toMatchObject({
      context: "campus",
      phase: "outdoor",
      contextLegIndex: campusLegIndex,
    });
    expect(studentRouteSeekTarget(route, steps, arrivalIndex)).toMatchObject({
      context: "campus",
      phase: "outdoor",
      contextLegIndex: campusLegIndex,
    });
  });

  it("keeps explicit Previous/Next ordered across untravelled steps and interpolates authored route legs", () => {
    expect(studentRouteStepSeekIndex(1, 1, 13)).toBe(2);
    expect(studentRouteStepSeekIndex(11, 1, 13)).toBe(12);
    expect(studentRouteStepSeekIndex(12, 1, 13)).toBe(12);
    expect(studentRouteStepSeekIndex(4, -1, 13)).toBe(3);

    const source = { buildingId: "science", floorId: "g", floorNumber: 1, afterOutdoor: false, waypoints: [{ x: 1, y: 1 }, { x: 2, y: 2 }], distanceM: 10, seconds: 5, steps: [] };
    const destination = { buildingId: "library", floorId: "f4", floorNumber: 4, afterOutdoor: true, waypoints: [{ x: 8, y: 8 }, { x: 9, y: 9 }], distanceM: 20, seconds: 10, steps: [] };
    const route: PlannedRoute = { ...sampleRoute, indoorSegments: [source, destination], steps: [
      { id: "start", icon: "start", instruction: "Start." },
      { id: "source-walk", icon: "walk", instruction: "Follow the indoor path to the exit.", distanceM: 10 },
      { id: "exit", icon: "enter", instruction: "Exit Science Hall." },
      { id: "campus-walk", icon: "walk", instruction: "Follow the campus path to the entrance.", distanceM: 30 },
      { id: "enter", icon: "enter", instruction: "Enter Library." },
      { id: "destination-walk", icon: "walk", instruction: "Follow the indoor path to Room 4.", distanceM: 20 },
      { id: "arrive", icon: "arrive", instruction: "Arrive at Room 4." },
    ] };
    const steps = studentFacingRouteSteps(route);
    expect(studentRoutePlaybackTarget(route, steps, 1.5)).toMatchObject({ context: "floor", segment: source, segmentProgress: 0.5 });
    expect(studentRoutePlaybackTarget(route, steps, 2.75)).toMatchObject({ context: "campus", phase: "outdoor", routeProgress: 0 });
    expect(studentRoutePlaybackTarget(route, steps, 4.75)).toMatchObject({ context: "floor", phase: "destination-indoor", segment: destination });
    expect(studentRouteSeekDistanceM(route, steps, 1, 2)).toBe(10);
    expect(studentRouteSeekDistanceM(route, steps, 2, 1)).toBe(10);
    // A context handoff has no fabricated straight-line distance.
    expect(studentRouteSeekDistanceM(route, steps, 2, 3)).toBe(0);
  });

  it("interpolates a legacy campus walk into its authored building-entry handoff", () => {
    const caba = {
      buildingId: "caba", floorId: "caba-ground", floorNumber: 1, afterOutdoor: true,
      waypoints: [{ x: 100, y: 100 }, { x: 120, y: 100 }], distanceM: 20, seconds: 10,
      steps: [{ id: "inside", icon: "walk" as const, instruction: "Walk inside CABA." }],
    };
    const entryHandoff = {
      fromContextLegIndex: 0,
      toContextLegIndex: 1,
      kind: "enter_building" as const,
      buildingId: "caba",
      label: "CABA entrance",
      sourcePoint: { x: 80, y: 100 },
      targetPoint: { x: 100, y: 100 },
    };
    const route: PlannedRoute = {
      ...sampleRoute,
      points: [{ x: 0, y: 100 }, { x: 80, y: 100 }],
      campusPoints: [{ x: 0, y: 100 }, { x: 80, y: 100 }],
      dist: 100,
      indoorSegments: [caba],
      contextLegs: [
        { kind: "campus", waypoints: [{ x: 0, y: 100 }, { x: 80, y: 100 }], distanceM: 80 },
        { kind: "floor", buildingId: "caba", floorId: "caba-ground", floorNumber: 1, segmentIndex: 0, waypoints: caba.waypoints, distanceM: 20 },
      ],
      contextHandoffs: [entryHandoff],
      steps: [
        { id: "start", icon: "start", instruction: "Start at Campus Gate.", contextLegIndex: 0 },
        // Published legacy rows can lack contextLegIndex even though the
        // immediately following Enter row has a fully authored handoff.
        { id: "campus-walk", icon: "walk", instruction: "Follow the campus path to CABA." },
        { id: "enter", icon: "enter", instruction: "Enter CABA building.", contextLegIndex: 0, contextHandoffIndex: 0 },
        { id: "inside", icon: "walk", instruction: "Walk inside CABA.", contextLegIndex: 1 },
        { id: "arrive", icon: "arrive", instruction: "Arrive at the room.", contextLegIndex: 1 },
      ],
    };
    const steps = route.steps;

    expect(studentRouteSeekTarget(route, steps, 1)).toMatchObject({
      context: "campus", phase: "outdoor", contextLegIndex: 0, routeProgress: 0,
    });
    expect(studentRouteSeekTarget(route, steps, 2)).toMatchObject({
      context: "campus", phase: "outdoor", contextLegIndex: 0, routeProgress: 1,
    });
    expect(studentRoutePlaybackTarget(route, steps, 1.25)).toMatchObject({
      context: "campus", phase: "outdoor", contextLegIndex: 0, routeProgress: 0.25,
    });
    expect(studentRouteSeekDistanceM(route, steps, 1, 2)).toBe(80);
  });

  it("activates the Enter step only when the Campus walk reaches its exact doorway boundary", () => {
    const route: PlannedRoute = {
      ...sampleRoute,
      indoorSegments: [],
      steps: [
        { id: "start", icon: "start", instruction: "Start at Campus Gate." },
        { id: "campus-walk", icon: "walk", instruction: "Follow the campus path to CABA." },
        { id: "enter", icon: "enter", instruction: "Enter CABA building." },
        { id: "inside", icon: "walk", instruction: "Follow the indoor path." },
      ],
    };
    const steps = studentFacingRouteSteps(route);

    expect(studentRoutePositionForLeg(route, steps, "outdoor", null, 0.78)).toBeCloseTo(1.78);
    expect(Math.floor(studentRoutePositionForLeg(route, steps, "outdoor", null, 0.78))).toBe(1);
    expect(studentRoutePositionForLeg(route, steps, "outdoor", null, 1)).toBe(2);
  });

  it("focuses the explicitly selected room before an existing route destination", () => {
    expect(studentRoomFocusTargetId(null, "clicked-room", "old-destination-room")).toBe("clicked-room");
    expect(studentRoomFocusTargetId("search-result-room", "clicked-room", "old-destination-room")).toBe("search-result-room");
    expect(studentRoomFocusTargetId(null, null, "route-destination-room")).toBe("route-destination-room");
  });

  it("centers the actual route start point in the unobscured viewport after zoom", () => {
    const start = { x: 120, y: 80 };
    const viewportCenter = { x: 240, y: 180 };
    const mapCenter = { x: 500, y: 350 };
    const zoom = 1.4;
    const pan = panForRouteFocusPoint(start, viewportCenter, mapCenter, zoom);
    expect(mapCenter.x * (1 - zoom) + pan.x + start.x * zoom).toBeCloseTo(viewportCenter.x);
    expect(mapCenter.y * (1 - zoom) + pan.y + start.y * zoom).toBeCloseTo(viewportCenter.y);
  });

  it("recenter targets the active Campus or Floor segment without resetting route progress", () => {
    const indoor = { ...sampleRoute.indoorSegments![1], waypoints: [{ x: 10, y: 20 }, { x: 110, y: 20 }] };
    expect(studentRouteFocusAtProgress("origin-indoor", sampleRoute.points, 0.9, indoor, 0.25))
      .toEqual({ context: "floor", point: { x: 35, y: 20 } });
    expect(studentRouteFocusAtProgress("destination-indoor", sampleRoute.points, 0.1, indoor, 0.75))
      .toEqual({ context: "floor", point: { x: 85, y: 20 } });
    expect(studentRouteFocusAtProgress("outdoor", sampleRoute.points, 0.5, indoor, 0.75))
      .toEqual({ context: "campus", point: { x: 5, y: 5 } });
  });

  it("keeps arrival canonical and allows a transition-started route to wait for Continue", () => {
    let state = initialStudentRouteUiState;
    state = studentRouteUiReducer(state, { type: "OPEN_PLAN" });
    expect(state.phase).toBe("planning");
    state = studentRouteUiReducer(state, { type: "FOUND_ROUTE" });
    expect(state).toMatchObject({ phase: "preview", playback: "paused" });
    state = studentRouteUiReducer(state, { type: "SET_CAMERA_MODE", camera: "follow" });
    state = studentRouteUiReducer(state, { type: "START_NAVIGATION", waitAtTransition: true });
    expect(state).toMatchObject({ phase: "navigating", playback: "paused", camera: "follow", collapsed: true });
    expect(studentRoutePrimaryAction({ phase: state.phase, playback: state.playback, hasAuthoredTransition: true }))
      .toBe("continue-transition");
    state = studentRouteUiReducer(state, { type: "START_NAVIGATION" });
    expect(state).toMatchObject({ phase: "navigating", playback: "playing", camera: "follow" });
    state = studentRouteUiReducer(state, { type: "PAUSE" });
    expect(state.playback).toBe("paused");
    state = studentRouteUiReducer(state, { type: "ARRIVE" });
    expect(state).toMatchObject({ phase: "arrived", playback: "paused" });
    expect(studentRouteUiReducer(state, { type: "ARRIVE" })).toEqual(state);
    state = studentRouteUiReducer(state, { type: "END_NAVIGATION" });
    expect(state.phase).toBe("preview");
  });

  it("pauses playback in Explore and restores the exact prior state when returning to Follow", () => {
    let state = studentRouteUiReducer(initialStudentRouteUiState, { type: "FOUND_ROUTE" });
    state = studentRouteUiReducer(state, { type: "START_NAVIGATION", camera: "follow" });
    expect(state).toMatchObject({ phase: "navigating", playback: "playing", camera: "follow" });
    state = studentRouteUiReducer(state, { type: "SET_CAMERA_MODE", camera: "explore" });
    expect(state).toMatchObject({ phase: "navigating", playback: "paused", camera: "explore", resumePlaybackAfterExplore: "playing" });
    state = studentRouteUiReducer(state, { type: "SET_CAMERA_MODE", camera: "follow" });
    expect(state).toMatchObject({ phase: "navigating", playback: "playing", camera: "follow", resumePlaybackAfterExplore: null });
    state = studentRouteUiReducer(state, { type: "PAUSE" });
    state = studentRouteUiReducer(state, { type: "ENTER_EXPLORE" });
    expect(state).toMatchObject({ phase: "navigating", playback: "paused", camera: "explore", resumePlaybackAfterExplore: "paused" });
    state = studentRouteUiReducer(state, { type: "SET_CAMERA_MODE", camera: "follow" });
    expect(state).toMatchObject({ phase: "navigating", playback: "paused", camera: "follow", resumePlaybackAfterExplore: null });
  });

  it("pauses the canonical emergency cursor when seeking a step in Explore", () => {
    let state = studentRouteUiReducer(initialStudentRouteUiState, { type: "START_NAVIGATION", camera: "explore" });
    expect(state).toMatchObject({ phase: "navigating", playback: "paused", camera: "explore", resumePlaybackAfterExplore: "playing" });
    state = studentRouteUiReducer(state, { type: "SEEK_STEP" });
    expect(state).toMatchObject({ phase: "navigating", playback: "paused", camera: "explore", resumePlaybackAfterExplore: null });
  });

  it("starts in the camera mode selected in Route Preview", () => {
    let state = studentRouteUiReducer(initialStudentRouteUiState, { type: "FOUND_ROUTE" });
    expect(state).toMatchObject({ camera: "follow", phase: "preview", playback: "paused" });
    state = studentRouteUiReducer(state, { type: "START_NAVIGATION" });
    expect(state).toMatchObject({ phase: "navigating", camera: "follow", playback: "playing", resumePlaybackAfterExplore: null });
    state = studentRouteUiReducer(state, { type: "SET_CAMERA_MODE", camera: "explore" });
    expect(state).toMatchObject({ phase: "navigating", camera: "explore", playback: "paused", resumePlaybackAfterExplore: "playing" });
    state = studentRouteUiReducer(state, { type: "SET_CAMERA_MODE", camera: "follow" });
    expect(state).toMatchObject({ phase: "navigating", camera: "follow", playback: "playing", resumePlaybackAfterExplore: null });
  });

  it("preserves an explicit Explore choice through Start and resets a later independent route to Follow", () => {
    let state = studentRouteUiReducer(initialStudentRouteUiState, { type: "SET_CAMERA_MODE", camera: "explore" });
    state = studentRouteUiReducer(state, { type: "OPEN_PLAN" });
    state = studentRouteUiReducer(state, { type: "FOUND_ROUTE" });
    expect(state.camera).toBe("follow");
    state = studentRouteUiReducer(state, { type: "SET_CAMERA_MODE", camera: "explore" });
    state = studentRouteUiReducer(state, { type: "START_NAVIGATION" });
    expect(state).toMatchObject({ camera: "explore", playback: "paused", resumePlaybackAfterExplore: "playing" });
    state = studentRouteUiReducer(state, { type: "DONE" });
    state = studentRouteUiReducer(state, { type: "OPEN_PLAN" });
    state = studentRouteUiReducer(state, { type: "FOUND_ROUTE" });
    expect(state).toMatchObject({ camera: "follow", phase: "preview" });
  });

  it("preserves the selected mode when replacing a route candidate, but defaults a fresh route to Follow", () => {
    let state = studentRouteUiReducer(initialStudentRouteUiState, { type: "FOUND_ROUTE" });
    state = studentRouteUiReducer(state, { type: "SET_CAMERA_MODE", camera: "explore" });
    state = studentRouteUiReducer(state, { type: "START_NAVIGATION" });
    state = studentRouteUiReducer(state, { type: "END_NAVIGATION" });
    state = studentRouteUiReducer(state, { type: "FOUND_ROUTE", preserveCamera: true });
    expect(state).toMatchObject({ phase: "preview", camera: "explore", playback: "paused" });

    state = studentRouteUiReducer(state, { type: "OPEN_PLAN" });
    state = studentRouteUiReducer(state, { type: "FOUND_ROUTE" });
    expect(state).toMatchObject({ phase: "preview", camera: "follow", playback: "paused" });
  });

  it("resolves arrival from the final canonical endpoint, independent of playback lifecycle", () => {
    const segment = {
      buildingId: "caba",
      floorId: "caba-floor-4",
      floorNumber: 4,
      afterOutdoor: true,
      waypoints: [{ x: 5, y: 7 }, { x: 15, y: 17 }],
      distanceM: 12,
      seconds: 10,
      steps: [],
    };
    const route: PlannedRoute = {
      ...sampleRoute,
      indoorSegments: [segment],
      contextLegs: [{
        kind: "floor",
        buildingId: "caba",
        floorId: "caba-floor-4",
        floorNumber: 4,
        segmentIndex: 0,
        waypoints: segment.waypoints,
        distanceM: segment.distanceM,
      }],
      steps: [
        { id: "start", icon: "start", instruction: "Start in CABA.", contextLegIndex: 0 },
        { id: "walk", icon: "walk", instruction: "Follow the indoor path to CABA-403.", contextLegIndex: 0 },
        { id: "arrive", icon: "arrive", instruction: "Arrive at CABA-403.", contextLegIndex: 0 },
      ],
    };
    const steps = studentFacingRouteSteps(route);
    const endpoint = {
      route,
      steps,
      cursor: 2,
      context: "floor" as const,
      phase: "destination-indoor",
      segment,
      progress: 1,
    };

    expect(studentRouteReachedFinalEndpoint(endpoint)).toBe(true);
    expect(studentRouteArrivalTarget(route, steps)).toMatchObject({
      context: "floor",
      phase: "destination-indoor",
      segment,
      segmentProgress: 1,
    });
    expect(studentRouteArrivalTarget(route, steps)?.segment?.waypoints.at(-1)).toEqual({ x: 15, y: 17 });
    expect(studentRouteArrivalTarget(route, steps)).toEqual(studentRouteSeekTarget(route, steps, steps.length - 1));
    expect(studentRouteReachedFinalEndpoint({ ...endpoint, cursor: 1 })).toBe(false);
    expect(studentRouteReachedFinalEndpoint({ ...endpoint, phase: "origin-indoor" })).toBe(false);
    expect(studentRouteReachedFinalEndpoint({ ...endpoint, pendingTransition: true })).toBe(false);
    expect(studentRouteReachedFinalEndpoint({ ...endpoint, progress: 0.99 })).toBe(false);
  });

  it("keeps the final room walk and arrival on the destination floor when legacy step metadata points to an earlier floor", () => {
    const floorTwo = {
      buildingId: "caba", floorId: "caba-floor-2", floorNumber: 2, afterOutdoor: true,
      waypoints: [{ x: 5, y: 7 }, { x: 35, y: 7 }], distanceM: 16, seconds: 12, steps: [],
    };
    const floorFour = {
      buildingId: "caba", floorId: "caba-floor-4", floorNumber: 4, afterOutdoor: true,
      waypoints: [{ x: 5, y: 20 }, { x: 45, y: 20 }], distanceM: 24, seconds: 18, steps: [],
    };
    const route: PlannedRoute = {
      ...sampleRoute,
      points: [],
      campusPoints: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      indoorSegments: [floorTwo, floorFour],
      destinationRoom: { buildingId: "caba", floorNumber: 4, roomId: "caba-403" },
      contextLegs: [
        { kind: "campus", waypoints: [{ x: 0, y: 0 }, { x: 10, y: 0 }], distanceM: 10 },
        { kind: "floor", buildingId: "caba", floorId: "caba-floor-2", floorNumber: 2, segmentIndex: 0, waypoints: floorTwo.waypoints, distanceM: 16 },
        { kind: "floor", buildingId: "caba", floorId: "caba-floor-4", floorNumber: 4, segmentIndex: 1, waypoints: floorFour.waypoints, distanceM: 24 },
      ],
      steps: [
        { id: "start", icon: "start", instruction: "Start at CANTEEN." },
        { id: "campus", icon: "walk", instruction: "Follow the campus path to CABA." },
        { id: "enter", icon: "enter", instruction: "Enter CABA building." },
        // Legacy generated guidance incorrectly tagged this final walk with
        // the earlier CABA floor. Destination identity is authoritative.
        { id: "walk-room", icon: "walk", instruction: "Follow the indoor path to the door of CABA-403.", contextLegIndex: 1 },
        { id: "arrive", icon: "arrive", instruction: "Arrive at CABA-403.", contextLegIndex: 1 },
      ],
    };
    const steps = studentFacingRouteSteps(route);
    const walk = studentRouteSeekTarget(route, steps, 3);
    const arrive = studentRouteSeekTarget(route, steps, 4);

    expect(walk).toMatchObject({ context: "floor", segment: floorFour, segmentIndex: 1, segmentProgress: 0 });
    expect(arrive).toMatchObject({ context: "floor", segment: floorFour, segmentIndex: 1, segmentProgress: 1 });
    expect(studentRoutePlaybackTarget(route, steps, 3.5)).toMatchObject({ segment: floorFour, segmentProgress: 0.5 });
    expect(studentRouteSeekDistanceM(route, steps, 4, 3)).toBe(24);
    expect(studentRouteSeekGeometryDistance(route, steps, 4, 3)).toBe(40);
  });

  it("frames a campus Assembly Point instead of the retained origin building at SOS arrival", () => {
    const endpoint = { x: 146, y: 380 };
    const originBuildingCenter = { x: 520, y: 260 };
    const route = { ...sampleRoute, emergencyAssemblyPointId: "test-assembly-point" };

    expect(studentRouteArrivalCameraPoint(route, endpoint, originBuildingCenter)).toEqual(endpoint);
    expect(studentRouteArrivalCameraPoint(sampleRoute, endpoint, originBuildingCenter)).toEqual(originBuildingCenter);
  });

  it("derives Follow's primary action from the canonical transition and playback state", () => {
    expect(studentRoutePrimaryAction({ phase: "navigating", playback: "paused", hasAuthoredTransition: true }))
      .toBe("continue-transition");
    expect(studentRoutePrimaryAction({ phase: "navigating", playback: "paused", hasAuthoredTransition: true, hasAuthorizedVerticalRun: true }))
      .toBe("resume");
    expect(studentRoutePrimaryAction({ phase: "navigating", playback: "paused", hasAuthoredTransition: false }))
      .toBe("resume");
    expect(studentRoutePrimaryAction({ phase: "navigating", playback: "playing", hasAuthoredTransition: true }))
      .toBe("pause");
    expect(studentRoutePrimaryAction({ phase: "navigating", playback: "paused", hasAuthoredTransition: false, isArrival: true }))
      .toBe("done");
    expect(studentRoutePrimaryAction({ phase: "arrived", playback: "paused", hasAuthoredTransition: false }))
      .toBe("done");
  });

  it("uses Continue for authored elevator, stair, building-entry, and building-exit steps", () => {
    const transitions = [
      { icon: "elevator" as const, instruction: "Take Elevator 1 to Ground Floor.", kind: "elevator" },
      { icon: "stairs" as const, instruction: "Take Left Stair down to Ground Floor.", kind: "stairs" },
      { icon: "enter" as const, instruction: "Enter Student Center.", kind: "enter_building" },
      { icon: "enter" as const, instruction: "Exit to Campus.", kind: "exit_building" },
    ];
    transitions.forEach(({ icon, instruction, kind }) => {
      const step = { id: `transition-${kind}`, icon, instruction };
      const route = { ...sampleRoute, steps: [step] };
      const authoredTransition = routeTransitionForStep(route, [step], 0);
      expect(authoredTransition?.kind).toBe(kind);
      expect(studentRoutePrimaryAction({
        phase: "navigating",
        playback: "paused",
        hasAuthoredTransition: Boolean(authoredTransition),
      })).toBe("continue-transition");
    });
  });

  it("treats a Start from Entrance row as the route origin unless it owns an authored handoff", () => {
    const route: PlannedRoute = {
      ...sampleRoute,
      points: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      campusPoints: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      contextLegs: [{ kind: "campus", waypoints: [{ x: 0, y: 0 }, { x: 10, y: 0 }], distanceM: 10 }],
      contextHandoffs: [],
      steps: [
        { id: "origin", icon: "enter", instruction: "Start from Entrance 2" },
        { id: "campus-walk", icon: "walk", instruction: "Follow the campus path to CEIT.", contextLegIndex: 0 },
        { id: "arrival", icon: "arrive", instruction: "Arrive at CEIT.", contextLegIndex: 0 },
      ],
    };
    const steps = studentFacingRouteSteps(route);

    expect(routeTransitionForStep(route, steps, 0)).toBeNull();
    expect(studentRouteInitialPhysicalTransitionStepIndex(route, steps)).toBeNull();
    expect(studentRouteInitialContext(route, steps)).toBe("campus");
    expect(studentRouteSeekTarget(route, steps, 0)).toMatchObject({ context: "campus", routeProgress: 0 });

    const destinationEntranceRoute = {
      ...route,
      steps: [
        route.steps[0]!,
        { id: "walk-to-entrance", icon: "enter" as const, instruction: "Walk 21m to Primary Entrance" },
        route.steps[2]!,
      ],
    };
    const destinationSteps = studentFacingRouteSteps(destinationEntranceRoute);
    expect(routeTransitionForStep(destinationEntranceRoute, destinationSteps, 1)).toBeNull();
  });

  it("keeps building-to-building arrival in the outdoor context", () => {
    const route: PlannedRoute = {
      ...sampleRoute,
      points: [{ x: 240, y: 713 }, { x: 360, y: 713 }, { x: 520, y: 560 }, { x: 774, y: 713 }],
      campusPoints: [{ x: 240, y: 713 }, { x: 360, y: 713 }, { x: 520, y: 560 }, { x: 774, y: 713 }],
      indoorSegments: [],
      contextLegs: [{
        kind: "campus",
        waypoints: [{ x: 240, y: 713 }, { x: 360, y: 713 }, { x: 520, y: 560 }, { x: 774, y: 713 }],
        distanceM: 190,
      }],
      contextHandoffs: [],
      steps: [
        { id: "origin", icon: "start", instruction: "Start from Entrance 2" },
        { id: "campus-walk", icon: "walk", instruction: "Follow the central campus path to the Primary Entrance.", contextLegIndex: 0, distanceM: 190 },
        { id: "arrival", icon: "arrive", instruction: "Arrive at CEIT.", contextLegIndex: 0 },
      ],
    };
    const steps = studentFacingRouteSteps(route);
    const initialContext = studentRouteInitialContext(route, steps);

    expect(initialContext).toBe("campus");
    expect(studentRouteReachedFinalEndpoint({
      route,
      steps,
      cursor: steps.length - 1,
      context: initialContext,
      phase: "outdoor",
      progress: 1,
    })).toBe(true);
    expect(studentRouteReachedFinalEndpoint({
      route,
      steps,
      cursor: steps.length - 1,
      context: "floor",
      phase: "idle",
      progress: 1,
    })).toBe(false);
  });

  it("makes a Follow step seek explicitly paused and clears stale Explore resume state", () => {
    let state = studentRouteUiReducer(initialStudentRouteUiState, { type: "START_NAVIGATION" });
    state = studentRouteUiReducer(state, { type: "ENTER_EXPLORE" });
    expect(state.resumePlaybackAfterExplore).toBe("playing");
    state = studentRouteUiReducer(state, { type: "RECENTER" });
    state = studentRouteUiReducer(state, { type: "SEEK_STEP" });
    expect(state).toMatchObject({ phase: "navigating", camera: "follow", playback: "paused", resumePlaybackAfterExplore: null });
  });

  it("keeps the attached Follow camera authoritative over selected-room framing", () => {
    expect(studentRouteFollowOwnsCamera({ phase: "navigating", camera: "follow", cameraDetached: false })).toBe(true);
    expect(studentRouteFollowOwnsCamera({ phase: "navigating", camera: "follow", cameraDetached: true })).toBe(false);
    expect(studentRouteFollowOwnsCamera({ phase: "navigating", camera: "explore", cameraDetached: false })).toBe(false);
    expect(studentRouteFollowOwnsCamera({ phase: "preview", camera: "follow", cameraDetached: false })).toBe(false);
  });

  it("preserves a route through edit, Explore mode, collapse, and recenter transitions", () => {
    let state = studentRouteUiReducer(initialStudentRouteUiState, { type: "OPEN_PLAN" });
    state = studentRouteUiReducer(state, { type: "FOUND_ROUTE" });
    state = studentRouteUiReducer(state, { type: "EDIT_ROUTE" });
    expect(state.phase).toBe("planning");
    state = studentRouteUiReducer(state, { type: "FOUND_ROUTE" });
    state = studentRouteUiReducer(state, { type: "START_NAVIGATION" });
    state = studentRouteUiReducer(state, { type: "ENTER_EXPLORE" });
    expect(state.camera).toBe("explore");
    state = studentRouteUiReducer(state, { type: "COLLAPSE" });
    expect(state).toMatchObject({ phase: "navigating", collapsed: true });
    state = studentRouteUiReducer(state, { type: "RECENTER" });
    expect(state).toMatchObject({ phase: "navigating", camera: "follow", collapsed: true });
    expect(studentRouteUiReducer(state, { type: "ARRIVE" }).phase).toBe("arrived");
    expect(studentRouteUiReducer(state, { type: "DONE" }).phase).toBe("idle");
  });

  it("starts same-building entrance routes outside and treats Enter as the first Follow action", () => {
    const campusBoundary = { x: 42, y: 28 };
    const indoor = {
      buildingId: "caba",
      floorId: "caba-ground",
      floorNumber: 1,
      afterOutdoor: true,
      waypoints: [{ x: 4, y: 5 }, { x: 8, y: 10 }],
      distanceM: 9,
      seconds: 8,
      steps: [{ id: "indoor", icon: "walk" as const, instruction: "Follow the indoor path to CABA-403." }],
    };
    const route: PlannedRoute = {
      ...sampleRoute,
      fromCode: "CABA",
      toCode: "CABA-403",
      points: [campusBoundary],
      campusPoints: [campusBoundary],
      indoorSegments: [indoor],
      contextLegs: [
        { kind: "campus", waypoints: [campusBoundary], distanceM: 0 },
        { kind: "floor", buildingId: "caba", floorId: "caba-ground", floorNumber: 1, segmentIndex: 0, waypoints: indoor.waypoints, distanceM: 9 },
      ],
      contextHandoffs: [{
        fromContextLegIndex: 0,
        toContextLegIndex: 1,
        kind: "enter_building",
        buildingId: "caba",
        buildingCode: "CABA",
        label: "CABA entrance",
        nodeId: "caba-primary-entry",
        sourcePoint: campusBoundary,
        targetPoint: indoor.waypoints[0],
      }],
      steps: [
        { id: "start", icon: "start", instruction: "Start at the entrance of CABA building." },
        { id: "enter", icon: "enter", instruction: "Enter CABA building." },
        { id: "walk", icon: "walk", instruction: "Follow the indoor path to CABA-403.", contextLegIndex: 1 },
        { id: "arrive", icon: "arrive", instruction: "Arrive at CABA-403.", contextLegIndex: 1 },
      ],
    };
    const steps = studentFacingRouteSteps(route);
    const entryIndex = studentRouteInitialPhysicalTransitionStepIndex(route, steps);

    expect(entryIndex).toBe(1);
    expect(route.campusPoints).toEqual([campusBoundary]);
    expect(steps.some((step) => step.icon === "walk" && /campus/i.test(step.instruction))).toBe(false);
    expect(studentRouteSeekTarget(route, steps, entryIndex!)).toMatchObject({
      context: "campus",
      phase: "outdoor",
      contextLegIndex: 0,
      routeProgress: 1,
    });
    expect(studentRoutePrimaryAction({
      phase: "navigating",
      playback: "paused",
      hasAuthoredTransition: true,
    })).toBe("continue-transition");
    expect(studentRouteSeekTarget(route, steps, entryIndex! + 1)).toMatchObject({
      context: "floor",
      phase: "destination-indoor",
      segment: indoor,
      segmentProgress: 0,
    });

    const withRealApproach: PlannedRoute = {
      ...route,
      steps: [
        steps[0],
        { id: "approach", icon: "walk", instruction: "Walk to CABA entrance.", distanceM: 4 },
        ...steps.slice(1),
      ],
    };
    expect(studentRouteInitialPhysicalTransitionStepIndex(withRealApproach, withRealApproach.steps)).toBeNull();
  });

  it("restores the exact Arrived UI state when completed-route editing is canceled", () => {
    let arrived = studentRouteUiReducer(initialStudentRouteUiState, { type: "FOUND_ROUTE" });
    arrived = studentRouteUiReducer(arrived, { type: "START_NAVIGATION" });
    arrived = studentRouteUiReducer(arrived, { type: "ARRIVE" });
    const planning = studentRouteUiReducer(arrived, { type: "EDIT_ROUTE" });
    expect(planning.phase).toBe("planning");
    expect(studentRouteUiReducer(planning, { type: "CANCEL_ROUTE_EDIT", restore: arrived })).toEqual(arrived);
  });

  it("automatically expands the full arrival state, then respects a later deliberate collapse", () => {
    let state = studentRouteUiReducer(initialStudentRouteUiState, { type: "FOUND_ROUTE" });
    state = studentRouteUiReducer(state, { type: "START_NAVIGATION" });
    state = studentRouteUiReducer(state, { type: "ARRIVE" });
    expect(state).toMatchObject({ phase: "arrived", playback: "paused", collapsed: false });
    state = studentRouteUiReducer(state, { type: "EXPAND" });
    expect(state).toMatchObject({ phase: "arrived", playback: "paused", collapsed: false });
    state = studentRouteUiReducer(state, { type: "COLLAPSE" });
    expect(state).toMatchObject({ phase: "arrived", playback: "paused", collapsed: true });
  });

  it("creates readable route facts and hides unreliable distance/time and graph waypoints", () => {
    expect(studentRouteFacts(sampleRoute, "best")).toEqual(["Indoor + outdoor", "Elevator", "Floor 1 → Floor 4"]);
    expect(studentFacingRouteSteps(sampleRoute).map((step) => step.instruction)).toEqual([
      "Start at Campus Gate.",
      "Take the elevator to Floor 4.",
      "Arrive at the destination.",
    ]);
    expect(routeStepIndexForProgress(studentFacingRouteSteps(sampleRoute), 1)).toBe(2);
    expect(routeTransitionForStep(sampleRoute, studentFacingRouteSteps(sampleRoute), 0)).toBeNull();
    const steps = studentFacingRouteSteps(sampleRoute);
    expect(routeProgressForStepIndex(steps, 0)).toBe(0);
    expect(routeProgressForStepIndex(steps, steps.length - 1)).toBe(1);
    expect(routeStepIndexForProgress(steps, routeProgressForStepIndex(steps, 1))).toBe(1);
    expect(studentRouteFacts(sampleRoute, "best").join(" ")).not.toMatch(/\b(?:m|min)\b/i);
    expect(studentRouteFacts(sampleRoute, "stairs")).toContain("No stair route available");
    expect(studentRoutePreferenceFallbackNotice(sampleRoute, "stairs")).toBe("No connected route using stairs is available; this route uses the elevator.");
    expect(studentRoutePreferenceFallbackNotice(sampleRoute, "elevator")).toBeNull();
    expect(studentRoutePreferenceFallbackNotice(sampleRoute, "best")).toBeNull();
  });

  it("starts a building-origin room route at its authored outside entrance when Enter is the first action", () => {
    const entrance = { x: 90, y: 80 };
    const floorStart = { x: 0, y: 0 };
    const route: PlannedRoute = {
      ...sampleRoute,
      points: [entrance],
      campusPoints: [entrance],
      destinationRoom: { buildingId: "caba", floorNumber: 2, roomId: "caba-201" },
      indoorSegments: [{ buildingId: "caba", floorId: "caba-2", floorNumber: 2, afterOutdoor: true,
        waypoints: [floorStart, { x: 20, y: 10 }], distanceM: 12, seconds: 8, steps: [] }],
      contextLegs: [
        { kind: "campus", waypoints: [entrance], distanceM: 0 },
        { kind: "floor", buildingId: "caba", floorId: "caba-2", floorNumber: 2, segmentIndex: 0,
          waypoints: [floorStart, { x: 20, y: 10 }], distanceM: 12 },
      ],
      contextHandoffs: [{ fromContextLegIndex: 0, toContextLegIndex: 1, kind: "enter_building",
        buildingId: "caba", label: "CABA entrance", nodeId: "caba-entry", sourcePoint: entrance, targetPoint: floorStart }],
      steps: [
        { id: "start", icon: "start", instruction: "Start at the entrance of CABA building.", contextLegIndex: 0 },
        { id: "enter", icon: "enter", instruction: "Enter CABA building.", contextLegIndex: 0, contextHandoffIndex: 0 },
        { id: "walk", icon: "walk", instruction: "Follow the indoor path to CABA-201.", distanceM: 12, contextLegIndex: 1 },
        { id: "arrive", icon: "arrive", instruction: "Arrive at CABA-201.", contextLegIndex: 1 },
      ],
    };
    const steps = studentFacingRouteSteps(route);

    expect(steps.map((step) => step.instruction)).toEqual([
      "Enter CABA building.",
      "Follow the indoor path to CABA-201.",
      "Arrive at CABA-201.",
    ]);
    expect(studentRouteInitialPhysicalTransitionStepIndex(route, steps)).toBe(0);
    expect(studentRouteInitialContext(route, steps)).toBe("campus");
    expect(studentRouteSeekTarget(route, steps, 0)).toMatchObject({ context: "campus", routeProgress: 1 });
    expect(studentRouteInitialContext(route, steps, true)).toBe("floor");
  });

  it("rephrases legacy metre instructions into semantic student directions", () => {
    const route = { ...sampleRoute, steps: [
      { id: "walk", icon: "walk" as const, instruction: "Walk 21m to Primary Entrance." },
      { id: "walk-spaced", icon: "walk" as const, instruction: "Walk 148 m toward the Library." },
      { id: "walk-no-target", icon: "walk" as const, instruction: "Walk 19m." },
    ] };
    expect(studentFacingRouteSteps(route).map((step) => step.instruction)).toEqual([
      "Follow the path toward Primary Entrance.",
      "Follow the path toward the Library.",
      "Continue along the route.",
    ]);
    expect(studentInstructionWithoutUncalibratedDistance("Walk 21m to Primary Entrance.")).not.toMatch(/\b\d+\s*m\b/i);
  });

  it("shows each preview transition only in its authored source context", () => {
    const route: PlannedRoute = {
      ...sampleRoute,
      points: [{ x: 12, y: 20 }, { x: 90, y: 80 }],
      campusPoints: [{ x: 12, y: 20 }, { x: 90, y: 80 }],
      indoorSegments: [
        { buildingId: "science", floorId: "floor-1", floorNumber: 1, afterOutdoor: false, waypoints: [{ x: 4, y: 8 }, { x: 30, y: 40 }], distanceM: 10, seconds: 10, steps: [{ id: "walk-g", icon: "walk", instruction: "Follow the indoor path to Main elevator." }] },
        { buildingId: "science", floorId: "floor-4", floorNumber: 4, afterOutdoor: true, waypoints: [{ x: 50, y: 60 }, { x: 80, y: 90 }], distanceM: 10, seconds: 10, steps: [{ id: "walk-4", icon: "walk", instruction: "Follow the indoor path to the destination." }] },
      ],
      steps: [
        { id: "campus-walk", icon: "walk", instruction: "Follow the Campus path to Science Hall." },
        { id: "enter", icon: "enter", instruction: "Enter Science Hall." },
        { id: "walk-g", icon: "walk", instruction: "Follow the indoor path to Main elevator." },
        { id: "elevator", icon: "elevator", instruction: "Take Main elevator to Floor 4." },
        { id: "walk-4", icon: "walk", instruction: "Follow the indoor path to the destination." },
      ],
      transitionDetails: [{ kind: "elevator", nodeId: "lift-floor-4", label: "Main elevator", fromFloorId: "floor-1", toFloorId: "floor-4" }],
    };
    const steps = studentFacingRouteSteps(route);
    const nodes: NavigationNode[] = [{
      id: "lift-floor-4", name: "Main elevator", type: "elevator", x: 2, y: 3,
      elevatorId: "lift-4", floorId: "floor-4", transitionSharedId: "main-lift", accessible: true, color: "#2563eb",
    }];
    const floor1 = { id: "floor-1", elevators: [{ id: "lift-1", x: 10, y: 20, width: 20, height: 40 }] } as unknown as FloorPlan;
    const floor4 = { id: "floor-4", elevators: [{ id: "lift-4", x: 100, y: 120, width: 20, height: 40 }] } as unknown as FloorPlan;

    expect(studentRouteTransitionCues(route, steps, { kind: "campus" })).toEqual([
      { id: "enter", kind: "enter_building", label: "Enter Science Hall.", point: { x: 90, y: 80 } },
    ]);
    expect(studentRouteTransitionCues(route, steps, { kind: "floor", buildingId: "science", floor: floor1, floorNumber: 1 }, [
      { ...nodes[0], id: "lift-floor-1", floorId: "floor-1", elevatorId: "lift-1", x: 20, y: 40 },
      nodes[0],
    ])).toEqual([
      { id: "lift-floor-4", kind: "elevator", groupId: "elevator:science:main-lift", label: "Take Main elevator to Floor 4.", displayLabel: "Elevator Up — Floor 4", point: { x: 20, y: 40 } },
    ]);
    expect(studentRouteTransitionCues(route, steps, { kind: "floor", buildingId: "science", floor: floor4, floorNumber: 4 }, nodes)).toEqual([]);
  });

  it("offers the next Explore transition only on the currently inspected route context", () => {
    const route: PlannedRoute = {
      ...sampleRoute,
      indoorSegments: [{
        buildingId: "science", floorId: "floor-1", floorNumber: 1, afterOutdoor: false,
        waypoints: [{ x: 4, y: 8 }, { x: 30, y: 40 }], distanceM: 10, seconds: 10,
        steps: [{ id: "walk", icon: "walk", instruction: "Follow the indoor path to the exit." }],
      }],
      steps: [
        { id: "walk", icon: "walk", instruction: "Follow the indoor path to the exit." },
        { id: "exit", icon: "enter", instruction: "Exit Science Hall to Campus." },
        { id: "campus-walk", icon: "walk", instruction: "Follow the Campus path toward the Gate." },
      ],
    };
    const steps = studentFacingRouteSteps(route);
    const floor = { id: "floor-1", doors: [] } as unknown as FloorPlan;
    const floorCues = studentRouteTransitionCues(route, steps, { kind: "floor", buildingId: "science", floor, floorNumber: 1 });
    expect(studentRouteExploreTransitionCue(route, steps, floorCues, 0)).toMatchObject({
      cue: { id: "exit", kind: "exit_building" },
      transitionStepIndex: 1,
    });
    expect(studentRouteExploreTransitionCue(route, steps, floorCues, 2)).toBeNull();
  });

  it("shows an Explore return cue only for the same authored, traversable vertical connection", () => {
    const source = { buildingId: "caba", floorId: "caba-ground", floorNumber: 1, afterOutdoor: false,
      waypoints: [{ x: 10, y: 20 }, { x: 40, y: 20 }], distanceM: 30, seconds: 20, steps: [] };
    const destination = { buildingId: "caba", floorId: "caba-four", floorNumber: 4, afterOutdoor: false,
      waypoints: [{ x: 100, y: 120 }, { x: 140, y: 120 }], distanceM: 40, seconds: 25, steps: [] };
    const detail = { kind: "elevator" as const, nodeId: "lift-ground", label: "Elevator 1",
      fromFloorId: "caba-ground", toFloorId: "caba-four", transitionSharedId: "caba-lift-1", buildingId: "caba" };
    const route: PlannedRoute = {
      ...sampleRoute,
      destinationRoom: { buildingId: "caba", floorNumber: 4, roomId: "caba-403" },
      indoorSegments: [source, destination],
      contextLegs: [
        { kind: "floor", buildingId: "caba", floorId: "caba-ground", floorNumber: 1, segmentIndex: 0, waypoints: source.waypoints, distanceM: source.distanceM },
        { kind: "floor", buildingId: "caba", floorId: "caba-four", floorNumber: 4, segmentIndex: 1, waypoints: destination.waypoints, distanceM: destination.distanceM },
      ],
      contextHandoffs: [{ fromContextLegIndex: 0, toContextLegIndex: 1, kind: "elevator", label: detail.label,
        nodeId: detail.nodeId, buildingId: "caba", sourcePoint: source.waypoints[1]!, targetPoint: destination.waypoints[0]!, detail }],
      transitionDetails: [detail],
      steps: [
        { id: "walk-ground", icon: "walk", instruction: "Follow the indoor path to Elevator 1.", contextLegIndex: 0 },
        { id: "elevator", icon: "elevator", instruction: "Take Elevator 1 to Floor 4.", contextLegIndex: 0, contextHandoffIndex: 0 },
        { id: "walk-four", icon: "walk", instruction: "Follow the indoor path to CABA-403.", contextLegIndex: 1, distanceM: 40 },
        { id: "arrive", icon: "arrive", instruction: "Arrive at CABA-403.", contextLegIndex: 1 },
      ],
    };
    const steps = studentFacingRouteSteps(route);
    const nodes: NavigationNode[] = [
      { id: "lift-ground", name: "Elevator 1", type: "elevator", x: 20, y: 40, buildingId: "caba", floorId: "caba-ground", elevatorId: "lift-ground-object", transitionSharedId: "caba-lift-1", accessible: true, color: "#2563eb" },
      { id: "lift-four", name: "Elevator 1", type: "elevator", x: 110, y: 140, buildingId: "caba", floorId: "caba-four", elevatorId: "lift-four-object", transitionSharedId: "caba-lift-1", accessible: true, color: "#2563eb" },
    ];
    const edge: NavigationEdge = { id: "lift-1-connection", startNodeId: "lift-ground", endNodeId: "lift-four", distance: 1,
      bidirectional: true, accessible: true, emergencySafe: true, type: "elevator", color: "#2563eb", width: 4 };
    const floor4 = { id: "caba-four", elevators: [{ id: "lift-four-object", x: 100, y: 120, width: 20, height: 40 }] } as unknown as FloorPlan;
    const cues = studentRouteTransitionCues(route, steps, { kind: "floor", buildingId: "caba", floor: floor4, floorNumber: 4 }, nodes, [edge], "standard");
    expect(cues).toContainEqual(expect.objectContaining({
      kind: "elevator", returnToStepIndex: 1, viewOnSegmentIndex: 1,
      displayLabel: "Elevator Down · Return to Ground Floor", point: { x: 110, y: 140 },
    }));
    expect(studentRouteExploreTransitionCues(route, steps, cues, 2)).toContainEqual(expect.objectContaining({
      cue: expect.objectContaining({ returnToStepIndex: 1 }), transitionStepIndex: 1,
    }));
    expect(studentRouteExploreTransitionCues(route, steps, cues, 0)).toEqual([]);
    expect(studentRouteTransitionCues(route, steps, { kind: "floor", buildingId: "caba", floor: floor4, floorNumber: 4 }, nodes,
      [{ ...edge, accessible: false }], "accessible")).toEqual([]);
    expect(studentRouteTransitionCues(route, steps, { kind: "floor", buildingId: "caba", floor: floor4, floorNumber: 4 }, nodes,
      [{ ...edge, emergencySafe: false }], "emergency")).toEqual([]);
  });

  it("anchors a Building exit cue to the source Floor, never to Campus", () => {
    const route: PlannedRoute = {
      ...sampleRoute,
      points: [{ x: 12, y: 20 }, { x: 90, y: 80 }],
      campusPoints: [{ x: 12, y: 20 }, { x: 90, y: 80 }],
      indoorSegments: [{ buildingId: "science", floorId: "floor-1", floorNumber: 1, afterOutdoor: false, waypoints: [{ x: 4, y: 8 }, { x: 30, y: 40 }], distanceM: 10, seconds: 10, steps: [{ id: "walk", icon: "walk", instruction: "Follow the indoor path to the exit." }] }],
      steps: [
        { id: "walk", icon: "walk", instruction: "Follow the indoor path to the exit." },
        { id: "exit", icon: "enter", instruction: "Exit Science Hall to Campus." },
        { id: "campus", icon: "walk", instruction: "Follow the Campus path toward the gate." },
      ],
    };
    const steps = studentFacingRouteSteps(route);
    const floor = { id: "floor-1", doors: [] } as unknown as FloorPlan;

    expect(studentRouteTransitionCues(route, steps, { kind: "campus" })).toEqual([]);
    expect(studentRouteTransitionCues(route, steps, { kind: "floor", buildingId: "science", floor, floorNumber: 1 })).toEqual([
      { id: "exit", kind: "exit_building", label: "Exit Science Hall to Campus.", point: { x: 30, y: 40 } },
    ]);
  });

  it("resolves an arrival immediately after a building exit to the authored Campus handoff", () => {
    const indoorSegment = {
      buildingId: "science",
      floorId: "floor-1",
      floorNumber: 1,
      afterOutdoor: false,
      waypoints: [{ x: 4, y: 8 }, { x: 30, y: 40 }],
      distanceM: 10,
      seconds: 8,
      steps: [{ id: "indoor-walk", icon: "walk" as const, instruction: "Follow the indoor path to the building exit door." }],
    };
    const route: PlannedRoute = {
      ...sampleRoute,
      points: [{ x: 90, y: 80 }],
      campusPoints: [{ x: 90, y: 80 }],
      indoorSegments: [indoorSegment],
      contextLegs: [
        { kind: "floor", buildingId: "science", floorId: "floor-1", floorNumber: 1, segmentIndex: 0, waypoints: indoorSegment.waypoints, distanceM: 10 },
        { kind: "campus", waypoints: [{ x: 90, y: 80 }], distanceM: 0 },
      ],
      contextHandoffs: [{
        fromContextLegIndex: 0,
        toContextLegIndex: 1,
        kind: "exit_building",
        buildingId: "science",
        label: "Main Exit",
        sourcePoint: { x: 30, y: 40 },
        targetPoint: { x: 90, y: 80 },
      }],
      steps: [
        { id: "start", icon: "start", instruction: "Start at the room." },
        { id: "indoor-walk", icon: "walk", instruction: "Follow the indoor path to the building exit door." },
        { id: "exit", icon: "enter", instruction: "Exit Science Hall building." },
        { id: "arrive", icon: "arrive", instruction: "Arrive at the entrance of Science Hall building." },
      ],
    };
    const steps = studentFacingRouteSteps(route);
    const exitIndex = 2;

    expect(routeTransitionForStep(route, steps, exitIndex)?.kind).toBe("exit_building");
    expect(studentRouteSeekTarget(route, steps, exitIndex).context).toBe("floor");
    expect(studentRoutePrimaryAction({
      phase: "navigating",
      playback: "paused",
      hasAuthoredTransition: true,
    })).toBe("continue-transition");

    const arrivalTarget = studentRouteSeekTarget(route, steps, exitIndex + 1);
    expect(arrivalTarget).toMatchObject({
      context: "campus",
      phase: "outdoor",
      contextLegIndex: 1,
      segmentProgress: 1,
      routeProgress: 1,
    });
  });

  it("maps current enter, exit, stair, and elevator instructions to authored transition identity", () => {
    const route: PlannedRoute = {
      ...sampleRoute,
      steps: [
        { id: "enter", icon: "enter", instruction: "Enter Science Hall." },
        { id: "elevator", icon: "elevator", instruction: "Take Main Lift to Floor 4." },
        { id: "stairs", icon: "stairs", instruction: "Take West Stairs down to Ground Floor." },
        { id: "exit", icon: "enter", instruction: "Exit Science Hall." },
      ],
      transitionDetails: [
        { kind: "elevator", nodeId: "lift-1", label: "Main Lift" },
        { kind: "stairs", nodeId: "stairs-2", label: "West Stairs" },
      ],
    };
    const steps = studentFacingRouteSteps(route);

    expect(routeTransitionForStep(route, steps, 0)).toEqual({ kind: "enter_building" });
    expect(routeTransitionForStep(route, steps, 1)).toEqual({
      kind: "elevator",
      detail: { kind: "elevator", nodeId: "lift-1", label: "Main Lift" },
    });
    expect(routeTransitionForStep(route, steps, 2)).toEqual({
      kind: "stairs",
      detail: { kind: "stairs", nodeId: "stairs-2", label: "West Stairs" },
    });
    expect(routeTransitionForStep(route, steps, 3)).toEqual({ kind: "exit_building" });
    expect(routeTransitionForStep(route, steps, 4)).toBeNull();
    expect(routeStepIndexForBuildingTransition(steps, "enter")).toBe(0);
    expect(routeStepIndexForBuildingTransition(steps, "exit")).toBe(3);
    expect(routeStepIndexForAuthoredTransition(route, steps, route.transitionDetails![0]!)).toBe(1);
    expect(routeStepIndexForAuthoredTransition(route, steps, route.transitionDetails![1]!)).toBe(2);
  });

  it("resolves Explore transition clicks to the next authored context without changing the Follow cursor", () => {
    const ground = {
      buildingId: "science", floorId: "ground", floorNumber: 1, afterOutdoor: true,
      waypoints: [{ x: 1, y: 1 }, { x: 2, y: 2 }], distanceM: 10, seconds: 5,
      steps: [{ id: "ground-walk", icon: "walk" as const, instruction: "Walk to the elevator." }],
    };
    const fourth = {
      buildingId: "science", floorId: "floor-4", floorNumber: 4, afterOutdoor: true,
      waypoints: [{ x: 2, y: 2 }, { x: 8, y: 8 }], distanceM: 10, seconds: 5,
      steps: [{ id: "fourth-walk", icon: "walk" as const, instruction: "Walk to Room 401." }],
    };
    const elevatorRoute: PlannedRoute = {
      ...sampleRoute,
      indoorSegments: [ground, fourth],
      steps: [ground.steps[0], { id: "lift", icon: "elevator" as const, instruction: "Take Main Elevator to Floor 4." }, fourth.steps[0]],
      transitionDetails: [{ kind: "elevator", nodeId: "lift-node", label: "Main Elevator", fromFloorId: "ground", toFloorId: "floor-4" }],
    };
    const elevatorInspection = studentRouteExploreTransitionTarget(elevatorRoute, elevatorRoute.steps, 1);
    expect(elevatorInspection).toMatchObject({
      transition: { kind: "elevator", detail: { nodeId: "lift-node", toFloorId: "floor-4" } },
      targetStepIndex: 2,
      target: { context: "floor", segment: { floorId: "floor-4" } },
    });

    const entranceRoute: PlannedRoute = {
      ...sampleRoute,
      indoorSegments: [{ ...ground, afterOutdoor: true }],
      steps: [
        { id: "campus-walk", icon: "walk" as const, instruction: "Follow the campus path to Science Hall." },
        { id: "enter", icon: "enter" as const, instruction: "Enter Science Hall." },
        { id: "inside-walk", icon: "walk" as const, instruction: "Follow the indoor path to Room 101." },
      ],
    };
    expect(studentRouteExploreTransitionTarget(entranceRoute, entranceRoute.steps, 1)).toMatchObject({
      transition: { kind: "enter_building" },
      targetStepIndex: 2,
      target: { context: "floor", phase: "destination-indoor", segment: { floorId: "ground" } },
    });

    const exitRoute: PlannedRoute = {
      ...sampleRoute,
      indoorSegments: [{ ...ground, afterOutdoor: false }],
      steps: [ground.steps[0], { id: "exit", icon: "enter" as const, instruction: "Exit Science Hall to Campus." }, { id: "campus-walk", icon: "walk" as const, instruction: "Follow the campus path to the Gate." }],
    };
    expect(studentRouteExploreTransitionTarget(exitRoute, exitRoute.steps, 1)).toMatchObject({
      transition: { kind: "exit_building" },
      targetStepIndex: 2,
      target: { context: "campus", phase: "outdoor" },
    });
    expect(studentRouteExploreTransitionTarget(exitRoute, exitRoute.steps, 99)).toBeNull();
  });

  it.each([
    ["up", [1, 2, 3, 4], "floor-4"],
    ["down", [4, 3, 2, 1], "floor-1"],
  ] as const)("Explore elevator inspection resolves the authored direct %s destination over an intermediate handoff", (_direction, floorNumbers, destinationFloorId) => {
    const segments = floorNumbers.map((floorNumber, index) => ({
      buildingId: "caba",
      floorId: `floor-${floorNumber}`,
      floorNumber,
      afterOutdoor: true,
      // Intermediate zero-walk elevator stops use one landing point. Distinct
      // coordinates would represent a real floor-local walk and must remain.
      waypoints: index === 0 || index === floorNumbers.length - 1
        ? [{ x: index, y: index }, { x: index + 1, y: index + 1 }]
        : [{ x: index, y: index }],
      distanceM: index === 0 || index === floorNumbers.length - 1 ? 12 : 0,
      seconds: index === 0 || index === floorNumbers.length - 1 ? 8 : 0,
      steps: [{ id: `walk-${floorNumber}`, icon: "walk" as const, instruction: `Follow the Floor ${floorNumber} path.` }],
    }));
    const transitionDetails = segments.slice(0, -1).map((segment, index) => ({
      kind: "elevator" as const,
      nodeId: `lift-${index}`,
      label: "Elevator 1",
      fromFloorId: segment.floorId,
      toFloorId: segments[index + 1].floorId,
      transitionSharedId: "caba-elevator-shaft",
      buildingId: "caba",
    }));
    const contextHandoffs = transitionDetails.map((detail, index) => ({
      fromContextLegIndex: index,
      toContextLegIndex: index + 1,
      kind: "elevator" as const,
      buildingId: "caba",
      label: "Elevator 1",
      nodeId: detail.nodeId,
      detail,
      sourcePoint: segments[index].waypoints.at(-1)!,
      targetPoint: segments[index + 1].waypoints[0],
    }));
    const steps = segments.flatMap((segment, index) => [
      { ...segment.steps[0], contextLegIndex: index },
      ...(index < transitionDetails.length ? [{
        id: `elevator-${index}`,
        icon: "elevator" as const,
        instruction: `Take Elevator 1 to Floor ${floorNumbers[index + 1]}.`,
        contextLegIndex: index,
        contextHandoffIndex: index,
      }] : []),
    ]);
    const route: PlannedRoute = {
      ...sampleRoute,
      indoorSegments: segments,
      contextLegs: segments.map((segment, index) => ({
        kind: "floor" as const,
        buildingId: "caba",
        floorId: segment.floorId,
        floorNumber: segment.floorNumber,
        segmentIndex: index,
        waypoints: segment.waypoints,
        distanceM: segment.distanceM,
      })),
      contextHandoffs,
      transitionDetails,
      steps,
    };
    const firstElevatorStepIndex = 1;
    const rawInspection = studentRouteExploreTransitionTarget(route, route.steps, firstElevatorStepIndex);
    expect(rawInspection?.transition.handoff?.toContextLegIndex).toBe(segments.length - 1);
    expect(rawInspection?.transition.detail?.toFloorId).toBe(destinationFloorId);
    expect(rawInspection?.target).toMatchObject({ context: "floor", segment: { floorId: destinationFloorId } });

    const studentSteps = studentFacingRouteSteps(route);
    const visibleElevatorStepIndex = studentSteps.findIndex((step) => step.icon === "elevator");
    expect(studentRouteExploreTransitionTarget(route, studentSteps, visibleElevatorStepIndex)?.target)
      .toMatchObject({ context: "floor", segment: { floorId: destinationFloorId } });
    expect(routeTransitionForStep(route, studentSteps, visibleElevatorStepIndex)?.handoff?.toContextLegIndex)
      .toBe(segments.length - 1);
    expect(studentRouteSeekTarget(route, studentSteps, visibleElevatorStepIndex + 1))
      .toMatchObject({ context: "floor", segment: { floorId: destinationFloorId } });
  });

  it.each([
    ["up", [1, 2, 3, 4], "floor-2", "Continue Upstairs — Floor 3"],
    ["down", [4, 3, 2, 1], "floor-3", "Continue Downstairs — Floor 2"],
  ] as const)("labels the next authored stair landing while continuing %s", (_direction, floorNumbers, sourceFloorId, expectedLabel) => {
    const segments = floorNumbers.map((floorNumber, index) => ({
      buildingId: "caba",
      floorId: `floor-${floorNumber}`,
      floorNumber,
      afterOutdoor: true,
      waypoints: [{ x: index, y: 1 }, { x: index + 1, y: 1 }],
      distanceM: 10,
      seconds: 8,
      steps: [{ id: `walk-${floorNumber}`, icon: "walk" as const, instruction: `Follow the Floor ${floorNumber} path.` }],
    }));
    const transitionDetails = segments.slice(0, -1).map((segment, index) => ({
      kind: "stairs" as const,
      nodeId: `stair-node-${index}`,
      label: "Main Stair",
      fromFloorId: segment.floorId,
      toFloorId: segments[index + 1].floorId,
      transitionSharedId: "caba-main-stair",
      buildingId: "caba",
    }));
    const route: PlannedRoute = {
      ...sampleRoute,
      indoorSegments: segments,
      contextLegs: segments.map((segment, index) => ({
        kind: "floor" as const,
        buildingId: "caba",
        floorId: segment.floorId,
        floorNumber: segment.floorNumber,
        segmentIndex: index,
        waypoints: segment.waypoints,
        distanceM: segment.distanceM,
      })),
      transitionDetails,
      steps: segments.flatMap((segment, index) => [
        { ...segment.steps[0], contextLegIndex: index },
        ...(index < transitionDetails.length ? [{
          id: `stair-${index}`,
          icon: "stairs" as const,
          instruction: `Take the Main Stair to Floor ${floorNumbers[index + 1]}.`,
          contextLegIndex: index,
        }] : []),
      ]),
    };
    const steps = studentFacingRouteSteps(route);
    const sourceFloor = segments.find((segment) => segment.floorId === sourceFloorId)!;
    const stepIndex = steps.findIndex((step) => step.icon === "stairs"
      && routeTransitionForStep(route, steps, steps.indexOf(step))?.detail?.fromFloorId === sourceFloorId);
    const stairDetail = routeTransitionForStep(route, steps, stepIndex)!.detail!;
    const sourceFloorPlan = {
      id: sourceFloorId,
      stairs: [{ id: `stairs-${sourceFloor.floorNumber}`, x: 10, y: 20, width: 6, height: 12 }],
    } as unknown as FloorPlan;
    const nodes: NavigationNode[] = [{
      id: stairDetail.nodeId,
      name: stairDetail.label,
      type: "stair",
      x: 13,
      y: 26,
      floorId: sourceFloorId,
      stairId: `stairs-${sourceFloor.floorNumber}`,
      transitionSharedId: "caba-main-stair",
      accessible: true,
      color: "#2563eb",
    }];
    const cue = studentRouteTransitionCues(route, steps, {
      kind: "floor", buildingId: "caba", floor: sourceFloorPlan, floorNumber: sourceFloor.floorNumber,
    }, nodes)[0];
    expect(cue).toMatchObject({ displayLabel: expectedLabel, groupId: "stairs:caba:caba-main-stair" });
  });

  it("omits only a zero-distance landing walk between transitions in the same authored stairwell", () => {
    const floorOne = { buildingId: "caba", floorId: "floor-1", floorNumber: 1, afterOutdoor: true, waypoints: [{ x: 10, y: 10 }, { x: 30, y: 10 }], distanceM: 12, seconds: 8, steps: [{ id: "walk-1", icon: "walk" as const, instruction: "Follow Floor 1 to the Left Stair." }] };
    const floorTwo = { buildingId: "caba", floorId: "floor-2", floorNumber: 2, afterOutdoor: true, waypoints: [{ x: 30, y: 10 }], distanceM: 0, seconds: 0, steps: [{ id: "walk-2", icon: "walk" as const, instruction: "Follow Floor 2 to the Left Stair.", distanceM: 0 }] };
    const floorThree = { buildingId: "caba", floorId: "floor-3", floorNumber: 3, afterOutdoor: true, waypoints: [{ x: 30, y: 10 }, { x: 40, y: 10 }], distanceM: 8, seconds: 5, steps: [{ id: "walk-3", icon: "walk" as const, instruction: "Follow Floor 3 to CABA-402." }] };
    const route: PlannedRoute = {
      ...sampleRoute,
      indoorSegments: [floorOne, floorTwo, floorThree],
      contextLegs: [floorOne, floorTwo, floorThree].map((segment, index) => ({
        kind: "floor" as const,
        buildingId: "caba",
        floorId: segment.floorId,
        floorNumber: segment.floorNumber,
        segmentIndex: index,
        waypoints: segment.waypoints,
        distanceM: segment.distanceM,
      })),
      transitionDetails: [
        { kind: "stairs", nodeId: "left-stair-f1", label: "Left Stair", fromFloorId: "floor-1", toFloorId: "floor-2", transitionSharedId: "caba-left-stair", buildingId: "caba" },
        { kind: "stairs", nodeId: "left-stair-f2", label: "Left Stair", fromFloorId: "floor-2", toFloorId: "floor-3", transitionSharedId: "caba-left-stair", buildingId: "caba" },
      ],
      steps: [
        { id: "walk-1", icon: "walk", instruction: "Follow Floor 1 to the Left Stair.", contextLegIndex: 0 },
        { id: "stairs-1", icon: "stairs", instruction: "Take the Left Stair up to Floor 2.", contextLegIndex: 0 },
        { id: "walk-2", icon: "walk", instruction: "Follow Floor 2 to the Left Stair.", contextLegIndex: 1, distanceM: 0 },
        { id: "stairs-2", icon: "stairs", instruction: "Take the Left Stair up to Floor 3.", contextLegIndex: 1 },
        { id: "walk-3", icon: "walk", instruction: "Follow Floor 3 to CABA-402.", contextLegIndex: 2 },
        { id: "arrive", icon: "arrive", instruction: "Arrive at CABA-402.", contextLegIndex: 2 },
      ],
    };

    const visible = studentFacingRouteSteps(route);
    expect(visible.map((step) => step.id)).toEqual(["walk-1", "stairs-1", "stairs-2", "walk-3", "arrive"]);
    expect(visible.map((step, index) => ({ step: index + 1, id: step.id }))).toEqual([
      { step: 1, id: "walk-1" }, { step: 2, id: "stairs-1" }, { step: 3, id: "stairs-2" },
      { step: 4, id: "walk-3" }, { step: 5, id: "arrive" },
    ]);
    expect(routeTransitionForStep(route, visible, 1)?.detail?.toFloorId).toBe("floor-2");
    expect(routeTransitionForStep(route, visible, 2)?.detail?.toFloorId).toBe("floor-3");

    const realLandingWalk = {
      ...route,
      indoorSegments: route.indoorSegments?.map((segment, index) => index === 1
        ? { ...segment, waypoints: [{ x: 30, y: 10 }, { x: 34, y: 10 }], distanceM: 4 }
        : segment),
      contextLegs: route.contextLegs?.map((leg, index) => index === 1
        ? { ...leg, waypoints: [{ x: 30, y: 10 }, { x: 34, y: 10 }], distanceM: 4 }
        : leg),
      steps: route.steps.map((step) => step.id === "walk-2" ? { ...step, distanceM: 4 } : step),
    };
    expect(studentFacingRouteSteps(realLandingWalk).some((step) => step.id === "walk-2")).toBe(true);
  });

  it("uses authored context handoffs for Explore entry/exit targets and exposes every cue on the inspected leg", () => {
    const caba = {
      buildingId: "caba", floorId: "caba-6", floorNumber: 6, afterOutdoor: false,
      waypoints: [{ x: 1, y: 1 }, { x: 10, y: 10 }], distanceM: 12, seconds: 8,
      steps: [{ id: "caba-walk", icon: "walk" as const, instruction: "Follow the indoor path to the exit." }],
    };
    const can = {
      buildingId: "can", floorId: "can-ground", floorNumber: 1, afterOutdoor: true,
      waypoints: [{ x: 200, y: 210 }, { x: 220, y: 230 }], distanceM: 18, seconds: 12,
      steps: [{ id: "can-walk", icon: "walk" as const, instruction: "Follow the indoor path through Canteen." }],
    };
    const coed = {
      buildingId: "coed", floorId: "coed-6", floorNumber: 6, afterOutdoor: true,
      waypoints: [{ x: 500, y: 510 }, { x: 520, y: 530 }], distanceM: 20, seconds: 14,
      steps: [{ id: "coed-walk", icon: "walk" as const, instruction: "Follow the indoor path to Room 601." }],
    };
    const route: PlannedRoute = {
      ...sampleRoute,
      indoorSegments: [caba, can, coed],
      contextLegs: [
        { kind: "floor", buildingId: "caba", floorId: "caba-6", floorNumber: 6, segmentIndex: 0, waypoints: caba.waypoints, distanceM: 12 },
        { kind: "campus", waypoints: [{ x: 10, y: 10 }, { x: 90, y: 90 }], distanceM: 80 },
        { kind: "floor", buildingId: "can", floorId: "can-ground", floorNumber: 1, segmentIndex: 1, waypoints: can.waypoints, distanceM: 18 },
        { kind: "campus", waypoints: [{ x: 220, y: 230 }, { x: 300, y: 300 }], distanceM: 80 },
        { kind: "floor", buildingId: "coed", floorId: "coed-6", floorNumber: 6, segmentIndex: 2, waypoints: coed.waypoints, distanceM: 20 },
      ],
      contextHandoffs: [
        { fromContextLegIndex: 0, toContextLegIndex: 1, kind: "exit_building", buildingId: "caba", label: "CABA Exit", sourcePoint: { x: 10, y: 10 }, targetPoint: { x: 10, y: 10 } },
        { fromContextLegIndex: 1, toContextLegIndex: 2, kind: "enter_building", buildingId: "can", label: "Canteen Entry", sourcePoint: { x: 90, y: 90 }, targetPoint: { x: 200, y: 210 } },
        { fromContextLegIndex: 2, toContextLegIndex: 3, kind: "exit_building", buildingId: "can", label: "Canteen Exit", sourcePoint: { x: 220, y: 230 }, targetPoint: { x: 220, y: 230 } },
        { fromContextLegIndex: 3, toContextLegIndex: 4, kind: "enter_building", buildingId: "coed", label: "COED Entry", sourcePoint: { x: 300, y: 300 }, targetPoint: { x: 500, y: 510 } },
      ],
      steps: [
        { id: "caba-walk", icon: "walk", instruction: "Follow the indoor path to the exit.", contextLegIndex: 0 },
        { id: "caba-exit", icon: "enter", instruction: "Exit CABA building.", contextLegIndex: 0, contextHandoffIndex: 0 },
        { id: "campus-to-can", icon: "walk", instruction: "Follow the Campus path to Canteen.", contextLegIndex: 1 },
        { id: "enter-can", icon: "enter", instruction: "Enter Canteen building.", contextLegIndex: 1, contextHandoffIndex: 1 },
        { id: "can-walk", icon: "walk", instruction: "Follow the indoor path through Canteen.", contextLegIndex: 2 },
        { id: "can-exit", icon: "enter", instruction: "Exit Canteen building.", contextLegIndex: 2, contextHandoffIndex: 2 },
        { id: "campus-to-coed", icon: "walk", instruction: "Follow the Campus path to COED.", contextLegIndex: 3 },
        { id: "enter-coed", icon: "enter", instruction: "Enter COED building.", contextLegIndex: 3, contextHandoffIndex: 3 },
        { id: "coed-walk", icon: "walk", instruction: "Follow the indoor path to Room 601.", contextLegIndex: 4 },
      ],
    };
    const steps = route.steps;
    const canEntry = studentRouteExploreTransitionTarget(route, steps, 3);
    expect(canEntry).toMatchObject({
      transition: { kind: "enter_building", handoff: { buildingId: "can", fromContextLegIndex: 1, toContextLegIndex: 2 } },
      targetStepIndex: 4,
      target: { context: "floor", contextLegIndex: 2, segment: { buildingId: "can", floorId: "can-ground", floorNumber: 1 }, segmentProgress: 0 },
    });
    expect(studentRouteExploreInspectionTarget(route, steps, 3)).toMatchObject({
      context: "campus", contextLegIndex: 1,
    });
    const legacySteps = steps.map((step, index) => index === 3 || index === 4
      ? { ...step, contextLegIndex: undefined, contextHandoffIndex: undefined }
      : step);
    expect(studentRouteExploreTransitionTarget(route, legacySteps, 3)).toMatchObject({
      transition: { handoff: { buildingId: "can", toContextLegIndex: 2 } },
      targetStepIndex: 4,
      target: { context: "floor", contextLegIndex: 2, segment: { floorId: "can-ground" }, segmentProgress: 0 },
    });

    const canExit = studentRouteExploreTransitionTarget(route, steps, 5);
    expect(canExit).toMatchObject({
      transition: { kind: "exit_building", handoff: { buildingId: "can", fromContextLegIndex: 2, toContextLegIndex: 3 } },
      targetStepIndex: 6,
      target: { context: "campus", contextLegIndex: 3, routeProgress: 0 },
    });
    expect(studentRouteExploreInspectionTarget(route, steps, 5)).toMatchObject({
      context: "floor", contextLegIndex: 2, segment: { buildingId: "can", floorId: "can-ground" },
    });

    const campusCues = [
      { id: "enter-can", kind: "enter_building" as const, label: "Enter CAN", point: { x: 90, y: 90 } },
      { id: "enter-coed", kind: "enter_building" as const, label: "Enter COED", point: { x: 300, y: 300 } },
    ];
    expect(studentRouteExploreTransitionCues(route, steps, campusCues, 2)).toEqual([
      { cue: campusCues[0], transitionStepIndex: 3 },
    ]);
    // The active Enter instruction is still physically on Campus until its
    // route cue is activated; Explore must keep that doorway reachable.
    expect(studentRouteExploreTransitionCues(route, steps, campusCues, 3)).toEqual([
      { cue: campusCues[0], transitionStepIndex: 3 },
    ]);
    expect(studentRouteExploreTransitionCues(route, steps, campusCues, 6)).toEqual([
      { cue: campusCues[1], transitionStepIndex: 7 },
    ]);
    expect(studentRouteExploreTransitionCues(route, steps, campusCues, 5)).toEqual([]);
    expect(studentRouteExploreTransitionCues(route, steps, [
      { id: "can-exit", kind: "exit_building" as const, label: "Exit Canteen", point: { x: 220, y: 230 } },
    ], 5)).toMatchObject([{ transitionStepIndex: 5, cue: { id: "can-exit", kind: "exit_building" } }]);
    const sameCampusLegSteps = steps.map((step) => step.id === "campus-to-coed" || step.id === "enter-coed"
      ? { ...step, contextLegIndex: 1 }
      : step);
    const sameCampusLegRoute = {
      ...route,
      contextHandoffs: route.contextHandoffs?.map((handoff) => handoff.buildingId === "coed"
        ? { ...handoff, fromContextLegIndex: 1 }
        : handoff),
      steps: sameCampusLegSteps,
    };
    expect(studentRouteExploreTransitionCues(sameCampusLegRoute, sameCampusLegSteps, campusCues, 6)).toEqual([
      { cue: campusCues[0], transitionStepIndex: 3 },
      { cue: campusCues[1], transitionStepIndex: 7 },
    ]);
    const canExitCue = { id: "can-exit", kind: "exit_building" as const, label: "Exit Canteen", point: { x: 220, y: 230 } };
    expect(studentRouteExploreTransitionCues(route, steps, [canExitCue], 4)).toEqual([
      { cue: canExitCue, transitionStepIndex: 5 },
    ]);
  });

  it("resolves Route Preview elevator clicks to the directly authored target Floor", () => {
    const route: PlannedRoute = {
      ...sampleRoute,
      points: [{ x: 0, y: 0 }, { x: 20, y: 20 }],
      campusPoints: [{ x: 0, y: 0 }, { x: 20, y: 20 }],
      indoorSegments: [
        { buildingId: "science", floorId: "floor-g", floorNumber: 1, afterOutdoor: true, waypoints: [{ x: 1, y: 1 }, { x: 2, y: 2 }], distanceM: 5, seconds: 5, steps: [] },
        { buildingId: "science", floorId: "floor-4", floorNumber: 4, afterOutdoor: true, waypoints: [{ x: 4, y: 4 }, { x: 8, y: 8 }], distanceM: 5, seconds: 5, steps: [] },
      ],
      steps: [
        { id: "campus-walk", icon: "walk", instruction: "Follow the campus path." },
        { id: "enter", icon: "enter", instruction: "Enter Science Hall." },
        { id: "ground-walk", icon: "walk", instruction: "Follow the Ground Floor path." },
        { id: "lift-step", icon: "elevator", instruction: "Take Main elevator to Floor 4." },
        { id: "floor-4-walk", icon: "walk", instruction: "Follow the Floor 4 path." },
      ],
      transitionDetails: [{ kind: "elevator", nodeId: "lift-4", label: "Main elevator", fromFloorId: "floor-g", toFloorId: "floor-4" }],
    };
    const steps = studentFacingRouteSteps(route);
    const previewTarget = studentRoutePreviewTransitionTarget(route, steps, "lift-4");

    expect(studentRouteTransitionCueStepIndex(route, steps, "lift-4")).toBe(3);
    expect(previewTarget).toMatchObject({ transitionStepIndex: 3, targetStepIndex: 4, context: "floor" });
    expect(previewTarget?.segment?.floorId).toBe("floor-4");
    expect(studentRoutePreviewTransitionTarget(route, steps, "enter")).toMatchObject({
      transitionStepIndex: 1, targetStepIndex: 2, context: "floor", segment: { floorId: "floor-g" },
    });
  });

  it("resolves Preview stair and Building exit clicks to their next planned contexts", () => {
    const stairRoute: PlannedRoute = {
      ...sampleRoute,
      indoorSegments: [
        { buildingId: "science", floorId: "floor-1", floorNumber: 1, afterOutdoor: true, waypoints: [{ x: 1, y: 1 }, { x: 2, y: 2 }], distanceM: 5, seconds: 5, steps: [] },
        { buildingId: "science", floorId: "floor-2", floorNumber: 2, afterOutdoor: true, waypoints: [{ x: 2, y: 2 }, { x: 3, y: 3 }], distanceM: 5, seconds: 5, steps: [] },
        { buildingId: "science", floorId: "floor-3", floorNumber: 3, afterOutdoor: true, waypoints: [{ x: 3, y: 3 }, { x: 4, y: 4 }], distanceM: 5, seconds: 5, steps: [] },
      ],
      steps: [
        { id: "campus", icon: "walk", instruction: "Follow the campus path." },
        { id: "enter", icon: "enter", instruction: "Enter Science Hall." },
        { id: "floor-1", icon: "walk", instruction: "Follow Floor 1." },
        { id: "stair-1-step", icon: "stairs", instruction: "Take West Stairs to Floor 2." },
        { id: "floor-2", icon: "walk", instruction: "Follow Floor 2." },
        { id: "stair-2-step", icon: "stairs", instruction: "Take West Stairs to Floor 3." },
        { id: "floor-3", icon: "walk", instruction: "Follow Floor 3." },
      ],
      transitionDetails: [
        { kind: "stairs", nodeId: "stair-floor-2", label: "West Stairs", fromFloorId: "floor-1", toFloorId: "floor-2" },
        { kind: "stairs", nodeId: "stair-floor-3", label: "West Stairs", fromFloorId: "floor-2", toFloorId: "floor-3" },
      ],
    };
    const stairSteps = studentFacingRouteSteps(stairRoute);
    expect(studentRoutePreviewTransitionTarget(stairRoute, stairSteps, "stair-floor-2"))
      .toMatchObject({ targetStepIndex: 4, segment: { floorId: "floor-2" } });
    expect(studentRoutePreviewTransitionTarget(stairRoute, stairSteps, "stair-floor-3"))
      .toMatchObject({ targetStepIndex: 6, segment: { floorId: "floor-3" } });

    const exitRoute: PlannedRoute = {
      ...sampleRoute,
      indoorSegments: [{
        buildingId: "science", floorId: "floor-1", floorNumber: 1, afterOutdoor: false,
        waypoints: [{ x: 1, y: 1 }, { x: 2, y: 2 }], distanceM: 5, seconds: 5, steps: [],
      }],
      steps: [
        { id: "inside", icon: "walk", instruction: "Follow the indoor path." },
        { id: "exit", icon: "enter", instruction: "Exit Science Hall to Campus." },
        { id: "outside", icon: "walk", instruction: "Follow the campus path." },
      ],
    };
    expect(studentRoutePreviewTransitionTarget(exitRoute, studentFacingRouteSteps(exitRoute), "exit"))
      .toMatchObject({ transitionStepIndex: 1, targetStepIndex: 2, context: "campus" });
  });

  it("places stair and elevator emphasis on the authored item selected by the route node", () => {
    const floor = {
      id: "floor-1",
      stairs: [
        { id: "stair-a", x: 100, y: 100, width: 20, height: 30 },
        { id: "stair-b", x: 200, y: 80, width: 40, height: 60 },
      ],
      elevators: [{ id: "lift-a", x: 30, y: 50, width: 20, height: 40 }],
    } as unknown as FloorPlan;
    const nodes: NavigationNode[] = [
      { id: "elevator-source", name: "Lift A", type: "elevator" as const, x: 8, y: 9, elevatorId: "lift-a", floorId: "floor-1", transitionSharedId: "lift-shaft", accessible: true, color: "#2563eb" },
      { id: "elevator-node", name: "Lift A", type: "elevator" as const, x: 800, y: 900, elevatorId: "lift-other", floorId: "floor-4", transitionSharedId: "lift-shaft", accessible: true, color: "#2563eb" },
      { id: "stair-node", name: "Stair B", type: "stair" as const, x: 11, y: 12, stairId: "stair-b", floorId: "floor-1", accessible: true, color: "#2563eb" },
    ];

    expect(authoredFloorTransitionPoint(floor, nodes, { kind: "elevator", nodeId: "elevator-node", label: "Lift A", fromFloorId: "floor-1", toFloorId: "floor-4" }))
      .toEqual({ x: 40, y: 70 });
    expect(authoredFloorTransitionPoint(floor, nodes, { kind: "stairs", nodeId: "stair-node", label: "Stair B" }))
      .toEqual({ x: 220, y: 110 });
    expect(authoredFloorTransitionPoint(floor, nodes, { kind: "stairs", nodeId: "missing", label: "Missing" })).toBeNull();
  });

  it("falls back to authored transition node coordinates when optional Floor stair/elevator arrays are absent", () => {
    const floor = { id: "floor-no-connectors" } as unknown as FloorPlan;
    const nodes: NavigationNode[] = [
      { id: "stairs-node", name: "Stairs", type: "stair", x: 32, y: 48, stairId: "stair-1", floorId: floor.id, accessible: true, color: "#2563eb" },
      { id: "elevator-node", name: "Elevator", type: "elevator", x: 72, y: 88, elevatorId: "elevator-1", floorId: floor.id, accessible: true, color: "#2563eb" },
    ];
    expect(authoredFloorTransitionPoint(floor, nodes, { kind: "stairs", nodeId: "stairs-node", label: "West Stairs" })).toEqual({ x: 32, y: 48 });
    expect(authoredFloorTransitionPoint(floor, nodes, { kind: "elevator", nodeId: "elevator-node", label: "Main Elevator" })).toEqual({ x: 72, y: 88 });
  });

  it("suspends playback in Explore and restores its prior playing state on Follow", () => {
    let state = studentRouteUiReducer(initialStudentRouteUiState, { type: "START_NAVIGATION" });
    expect(state.collapsed).toBe(true);
    state = studentRouteUiReducer(state, { type: "ENTER_EXPLORE" });
    expect(state).toMatchObject({ phase: "navigating", playback: "paused", resumePlaybackAfterExplore: "playing", camera: "explore" });
    state = studentRouteUiReducer(state, { type: "RECENTER" });
    expect(state).toMatchObject({ camera: "follow", playback: "paused", resumePlaybackAfterExplore: "playing" });
    state = studentRouteUiReducer(state, { type: "RECENTER_COMPLETE" });
    expect(state).toMatchObject({ camera: "follow", playback: "playing", collapsed: true });
  });

  it("keeps Follow playback paused until camera reacquisition completes and lets Pause cancel the resume", () => {
    let state = studentRouteUiReducer(initialStudentRouteUiState, { type: "START_NAVIGATION" });
    state = studentRouteUiReducer(state, { type: "PAUSE" });
    state = studentRouteUiReducer(state, { type: "RECENTER", resumePlayback: "playing" });
    expect(state).toMatchObject({ camera: "follow", playback: "paused", resumePlaybackAfterExplore: "playing" });
    state = studentRouteUiReducer(state, { type: "PAUSE" });
    expect(state).toMatchObject({ playback: "paused", resumePlaybackAfterExplore: null });
    state = studentRouteUiReducer(state, { type: "RECENTER_COMPLETE" });
    expect(state).toMatchObject({ playback: "paused", resumePlaybackAfterExplore: null });
  });

  it("keeps a required handoff paused when returning from Explore even if playback was previously set to resume", () => {
    let state = studentRouteUiReducer(initialStudentRouteUiState, { type: "START_NAVIGATION" });
    state = studentRouteUiReducer(state, { type: "ENTER_EXPLORE" });
    state = studentRouteUiReducer(state, { type: "RECENTER" });
    expect(state).toMatchObject({ camera: "follow", playback: "paused", resumePlaybackAfterExplore: "playing" });

    state = studentRouteUiReducer(state, { type: "RECENTER_COMPLETE", pauseAtTransition: true });

    expect(state).toMatchObject({ camera: "follow", playback: "paused", resumePlaybackAfterExplore: null });
  });

  it("restores the Continue reason when camera reacquisition stops at an authored handoff", () => {
    expect(studentRoutePauseReasonAfterCameraReacquisition("paused", true)).toBe("transition");
    expect(studentRoutePauseReasonAfterCameraReacquisition("playing", true)).toBe("transition");
    expect(studentRoutePauseReasonAfterCameraReacquisition("paused", false)).toBeNull();
  });
});

describe("one canonical active route step", () => {
  const base = { playbackIndex: 3, totalSteps: 8 };

  it("uses playback progress unless a transition must settle or Explore inspects", () => {
    // Playback progress by default.
    expect(canonicalActiveRouteStepIndex({ ...base, camera: "follow" })).toBe(3);
    // A building/floor transition pins its own step until the context settles,
    // so the instruction never advances before the visible transition completes.
    expect(canonicalActiveRouteStepIndex({ ...base, camera: "follow", transitionIndex: 4 })).toBe(4);
    // Explore inspection drives the presentation while progress stays intact.
    expect(canonicalActiveRouteStepIndex({ ...base, camera: "explore", inspectedIndex: 6, transitionIndex: 4 })).toBe(6);
    // A stale inspection index is ignored outside Explore.
    expect(canonicalActiveRouteStepIndex({ ...base, camera: "follow", inspectedIndex: 6 })).toBe(3);
    // No inspection yet falls back to the real playback/transition step.
    expect(canonicalActiveRouteStepIndex({ ...base, camera: "explore", inspectedIndex: null, transitionIndex: 4 })).toBe(4);
  });

  it("keeps the canonical index inside the one ordered step list", () => {
    expect(canonicalActiveRouteStepIndex({ playbackIndex: 99, camera: "follow", totalSteps: 4 })).toBe(3);
    expect(canonicalActiveRouteStepIndex({ playbackIndex: -5, camera: "follow", totalSteps: 4 })).toBe(0);
    expect(canonicalActiveRouteStepIndex({ playbackIndex: 0, camera: "explore", inspectedIndex: 99, totalSteps: 4 })).toBe(3);
    expect(canonicalActiveRouteStepIndex({ playbackIndex: 0, camera: "follow", transitionIndex: -1, totalSteps: 4 })).toBe(0);
  });

  it("renders Explore inspection without mutating real playback progress", () => {
    const steps = sampleRoute.steps;
    // Follow (or no inspection) always renders actual playback progress.
    expect(studentDisplayedRouteProgress(steps, 0.2, "follow", 2)).toBe(0.2);
    expect(studentDisplayedRouteProgress(steps, 0.2, "explore", null)).toBe(0.2);
    // Inspecting the final step renders the end of the route…
    expect(studentDisplayedRouteProgress(steps, 0.2, "explore", 3)).toBe(1);
    // …and inspecting the first step renders the start — while the caller's
    // real playback value stays untouched for Return to Follow.
    expect(studentDisplayedRouteProgress(steps, 0.2, "explore", 0)).toBe(0);
    const playbackProgress = 0.2;
    studentDisplayedRouteProgress(steps, playbackProgress, "explore", 3);
    expect(playbackProgress).toBe(0.2);
  });
});

describe("Follow camera context restoration", () => {
  it("reacquires the canonical route floor before resuming from a manually inspected floor", () => {
    expect(studentRouteFollowNeedsCameraReacquisition({
      routeContextIsElsewhere: true,
      cameraDetached: false,
      cameraReacquiring: false,
    })).toBe(true);
  });

  it("also reacquires after camera detachment or while an earlier reacquisition is pending", () => {
    expect(studentRouteFollowNeedsCameraReacquisition({
      routeContextIsElsewhere: false,
      cameraDetached: true,
      cameraReacquiring: false,
    })).toBe(true);
    expect(studentRouteFollowNeedsCameraReacquisition({
      routeContextIsElsewhere: false,
      cameraDetached: false,
      cameraReacquiring: true,
    })).toBe(true);
    expect(studentRouteFollowNeedsCameraReacquisition({
      routeContextIsElsewhere: false,
      cameraDetached: false,
      cameraReacquiring: false,
    })).toBe(false);
  });

  it("keeps a pending authored handoff paused after camera reacquisition", () => {
    expect(studentRoutePlaybackAfterCameraReacquisition(true)).toBe("paused");
    expect(studentRoutePlaybackAfterCameraReacquisition(false)).toBe("playing");
  });
});

describe("Explore transition marker grouping", () => {
  const activate = () => {};

  it("labels view-only transition cues as map inspection, not route advancement", () => {
    expect(studentRouteInspectionTransitionDisplayLabel("stairs", "Take the Right Stair down to Floor 5."))
      .toBe("View Floor 5");
    expect(studentRouteInspectionTransitionDisplayLabel("elevator", "Take Elevator 1 up to Floor 6."))
      .toBe("View Floor 6");
    expect(studentRouteInspectionTransitionDisplayLabel("enter_building", "Enter CABA."))
      .toBe("View CABA interior");
    expect(studentRouteInspectionTransitionDisplayLabel("stairs", "Use stairs."))
      .toBe("View Staircase");
    expect(studentRouteInspectionTransitionDisplayLabel("exit_building", "Exit via the Left Stair to campus."))
      .toBe("View Exit");
    expect(studentRouteInspectionTransitionDisplayLabel("stairs", "Return downstairs to Floor 3 using Exterior Stair 1."))
      .toBe("View Floor 3");
    expect(studentRouteInspectionTransitionDisplayLabel("elevator", "Take the elevator."))
      .toBe("View Connected Floor");
  });

  it("groups nearby authored stair directions into one marker without moving the authored anchor", () => {
    const groups = groupStudentRouteExploreTransitions([
      { id: "stairs-floor-4", groupId: "stairs:caba:left-core", kind: "stairs" as const, label: "Stairs down", displayLabel: "Stairs Down — Floor 4", point: { x: 120, y: 140 }, onActivate: activate },
      { id: "stairs-floor-6", groupId: "stairs:caba:left-core", kind: "stairs" as const, label: "Stairs up", displayLabel: "Stairs Up — Floor 6", point: { x: 128, y: 146 }, onActivate: activate },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      id: "explore-group:stairs-floor-4+stairs-floor-6",
      point: { x: 120, y: 140 },
      choices: [
        { displayLabel: "Stairs Down — Floor 4" },
        { displayLabel: "Stairs Up — Floor 6" },
      ],
    });
  });

  it("groups a colliding building entry with its stair action and keeps distant transitions separate", () => {
    const groups = groupStudentRouteExploreTransitions([
      { id: "stairs-near", groupId: "stairs:hall:left", kind: "stairs" as const, label: "Stairs up", point: { x: 10, y: 10 }, onActivate: activate },
      { id: "elevator-far", groupId: "elevator:hall:e1", kind: "elevator" as const, label: "Elevator up", point: { x: 90, y: 10 }, onActivate: activate },
      { id: "entrance", kind: "enter_building" as const, label: "Enter Hall", point: { x: 10, y: 10 }, onActivate: activate },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.choices)).toEqual([
      [expect.objectContaining({ id: "stairs-near" }), expect.objectContaining({ id: "entrance" })],
      [expect.objectContaining({ id: "elevator-far" })],
    ]);
  });

  it("uses the caller's zoom-aware screen-collision radius for near transition points", () => {
    const cues = [
      { id: "stair-a", groupId: "stairs:caba:left", kind: "stairs" as const, label: "Up", point: { x: 20, y: 20 }, onActivate: activate },
      { id: "stair-b", groupId: "stairs:caba:left", kind: "stairs" as const, label: "Down", point: { x: 70, y: 20 }, onActivate: activate },
    ];
    expect(groupStudentRouteExploreTransitions(cues, 34)).toHaveLength(2);
    expect(groupStudentRouteExploreTransitions(cues, 52)).toHaveLength(1);
    expect(groupStudentRouteExploreTransitions(cues, 164, (cue) => cue.id === "stair-a"
      ? { x: 100, y: 120 }
      : { x: 220, y: 120 })).toHaveLength(1);
  });

  it("never merges unrelated stairwells just because their projected markers overlap", () => {
    const cues = [
      { id: "left-up", groupId: "stairs:caba:left", kind: "stairs" as const, label: "Left up", point: { x: 20, y: 20 }, onActivate: activate },
      { id: "right-down", groupId: "stairs:caba:right", kind: "stairs" as const, label: "Right down", point: { x: 20, y: 20 }, onActivate: activate },
      { id: "unknown", kind: "stairs" as const, label: "Unidentified stair", point: { x: 20, y: 20 }, onActivate: activate },
    ];
    expect(groupStudentRouteExploreTransitions(cues, 164)).toHaveLength(3);
  });
});

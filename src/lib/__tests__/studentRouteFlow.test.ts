import { describe, expect, it } from "vitest";
import type { PlannedRoute } from "../routePlanner";
import type { FloorPlan, NavigationNode } from "../../components/map-builder/types";
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
  studentRouteExploreTransitionTarget,
  studentRoutePreviewTransitionTarget,
  studentRouteTransitionCueStepIndex,
  studentRoutePlaybackTarget,
  studentRouteStepSeekIndex,
  studentRoomFocusTargetId,
  screenSpaceMarkerScale,
  studentOverviewDuplicateIds,
  studentTransitionMarkerLodScale,
  studentIndoorSegmentForFloor,
  studentRouteStepInstruction,
  studentRouteProgressForIndoorSegment,
  routeTransitionForStep,
  studentFacingRouteSteps,
  studentRouteFacts,
  studentInstructionWithoutUncalibratedDistance,
  studentDisplayedRouteProgress,
  studentRouteFocusAtProgress,
  studentRoutePositionForLeg,
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
    expect(studentRouteSeekTarget(route, steps, 3)).toMatchObject({ context: "campus", phase: "outdoor" });
    expect(studentRouteSeekTarget(route, steps, 4)).toMatchObject({ context: "campus", phase: "outdoor", routeProgress: 1 });
    expect(studentRouteSeekTarget(route, steps, 5)).toMatchObject({ context: "floor", segment: ground, segmentProgress: 0 });
    expect(routeTransitionForStep(route, steps, 6)).toMatchObject({ kind: "elevator", detail: { fromFloorId: "coed-g", toFloorId: "coed-4" } });
    expect(studentRouteSeekTarget(route, steps, 6)).toMatchObject({ context: "floor", segment: ground, segmentProgress: 1 });
    expect(studentRouteSeekTarget(route, steps, 7)).toMatchObject({ context: "floor", segment: floor4, segmentProgress: 0 });
    expect(studentRoutePositionForLeg(route, steps, "destination-indoor", floor4, 0)).toBe(7);
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
    expect(sameBuildingSteps).toHaveLength(5);
    expect(studentRoutePositionForLeg(sameBuildingRoute, sameBuildingSteps, "origin-indoor", sameBuildingSegments[0], 1)).toBe(2);
    expect(studentRouteSeekTarget(sameBuildingRoute, sameBuildingSteps, 3)).toMatchObject({
      context: "floor",
      phase: "origin-indoor",
      segment: sameBuildingSegments[3],
      segmentProgress: 0,
    });
    expect(studentRouteSeekTarget(sameBuildingRoute, sameBuildingSteps, 4)).toMatchObject({
      context: "floor",
      phase: "origin-indoor",
      segment: sameBuildingSegments[3],
      segmentProgress: 1,
    });
    expect(routeTransitionForStep(sameBuildingRoute, sameBuildingSteps, 2)).toMatchObject({
      kind: "elevator",
      detail: { fromFloorId: "coed-1", toFloorId: "coed-4" },
    });
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
      "Start from Door",
      "Follow the path toward Exterior Stair 1.",
      "Exit via Exterior Stair 1 to Campus.",
      "Follow the path toward Campus Gate.",
      "Arrive at the safe exit.",
    ]);
    expect(routeTransitionForStep(route, steps, 2)).toEqual({ kind: "exit_building" });
    expect(studentRouteSeekTarget(route, steps, 2)).toMatchObject({ context: "floor", segment: inside, segmentProgress: 1 });
    expect(studentRouteSeekTarget(route, steps, 3)).toMatchObject({ context: "campus", phase: "outdoor" });
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

  it("requires Find Route, then Start Navigation, and keeps End non-destructive", () => {
    let state = initialStudentRouteUiState;
    state = studentRouteUiReducer(state, { type: "OPEN_PLAN" });
    expect(state.phase).toBe("planning");
    state = studentRouteUiReducer(state, { type: "FOUND_ROUTE" });
    expect(state).toMatchObject({ phase: "preview", playback: "paused" });
    state = studentRouteUiReducer(state, { type: "START_NAVIGATION" });
    expect(state).toMatchObject({ phase: "navigating", playback: "playing", camera: "follow" });
    state = studentRouteUiReducer(state, { type: "PAUSE" });
    expect(state.playback).toBe("paused");
    state = studentRouteUiReducer(state, { type: "ARRIVE" });
    expect(state).toMatchObject({ phase: "navigating", playback: "paused" });
    state = studentRouteUiReducer(state, { type: "RESUME" });
    expect(state.playback).toBe("playing");
    state = studentRouteUiReducer(state, { type: "END_NAVIGATION" });
    expect(state.phase).toBe("preview");
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

  it("keeps a collapsed Follow card compact when arrival is reached", () => {
    let state = studentRouteUiReducer(initialStudentRouteUiState, { type: "FOUND_ROUTE" });
    state = studentRouteUiReducer(state, { type: "START_NAVIGATION" });
    state = studentRouteUiReducer(state, { type: "ARRIVE" });
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
      { id: "lift-floor-4", kind: "elevator", label: "Take Main elevator to Floor 4.", point: { x: 20, y: 40 } },
    ]);
    expect(studentRouteTransitionCues(route, steps, { kind: "floor", buildingId: "science", floor: floor4, floorNumber: 4 }, nodes)).toEqual([]);
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
    expect(state).toMatchObject({ camera: "follow", playback: "playing", collapsed: true });
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

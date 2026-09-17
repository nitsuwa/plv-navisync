import { describe, expect, it } from "vitest";
import type { Campus, FloorRoom, NavigationEdge, NavigationNode } from "../../components/map-builder/types";
import {
  exteriorApproachEdgeId,
  exteriorApproachNodeId,
  isPointInsideWalkableExteriorZone,
  isDerivedExteriorApproachNode,
  createSuggestedExteriorZonePath,
  exteriorApproachEntranceIsReady,
  exteriorApproachEntranceReadiness,
  exteriorApproachZoneReadiness,
  reconcileExteriorApproachNavigation,
  unlinkExteriorApproachEntrance,
} from "../exteriorApproachNavigation";
import { findNavigationRoute } from "../pathfinding";
import { edgeCrossesBlockingFurniture, edgePolylinePoints, findNavNodeAtPoint } from "../indoorNavigationGraph";
import { reconcileEntranceDoors, reconcileEntranceOutdoorConnections, reconcileEntranceTransitions } from "../entranceTransitions";
import { updateBuildingEntrance } from "../buildingEntrances";
import { syncEntranceNodePositions } from "../navigationGraph";
import { buildTestRouteEdges, chooseEmergencyDestinationCandidate, collapseOutdoorHandoffFragments, humanRouteSteps, outdoorRouteProjectionEdges, presentationRouteTransitionMarkers, routeContinuationMarkers, routeTransitionMarkers, routineRouteGraph, visibleContextRouteNodeFragments, visibleContextRouteNodeIds } from "../../components/map-builder/TestNavigationPanel";
import { serializeCampusStructure, validateNavigationEdgePayload } from "../../services/campusStructureService";
import { exteriorZoneCoversEntrance } from "../exteriorFloorZones";

const campusFixture = (feature: "ramp" | "steps" | "none" = "ramp"): Campus => {
  const outdoor: NavigationNode = {
    id: "20000000-0000-4000-8000-000000000001", name: "Pathway", type: "outdoor",
    x: 320, y: 650, campusId: "campus-1", accessible: true, color: "#16a34a",
  };
  const entrance: NavigationNode = {
    id: "20000000-0000-4000-8000-000000000002", name: "Main Entrance", type: "entrance",
    x: 320, y: 470, campusId: "campus-1", buildingId: "building-1", entranceId: "entrance-1",
    accessible: true, color: "#16a34a",
  };
  const door: NavigationNode = {
    id: "20000000-0000-4000-8000-000000000003", name: "Main Door", type: "hallway",
    x: 300, y: 440, campusId: "campus-1", buildingId: "building-1", floorId: "floor-1", doorId: "door-1",
    accessible: true, color: "#16a34a",
  };
  const verandaPoint: NavigationNode = {
    id: "20000000-0000-4000-8000-000000000009", name: "Veranda Walking Point", type: "hallway",
    x: 320, y: 490, campusId: "campus-1", buildingId: "building-1", floorId: "floor-1",
    exteriorZoneId: "zone-1", accessible: true, color: "#16a34a",
  };
  const transition: NavigationEdge = {
    id: "30000000-0000-4000-8000-000000000001", startNodeId: entrance.id, endNodeId: door.id,
    distance: 1, bidirectional: true, accessible: true, emergencySafe: true,
    type: "entrance_transition", color: "#2563eb", width: 2,
  };
  const direct: NavigationEdge = {
    id: "30000000-0000-4000-8000-000000000002", startNodeId: outdoor.id, endNodeId: entrance.id,
    distance: 180, bidirectional: true, accessible: true, emergencySafe: true,
    type: "manual", color: "#16a34a", width: 3,
  };
  const zone = {
    id: "zone-1", type: "veranda" as const, side: "bottom" as const, offset: 0.5,
    width: 220, depth: 80, walkable: true, linkedEntranceId: "entrance-1",
  };
  const floor = {
    id: "floor-1", buildingId: "building-1", number: 1, label: "Ground Floor", canvasW: 600, canvasH: 450,
    rooms: [], paths: [], walls: [], doors: [{ id: "door-1", x: 300, y: 440, width: 20, height: 4, wallId: "wall-1", offset: 0.5, label: "Main Door", doorType: "single" as const, direction: "left" as const, hinge: "left" as const, swingSide: "a" as const, color: "#334155", zOrder: 1, visible: true, locked: false }],
    windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [], exteriorZones: [zone],
    entranceSteps: feature === "steps" ? [{ id: "steps-1", x: 0, y: 0, width: 80, height: 40, label: "Entrance Steps", parentZoneId: zone.id, linkedEntranceId: "entrance-1", accessible: false as const }] : [],
    entranceRamps: feature === "ramp" ? [{ id: "ramp-1", x: 0, y: 0, width: 80, height: 60, label: "Entrance Ramp", parentZoneId: zone.id, linkedEntranceId: "entrance-1", accessible: true as const }] : [],
  };
  return {
    id: "campus-1", name: "Campus", code: "C", description: "", address: "", city: "", province: "", postalCode: "",
    status: "active", publishStatus: "draft", visibleToStudents: false,
    features: { accessibility: true, emergency: true, eventLayer: false, gps: false },
    canvasW: 1200, canvasH: 900, settings: { accessibility: true, emergency: true, eventLayer: false, gps: false },
    buildings: [{ id: "building-1", name: "Building", code: "B", category: "Academic", description: "", x: 20, y: 20, width: 600, height: 450, color: "#ddd", floors: [floor], entrances: [{ id: "entrance-1", buildingId: "building-1", edge: "bottom", offset: 0.5, name: "Main Entrance", accessible: true }] }],
    markers: [], paths: [], navNodes: [outdoor, entrance, door, verandaPoint], navEdges: [transition, direct], createdAt: "", updatedAt: "",
  } as Campus;
};

/** Connect the derived outer approach anchor through the same authored outdoor
 * edge an admin would create with Connect.  The reconciler must not invent
 * this edge merely because a direct Entrance fallback exists. */
const withOutdoorApproachConnection = (campus: Campus, feature: "ramp" | "steps" | "none" = "ramp"): Campus => {
  const initial = reconcileExteriorApproachNavigation(campus);
  const ownerType = feature === "ramp" ? "entrance_ramp" : feature === "steps" ? "entrance_steps" : "exterior_zone";
  const ownerId = feature === "none" ? "zone-1" : feature === "ramp" ? "ramp-1" : "steps-1";
  const outerId = exteriorApproachNodeId("campus-1", "building-1", "floor-1", ownerType, ownerId, "outer");
  const input = {
    ...initial,
    navEdges: [
      ...(initial.navEdges ?? []),
      {
        id: exteriorApproachEdgeId("campus-1", "building-1", "floor-1", ownerType, ownerId, "manual-outdoor"),
        startNodeId: "20000000-0000-4000-8000-000000000001",
        endNodeId: outerId,
        distance: 180,
        bidirectional: true,
        accessible: feature !== "steps",
        emergencySafe: false,
        type: "manual",
        color: "#16a34a",
        width: 3,
      },
    ],
  };
  const result = reconcileExteriorApproachNavigation(input);
  return result;
};

const withCompleteAuthoredApproach = (campus: Campus, feature: "ramp" | "steps" = "ramp"): Campus => {
  const connected = withOutdoorApproachConnection(campus, feature);
  const floor = connected.buildings[0].floors[0];
  // Remove the fixture's single pre-existing point so the explicit authoring
  // helper builds a real multi-point Veranda spine to the approach anchors.
  const withoutFixturePoint = {
    ...connected,
    navNodes: (connected.navNodes ?? []).filter((node) => node.exteriorZoneId !== "zone-1"),
  };
  const ready = reconcileExteriorApproachNavigation(withoutFixturePoint);
  const suggestion = createSuggestedExteriorZonePath({
    zone: floor.exteriorZones![0],
    floor,
    buildingId: "building-1",
    campusId: ready.id,
    nodes: ready.navNodes ?? [],
    entranceRamps: floor.entranceRamps,
    entranceSteps: floor.entranceSteps,
    nextId: (() => { let index = 0; return (prefix: "nn" | "ne") => `${prefix}-route-${++index}`; })(),
  });
  return reconcileExteriorApproachNavigation({
    ...ready,
    navNodes: [...(ready.navNodes ?? []), ...suggestion.nodes],
    navEdges: [...(ready.navEdges ?? []), ...suggestion.edges],
  });
};

describe("exterior approach navigation", () => {
  it("limits new Veranda links to the same attached side and wall span", () => {
    const zone = { side: "bottom" as const, offset: 0.5, width: 220 };
    expect(exteriorZoneCoversEntrance(zone, { edge: "bottom", offset: 0.5 }, 600, 450)).toBe(true);
    expect(exteriorZoneCoversEntrance(zone, { edge: "bottom", offset: 0.9 }, 600, 450)).toBe(false);
    expect(exteriorZoneCoversEntrance(zone, { edge: "top", offset: 0.5 }, 600, 450)).toBe(false);
  });

  it("preserves a legacy out-of-span link for inspection without making it a Veranda route", () => {
    const campus = campusFixture("ramp");
    campus.buildings[0].entrances![0].offset = 0.9;
    const next = reconcileExteriorApproachNavigation(campus);
    const threshold = next.navNodes?.find((node) => node.derivedOwnerType === "entrance_threshold" && node.derivedOwnerId === "entrance-1");
    expect(threshold).toBeDefined();
    expect(exteriorApproachEntranceReadiness(next, "building-1", "floor-1", "zone-1", "entrance-1").status).toBe("Entrance outside Veranda");
    expect(next.navEdges?.some((edge) => edge.derivedOwnerType && edge.derivedOwnerId === "entrance-1")).toBe(false);
  });

  it("does not treat a generic Veranda Walking Point as an outdoor portal", () => {
    const campus = campusFixture("ramp");
    campus.navEdges = [...(campus.navEdges ?? []), {
      id: "generic-veranda-portal",
      startNodeId: "20000000-0000-4000-8000-000000000009",
      endNodeId: "20000000-0000-4000-8000-000000000001",
      distance: 12,
      bidirectional: true,
      accessible: true,
      emergencySafe: false,
      type: "hallway",
      color: "#16a34a",
      width: 3,
    }];
    expect(buildTestRouteEdges(campus).some((edge) => edge.id === "generic-veranda-portal")).toBe(false);
  });

  it("removes stale zone-owned portal topology after a physical feature approach is authored", () => {
    const complete = withCompleteAuthoredApproach(campusFixture("ramp"), "ramp");
    const verandaPoint = complete.navNodes!.find((node) => node.exteriorZoneId === "zone-1")!;
    const staleOuter: NavigationNode = {
      id: "stale-zone-outer", name: "Stale Veranda portal", type: "transition",
      x: 320, y: 540, campusId: complete.id, buildingId: "building-1", accessible: true,
      color: "#7c3aed", derivedOwnerType: "exterior_zone", derivedOwnerId: "zone-1", derivedRole: "outer",
    };
    const staleEdges: NavigationEdge[] = [{
      id: "stale-zone-branch", startNodeId: verandaPoint.id, endNodeId: staleOuter.id,
      distance: 1, bidirectional: true, accessible: true, emergencySafe: false,
      type: "exterior_approach", color: "#7c3aed", width: 3,
      derivedOwnerType: "exterior_zone", derivedOwnerId: "zone-1", derivedRole: "zone",
    }, {
      id: "stale-zone-portal", startNodeId: staleOuter.id, endNodeId: "20000000-0000-4000-8000-000000000001",
      distance: 1, bidirectional: true, accessible: true, emergencySafe: false,
      type: "exterior_approach", color: "#7c3aed", width: 3,
      derivedOwnerType: "exterior_zone", derivedOwnerId: "zone-1", derivedRole: "outer",
    }];
    const reconciled = reconcileExteriorApproachNavigation({
      ...complete,
      navNodes: [...complete.navNodes!, staleOuter],
      navEdges: [...complete.navEdges!, ...staleEdges],
    });
    expect(reconciled.navNodes?.some((node) => node.id === staleOuter.id)).toBe(false);
    expect(reconciled.navEdges?.some((edge) => staleEdges.some((stale) => stale.id === edge.id))).toBe(false);
    expect(reconciled.navEdges?.some((edge) => edge.derivedOwnerType === "exterior_zone")).toBe(false);

    const route = findNavigationRoute(
      reconciled.navNodes ?? [],
      buildTestRouteEdges(reconciled),
      "20000000-0000-4000-8000-000000000001",
      "20000000-0000-4000-8000-000000000003",
    );
    expect(route).not.toBeNull();
    expect(route?.nodeIds).not.toContain(staleOuter.id);
    expect(route?.nodeIds.some((id) => reconciled.navNodes?.find((node) => node.id === id)?.derivedOwnerType === "entrance_ramp" && reconciled.navNodes?.find((node) => node.id === id)?.derivedRole === "inner")).toBe(true);
    expect(route?.nodeIds.some((id) => reconciled.navNodes?.find((node) => node.id === id)?.derivedOwnerType === "entrance_ramp" && reconciled.navNodes?.find((node) => node.id === id)?.derivedRole === "outer")).toBe(true);
    expect(reconcileExteriorApproachNavigation(reconciled)).toBe(reconciled);
  });

  it("projects the existing Entrance outdoor handoff without a second Floor-authored outdoor edge", () => {
    const campus = campusFixture("ramp");
    const initial = reconcileExteriorApproachNavigation(campus);
    const rampInner = (initial.navNodes ?? []).find((node) => node.derivedOwnerType === "entrance_ramp" && node.derivedRole === "inner");
    const threshold = (initial.navNodes ?? []).find((node) => node.derivedOwnerType === "entrance_threshold" && node.derivedRole === "threshold");
    expect(rampInner).toBeDefined();
    expect(threshold).toBeDefined();
    const complete = reconcileExteriorApproachNavigation({
      ...initial,
      navEdges: [...(initial.navEdges ?? []), {
        id: "30000000-0000-4000-8000-000000000010",
        startNodeId: rampInner!.id,
        endNodeId: threshold!.id,
        distance: 20,
        bidirectional: true,
        accessible: true,
        emergencySafe: false,
        type: "hallway",
        color: "#16a34a",
        width: 3,
      }],
    });
    const autoHandoff = (complete.navEdges ?? []).find((edge) => edge.exteriorApproachAutoHandoffTargetId === "20000000-0000-4000-8000-000000000001");
    expect(autoHandoff).toBeDefined();
    expect(autoHandoff?.derivedOwnerType).toBe("entrance_ramp");
    expect(exteriorApproachEntranceReadiness(complete, "building-1", "floor-1", "zone-1", "entrance-1").status).toBe("Ready");
    const route = findNavigationRoute(
      complete.navNodes ?? [],
      buildTestRouteEdges(complete),
      "20000000-0000-4000-8000-000000000001",
      "20000000-0000-4000-8000-000000000003",
    );
    expect(route?.nodeIds).toContain(rampInner!.id);
    expect(route?.nodeIds).toContain(threshold!.id);
  });

  it("reports a campus connection requirement when the Building has no Outdoor handoff", () => {
    const campus = campusFixture("ramp");
    campus.navEdges = (campus.navEdges ?? []).filter((edge) => edge.id !== "30000000-0000-4000-8000-000000000002");
    const next = reconcileExteriorApproachNavigation(campus);
    expect(exteriorApproachZoneReadiness(next, "building-1", "floor-1", "zone-1").status).toBe("Campus connection needed");
  });

  it("recognizes the canonical Entrance handoff when its fallback metadata is retained", () => {
    const complete = withCompleteAuthoredApproach(campusFixture("ramp"), "ramp");
    const fallback = complete.navEdges?.find((edge) => edge.exteriorApproachFallbackEntranceId === "entrance-1");
    expect(fallback).toBeDefined();
    // A hydrated editor snapshot may retain the canonical Entrance↔Outdoor
    // edge and its compatibility metadata before the derived outer handoff is
    // materialized. Readiness must still reuse that real campus connection.
    const snapshot = {
      ...complete,
      navEdges: complete.navEdges?.filter((edge) => edge.exteriorApproachAutoHandoffTargetId === undefined),
    };
    expect(exteriorApproachZoneReadiness(snapshot, "building-1", "floor-1", "zone-1").status).toBe("Ready");
    const route = findNavigationRoute(
      snapshot.navNodes ?? [],
      buildTestRouteEdges(snapshot),
      "20000000-0000-4000-8000-000000000001",
      "20000000-0000-4000-8000-000000000003",
    );
    expect(route?.nodeIds.some((id) => snapshot.navNodes?.find((node) => node.id === id)?.derivedOwnerType === "entrance_ramp")).toBe(true);
  });

  it("keeps the direct Entrance fallback until the outer approach is explicitly connected", () => {
    const next = reconcileExteriorApproachNavigation(campusFixture("ramp"));
    const outer = (next.navNodes ?? []).find((node) => node.derivedOwnerType === "entrance_ramp" && node.derivedRole === "outer");
    expect(outer).toBeDefined();
    expect(next.navEdges?.find((edge) => edge.id === "30000000-0000-4000-8000-000000000002")?.distance).toBe(180);
    expect(next.navEdges?.some((edge) => edge.startNodeId === "20000000-0000-4000-8000-000000000001" && edge.endNodeId === outer?.id)).toBe(false);
  });

  it("does not invent a Veranda-center handoff when no authored zone network exists", () => {
    const campus = campusFixture("ramp");
    campus.navNodes = (campus.navNodes ?? []).filter((node) => node.exteriorZoneId !== "zone-1");
    const next = withOutdoorApproachConnection(campus, "ramp");
    const zoneEdges = (next.navEdges ?? []).filter((edge) => edge.derivedOwnerType === "exterior_zone");
    expect(zoneEdges).toHaveLength(0);
    expect(next.navEdges?.find((edge) => edge.id === "30000000-0000-4000-8000-000000000002")?.distance).toBe(180);
  });

  it("derives stable ramp topology and keeps it accessible", () => {
    const first = withOutdoorApproachConnection(campusFixture("ramp"), "ramp");
    const approachNodes = (first.navNodes ?? []).filter(isDerivedExteriorApproachNode);
    const approachEdges = (first.navEdges ?? []).filter((edge) => edge.derivedOwnerType);
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(approachNodes.every((node) => uuid.test(node.id))).toBe(true);
    expect(approachEdges.every((edge) => uuid.test(edge.id))).toBe(true);
    expect(approachNodes.some((node) => node.derivedOwnerType === "entrance_ramp" && node.derivedRole === "outer")).toBe(true);
    expect(approachEdges.some((edge) => edge.derivedOwnerType === "entrance_ramp" && edge.accessible)).toBe(true);
    expect(reconcileExteriorApproachNavigation(first)).toBe(first);
    // An outer-network edge alone is incomplete; the Veranda-side walking
    // segment still has to be authored before the direct Entrance fallback is
    // deprioritized.
    expect((first.navEdges ?? []).find((edge) => edge.id === "30000000-0000-4000-8000-000000000002")?.distance).toBe(180);
    const outer = approachNodes.find((node) => node.derivedOwnerType === "entrance_ramp" && node.derivedRole === "outer");
    const threshold = approachNodes.find((node) => node.derivedOwnerType === "entrance_threshold" && node.derivedRole === "threshold");
    expect(outer).toBeDefined();
    expect(threshold).toBeDefined();
    const route = findNavigationRoute(first.navNodes ?? [], first.navEdges ?? [], "20000000-0000-4000-8000-000000000001", "20000000-0000-4000-8000-000000000003");
    // Physical anchors exist, but no Veranda walking path is authored yet.
    expect(route?.nodeIds).not.toContain(outer!.id);
    expect(route?.nodeIds).not.toContain(threshold!.id);
  });

  it("marks Steps edges inaccessible without changing the direct fallback", () => {
    const next = withOutdoorApproachConnection(campusFixture("steps"), "steps");
    const stepEdges = (next.navEdges ?? []).filter((edge) => edge.derivedOwnerType === "entrance_steps");
    expect(stepEdges.length).toBeGreaterThan(0);
    expect(stepEdges.every((edge) => edge.accessible === false || edge.derivedRole === "outer")).toBe(true);
    const direct = next.navEdges?.find((edge) => edge.id === "30000000-0000-4000-8000-000000000002");
    expect(direct?.exteriorApproachFallbackEntranceId).toBeUndefined();
    const stepNodes = (next.navNodes ?? []).filter((node) => node.derivedOwnerType === "entrance_steps").map((node) => node.id);
    const standard = findNavigationRoute(next.navNodes ?? [], next.navEdges ?? [], "20000000-0000-4000-8000-000000000001", "20000000-0000-4000-8000-000000000003");
    const accessible = findNavigationRoute(next.navNodes ?? [], next.navEdges ?? [], "20000000-0000-4000-8000-000000000001", "20000000-0000-4000-8000-000000000003", true);
    expect(standard?.nodeIds.some((id) => stepNodes.includes(id))).toBe(false);
    expect(accessible).not.toBeNull();
    expect(accessible?.nodeIds.some((id) => stepNodes.includes(id))).toBe(false);
  });

  it("uses the ramp for accessible routes and keeps anchor IDs stable across physical edits", () => {
    const first = withOutdoorApproachConnection(campusFixture("ramp"), "ramp");
    const rampNodes = (first.navNodes ?? []).filter((node) => node.derivedOwnerType === "entrance_ramp");
    const rampIds = rampNodes.map((node) => node.id);
    const accessible = findNavigationRoute(first.navNodes ?? [], first.navEdges ?? [], "20000000-0000-4000-8000-000000000001", "20000000-0000-4000-8000-000000000003", true);
    expect(accessible).not.toBeNull();
    expect(accessible?.nodeIds.some((id) => rampIds.includes(id))).toBe(false);
    const moved = structuredClone(first);
    const movedZone = moved.buildings[0]?.floors[0]?.exteriorZones?.[0];
    expect(movedZone).toBeDefined();
    if (movedZone) movedZone.offset = 0.6;
    const second = reconcileExteriorApproachNavigation(moved);
    expect((second.navNodes ?? []).filter((node) => node.derivedOwnerType === "entrance_ramp").map((node) => node.id)).toEqual(rampIds);
  });

  it("removes derived topology and restores direct entrance fallback when a zone is deleted", () => {
    const withApproach = withOutdoorApproachConnection(campusFixture("ramp"), "ramp");
    const withoutZone = structuredClone(withApproach);
    const authoredZonePoint: NavigationNode = {
      id: "manual-zone-point", name: "Veranda Point", type: "hallway", x: 320, y: 500,
      campusId: "campus-1", buildingId: "building-1", floorId: "floor-1", exteriorZoneId: "zone-1",
      accessible: true, color: "#16a34a",
    };
    const authoredZoneEdge: NavigationEdge = {
      id: "manual-zone-edge", startNodeId: authoredZonePoint.id, endNodeId: "20000000-0000-4000-8000-000000000003",
      distance: 12, bidirectional: true, accessible: true, emergencySafe: false,
      type: "hallway", color: "#16a34a", width: 3,
    };
    withoutZone.navNodes = [...(withoutZone.navNodes ?? []), authoredZonePoint];
    withoutZone.navEdges = [...(withoutZone.navEdges ?? []), authoredZoneEdge];
    withoutZone.buildings[0].floors[0].exteriorZones = [];
    withoutZone.buildings[0].floors[0].entranceRamps = [];
    const next = reconcileExteriorApproachNavigation(withoutZone);
    expect((next.navNodes ?? []).some(isDerivedExteriorApproachNode)).toBe(false);
    expect((next.navNodes ?? []).some((node) => node.id === authoredZonePoint.id)).toBe(false);
    expect(next.navEdges?.some((edge) => edge.derivedOwnerType)).toBe(false);
    expect(next.navEdges?.some((edge) => edge.id === authoredZoneEdge.id)).toBe(false);
    expect(next.navEdges?.find((edge) => edge.id === "30000000-0000-4000-8000-000000000002")?.distance).toBe(180);
    expect(withApproach.navNodes?.some((node) => node.entranceId === "entrance-1")).toBe(true);
  });

  it("unlinks an Entrance by clearing copied feature links and derived approach topology while preserving the physical Door", () => {
    const linked = withOutdoorApproachConnection(campusFixture("ramp"), "ramp");
    const unlinked = unlinkExteriorApproachEntrance(linked, "building-1", "floor-1", "zone-1", "entrance-1");
    const floor = unlinked.buildings[0].floors[0];
    const zone = floor.exteriorZones?.[0];
    expect(zone?.linkedEntranceId).toBeUndefined();
    expect(zone?.linkedEntranceIds).toBeUndefined();
    expect(floor.entranceRamps?.[0]?.linkedEntranceId).toBeUndefined();
    expect((unlinked.navNodes ?? []).some((node) => node.derivedOwnerType)).toBe(false);
    expect((unlinked.navEdges ?? []).some((edge) => edge.derivedOwnerType)).toBe(false);
    expect(floor.doors.some((door) => door.id === "door-1")).toBe(true);
    expect((unlinked.navNodes ?? []).some((node) => node.doorId === "door-1")).toBe(true);
    expect((unlinked.navNodes ?? []).some((node) => node.exteriorZoneId === "zone-1")).toBe(true);
  });

  it("accepts points only inside explicitly walkable zones outside the floor", () => {
    const campus = campusFixture("none");
    const zone = campus.buildings[0].floors[0].exteriorZones;
    expect(isPointInsideWalkableExteriorZone({ x: 320, y: 490 }, zone, 600, 450)).toBe(true);
    expect(isPointInsideWalkableExteriorZone({ x: 20, y: 20 }, zone, 600, 450)).toBe(false);
  });

  it("does not claim Exterior Emergency Stair connections as normal approach fallbacks", () => {
    const campus = campusFixture("ramp");
    const emergency: NavigationNode = {
      id: "20000000-0000-4000-8000-000000000004", name: "Emergency discharge", type: "emergency_exit",
      x: 500, y: 500, campusId: "campus-1", buildingId: "building-1", exteriorEmergencyStairId: "stair-1",
      accessible: false, color: "#dc2626",
    };
    const emergencyEdge: NavigationEdge = {
      id: "30000000-0000-4000-8000-000000000003", startNodeId: emergency.id, endNodeId: "20000000-0000-4000-8000-000000000002",
      distance: 42, bidirectional: true, accessible: false, emergencySafe: true,
      type: "emergency", color: "#dc2626", width: 3,
    };
    campus.navNodes = [...(campus.navNodes ?? []), emergency];
    campus.navEdges = [...(campus.navEdges ?? []), emergencyEdge];
    const emergencyToOutdoor: NavigationEdge = {
      ...emergencyEdge,
      id: "30000000-0000-4000-8000-000000000005",
      startNodeId: "20000000-0000-4000-8000-000000000002",
      endNodeId: "20000000-0000-4000-8000-000000000001",
    };
    campus.navEdges = [...campus.navEdges, emergencyToOutdoor];
    const next = reconcileExteriorApproachNavigation(campus);
    const preserved = next.navEdges?.find((edge) => edge.id === emergencyEdge.id);
    expect(preserved?.distance).toBe(42);
    expect(preserved?.exteriorApproachFallbackEntranceId).toBeUndefined();
    expect(next.navEdges?.find((edge) => edge.id === emergencyToOutdoor.id)?.exteriorApproachFallbackEntranceId).toBeUndefined();
  });

  it("does not deprioritize an authored indoor Entrance connection", () => {
    const campus = campusFixture("ramp");
    const lobby: NavigationNode = {
      id: "20000000-0000-4000-8000-000000000006", name: "Lobby",
      type: "hallway", x: 300, y: 420, campusId: "campus-1", buildingId: "building-1", floorId: "floor-1",
      accessible: true, color: "#16a34a",
    };
    campus.navNodes = [...(campus.navNodes ?? []), lobby];
    campus.navEdges = [...(campus.navEdges ?? []), {
      id: "30000000-0000-4000-8000-000000000006", startNodeId: "20000000-0000-4000-8000-000000000002",
      endNodeId: lobby.id, distance: 12, bidirectional: true, accessible: true,
      emergencySafe: true, type: "manual", color: "#16a34a", width: 3,
    }];
    const next = withOutdoorApproachConnection(campus, "ramp");
    expect(next.navEdges?.find((edge) => edge.id === "30000000-0000-4000-8000-000000000006")?.distance).toBe(12);
    expect(next.navEdges?.find((edge) => edge.id === "30000000-0000-4000-8000-000000000006")?.exteriorApproachFallbackEntranceId).toBeUndefined();
  });

  it("keeps Building destinations at the canonical Entrance while Room routes cross the Door bridge", () => {
    const next = withOutdoorApproachConnection(campusFixture("ramp"), "ramp");
    const outdoorId = "20000000-0000-4000-8000-000000000001";
    const entranceId = "20000000-0000-4000-8000-000000000002";
    const doorId = "20000000-0000-4000-8000-000000000003";
    const toBuilding = findNavigationRoute(next.navNodes ?? [], next.navEdges ?? [], outdoorId, entranceId);
    expect(toBuilding?.nodeIds.at(-1)).toBe(entranceId);
    expect(toBuilding?.nodeIds).not.toContain(doorId);
    const toRoom = findNavigationRoute(next.navNodes ?? [], next.navEdges ?? [], outdoorId, doorId);
    expect(toRoom?.nodeIds.at(-1)).toBe(doorId);
    expect(toRoom?.nodeIds).toContain(entranceId);
  });

  it("supports two Entrances served by one Veranda without merging their Door bridges", () => {
    const campus = campusFixture("ramp");
    const building = campus.buildings[0];
    const floor = building.floors[0];
    const secondEntrance: NavigationNode = {
      id: "20000000-0000-4000-8000-000000000007", name: "Side Entrance", type: "entrance",
      x: 420, y: 470, campusId: campus.id, buildingId: building.id, entranceId: "entrance-2",
      accessible: true, color: "#16a34a",
    };
    const secondDoor: NavigationNode = {
      id: "20000000-0000-4000-8000-000000000008", name: "Side Door", type: "hallway",
      x: 400, y: 440, campusId: campus.id, buildingId: building.id, floorId: floor.id, doorId: "door-2",
      accessible: true, color: "#16a34a",
    };
    campus.navNodes = [...(campus.navNodes ?? []), secondEntrance, secondDoor];
    campus.navEdges = [
      ...(campus.navEdges ?? []),
      { id: "30000000-0000-4000-8000-000000000007", startNodeId: secondEntrance.id, endNodeId: secondDoor.id, distance: 1, bidirectional: true, accessible: true, emergencySafe: true, type: "entrance_transition", color: "#2563eb", width: 2 },
    ];
    building.entrances = [
      ...(building.entrances ?? []),
      { id: "entrance-2", buildingId: building.id, edge: "bottom", offset: 0.67, name: "Side Entrance", accessible: true },
    ];
    floor.exteriorZones![0].linkedEntranceIds = ["entrance-1", "entrance-2"];
    const next = withOutdoorApproachConnection(campus, "ramp");
    const thresholdNodes = (next.navNodes ?? []).filter((node) => node.derivedOwnerType === "entrance_threshold");
    expect(thresholdNodes.map((node) => node.buildingEntranceId)).toEqual(expect.arrayContaining(["entrance-1", "entrance-2"]));
    const zoneThresholdEdges = (next.navEdges ?? []).filter((edge) => edge.derivedOwnerType === "exterior_zone" && edge.derivedRole === "zone");
    expect(zoneThresholdEdges).toHaveLength(0);
    const outdoorId = "20000000-0000-4000-8000-000000000001";
    const sideRoute = findNavigationRoute(next.navNodes ?? [], next.navEdges ?? [], outdoorId, secondDoor.id);
    // Sharing a Veranda never invents a route: its spine is authored through
    // Connect or the explicit Suggested Path action.
    expect(sideRoute).toBeNull();
  });

  it("reuses shared access handoff topology and saves two directional Entrances idempotently", () => {
    const campus = campusFixture("ramp");
    const building = campus.buildings[0];
    const floor = building.floors[0];
    const outdoorId = "20000000-0000-4000-8000-000000000001";
    const secondEntranceId = "entrance-2";
    const secondEntranceNodeId = "20000000-0000-4000-8000-000000000007";
    const secondDoorId = "door-2";
    const secondDoorNodeId = "20000000-0000-4000-8000-000000000008";
    building.entrances = [
      { ...building.entrances![0], direction: "entrance_only" },
      { id: secondEntranceId, buildingId: building.id, edge: "bottom", offset: 0.67, name: "Side Exit", direction: "exit_only", accessible: true },
    ];
    floor.exteriorZones![0] = {
      ...floor.exteriorZones![0],
      linkedEntranceId: "entrance-1",
      linkedEntranceIds: ["entrance-1", secondEntranceId],
    };
    // A shared access feature inherits the Veranda's multi-Entrance serving
    // relationship. Its physical/derived outer handoff must be emitted once.
    floor.entranceRamps![0] = { ...floor.entranceRamps![0], linkedEntranceId: undefined };
    const secondEntranceNode: NavigationNode = {
      id: secondEntranceNodeId, name: "Side Exit", type: "entrance", x: 420, y: 470,
      campusId: campus.id, buildingId: building.id, entranceId: secondEntranceId,
      accessible: true, color: "#16a34a",
    };
    const secondDoorNode: NavigationNode = {
      id: secondDoorNodeId, name: "Side Exit Door", type: "hallway", x: 420, y: 440,
      campusId: campus.id, buildingId: building.id, floorId: floor.id, doorId: secondDoorId,
      buildingEntranceId: secondEntranceId, accessible: true, color: "#16a34a",
    };
    const source: Campus = {
      ...campus,
      navNodes: [...(campus.navNodes ?? []), secondEntranceNode, secondDoorNode],
      navEdges: [
        ...(campus.navEdges ?? []),
        { id: "entrance-transition-2", startNodeId: secondEntranceNodeId, endNodeId: secondDoorNodeId, distance: 1, bidirectional: true, accessible: true, emergencySafe: true, type: "entrance_transition", color: "#2563eb", width: 2 },
        { id: "outdoor-entrance-2", startNodeId: outdoorId, endNodeId: secondEntranceNodeId, distance: 180, bidirectional: true, accessible: true, emergencySafe: true, type: "manual", color: "#16a34a", width: 3 },
      ],
    };
    const initial = reconcileExteriorApproachNavigation(source);
    const rampInner = initial.navNodes!.find((node) => node.derivedOwnerType === "entrance_ramp" && node.derivedRole === "inner")!;
    const thresholdA = initial.navNodes!.find((node) => node.derivedOwnerType === "entrance_threshold" && node.derivedOwnerId === "entrance-1")!;
    const thresholdB = initial.navNodes!.find((node) => node.derivedOwnerType === "entrance_threshold" && node.derivedOwnerId === secondEntranceId)!;
    const complete = reconcileExteriorApproachNavigation({
      ...initial,
      navEdges: [
        ...(initial.navEdges ?? []),
        { id: "shared-ramp-spine", startNodeId: "zone-wp", endNodeId: rampInner.id, distance: 20, bidirectional: true, accessible: true, emergencySafe: false, type: "hallway", color: "#16a34a", width: 3 },
        { id: "veranda-to-entrance-a", startNodeId: rampInner.id, endNodeId: thresholdA.id, distance: 20, bidirectional: true, accessible: true, emergencySafe: false, type: "hallway", color: "#16a34a", width: 3 },
        { id: "veranda-to-entrance-b", startNodeId: rampInner.id, endNodeId: thresholdB.id, distance: 20, bidirectional: true, accessible: true, emergencySafe: false, type: "hallway", color: "#16a34a", width: 3 },
      ],
    });
    const activeEdges = complete.navEdges!.filter((edge) => edge.closed !== true);
    const pairCounts = new Map<string, number>();
    activeEdges.forEach((edge) => pairCounts.set(`${edge.startNodeId}|${edge.endNodeId}`, (pairCounts.get(`${edge.startNodeId}|${edge.endNodeId}`) ?? 0) + 1));
    expect([...pairCounts.values()].every((count) => count === 1)).toBe(true);
    expect(activeEdges.filter((edge) => edge.exteriorApproachAutoHandoffTargetId === outdoorId)).toHaveLength(1);
    expect(activeEdges.filter((edge) => edge.derivedOwnerType === "entrance_threshold" && edge.derivedOwnerId === "entrance-1")).toHaveLength(1);
    expect(activeEdges.filter((edge) => edge.derivedOwnerType === "entrance_threshold" && edge.derivedOwnerId === secondEntranceId)).toHaveLength(1);

    const repeated = reconcileExteriorApproachNavigation(complete);
    expect(repeated.navNodes!.map((node) => node.id)).toEqual(complete.navNodes!.map((node) => node.id));
    expect(repeated.navEdges!.map((edge) => edge.id)).toEqual(complete.navEdges!.map((edge) => edge.id));

    const graph = routineRouteGraph(complete, complete.navNodes, buildTestRouteEdges(complete));
    const inbound = findNavigationRoute(graph.nodes, graph.edges, outdoorId, "20000000-0000-4000-8000-000000000003");
    const outbound = findNavigationRoute(graph.nodes, graph.edges, secondDoorNodeId, outdoorId);
    expect(inbound?.nodeIds).toContain("20000000-0000-4000-8000-000000000002");
    expect(inbound?.nodeIds).not.toContain(secondEntranceNodeId);
    expect(outbound?.nodeIds).toContain(secondEntranceNodeId);
    expect(outbound?.nodeIds).not.toContain("20000000-0000-4000-8000-000000000002");

    const payload = serializeCampusStructure(complete);
    expect(() => validateNavigationEdgePayload(payload)).not.toThrow();
  });

  it("routes Room to Campus Gate through the linked Veranda instead of its direct fallback", () => {
    const campus = withCompleteAuthoredApproach(campusFixture("ramp"), "ramp");
    const building = campus.buildings[0];
    const floor = building.floors[0];
    const roomNode: NavigationNode = {
      id: "20000000-0000-4000-0000-000000000010", name: "Room 1", type: "room_access",
      x: 100, y: 380, campusId: campus.id, buildingId: building.id, floorId: floor.id,
      roomId: "room-1", accessible: true, color: "#16a34a",
    };
    const room: FloorRoom = {
      id: "room-1", name: "Room 1", type: "classroom", x: 230, y: 360, w: 140, h: 80,
      floorId: floor.id, buildingId: building.id, accessDoorId: "door-1", accessType: "door",
    };
    floor.rooms = [room];
    floor.walls = [{ id: "room-wall-1", x1: 0, y1: 440, x2: 600, y2: 440, thickness: 4, color: "#334155" }];
    floor.doors[0].wallId = "room-wall-1";
    campus.navNodes = [...(campus.navNodes ?? []), roomNode];

    // Model the browser's persisted pathway edge: it is a canonical direct
    // Entrance handoff, but has no exterior-approach fallback metadata because
    // it was generated before the Veranda reconciliation pass.
    const direct = campus.navEdges!.find((edge) => edge.startNodeId === "20000000-0000-4000-8000-000000000001"
      && edge.endNodeId === "20000000-0000-4000-8000-000000000002")!;
    const legacyDirect = { ...direct, distance: 1, generatedFromPathIds: ["path-direct"] };
    delete legacyDirect.exteriorApproachFallbackEntranceId;
    delete legacyDirect.exteriorApproachFallbackOriginalClosed;
    delete legacyDirect.exteriorApproachFallbackOriginalDistance;
    campus.navEdges = campus.navEdges.map((edge) => edge.id === direct.id ? legacyDirect : edge);

    const routeEdges = buildTestRouteEdges(campus);
    const graph = routineRouteGraph(campus, campus.navNodes, routeEdges);
    const route = findNavigationRoute(
      graph.nodes,
      graph.edges,
      roomNode.id,
      "20000000-0000-4000-8000-000000000001",
    );
    expect(route).not.toBeNull();

    const rampInner = graph.nodes.find((node) => node.derivedOwnerType === "entrance_ramp" && node.derivedRole === "inner");
    const rampOuter = graph.nodes.find((node) => node.derivedOwnerType === "entrance_ramp" && node.derivedRole === "outer");
    expect(rampInner).toBeDefined();
    expect(rampOuter).toBeDefined();
    expect(route!.nodeIds).toContain(rampInner!.id);
    expect(route!.nodeIds).toContain(rampOuter!.id);
    expect(routeEdges.some((edge) => edge.id === legacyDirect.id)).toBe(true);
    expect(graph.edges.some((edge) => edge.id === legacyDirect.id)).toBe(false);
    expect(route!.nodeIds).toContain("20000000-0000-4000-8000-000000000002");
    expect(route!.nodeIds).toContain(roomNode.id);
    const verandaNodeIds = new Set(graph.nodes.filter((node) => node.exteriorZoneId === "zone-1").map((node) => node.id));
    expect(verandaNodeIds.size).toBeGreaterThan(0);
    expect(route!.nodeIds.some((nodeId) => verandaNodeIds.has(nodeId))).toBe(true);
    const rampTransition = routeEdges.find((edge) => edge.type === "entrance_ramp"
      && ((edge.startNodeId === rampInner!.id && edge.endNodeId === rampOuter!.id)
        || (edge.startNodeId === rampOuter!.id && edge.endNodeId === rampInner!.id)));
    expect(rampTransition).toBeDefined();
    expect(route!.nodeIds).toContain(rampTransition!.startNodeId);
    expect(route!.nodeIds).toContain(rampTransition!.endNodeId);
    expect(humanRouteSteps(campus, route!.nodeIds)).toContain("Continue outside via ramp");

    const reverseRoute = findNavigationRoute(
      graph.nodes,
      graph.edges,
      "20000000-0000-4000-8000-000000000001",
      roomNode.id,
    );
    expect(reverseRoute).not.toBeNull();
    expect(reverseRoute!.nodeIds).toContain(rampInner!.id);
    expect(reverseRoute!.nodeIds).toContain(rampOuter!.id);
    expect(reverseRoute!.nodeIds).toContain("20000000-0000-4000-8000-000000000002");
    expect(humanRouteSteps(campus, reverseRoute!.nodeIds)).toContain("Continue outside via ramp");
  });

  it("suspends hosted Veranda-point connections when walkability is turned off without changing IDs", () => {
    const campus = campusFixture("ramp");
    const hosted: NavigationNode = {
      id: "20000000-0000-4000-8000-000000000005", name: "Veranda Point", type: "hallway",
      x: 320, y: 490, campusId: "campus-1", buildingId: "building-1", floorId: "floor-1",
      exteriorZoneId: "zone-1", accessible: true, color: "#16a34a",
    };
    campus.navNodes = [...(campus.navNodes ?? []), hosted];
    campus.navEdges = [...(campus.navEdges ?? []), {
      id: "30000000-0000-4000-8000-000000000004", startNodeId: hosted.id,
      endNodeId: "20000000-0000-4000-8000-000000000001", distance: 20,
      bidirectional: true, accessible: true, emergencySafe: true, type: "manual", color: "#16a34a", width: 3,
    }];
    const enabled = reconcileExteriorApproachNavigation(campus);
    const approachIds = (enabled.navNodes ?? []).filter(isDerivedExteriorApproachNode).map((node) => node.id);
    const disabled = structuredClone(enabled);
    disabled.buildings[0].floors[0].exteriorZones![0].walkable = false;
    const suspended = reconcileExteriorApproachNavigation(disabled);
    expect((suspended.navNodes ?? []).find((node) => node.id === hosted.id)?.exteriorZoneId).toBe("zone-1");
    const suspendedEdge = suspended.navEdges?.find((edge) => edge.startNodeId === hosted.id || edge.endNodeId === hosted.id);
    expect(suspendedEdge?.closed).toBe(true);
    expect(suspendedEdge?.exteriorApproachSuspendedZoneId).toBe("zone-1");
    expect((suspended.navNodes ?? []).some(isDerivedExteriorApproachNode)).toBe(false);
    const reenabled = structuredClone(suspended);
    reenabled.buildings[0].floors[0].exteriorZones![0].walkable = true;
    const restored = reconcileExteriorApproachNavigation(reenabled);
    expect((restored.navNodes ?? []).filter(isDerivedExteriorApproachNode).map((node) => node.id)).toEqual(approachIds);
    expect((restored.navNodes ?? []).filter((node) => node.id === hosted.id)).toHaveLength(1);
    expect(restored.navEdges?.find((edge) => edge.id === suspendedEdge?.id)?.closed).toBeUndefined();
    expect(restored.navEdges?.find((edge) => edge.id === suspendedEdge?.id)?.exteriorApproachSuspendedZoneId).toBeUndefined();
  });

  it("keeps derived approach anchors available as normal Connect targets while their ownership stays protected", () => {
    const campus = reconcileExteriorApproachNavigation(campusFixture("ramp"));
    const floorNodes = (campus.navNodes ?? []).filter((node) => node.floorId === "floor-1");
    const inner = floorNodes.find((node) => node.derivedOwnerType === "entrance_ramp" && node.derivedRole === "inner");
    const threshold = floorNodes.find((node) => node.derivedOwnerType === "entrance_threshold");
    expect(inner).toBeDefined();
    expect(threshold).toBeDefined();
    expect(findNavNodeAtPoint(floorNodes, { x: inner!.x, y: inner!.y })?.id).toBe(inner!.id);
    expect(findNavNodeAtPoint(floorNodes, { x: threshold!.x, y: threshold!.y })?.id).toBe(threshold!.id);
    expect(isDerivedExteriorApproachNode(inner)).toBe(true);
    const stepsCampus = reconcileExteriorApproachNavigation(campusFixture("steps"));
    const stepsInner = (stepsCampus.navNodes ?? []).find((node) => node.derivedOwnerType === "entrance_steps" && node.derivedRole === "inner");
    expect(stepsInner).toBeDefined();
    expect(findNavNodeAtPoint((stepsCampus.navNodes ?? []).filter((node) => node.floorId === "floor-1"), { x: stepsInner!.x, y: stepsInner!.y })?.id).toBe(stepsInner!.id);
  });

  it("creates one editable orthogonal Veranda spine for multiple entrances and access features", () => {
    const campus = campusFixture("ramp");
    const building = campus.buildings[0];
    const floor = building.floors[0];
    floor.exteriorZones![0].linkedEntranceIds = ["entrance-1", "entrance-2"];
    building.entrances!.push({ id: "entrance-2", buildingId: building.id, edge: "bottom", offset: 0.68, name: "Side Entrance", accessible: true });
    campus.navNodes!.push(
      { id: "entry-2", name: "Side Entrance", type: "entrance", x: 420, y: 470, campusId: campus.id, buildingId: building.id, entranceId: "entrance-2", accessible: true, color: "#16a34a" },
      { id: "door-2", name: "Side Door", type: "hallway", x: 410, y: 440, campusId: campus.id, buildingId: building.id, floorId: floor.id, doorId: "door-2", accessible: true, color: "#16a34a" },
    );
    campus.navEdges!.push({ id: "bridge-2", startNodeId: "entry-2", endNodeId: "door-2", distance: 1, bidirectional: true, accessible: true, emergencySafe: true, type: "entrance_transition", color: "#2563eb", width: 2 });
    floor.entranceSteps = [{ id: "steps-1", x: 0, y: 0, width: 60, height: 36, label: "Steps", parentZoneId: "zone-1", accessible: false }];
    campus.navNodes = campus.navNodes!.filter((node) => node.exteriorZoneId !== "zone-1");
    const reconciled = reconcileExteriorApproachNavigation(campus);
    const suggestion = createSuggestedExteriorZonePath({ zone: floor.exteriorZones![0], floor, buildingId: building.id, campusId: campus.id, nodes: reconciled.navNodes ?? [], entranceSteps: floor.entranceSteps, entranceRamps: floor.entranceRamps, nextId: (() => { let i = 0; return (prefix) => `${prefix}-${++i}`; })() });
    expect(suggestion.created).toBe(true);
    expect(suggestion.nodes.length).toBeGreaterThanOrEqual(3);
    expect(suggestion.edges.every((edge) => (edge.bendPoints ?? []).every((bend) => Number.isFinite(bend.x) && Number.isFinite(bend.y)))).toBe(true);
    expect(suggestion.edges.filter((edge) => edge.accessible === false).length).toBeGreaterThan(0);
    // Suggested paths are authored records, not derived/locked approach edges.
    expect(suggestion.edges.some((edge) => edge.derivedOwnerType)).toBe(false);
  });

  it("only prefers a Ramp approach after its editable Veranda path is authored", () => {
    const withOuterConnection = withOutdoorApproachConnection(campusFixture("ramp"), "ramp");
    const connected = reconcileExteriorApproachNavigation({
      ...withOuterConnection,
      navNodes: (withOuterConnection.navNodes ?? []).filter((node) => node.exteriorZoneId !== "zone-1"),
      navEdges: (withOuterConnection.navEdges ?? []).filter((edge) => edge.startNodeId !== "zone-wp" && edge.endNodeId !== "zone-wp"),
    });
    const floor = connected.buildings[0].floors[0];
    const ramp = floor.entranceRamps![0];
    const suggestion = createSuggestedExteriorZonePath({
      zone: floor.exteriorZones![0], floor, buildingId: "building-1", campusId: connected.id,
      nodes: connected.navNodes ?? [], entranceRamps: floor.entranceRamps,
      nextId: (() => { let i = 0; return (prefix) => `${prefix}-suggested-${++i}`; })(),
    });
    const complete = reconcileExteriorApproachNavigation({
      ...connected,
      navNodes: [...(connected.navNodes ?? []), ...suggestion.nodes],
      navEdges: [...(connected.navEdges ?? []), ...suggestion.edges],
    });
    expect(suggestion.created).toBe(true);
    expect((complete.navEdges ?? []).find((edge) => edge.id === "30000000-0000-4000-8000-000000000002")?.distance).toBeGreaterThan(900000);
    expect((complete.navNodes ?? []).some((node) => node.derivedOwnerId === ramp.id && node.derivedRole === "inner")).toBe(true);
  });

  it("keeps a complete authored Veranda approach ahead of the direct Entrance fallback in Test Route", () => {
    const complete = withCompleteAuthoredApproach(campusFixture("ramp"), "ramp");
    const routeEdges = buildTestRouteEdges(complete);
    const fallback = routeEdges.find((edge) => edge.exteriorApproachFallbackEntranceId === "entrance-1");
    expect(fallback?.distance).toBeGreaterThan(900_000);

    const route = findNavigationRoute(
      complete.navNodes ?? [],
      routeEdges,
      "20000000-0000-4000-8000-000000000001",
      "20000000-0000-4000-8000-000000000003",
    );
    expect(route).not.toBeNull();
    expect(route?.nodeIds.some((id) => complete.navNodes?.find((node) => node.id === id)?.exteriorZoneId === "zone-1")).toBe(true);
    expect(route?.nodeIds.some((id) => complete.navNodes?.find((node) => node.id === id)?.derivedOwnerType === "entrance_ramp")).toBe(true);
    const outdoorIndex = route?.nodeIds.indexOf("20000000-0000-4000-8000-000000000001") ?? -1;
    expect(outdoorIndex).toBeGreaterThanOrEqual(0);
    expect(route?.nodeIds[outdoorIndex + 1]).not.toBe("20000000-0000-4000-8000-000000000002");
    const visibleExterior = visibleContextRouteNodeIds(route!.nodeIds, complete);
    const verandaId = route!.nodeIds.find((id) => complete.navNodes?.find((node) => node.id === id)?.exteriorZoneId === "zone-1");
    expect(verandaId).toBeDefined();
    expect(visibleExterior).toContain(verandaId);
    expect(visibleExterior).not.toContain("20000000-0000-4000-8000-000000000003");
  });

  it("keeps Floor and Outdoor projections in separate route fragments", () => {
    const complete = withCompleteAuthoredApproach(campusFixture("ramp"), "ramp");
    const route = findNavigationRoute(
      complete.navNodes ?? [],
      buildTestRouteEdges(complete),
      "20000000-0000-4000-8000-000000000001",
      "20000000-0000-4000-8000-000000000003",
    );
    expect(route).not.toBeNull();
    const floorFragments = visibleContextRouteNodeFragments(route!.nodeIds, complete, { kind: "floor", buildingId: "building-1", floorId: "floor-1" });
    const outdoorFragments = visibleContextRouteNodeFragments(route!.nodeIds, complete, { kind: "outdoor" });
    expect(floorFragments.flat()).toContain("20000000-0000-4000-8000-000000000003");
    expect(floorFragments.flat()).not.toContain("20000000-0000-4000-8000-000000000001");
    expect(outdoorFragments.flat()).toContain("20000000-0000-4000-8000-000000000001");
    expect(outdoorFragments.flat()).not.toContain("20000000-0000-4000-8000-000000000009");
    expect(outdoorFragments.length).toBeGreaterThan(1);
    expect(outdoorFragments.every((fragment) => fragment.length > 0)).toBe(true);
  });

  it("collapses only the canonical hidden approach to the Outdoor Entrance handoff", () => {
    const complete = withCompleteAuthoredApproach(campusFixture("ramp"), "ramp");
    const routeEdges = buildTestRouteEdges(complete);
    const route = findNavigationRoute(
      complete.navNodes ?? [],
      routeEdges,
      "20000000-0000-4000-8000-000000000001",
      "20000000-0000-4000-8000-000000000003",
    );
    expect(route).not.toBeNull();
    const raw = visibleContextRouteNodeFragments(route!.nodeIds, complete, { kind: "outdoor" });
    const collapsed = collapseOutdoorHandoffFragments(raw, complete, routeEdges, { kind: "outdoor" });
    const outdoorIndex = collapsed.findIndex((fragment) => fragment.includes("20000000-0000-4000-8000-000000000001"));
    expect(outdoorIndex).toBeGreaterThanOrEqual(0);
    expect(collapsed[outdoorIndex]).toContain("20000000-0000-4000-8000-000000000002");
    // The hidden Veranda/access-feature nodes never become Outdoor authoring
    // geometry merely because the semantic handoff was collapsed.
    expect(collapsed.flat()).not.toContain("20000000-0000-4000-8000-000000000009");
  });

  it("projects a complete hidden Veranda route to the physical Outdoor Entrance", () => {
    const complete = withCompleteAuthoredApproach(campusFixture("ramp"), "ramp");
    const routeEdges = buildTestRouteEdges(complete);
    const route = findNavigationRoute(
      complete.navNodes ?? [],
      routeEdges,
      "20000000-0000-4000-8000-000000000001",
      "20000000-0000-4000-8000-000000000003",
    );
    expect(route).not.toBeNull();
    const projectedEdges = outdoorRouteProjectionEdges(complete, routeEdges, route!.nodeIds, { kind: "outdoor" });
    const raw = visibleContextRouteNodeFragments(route!.nodeIds, complete, { kind: "outdoor" });
    const collapsed = collapseOutdoorHandoffFragments(raw, complete, projectedEdges, { kind: "outdoor" }, route!.nodeIds);
    const outdoorFragment = collapsed.find((fragment) => fragment.includes("20000000-0000-4000-8000-000000000001"));
    expect(outdoorFragment).toContain("20000000-0000-4000-8000-000000000002");
    expect(outdoorFragment).not.toContain("20000000-0000-4000-8000-000000000009");
  });

  it("does not expose a continuation cue for a Building destination", () => {
    const complete = withCompleteAuthoredApproach(campusFixture("ramp"), "ramp");
    const route = findNavigationRoute(
      complete.navNodes ?? [],
      buildTestRouteEdges(complete),
      "20000000-0000-4000-8000-000000000001",
      "20000000-0000-4000-8000-000000000002",
    );
    expect(route).not.toBeNull();
    expect(routeContinuationMarkers(complete, route!.nodeIds, "standard", { kind: "outdoor" }, "building:building-1")).toEqual([]);
    const markers = routeTransitionMarkers(route!.nodeIds, complete, { kind: "outdoor" }, "building:building-1", "standard");
    expect(presentationRouteTransitionMarkers(markers, complete, { kind: "outdoor" }, [], "building:building-1").some((marker) => marker.kind === "entrance")).toBe(false);
  });

  it("does not show an Enter Building cue when the Building is the route start", () => {
    const complete = withCompleteAuthoredApproach(campusFixture("ramp"), "ramp");
    const route = findNavigationRoute(
      complete.navNodes ?? [],
      buildTestRouteEdges(complete),
      "20000000-0000-4000-8000-000000000002",
      "20000000-0000-4000-8000-000000000001",
    );
    expect(route).not.toBeNull();
    const outdoorContext = { kind: "outdoor" as const };
    expect(routeContinuationMarkers(complete, route!.nodeIds, "standard", outdoorContext, "node:outdoor", "building:building-1")).toEqual([]);
    const markers = routeTransitionMarkers(route!.nodeIds, complete, outdoorContext, "node:outdoor", "standard", "building:building-1");
    expect(markers.some((marker) => marker.kind === "entrance")).toBe(false);
  });

  it("selects a Ramp continuation for an Accessible exterior route and a Steps continuation for Standard", () => {
    const rampCampus = withCompleteAuthoredApproach(campusFixture("ramp"), "ramp");
    const rampRoute = findNavigationRoute(
      rampCampus.navNodes ?? [],
      buildTestRouteEdges(rampCampus),
      "20000000-0000-4000-8000-000000000001",
      "20000000-0000-4000-8000-000000000003",
      true,
    );
    expect(rampRoute).not.toBeNull();
    expect(routeContinuationMarkers(rampCampus, rampRoute!.nodeIds, "accessible")).toEqual([
      expect.objectContaining({ kind: "ramp" }),
    ]);
    expect(routeTransitionMarkers(rampRoute!.nodeIds, rampCampus, { kind: "outdoor" })[0]).toMatchObject({ kind: "ramp" });

    const stepsCampus = withCompleteAuthoredApproach(campusFixture("steps"), "steps");
    const stepsRoute = findNavigationRoute(
      stepsCampus.navNodes ?? [],
      buildTestRouteEdges(stepsCampus),
      "20000000-0000-4000-8000-000000000001",
      "20000000-0000-4000-8000-000000000003",
    );
    expect(stepsRoute).not.toBeNull();
    expect(routeContinuationMarkers(stepsCampus, stepsRoute!.nodeIds, "standard")).toEqual([
      expect.objectContaining({ kind: "steps" }),
    ]);
    expect(routeTransitionMarkers(stepsRoute!.nodeIds, stepsCampus, { kind: "outdoor" })[0]).toMatchObject({ kind: "stair" });
    const accessibleStepsRoute = findNavigationRoute(
      stepsCampus.navNodes ?? [],
      buildTestRouteEdges(stepsCampus),
      "20000000-0000-4000-8000-000000000001",
      "20000000-0000-4000-8000-000000000003",
      true,
    );
    expect(accessibleStepsRoute).not.toBeNull();
    expect(accessibleStepsRoute?.nodeIds.some((id) => stepsCampus.navNodes?.find((node) => node.id === id)?.derivedOwnerType === "entrance_steps")).toBe(false);
  });

  it("does not expose a Door or Ramp/Steps transition duplicate in the active context", () => {
    const rampCampus = withCompleteAuthoredApproach(campusFixture("ramp"), "ramp");
    const route = findNavigationRoute(
      rampCampus.navNodes ?? [],
      buildTestRouteEdges(rampCampus),
      "20000000-0000-4000-8000-000000000001",
      "20000000-0000-4000-8000-000000000003",
      true,
    );
    expect(route).not.toBeNull();
    const floorContext = { kind: "floor" as const, buildingId: "building-1", floorId: "floor-1" };
    const floorContinuation = routeContinuationMarkers(rampCampus, route!.nodeIds, "accessible", floorContext);
    const floorTransitions = presentationRouteTransitionMarkers(
      routeTransitionMarkers(route!.nodeIds, rampCampus, floorContext, undefined, "accessible"),
      rampCampus,
      floorContext,
      floorContinuation,
    );
    expect(floorContinuation).toEqual([expect.objectContaining({ kind: "ramp" })]);
    expect(floorTransitions.some((marker) => marker.kind === "entrance")).toBe(false);
    expect(floorTransitions.some((marker) => marker.kind === "ramp" || marker.kind === "stair")).toBe(false);

    const outdoorContext = { kind: "outdoor" as const };
    const outdoorContinuation = routeContinuationMarkers(rampCampus, route!.nodeIds, "accessible", outdoorContext);
    const outdoorTransitions = presentationRouteTransitionMarkers(
      routeTransitionMarkers(route!.nodeIds, rampCampus, outdoorContext, undefined, "accessible"),
      rampCampus,
      outdoorContext,
      outdoorContinuation,
    );
    expect(outdoorTransitions.some((marker) => marker.kind === "ramp" || marker.kind === "stair")).toBe(false);
  });

  it("does not overwrite an existing Veranda network and leaves a furniture-blocked suggestion visibly invalid", () => {
    const campus = reconcileExteriorApproachNavigation(campusFixture("ramp"));
    const floor = campus.buildings[0].floors[0];
    const empty = structuredClone(campus);
    empty.navNodes = (empty.navNodes ?? []).filter((node) => node.exteriorZoneId !== "zone-1");
    const ready = reconcileExteriorApproachNavigation(empty);
    const suggestion = createSuggestedExteriorZonePath({ zone: floor.exteriorZones![0], floor, buildingId: "building-1", campusId: campus.id, nodes: ready.navNodes ?? [], entranceRamps: floor.entranceRamps, nextId: (() => { let i = 0; return (prefix) => `${prefix}-${++i}`; })() });
    const allNodes = [...(ready.navNodes ?? []), ...suggestion.nodes];
    const blockedEdge = suggestion.edges.find((edge) => {
      const points = edgePolylinePoints(edge, allNodes);
      return !!points && edgeCrossesBlockingFurniture(points, [{ x: 295, y: 462, width: 50, height: 24, type: "table" }]);
    });
    expect(blockedEdge).toBeDefined();
    const existing = createSuggestedExteriorZonePath({ zone: floor.exteriorZones![0], floor, buildingId: "building-1", campusId: campus.id, nodes: campus.navNodes ?? [], entranceRamps: floor.entranceRamps, nextId: () => "unused" });
    expect(existing.created).toBe(false);
  });

  it("keeps an authored Veranda-to-threshold edge through an Entrance move", () => {
    const base = withOutdoorApproachConnection(campusFixture("ramp"), "ramp");
    const threshold = (base.navNodes ?? []).find((node) => node.derivedOwnerType === "entrance_threshold");
    expect(threshold).toBeDefined();
    const bends = [{ x: 330, y: 500 }, { x: 350, y: 500 }];
    const authored = reconcileExteriorApproachNavigation({
      ...base,
      navEdges: [
        ...(base.navEdges ?? []),
        {
          id: "authored-veranda-threshold",
          startNodeId: "20000000-0000-4000-8000-000000000009",
          endNodeId: threshold!.id,
          distance: 120,
          bidirectional: true,
          accessible: true,
          emergencySafe: false,
          type: "hallway",
          color: "#16a34a",
          width: 3,
          bendPoints: bends,
        },
      ],
    });
    const before = authored.navEdges!.find((edge) => edge.id === "authored-veranda-threshold")!;
    const building = authored.buildings[0];
    const movedBuilding = updateBuildingEntrance(building, "entrance-1", { offset: 0.72 }).building;
    const movedWithDoors = reconcileEntranceDoors(reconcileEntranceTransitions({
      ...authored,
      buildings: [movedBuilding],
      navNodes: syncEntranceNodePositions([movedBuilding], authored.navNodes ?? []),
    }));
    const moved = reconcileExteriorApproachNavigation(
      reconcileEntranceOutdoorConnections(movedWithDoors, { preserveAuthoredGeometry: true }),
    );
    const movedThreshold = moved.navNodes!.find((node) => node.derivedOwnerType === "entrance_threshold")!;
    const after = moved.navEdges!.find((edge) => edge.id === before.id);
    expect(movedThreshold.id).toBe(threshold!.id);
    expect(after).toMatchObject({ id: before.id, startNodeId: before.startNodeId, endNodeId: threshold!.id, bendPoints: bends });
    expect(moved.navEdges!.some((edge) => edge.id === before.id && edge.endNodeId !== movedThreshold.id)).toBe(false);
  });

  it("reports Veranda readiness from authored connectivity to the stable threshold", () => {
    const base = withOutdoorApproachConnection(campusFixture("ramp"), "ramp");
    const inner = base.navNodes!.find((node) => node.derivedOwnerType === "entrance_ramp" && node.derivedRole === "inner")!;
    const threshold = base.navNodes!.find((node) => node.derivedOwnerType === "entrance_threshold")!;
    const walkingPoint = base.navNodes!.find((node) => node.exteriorZoneId === "zone-1")!;
    expect(exteriorApproachEntranceIsReady(base, "building-1", "floor-1", "zone-1", "entrance-1")).toBe(false);
    const connected = reconcileExteriorApproachNavigation({
      ...base,
      navEdges: [
        ...(base.navEdges ?? []),
        { id: "veranda-to-ramp", startNodeId: walkingPoint.id, endNodeId: inner.id, distance: 20, bidirectional: true, accessible: true, emergencySafe: false, type: "hallway", color: "#16a34a", width: 3 },
        { id: "ramp-to-threshold", startNodeId: inner.id, endNodeId: threshold.id, distance: 20, bidirectional: true, accessible: true, emergencySafe: false, type: "hallway", color: "#16a34a", width: 3 },
      ],
    });
    expect(exteriorApproachEntranceIsReady(connected, "building-1", "floor-1", "zone-1", "entrance-1")).toBe(true);
    const route = findNavigationRoute(connected.navNodes ?? [], connected.navEdges ?? [], "20000000-0000-4000-8000-000000000001", "20000000-0000-4000-8000-000000000003");
    expect(route?.nodeIds).toContain(inner.id);
    expect(route?.nodeIds).toContain(threshold.id);
    const disconnected = { ...connected, navEdges: connected.navEdges!.filter((edge) => edge.id !== "ramp-to-threshold") };
    expect(exteriorApproachEntranceIsReady(disconnected, "building-1", "floor-1", "zone-1", "entrance-1")).toBe(false);
  });

  it("recognizes a valid authored Veranda branch attached to the physical Entrance anchor", () => {
    const base = withOutdoorApproachConnection(campusFixture("ramp"), "ramp");
    const entranceNode = base.navNodes!.find((node) => node.entranceId === "entrance-1" && !node.floorId)!;
    const inner = base.navNodes!.find((node) => node.derivedOwnerType === "entrance_ramp" && node.derivedRole === "inner")!;
    const walkingPoint = base.navNodes!.find((node) => node.exteriorZoneId === "zone-1")!;
    const authored = reconcileExteriorApproachNavigation({
      ...base,
      navEdges: [
        ...(base.navEdges ?? []),
        { id: "physical-entrance-to-veranda", startNodeId: entranceNode.id, endNodeId: walkingPoint.id, distance: 20, bidirectional: true, accessible: true, emergencySafe: false, type: "hallway", color: "#16a34a", width: 3 },
        { id: "veranda-to-ramp-inner", startNodeId: walkingPoint.id, endNodeId: inner.id, distance: 20, bidirectional: true, accessible: true, emergencySafe: false, type: "hallway", color: "#16a34a", width: 3 },
      ],
    });
    expect(exteriorApproachZoneReadiness(authored, "building-1", "floor-1", "zone-1")).toMatchObject({ status: "Ready", standardReady: true, inboundReady: true, outboundReady: true });
    const graph = routineRouteGraph(authored, authored.navNodes, buildTestRouteEdges(authored));
    const route = findNavigationRoute(graph.nodes, graph.edges, entranceNode.id, "20000000-0000-4000-8000-000000000001");
    expect(route?.nodeIds).toContain(inner.id);
  });

  it("uses a complete linked Veranda in Emergency's final General fallback tier", () => {
    const complete = withCompleteAuthoredApproach(campusFixture("ramp"), "ramp");
    const selected = chooseEmergencyDestinationCandidate(complete, buildTestRouteEdges(complete), "20000000-0000-4000-8000-000000000003");
    const rampInner = complete.navNodes!.find((node) => node.derivedOwnerType === "entrance_ramp" && node.derivedRole === "inner");
    const threshold = complete.navNodes!.find((node) => node.derivedOwnerType === "entrance_threshold" && node.derivedRole === "threshold");
    expect(selected?.candidate.kind).toBe("general");
    expect(selected?.path.nodeIds).toContain(rampInner!.id);
    expect(selected?.path.nodeIds).toContain(threshold!.id);
  });

  it("uses the same canonical readiness states for standard, accessible, and blocked approaches", () => {
    const steps = withCompleteAuthoredApproach(campusFixture("steps"), "steps");
    const stepsReadiness = exteriorApproachEntranceReadiness(steps, "building-1", "floor-1", "zone-1", "entrance-1");
    expect(stepsReadiness).toMatchObject({ status: "Ready", standardReady: true, accessibleReady: false });
    expect(exteriorApproachZoneReadiness(steps, "building-1", "floor-1", "zone-1").status).toBe("Ready");

    const ramp = withCompleteAuthoredApproach(campusFixture("ramp"), "ramp");
    const rampAuthoredEdge = ramp.navEdges!.find((edge) => !edge.derivedOwnerType && edge.endNodeId === exteriorApproachNodeId(ramp.id, "building-1", "floor-1", "entrance_threshold", "entrance-1", "threshold"));
    expect(rampAuthoredEdge).toBeDefined();
    const blocked = exteriorApproachEntranceReadiness(
      ramp,
      "building-1",
      "floor-1",
      "zone-1",
      "entrance-1",
      new Set([rampAuthoredEdge!.id]),
    );
    expect(blocked).toMatchObject({ status: "Path blocked", standardReady: false, hasBlockedConnection: true });
    expect(exteriorApproachZoneReadiness(ramp, "building-1", "floor-1", "zone-1", new Set([rampAuthoredEdge!.id])).status).toBe("Path blocked");
  });

  it("keeps a shared Veranda Ready when one of multiple linked Entrances has a complete approach", () => {
    const complete = withCompleteAuthoredApproach(campusFixture("ramp"), "ramp");
    const building = complete.buildings[0];
    const firstEntrance = building.entrances![0];
    const secondEntrance = { ...firstEntrance, id: "entrance-2", name: "Side Entrance" };
    const firstNode = complete.navNodes!.find((node) => node.entranceId === firstEntrance.id && !node.floorId)!;
    const multiEntrance = reconcileExteriorApproachNavigation({
      ...complete,
      buildings: complete.buildings.map((candidate) => candidate.id !== building.id ? candidate : ({
        ...candidate,
        entrances: [firstEntrance, secondEntrance],
        floors: candidate.floors.map((floor) => ({
          ...floor,
          exteriorZones: floor.exteriorZones?.map((zone) => ({
            ...zone,
            linkedEntranceIds: [firstEntrance.id, secondEntrance.id],
          })),
        })),
      })),
      navNodes: [...complete.navNodes!, {
        ...firstNode,
        id: "entrance-node-2",
        entranceId: secondEntrance.id,
        name: secondEntrance.name,
        x: firstNode.x + 40,
      }],
    });
    const readiness = exteriorApproachZoneReadiness(multiEntrance, building.id, "floor-1", "zone-1");
    expect(readiness.entrances).toHaveLength(2);
    expect(readiness.entrances.find((entry) => entry.standardReady)).toBeDefined();
    expect(readiness.status).toBe("Ready");
    expect(readiness.standardReady).toBe(true);
  });

  it("summarizes a shared Veranda by inbound and outbound directional readiness", () => {
    const complete = withCompleteAuthoredApproach(campusFixture("ramp"), "ramp");
    const building = complete.buildings[0];
    const entrance = building.entrances![0];
    const floor = building.floors[0];
    const secondEntranceId = "entrance-2";
    const secondEntranceNode: NavigationNode = {
      id: "entrance-node-2", name: "Side Exit", type: "entrance", x: 420, y: 470,
      campusId: complete.id, buildingId: building.id, entranceId: secondEntranceId,
      accessible: true, color: "#16a34a",
    };
    const secondDoorNode: NavigationNode = {
      id: "door-node-2", name: "Side Exit Door", type: "hallway", x: 420, y: 440,
      campusId: complete.id, buildingId: building.id, floorId: floor.id, doorId: "door-2",
      buildingEntranceId: secondEntranceId, accessible: true, color: "#16a34a",
    };
    const directionalBase: Campus = {
      ...complete,
      buildings: complete.buildings.map((candidate) => candidate.id !== building.id ? candidate : ({
        ...candidate,
        entrances: [
          { ...entrance, direction: "entrance_only" },
          { id: secondEntranceId, buildingId: building.id, edge: "bottom", offset: 0.67, name: "Side Exit", direction: "exit_only", accessible: true },
        ],
        floors: candidate.floors.map((candidateFloor) => ({
          ...candidateFloor,
          exteriorZones: candidateFloor.exteriorZones?.map((zone) => ({ ...zone, linkedEntranceId: entrance.id, linkedEntranceIds: [entrance.id] })),
        })),
      })),
      navNodes: [...complete.navNodes!, secondEntranceNode, secondDoorNode],
      navEdges: [...complete.navEdges!, {
        id: "second-entrance-transition", startNodeId: secondEntranceNode.id, endNodeId: secondDoorNode.id,
        distance: 1, bidirectional: true, accessible: true, emergencySafe: true, type: "entrance_transition", color: "#2563eb", width: 2,
      }, {
        id: "second-entrance-outdoor", startNodeId: "20000000-0000-4000-8000-000000000001", endNodeId: secondEntranceNode.id,
        distance: 180, bidirectional: true, accessible: true, emergencySafe: true, type: "manual", color: "#16a34a", width: 3,
      }],
    };
    const inboundOnly = reconcileExteriorApproachNavigation({
      ...directionalBase,
    });
    const inboundReadiness = exteriorApproachZoneReadiness(inboundOnly, building.id, "floor-1", "zone-1");
    expect(inboundReadiness).toMatchObject({
      status: "Entrance ready · Exit needs connection",
      standardReady: false,
      inboundReady: true,
      outboundReady: false,
    });

    const outboundOnly = reconcileExteriorApproachNavigation({
      ...directionalBase,
      buildings: directionalBase.buildings.map((candidate) => candidate.id !== building.id ? candidate : ({
        ...candidate,
        entrances: [
          { ...entrance, direction: "exit_only" },
          { id: secondEntranceId, buildingId: building.id, edge: "bottom", offset: 0.67, name: "Side Entrance", direction: "entrance_only", accessible: true },
        ],
      })),
    });
    const outboundReadiness = exteriorApproachZoneReadiness(outboundOnly, building.id, "floor-1", "zone-1");
    expect(outboundReadiness).toMatchObject({
      status: "Exit ready · Entrance needs connection",
      standardReady: false,
      inboundReady: false,
      outboundReady: true,
    });
  });

  it("moves the generated Door/threshold coordinates without replacing their identities", () => {
    let generatedId = 0;
    const source = campusFixture("ramp");
    const floor = source.buildings[0].floors[0];
    floor.doors[0] = { ...floor.doors[0], buildingEntranceId: "entrance-1" };
    source.navNodes = source.navNodes!.map((node) => node.doorId === "door-1"
      ? { ...node, buildingEntranceId: "entrance-1" }
      : node);
    const ids = (prefix: string) => `${prefix}-stable-${++generatedId}`;
    const initial = reconcileExteriorApproachNavigation(reconcileEntranceDoors(source, ids));
    const initialDoor = initial.navNodes!.find((node) => node.doorId === "door-1")!;
    const initialThreshold = initial.navNodes!.find((node) => node.derivedOwnerType === "entrance_threshold")!;
    const base = withOutdoorApproachConnection(initial, "ramp");
    const authored = {
      ...base,
      navEdges: [...(base.navEdges ?? []), {
        id: "authored-generated-threshold",
        startNodeId: "20000000-0000-4000-8000-000000000009",
        endNodeId: initialThreshold.id,
        distance: 40,
        bidirectional: true,
        accessible: true,
        emergencySafe: false,
        type: "hallway",
        color: "#16a34a",
        width: 3,
      }],
    } as Campus;
    const movedBuilding = updateBuildingEntrance(authored.buildings[0], "entrance-1", { offset: 0.72 }).building;
    const moved = reconcileExteriorApproachNavigation(reconcileEntranceDoors(reconcileEntranceTransitions({
      ...authored,
      buildings: [movedBuilding],
      navNodes: syncEntranceNodePositions([movedBuilding], authored.navNodes ?? []),
    })));
    const movedDoor = moved.navNodes!.find((node) => node.doorId === "door-1")!;
    const movedThreshold = moved.navNodes!.find((node) => node.derivedOwnerType === "entrance_threshold")!;
    expect(movedDoor.id).toBe(initialDoor.id);
    expect(movedDoor.x).not.toBe(initialDoor.x);
    expect(movedThreshold.id).toBe(initialThreshold.id);
    expect(movedThreshold.x).not.toBe(initialThreshold.x);
    expect(moved.navEdges!.find((edge) => edge.id === "authored-generated-threshold")).toMatchObject({ endNodeId: initialThreshold.id });
  });

  it("keeps the authored physical edge when Entrance purpose or direction changes", () => {
    const base = withOutdoorApproachConnection(campusFixture("ramp"), "ramp");
    const threshold = base.navNodes!.find((node) => node.derivedOwnerType === "entrance_threshold")!;
    const authored = {
      ...base,
      navEdges: [...(base.navEdges ?? []), {
        id: "authored-purpose-change",
        startNodeId: "20000000-0000-4000-8000-000000000009",
        endNodeId: threshold.id,
        distance: 40,
        bidirectional: true,
        accessible: true,
        emergencySafe: false,
        type: "hallway",
        color: "#16a34a",
        width: 3,
      }],
    } as Campus;
    const changedBuilding = updateBuildingEntrance(authored.buildings[0], "entrance-1", { type: "service", direction: "exit_only" }).building;
    const changed = reconcileExteriorApproachNavigation(reconcileEntranceDoors(reconcileEntranceTransitions({
      ...authored,
      buildings: [changedBuilding],
      navNodes: syncEntranceNodePositions([changedBuilding], authored.navNodes ?? []),
    })));
    expect(changed.navEdges!.find((edge) => edge.id === "authored-purpose-change")).toMatchObject({ endNodeId: threshold.id });
  });
});

import { describe, expect, it } from "vitest";
import type { Campus, NavigationEdge, NavigationNode } from "../../components/map-builder/types";
import { createIndoorNavNode } from "../indoorNavigationGraph";
import { indoorNavEdges, indoorNavNodes } from "../indoorNavigationGraph";
import { moveFloorInBuilding } from "../floorManagement";
import { outdoorNavEdges, outdoorNavNodes } from "../navigationGraph";
import {
  ENTRANCE_TRANSITION_EDGE_TYPE,
  entranceOutdoorLinkStatus,
  entranceIndoorLinkStatus,
  doorEntranceLinkStatus,
  doorDisplayName,
  indoorDoorOptionsForEntrance,
  linkEntranceToIndoorDoor,
  removeEntranceOutdoorConnection,
  reconcileEntranceTransitions,
  removeEntranceIndoorConnection,
  reconcileEntranceOutdoorConnections,
  reconcileEntranceDoors,
  entranceDoorPosition,
} from "../entranceTransitions";

function makeCampus(accessible = true): Campus {
  const doorNode = createIndoorNavNode({
    id: "door-node",
    x: 50,
    y: 20,
    campusId: "c1",
    buildingId: "b1",
    floorId: "f1",
    name: "Main Lobby Door",
    type: "hallway",
    doorId: "door-main",
  });
  return {
    id: "c1",
    name: "Campus",
    code: "C",
    description: "",
    address: "",
    city: "",
    province: "",
    postalCode: "",
    status: "active",
    publishStatus: "draft",
    visibleToStudents: false,
    features: { indoorNavigation: true, accessibilityNavigation: true, emergencyRoutes: true, issueReporting: true },
    canvasW: 400,
    canvasH: 300,
    settings: { accessibility: true, emergency: true, eventLayer: true, gps: true },
    buildings: [{
      id: "b1",
      name: "Main Building",
      code: "MB",
      category: "Academic",
      description: "",
      x: 100,
      y: 80,
      width: 120,
      height: 80,
      color: "#1e40af",
      entrances: [{ id: "ent-main", name: "Main Entrance", type: "general", edge: "bottom", offset: 0.5, accessible, isPrimary: true }],
      floors: [{
        id: "f1",
        buildingId: "b1",
        number: 1,
        label: "Ground Floor",
        rooms: [],
        paths: [],
        walls: [],
        doors: [{ id: "door-main", label: "Main Lobby Door", x: 50, y: 20, width: 20, direction: "left", color: "#b45309" }],
        windows: [],
        furniture: [],
        stairs: [],
        ramps: [],
        elevators: [],
        labels: [],
      }],
    }],
    markers: [],
    paths: [],
    navNodes: [doorNode],
    navEdges: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
}

const ids = (() => {
  let i = 0;
  return (prefix: string) => `${prefix}-${++i}`;
})();

describe("B5 Phase 4 - entrance transition graph", () => {
  it("reconciles one editable Ground-floor Door without inventing a walking edge", () => {
    const campus = makeCampus();
    const idsForTest = (() => { let i = 0; return (prefix: string) => `${prefix}-generated-${++i}`; })();
    const reconciled = reconcileEntranceDoors(campus, idsForTest);
    const floor = reconciled.buildings[0].floors[0];
    const generated = floor.doors.find((door) => door.buildingEntranceId === "ent-main");
    expect(generated).toMatchObject({ label: "Main Entrance Door", locked: false, x: 300, y: 450 });
    expect(reconciled.navNodes.filter((node) => node.buildingEntranceId === "ent-main")).toHaveLength(1);
    expect(reconciled.navEdges.filter((edge) => edge.type === ENTRANCE_TRANSITION_EDGE_TYPE)).toHaveLength(1);
    const twice = reconcileEntranceDoors(reconciled, idsForTest);
    expect(twice.buildings[0].floors[0].doors.filter((door) => door.buildingEntranceId === "ent-main")).toHaveLength(1);
    expect(entranceDoorPosition(floor, campus.buildings[0].entrances![0])).toEqual({ x: 300, y: 450 });
  });

  it("gives multiple generated entrance doors distinct identifiable labels", () => {
    const campus = makeCampus();
    campus.buildings[0].entrances = [
      ...campus.buildings[0].entrances!,
      { id: "ent-side", name: "Side Entrance", type: "general", edge: "top", offset: 0.25, accessible: true },
    ];
    let generatedId = 0;
    const reconciled = reconcileEntranceDoors(campus, (prefix) => `${prefix}-multi-${++generatedId}`);
    const generated = reconciled.buildings[0].floors[0].doors.filter((door) => door.buildingEntranceId);
    expect(generated).toHaveLength(2);
    expect(new Set(generated.map((door) => door.label)).size).toBe(2);
    expect(generated.map((door) => door.label)).toEqual(expect.arrayContaining(["Main Entrance Door", "Side Entrance Door"]));
  });

  it("keeps normalized perimeter offsets physical on reversed bottom/left walls without auto-linking the Door", () => {
    const campus = makeCampus();
    const floor = campus.buildings[0].floors[0];
    campus.buildings[0].entrances = [{ ...campus.buildings[0].entrances![0], offset: 0.25 }];
    floor.canvasW = 220;
    floor.canvasH = 160;
    floor.walls = [
      { id: "bottom", x1: 220, y1: 160, x2: 0, y2: 160, thickness: 6, color: "#64748b", managedKind: "perimeter", perimeterSide: "bottom" },
    ];
    campus.navNodes.push(createIndoorNavNode({ id: "hall", x: 100, y: 120, campusId: "c1", buildingId: "b1", floorId: "f1", type: "hallway", name: "Lobby" }));
    let generatedId = 0;
    const reconciled = reconcileEntranceDoors(campus, (prefix) => `${prefix}-new-${++generatedId}`);
    const generated = reconciled.buildings[0].floors[0].doors.find((door) => door.buildingEntranceId === "ent-main")!;
    expect(generated.x).toBe(55);
    expect(generated.y).toBe(160);
    const doorNode = reconciled.navNodes.find((node) => node.doorId === generated.id)!;
    expect(reconciled.navEdges.some((edge) => edge.type === "walkway" && (edge.startNodeId === doorNode.id || edge.endNodeId === doorNode.id))).toBe(false);
    expect(entranceIndoorLinkStatus(reconciled, "b1", "ent-main").doorNavigationConnected).toBe(false);
    expect(entranceDoorPosition(floor, campus.buildings[0].entrances![0])).toEqual({ x: 55, y: 160 });

    const leftCampus = makeCampus();
    leftCampus.buildings[0].entrances = [{ ...leftCampus.buildings[0].entrances![0], edge: "left", offset: 0.25 }];
    leftCampus.buildings[0].floors[0].canvasW = 220;
    leftCampus.buildings[0].floors[0].canvasH = 160;
    leftCampus.buildings[0].floors[0].walls = [
      { id: "left", x1: 0, y1: 160, x2: 0, y2: 0, thickness: 6, color: "#64748b", managedKind: "perimeter", perimeterSide: "left" },
    ];
    const left = reconcileEntranceDoors(leftCampus, (prefix) => `${prefix}-left-${++generatedId}`);
    expect(left.buildings[0].floors[0].doors.find((door) => door.buildingEntranceId === "ent-main")).toMatchObject({ x: 0, y: 40 });
  });

  it("removes only generated Door infrastructure when its Building Entrance is deleted", () => {
    const idsForTest = (() => { let i = 0; return (prefix: string) => `${prefix}-generated-${++i}`; })();
    const campus = reconcileEntranceDoors(makeCampus(), idsForTest);
    const building = campus.buildings[0];
    const withoutEntrance: Campus = { ...campus, buildings: [{ ...building, entrances: [] }] };
    const cleaned = reconcileEntranceDoors(withoutEntrance, idsForTest);
    expect(cleaned.buildings[0].floors[0].doors.some((door) => door.buildingEntranceId)).toBe(false);
    expect(cleaned.navNodes.some((node) => node.buildingEntranceId)).toBe(false);
    expect(cleaned.navEdges.some((edge) => edge.type === ENTRANCE_TRANSITION_EDGE_TYPE)).toBe(false);
    expect(cleaned.buildings[0].floors[0].doors.some((door) => door.id === "door-main")).toBe(true);
  });

  it("reports and removes an explicit outdoor Entrance bridge without touching the indoor link", () => {
    const campus = makeCampus();
    campus.navNodes.push({
      id: "entrance-node", x: 160, y: 160, campusId: "c1", buildingId: "b1", entranceId: "ent-main",
      name: "Main Entrance", type: "entrance", accessible: true, color: "#16a34a",
    });
    campus.navNodes.push({
      id: "outdoor-node", x: 150, y: 180, campusId: "c1", name: "Walking Point", type: "outdoor", accessible: true, color: "#16a34a",
    });
    campus.navEdges.push({
      id: "outdoor-bridge", startNodeId: "outdoor-node", endNodeId: "entrance-node", distance: 10,
      bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 4,
    });
    const linked = linkEntranceToIndoorDoor(campus, "b1", "ent-main", "door-node", ids);
    expect(entranceOutdoorLinkStatus(linked, "b1", "ent-main")).toMatchObject({
      state: "connected", edgeId: "outdoor-bridge", targetNodeId: "outdoor-node", targetName: "Walking Point",
    });
    const disconnected = removeEntranceOutdoorConnection(linked, "b1", "ent-main");
    expect(disconnected.navEdges.some((edge) => edge.id === "outdoor-bridge")).toBe(false);
    expect(disconnected.navEdges.some((edge) => edge.type === ENTRANCE_TRANSITION_EDGE_TYPE)).toBe(true);
  });

  it("preserves the shared outward connector bends when an outdoor bridge is reconciled", () => {
    const campus = makeCampus();
    campus.navNodes.push({
      id: "entrance-node", x: 160, y: 160, campusId: "c1", buildingId: "b1", entranceId: "ent-main",
      name: "Main Entrance", type: "entrance", accessible: true, color: "#16a34a",
    });
    campus.navNodes.push({
      id: "outdoor-node", x: 250, y: 200, campusId: "c1", name: "Walking Point", type: "outdoor", accessible: true, color: "#16a34a",
    });
    campus.navEdges.push({
      id: "outdoor-bridge", startNodeId: "entrance-node", endNodeId: "outdoor-node", distance: 0,
      bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 4,
    });
    const reconciled = reconcileEntranceOutdoorConnections(campus);
    const edge = reconciled.navEdges.find((candidate) => candidate.id === "outdoor-bridge");
    expect(edge?.bendPoints).toEqual([{ x: 160, y: 200 }]);
    expect(edge?.distance).toBe(130);
  });

  it("marks a linked Door incomplete until it has an indoor walking connection", () => {
    const campus = makeCampus();
    const linked = linkEntranceToIndoorDoor(campus, "b1", "ent-main", "door-node", ids);
    expect(entranceIndoorLinkStatus(linked, "b1", "ent-main")).toMatchObject({
      state: "linked", doorNavigationConnected: false, warning: "Connect the linked indoor Door to the indoor Walking Network.",
    });
    linked.navNodes.push(createIndoorNavNode({
      id: "indoor-waypoint", x: 80, y: 20, campusId: "c1", buildingId: "b1", floorId: "f1", name: "Lobby", type: "hallway",
    }));
    linked.navEdges.push({
      id: "door-walk", startNodeId: "door-node", endNodeId: "indoor-waypoint", distance: 30,
      bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 4,
    });
    expect(entranceIndoorLinkStatus(linked, "b1", "ent-main")).toMatchObject({
      state: "linked", doorNavigationConnected: true, warning: undefined,
    });
  });

  it("creates one outdoor entrance node and exactly one transition to an existing door node", () => {
    const linked = linkEntranceToIndoorDoor(makeCampus(), "b1", "ent-main", "door-node", ids);

    const entranceNodes = linked.navNodes.filter((n) => n.buildingId === "b1" && n.entranceId === "ent-main");
    expect(entranceNodes).toHaveLength(1);
    expect(entranceNodes[0]).toMatchObject({ type: "entrance", name: "Main Entrance", accessible: true });
    expect(linked.navEdges.filter((e) => e.type === ENTRANCE_TRANSITION_EDGE_TYPE)).toHaveLength(1);
    expect(entranceIndoorLinkStatus(linked, "b1", "ent-main")).toMatchObject({
      state: "linked",
      floorLabel: "Ground Floor",
      doorLabel: "Main Lobby Door",
    });
  });

  it("repeated linking reuses the same entrance node and does not duplicate transitions", () => {
    const once = linkEntranceToIndoorDoor(makeCampus(), "b1", "ent-main", "door-node", ids);
    const twice = linkEntranceToIndoorDoor(once, "b1", "ent-main", "door-node", ids);

    expect(twice.navNodes.filter((n) => n.entranceId === "ent-main")).toHaveLength(1);
    expect(twice.navEdges.filter((e) => e.type === ENTRANCE_TRANSITION_EDGE_TYPE)).toHaveLength(1);
  });

  it("changing doors removes the stale transition and preserves the physical entrance and doors", () => {
    const campus = makeCampus();
    const secondNode: NavigationNode = createIndoorNavNode({
      id: "door-node-2",
      x: 70,
      y: 20,
      campusId: "c1",
      buildingId: "b1",
      floorId: "f1",
      name: "East Door",
      type: "hallway",
      doorId: "door-east",
    });
    campus.buildings[0].floors[0].doors.push({ id: "door-east", label: "East Door", x: 70, y: 20, width: 20, direction: "left", color: "#b45309" });
    campus.navNodes.push(secondNode);

    const first = linkEntranceToIndoorDoor(campus, "b1", "ent-main", "door-node", ids);
    const originalEdgeId = first.navEdges.find((e) => e.type === ENTRANCE_TRANSITION_EDGE_TYPE)?.id;
    const changed = linkEntranceToIndoorDoor(first, "b1", "ent-main", "door-node-2", ids);

    expect(changed.navEdges.filter((e) => e.type === ENTRANCE_TRANSITION_EDGE_TYPE)).toHaveLength(1);
    expect(changed.navEdges.find((e) => e.type === ENTRANCE_TRANSITION_EDGE_TYPE)?.id).toBe(originalEdgeId);
    expect(entranceIndoorLinkStatus(changed, "b1", "ent-main")).toMatchObject({ doorId: "door-east" });
    expect(changed.buildings[0].entrances).toHaveLength(1);
    expect(changed.buildings[0].floors[0].doors.map((d) => d.id)).toEqual(["door-main", "door-east"]);
  });

  it("remove deletes only the transition edge", () => {
    const linked = linkEntranceToIndoorDoor(makeCampus(), "b1", "ent-main", "door-node", ids);
    const removed = removeEntranceIndoorConnection(linked, "b1", "ent-main");

    expect(removed.navEdges.filter((e) => e.type === ENTRANCE_TRANSITION_EDGE_TYPE)).toHaveLength(0);
    expect(removed.navNodes.find((n) => n.id === "door-node")).toBeTruthy();
    expect(removed.navNodes.find((n) => n.entranceId === "ent-main")).toBeTruthy();
    expect(removed.buildings[0].entrances).toHaveLength(1);
    expect(removed.buildings[0].floors[0].doors).toHaveLength(1);
  });

  it("uses entrance accessibility for the transition edge", () => {
    const accessible = linkEntranceToIndoorDoor(makeCampus(true), "b1", "ent-main", "door-node", ids);
    const inaccessible = linkEntranceToIndoorDoor(makeCampus(false), "b1", "ent-main", "door-node", ids);

    expect(accessible.navEdges.find((e) => e.type === ENTRANCE_TRANSITION_EDGE_TYPE)?.accessible).toBe(true);
    expect(inaccessible.navEdges.find((e) => e.type === ENTRANCE_TRANSITION_EDGE_TYPE)?.accessible).toBe(false);
  });

  it("reconciles deleted doors, missing endpoints, and duplicate transition edges", () => {
    const linked = linkEntranceToIndoorDoor(makeCampus(), "b1", "ent-main", "door-node", ids);
    const transition = linked.navEdges.find((e) => e.type === ENTRANCE_TRANSITION_EDGE_TYPE)!;
    const dirty: Campus = {
      ...linked,
      navEdges: [
        transition,
        { ...transition, id: "dupe" },
        { ...transition, id: "dangling", endNodeId: "missing" },
      ],
    };
    expect(reconcileEntranceTransitions(dirty).navEdges.filter((e) => e.type === ENTRANCE_TRANSITION_EDGE_TYPE)).toHaveLength(1);

    const withoutDoor: Campus = {
      ...linked,
      buildings: [{ ...linked.buildings[0], floors: [{ ...linked.buildings[0].floors[0], doors: [] }] }],
    };
    expect(reconcileEntranceTransitions(withoutDoor).navEdges.filter((e) => e.type === ENTRANCE_TRANSITION_EDGE_TYPE)).toHaveLength(0);
  });

  it("keeps transition edges out of outdoor and current-floor rendered scopes", () => {
    const linked = linkEntranceToIndoorDoor(makeCampus(), "b1", "ent-main", "door-node", ids);
    const outdoorNodes = outdoorNavNodes(linked.navNodes);
    const indoorNodes = indoorNavNodes(linked.navNodes, "b1", "f1");

    expect(outdoorNavEdges(linked.navEdges, outdoorNodes).map((e) => e.type)).not.toContain(ENTRANCE_TRANSITION_EDGE_TYPE);
    expect(indoorNavEdges(linked.navEdges, indoorNodes, "b1", "f1").map((e) => e.type)).not.toContain(ENTRANCE_TRANSITION_EDGE_TYPE);
  });

  it("door options prefer human labels and mark unlinked/conflicting doors", () => {
    const campus = linkEntranceToIndoorDoor(makeCampus(), "b1", "ent-main", "door-node", ids);
    campus.buildings[0].entrances!.push({ id: "ent-east", name: "East Entrance", type: "general", edge: "right", offset: 0.5, accessible: true });
    campus.buildings[0].floors[0].doors.push({ id: "door-unlinked", label: "Service Door", x: 80, y: 20, width: 20, direction: "left", color: "#b45309" });

    const options = indoorDoorOptionsForEntrance(campus, "b1", "ent-east");

    expect(options.map((o) => o.doorLabel)).toEqual(["Main Lobby Door", "Service Door"]);
    expect(options[0].usedByEntrance?.name).toBe("Main Entrance");
    expect(options[1]).toMatchObject({ linked: false, nodeId: undefined, eligible: false, ineligibleReason: "not_linked" });
  });

  it("keeps hidden connected doors linked but warns and marks hidden candidates ineligible", () => {
    const campus = makeCampus();
    campus.buildings[0].floors[0].doors[0].visible = false;
    const linked = linkEntranceToIndoorDoor(campus, "b1", "ent-main", "door-node", ids);

    expect(entranceIndoorLinkStatus(linked, "b1", "ent-main")).toMatchObject({
      state: "linked",
      hidden: true,
      warning: "Linked Door is hidden.",
    });
    expect(doorEntranceLinkStatus(linked, "b1", "f1", "door-main")).toMatchObject({
      state: "linked",
      hidden: true,
      warning: "Linked Door is hidden.",
    });
    expect(indoorDoorOptionsForEntrance(linked, "b1", "ent-main")[0]).toMatchObject({
      eligible: false,
      ineligibleReason: "hidden",
    });
  });

  it("uses stable readable fallback names for unnamed doors", () => {
    const campus = makeCampus();
    const floor = campus.buildings[0].floors[0];
    floor.doors.push({ id: "door-unnamed", x: 90, y: 20, width: 20, direction: "left", color: "#b45309" });

    expect(doorDisplayName(floor.doors[0], floor)).toBe("Main Lobby Door");
    expect(doorDisplayName(floor.doors[1], floor)).toBe("Door 2");
  });

  it("marks upper-floor doors ineligible and refuses wrong-floor links", () => {
    const campus = makeCampus();
    campus.buildings[0].floors.push({
      id: "f2",
      buildingId: "b1",
      number: 2,
      label: "Floor 2",
      rooms: [],
      paths: [],
      walls: [],
      doors: [{ id: "door-f2", label: "Floor 2 Side Door", x: 20, y: 20, width: 20, direction: "left", color: "#b45309" }],
      windows: [],
      furniture: [],
      stairs: [],
      ramps: [],
      elevators: [],
      labels: [],
    });
    campus.navNodes.push(createIndoorNavNode({
      id: "door-node-f2",
      x: 20,
      y: 20,
      campusId: "c1",
      buildingId: "b1",
      floorId: "f2",
      name: "Floor 2 Side Door",
      type: "hallway",
      doorId: "door-f2",
    }));

    const options = indoorDoorOptionsForEntrance(campus, "b1", "ent-main");
    expect(options.find((option) => option.doorId === "door-f2")).toMatchObject({
      entryFloor: false,
      eligible: false,
      ineligibleReason: "wrong_floor",
    });
    expect(linkEntranceToIndoorDoor(campus, "b1", "ent-main", "door-node-f2", ids)).toBe(campus);
  });

  it("recomputes entry-floor eligibility from canonical floor order after reorder", () => {
    const campus = makeCampus();
    campus.buildings[0].floors.push({
      id: "f3",
      buildingId: "b1",
      number: 3,
      label: "Floor 3",
      rooms: [],
      paths: [],
      walls: [],
      doors: [{ id: "door-f3", label: "Floor 3 Door", x: 20, y: 20, width: 20, direction: "left", color: "#b45309" }],
      windows: [],
      furniture: [],
      stairs: [],
      ramps: [],
      elevators: [],
      labels: [],
    });
    campus.navNodes.push(createIndoorNavNode({
      id: "door-node-f3",
      x: 20,
      y: 20,
      campusId: "c1",
      buildingId: "b1",
      floorId: "f3",
      name: "Floor 3 Door",
      type: "hallway",
      doorId: "door-f3",
    }));
    const linked = linkEntranceToIndoorDoor(campus, "b1", "ent-main", "door-node", ids);

    expect(entranceIndoorLinkStatus(linked, "b1", "ent-main")).toMatchObject({ state: "linked", entryFloor: true, doorNavigationConnected: false, warning: "Connect the linked indoor Door to the indoor Walking Network." });
    expect(indoorDoorOptionsForEntrance(linked, "b1", "ent-main").map((option) => ({
      floorId: option.floorId,
      doorId: option.doorId,
      eligible: option.eligible,
      entryFloor: option.entryFloor,
    }))).toEqual([
      { floorId: "f1", doorId: "door-main", eligible: true, entryFloor: true },
      { floorId: "f3", doorId: "door-f3", eligible: false, entryFloor: false },
    ]);

    const moved = moveFloorInBuilding(linked.buildings[0].floors, "f3", -1);
    const reordered: Campus = {
      ...linked,
      buildings: [{ ...linked.buildings[0], floors: moved.floors }],
    };

    expect(entranceIndoorLinkStatus(reordered, "b1", "ent-main")).toMatchObject({
      state: "linked",
      entryFloor: false,
      warning: "Connected door is no longer on the building entry floor.",
    });
    expect(doorEntranceLinkStatus(reordered, "b1", "f1", "door-main")).toMatchObject({
      state: "linked",
      warning: "Connected door is no longer on the building entry floor.",
    });
    expect(indoorDoorOptionsForEntrance(reordered, "b1", "ent-main").map((option) => ({
      floorId: option.floorId,
      doorId: option.doorId,
      eligible: option.eligible,
      entryFloor: option.entryFloor,
      reason: option.ineligibleReason,
    }))).toEqual([
      { floorId: "f3", doorId: "door-f3", eligible: true, entryFloor: true, reason: undefined },
      { floorId: "f1", doorId: "door-main", eligible: false, entryFloor: false, reason: "wrong_floor" },
    ]);

    const restoredFloors = moveFloorInBuilding(reordered.buildings[0].floors, "f3", 1).floors;
    const restored = {
      ...reordered,
      buildings: [{ ...reordered.buildings[0], floors: restoredFloors }],
    };
    expect(entranceIndoorLinkStatus(restored, "b1", "ent-main")).toMatchObject({ state: "linked", entryFloor: true, doorNavigationConnected: false, warning: "Connect the linked indoor Door to the indoor Walking Network." });
    expect(restored.navEdges.filter((edge) => edge.type === ENTRANCE_TRANSITION_EDGE_TYPE)).toHaveLength(1);
  });
});

import { describe, expect, it } from "vitest";
import { canonicalExteriorEmergencyStairsForBuilding, defaultExteriorEmergencyStairAttachment, syncExteriorEmergencyStairGraph, syncExteriorEmergencyStairOccurrences, exteriorEmergencyStairWorldPosition, exteriorEmergencyStairEdgeForPointer, exteriorEmergencyStairOffsetForPointer, exteriorEmergencyStairWallSpansOverlap, exteriorEmergencyStairRouteReadiness, pruneOrphanedExteriorEmergencyStairNodes } from "../exteriorEmergencyStairs";
import { findNavigationRoute } from "../pathfinding";
import type { Campus, CampusBuilding, FloorPlan, ExteriorEmergencyStair } from "../../components/map-builder/types";

const floor = (id: string, number: number): FloorPlan => ({
  id, buildingId: "b1", number, label: number === 1 ? "Ground Floor" : `Floor ${number}`,
  canvasW: 900, canvasH: 680, backgroundColor: "#fff", rooms: [], paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [],
} as FloorPlan);

const building = (stairs: ExteriorEmergencyStair[] = [], floors = [floor("f1", 1), floor("f2", 2), floor("f3", 3)]): CampusBuilding => ({
  id: "b1", name: "Main", code: "MAIN", category: "academic", description: "", x: 100, y: 100, width: 300, height: 220, color: "#123", floors, exteriorEmergencyStairs: stairs,
} as CampusBuilding);

const stair = (id: string, servedFloorIds = ["f1", "f2", "f3"]): ExteriorEmergencyStair => ({
  id, buildingId: "b1", label: `${id} Emergency Stair`, state: "open", width: 28, height: 42,
  attachment: { edge: "right", offset: 0.5 }, servedFloorIds, sharedId: `shared-${id}`, emergencySafe: true,
});

const campus = (b: CampusBuilding): Campus => ({
  id: "c1", name: "Campus", code: "C", description: "", address: "", city: "", province: "", postalCode: "", status: "active", publishStatus: "draft", visibleToStudents: false,
  features: { accessibilityNavigation: true, emergencyRoutes: true, issueReporting: true }, canvasW: 1200, canvasH: 800, settings: { accessibility: true, emergency: true, eventLayer: true, gps: false }, buildings: [b], markers: [], paths: [], navNodes: [], navEdges: [], createdAt: "", updatedAt: "",
});

describe("Exterior Emergency Stair authoring", () => {
  it("derives only explicitly served floor occurrences and keeps one shared identity", () => {
    const result = syncExteriorEmergencyStairOccurrences(building([stair("east", ["f1", "f3"]) ]));
    expect(result.floors.flatMap((f) => f.stairs).map((s) => s.exteriorEmergencyStairId)).toEqual(["east", "east"]);
    expect(result.floors[1].stairs).toHaveLength(0);
    expect(result.floors[0].stairs[0].sharedId).toBe("shared-east");
    expect(result.floors[1].stairs).toHaveLength(0);
  });

  it("keeps generated occurrence IDs stable across repeated reconciliation", () => {
    const first = syncExteriorEmergencyStairOccurrences(building([stair("east") ]));
    const second = syncExteriorEmergencyStairOccurrences(first);
    expect(second.floors.flatMap((f) => f.stairs).map((s) => s.id)).toEqual(first.floors.flatMap((f) => f.stairs).map((s) => s.id));
  });

  it("derives every served occurrence from one canonical owner attachment", () => {
    const initial = syncExteriorEmergencyStairOccurrences(building([stair("east")]));
    const moved = syncExteriorEmergencyStairOccurrences({
      ...initial,
      exteriorEmergencyStairs: [{ ...initial.exteriorEmergencyStairs![0], attachment: { edge: "right", offset: 0.4 } }],
    });
    const owner = moved.exteriorEmergencyStairs![0];
    expect(owner.attachment.offset).toBe(0.4);
    const occurrences = moved.floors.flatMap((candidate) => candidate.stairs)
      .filter((candidate) => candidate.exteriorEmergencyStairId === owner.id);
    expect(occurrences).toHaveLength(3);
    expect(occurrences.every((candidate) => candidate.attachment?.offset === 0.4)).toBe(true);
    expect(new Set(occurrences.map((candidate) => candidate.y))).toEqual(new Set([680 * 0.4 - 42 / 2]));
  });

  it("creates canonical floor nodes, adjacent transitions, and one outdoor discharge anchor", () => {
    const result = syncExteriorEmergencyStairGraph(campus(building([stair("east")] )));
    const owned = result.navNodes?.filter((n) => n.exteriorEmergencyStairId === "east") ?? [];
    expect(owned).toHaveLength(4);
    expect(owned.filter((n) => n.floorId)).toHaveLength(3);
    expect(owned.filter((n) => !n.floorId)).toHaveLength(1);
    const transitions = result.navEdges?.filter((e) => e.type === "floor_transition") ?? [];
    expect(transitions.length).toBeGreaterThanOrEqual(3);
    expect(transitions.every((e) => e.emergencySafe !== false)).toBe(true);
    const upper = owned.find((node) => node.floorId === "f3")!;
    const outdoor = owned.find((node) => !node.floorId)!;
    // The indoor landing anchor belongs on the building-facing perimeter side,
    // not at the ordinary interior-stair bottom edge.
    expect(upper.x).toBe(894);
    expect(upper.y).toBe(340);
    expect(findNavigationRoute(result.navNodes ?? [], result.navEdges ?? [], upper.id, outdoor.id, false, true)).not.toBeNull();
  });

  it("uses only configured served Floors and discharges at Ground", () => {
    const floors = [1, 2, 3, 4, 5].map((number) => floor(`f${number}`, number));
    const result = syncExteriorEmergencyStairGraph(campus(building([stair("east", ["f1", "f2", "f3", "f5"])], floors)));
    const owned = result.navNodes?.filter((node) => node.exteriorEmergencyStairId === "east") ?? [];
    expect(owned.filter((node) => node.floorId).map((node) => node.floorId)).toEqual(["f1", "f2", "f3", "f5"]);
    const transitions = result.navEdges?.filter((edge) => edge.type === "floor_transition") ?? [];
    expect(transitions.some((edge) => {
      const endpoints = [edge.startNodeId, edge.endNodeId].map((id) => owned.find((node) => node.id === id));
      return endpoints.some((node) => node?.floorId === "f3") && endpoints.some((node) => node?.floorId === "f5");
    })).toBe(true);
    const outdoor = owned.find((node) => !node.floorId);
    expect(outdoor).toBeDefined();
    expect(transitions.some((edge) => edge.startNodeId === outdoor!.id || edge.endNodeId === outdoor!.id)).toBe(true);
  });

  it("keeps the generated outdoor discharge target visible when Ground is not served", () => {
    const original = syncExteriorEmergencyStairGraph(campus(building([stair("east")] )));
    const result = syncExteriorEmergencyStairGraph({
      ...original,
      buildings: original.buildings.map((item) => ({
        ...item,
        exteriorEmergencyStairs: (item.exteriorEmergencyStairs ?? []).map((candidate) => ({ ...candidate, servedFloorIds: ["f2", "f3"] })),
      })),
    });
    const discharge = (result.navNodes ?? []).find((node) => node.exteriorEmergencyStairId === "east" && !node.floorId);
    expect(discharge).toBeDefined();
    expect(result.navEdges?.some((edge) => edge.startNodeId === discharge?.id || edge.endNodeId === discharge?.id)).toBe(false);
  });

  it("marks a closed exterior stair unavailable for emergency discharge", () => {
    const result = syncExteriorEmergencyStairGraph(campus(building([ { ...stair("east"), state: "closed" } ])));
    const owned = result.navNodes?.filter((n) => n.exteriorEmergencyStairId === "east") ?? [];
    const upper = owned.find((node) => node.floorId === "f3")!;
    const outdoor = owned.find((node) => !node.floorId)!;
    expect(result.navEdges?.filter((edge) => edge.type === "floor_transition").every((edge) => edge.emergencySafe === false)).toBe(true);
    expect(findNavigationRoute(result.navNodes ?? [], result.navEdges ?? [], upper.id, outdoor.id, false, true)).toBeNull();
  });

  it("canonicalizes legacy duplicate exterior stairs to one physical owner", () => {
    const result = syncExteriorEmergencyStairGraph(campus(building([stair("east"), stair("west")] )));
    expect(canonicalExteriorEmergencyStairsForBuilding(result.buildings[0]).map((item) => item.id)).toEqual(["east"]);
    expect(result.buildings[0].exteriorEmergencyStairs).toHaveLength(1);
    expect((result.navNodes ?? []).every((node) => node.exteriorEmergencyStairId !== "west")).toBe(true);
  });

  it("keeps generated discharge anchors isolated per Building", () => {
    const first = building([stair("east")]);
    const secondFloors = first.floors.map((item) => ({ ...item, id: `b2-${item.id}`, buildingId: "b2" }));
    const second: CampusBuilding = {
      ...first,
      id: "b2",
      name: "Second",
      code: "SECOND",
      x: 600,
      floors: secondFloors,
      // Deliberately reuse a legacy stair id to prove graph ownership is
      // scoped by Building rather than by the id alone.
      exteriorEmergencyStairs: [{ ...stair("east", secondFloors.map((item) => item.id)), buildingId: "b2" }],
    };
    const result = syncExteriorEmergencyStairGraph({ ...campus(first), buildings: [first, second] });
    const firstDischarge = result.navNodes?.find((node) => node.exteriorEmergencyStairId === "east" && !node.floorId);
    const secondDischarge = result.navNodes?.find((node) => node.exteriorEmergencyStairId === "east" && node.buildingId === "b2" && !node.floorId);
    expect(firstDischarge?.exteriorEmergencyStairId).toBe("east");
    expect(secondDischarge?.exteriorEmergencyStairId).toBe("east");
    expect(firstDischarge?.buildingId).toBe("b1");
    expect(secondDischarge?.buildingId).toBe("b2");
    expect(firstDischarge?.id).not.toBe(secondDischarge?.id);
    expect(result.navNodes?.filter((node) => node.exteriorEmergencyStairId === "east" && node.buildingId === "b1").length).toBe(4);
    expect(result.navNodes?.filter((node) => node.exteriorEmergencyStairId === "east" && node.buildingId === "b2").every((node) => node.buildingId === "b2")).toBe(true);
  });

  it("keeps a legacy discharge identity and authored edge when outdoorNodeId is missing", () => {
    const initial = syncExteriorEmergencyStairGraph(campus(building([stair("legacy")]))) ;
    const owner = initial.buildings[0].exteriorEmergencyStairs![0];
    const discharge = initial.navNodes!.find((node) => node.exteriorEmergencyStairId === owner.id && !node.floorId)!;
    const target = { id: "path-target", name: "Path target", type: "outdoor" as const, x: discharge.x + 120, y: discharge.y, accessible: true, color: "#16a34a" };
    const legacy: Campus = {
      ...initial,
      buildings: initial.buildings.map((item) => ({
        ...item,
        exteriorEmergencyStairs: item.exteriorEmergencyStairs!.map((candidate) => ({ ...candidate, outdoorNodeId: undefined })),
      })),
      navNodes: [...initial.navNodes!, target],
      navEdges: [...initial.navEdges!, { id: "authored-discharge-edge", startNodeId: discharge.id, endNodeId: target.id, distance: 120, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 4 }],
    };
    const reconciled = syncExteriorEmergencyStairGraph(legacy);
    const nextDischarge = reconciled.navNodes!.find((node) => node.exteriorEmergencyStairId === owner.id && !node.floorId)!;
    expect(nextDischarge.id).toBe(discharge.id);
    expect(reconciled.buildings[0].exteriorEmergencyStairs![0].outdoorNodeId).toBe(discharge.id);
    expect(reconciled.navEdges!.some((edge) => edge.id === "authored-discharge-edge"
      && edge.startNodeId === discharge.id && edge.endNodeId === target.id)).toBe(true);
    expect(reconciled.navNodes!.filter((node) => node.exteriorEmergencyStairId === owner.id && !node.floorId)).toHaveLength(1);
  });

  it("finds a free default side when the preferred wall midpoint is occupied", () => {
    const preferredEntrance = { id: "e1", buildingId: "b1", edge: "right" as const, offset: 0.5, type: "general" as const };
    const candidate = defaultExteriorEmergencyStairAttachment({ ...building(), entrances: [preferredEntrance] });
    expect(candidate).not.toBeNull();
    expect(candidate).not.toMatchObject({ edge: "right", offset: 0.5 });
  });

  it("removes derived landings and nodes when the authored stair is removed", () => {
    const original = syncExteriorEmergencyStairGraph(campus(building([stair("east")])));
    const removed = syncExteriorEmergencyStairGraph({ ...original, buildings: original.buildings.map((b) => ({ ...b, exteriorEmergencyStairs: [] })) });
    expect(removed.buildings[0].floors.flatMap((f) => f.stairs).some((s) => s.exteriorEmergencyStairId)).toBe(false);
    expect((removed.navNodes ?? []).some((n) => n.exteriorEmergencyStairId)).toBe(false);
  });

  it("prunes generated stair nodes and incident edges when their Building is deleted", () => {
    const first = syncExteriorEmergencyStairGraph(campus(building([stair("east")]))) ;
    const survivingBuilding = { ...building([stair("east")]), id: "b2", floors: building([stair("east")]).floors.map((item) => ({ ...item, id: `b2-${item.id}`, buildingId: "b2" })) };
    const surviving = syncExteriorEmergencyStairGraph({ ...first, buildings: [first.buildings[0], survivingBuilding] });
    const removedOwnerNodes = surviving.navNodes!.filter((node) => node.exteriorEmergencyStairId === "east" && node.buildingId === "b1");
    const survivingOwnerNodes = surviving.navNodes!.filter((node) => node.exteriorEmergencyStairId === "east" && node.buildingId === "b2");
    const authoredEdge = { id: "stair-owned", startNodeId: removedOwnerNodes[0].id, endNodeId: "outside", distance: 10, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 3 } as const;
    const unrelatedNode = { id: "outside", name: "Outside", type: "outdoor" as const, x: 20, y: 20, accessible: true };
    const result = pruneOrphanedExteriorEmergencyStairNodes(
      [survivingBuilding],
      [...surviving.navNodes!, unrelatedNode],
      [...surviving.navEdges!, authoredEdge],
    );
    expect(result.nodes.some((node) => node.buildingId === "b1" && node.exteriorEmergencyStairId === "east")).toBe(false);
    expect(result.edges.some((edge) => edge.id === "stair-owned")).toBe(false);
    expect(result.nodes.filter((node) => node.buildingId === "b2" && node.exteriorEmergencyStairId === "east")).toHaveLength(survivingOwnerNodes.length);
    expect(result.nodes.some((node) => node.id === "outside")).toBe(true);
  });

  it("keeps the generated discharge target when no floor is served, without transitions", () => {
    const original = syncExteriorEmergencyStairGraph(campus(building([stair("east")] )));
    const noStops = syncExteriorEmergencyStairGraph({
      ...original,
      buildings: original.buildings.map((b) => ({
        ...b,
        exteriorEmergencyStairs: (b.exteriorEmergencyStairs ?? []).map((item) => ({ ...item, servedFloorIds: [] })),
      })),
    });
    const discharge = (noStops.navNodes ?? []).find((node) => node.exteriorEmergencyStairId === "east" && !node.floorId);
    expect(discharge).toBeDefined();
    expect(noStops.navEdges?.some((edge) => edge.startNodeId === discharge?.id || edge.endNodeId === discharge?.id)).toBe(false);
  });

  it("preserves and restores authored local Floor connections when a Floor is temporarily unserved", () => {
    const initial = syncExteriorEmergencyStairGraph(campus(building([stair("east")] )));
    const owner = initial.buildings[0].exteriorEmergencyStairs![0];
    const occurrences = initial.navNodes!.filter((node) => node.exteriorEmergencyStairId === owner.id && node.floorId);
    const localEdges = occurrences.map((occurrence) => ({
      id: `local-${occurrence.floorId}`,
      startNodeId: occurrence.id,
      endNodeId: `wp-${occurrence.floorId}`,
      distance: 10,
      bidirectional: true,
      accessible: true,
      emergencySafe: true,
      type: "hallway",
      color: "#2563eb",
      width: 3,
    }));
    const withTargets: Campus = {
      ...initial,
      navNodes: [...(initial.navNodes ?? []), ...occurrences.map((occurrence) => ({
        id: `wp-${occurrence.floorId}`, name: `WP ${occurrence.floorId}`, type: "hallway" as const,
        x: occurrence.x + 20, y: occurrence.y, buildingId: "b1", floorId: occurrence.floorId, accessible: true, color: "#2563eb",
      }))],
      navEdges: [...(initial.navEdges ?? []), ...localEdges],
    };
    const unserved = syncExteriorEmergencyStairGraph({
      ...withTargets,
      buildings: withTargets.buildings.map((item) => ({
        ...item,
        exteriorEmergencyStairs: item.exteriorEmergencyStairs!.map((candidate) => ({ ...candidate, servedFloorIds: ["f1", "f3"] })),
      })),
    });
    expect(unserved.buildings[0].exteriorEmergencyStairs![0].floorConnectionSnapshots?.f2).toHaveLength(1);
    expect(unserved.navEdges?.some((edge) => edge.id === "local-f2")).toBe(false);
    const restored = syncExteriorEmergencyStairGraph({
      ...unserved,
      buildings: unserved.buildings.map((item) => ({
        ...item,
        exteriorEmergencyStairs: item.exteriorEmergencyStairs!.map((candidate) => ({ ...candidate, servedFloorIds: ["f1", "f2", "f3"] })),
      })),
    });
    expect(restored.navEdges?.some((edge) => edge.id === "local-f2")).toBe(true);
  });

  it("does not restore a snapshot whose target node was deleted while unserved", () => {
    const initial = syncExteriorEmergencyStairGraph(campus(building([stair("east")] )));
    const owner = initial.buildings[0].exteriorEmergencyStairs![0];
    const occurrence = initial.navNodes!.find((node) => node.exteriorEmergencyStairId === owner.id && node.floorId === "f2")!;
    const withTarget: Campus = {
      ...initial,
      navNodes: [...(initial.navNodes ?? []), { id: "wp-f2", name: "WP f2", type: "hallway", x: 2, y: 2, buildingId: "b1", floorId: "f2", accessible: true, color: "#2563eb" }],
      navEdges: [...(initial.navEdges ?? []), { id: "local-f2", startNodeId: occurrence.id, endNodeId: "wp-f2", distance: 10, bidirectional: true, accessible: true, emergencySafe: true, type: "hallway", color: "#2563eb", width: 3 }],
    };
    const unserved = syncExteriorEmergencyStairGraph({
      ...withTarget,
      buildings: withTarget.buildings.map((item) => ({ ...item, exteriorEmergencyStairs: item.exteriorEmergencyStairs!.map((candidate) => ({ ...candidate, servedFloorIds: ["f1", "f3"] })) })),
    });
    const deletedTarget = { ...unserved, navNodes: unserved.navNodes!.filter((node) => node.id !== "wp-f2") };
    const restored = syncExteriorEmergencyStairGraph({
      ...deletedTarget,
      buildings: deletedTarget.buildings.map((item) => ({ ...item, exteriorEmergencyStairs: item.exteriorEmergencyStairs!.map((candidate) => ({ ...candidate, servedFloorIds: ["f1", "f2", "f3"] })) })),
    });
    expect(restored.navEdges?.some((edge) => edge.id === "local-f2")).toBe(false);
    expect(restored.buildings[0].exteriorEmergencyStairs![0].floorConnectionSnapshots?.f2).toBeUndefined();
  });

  it("requires a connected Ground discharge into the outdoor Walking Network", () => {
    const initial = syncExteriorEmergencyStairGraph(campus(building([stair("east")] )));
    const owner = initial.buildings[0].exteriorEmergencyStairs![0];
    const stairNodes = initial.navNodes!.filter((node) => node.exteriorEmergencyStairId === owner.id && node.floorId);
    const outdoor = initial.navNodes!.find((node) => node.exteriorEmergencyStairId === owner.id && !node.floorId)!;
    const local = stairNodes.map((node) => ({ id: `local-${node.floorId}`, startNodeId: node.id, endNodeId: `wp-${node.floorId}`, distance: 10, bidirectional: true, accessible: true, emergencySafe: true, type: "hallway", color: "#2563eb", width: 3 }));
    const nodes = [...(initial.navNodes ?? []), ...stairNodes.map((node) => ({ id: `wp-${node.floorId}`, name: "WP", type: "hallway" as const, x: node.x + 20, y: node.y, buildingId: "b1", floorId: node.floorId, accessible: true, color: "#2563eb" })), { id: "outdoor-wp", name: "Outdoor WP", type: "outdoor" as const, x: outdoor.x + 40, y: outdoor.y, accessible: true, color: "#16a34a" }];
    const edges = [...(initial.navEdges ?? []), ...local];
    const incomplete = exteriorEmergencyStairRouteReadiness(initial.buildings[0], owner, nodes, edges);
    expect(incomplete.ready).toBe(false);
    expect(incomplete.issue).toContain("Ground discharge");
    const complete = exteriorEmergencyStairRouteReadiness(initial.buildings[0], owner, nodes, [...edges, { id: "outdoor-discharge", startNodeId: outdoor.id, endNodeId: "outdoor-wp", distance: 20, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 3 }]);
    expect(complete.ready).toBe(true);
  });

  it("keeps the attached outdoor anchor outside the building perimeter", () => {
    const b = building([stair("east")]);
    const pos = exteriorEmergencyStairWorldPosition(b, b.exteriorEmergencyStairs![0]);
    expect(pos.x).toBeGreaterThan(b.x + b.width);
  });

  it("previews a side switch after a clear outside or near-edge crossing", () => {
    expect(exteriorEmergencyStairEdgeForPointer({ x: 920, y: 340 }, { width: 900, height: 680 }, "right")).toBe("right");
    expect(exteriorEmergencyStairEdgeForPointer({ x: 450, y: -40 }, { width: 900, height: 680 }, "right")).toBe("top");
    expect(exteriorEmergencyStairEdgeForPointer({ x: 450, y: 12 }, { width: 900, height: 680 }, "right")).toBe("top");
    expect(exteriorEmergencyStairOffsetForPointer({ x: 450, y: -40 }, { width: 900, height: 680 }, "top")).toBe(0.5);
  });

  it("keeps the current side in each corner dead-zone and switches once clearly crossed", () => {
    const bounds = { width: 100, height: 100 };
    expect(exteriorEmergencyStairEdgeForPointer({ x: 90, y: 10 }, bounds, "right")).toBe("right");
    expect(exteriorEmergencyStairEdgeForPointer({ x: 90, y: 0 }, bounds, "right")).toBe("top");
    expect(exteriorEmergencyStairEdgeForPointer({ x: 90, y: 90 }, bounds, "bottom")).toBe("bottom");
    expect(exteriorEmergencyStairEdgeForPointer({ x: 100, y: 90 }, bounds, "bottom")).toBe("right");
    expect(exteriorEmergencyStairEdgeForPointer({ x: 90, y: 100 }, bounds, "right")).toBe("bottom");
    expect(exteriorEmergencyStairEdgeForPointer({ x: 0, y: 90 }, bounds, "bottom")).toBe("left");
    expect(exteriorEmergencyStairEdgeForPointer({ x: 10, y: 10 }, bounds, "left")).toBe("left");
    expect(exteriorEmergencyStairEdgeForPointer({ x: 10, y: 0 }, bounds, "left")).toBe("top");
    expect(exteriorEmergencyStairEdgeForPointer({ x: 10, y: 10 }, bounds, "top")).toBe("top");
    expect(exteriorEmergencyStairEdgeForPointer({ x: 0, y: 10 }, bounds, "top")).toBe("left");
    expect(exteriorEmergencyStairEdgeForPointer({ x: 100, y: 10 }, bounds, "top")).toBe("right");
    expect(exteriorEmergencyStairEdgeForPointer({ x: 10, y: 100 }, bounds, "left")).toBe("bottom");
    // Pointer samples oscillating on the exact North/East corner remain on
    // the side that owns the gesture instead of alternating every frame.
    expect(exteriorEmergencyStairEdgeForPointer({ x: 90, y: 10 }, bounds, "right")).toBe("right");
    expect(exteriorEmergencyStairEdgeForPointer({ x: 90, y: 10 }, bounds, "right")).toBe("right");
  });

  it("detects size-aware wall-span collisions", () => {
    expect(exteriorEmergencyStairWallSpansOverlap(0.5, 80, 0.55, 24, 680)).toBe(true);
    expect(exteriorEmergencyStairWallSpansOverlap(0.1, 50, 0.8, 24, 680)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import type { AssemblyPoint, Campus, NavigationEdge, NavigationNode } from "../../components/map-builder/types";
import { analyzeEmergencyOutdoorConnectivity } from "../emergencyOutdoorConnectivity";

const point: AssemblyPoint = {
  id: "assembly", name: "Assembly", x: 0, y: 0, campusId: "campus", navNodeId: "assembly-node",
};
const node = (id: string, x: number, refs: Partial<NavigationNode> = {}): NavigationNode => ({
  id, name: id, type: "outdoor", x, y: 0, accessible: true, campusId: "campus", color: "#16a34a", ...refs,
});
const edge = (id: string, startNodeId: string, endNodeId: string, refs: Partial<NavigationEdge> = {}): NavigationEdge => ({
  id, startNodeId, endNodeId, distance: 10, bidirectional: true, accessible: true, emergencySafe: true,
  type: "outdoor", color: "#16a34a", width: 3, ...refs,
});
const campus = (navNodes: NavigationNode[], navEdges: NavigationEdge[]): Campus => ({
  id: "campus", name: "Campus", code: "TEST", description: "", address: "", city: "", province: "", postalCode: "",
  status: "active", publishStatus: "published", visibleToStudents: true,
  features: { indoorNavigation: true, accessibilityNavigation: true, emergencyRoutes: true, issueReporting: false },
  canvasW: 300, canvasH: 200, buildings: [], paths: [], markers: [], decorAssets: [], assemblyPoints: [point],
  navNodes, navEdges,
} as unknown as Campus);

describe("analyzeEmergencyOutdoorConnectivity", () => {
  it("recognizes an Assembly Point in the only emergency-eligible outdoor component", () => {
    const result = analyzeEmergencyOutdoorConnectivity(campus([
      node("assembly-node", 0, { type: "assembly", assemblyPointId: "assembly" }), node("walkway", 10), node("main", 20),
    ], [edge("a", "assembly-node", "walkway"), edge("b", "walkway", "main")]), point);

    expect(result.state).toBe("connected");
    expect(result.assemblyComponent.nodeIds).toHaveLength(3);
    expect(result.mainComponent.nodeIds).toContain("main");
  });

  it("reports the actual largest campus component when the Assembly Point is already in it", () => {
    const result = analyzeEmergencyOutdoorConnectivity(campus([
      node("assembly-node", 0, { type: "assembly", assemblyPointId: "assembly" }),
      node("campus-a", 10), node("campus-b", 20), node("campus-c", 30),
      node("isolated-a", 200), node("isolated-b", 210),
    ], [
      edge("assembly-link", "assembly-node", "campus-a"),
      edge("campus-link-a", "campus-a", "campus-b"),
      edge("campus-link-b", "campus-b", "campus-c"),
      edge("isolated-link", "isolated-a", "isolated-b"),
    ]), point);

    expect(result.state).toBe("connected");
    expect(new Set(result.assemblyComponent.nodeIds)).toEqual(new Set(["assembly-node", "campus-a", "campus-b", "campus-c"]));
    expect(new Set(result.mainComponent.nodeIds)).toEqual(new Set(result.assemblyComponent.nodeIds));
    expect(result.nearestGap).toBeUndefined();
  });

  it("keeps the largest separate campus component as the connection target when the Assembly Point is isolated", () => {
    const result = analyzeEmergencyOutdoorConnectivity(campus([
      node("assembly-node", 0, { type: "assembly", assemblyPointId: "assembly" }), node("assembly-local", 10),
      node("campus-a", 100), node("campus-b", 110), node("campus-c", 120),
    ], [
      edge("assembly-link", "assembly-node", "assembly-local"),
      edge("campus-link-a", "campus-a", "campus-b"),
      edge("campus-link-b", "campus-b", "campus-c"),
    ]), point);

    expect(result.state).toBe("disconnected");
    expect(new Set(result.mainComponent.nodeIds)).toEqual(new Set(["campus-a", "campus-b", "campus-c"]));
    expect(result.nearestGap).toMatchObject({ assemblyNodeId: "assembly-local", networkNodeId: "campus-a" });
  });

  it("reports a physically disconnected Assembly Point and the nearest existing graph-node pair", () => {
    const result = analyzeEmergencyOutdoorConnectivity(campus([
      node("assembly-node", 0, { type: "assembly", assemblyPointId: "assembly" }), node("local", 10),
      node("campus-endpoint", 100), node("campus-main", 120),
    ], [edge("local-link", "assembly-node", "local"), edge("main-link", "campus-endpoint", "campus-main")]), point);

    expect(result.state).toBe("disconnected");
    expect(result.nearestGap).toMatchObject({ assemblyNodeId: "local", networkNodeId: "campus-endpoint", distance: 90 });
    expect(result.nextAction).toContain("author the missing physical connection");
  });

  it("identifies an authored but emergency-ineligible outdoor edge without treating it as usable", () => {
    const result = analyzeEmergencyOutdoorConnectivity(campus([
      node("assembly-node", 0, { type: "assembly", assemblyPointId: "assembly" }), node("walkway", 10), node("main", 20),
    ], [edge("blocked-link", "assembly-node", "walkway", { emergencySafe: false }), edge("main-link", "walkway", "main")]), point);

    expect(result.state).toBe("blocked");
    expect(result.blockedEdges).toContainEqual(expect.objectContaining({
      edgeId: "blocked-link", reason: "This authored connection is not designated for emergency use.",
    }));
  });

  it("keeps a connection marked with an emergency hazard out of the eligible component", () => {
    const result = analyzeEmergencyOutdoorConnectivity(campus([
      node("assembly-node", 0, { type: "assembly", assemblyPointId: "assembly" }), node("walkway", 10), node("main", 20),
    ], [
      edge("hazard-link", "assembly-node", "walkway", { emergencyReason: "hazard" }),
      edge("main-link", "walkway", "main"),
    ]), point);

    expect(result.state).toBe("blocked");
    expect(result.assemblyComponent.nodeIds).toEqual(["assembly-node"]);
    expect(result.blockedEdges).toContainEqual(expect.objectContaining({
      edgeId: "hazard-link", reason: "This authored connection is marked unsafe for emergency use.",
    }));
  });

  it("rejects a missing or mismatched Assembly Point anchor", () => {
    const result = analyzeEmergencyOutdoorConnectivity(campus([
      node("assembly-node", 0, { type: "assembly", assemblyPointId: "another-point" }),
    ], []), point);

    expect(result.state).toBe("invalid_anchor");
    expect(result.nextAction).toContain("Restore or reconnect");
  });
});

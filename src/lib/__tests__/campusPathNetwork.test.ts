import { describe, expect, it } from "vitest";
import type { CampusPath, NavigationEdge, NavigationNode } from "../../components/map-builder/types";
import {
  editorPathRenderMode,
  isPathwayGeneratedEdge,
  isPathwayGeneratedNode,
  movePathMemberPreservingJunctions,
  navigationEdgePermissions,
  navigationNodePermissions,
  pathIsPubliclyVisible,
  pathNetworkNavigationStatus,
  pathNetworkSelectionIds,
  shouldRenderPathwayAuthoringPreview,
} from "../campusPathNetwork";

const path = (id: string, points: { x: number; y: number }[], overrides: Partial<CampusPath> = {}): CampusPath => ({
  id,
  points,
  type: "walkway",
  color: "#94a3b8",
  width: 10,
  ...overrides,
});

describe("campus physical Path Network UX helpers", () => {
  const grouped = [
    path("a", [{ x: 0, y: 0 }, { x: 100, y: 0 }], { pathNetworkId: "network" }),
    path("b", [{ x: 100, y: 0 }, { x: 100, y: 100 }], { pathNetworkId: "network" }),
  ];

  it("uses the whole explicit network for first-click selection", () => {
    expect(pathNetworkSelectionIds(grouped, "a", "network")).toEqual(["a", "b"]);
  });

  it("uses only the double-clicked member in individual edit mode", () => {
    expect(pathNetworkSelectionIds(grouped, "a", "member")).toEqual(["a"]);
  });

  it("moves one member body without rigidly translating the other member", () => {
    const origins = new Map(grouped.map((candidate) => [candidate.id, structuredClone(candidate.points)]));
    const moved = movePathMemberPreservingJunctions(grouped, "a", origins, 20, 30);
    expect(moved.find((candidate) => candidate.id === "a")?.points).toEqual([
      { x: 20, y: 30 },
      { x: 120, y: 30 },
    ]);
    expect(moved.find((candidate) => candidate.id === "b")?.points).toEqual([
      { x: 120, y: 30 },
      { x: 100, y: 100 },
    ]);
  });

  it("does not move an explicitly disconnected coincident point", () => {
    const disconnected = [
      grouped[0],
      { ...grouped[1], disconnectedJunctionKeys: ["100:0"] },
    ];
    const origins = new Map(disconnected.map((candidate) => [candidate.id, structuredClone(candidate.points)]));
    const moved = movePathMemberPreservingJunctions(disconnected, "a", origins, 20, 30);
    expect(moved[1].points).toEqual(grouped[1].points);
  });

  it("distinguishes generated Walking Points from manual Walking Points", () => {
    const generated: NavigationNode = {
      id: "generated", name: "Walking Point", type: "outdoor", x: 0, y: 0, accessible: true, color: "#16a34a",
      generatedFromPathVertices: [{ pathId: "a", vertexId: "a0" }],
    };
    const manual: NavigationNode = { ...generated, id: "manual", generatedFromPathVertices: undefined };
    expect(isPathwayGeneratedNode(generated)).toBe(true);
    expect(isPathwayGeneratedNode(manual)).toBe(false);
    expect(navigationNodePermissions(generated)).toEqual({ geometryEditable: false, independentlyDeletable: false });
    expect(navigationNodePermissions(manual)).toEqual({ geometryEditable: true, independentlyDeletable: true });
  });

  it("distinguishes geometry-locked generated Walking Paths from editable manual paths", () => {
    const generated: NavigationEdge = {
      id: "generated-edge", startNodeId: "a", endNodeId: "b", distance: 100,
      accessible: true, emergencySafe: true, bidirectional: true, generatedFromPathIds: ["a"],
    };
    const manual: NavigationEdge = { ...generated, id: "manual-edge", generatedFromPathIds: undefined };
    expect(isPathwayGeneratedEdge(generated)).toBe(true);
    expect(isPathwayGeneratedEdge(manual)).toBe(false);
    expect(navigationEdgePermissions(generated)).toEqual({ geometryEditable: false, independentlyDeletable: false });
    expect(navigationEdgePermissions(manual)).toEqual({ geometryEditable: true, independentlyDeletable: true });
  });

  it("keeps physical Pathway authoring preview visible with Navigation OFF or ON", () => {
    expect(shouldRenderPathwayAuthoringPreview(true, false)).toBe(true);
    expect(shouldRenderPathwayAuthoringPreview(true, true)).toBe(true);
    expect(shouldRenderPathwayAuthoringPreview(false, true)).toBe(false);
  });

  it("reports 0/N Pathways enabled from explicit ownership", () => {
    expect(pathNetworkNavigationStatus(grouped)).toEqual({
      total: 2, enabled: 0, missingPathIds: ["a", "b"], state: "none",
    });
  });

  it("reports M/N Pathways enabled and identifies only missing members", () => {
    const partial = [{ ...grouped[0], navigationVertexIds: ["a0", "a1"] }, grouped[1]];
    expect(pathNetworkNavigationStatus(partial)).toEqual({
      total: 2, enabled: 1, missingPathIds: ["b"], state: "partial",
    });
  });

  it("reports N/N Pathways enabled without a missing action", () => {
    const complete = [
      { ...grouped[0], navigationVertexIds: ["a0", "a1"] },
      { ...grouped[1], navigationVertexIds: ["b0", "b1"] },
    ];
    expect(pathNetworkNavigationStatus(complete)).toEqual({
      total: 2, enabled: 2, missingPathIds: [], state: "complete",
    });
  });

  it("treats a newly joined physical branch as missing until explicitly enabled", () => {
    const branched = [
      { ...grouped[0], navigationVertexIds: ["a0", "a1"] },
      { ...grouped[1], navigationVertexIds: ["b0", "b1"] },
      path("branch", [{ x: 100, y: 0 }, { x: 180, y: 60 }], { pathNetworkId: "network" }),
    ];
    expect(pathNetworkNavigationStatus(branched)).toEqual({
      total: 3, enabled: 2, missingPathIds: ["branch"], state: "partial",
    });
  });

  it("keeps hidden Pathways ghosted in the editor and excluded publicly", () => {
    const hidden = path("hidden", [{ x: 0, y: 0 }, { x: 100, y: 0 }], { visible: false });
    expect(editorPathRenderMode(hidden)).toBe("ghost");
    expect(pathIsPubliclyVisible(hidden)).toBe(false);
    expect(editorPathRenderMode(grouped[0])).toBe("normal");
    expect(pathIsPubliclyVisible(grouped[0])).toBe(true);
  });
});

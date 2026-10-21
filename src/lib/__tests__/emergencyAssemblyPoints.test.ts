import { describe, expect, it } from "vitest";
import type { AssemblyPoint, Campus, NavigationEdge, NavigationNode } from "../../components/map-builder/types";
import {
  assemblyPointReviewFingerprint,
  assemblyPointValidation,
  assignedPrimaryAssemblyPoint,
  campusWidePrimaryAssemblyPoint,
  hasEmergencyAssemblyPointConfiguredForBuilding,
  isAssemblyPointAssignedForBuilding,
  isAssemblyPointApprovedForBuilding,
  resolvedAssemblyPointsForBuilding,
  removeEmergencyAssemblyPoint,
  syncEmergencyAssemblyPointNavigation,
  syncEmergencyAssemblyPointPositionsFromNavigation,
} from "../emergencyAssemblyPoints";

const node = (id: string, x: number, y: number, refs: Partial<NavigationNode> = {}): NavigationNode => ({
  id, name: id, type: "outdoor", x, y, campusId: "campus", accessible: true, color: "#16a34a", ...refs,
});
const edge = (id: string, startNodeId: string, endNodeId: string, refs: Partial<NavigationEdge> = {}): NavigationEdge => ({
  id, startNodeId, endNodeId, distance: 10, bidirectional: true, accessible: true, emergencySafe: true,
  type: "outdoor", color: "#16a34a", width: 3, ...refs,
});
const point = (refs: Partial<AssemblyPoint> = {}): AssemblyPoint => ({
  id: "assembly-a", name: "Main Assembly Point A", x: 120, y: 120, campusId: "campus", navNodeId: "assembly-node",
  buildingAssignments: [{ buildingId: "building-a", designation: "primary" }], ...refs,
});
const campus = (overrides: Partial<Campus> = {}): Campus => ({
  id: "campus", name: "Test Campus", code: "TEST", description: "", address: "", city: "", province: "", postalCode: "",
  status: "active", publishStatus: "published", visibleToStudents: true,
  features: { indoorNavigation: true, accessibilityNavigation: true, emergencyRoutes: true, issueReporting: false },
  canvasW: 400, canvasH: 300,
  buildings: [{ id: "building-a", name: "Building A", code: "A", category: "academic", x: 0, y: 0, width: 40, height: 40, floors: [] } as unknown as Campus["buildings"][number]],
  paths: [], markers: [], decorAssets: [], assemblyPoints: [point()],
  navNodes: [node("assembly-node", 120, 120, { type: "assembly", assemblyPointId: "assembly-a" }), node("path-node", 170, 120)],
  navEdges: [edge("connection", "assembly-node", "path-node")],
  ...overrides,
} as Campus);

describe("Emergency Assembly Point graph and review lifecycle", () => {
  it("inherits a single explicit campus Primary while preserving a building Primary override", () => {
    const primary = point({ campusWidePrimary: true, buildingAssignments: [] });
    const override = point({
      id: "assembly-override",
      name: "Building Override",
      x: 250,
      y: 170,
      navNodeId: "override-node",
      buildingAssignments: [{ buildingId: "building-b", designation: "primary" }],
    });
    const buildingB = { id: "building-b", name: "Building B", code: "B", category: "academic", x: 200, y: 0, width: 40, height: 40, floors: [] } as unknown as Campus["buildings"][number];
    const resolved = campus({
      buildings: [...campus().buildings, buildingB],
      assemblyPoints: [primary, override],
      navNodes: [
        node("assembly-node", primary.x, primary.y, { type: "assembly", assemblyPointId: primary.id }),
        node("path-node", 170, 120),
        node("override-node", override.x, override.y, { type: "assembly", assemblyPointId: override.id }),
      ],
      navEdges: [edge("connection", "assembly-node", "path-node"), edge("override-connection", "override-node", "path-node")],
    });

    expect(campusWidePrimaryAssemblyPoint(resolved)?.id).toBe(primary.id);
    expect(assignedPrimaryAssemblyPoint(resolved, "building-a")?.id).toBe(primary.id);
    expect(assignedPrimaryAssemblyPoint(resolved, "building-b")?.id).toBe(override.id);
    expect(resolvedAssemblyPointsForBuilding(resolved, "building-a").map(({ point: resolvedPoint }) => resolvedPoint.id)).toEqual([primary.id]);
    expect(hasEmergencyAssemblyPointConfiguredForBuilding(resolved, "building-a")).toBe(true);
    expect(primary.buildingAssignments).toEqual([]);
    expect(override.buildingAssignments).toEqual([{ buildingId: "building-b", designation: "primary" }]);
  });

  it("does not guess between multiple campus-wide Primary designations", () => {
    const first = point({ campusWidePrimary: true, buildingAssignments: [] });
    const second = point({
      id: "assembly-b", name: "Second Primary", campusWidePrimary: true, x: 250, y: 170, navNodeId: "assembly-node-b", buildingAssignments: [],
    });
    const conflicted = campus({
      assemblyPoints: [first, second],
      navNodes: [
        node("assembly-node", first.x, first.y, { type: "assembly", assemblyPointId: first.id }),
        node("path-node", 170, 120),
        node("assembly-node-b", second.x, second.y, { type: "assembly", assemblyPointId: second.id }),
      ],
      navEdges: [edge("connection", "assembly-node", "path-node"), edge("connection-b", "assembly-node-b", "path-node")],
    });

    expect(campusWidePrimaryAssemblyPoint(conflicted)).toBeNull();
    expect(assignedPrimaryAssemblyPoint(conflicted, "building-a")).toBeNull();
    expect(hasEmergencyAssemblyPointConfiguredForBuilding(conflicted, "building-a")).toBe(true);
  });

  it("keeps campus-wide Primary destinations isolated between campuses", () => {
    const otherPrimary = point({ id: "assembly-b", campusId: "campus-b", campusWidePrimary: true, buildingAssignments: [] });
    const campusB = campus({
      id: "campus-b",
      buildings: [{ id: "building-b", name: "Other Building", code: "B", category: "academic", x: 0, y: 0, width: 40, height: 40, floors: [] } as unknown as Campus["buildings"][number]],
      assemblyPoints: [otherPrimary],
      navNodes: [
        node("assembly-node", otherPrimary.x, otherPrimary.y, { campusId: "campus-b", type: "assembly", assemblyPointId: otherPrimary.id }),
        node("path-node", 170, 120, { campusId: "campus-b" }),
      ],
      navEdges: [edge("connection", "assembly-node", "path-node")],
    });
    const campusA = campus();

    expect(campusWidePrimaryAssemblyPoint(campusB)?.id).toBe(otherPrimary.id);
    expect(campusWidePrimaryAssemblyPoint(campusA)).toBeNull();
    expect(resolvedAssemblyPointsForBuilding(campusA, "building-a").map(({ point: resolved }) => resolved.id)).toEqual(["assembly-a"]);
    expect(resolvedAssemblyPointsForBuilding(campusA, "building-a").some(({ point: resolved }) => resolved.id === otherPrimary.id)).toBe(false);
  });

  it("requires a real emergency-safe outdoor graph connection and an assigned campus building", () => {
    const connected = campus();
    expect(assemblyPointValidation(connected, connected.assemblyPoints![0]).connection).toBe("connected");

    const disconnected = campus({ navEdges: [] });
    expect(assemblyPointValidation(disconnected, disconnected.assemblyPoints![0]).connection).toBe("not_connected");

    const unsafe = campus({ navEdges: [edge("connection", "assembly-node", "path-node", { emergencySafe: false })] });
    expect(assemblyPointValidation(unsafe, unsafe.assemblyPoints![0]).connection).toBe("not_connected");
  });

  it("requires an incoming traversable edge so an evacuation can reach a one-way Assembly Point", () => {
    const outboundOnly = campus({ navEdges: [edge("outbound-only", "assembly-node", "path-node", { bidirectional: false })] });
    expect(assemblyPointValidation(outboundOnly, outboundOnly.assemblyPoints![0]).connection).toBe("not_connected");
    expect(assemblyPointValidation(outboundOnly, outboundOnly.assemblyPoints![0]).readiness).toBe("draft");

    const inboundOnly = campus({ navEdges: [edge("inbound-only", "path-node", "assembly-node", { bidirectional: false })] });
    expect(assemblyPointValidation(inboundOnly, inboundOnly.assemblyPoints![0]).connection).toBe("connected");
  });

  it("does not treat a one-way outdoor chain pointing away from an Assembly Point as an incoming route", () => {
    const campusPoint = point();
    const oneWayOut = campus({
      navNodes: [
        node("assembly-node", 120, 120, { type: "assembly", assemblyPointId: campusPoint.id }),
        node("path-node", 130, 120),
        node("campus-node", 140, 120),
      ],
      navEdges: [
        edge("assembly-out", "assembly-node", "path-node", { bidirectional: false }),
        edge("path-out", "path-node", "campus-node", { bidirectional: false }),
      ],
    });

    expect(assemblyPointValidation(oneWayOut, oneWayOut.assemblyPoints![0]).connection).toBe("not_connected");
  });

  it("does not treat an outdoor connection with an emergency hazard reason as traversable", () => {
    const hazardCampus = campus({
      navNodes: [
        node("outdoor", 100, 100, { name: "Walking Point" }),
        node("assembly-node", 120, 120, { type: "assembly", assemblyPointId: "assembly-a" }),
      ],
      navEdges: [edge("hazard-link", "outdoor", "assembly-node", { emergencySafe: true, emergencyReason: "hazard" })],
    });

    expect(assemblyPointValidation(hazardCampus, hazardCampus.assemblyPoints![0]).connection).toBe("not_connected");
  });

  it("approves only the current fingerprint and invalidates changed connected routes", () => {
    const draft = campus();
    const draftPoint = draft.assemblyPoints![0];
    const fingerprint = assemblyPointReviewFingerprint(draft, draftPoint);
    expect(fingerprint).toBeTruthy();
    const approvedPoint = { ...draftPoint, safetyReview: { status: "approved" as const, approvedAt: "2026-10-15T00:00:00.000Z", approvedByRole: "super_admin" as const, fingerprint: fingerprint! } };
    const approved = campus({ assemblyPoints: [approvedPoint] });
    expect(assemblyPointValidation(approved, approvedPoint).readiness).toBe("approved");
    expect(isAssemblyPointApprovedForBuilding(approved, approvedPoint, "building-a")).toBe(true);

    const changed = campus({
      assemblyPoints: [approvedPoint],
      navEdges: [edge("connection", "assembly-node", "path-node", { distance: 25 })],
    });
    expect(assemblyPointValidation(changed, changed.assemblyPoints![0]).readiness).toBe("needs_rereview");
    expect(isAssemblyPointApprovedForBuilding(changed, changed.assemblyPoints![0], "building-a")).toBe(false);

    const unrelated = campus({
      assemblyPoints: [approvedPoint],
      navNodes: [...draft.navNodes!, node("unrelated", 330, 250)],
      navEdges: [...draft.navEdges!, edge("unrelated-edge", "unrelated", "unrelated", { bidirectional: false })],
    });
    expect(assemblyPointReviewFingerprint(unrelated, unrelated.assemblyPoints![0])).toBe(fingerprint);
  });

  it("keeps an explicitly assigned valid Assembly Point usable when its legacy review fingerprint is stale", () => {
    const draft = campus();
    const point = draft.assemblyPoints![0];
    const stale = {
      ...point,
      safetyReview: {
        status: "approved" as const,
        approvedAt: "2026-10-15T00:00:00.000Z",
        approvedByRole: "admin" as const,
        fingerprint: "old-graph-fingerprint",
      },
    };
    const current = campus({ assemblyPoints: [stale] });

    expect(isAssemblyPointAssignedForBuilding(current, stale, "building-a")).toBe(true);
    expect(assignedPrimaryAssemblyPoint(current, "building-a")?.id).toBe(stale.id);
    expect(isAssemblyPointApprovedForBuilding(current, stale, "building-a")).toBe(false);
  });

  it("keeps physical location review current when only a Primary/Alternate assignment changes", () => {
    const draft = campus();
    const original = draft.assemblyPoints![0];
    const fingerprint = assemblyPointReviewFingerprint(draft, original)!;
    const reviewed = {
      ...original,
      safetyReview: {
        status: "approved" as const,
        approvedAt: "2026-10-15T00:00:00.000Z",
        approvedByRole: "admin" as const,
        fingerprint,
      },
    };
    const reassigned = campus({
      assemblyPoints: [{
        ...reviewed,
        buildingAssignments: [{ buildingId: "building-a", designation: "alternate" }],
      }],
    });

    expect(assemblyPointReviewFingerprint(reassigned, reassigned.assemblyPoints![0])).toBe(fingerprint);
    expect(assemblyPointValidation(reassigned, reassigned.assemblyPoints![0]).readiness).toBe("approved");
    expect(isAssemblyPointApprovedForBuilding(reassigned, reassigned.assemblyPoints![0], "building-a")).toBe(true);
  });

  it("invalidates approval when its supporting outdoor path is removed", () => {
    const draft = campus();
    const draftPoint = draft.assemblyPoints![0];
    const approvedPoint = {
      ...draftPoint,
      safetyReview: {
        status: "approved" as const,
        approvedAt: "2026-10-15T00:00:00.000Z",
        approvedByRole: "admin" as const,
        fingerprint: assemblyPointReviewFingerprint(draft, draftPoint)!,
      },
    };
    const disconnected = campus({ assemblyPoints: [approvedPoint], navEdges: [] });
    expect(assemblyPointValidation(disconnected, approvedPoint).connection).toBe("not_connected");
    expect(assemblyPointValidation(disconnected, approvedPoint).readiness).toBe("needs_rereview");
    expect(isAssemblyPointApprovedForBuilding(disconnected, approvedPoint, "building-a")).toBe(false);
  });

  it("rejects conflicting primary assignments while allowing a distinct alternate", () => {
    const alternatePoint = point({
      id: "assembly-b",
      name: "Alternate Assembly Point",
      navNodeId: "assembly-node-b",
      x: 250,
      y: 170,
      buildingAssignments: [{ buildingId: "building-a", designation: "primary" }],
    });
    const secondAnchor = node("assembly-node-b", alternatePoint.x, alternatePoint.y, { type: "assembly", assemblyPointId: alternatePoint.id });
    const secondPath = node("path-node-b", 290, 170);
    const conflicting = campus({
      assemblyPoints: [point(), alternatePoint],
      navNodes: [...campus().navNodes!, secondAnchor, secondPath],
      navEdges: [...campus().navEdges!, edge("connection-b", secondAnchor.id, secondPath.id)],
    });
    expect(assemblyPointValidation(conflicting, conflicting.assemblyPoints![0]).reasons)
      .toContain("This building already has another primary Assembly Point.");

    const distinctDesignations = {
      ...conflicting,
      assemblyPoints: conflicting.assemblyPoints!.map((candidate) => candidate.id === alternatePoint.id
        ? { ...candidate, buildingAssignments: [{ buildingId: "building-a", designation: "alternate" as const }] }
        : candidate),
    };
    expect(assemblyPointValidation(distinctDesignations, distinctDesignations.assemblyPoints![0]).reasons)
      .not.toContain("This building already has another primary Assembly Point.");
    expect(assemblyPointValidation(distinctDesignations, distinctDesignations.assemblyPoints![1]).reasons)
      .not.toContain("This building already has another alternate Assembly Point.");

    const secondAlternate = point({
      id: "assembly-c",
      name: "Second Alternate Assembly Point",
      navNodeId: "assembly-node-c",
      x: 320,
      y: 220,
      buildingAssignments: [{ buildingId: "building-a", designation: "alternate" }],
    });
    const secondAlternateAnchor = node("assembly-node-c", secondAlternate.x, secondAlternate.y, {
      type: "assembly",
      assemblyPointId: secondAlternate.id,
    });
    const secondAlternatePath = node("path-node-c", 350, 220);
    const multipleAlternates = {
      ...distinctDesignations,
      assemblyPoints: [...distinctDesignations.assemblyPoints!, secondAlternate],
      navNodes: [...distinctDesignations.navNodes!, secondAlternateAnchor, secondAlternatePath],
      navEdges: [...distinctDesignations.navEdges!, edge("connection-c", secondAlternateAnchor.id, secondAlternatePath.id)],
    };
    expect(assemblyPointValidation(multipleAlternates, multipleAlternates.assemblyPoints[1]).reasons)
      .not.toContain("This building already has another alternate Assembly Point.");
    expect(assemblyPointValidation(multipleAlternates, multipleAlternates.assemblyPoints[2]).reasons)
      .not.toContain("This building already has another alternate Assembly Point.");
  });

  it("keeps an unrelated approved Assembly Point and its graph links intact when one assigned point is deleted", () => {
    const otherPoint = point({
      id: "assembly-b",
      name: "Assembly Point B",
      navNodeId: "assembly-node-b",
      x: 250,
      y: 170,
      buildingAssignments: [{ buildingId: "building-a", designation: "alternate" }],
    });
    const otherAnchor = node("assembly-node-b", otherPoint.x, otherPoint.y, { type: "assembly", assemblyPointId: otherPoint.id });
    const otherPath = node("path-node-b", 290, 170);
    const base = campus({
      assemblyPoints: [point(), otherPoint],
      navNodes: [...campus().navNodes!, otherAnchor, otherPath],
      navEdges: [...campus().navEdges!, edge("connection-b", otherAnchor.id, otherPath.id)],
    });
    const approvedOtherPoint = {
      ...otherPoint,
      safetyReview: {
        status: "approved" as const,
        approvedAt: "2026-10-15T00:00:00.000Z",
        approvedByRole: "admin" as const,
        fingerprint: assemblyPointReviewFingerprint(base, otherPoint)!,
      },
    };
    const approvedCampus = { ...base, assemblyPoints: [base.assemblyPoints![0], approvedOtherPoint] };

    const result = removeEmergencyAssemblyPoint(approvedCampus, "assembly-a");

    expect(result.assemblyPoints?.map((candidate) => candidate.id)).toEqual(["assembly-b"]);
    expect(result.navNodes?.some((candidate) => candidate.id === "assembly-node")).toBe(false);
    expect(result.navNodes?.some((candidate) => candidate.id === otherAnchor.id && candidate.assemblyPointId === otherPoint.id)).toBe(true);
    expect(result.navEdges?.some((candidate) => candidate.id === "connection-b")).toBe(true);
    expect(assemblyPointValidation(result, result.assemblyPoints![0]).readiness).toBe("approved");
  });

  it("keeps the shared graph coherent when synchronizing or deleting a point", () => {
    const source = campus();
    const synchronized = syncEmergencyAssemblyPointNavigation(source, (prefix) => `${prefix}-new`);
    expect(synchronized.navNodes?.filter((candidate) => candidate.assemblyPointId === "assembly-a")).toHaveLength(1);
    expect(synchronized.assemblyPoints?.[0].navNodeId).toBe("assembly-node");

    const removed = removeEmergencyAssemblyPoint(source, "assembly-a");
    expect(removed.assemblyPoints).toEqual([]);
    expect(removed.navNodes?.some((candidate) => candidate.id === "assembly-node")).toBe(false);
    expect(removed.navEdges?.some((candidate) => candidate.startNodeId === "assembly-node" || candidate.endNodeId === "assembly-node")).toBe(false);
    expect(removed.navNodes?.some((candidate) => candidate.id === "path-node")).toBe(true);
  });

  it("keeps the marker aligned with a moved pathway-generated anchor and requires review again", () => {
    const draft = campus();
    const original = draft.assemblyPoints![0];
    const approved = {
      ...original,
      safetyReview: {
        status: "approved" as const,
        approvedAt: "2026-10-15T00:00:00.000Z",
        approvedByRole: "admin" as const,
        fingerprint: assemblyPointReviewFingerprint(draft, original)!,
      },
    };
    const movedGraph = campus({
      assemblyPoints: [approved],
      navNodes: [
        node("assembly-node", 145, 132, {
          type: "assembly",
          assemblyPointId: "assembly-a",
          generatedFromPathVertices: [{ pathId: "path-a", vertexId: "vertex-a" }],
        }),
        node("path-node", 170, 120),
      ],
    });

    const moved = syncEmergencyAssemblyPointPositionsFromNavigation(movedGraph);
    expect(moved.assemblyPoints?.[0]).toMatchObject({ x: 145, y: 132 });
    expect(assemblyPointValidation(moved, moved.assemblyPoints![0]).readiness).toBe("needs_rereview");
    expect(moved.navNodes?.find((candidate) => candidate.id === "assembly-node"))
      .toMatchObject({ x: 145, y: 132 });
  });

  it("restores the original authored edge after deleting a point inserted into it", () => {
    const original = edge("original", "left", "right", { bidirectional: false, emergencySafe: false, distance: 44 });
    const leftHalf = edge("left-half", "left", "assembly-node", { bidirectional: false, emergencySafe: false, distance: 22 });
    const rightHalf = edge("right-half", "assembly-node", "right", { bidirectional: false, emergencySafe: false, distance: 22 });
    const source = campus({
      assemblyPoints: [point({ connectionOrigin: { kind: "split-edge", originalEdge: original, splitEdges: [leftHalf, rightHalf] } })],
      navNodes: [node("left", 40, 120), node("right", 200, 120), node("assembly-node", 120, 120, { type: "assembly", assemblyPointId: "assembly-a" })],
      navEdges: [leftHalf, rightHalf],
    });
    const result = removeEmergencyAssemblyPoint(source, "assembly-a");
    expect(result.navEdges).toEqual([original]);
    expect(result.navNodes?.map((candidate) => candidate.id)).toEqual(["left", "right"]);
  });

  it("preserves later edits to split segments when deleting the point", () => {
    const original = edge("original", "left", "right", { bidirectional: false, emergencySafe: false, distance: 44 });
    const reviewedLeftHalf = edge("left-half", "left", "assembly-node", { bidirectional: false, emergencySafe: false, distance: 22 });
    const reviewedRightHalf = edge("right-half", "assembly-node", "right", { bidirectional: false, emergencySafe: false, distance: 22 });
    const editedLeftHalf = { ...reviewedLeftHalf, distance: 27, bendPoints: [{ x: 90, y: 100 }] };
    const source = campus({
      assemblyPoints: [point({ connectionOrigin: { kind: "split-edge", originalEdge: original, splitEdges: [reviewedLeftHalf, reviewedRightHalf] } })],
      navNodes: [node("left", 40, 120), node("right", 200, 120), node("assembly-node", 120, 120, { type: "assembly", assemblyPointId: "assembly-a" })],
      navEdges: [editedLeftHalf, reviewedRightHalf],
    });

    const result = removeEmergencyAssemblyPoint(source, "assembly-a");
    expect(result.assemblyPoints).toEqual([]);
    expect(result.navEdges).toEqual([editedLeftHalf, reviewedRightHalf]);
    expect(result.navNodes?.find((candidate) => candidate.id === "assembly-node"))
      .toMatchObject({ type: "outdoor", name: "Walking Point" });
    expect(result.navNodes?.find((candidate) => candidate.id === "assembly-node"))
      .not.toHaveProperty("assemblyPointId");
  });
});

import { describe, expect, it } from "vitest";
import type { AssemblyPoint, Campus, NavigationEdge, NavigationNode } from "../../components/map-builder/types";
import { evaluateSosPublicationPreflight } from "../sosPublicationPreflight";

const campus = (overrides: Partial<Campus> = {}): Campus => ({
  id: "campus", name: "TEST ONLY Campus", code: "TEST", description: "", address: "", city: "", province: "", postalCode: "",
  status: "active", publishStatus: "published", visibleToStudents: true,
  features: { indoorNavigation: true, accessibilityNavigation: true, emergencyRoutes: true, issueReporting: false },
  canvasW: 300, canvasH: 200,
  buildings: [{ id: "building-a", name: "Building A", code: "A", category: "academic", x: 10, y: 10, width: 40, height: 40, floors: [] } as unknown as Campus["buildings"][number]],
  paths: [], markers: [], decorAssets: [], navNodes: [], navEdges: [], assemblyPoints: [],
  ...overrides,
} as Campus);

const node = (id: string, refs: Partial<NavigationNode> = {}): NavigationNode => ({
  id, name: id, type: "outdoor", x: 80, y: 80, accessible: true, campusId: "campus", color: "#16a34a", ...refs,
});
const edge = (id: string, startNodeId: string, endNodeId: string): NavigationEdge => ({
  id, startNodeId, endNodeId, distance: 10, bidirectional: true, accessible: true, emergencySafe: true,
  type: "outdoor", color: "#16a34a", width: 3,
});
const assemblyPoint = (overrides: Partial<AssemblyPoint> = {}): AssemblyPoint => ({
  id: "assembly-a", name: "TEST ONLY Assembly Point", x: 80, y: 80, campusId: "campus", navNodeId: "assembly-anchor",
  buildingAssignments: [{ buildingId: "building-a", designation: "primary" }], ...overrides,
});

describe("SOS proposed-snapshot publication preflight", () => {
  it("reports no Assembly Point without blocking the normal publish flow", () => {
    const result = evaluateSosPublicationPreflight(campus());

    expect(result.serializationPassed).toBe(true);
    expect(result.checks).toContainEqual(expect.objectContaining({ id: "assembly_point_entities", state: "attention" }));
    expect(result.checks).toContainEqual(expect.objectContaining({ id: "representative_routes", state: "not_verified" }));
    expect(result.checks).toContainEqual(expect.objectContaining({ id: "published_snapshot_difference", state: "not_verified" }));
  });

  it("compares SOS-relevant draft data against the immutable published snapshot", () => {
    const draft = campus({ settings: { accessibility: true, emergency: true, eventLayer: true, gps: true, emergencyDestinationPolicy: "nearest_eligible" } });
    const published = campus();

    const result = evaluateSosPublicationPreflight(draft, JSON.stringify(published));

    expect(result.checks).toContainEqual(expect.objectContaining({
      id: "published_snapshot_difference",
      state: "attention",
      detail: expect.stringContaining("SOS destination policy"),
    }));
    expect(result.checks.find((check) => check.id === "published_snapshot_difference")?.detail)
      .toContain("authorized publication");
  });

  it("reports when SOS-relevant data already matches the current published snapshot", () => {
    const proposed = campus();
    const result = evaluateSosPublicationPreflight(proposed, JSON.stringify(proposed));

    expect(result.checks).toContainEqual(expect.objectContaining({ id: "published_snapshot_difference", state: "pass" }));
  });

  it("round-trips the Assembly Point identity, anchor, assignment, and graph in the proposed snapshot", () => {
    const point = assemblyPoint();
    const proposed = campus({
      assemblyPoints: [point],
      navNodes: [node("assembly-anchor", { type: "assembly", assemblyPointId: point.id }), node("walkway")],
      navEdges: [edge("assembly-walkway", "walkway", "assembly-anchor")],
    });
    const result = evaluateSosPublicationPreflight(proposed);

    expect(result.serializationPassed).toBe(true);
    expect(result.checks).toContainEqual(expect.objectContaining({ id: "snapshot_round_trip", state: "pass" }));
    expect(result.checks).toContainEqual(expect.objectContaining({ id: `assembly_point:${point.id}`, state: "pass" }));
    expect(result.checks.some((check) => check.detail.includes("assigned outdoor anchor is valid"))).toBe(true);
  });

  it("round-trips a campus-wide Primary without duplicating building assignments", () => {
    const point = assemblyPoint({ campusWidePrimary: true, buildingAssignments: [] });
    const proposed = campus({
      assemblyPoints: [point],
      navNodes: [node("assembly-anchor", { type: "assembly", assemblyPointId: point.id }), node("walkway")],
      navEdges: [edge("assembly-walkway", "walkway", "assembly-anchor")],
    });

    const result = evaluateSosPublicationPreflight(proposed);

    expect(result.serializationPassed).toBe(true);
    expect(result.assignedBuildingCount).toBe(1);
    expect(result.checks).toContainEqual(expect.objectContaining({ id: "snapshot_round_trip", state: "pass" }));
    expect(result.checks).toContainEqual(expect.objectContaining({ id: "building_assignments", state: "pass" }));
    expect(result.checks.find((check) => check.id === `assembly_point:${point.id}`)?.detail).toContain("outdoor anchor is valid");
    expect(point.buildingAssignments).toEqual([]);
  });

  it("does not call a locally linked Assembly Point connected when its component is isolated from the campus network", () => {
    const point = assemblyPoint();
    const isolated = campus({
      assemblyPoints: [point],
      navNodes: [
        node("assembly-anchor", { type: "assembly", assemblyPointId: point.id, x: 10 }),
        node("assembly-local", { x: 20 }),
        node("campus-endpoint", { x: 150 }),
        node("campus-main", { x: 170 }),
      ],
      navEdges: [edge("assembly-link", "assembly-anchor", "assembly-local"), edge("main-link", "campus-endpoint", "campus-main")],
    });

    const result = evaluateSosPublicationPreflight(isolated);
    const pointCheck = result.checks.find((check) => check.id === `assembly_point:${point.id}`);

    expect(pointCheck?.state).toBe("attention");
    expect(pointCheck?.detail).toContain("disconnected from the main emergency-eligible outdoor network");
  });

  it("surfaces a malformed proposed structure as a nonblocking SOS finding", () => {
    const invalid = campus({ buildings: [{
      id: "building-a", name: "Building A", code: "A", category: "academic", x: 10, y: 10, width: 40, height: 40,
      floors: [{ id: "floor-a", number: 1, label: "Ground Floor", rooms: [], paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [] }],
    } as unknown as Campus["buildings"][number]], navNodes: [], navEdges: [] });
    (invalid.buildings[0].floors[0] as unknown as { doors: Array<{ id: string; x: number }> }).doors = [{ id: "broken-door", x: Number.NaN }];
    (invalid.buildings[0].floors[0] as unknown as { doors: Array<{ id: string; x: number }> }).doors[0].x = Number.NaN;

    const result = evaluateSosPublicationPreflight(invalid);
    expect(result.serializationPassed).toBe(false);
    expect(result.checks.find((check) => check.id === "snapshot_round_trip")?.state).toBe("attention");
  });
});

import { describe, expect, it } from "vitest";
import type { Campus } from "../../components/map-builder/types";
import { alignCampusGateAnchor, campusGates, outdoorNetworkReachesCampusGate, syncCampusGateNavigation } from "../campusGates";
import { chooseEmergencyDestinationCandidate, emergencyDestinationCandidatePools } from "../../components/map-builder/TestNavigationPanel";
import { serializeCampusStructure } from "../../services/campusStructureService";

function campus(overrides: Partial<Campus> = {}): Campus {
  return {
    id: "campus-1", name: "Campus", code: "C1", description: "", address: "", city: "", province: "", postalCode: "",
    status: "active", publishStatus: "draft", visibleToStudents: false,
    features: { indoorNavigation: true, accessibilityNavigation: true, emergencyRoutes: true, issueReporting: true },
    canvasW: 900, canvasH: 680, settings: { accessibility: true, emergency: true, eventLayer: false, gps: false },
    buildings: [], markers: [], paths: [], createdAt: "", updatedAt: "", ...overrides,
  };
}

describe("Campus Gate graph integration", () => {
  it("snaps a connected gate anchor exactly to a horizontal or vertical target axis", () => {
    expect(alignCampusGateAnchor({ x: 100, y: 196 }, { x: 240, y: 200 }, 8)).toEqual({
      point: { x: 100, y: 200 },
      guides: [{ type: "h", pos: 200 }],
    });
    expect(alignCampusGateAnchor({ x: 196, y: 100 }, { x: 200, y: 240 }, 8)).toEqual({
      point: { x: 200, y: 100 },
      guides: [{ type: "v", pos: 200 }],
    });
  });

  it("does not force alignment outside the world-space tolerance", () => {
    expect(alignCampusGateAnchor({ x: 100, y: 188 }, { x: 240, y: 200 }, 8)).toEqual({
      point: { x: 100, y: 188 },
      guides: [],
    });
  });

  it("creates one stable derived anchor and keeps it synchronized with the marker", () => {
    const first = syncCampusGateNavigation(campus({ markers: [{ id: "gate-1", name: "Main Gate", type: "gate", purpose: "general", x: 100, y: 120, color: "#2563eb" }] }), (prefix) => `${prefix}-1`);
    const gate = campusGates(first)[0];
    expect(gate.navNodeId).toBe("gate-nav-1");
    expect(first.navNodes).toEqual([expect.objectContaining({ id: "gate-nav-1", gateId: "gate-1", x: 100, y: 120 })]);
    const moved = syncCampusGateNavigation({ ...first, markers: [{ ...gate, x: 140, y: 160 }] }, (prefix) => `${prefix}-2`);
    expect(moved.navNodes).toEqual([expect.objectContaining({ id: "gate-nav-1", gateId: "gate-1", x: 140, y: 160 })]);
  });

  it("round-trips the gate marker and linked anchor through the existing structure payload", () => {
    const value = campus({
      markers: [{ id: "gate-1", name: "Main Gate", type: "gate", purpose: "emergency_exit", x: 100, y: 120, color: "#dc2626", navNodeId: "gate-node" }],
      navNodes: [{ id: "gate-node", name: "Main Gate", type: "emergency_exit", gateId: "gate-1", x: 100, y: 120, accessible: true, emergencySafe: true, color: "#dc2626" }],
    });
    const payload = serializeCampusStructure(value);
    expect(payload.map_elements).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "gate-1", element_type: "gate", metadata: expect.objectContaining({ kind: "gate" }) }),
    ]));
    expect(payload.navigation_nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "gate-node", metadata: expect.objectContaining({ ui: expect.objectContaining({ gateId: "gate-1" }) }) }),
    ]));
  });

  it("removes only the gate-owned anchor and incident edges", () => {
    const value = campus({
      markers: [{ id: "gate-1", name: "Main Gate", type: "gate", purpose: "general", x: 100, y: 120, color: "#2563eb", navNodeId: "gate-node" }],
      navNodes: [
        { id: "manual", name: "Walking Point", type: "outdoor", x: 40, y: 120, accessible: true, color: "#16a34a" },
        { id: "gate-node", name: "Main Gate", type: "outdoor", gateId: "gate-1", x: 100, y: 120, accessible: true, emergencySafe: true, color: "#2563eb" },
      ],
      navEdges: [{ id: "gate-edge", startNodeId: "manual", endNodeId: "gate-node", distance: 60, bidirectional: true, accessible: true, emergencySafe: true, type: "walking", color: "#16a34a", width: 2 }],
    });
    const removed = syncCampusGateNavigation({ ...value, markers: [] }, (prefix) => `${prefix}-unused`);
    expect(removed.navNodes).toEqual([expect.objectContaining({ id: "manual" })]);
    expect(removed.navEdges).toEqual([]);
  });

  it("detects a reachable emergency-safe campus gate through outdoor edges", () => {
    const value = campus({
      markers: [{ id: "gate-1", name: "Emergency Gate", type: "gate", purpose: "emergency_exit", x: 100, y: 100, color: "#dc2626", navNodeId: "gate-node" }],
      navNodes: [
        { id: "discharge", name: "Stair Exit", type: "outdoor", x: 20, y: 20, accessible: true, color: "#16a34a" },
        { id: "gate-node", name: "Emergency Gate", type: "emergency_exit", gateId: "gate-1", x: 100, y: 100, accessible: true, emergencySafe: true, color: "#dc2626" },
      ],
      navEdges: [{ id: "edge", startNodeId: "discharge", endNodeId: "gate-node", distance: 80, bidirectional: true, accessible: true, emergencySafe: true, type: "walking", color: "#16a34a", width: 2 }],
    });
    expect(outdoorNetworkReachesCampusGate("discharge", value.navNodes, value.navEdges)).toBe(true);
  });

  it("extends a building egress through its discharge to the final campus gate", () => {
    const value = campus({
      buildings: [{ id: "b1", name: "Building 1", code: "B1", category: "academic", description: "", x: 0, y: 0, width: 200, height: 200, floors: [], entrances: [{ id: "e1", buildingId: "b1", edge: "bottom", offset: 0.5, type: "general", name: "Main Entrance", isPrimary: true }] }],
      markers: [{ id: "gate-1", name: "Main Gate", type: "gate", purpose: "general", x: 300, y: 100, color: "#2563eb", navNodeId: "gate-node" }],
      navNodes: [
        { id: "start", name: "Start", type: "outdoor", x: 0, y: 0, accessible: true, color: "#16a34a" },
        { id: "indoor", name: "Indoor", type: "hallway", buildingId: "b1", floorId: "f1", x: 5, y: 0, accessible: true, color: "#16a34a" },
        { id: "entrance", name: "Main Entrance", type: "entrance", buildingId: "b1", entranceId: "e1", x: 10, y: 0, accessible: true, color: "#16a34a" },
        { id: "discharge", name: "Outside Entrance", type: "outdoor", x: 100, y: 0, accessible: true, color: "#16a34a" },
        { id: "gate-node", name: "Main Gate", type: "outdoor", gateId: "gate-1", x: 300, y: 100, accessible: true, emergencySafe: true, color: "#2563eb" },
      ],
      navEdges: [
        { id: "start-indoor", startNodeId: "start", endNodeId: "indoor", distance: 5, bidirectional: true, accessible: true, emergencySafe: true, type: "walking", color: "#16a34a", width: 2 },
        { id: "indoor-entrance", startNodeId: "indoor", endNodeId: "entrance", distance: 5, bidirectional: true, accessible: true, emergencySafe: true, type: "entrance_transition", color: "#16a34a", width: 2 },
        { id: "entrance-discharge", startNodeId: "entrance", endNodeId: "discharge", distance: 10, bidirectional: true, accessible: true, emergencySafe: true, type: "walking", color: "#16a34a", width: 2 },
        { id: "discharge-gate", startNodeId: "discharge", endNodeId: "gate-node", distance: 100, bidirectional: true, accessible: true, emergencySafe: true, type: "walking", color: "#16a34a", width: 2 },
      ],
    });
    const pools = emergencyDestinationCandidatePools(value, value.navEdges!);
    expect(pools.general[0]).toMatchObject({ nodeId: "gate-node", outdoorDischargeNodeId: "discharge" });
    const chosen = chooseEmergencyDestinationCandidate(value, value.navEdges!, "start");
    expect(chosen?.candidate.kind).toBe("general");
    expect(chosen?.path.nodeIds.at(-1)).toBe("gate-node");
    expect(chosen?.path.nodeIds).toContain("discharge");
  });
});

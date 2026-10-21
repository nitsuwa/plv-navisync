import { describe, expect, it } from "vitest";
import type { AssemblyPoint, Campus, NavigationEdge, NavigationNode } from "../../components/map-builder/types";
import { syncExteriorEmergencyStairGraph } from "../exteriorEmergencyStairs";
import { isStudentEmergencyRouteCurrentAndEligible, planStudentEmergencyRoute } from "../studentEmergencyNavigation";

const edge = (id: string, startNodeId: string, endNodeId: string, type: NavigationEdge["type"]): NavigationEdge => ({
  id,
  startNodeId,
  endNodeId,
  distance: 10,
  bidirectional: true,
  accessible: true,
  emergencySafe: true,
  type,
  color: "#dc2626",
  width: 3,
});

function buildingOriginCampus(stairEmergencySafe = true): Campus {
  const buildingId = "building-coed";
  const floorId = "coed-ground";
  const entranceId = "coed-main-entrance";
  const entranceDoorId = "coed-main-door";
  const assemblyNode: NavigationNode = {
    id: "assembly-anchor",
    name: "COED Assembly Point",
    type: "assembly",
    x: 700,
    y: 700,
    campusId: "main-campus",
    assemblyPointId: "coed-assembly",
    accessible: true,
    emergencySafe: true,
    color: "#dc2626",
  };
  const assemblyPoint: AssemblyPoint = {
    id: "coed-assembly",
    name: "COED Emergency Assembly Point",
    x: assemblyNode.x,
    y: assemblyNode.y,
    campusId: "main-campus",
    navNodeId: assemblyNode.id,
    buildingAssignments: [{ buildingId, designation: "primary" }],
  };
  const base: Campus = {
    id: "main-campus",
    name: "MAIN CAMPUS",
    code: "PLV",
    description: "",
    address: "",
    city: "",
    province: "",
    postalCode: "",
    status: "active",
    publishStatus: "published",
    visibleToStudents: true,
    canvasW: 1000,
    canvasH: 1000,
    settings: { accessibility: true, emergency: true, eventLayer: true, gps: false, emergencyDestinationPolicy: "fixed_primary" },
    features: { accessibilityNavigation: true, emergencyRoutes: true, issueReporting: true },
    buildings: [{
      id: buildingId,
      name: "College of Education Building",
      code: "COED",
      category: "academic",
      description: "",
      x: 100,
      y: 100,
      width: 250,
      height: 220,
      color: "#ddd",
      entrances: [{
        id: entranceId,
        buildingId,
        name: "Main Entrance",
        type: "general",
        edge: "right",
        offset: 0.5,
        isPrimary: true,
      }],
      floors: [{
        id: floorId,
        buildingId,
        number: 1,
        label: "Ground Floor",
        canvasW: 300,
        canvasH: 220,
        backgroundColor: "#fff",
        rooms: [],
        paths: [],
        walls: [],
        doors: [{ id: entranceDoorId, x: 290, y: 110, width: 12, direction: "right", color: "#64748b" }],
        windows: [],
        furniture: [],
        stairs: [],
        ramps: [],
        elevators: [],
        labels: [],
      }],
      exteriorEmergencyStairs: [{
        id: "coed-exterior-stair-1",
        buildingId,
        label: "Exterior Stair 1",
        state: "open",
        emergencySafe: stairEmergencySafe,
        attachment: { edge: "right", offset: 0.5 },
        servedFloorIds: [floorId],
      }],
    }],
    markers: [],
    paths: [],
    navNodes: [
      {
        id: "coed-indoor-entrance-door",
        name: "COED Main Entrance Door",
        type: "hallway",
        x: 285,
        y: 110,
        buildingId,
        floorId,
        doorId: entranceDoorId,
        accessible: true,
        emergencySafe: true,
        color: "#2563eb",
      },
      {
        id: "coed-primary-exterior-entrance",
        name: "COED Main Entrance",
        type: "entrance",
        x: 360,
        y: 210,
        buildingId,
        entranceId,
        accessible: true,
        emergencySafe: true,
        color: "#2563eb",
      },
      {
        id: "isolated-entry-walkway",
        name: "Disconnected Outdoor Walkway",
        type: "outdoor",
        x: 390,
        y: 210,
        campusId: "main-campus",
        accessible: true,
        emergencySafe: true,
        color: "#2563eb",
      },
      assemblyNode,
    ],
    navEdges: [
      edge("coed-entrance-transition", "coed-indoor-entrance-door", "coed-primary-exterior-entrance", "entrance_transition"),
      edge("coed-entrance-outdoor-link", "coed-primary-exterior-entrance", "isolated-entry-walkway", "outdoor"),
    ],
    assemblyPoints: [assemblyPoint],
    createdAt: "",
    updatedAt: "",
  } as unknown as Campus;

  const synced = syncExteriorEmergencyStairGraph(base);
  const stairLanding = synced.navNodes?.find((node) => node.buildingId === buildingId
    && node.floorId === floorId && node.exteriorEmergencyStairId === "coed-exterior-stair-1");
  const stairDischarge = synced.navNodes?.find((node) => node.buildingId === buildingId
    && !node.floorId && node.exteriorEmergencyStairId === "coed-exterior-stair-1");
  if (!stairLanding || !stairDischarge) throw new Error("Test fixture did not create the authored exterior stair graph.");

  return {
    ...synced,
    navEdges: [
      ...(synced.navEdges ?? []),
      edge("coed-floor-walk-to-exterior-stair", "coed-indoor-entrance-door", stairLanding.id, "hallway"),
      edge("coed-exterior-stair-to-assembly", stairDischarge.id, assemblyNode.id, "outdoor"),
    ],
  };
}

describe("building-origin Student SOS", () => {
  it("retries at the authored indoor side of the entrance to reach an eligible exterior stair", () => {
    const campus = buildingOriginCampus();
    const origin = { type: "building" as const, buildingId: "building-coed", label: "COED", code: "COED" };

    const route = planStudentEmergencyRoute(campus, origin);
    const stairLanding = campus.navNodes?.find((node) => node.exteriorEmergencyStairId === "coed-exterior-stair-1" && node.floorId);
    const stairDischarge = campus.navNodes?.find((node) => node.exteriorEmergencyStairId === "coed-exterior-stair-1" && !node.floorId);

    expect(route?.emergencyAssemblyPointId).toBe("coed-assembly");
    expect(route?.emergencyDestinationLabel).toBe("COED Emergency Assembly Point");
    expect(route?.authoredGraphNodeIds).toContain(stairLanding?.id);
    expect(route?.authoredGraphNodeIds).toContain(stairDischarge?.id);
    expect(isStudentEmergencyRouteCurrentAndEligible(campus, route, origin)).toBe(true);
  });

  it("does not revive a prohibited exterior stair through the indoor-entrance fallback", () => {
    const campus = buildingOriginCampus(false);
    const origin = { type: "building" as const, buildingId: "building-coed", label: "COED", code: "COED" };

    expect(planStudentEmergencyRoute(campus, origin)).toBeNull();
  });

  it("does not fall back to a Campus Gate when the assigned Assembly Point is unreachable", () => {
    const campus = buildingOriginCampus();
    const stairDischarge = campus.navNodes?.find((node) => node.exteriorEmergencyStairId === "coed-exterior-stair-1" && !node.floorId);
    campus.navEdges = (campus.navEdges ?? []).filter((candidate) => candidate.id !== "coed-exterior-stair-to-assembly");
    const gate: NavigationNode = {
      id: "campus-gate",
      name: "Campus Gate",
      type: "outdoor",
      x: 800,
      y: 800,
      campusId: campus.id,
      gateId: "campus-gate-marker",
      accessible: true,
      emergencySafe: true,
      color: "#2563eb",
    };
    campus.navNodes = [...(campus.navNodes ?? []), gate];
    campus.markers = [{ id: "campus-gate-marker", name: "Campus Gate", type: "gate", purpose: "general", x: gate.x, y: gate.y, navNodeId: gate.id, color: "#2563eb" }];
    campus.navEdges = [...(campus.navEdges ?? []), edge("stair-to-campus-gate", stairDischarge!.id, gate.id, "outdoor")];
    const origin = { type: "building" as const, buildingId: "building-coed", label: "COED", code: "COED" };

    expect(planStudentEmergencyRoute(campus, origin)).toBeNull();
  });
});

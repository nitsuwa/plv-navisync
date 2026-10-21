import { describe, expect, it } from "vitest";
import type { Campus, NavigationEdge } from "../../components/map-builder/types";
import { assessEmergencyAuthoredPath } from "../emergencyPathEligibility";

function exteriorStairCampus(emergencySafe: boolean): Campus {
  const buildingId = "building-caba";
  const exteriorStairId = "exterior-stair-1";
  return {
    buildings: [{
      id: buildingId,
      floors: [],
      exteriorEmergencyStairs: [{
        id: exteriorStairId,
        buildingId,
        label: "Exterior Stair 1",
        state: "open",
        emergencySafe,
      }],
    }],
    navNodes: [
      { id: "outside-start", x: 0, y: 0, type: "outdoor" },
      {
        id: "stair-discharge",
        x: 1,
        y: 0,
        type: "stair",
        name: "Exterior Stair 1",
        buildingId,
        exteriorEmergencyStairId: exteriorStairId,
      },
      { id: "assembly-point", x: 2, y: 0, type: "assembly" },
    ],
  } as unknown as Campus;
}

const routeEdges: NavigationEdge[] = [
  { id: "to-stair", startNodeId: "outside-start", endNodeId: "stair-discharge", bidirectional: false, emergencySafe: true,
    distance: 1, accessible: true, type: "walkway", color: "#000", width: 1 },
  { id: "from-stair", startNodeId: "stair-discharge", endNodeId: "assembly-point", bidirectional: false, emergencySafe: true,
    distance: 1, accessible: true, type: "walkway", color: "#000", width: 1 },
];

describe("emergency path exterior stair eligibility", () => {
  it("uses the Building-owned exterior stair designation for its discharge node", () => {
    const result = assessEmergencyAuthoredPath(exteriorStairCampus(true), routeEdges, {
      nodeIds: ["outside-start", "stair-discharge", "assembly-point"],
      edgeIds: ["to-stair", "from-stair"],
      destinationNodeId: "assembly-point",
    });

    expect(result).toEqual({ connected: true, emergencyEligible: true, issues: [] });
  });

  it("continues to reject a closed or undesignated exterior stair", () => {
    const result = assessEmergencyAuthoredPath(exteriorStairCampus(false), routeEdges, {
      nodeIds: ["outside-start", "stair-discharge", "assembly-point"],
      edgeIds: ["to-stair", "from-stair"],
      destinationNodeId: "assembly-point",
    });

    expect(result.connected).toBe(true);
    expect(result.emergencyEligible).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({
      kind: "stairs",
      id: "exterior-stair-1",
      detail: "This Exterior Emergency Stair is closed or not currently designated for emergency use.",
    }));
  });
});

import { describe, expect, it } from "vitest";
import type { Campus, NavigationEdge, NavigationNode } from "../../components/map-builder/types";
import {
  didOutdoorWaypointDragStart,
  moveOutdoorWaypointLocally,
  OUTDOOR_WAYPOINT_DRAG_THRESHOLD_PX,
} from "../outdoorNavigationEditing";

const node = (id: string, x: number, y: number): NavigationNode => ({
  id,
  name: id,
  type: "outdoor",
  x,
  y,
  accessible: true,
  emergencySafe: true,
  color: "#16a34a",
});

const edge = (id: string, startNodeId: string, endNodeId: string, bendPoints?: { x: number; y: number }[]): NavigationEdge => ({
  id,
  startNodeId,
  endNodeId,
  distance: 0,
  bidirectional: true,
  accessible: true,
  emergencySafe: true,
  type: "walkway",
  color: "#16a34a",
  width: 4,
  ...(bendPoints ? { bendPoints } : {}),
});

const campusWithJunction = (): Campus => ({
  id: "campus-1",
  name: "Waypoint fixture",
  code: "WPT",
  description: "",
  address: "",
  city: "",
  province: "",
  postalCode: "",
  status: "active",
  publishStatus: "draft",
  visibleToStudents: false,
  features: { indoorNavigation: true, accessibilityNavigation: true, emergencyRoutes: true, issueReporting: true },
  canvasW: 1000,
  canvasH: 700,
  settings: { accessibility: true, emergency: true, eventLayer: true, gps: false },
  buildings: [],
  markers: [],
  paths: [{
    id: "pathway-1",
    points: [{ x: 260, y: 100 }, { x: 320, y: 100 }],
    navigationVertexIds: ["path-v1", "path-v2"],
    type: "walkway",
    color: "#94a3b8",
    width: 10,
  }],
  decorAssets: [],
  navNodes: [node("J", 100, 100), node("entrance", 20, 100), node("emergency", 100, 220), node("path", 260, 100), node("unrelated", 400, 400)],
  navEdges: [
    edge("entrance-edge", "entrance", "J", [{ x: 50, y: 60 }, { x: 80, y: 80 }]),
    edge("emergency-edge", "emergency", "J", [{ x: 120, y: 180 }, { x: 140, y: 140 }]),
    edge("path-edge", "J", "path", [{ x: 180, y: 100 }]),
    { ...edge("unrelated-edge", "unrelated", "path", [{ x: 350, y: 360 }]), accessible: false, emergencySafe: false, closed: true },
  ],
  createdAt: "",
  updatedAt: "",
} as Campus);

describe("outdoor waypoint drag editing", () => {
  it("uses a small screen-space threshold before a waypoint drag starts", () => {
    expect(didOutdoorWaypointDragStart({ x: 0, y: 0 }, { x: 2, y: 1 }, 1)).toBe(false);
    expect(didOutdoorWaypointDragStart({ x: 0, y: 0 }, { x: 4, y: 0 }, 1)).toBe(true);
    expect(didOutdoorWaypointDragStart({ x: 0, y: 0 }, { x: 7, y: 0 }, 0.5)).toBe(false);
    expect(didOutdoorWaypointDragStart({ x: 0, y: 0 }, { x: 8, y: 0 }, 0.5)).toBe(true);
    expect(OUTDOOR_WAYPOINT_DRAG_THRESHOLD_PX).toBe(4);
  });

  it("moves a free waypoint locally without rebuilding authored incident geometry", () => {
    const before = campusWithJunction();
    const moved = moveOutdoorWaypointLocally(before, "J", { x: 160, y: 140 });

    expect(moved.navNodes?.find((candidate) => candidate.id === "J")).toMatchObject({ x: 160, y: 140 });
    expect(moved.navNodes?.filter((candidate) => candidate.id !== "J")).toEqual(
      before.navNodes?.filter((candidate) => candidate.id !== "J"),
    );
    expect(moved.paths).toEqual(before.paths);
    expect(moved.navEdges?.map((candidate) => candidate.id)).toEqual(before.navEdges?.map((candidate) => candidate.id));

    for (const id of ["entrance-edge", "emergency-edge", "path-edge"]) {
      const original = before.navEdges?.find((candidate) => candidate.id === id);
      const next = moved.navEdges?.find((candidate) => candidate.id === id);
      expect(next?.startNodeId).toBe(original?.startNodeId);
      expect(next?.endNodeId).toBe(original?.endNodeId);
      expect(next?.bendPoints).toEqual(original?.bendPoints);
      expect(next?.accessible).toBe(original?.accessible);
      expect(next?.emergencySafe).toBe(original?.emergencySafe);
      expect(next?.closed).toBe(original?.closed);
    }
    expect(moved.navEdges?.find((candidate) => candidate.id === "unrelated-edge")).toEqual(
      before.navEdges?.find((candidate) => candidate.id === "unrelated-edge"),
    );
  });

  it("is a no-op when asked to move a missing node", () => {
    const before = campusWithJunction();
    expect(moveOutdoorWaypointLocally(before, "missing", { x: 1, y: 1 })).toBe(before);
  });
});

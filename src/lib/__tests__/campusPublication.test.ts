import { describe, expect, it } from "vitest";
import type { Campus } from "../../components/map-builder/types";
import { validateCampusForPublish } from "../campusPublication";

function campusWith(buildings: Campus["buildings"]): Campus {
  return {
    id: "campus-1", name: "Test Campus", code: "TEST", description: "", address: "", city: "", province: "", postalCode: "",
    status: "active", publishStatus: "draft", visibleToStudents: false,
    features: { indoorNavigation: false, accessibilityNavigation: false, emergencyRoutes: false, issueReporting: false },
    canvasW: 900, canvasH: 680,
    settings: { accessibility: false, emergency: false, eventLayer: false, gps: false },
    buildings, markers: [], paths: [], navNodes: [], navEdges: [], routes: [],
    accessibilityFeatures: [], assemblyPoints: [], eventOverlays: [], decorAssets: [],
    createdAt: "2026-01-01", updatedAt: "2026-01-01",
  };
}

const visibleBuilding: Campus["buildings"][number] = {
  id: "building-1", name: "Main Hall", code: "MH", category: "academic", description: "",
  x: 100, y: 100, width: 300, height: 200, color: "#ffffff", visible: true,
  floors: [{
    id: "floor-1", buildingId: "building-1", number: 1, label: "Ground Floor",
    rooms: [{ id: "room-1", name: "Lobby", type: "lobby", x: 0, y: 0, w: 100, h: 100, buildingId: "building-1", floorId: "floor-1" }],
    paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [],
  }],
};

describe("validateCampusForPublish", () => {
  it("blocks a campus without a student-visible building", () => {
    const result = validateCampusForPublish(campusWith([]));
    expect(result.valid).toBe(false);
    expect(result.errors.map((issue) => issue.message)).toContain("Add at least one student-visible building before publishing.");
  });

  it("requires a named student-visible room destination", () => {
    const buildingWithoutRoom = { ...visibleBuilding, floors: [{ ...visibleBuilding.floors[0], rooms: [] }] };
    const result = validateCampusForPublish(campusWith([buildingWithoutRoom]));
    expect(result.errors.map((issue) => issue.message)).toContain("Add at least one named room to a visible building before publishing.");
  });

  it("does not add readiness blockers to a visible building with a named room", () => {
    const result = validateCampusForPublish(campusWith([visibleBuilding]));
    expect(result.issues.filter((issue) => issue.type === "publish_readiness")).toEqual([]);
  });
});

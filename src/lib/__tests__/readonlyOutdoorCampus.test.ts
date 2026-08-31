import { describe, expect, it } from "vitest";
import type { Campus } from "../../components/map-builder/types";
import { projectReadonlyOutdoorCampus } from "../readonlyOutdoorCampus";

function campusFixture(overrides: Partial<Campus> = {}): Campus {
  return {
    id: "campus-1",
    name: "Published Campus",
    code: "PLV",
    description: "",
    address: "",
    city: "",
    province: "",
    postalCode: "",
    status: "active",
    publishStatus: "published",
    visibleToStudents: true,
    features: {} as Campus["features"],
    canvasW: 1200,
    canvasH: 800,
    settings: { accessibility: true, emergency: true, eventLayer: false, gps: false },
    buildings: [],
    markers: [],
    paths: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    ...overrides,
  };
}

describe("readonly outdoor Campus projection", () => {
  it("projects authored physical objects while excluding hidden objects", () => {
    const building = {
      id: "b-1",
      name: "Library",
      code: "LIB",
      category: "facility",
      description: "",
      x: 120,
      y: 90,
      width: 240,
      height: 140,
      color: "#123456",
      rotation: 18,
      opacity: 0.82,
      floors: [],
      entrances: [{ id: "entrance-1", buildingId: "other", edge: "bottom" as const, offset: 0.42, accessible: true }],
      exteriorEmergencyStairs: [{
        id: "stair-1", buildingId: "other", label: "Side Stair", state: "open" as const,
        width: 28, height: 42, attachment: { edge: "right" as const, offset: 0.35 },
        servedFloorIds: [], sharedId: "shaft-1", emergencySafe: true,
      }],
    };
    const campus = campusFixture({
      buildings: [building as never, { ...building, id: "hidden", visible: false } as never],
      paths: [
        { id: "path-visible", points: [{ x: 0, y: 0 }, { x: 20, y: 20 }], type: "walkway", color: "#0f766e", width: 8 },
        { id: "path-hidden", points: [{ x: 0, y: 0 }, { x: 10, y: 10 }], type: "road", color: "#111", width: 8, visible: false },
      ],
      decorAssets: [
        { id: "tree-1", type: "tree", x: 30, y: 40, rotation: 12, scale: 1.4 },
        { id: "tree-hidden", type: "tree", x: 40, y: 50, visible: false },
      ],
      navNodes: [{ id: "node-1" } as never],
      navEdges: [{ id: "edge-1" } as never],
    });

    const projected = projectReadonlyOutdoorCampus(campus);
    expect(projected.canvasW).toBe(1200);
    expect(projected.buildings).toHaveLength(1);
    expect(projected.buildings[0]).toMatchObject({ x: 120, width: 240, rotation: 18, opacity: 0.82, color: "#123456" });
    expect(projected.paths.map((path) => path.id)).toEqual(["path-visible"]);
    expect(projected.decorAssets.map((asset) => asset.id)).toEqual(["tree-1"]);
    expect(projected.entrances[0]).toMatchObject({ id: "entrance-1", buildingId: "b-1" });
    expect(projected.exteriorEmergencyStairs[0]).toMatchObject({ id: "stair-1", buildingId: "b-1" });
    expect(projected).not.toHaveProperty("navNodes");
    expect(projected).not.toHaveProperty("navEdges");
  });

  it("keeps a legacy single entrance visible as a compatibility fallback", () => {
    const projected = projectReadonlyOutdoorCampus(campusFixture({
      buildings: [{
        id: "b-legacy", name: "Legacy Hall", code: "LH", category: "facility", description: "",
        x: 10, y: 20, width: 100, height: 80, color: "#234", floors: [],
        entrance: { x: 40, y: 100, label: "Main" },
      } as never],
    }));
    expect(projected.entrances).toHaveLength(1);
    expect(projected.entrances[0].legacyPosition).toEqual({ x: 40, y: 100 });
  });
});


import { describe, it, expect } from "vitest";
import {
  buildingPositionsFromCampus,
  floorPlansFromCampus,
  buildingsFromCampus,
  facilitiesFromCampus,
  accessibilityFromCampus,
  locationsFromCampus,
} from "../mapDataAdapter";
import type { SharedCampusData } from "../../contexts/CampusDataContext";

// ── Fixture: a campus authored in the Map Builder ───────────────────────────

function makeCampus(): SharedCampusData {
  return {
    id: "c1",
    name: "PLV Main",
    code: "MAIN",
    canvasW: 900,
    canvasH: 680,
    buildings: [
      {
        id: "b1",
        name: "Main Academic Building",
        code: "MAB",
        category: "Academic",
        description: "Main building",
        x: 10,
        y: 20,
        width: 100,
        height: 80,
        color: "#123456",
        facilities: ["Library"],
        accessibility: ["ramp"],
        floors: [
          {
            id: "f1",
            number: 1,
            label: "Ground Floor",
            rooms: [
              { id: "r1", name: "Room 101", type: "classroom", x: 0, y: 0, w: 10, h: 10 },
              { id: "r2", name: "Restroom", type: "restroom", x: 0, y: 0, w: 10, h: 10 },
              { id: "r3", name: "Hallway A", type: "hallway", x: 0, y: 0, w: 10, h: 10 },
              { id: "r4", name: "Elevator Core", type: "elevator", x: 0, y: 0, w: 10, h: 10 },
              { id: "r5", name: "Computer Lab", type: "lab", x: 0, y: 0, w: 10, h: 10 },
              { id: "r6", name: "Room 204", type: "lab", x: 0, y: 0, w: 10, h: 10 },
            ],
            elevators: [{ id: "el1", x: 0, y: 0, width: 5, height: 5, label: "Elev A" }],
            stairs: [{ id: "st1", x: 0, y: 0, width: 5, height: 5, label: "Stairs A" }],
          },
        ],
      },
      {
        id: "b2",
        name: "Empty Annex",
        code: "EA",
        category: "Other",
        description: "",
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        color: "#fff",
        floors: [],
      },
    ],
    markers: [
      { id: "m1", name: "Main Gate", type: "entrance", x: 1, y: 1, color: "#000" },
      { id: "m2", name: "Student Parking", type: "parking", x: 2, y: 2, color: "#000" },
      { id: "m3", name: "Clock Tower", type: "landmark", x: 3, y: 3, color: "#000" },
      { id: "m4", name: "Mystery Object", type: "gazebo", x: 4, y: 4, color: "#000" },
    ],
    paths: [{ id: "p1", points: [{ x: 0, y: 0 }], type: "walkway", color: "#000", width: 2 }],
  };
}

// ── buildingPositionsFromCampus ─────────────────────────────────────────────

describe("buildingPositionsFromCampus", () => {
  it("converts buildings to legacy B_POS-shaped entries", () => {
    const pos = buildingPositionsFromCampus(makeCampus());
    expect(pos["b1"]).toEqual({ x: 10, y: 20, w: 100, h: 80, color: "#123456" });
    expect(Object.keys(pos)).toContain("b2");
  });

  it("excludes hidden buildings from public/student map adapters", () => {
    const campus = makeCampus();
    campus.buildings = [
      campus.buildings[0],
      { ...campus.buildings[1], visible: false } as typeof campus.buildings[number] & { visible: false },
    ];

    expect(buildingPositionsFromCampus(campus)["b2"]).toBeUndefined();
    expect(buildingsFromCampus(campus).some((building) => building.id === "b2")).toBe(false);
    expect(facilitiesFromCampus(campus)["b2"]).toBeUndefined();
    expect(accessibilityFromCampus(campus)["b2"]).toBeUndefined();
    expect(locationsFromCampus(campus).some((location) => location.building_id === "b2")).toBe(false);
  });
});

// ── floorPlansFromCampus ────────────────────────────────────────────────────

describe("floorPlansFromCampus", () => {
  it("maps floors/rooms into the legacy floor-plan shape", () => {
    const plans = floorPlansFromCampus(makeCampus());
    const plan = plans["b1"];
    expect(plan).toBeDefined();
    expect(plan.buildingName).toBe("Main Academic Building");
    expect(plan.floors[0].number).toBe(1);
    expect(plan.floors[0].rooms).toHaveLength(6);
    expect(plan.floors[0].rooms[0]).toMatchObject({ id: "r1", name: "Room 101", type: "classroom" });
  });

  it("omits buildings without floors", () => {
    const plans = floorPlansFromCampus(makeCampus());
    expect(plans["b2"]).toBeUndefined();
  });
});

// ── buildingsFromCampus / facilitiesFromCampus / accessibilityFromCampus ────

describe("buildingsFromCampus", () => {
  it("maps to legacy building rows (lowercased category, floor count, departments)", () => {
    const rows = buildingsFromCampus(makeCampus());
    const b1 = rows.find((r) => r.id === "b1")!;
    expect(b1.name).toBe("Main Academic Building");
    expect(b1.code).toBe("MAB");
    expect(b1.category).toBe("academic");
    expect(b1.floor_count).toBe(1);
    expect(b1.departments).toEqual(["Library"]);
    expect(b1.description).toBe("Main building");
  });
});

describe("facilitiesFromCampus / accessibilityFromCampus", () => {
  it("maps per-building facility and accessibility lists", () => {
    const campus = makeCampus();
    expect(facilitiesFromCampus(campus)["b1"]).toEqual(["Library"]);
    expect(accessibilityFromCampus(campus)["b1"]).toEqual(["ramp"]);
    expect(facilitiesFromCampus(campus)["b2"]).toEqual([]);
  });
});

// ── locationsFromCampus ─────────────────────────────────────────────────────

describe("locationsFromCampus", () => {
  it("derives locations from outdoor markers with type mapping", () => {
    const locations = locationsFromCampus(makeCampus());
    const byId = new Map(locations.map((l) => [l.id, l]));
    expect(byId.get("campus-m1")).toMatchObject({ name: "Main Gate", type: "entrance", building_id: undefined });
    expect(byId.get("campus-m2")).toMatchObject({ type: "parking" });
    expect(byId.get("campus-m3")).toMatchObject({ type: "landmark" });
    // Unknown marker types fall back to landmark
    expect(byId.get("campus-m4")).toMatchObject({ type: "landmark" });
  });

  it("adds a landmark + entrance location per building", () => {
    const locations = locationsFromCampus(makeCampus());
    expect(locations.some((l) => l.id === "campus-b1" && l.type === "landmark")).toBe(true);
    expect(locations.some((l) => l.id === "campus-b1-entrance" && l.type === "entrance")).toBe(true);
  });

  it("skips structural rooms (hallway, stairs, elevator) but keeps destinations", () => {
    const locations = locationsFromCampus(makeCampus());
    const roomIds = locations.filter((l) => l.building_id === "b1" && l.id.startsWith("campus-r")).map((l) => l.id);
    expect(roomIds).toContain("campus-r1"); // classroom
    expect(roomIds).toContain("campus-r2"); // restroom → restroom type
    expect(roomIds).not.toContain("campus-r3"); // hallway skipped
    expect(roomIds).not.toContain("campus-r4"); // elevator skipped
    expect(roomIds).toContain("campus-r5"); // lab kept
    const restroom = locations.find((l) => l.id === "campus-r2");
    expect(restroom!.type).toBe("restroom");
  });

  it("adds elevator and stair facility locations from floor collections", () => {
    const locations = locationsFromCampus(makeCampus());
    expect(locations.some((l) => l.id === "campus-el1" && l.name === "Elev A")).toBe(true);
    expect(locations.some((l) => l.id === "campus-st1" && l.name === "Stairs A")).toBe(true);
  });

  it("builds readable room labels that include the room type when useful", () => {
    const locations = locationsFromCampus(makeCampus());
    const lab = locations.find((l) => l.id === "campus-r5")!;
    expect(lab.name).toBe("Computer Lab"); // type already in the name
    const lab204 = locations.find((l) => l.id === "campus-r6")!;
    expect(lab204.name).toBe("Room 204 — Lab");
  });
});

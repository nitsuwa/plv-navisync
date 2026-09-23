import { describe, expect, it } from "vitest";
import { resolveFloorPlanForEvent } from "../eventLocationData";
import type { Campus } from "../../components/map-builder/types";

describe("resolveFloorPlanForEvent", () => {
  it("preserves the published live floor dimensions for CABA Ground Floor", () => {
    const campus = {
      buildings: [{
        id: "b_caba",
        name: "CABA Building",
        visible: true,
        floors: [{
          id: "f_caba_1",
          buildingId: "b_caba",
          number: 1,
          label: "Ground Floor",
          canvasW: 600,
          canvasH: 260,
          rooms: [{
            id: "caba_r_stairs_r",
            name: "Stairs (Right)",
            type: "stairs",
            x: 558,
            y: 10,
            w: 34,
            h: 80,
            floorId: "f_caba_1",
            buildingId: "b_caba",
          }],
          paths: [],
          walls: [],
          doors: [],
          windows: [],
          furniture: [],
          stairs: [],
          ramps: [],
          elevators: [],
          labels: [],
        }],
      }],
    } as unknown as Campus;

    const floorPlan = resolveFloorPlanForEvent("b_caba", 1, campus);

    expect(floorPlan).not.toBeNull();
    expect(floorPlan).toMatchObject({
      canvasW: 600,
      canvasH: 260,
      rooms: [{ id: "caba_r_stairs_r", x: 558, w: 34 }],
    });
  });

  it("preserves every authored layer from the published live floor", () => {
    const publishedFloor = {
      id: "f_caba_1",
      buildingId: "b_caba",
      number: 1,
      label: "Ground Floor",
      canvasW: 600,
      canvasH: 450,
      backgroundColor: "#e8e1d7",
      appearance: { kind: "tile", color: "#e8e1d7" },
      showGrid: false,
      gridSize: 10,
      rooms: [{ id: "room-1", name: "CABA-101", type: "classroom", x: 20, y: 20, w: 100, h: 80 }],
      paths: [{ id: "path-1", points: [{ x: 10, y: 10 }, { x: 40, y: 40 }], type: "walkway", color: "#94a3b8", width: 4 }],
      walls: [{ id: "wall-1", x1: 10, y1: 10, x2: 110, y2: 10, thickness: 4, color: "#334155" }],
      doors: [{ id: "door-1", x: 50, y: 10, width: 18, wallId: "wall-1", color: "#c2410c", direction: "single" }],
      windows: [{ id: "window-1", x: 80, y: 10, width: 16, wallId: "wall-1", color: "#60a5fa" }],
      furniture: [{ id: "furniture-1", type: "desk", name: "Desk", x: 30, y: 30, width: 20, height: 12, color: "#64748b", rotation: 0 }],
      stairs: [{ id: "stairs-1", x: 120, y: 20, width: 30, height: 50, label: "Stairs", direction: "up", rotation: 0 }],
      ramps: [{ id: "ramp-1", x: 160, y: 20, width: 40, height: 20, label: "Ramp", rotation: 0 }],
      elevators: [{ id: "elevator-1", x: 210, y: 20, width: 30, height: 30, label: "Lift", rotation: 0 }],
      labels: [{ id: "label-1", x: 20, y: 120, text: "LOBBY", fontSize: 12, color: "#0f172a", rotation: 0 }],
      exteriorZones: [{ id: "zone-1", side: "bottom", offset: 0.5, width: 180, depth: 72, label: "Entrance", labelOffsetX: 0, labelOffsetY: 0, labelVisible: true }],
      entranceSteps: [{ id: "entry-steps-1", x: 20, y: 400, width: 70, height: 24, rotation: 0, accessible: false }],
      entranceRamps: [{ id: "entry-ramp-1", x: 100, y: 400, width: 90, height: 24, rotation: 0, accessible: true }],
    };
    const campus = {
      buildings: [{
        id: "b_caba",
        name: "CABA Building",
        visible: true,
        floors: [publishedFloor],
      }],
    } as unknown as Campus;

    const floorPlan = resolveFloorPlanForEvent("b_caba", 1, campus);

    expect(floorPlan).toMatchObject({
      appearance: publishedFloor.appearance,
      showGrid: false,
      gridSize: 10,
      paths: publishedFloor.paths,
      walls: publishedFloor.walls,
      doors: publishedFloor.doors,
      windows: publishedFloor.windows,
      furniture: publishedFloor.furniture,
      stairs: publishedFloor.stairs,
      ramps: publishedFloor.ramps,
      elevators: publishedFloor.elevators,
      labels: publishedFloor.labels,
      exteriorZones: publishedFloor.exteriorZones,
      entranceSteps: publishedFloor.entranceSteps,
      entranceRamps: publishedFloor.entranceRamps,
    });
  });
});

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
});

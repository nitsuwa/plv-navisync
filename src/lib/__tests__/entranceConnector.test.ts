import { describe, expect, it } from "vitest";
import { entranceConnectorGeometry } from "../entranceConnector";

const building = { x: 100, y: 100, width: 100, height: 80, rotation: 0 };

describe("Entrance outdoor connector geometry", () => {
  it.each([
    ["top", { x: 0, y: -1 }],
    ["right", { x: 1, y: 0 }],
    ["bottom", { x: 0, y: 1 }],
    ["left", { x: -1, y: 0 }],
  ] as const)("leaves the %s side before routing off-axis", (edge, direction) => {
    const result = entranceConnectorGeometry(building, { edge, offset: 0.5 },
      edge === "top" ? { x: 260, y: 60 } : edge === "right" ? { x: 260, y: 240 } : edge === "bottom" ? { x: 40, y: 240 } : { x: 40, y: 60 },
      [building], []);
    expect(result.blocked).toBe(false);
    expect(result.points.length).toBeGreaterThanOrEqual(3);
    const first = result.points[0];
    const stub = result.points[1];
    expect(Math.sign(stub.x - first.x)).toBe(direction.x);
    expect(Math.sign(stub.y - first.y)).toBe(direction.y);
  });

  it("chooses a valid outward stub for an off-axis target instead of crossing the building", () => {
    const result = entranceConnectorGeometry(building, { edge: "bottom", offset: 0.5 }, { x: 260, y: 220 }, [building], []);
    expect(result.blocked).toBe(false);
    expect(result.points[1].y).toBeGreaterThan(building.y + building.height);
    expect(result.bends.length).toBeGreaterThan(0);
  });

  it("collapses an effectively aligned target to a centered straight connector", () => {
    const result = entranceConnectorGeometry(building, { edge: "bottom", offset: 0.5 }, { x: 152, y: 240 }, [building], []);
    expect(result.blocked).toBe(false);
    expect(result.bends).toEqual([]);
    expect(result.points.at(-1)).toEqual({ x: 152, y: 240 });
  });

  it("reports genuinely blocked routes without removing the last route geometry", () => {
    const obstacle = { x: 190, y: 180, width: 80, height: 100, rotation: 0 };
    const result = entranceConnectorGeometry(building, { edge: "bottom", offset: 0.5 }, { x: 240, y: 240 }, [building, obstacle], []);
    expect(result.blocked).toBe(true);
    expect(result.points[0]).toEqual({ x: 150, y: 180 });
  });
});

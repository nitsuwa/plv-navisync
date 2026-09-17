import { describe, expect, it } from "vitest";
import { validateEventLayout } from "../eventLayoutValidation";

const item = (id: string, x: number, y: number, width = 20, height = 20) => ({
  id, type: "chair", name: "Chair", category: "event", x, y, width, height, rotation: 0, color: "#000", layer: "events" as const,
});

describe("validateEventLayout", () => {
  it("returns no warnings for a clean layout", () => {
    expect(validateEventLayout({ furniture: [item("a", 10, 10), item("b", 60, 10)], canvasWidth: 200, canvasHeight: 120 })).toEqual([]);
  });

  it("reports boundary, overlap, and blocked-region issues with item ids", () => {
    const warnings = validateEventLayout({
      furniture: [item("outside", -2, 10), item("overlap-a", 40, 40), item("overlap-b", 50, 45)],
      canvasWidth: 100,
      canvasHeight: 100,
      blockedRegions: [{ x: 0, y: 0, width: 20, height: 40, label: "Main door" }],
    });
    expect(warnings.some((warning) => warning.code === "outside-boundary" && warning.itemIds.includes("outside"))).toBe(true);
    expect(warnings.some((warning) => warning.code === "overlap" && warning.itemIds.join(",") === "overlap-a,overlap-b")).toBe(true);
    expect(warnings.some((warning) => warning.code === "blocked-access" && warning.itemIds.includes("outside") && /Main door/.test(warning.message))).toBe(true);
  });

  it("flags a narrow aisle without mutating the objects", () => {
    const furniture = [item("a", 10, 10, 20, 40), item("b", 34, 10, 20, 40)];
    const warnings = validateEventLayout({ furniture, canvasWidth: 100, canvasHeight: 100 });
    expect(warnings.some((warning) => warning.code === "narrow-aisle")).toBe(true);
    expect(furniture[0].x).toBe(10);
  });
});

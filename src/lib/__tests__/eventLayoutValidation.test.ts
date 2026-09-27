import { describe, expect, it } from "vitest";
import { validateEventLayout } from "../eventLayoutValidation";

const item = (id: string, x: number, y: number, width = 20, height = 20, rotation = 0) => ({
  id, type: "chair", name: "Chair", category: "event", x, y, width, height, rotation, color: "#000", layer: "events" as const,
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

  it("uses rotated footprints for boundary and overlap checks", () => {
    const warnings = validateEventLayout({
      furniture: [
        item("rotated-outside", 0, 0, 40, 20, 45),
        item("rotated-a", 42, 42, 44, 12, 45),
        item("rotated-b", 63, 63, 44, 12, 45),
      ],
      canvasWidth: 120,
      canvasHeight: 120,
    });

    expect(warnings.some((warning) => warning.code === "outside-boundary" && warning.itemIds.includes("rotated-outside"))).toBe(true);
    expect(warnings.some((warning) => warning.code === "overlap" && warning.itemIds.join(",") === "rotated-a,rotated-b")).toBe(true);
  });

  it("allows exact edge contact without reporting an overlap", () => {
    const warnings = validateEventLayout({
      furniture: [item("left", 10, 10, 20, 20), item("right", 30, 10, 20, 20)],
      canvasWidth: 100,
      canvasHeight: 100,
    });
    expect(warnings.some((warning) => warning.code === "overlap")).toBe(false);
  });

  it("supports the measured 0-to-1-to-3-to-0 committed warning transition", () => {
    const bases = [100, 400, 700].map((x, index) => item(`base-${index}`, x, 100));
    const partnerPositions = [100, 400, 700].map((x, index) => item(`partner-${index}`, x, 200));
    const layoutAt = (partners: typeof partnerPositions) => validateEventLayout({
      furniture: [...bases, ...partners],
      canvasWidth: 1000,
      canvasHeight: 800,
    });
    const warningCount = (partners: typeof partnerPositions) => layoutAt(partners).filter((warning) => warning.code === "overlap").length;

    expect(layoutAt(partnerPositions)).toHaveLength(0);
    expect(warningCount(partnerPositions.map((partner, index) => index === 0 ? { ...partner, y: 100 } : partner))).toBe(1);
    expect(warningCount(partnerPositions.map((partner, index) => index < 2 ? { ...partner, y: 100 } : partner))).toBe(2);
    expect(warningCount(partnerPositions.map((partner) => ({ ...partner, y: 100 })))).toBe(3);
    expect(warningCount(partnerPositions)).toBe(0);
  });
});

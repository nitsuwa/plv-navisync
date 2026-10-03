import { describe, expect, it } from "vitest";
import { EVENT_LAYOUT_PRESETS, buildEventPreset, fitEventPresetToCanvas, validateEventPresetDraft } from "../eventLayoutPresets";
import type { EventPresetDraft } from "../eventLayoutPresets";
import { validateEventLayout } from "../eventLayoutValidation";

describe("event layout presets", () => {
  it("centers an adjustable chair row and rotates it around the placement point", () => {
    let next = 0;
    const items = buildEventPreset("chair-row", { x: 150, y: 120 }, { count: 3, spacing: 40, rotation: 90 }, () => `chair-${++next}`);
    expect(items).toHaveLength(3);
    expect(items.map((item) => item.id)).toEqual(["chair-1", "chair-2", "chair-3"]);
    expect(items.every((item) => item.rotation === 90)).toBe(true);
    expect(items[1].x).toBeCloseTo(150 - items[1].width / 2);
    expect(items[1].y).toBeCloseTo(120 - items[1].height / 2);
    expect(items[2].y - items[1].y).toBeCloseTo(40);
  });
  it("creates deterministic ordinary furniture records with unique ids", () => {
    for (const preset of EVENT_LAYOUT_PRESETS) {
      let next = 0;
      const items = preset.create({ x: 40, y: 60 }, () => `${preset.id}-${++next}`);
      expect(items.length).toBeGreaterThan(0);
      expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
      expect(items.every((item) => item.category === "event" && item.layer === "events")).toBe(true);
      expect(items.every((item) => item.width > 0 && item.height > 0)).toBe(true);
    }
  });

  it("keeps the same preset geometry for the same origin", () => {
    const preset = EVENT_LAYOUT_PRESETS.find((item) => item.id === "chair-row")!;
    const create = () => {
      let next = 0;
      return preset.create({ x: 10, y: 20 }, () => `id-${++next}`);
    };
    expect(create()).toEqual(create());
  });

  it("creates 12 fixed-size chairs in rows of five with explicit clear gaps", () => {
    let sequence = 0;
    const items = buildEventPreset("chair-row", { x: 200, y: 200 }, {
      count: 12, chairsPerRow: 5, spacing: 34, rotation: 0,
      columnGap: 18, rowGap: 24, centerAisleGap: 0,
    }, () => `chair-${++sequence}`);
    const rows = [...new Set(items.map((item) => item.y))].sort((a, b) => a - b);
    expect(rows.map((y) => items.filter((item) => item.y === y).length)).toEqual([5, 5, 2]);
    expect(items.every((item) => item.width === 16 && item.height === 16)).toBe(true);
    expect(rows[1] - rows[0]).toBe(40);
    const firstRow = items.filter((item) => item.y === rows[0]).sort((a, b) => a.x - b.x);
    expect(firstRow[1].x - (firstRow[0].x + firstRow[0].width)).toBe(18);
    expect(new Set(items.map((item) => item.id)).size).toBe(12);
  });

  it("uses clear gaps and adds an aisle only between occupied halves of each row", () => {
    const create = (count: number, chairsPerRow: number) => {
      let next = 0;
      return buildEventPreset("chair-row", { x: 200, y: 200 }, {
        count, chairsPerRow, spacing: 34, rotation: 0,
        columnGap: 18, rowGap: 30, centerAisleGap: 24,
      }, () => `chair-${++next}`);
    };
    const odd = create(5, 5);
    const oddRow = odd.sort((a, b) => a.x - b.x);
    expect(oddRow[1].x - (oddRow[0].x + 16)).toBe(18);
    expect(oddRow[2].x - (oddRow[1].x + 16)).toBe(42);
    const even = create(8, 4);
    const evenRow = even.filter((item) => item.y === even[0].y).sort((a, b) => a.x - b.x);
    const evenRows = [...new Set(even.map((item) => item.y))].sort((a, b) => a - b);
    expect(evenRow[2].x - (evenRow[1].x + 16)).toBe(42);
    expect(evenRows[1] - evenRows[0]).toBe(46);
    const single = create(1, 1);
    expect(single).toHaveLength(1);
    expect(Number.isFinite(single[0].x)).toBe(true);
  });

  it.each([0, 90, 45])("preserves the same fixed footprint after %s degree batch rotation", (rotation) => {
    let next = 0;
    const items = buildEventPreset("chair-row", { x: 150, y: 120 }, {
      count: 6, chairsPerRow: 3, spacing: 34, columnGap: 18, rowGap: 24, rotation,
    }, () => `chair-${++next}`);
    expect(items).toHaveLength(6);
    expect(items.every((item) => item.width === 16 && item.height === 16 && item.rotation === rotation)).toBe(true);
  });

  it.each([
    ["empty count", { count: "" }, "Enter a chair count"],
    ["too many chairs", { count: "999" }, "between 1 and 500"],
    ["row exceeds count", { count: "12", chairsPerRow: "13" }, "cannot exceed the chair count"],
    ["invalid per-row", { count: "12", chairsPerRow: "0" }, "between 1 and 30"],
    ["invalid gap", { count: "12", chairsPerRow: "5", columnGap: "241" }, "between 0 and 240"],
  ])("rejects %s instead of silently clamping the requested layout", (_label, override, message) => {
    const draft: EventPresetDraft = {
      id: "chair-row",
      count: "12",
      chairsPerRow: "5",
      columnGap: "18",
      rowGap: "24",
      centerAisle: false,
      centerAisleGap: "24",
      rotation: "0",
      spacing: "34",
    };
    Object.assign(draft, override);
    expect(validateEventPresetDraft(draft).errors.join(" ")).toContain(message);
  });

  it("keeps all five ready-made layouts internally clear and within the map", () => {
    for (const preset of EVENT_LAYOUT_PRESETS) {
      const count = preset.id === "chair-row" ? 6 : 1;
      let next = 0;
      const items = fitEventPresetToCanvas(buildEventPreset(preset.id, { x: 220, y: 145 }, {
        count,
        chairsPerRow: 6,
        spacing: preset.id === "chair-row" ? 34 : 180,
        rotation: 0,
      }, () => `${preset.id}-${++next}`), 440, 290);
      const blocking = validateEventLayout({ furniture: items, canvasWidth: 440, canvasHeight: 290 })
        .filter((issue) => issue.severity === "critical" || issue.code === "overlap");
      expect(blocking, preset.name).toEqual([]);
      expect(items.every((item) => item.width > 0 && item.height > 0)).toBe(true);
    }
    expect(EVENT_LAYOUT_PRESETS.find((preset) => preset.id === "classroom-seating")?.description).toMatch(/one chair beside each table/i);
  });
});

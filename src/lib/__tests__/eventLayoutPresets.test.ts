import { describe, expect, it } from "vitest";
import { EVENT_LAYOUT_PRESETS } from "../eventLayoutPresets";

describe("event layout presets", () => {
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
});

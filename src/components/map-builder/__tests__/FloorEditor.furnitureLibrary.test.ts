import { describe, expect, it } from "vitest";
import { FURNITURE_CATEGORIES } from "../constants";

describe("Floor Editor furniture library", () => {
  it("exposes the complete restroom fixture set as ordinary reusable assets", () => {
    const restroom = FURNITURE_CATEGORIES.find((category) => category.id === "restroom");
    expect(restroom).toBeDefined();
    const types = new Set(restroom?.items.map((item) => item.type));
    expect([...[
      "toilet", "urinal", "sink", "double-sink", "faucet", "toilet-stall",
      "pwd-toilet-stall", "stall-partition", "mirror", "soap-dispenser",
      "tissue-dispenser", "hand-dryer", "restroom-trash-bin", "floor-drain",
    ]].every((type) => types.has(type))).toBe(true);
  });

  it("keeps stable dimensions for template-ready restroom records", () => {
    const restroom = FURNITURE_CATEGORIES.find((category) => category.id === "restroom")!;
    const normal = restroom.items.find((item) => item.type === "toilet-stall")!;
    const pwd = restroom.items.find((item) => item.type === "pwd-toilet-stall")!;
    expect(normal.width).toBeGreaterThan(0);
    expect(normal.height).toBeGreaterThan(0);
    expect(pwd.width).toBeGreaterThan(normal.width);
    expect(pwd.height).toBeGreaterThan(normal.height);
    expect(new Set(restroom.items.map((item) => item.type)).size).toBe(restroom.items.length);
  });
});

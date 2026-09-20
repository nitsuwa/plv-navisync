import { describe, expect, it } from "vitest";
import { isFocusedMapSurface, mapBackAction, type MapSurface } from "../mapSurface";

describe("map surface state", () => {
  it("treats only normal browsing as unfocused", () => {
    const focused: MapSurface[] = ["building-details", "floor-plan", "route-planner", "route-active"];

    expect(isFocusedMapSurface("browse")).toBe(false);
    focused.forEach((surface) => expect(isFocusedMapSurface(surface)).toBe(true));
  });

  it("closes search before a focused surface, then leaves normal browsing", () => {
    expect(mapBackAction("browse", true)).toBe("close-search");
    expect(mapBackAction("route-planner", false)).toBe("close-surface");
    expect(mapBackAction("building-details", false)).toBe("close-surface");
    expect(mapBackAction("browse", false)).toBe("leave");
  });
});

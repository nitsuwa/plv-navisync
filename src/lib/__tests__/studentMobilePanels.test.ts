import { describe, expect, it } from "vitest";
import { studentMobilePanelAvailableHeight } from "../studentMobilePanels";

describe("Student Map mobile panel bounds", () => {
  it.each([
    [568, 108, 0],
    [640, 108, 20],
    [664, 112, 0],
    [700, 116, 24],
  ])("reserves the header, bottom navigation, and safe area at %ipx viewport height", (height, top, safeBottom) => {
    expect(studentMobilePanelAvailableHeight(height, top, safeBottom))
      .toBe(Math.max(0, height - top - safeBottom - 76 - 12));
  });

  it("returns no negative panel space for very short or invalid viewports", () => {
    expect(studentMobilePanelAvailableHeight(140, 120, 24)).toBe(0);
    expect(studentMobilePanelAvailableHeight(Number.NaN, 120, 24)).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { shouldShowStudentRouteRestorePill, STUDENT_MOBILE_BOTTOM_NAV_HEIGHT, studentMobilePanelAvailableHeight } from "../studentMobilePanels";

describe("Student Map mobile panel bounds", () => {
  it.each([
    [568, 108, 0],
    [640, 108, 20],
    [664, 112, 0],
    [700, 116, 24],
  ])("reserves the measured header, safe area, bottom navigation, and map area at %ipx", (height, top, safeBottom) => {
    expect(studentMobilePanelAvailableHeight(height, top, safeBottom))
      .toBe(Math.max(0, height - safeBottom - STUDENT_MOBILE_BOTTOM_NAV_HEIGHT - Math.max(top + 12, height * 0.25)));
  });

  it("uses the taller measured header reserve when it exceeds the map visibility target", () => {
    expect(studentMobilePanelAvailableHeight(568, 180, 0)).toBe(568 - STUDENT_MOBILE_BOTTOM_NAV_HEIGHT - 192);
  });

  it("keeps a 25 percent map strip visible on short phones without shrinking larger screens", () => {
    expect(studentMobilePanelAvailableHeight(568, 68, 0)).toBe(365);
    expect(studentMobilePanelAvailableHeight(844, 68, 0)).toBe(844 - STUDENT_MOBILE_BOTTOM_NAV_HEIGHT - 211);
  });

  it("returns no negative panel space for very short or invalid viewports", () => {
    expect(studentMobilePanelAvailableHeight(140, 120, 24)).toBe(0);
    expect(studentMobilePanelAvailableHeight(Number.NaN, 120, 24)).toBe(0);
  });
});

describe("Student Map route restore pill priority", () => {
  it("shows a minimized route pill when no higher-priority surface is open", () => {
    expect(shouldShowStudentRouteRestorePill(true)).toBe(true);
    expect(shouldShowStudentRouteRestorePill(false)).toBe(false);
  });

  it.each([
    "scannerOpen",
    "buildingDetailsOpen",
    "roomDetailsOpen",
    "campusPlaceDetailsOpen",
    "locationPreviewOpen",
    "arrivalOverlayOpen",
    "reportDialogOpen",
    "mediaDialogOpen",
  ] as const)("temporarily hides the pill while %s owns the map surface", (surface) => {
    expect(shouldShowStudentRouteRestorePill(true, { [surface]: true })).toBe(false);
  });
});

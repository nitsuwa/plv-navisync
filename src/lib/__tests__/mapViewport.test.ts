import { describe, expect, it } from "vitest";
import {
  STUDENT_MAP_MAX_ZOOM,
  STUDENT_MAP_MIN_ZOOM,
  clampStudentMapZoom,
} from "../mapViewport";

describe("student map viewport", () => {
  it("keeps zoom-out above the readable map limit", () => {
    expect(clampStudentMapZoom(0.1)).toBe(STUDENT_MAP_MIN_ZOOM);
    expect(clampStudentMapZoom(STUDENT_MAP_MIN_ZOOM - 0.01)).toBe(STUDENT_MAP_MIN_ZOOM);
  });

  it("keeps zoom-in bounded and normalizes invalid values", () => {
    expect(clampStudentMapZoom(9)).toBe(STUDENT_MAP_MAX_ZOOM);
    expect(clampStudentMapZoom(Number.NaN)).toBe(1);
  });

  it("rounds valid zoom levels consistently", () => {
    expect(clampStudentMapZoom(1.236)).toBe(1.24);
  });
});

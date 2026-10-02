import { describe, expect, it } from "vitest";
import {
  getStudentInitialFloorZoom,
  STUDENT_MOBILE_PORTRAIT_FLOOR_ZOOM,
} from "../studentFloorCamera";

describe("student floor camera defaults", () => {
  it("opens portrait mobile floors at a more readable overview", () => {
    expect(getStudentInitialFloorZoom(true)).toBe(STUDENT_MOBILE_PORTRAIT_FLOOR_ZOOM);
    expect(getStudentInitialFloorZoom(true)).toBeGreaterThan(1);
  });

  it("keeps desktop and landscape at the normal full-floor fit", () => {
    expect(getStudentInitialFloorZoom(false)).toBe(1);
  });
});

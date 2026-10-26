import { describe, expect, it } from "vitest";
import { reportMapHref } from "../reportMapLink";

describe("reportMapHref", () => {
  it("opens the reported room, not just its building", () => {
    expect(reportMapHref({ campusId: "c1", buildingId: "b1", floorId: "f1", roomId: "r1" }))
      .toBe("/map?campusId=c1&buildingId=b1&floorId=f1&roomId=r1");
  });

  it("still targets the room when the floor is unknown", () => {
    expect(reportMapHref({ campusId: "c1", buildingId: "b1", roomId: "r1" }))
      .toBe("/map?campusId=c1&buildingId=b1&roomId=r1");
  });

  it("opens a reported campus place", () => {
    expect(reportMapHref({ campusId: "c1", campusPlaceId: "p1", roomId: undefined }))
      .toBe("/map?campusId=c1&placeId=p1");
  });

  it("falls back to the building for building-level reports", () => {
    expect(reportMapHref({ campusId: "c1", buildingId: "b1" })).toBe("/map?campusId=c1&buildingId=b1");
  });

  it("opens the plain map when the report has no location", () => {
    expect(reportMapHref({ campusId: null })).toBe("/map");
  });
});

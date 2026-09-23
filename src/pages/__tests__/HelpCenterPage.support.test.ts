import { describe, expect, it } from "vitest";
import { SERVICES } from "../HelpCenterPage";

describe("Help Center campus service links", () => {
  it("uses canonical building ids for map handoffs", () => {
    expect(SERVICES.map((service) => service.mapTo)).toEqual([
      "/map?buildingId=b2",
      "/map?buildingId=b2",
      "/map?buildingId=b2",
      "/map?buildingId=b3",
      "/map?buildingId=b2",
      "/map?buildingId=b2",
      "/map",
      "/map?buildingId=b2",
    ]);
  });
});

import { describe, expect, it } from "vitest";
import { nextDefaultBuildingIdentity } from "../buildingDefaults";

describe("nextDefaultBuildingIdentity", () => {
  it("allocates friendly unique defaults inside a campus", () => {
    expect(nextDefaultBuildingIdentity([])).toEqual({ name: "Building 1", code: "BLDG-01" });
    expect(nextDefaultBuildingIdentity([
      { name: "Building 1", code: "BLDG-01" },
      { name: "Building 2", code: "BLDG-02" },
    ])).toEqual({ name: "Building 3", code: "BLDG-03" });
  });

  it("does not reuse a code reserved by a deleted draft Building", () => {
    expect(nextDefaultBuildingIdentity([], [{ name: "Building 1", code: "BLDG-01" }])).toEqual({
      name: "Building 2",
      code: "BLDG-02",
    });
  });

  it("skips either side of a conflicting identity pair", () => {
    expect(nextDefaultBuildingIdentity([
      { name: "Building 1", code: "LEGACY" },
    ])).toEqual({ name: "Building 2", code: "BLDG-02" });
    expect(nextDefaultBuildingIdentity([
      { name: "Other", code: "BLDG-01" },
    ])).toEqual({ name: "Building 2", code: "BLDG-02" });
  });
});

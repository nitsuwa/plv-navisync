import { describe, expect, it } from "vitest";
import { nextBuildingCopyIdentity, nextDefaultBuildingIdentity } from "../buildingDefaults";

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

describe("nextBuildingCopyIdentity", () => {
  it("never carries the source code into a duplicate", () => {
    const identity = nextBuildingCopyIdentity(
      { name: "Building One", code: "B1" },
      [{ name: "Building One", code: "B1" }],
      [],
      "00000000-0000-0000-0000-1234abcd",
    );
    expect(identity.name).toBe("Building One (copy)");
    expect(identity.code).toBe("BLDG-01");
    expect(identity.code).not.toBe("B1");
  });

  it("keeps repeated copies unique even after an earlier copy is removed", () => {
    const first = nextBuildingCopyIdentity({ name: "Main", code: "MAIN" }, [{ name: "Main", code: "MAIN" }], [], "aaaa-1111");
    const second = nextBuildingCopyIdentity({ name: "Main", code: "MAIN" }, [{ name: "Main", code: "MAIN" }, first], [], "bbbb-2222");
    expect(first.code).toBe("BLDG-01");
    expect(second.code).toBe("BLDG-02");
    expect(second.code).not.toBe("MAIN");
  });
});

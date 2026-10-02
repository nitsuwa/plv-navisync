import { describe, expect, it } from "vitest";
import { requestedStudentPath, studentEntryPath } from "../studentEntry";

describe("student sign-in entry destination", () => {
  it("uses the configured landing page for a fresh normal entry", () => {
    expect(studentEntryPath(null, "home")).toBe("/home");
    expect(studentEntryPath(null, "map")).toBe("/map");
  });

  it("preserves a valid deep link regardless of the configured landing page", () => {
    const state = { from: "/map?buildingId=ceit#directions" };
    expect(studentEntryPath(state, "home")).toBe("/map?buildingId=ceit#directions");
    expect(requestedStudentPath({ from: "/home" })).toBe("/home");
  });

  it("ignores external and non-Student destinations", () => {
    expect(requestedStudentPath({ from: "//example.com/map" })).toBeNull();
    expect(requestedStudentPath({ from: "/admin-dashboard" })).toBeNull();
  });
});

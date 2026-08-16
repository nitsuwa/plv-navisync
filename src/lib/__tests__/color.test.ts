import { describe, it, expect } from "vitest";
import { shade } from "../color";

describe("shade", () => {
  it("keeps a color unchanged at 0%", () => {
    expect(shade("#123456", 0)).toBe("#123456");
    expect(shade("#22c55e", 0)).toBe("#22c55e");
  });

  it("lightens toward white with a positive percent", () => {
    expect(shade("#000000", 100)).toBe("#ffffff");
    expect(shade("#000000", 50)).toBe("#808080");
    expect(shade("#22c55e", 30)).toBe("#64d68e");
  });

  it("darkens toward black with a negative percent", () => {
    expect(shade("#ffffff", -100)).toBe("#000000");
    expect(shade("#ffffff", -50)).toBe("#808080");
    expect(shade("#22c55e", -30)).toBe("#188a42");
  });

  it("handles 3-digit hex colors", () => {
    expect(shade("#abc", 0)).toBe("#aabbcc");
    expect(shade("#fff", -20)).toBe("#cccccc");
    expect(shade("#000", 20)).toBe("#333333");
  });

  it("handles hex without a leading #", () => {
    expect(shade("22c55e", 0)).toBe("#22c55e");
  });

  it("returns invalid input unchanged", () => {
    expect(shade("red", 20)).toBe("red");
    expect(shade("", 10)).toBe("");
    expect(shade("#12345", 10)).toBe("#12345");
    expect(shade("#gggggg", 10)).toBe("#gggggg");
  });

  it("clamps percent at 100", () => {
    expect(shade("#123456", 200)).toBe("#ffffff");
    expect(shade("#123456", -200)).toBe("#000000");
  });
});

import { describe, expect, it } from "vitest";
import { studentMapUtilityRightInset } from "../studentMapUtilityLayout";

const profile = { left: 264, right: 312, top: 8, bottom: 56 };

describe("student map utility rail placement", () => {
  it("keeps a compact row on the right when its measured height clears the profile", () => {
    expect(studentMapUtilityRightInset({
      surfaceRight: 320,
      surfaceBottom: 568,
      utilityBottomInset: 393,
      utilityWidth: 194,
      utilityHeight: 44,
      accountRect: profile,
    })).toBe(12);
  });

  it("moves the rail left only when its rendered bounds overlap the profile", () => {
    expect(studentMapUtilityRightInset({
      surfaceRight: 320,
      surfaceBottom: 568,
      utilityBottomInset: 460,
      utilityWidth: 194,
      utilityHeight: 70,
      accountRect: profile,
    })).toBe(64);
  });

  it("uses the safe right inset when no profile control is present", () => {
    expect(studentMapUtilityRightInset({
      surfaceRight: 390,
      surfaceBottom: 844,
      utilityBottomInset: 420,
      utilityWidth: 194,
      utilityHeight: 44,
    })).toBe(12);
  });
});

import { describe, expect, it } from "vitest";
import { DEFAULT_NAVIBUDDY_APPEARANCE, isNaviBuddyLookDirty, NAVIBUDDY_BACKPACKS, NAVIBUDDY_OUTFITS, normalizeNaviBuddyAppearance } from "../naviBuddy";

describe("NaviBuddy appearance", () => {
  it("offers five outfits and three backpack choices with Classic as the unchanged default", () => {
    expect(NAVIBUDDY_OUTFITS).toEqual(["classic", "casual", "sporty", "plv_uniform", "adventurer"]);
    expect(NAVIBUDDY_BACKPACKS).toEqual(["classic", "compact", "none"]);
    expect(DEFAULT_NAVIBUDDY_APPEARANCE).toEqual({ outfit: "classic", backpack: "classic" });
  });

  it("normalizes unsupported values instead of applying arbitrary appearance data", () => {
    expect(normalizeNaviBuddyAppearance({ outfit: "admin", backpack: "large", companionEnabled: false })).toEqual({
      outfit: "classic", backpack: "classic",
    });
    expect(normalizeNaviBuddyAppearance(null)).toBe(DEFAULT_NAVIBUDDY_APPEARANCE);
  });

  it("keeps previously saved Scholar looks as the new PLV Uniform", () => {
    expect(normalizeNaviBuddyAppearance({ outfit: "scholar", backpack: "compact", companionEnabled: false })).toEqual({
      outfit: "plv_uniform", backpack: "compact",
    });
  });

  it("keeps previously saved Varsity looks as the new Adventurer outfit", () => {
    expect(normalizeNaviBuddyAppearance({ outfit: "varsity", backpack: "compact", companionEnabled: false })).toEqual({
      outfit: "adventurer", backpack: "compact",
    });
  });

  it("marks outfit or backpack changes dirty and becomes clean again when restored", () => {
    const changed = { ...DEFAULT_NAVIBUDDY_APPEARANCE, outfit: "adventurer" as const };
    expect(isNaviBuddyLookDirty(DEFAULT_NAVIBUDDY_APPEARANCE, DEFAULT_NAVIBUDDY_APPEARANCE)).toBe(false);
    expect(isNaviBuddyLookDirty(changed, DEFAULT_NAVIBUDDY_APPEARANCE)).toBe(true);
    expect(isNaviBuddyLookDirty({ ...changed, outfit: "classic" }, DEFAULT_NAVIBUDDY_APPEARANCE)).toBe(false);
    expect(isNaviBuddyLookDirty({ ...DEFAULT_NAVIBUDDY_APPEARANCE, backpack: "compact" }, DEFAULT_NAVIBUDDY_APPEARANCE)).toBe(true);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_NAVIBUDDY_APPEARANCE } from "../../lib/naviBuddy";

const auth = vi.hoisted(() => ({
  user: { id: "student-a", user_metadata: { navibuddy_preferences: { outfit: "varsity", backpack: "compact", companionEnabled: false }, student_preferences: { reportStatus: false } } } as { id: string; user_metadata?: Record<string, unknown> } | null,
  getUser: vi.fn(), updateUser: vi.fn(),
}));
vi.mock("../../lib/supabase", () => ({ supabase: { auth: { getUser: auth.getUser, updateUser: auth.updateUser } } }));

import { loadNaviBuddyAppearance, saveNaviBuddyAppearance } from "../naviBuddyPreferencesService";

describe("NaviBuddy preference persistence", () => {
  beforeEach(() => {
    auth.getUser.mockClear();
    auth.updateUser.mockClear();
    auth.user = { id: "student-a", user_metadata: { navibuddy_preferences: { outfit: "varsity", backpack: "compact", companionEnabled: false }, student_preferences: { reportStatus: false } } };
    auth.getUser.mockResolvedValue({ data: { user: auth.user }, error: null });
    auth.updateUser.mockResolvedValue({ error: null });
    localStorage.clear();
  });

  it("loads a student's saved look with legacy Varsity mapped to Adventurer and ignores another account's preference", async () => {
    await expect(loadNaviBuddyAppearance("student-a", true)).resolves.toEqual({ outfit: "adventurer", backpack: "compact" });
    await expect(loadNaviBuddyAppearance("student-b", true)).resolves.toEqual(DEFAULT_NAVIBUDDY_APPEARANCE);
  });

  it("migrates the former Scholar preset and ignores the obsolete reaction preference", async () => {
    auth.user = { id: "student-a", user_metadata: { navibuddy_preferences: { outfit: "scholar", backpack: "compact", companionEnabled: false } } };
    auth.getUser.mockResolvedValue({ data: { user: auth.user }, error: null });
    await expect(loadNaviBuddyAppearance("student-a", true)).resolves.toEqual({ outfit: "plv_uniform", backpack: "compact" });
  });

  it("migrates the former Varsity preset and ignores the obsolete reaction preference", async () => {
    auth.user = { id: "student-a", user_metadata: { navibuddy_preferences: { outfit: "varsity", backpack: "compact", companionEnabled: false } } };
    auth.getUser.mockResolvedValue({ data: { user: auth.user }, error: null });
    await expect(loadNaviBuddyAppearance("student-a", true)).resolves.toEqual({ outfit: "adventurer", backpack: "compact" });
  });

  it("saves only the validated NaviBuddy metadata key for the active student", async () => {
    await saveNaviBuddyAppearance("student-a", true, { outfit: "sporty", backpack: "none" });
    expect(auth.updateUser).toHaveBeenCalledWith({ data: { navibuddy_preferences: { outfit: "sporty", backpack: "none" } } });
    expect(auth.updateUser.mock.calls[0][0].data).not.toHaveProperty("student_preferences");
    await expect(saveNaviBuddyAppearance("student-b", true, DEFAULT_NAVIBUDDY_APPEARANCE)).rejects.toThrow("active account changed");
  });

  it("keeps guests on Classic and ignores the old local reaction preference", async () => {
    localStorage.setItem("plv_navibuddy_guest_companion_v1", "off");
    await expect(loadNaviBuddyAppearance(null, false)).resolves.toEqual(DEFAULT_NAVIBUDDY_APPEARANCE);
    await expect(saveNaviBuddyAppearance(null, false, { outfit: "adventurer", backpack: "compact" })).resolves.toEqual(DEFAULT_NAVIBUDDY_APPEARANCE);
    await expect(loadNaviBuddyAppearance(null, false)).resolves.toEqual(DEFAULT_NAVIBUDDY_APPEARANCE);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
});

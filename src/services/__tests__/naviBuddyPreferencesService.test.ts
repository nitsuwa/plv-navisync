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
    await expect(loadNaviBuddyAppearance("student-a", true)).resolves.toEqual({ outfit: "adventurer", backpack: "compact", companionEnabled: false });
    await expect(loadNaviBuddyAppearance("student-b", true)).resolves.toEqual(DEFAULT_NAVIBUDDY_APPEARANCE);
  });

  it("migrates the former Scholar preset to PLV Uniform without losing backpack or companion choices", async () => {
    auth.user = { id: "student-a", user_metadata: { navibuddy_preferences: { outfit: "scholar", backpack: "compact", companionEnabled: false } } };
    auth.getUser.mockResolvedValue({ data: { user: auth.user }, error: null });
    await expect(loadNaviBuddyAppearance("student-a", true)).resolves.toEqual({ outfit: "plv_uniform", backpack: "compact", companionEnabled: false });
  });

  it("migrates the former Varsity preset to Adventurer without losing backpack or companion choices", async () => {
    auth.user = { id: "student-a", user_metadata: { navibuddy_preferences: { outfit: "varsity", backpack: "compact", companionEnabled: false } } };
    auth.getUser.mockResolvedValue({ data: { user: auth.user }, error: null });
    await expect(loadNaviBuddyAppearance("student-a", true)).resolves.toEqual({ outfit: "adventurer", backpack: "compact", companionEnabled: false });
  });

  it("saves only the validated NaviBuddy metadata key for the active student", async () => {
    await saveNaviBuddyAppearance("student-a", true, { outfit: "sporty", backpack: "none", companionEnabled: true });
    expect(auth.updateUser).toHaveBeenCalledWith({ data: { navibuddy_preferences: { outfit: "sporty", backpack: "none", companionEnabled: true } } });
    await expect(saveNaviBuddyAppearance("student-b", true, DEFAULT_NAVIBUDDY_APPEARANCE)).rejects.toThrow("active account changed");
  });

  it("keeps guests on Classic and stores only the optional companion toggle locally", async () => {
    await saveNaviBuddyAppearance(null, false, { outfit: "adventurer", backpack: "compact", companionEnabled: false });
    await expect(loadNaviBuddyAppearance(null, false)).resolves.toEqual({ ...DEFAULT_NAVIBUDDY_APPEARANCE, companionEnabled: false });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database.generated";
import {
  DEFAULT_STUDENT_PREFERENCES,
  loadStudentPreferences,
  saveStudentPreferences,
  type StudentNotificationPreferences,
} from "../studentPreferencesService";

function remoteClient(user: { id: string; user_metadata?: Record<string, unknown> } | null = { id: "user-1" }) {
  const getUser = vi.fn().mockResolvedValue({ data: { user }, error: null });
  const updateUser = vi.fn().mockResolvedValue({ data: { user }, error: null });
  return {
    client: { auth: { getUser, updateUser } } as unknown as SupabaseClient<Database>,
    getUser,
    updateUser,
  };
}

describe("student notification preferences", () => {
  beforeEach(() => localStorage.clear());

  it("returns safe defaults when no saved preferences exist", async () => {
    const { client } = remoteClient({ id: "user-1" });
    await expect(loadStudentPreferences(client)).resolves.toEqual(DEFAULT_STUDENT_PREFERENCES);
  });

  it("loads preferences from authenticated user metadata", async () => {
    const preferences: StudentNotificationPreferences = {
      mapUpdates: false,
      reportStatus: true,
      campusEvents: true,
    };
    const { client } = remoteClient({ id: "user-1", user_metadata: { student_preferences: preferences } });
    await expect(loadStudentPreferences(client)).resolves.toEqual(preferences);
  });

  it("persists authenticated preferences through Supabase Auth metadata", async () => {
    const preferences: StudentNotificationPreferences = {
      mapUpdates: false,
      reportStatus: false,
      campusEvents: true,
    };
    const { client, updateUser } = remoteClient();
    await expect(saveStudentPreferences(preferences, client)).resolves.toEqual(preferences);
    expect(updateUser).toHaveBeenCalledWith({ data: { student_preferences: preferences } });
  });

  it("keeps demo preferences account-scoped in local storage", async () => {
    const preferences = { mapUpdates: false, reportStatus: true, campusEvents: true };
    const { client } = remoteClient(null);
    await saveStudentPreferences(preferences, client);
    await expect(loadStudentPreferences(client)).resolves.toEqual(preferences);
  });
});

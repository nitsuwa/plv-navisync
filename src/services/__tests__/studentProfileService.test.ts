import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database.generated";
import {
  updateStudentProfile,
  uploadStudentAvatar,
} from "../studentProfileService";

function profileClient() {
  const single = vi.fn().mockResolvedValue({
    data: { id: "user-1", first_name: "Maria", last_name: "Santos", avatar_path: null },
    error: null,
  });
  const eq = vi.fn(() => ({ select: vi.fn(() => ({ single })) }));
  const update = vi.fn(() => ({ eq }));
  const getUser = vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  return {
    client: { auth: { getUser }, from: vi.fn(() => ({ update })) } as unknown as SupabaseClient<Database>,
    getUser,
    update,
    eq,
    single,
  };
}

describe("student profile service", () => {
  it("updates only safe profile fields for the current user", async () => {
    const { client, update, eq } = profileClient();
    await updateStudentProfile({ firstName: " Maria ", lastName: " Santos " }, client);
    expect(update).toHaveBeenCalledWith({ first_name: "Maria", last_name: "Santos" });
    expect(eq).toHaveBeenCalledWith("id", "user-1");
  });

  it("uploads avatars under the authenticated user's private folder and returns a signed URL", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: "https://signed/avatar" }, error: null });
    const { client } = profileClient();
    (client as any).storage = {
      from: vi.fn(() => ({ upload, createSignedUrl })),
    };

    const result = await uploadStudentAvatar(new Blob(["avatar"], { type: "image/png" }), client);
    expect(upload).toHaveBeenCalledWith(expect.stringMatching(/^user-1\/[0-9a-f-]+\.png$/), expect.any(Blob), {
      contentType: "image/png",
      upsert: false,
    });
    expect(result.url).toBe("https://signed/avatar");
  });
});

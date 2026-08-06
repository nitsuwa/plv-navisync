import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database.generated";
import {
  authRedirectUrl,
  loadActiveStudentProfile,
  normalizeStudentNumber,
  registerStudent,
  requestStudentPasswordReset,
  splitStudentName,
  validateStudentRegistration,
} from "../studentAccount";

function authClient(overrides: Record<string, unknown> = {}) {
  return {
    auth: {
      signUp: vi.fn().mockResolvedValue({ data: { user: null, session: null }, error: null }),
      resetPasswordForEmail: vi.fn().mockResolvedValue({ data: {}, error: null }),
      ...overrides,
    },
  } as unknown as SupabaseClient<Database>;
}

describe("student account helpers", () => {
  it("splits and normalizes student identity fields", () => {
    expect(splitStudentName("  Maria Clara Santos  ")).toEqual({
      firstName: "Maria Clara",
      lastName: "Santos",
    });
    expect(normalizeStudentNumber(" 2026 - 00123 ")).toBe("2026 - 00123");
  });

  it("returns clear errors for incomplete or unsafe registration input", () => {
    expect(validateStudentRegistration({
      fullName: "Maria",
      email: "not-an-email",
      studentNumber: "x!",
      password: "short",
      confirmPassword: "different",
    })).toEqual({
      fullName: "Enter both your first and last name.",
      email: "Enter a valid email address.",
      studentNumber: "Use 4-32 letters, numbers, spaces, or hyphens.",
      password: "Password must be at least 8 characters.",
      confirmPassword: "Passwords do not match.",
    });
  });

  it("registers with reviewed profile metadata and no authorization metadata", async () => {
    const client = authClient();
    await registerStudent({
      fullName: "Maria Clara Santos",
      email: " Maria@Example.edu.ph ",
      studentNumber: "2026-00123",
      password: "correct-horse",
      confirmPassword: "correct-horse",
    }, client, "https://navisync.example");

    expect(client.auth.signUp).toHaveBeenCalledWith({
      email: "maria@example.edu.ph",
      password: "correct-horse",
      options: {
        emailRedirectTo: "https://navisync.example/auth/callback?flow=signup",
        data: {
          first_name: "Maria Clara",
          last_name: "Santos",
          student_number: "2026-00123",
        },
      },
    });
    const payload = vi.mocked(client.auth.signUp).mock.calls[0][0];
    expect(payload.options?.data).not.toHaveProperty("role");
    expect(payload.options?.data).not.toHaveProperty("is_active");
  });

  it("builds an absolute recovery redirect", async () => {
    const client = authClient();
    expect(authRedirectUrl("/auth/callback", "https://navisync.example/mobile/path")).toBe("https://navisync.example/auth/callback");
    await requestStudentPasswordReset(" Student@Example.com ", client, "https://navisync.example");
    expect(client.auth.resetPasswordForEmail).toHaveBeenCalledWith("student@example.com", {
      redirectTo: "https://navisync.example/auth/reset-password?flow=recovery",
    });
  });

  it("enforces an active student profile after Auth succeeds", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: "user-1", role: "student", is_active: true },
      error: null,
    });
    const client = {
      from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })) })),
    } as unknown as SupabaseClient<Database>;

    await expect(loadActiveStudentProfile("user-1", client)).resolves.toMatchObject({ role: "student", is_active: true });

    maybeSingle.mockResolvedValueOnce({ data: { id: "user-1", role: "admin", is_active: true }, error: null });
    await expect(loadActiveStudentProfile("user-1", client)).rejects.toThrow("profile_role");

    maybeSingle.mockResolvedValueOnce({ data: { id: "user-1", role: "student", is_active: false }, error: null });
    await expect(loadActiveStudentProfile("user-1", client)).rejects.toThrow("profile_inactive");
  });
});

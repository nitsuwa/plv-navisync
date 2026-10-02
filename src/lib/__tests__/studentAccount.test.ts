import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database.generated";
import {
  authRedirectUrl,
  friendlyAccountError,
  formatStudentNumberInput,
  loadActiveStudentProfile,
  normalizeStudentNumber,
  checkStudentIdAvailability,
  isObfuscatedDuplicateEmail,
  registerStudent,
  resendStudentVerification,
  requestStudentPasswordReset,
  splitStudentName,
  updateStudentPassword,
  validateStudentRegistration,
  updateRecoveredPassword,
} from "../studentAccount";

function authClient(overrides: Record<string, unknown> = {}) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    auth: {
      signUp: vi.fn().mockResolvedValue({ data: { user: null, session: null }, error: null }),
      resend: vi.fn().mockResolvedValue({ data: {}, error: null }),
      resetPasswordForEmail: vi.fn().mockResolvedValue({ data: {}, error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: { email: "student@example.com" } }, error: null }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }),
      updateUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }),
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
    expect(normalizeStudentNumber("233314")).toBe("23-3314");
    expect(normalizeStudentNumber(" 23-3314 ")).toBe("23-3314");
  });

  it("formats Student ID typing and paste as NN-NNNN", () => {
    expect(formatStudentNumberInput("233314")).toBe("23-3314");
    expect(formatStudentNumberInput("23-3314")).toBe("23-3314");
    expect(formatStudentNumberInput("2A-3314")).toBe("23-314");
    expect(formatStudentNumberInput("23-33145")).toBe("23-3314");
  });

  it("returns clear errors for incomplete or unsafe registration input", () => {
    expect(validateStudentRegistration({
      fullName: "Maria",
      email: "not-an-email",
      studentNumber: "23-331",
      password: "short",
      confirmPassword: "different",
    })).toEqual({
      fullName: "Enter both your first and last name.",
      email: "Enter a valid email address.",
      studentNumber: "Enter your complete Student ID.",
      password: "Password must be at least 8 characters.",
      confirmPassword: "Passwords do not match.",
    });
  });

  it("registers with reviewed profile metadata and no authorization metadata", async () => {
    const client = authClient();
    await registerStudent({
      fullName: "Maria Clara Santos",
      email: " Maria@Example.edu.ph ",
      studentNumber: "23-3314",
      password: "correct-horse",
      confirmPassword: "correct-horse",
    }, client, "https://navisync.example");

    expect(client.auth.signUp).toHaveBeenCalledWith({
      email: "maria@example.edu.ph",
      password: "correct-horse",
      options: {
        emailRedirectTo: "https://navisync.example/auth/callback",
        data: {
          first_name: "Maria Clara",
          last_name: "Santos",
          student_number: "23-3314",
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
      redirectTo: "https://navisync.example/auth/reset-password",
    });
  });

  it("rejects malformed Student IDs and humanizes duplicate-ID failures", () => {
    for (const studentNumber of ["23-331", "2A-3314", "23-33145", "23 3314", "23--3314"]) {
      expect(validateStudentRegistration({
        fullName: "Maria Santos",
        email: "maria@gmail.com",
        studentNumber,
        password: "correct-horse",
        confirmPassword: "correct-horse",
      }).studentNumber).toBeTruthy();
    }
    expect(friendlyAccountError("duplicate key violates profiles_student_number_uq"))
      .toBe("This Student ID is already registered.");
    expect(friendlyAccountError("Database error saving new user"))
      .toBe("We couldn't create this account. Check your details and try again.");
    expect(friendlyAccountError("User already registered"))
      .toBe("An account already uses this email.");
  });

  it("checks one formatted Student ID and handles Supabase's obfuscated duplicate-email response", async () => {
    const client = authClient();
    await expect(checkStudentIdAvailability("233314", client)).resolves.toBe(true);
    expect(client.rpc).toHaveBeenCalledWith("check_student_id_availability", { p_student_number: "23-3314" });
    await expect(checkStudentIdAvailability("23-331", client)).rejects.toThrow("student_id_format_invalid");
    client.rpc = vi.fn().mockResolvedValue({ data: null, error: null }) as never;
    await expect(checkStudentIdAvailability("23-3314", client)).rejects.toThrow("student_id_availability_invalid_response");
    expect(isObfuscatedDuplicateEmail({ identities: [] })).toBe(true);
    expect(isObfuscatedDuplicateEmail({ identities: [{ provider: "email" }] })).toBe(false);
    expect(isObfuscatedDuplicateEmail(null)).toBe(false);
  });

  it("uses the current origin for signup and resend callback URLs", async () => {
    const client = authClient();
    await registerStudent({
      fullName: "Maria Clara Santos",
      email: "maria@gmail.com",
      studentNumber: "233314",
      password: "correct-horse",
      confirmPassword: "correct-horse",
    }, client, "https://plvnavisync.vercel.app");
    expect(client.auth.signUp).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({ emailRedirectTo: "https://plvnavisync.vercel.app/auth/callback" }),
    }));
    await resendStudentVerification("maria@gmail.com", client, "https://plvnavisync.vercel.app");
    expect(client.auth.resend).toHaveBeenCalledWith({
      type: "signup",
      email: "maria@gmail.com",
      options: { emailRedirectTo: "https://plvnavisync.vercel.app/auth/callback" },
    });
  });

  it("verifies the current password before updating it", async () => {
    const client = authClient();
    await updateStudentPassword("old-password", "new-password", client);
    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "student@example.com",
      password: "old-password",
    });
    expect(client.auth.updateUser).toHaveBeenCalledWith({ password: "new-password" });
  });

  it("updates the password through the verified Supabase recovery session", async () => {
    const client = authClient();
    await updateRecoveredPassword("new-password", client);
    expect(client.auth.updateUser).toHaveBeenCalledWith({ password: "new-password" });
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

    maybeSingle.mockResolvedValueOnce({ data: { id: "user-1", role: "student_org", is_active: true }, error: null });
    await expect(loadActiveStudentProfile("user-1", client)).resolves.toMatchObject({ role: "student_org", is_active: true });

    maybeSingle.mockResolvedValueOnce({ data: { id: "user-1", role: "admin", is_active: true }, error: null });
    await expect(loadActiveStudentProfile("user-1", client)).rejects.toThrow("profile_role");

    maybeSingle.mockResolvedValueOnce({ data: { id: "user-1", role: "student", is_active: false }, error: null });
    await expect(loadActiveStudentProfile("user-1", client)).rejects.toThrow("profile_inactive");
  });
});

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "../types/database.generated";
import { getSupabase } from "./supabase";

export const MIN_ACCOUNT_PASSWORD_LENGTH = 8;

export interface StudentRegistrationInput {
  fullName: string;
  email: string;
  studentNumber: string;
  password: string;
  confirmPassword: string;
}

export type StudentRegistrationErrors = Partial<Record<keyof StudentRegistrationInput, string>>;
export type StudentProfile = Tables<"profiles">;

export function splitStudentName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { firstName: parts[0] ?? "", lastName: "" };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts.at(-1) ?? "",
  };
}

export function normalizeStudentNumber(studentNumber: string): string {
  return studentNumber.trim().replace(/\s+/g, " ").toUpperCase();
}

export function validateStudentRegistration(input: StudentRegistrationInput): StudentRegistrationErrors {
  const errors: StudentRegistrationErrors = {};
  const { firstName, lastName } = splitStudentName(input.fullName);
  const email = input.email.trim();
  const studentNumber = normalizeStudentNumber(input.studentNumber);

  if (!firstName || !lastName) {
    errors.fullName = "Enter both your first and last name.";
  } else if (firstName.length > 100 || lastName.length > 100) {
    errors.fullName = "Each name must be 100 characters or fewer.";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Enter a valid email address.";
  }

  if (!/^[A-Z0-9]+(?:[ -][A-Z0-9]+)*$/.test(studentNumber) || studentNumber.length < 4 || studentNumber.length > 32) {
    errors.studentNumber = "Use 4-32 letters, numbers, spaces, or hyphens.";
  }

  if (input.password.length < MIN_ACCOUNT_PASSWORD_LENGTH) {
    errors.password = `Password must be at least ${MIN_ACCOUNT_PASSWORD_LENGTH} characters.`;
  }

  if (input.password !== input.confirmPassword) {
    errors.confirmPassword = "Passwords do not match.";
  }

  return errors;
}

export function authRedirectUrl(path: string, origin?: string): string {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "http://localhost");
  return new URL(path, base).toString();
}

export function friendlyAccountError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("email not confirmed")) return "Verify your email before signing in.";
  if (normalized.includes("already registered") || normalized.includes("already exists")) {
    return "An account may already use those details. Try signing in or resetting your password.";
  }
  if (normalized.includes("rate limit") || normalized.includes("too many")) {
    return "Too many requests. Wait a moment and try again.";
  }
  if (normalized.includes("password")) return "The password does not meet the security requirements.";
  if (normalized.includes("student number") || normalized.includes("database error")) {
    return "Those student details could not be registered. Check them or contact support.";
  }
  return "The account request could not be completed. Please try again.";
}

export async function registerStudent(
  input: StudentRegistrationInput,
  client: SupabaseClient<Database> = getSupabase(),
  origin?: string,
) {
  const errors = validateStudentRegistration(input);
  if (Object.keys(errors).length > 0) {
    throw new Error("Student registration input is invalid.");
  }

  const { firstName, lastName } = splitStudentName(input.fullName);
  return client.auth.signUp({
    email: input.email.trim().toLowerCase(),
    password: input.password,
    options: {
      emailRedirectTo: authRedirectUrl("/auth/callback?flow=signup", origin),
      data: {
        first_name: firstName,
        last_name: lastName,
        student_number: normalizeStudentNumber(input.studentNumber),
      },
    },
  });
}

export async function resendStudentVerification(
  email: string,
  client: SupabaseClient<Database> = getSupabase(),
  origin?: string,
) {
  return client.auth.resend({
    type: "signup",
    email: email.trim().toLowerCase(),
    options: { emailRedirectTo: authRedirectUrl("/auth/callback?flow=signup", origin) },
  });
}

export async function requestStudentPasswordReset(
  email: string,
  client: SupabaseClient<Database> = getSupabase(),
  origin?: string,
) {
  return client.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: authRedirectUrl("/auth/reset-password?flow=recovery", origin),
  });
}

export async function updateRecoveredPassword(
  password: string,
  client: SupabaseClient<Database> = getSupabase(),
) {
  return client.auth.updateUser({ password });
}

export async function loadActiveStudentProfile(
  userId: string,
  client: SupabaseClient<Database> = getSupabase(),
): Promise<StudentProfile> {
  const { data, error } = await client
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) throw new Error("profile_missing");
  if (data.role !== "student") throw new Error("profile_role");
  if (!data.is_active) throw new Error("profile_inactive");
  return data;
}

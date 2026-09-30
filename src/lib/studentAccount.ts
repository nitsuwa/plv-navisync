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

/** Supabase intentionally returns an obfuscated empty-identity user for an
 * existing email when confirmation is enabled. Use only that response shape;
 * never query auth.users or expose profile/account details to the browser. */
export function isObfuscatedDuplicateEmail(user: { identities?: readonly unknown[] | null } | null | undefined): boolean {
  return !!user && Array.isArray(user.identities) && user.identities.length === 0;
}

/** Minimal registration preflight; the database unique index remains authoritative. */
export async function checkStudentIdAvailability(
  studentNumber: string,
  client: SupabaseClient<Database> = getSupabase(),
): Promise<boolean> {
  const normalized = normalizeStudentNumber(studentNumber);
  if (!/^\d{2}-\d{4}$/.test(normalized)) throw new Error("student_id_format_invalid");
  const { data, error } = await client.rpc("check_student_id_availability", {
    p_student_number: normalized,
  });
  if (error) throw error;
  return data === true;
}

export function splitStudentName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { firstName: parts[0] ?? "", lastName: "" };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts.at(-1) ?? "",
  };
}

/** Format the numeric Student ID input as NN-NNNN while the user types. */
export function formatStudentNumberInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 6);
  return digits.length > 2 ? `${digits.slice(0, 2)}-${digits.slice(2)}` : digits;
}

/** Normalize an already formatted ID, or a six-digit unformatted paste. */
export function normalizeStudentNumber(studentNumber: string): string {
  const value = studentNumber.trim();
  if (/^\d{6}$/.test(value)) return `${value.slice(0, 2)}-${value.slice(2)}`;
  return value;
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

  if (!/^\d{2}-\d{4}$/.test(studentNumber)) {
    const idDigits = input.studentNumber.replace(/\D/g, "");
    const isIncomplete = idDigits.length < 6 && /^[\d -]*$/.test(input.studentNumber);
    errors.studentNumber = isIncomplete ? "Enter your complete Student ID." : "Use the format 23-3314.";
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
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : null);
  if (!base) throw new Error("auth_redirect_origin_unavailable");
  return new URL(path, base).toString();
}

export function friendlyAccountError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("email not confirmed")) return "Verify your email before signing in.";
  if (normalized.includes("profiles_student_number_uq") || normalized.includes("student id is already registered") || normalized.includes("student number is already registered")) {
    return "This Student ID is already registered.";
  }
  if (normalized.includes("email_exists") || normalized.includes("user_already_exists") || normalized.includes("user already registered") || normalized.includes("email already registered") || normalized.includes("email already exists")) {
    return "An account already uses this email.";
  }
  if (normalized.includes("already registered") || normalized.includes("already exists")) {
    return "An account already uses this email.";
  }
  if (normalized.includes("email rate limit")) {
    return "Please wait before requesting another email.";
  }
  if (normalized.includes("rate limit") || normalized.includes("too many")) {
    return "Too many attempts. Please wait and try again.";
  }
  if (normalized.includes("failed to fetch") || normalized.includes("network") || normalized.includes("fetch error")) {
    return "We couldn't complete the request. Check your connection and try again.";
  }
  if (normalized.includes("password")) return "The password does not meet the security requirements.";
  if (normalized.includes("invalid login credentials")) return "Email or password is incorrect.";
  if (normalized.includes("student number") || normalized.includes("student id")) {
    return "Check your Student ID and try again.";
  }
  if (normalized.includes("database error saving new user")) {
    return "We couldn't create this account. Check your details and try again.";
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
      emailRedirectTo: authRedirectUrl("/auth/callback", origin),
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
    options: { emailRedirectTo: authRedirectUrl("/auth/callback", origin) },
  });
}

export async function requestStudentPasswordReset(
  email: string,
  client: SupabaseClient<Database> = getSupabase(),
  origin?: string,
) {
  return client.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: authRedirectUrl("/auth/reset-password", origin),
  });
}

export async function updateRecoveredPassword(
  password: string,
  client: SupabaseClient<Database> = getSupabase(),
) {
  return client.auth.updateUser({ password });
}

export async function updateStudentPassword(
  currentPassword: string,
  nextPassword: string,
  client: SupabaseClient<Database> = getSupabase(),
) {
  const { data, error: userError } = await client.auth.getUser();
  if (userError || !data.user?.email) throw userError ?? new Error("student_auth_required");

  const { error: verificationError } = await client.auth.signInWithPassword({
    email: data.user.email,
    password: currentPassword,
  });
  if (verificationError) throw verificationError;

  const { data: updated, error } = await client.auth.updateUser({ password: nextPassword });
  if (error) throw error;
  return updated;
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
  if (data.role !== "student" && data.role !== "student_org") throw new Error("profile_role");
  if (!data.is_active) throw new Error("profile_inactive");
  return data;
}

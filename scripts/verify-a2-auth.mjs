/**
 * Repeatable live A2 Auth verification.
 *
 * Uses only the publishable key and disposable demo student credentials from
 * .env.local. It verifies hosted Auth configuration, student profile/session
 * enforcement, refresh persistence, sign-out, and denial of password changes
 * without a recovery/authenticated session. It sends no email and uses no
 * service-role key.
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(path) {
  const values = {};
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function required(values, key) {
  const value = values[key];
  if (!value) throw new Error(`Missing ${key} in .env.local`);
  return value;
}

function expect(condition, label) {
  if (!condition) throw new Error(label);
  console.log(`PASS ${label}`);
}

const env = loadEnvFile(".env.local");
const url = required(env, "VITE_SUPABASE_URL");
const key = required(env, "VITE_SUPABASE_PUBLISHABLE_KEY");
const email = required(env, "VITE_DEMO_STUDENT_EMAIL");
const password = required(env, "VITE_DEMO_STUDENT_PASSWORD");

const settingsResponse = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
const settings = await settingsResponse.json();
expect(settingsResponse.ok, "Auth settings endpoint available");
expect(settings.disable_signup === false, "public email signup enabled");
expect(settings.mailer_autoconfirm === false, "email confirmation required");
expect(settings.external?.email === true, "email provider enabled");

const student = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const anonymous = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

try {
  const signIn = await student.auth.signInWithPassword({ email, password });
  expect(!signIn.error && !!signIn.data.session && !!signIn.data.user, "demo student authentication");

  const profile = await student
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", signIn.data.user.id)
    .single();
  expect(!profile.error && profile.data?.role === "student" && profile.data.is_active === true, "active student profile enforcement");

  const refreshed = await student.auth.refreshSession();
  expect(!refreshed.error && refreshed.data.session?.user.id === signIn.data.user.id, "student session refresh");

  const restored = await student.auth.getSession();
  expect(!restored.error && restored.data.session?.user.id === signIn.data.user.id, "student session retained after refresh");

  const unauthenticatedPasswordChange = await anonymous.auth.updateUser({ password: "not-applied-a2-fixture" });
  expect(!!unauthenticatedPasswordChange.error, "password change without session denied");
} finally {
  await student.auth.signOut();
  const afterSignOut = await student.auth.getSession();
  expect(!afterSignOut.data.session, "student sign-out clears session");
}

console.log("A2 live Auth verification passed.");

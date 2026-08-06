#!/usr/bin/env node
/**
 * PLV NaviSync — Demo Account Provisioning Utility (developer-only)
 * ============================================================================
 * Creates or safely updates two REAL Supabase Auth demo accounts:
 *
 *   1. Demo Administrator  → role = 'admin',   is_active = true
 *   2. Demo Student        → role = 'student', is_active = true
 *
 * Usage:
 *   cp .env.demo.example .env.demo.local    # fill in real values
 *   pnpm demo:accounts
 *
 * Security model
 * ----------------------------------------------------------------------------
 * - The Supabase Admin API (service-role key) is used ONLY from this local
 *   Node script. The service-role key is never imported by frontend code and
 *   is read exclusively from the gitignored file `.env.demo.local`.
 * - The service-role key CANNOT promote a user to admin. The database
 *   trigger `protect_profile_authorization` and the `profiles_update_admin`
 *   RLS policy allow role / is_active changes only from an authenticated
 *   administrator session (`public.is_admin()`); with the service-role key
 *   `auth.uid()` is NULL so those checks fail by design.
 * - Assigning the demo admin role therefore goes through the AUTHORIZED
 *   workflow: the existing administrator (EXISTING_ADMIN_EMAIL /
 *   EXISTING_ADMIN_PASSWORD) signs in normally with the anon key and performs
 *   the profile update. Triggers and RLS are preserved — nothing is bypassed
 *   or disabled.
 * - No hardcoded credentials, no login bypass, no secrets printed. The
 *   service-role key and the existing administrator's password are never
 *   written to terminal output.
 *
 * Notes
 * -----
 * - Values in `.env.demo.local` may be quoted with single or double quotes;
 *   use quotes for values that contain spaces or a `#`.
 * - Re-running the script is safe and idempotent, but it intentionally resets
 *   the password of any account that already exists with a demo email (so
 *   demo logins stay deterministic).
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, "..");
const ENV_FILE = resolve(PROJECT_ROOT, ".env.demo.local");

const REQUIRED_VARS = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "EXISTING_ADMIN_EMAIL",
  "EXISTING_ADMIN_PASSWORD",
  "DEMO_ADMIN_EMAIL",
  "DEMO_ADMIN_PASSWORD",
  "DEMO_STUDENT_EMAIL",
  "DEMO_STUDENT_PASSWORD",
];

// ---------------------------------------------------------------------------
// Minimal .env loader (dependency-free). `#` starts a comment, surrounding
// quotes are stripped. Values are never printed anywhere in this script.
// ---------------------------------------------------------------------------
function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

function collectEnv() {
  const fromFile = loadEnvFile(ENV_FILE);
  const merged = { ...fromFile };
  // Shell/CI environment overrides the file, but never with empty values.
  for (const key of Object.keys(process.env)) {
    const v = process.env[key];
    if (v !== undefined && v !== "") merged[key] = v;
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Supabase Admin API helpers (service-role client — local script only)
// ---------------------------------------------------------------------------
async function findUserByEmail(admin, email) {
  let page = 1;
  const perPage = 1000;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const users = data?.users ?? [];
    const match = users.find(
      (u) => (u.email ?? "").toLowerCase() === email.toLowerCase()
    );
    if (match) return match;
    if (users.length < perPage) return null;
    page += 1;
  }
}

async function ensureAuthUser(admin, email, password, displayName, studentNumber) {
  const existing = await findUserByEmail(admin, email);
  if (existing) {
    // Existing user: refresh password (deterministic demo login) and make sure
    // the email is confirmed. Never duplicates the account. The reset is loud
    // rather than silent so a misconfiguration can never quietly hijack an
    // existing real account.
    console.warn(`[demo:accounts] WARNING: an account already exists for ${email}; its password is being reset for demo use.`);
    const { data, error } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    });
    if (error) throw new Error(`updateUserById(${email}) failed: ${error.message}`);
    return data.user;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      first_name: displayName.first,
      last_name: displayName.last,
      student_number: studentNumber,
      source: "demo-provisioning",
    },
  });
  if (error) {
    // Race-safe: a concurrent run may have created the user between the search
    // and the create. Fall back to updating the now-existing user.
    if (/already.*regist/i.test(error.message ?? "")) {
      const retry = await findUserByEmail(admin, email);
      if (retry) {
        const { data: upd, error: updErr } = await admin.auth.admin.updateUserById(
          retry.id,
          { password, email_confirm: true }
        );
        if (updErr) throw new Error(`updateUserById(${email}) failed: ${updErr.message}`);
        return upd.user;
      }
    }
    throw new Error(`createUser(${email}) failed: ${error.message}`);
  }
  return data.user;
}

async function ensureProfileExists(admin, userId, email, initialRole) {
  const { data, error } = await admin
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`profile lookup failed: ${error.message}`);
  if (data) return data;

  // The auth trigger normally creates the profile on signup; this is a safety
  // net for a profile that was manually deleted. It is inserted as 'student'
  // so no role is ever granted outside the authorized workflow.
  const { data: inserted, error: insErr } = await admin
    .from("profiles")
    .insert({ id: userId, role: initialRole, email, is_active: true })
    .select("id, role, is_active")
    .single();
  if (insErr) throw new Error(`profile creation failed: ${insErr.message}`);
  return inserted;
}

// ---------------------------------------------------------------------------
// Authorized workflow (anon-key client + existing administrator session)
// ---------------------------------------------------------------------------
async function signInAsExistingAdmin(userClient, env) {
  const { data, error } = await userClient.auth.signInWithPassword({
    email: env.EXISTING_ADMIN_EMAIL,
    password: env.EXISTING_ADMIN_PASSWORD,
  });
  if (error || !data?.session) {
    throw new Error(
      "Could not sign in with EXISTING_ADMIN_EMAIL / EXISTING_ADMIN_PASSWORD. " +
        "Promoting the demo administrator requires the existing administrator's " +
        "session because role and is_active changes are protected by the " +
        "protect_profile_authorization trigger and the profiles_update_admin " +
        "RLS policy (public.is_admin()). Check that the existing administrator " +
        "account exists, has role='admin', and is_active=true. Auth users may " +
        "have been created, but NO demo profile was promoted to the required " +
        "role/status."
    );
  }
  return data.session;
}

async function finalizeProfileThroughAdmin(userClient, userId, fields) {
  const { data, error } = await userClient
    .from("profiles")
    .update(fields)
    .eq("id", userId)
    .select("id, role, is_active")
    .single();
  if (error) {
    throw new Error(
      `Profile finalization was rejected by the database: ${error.message}. ` +
        "The profiles authorization trigger and RLS did not allow the change. " +
        "No demo account was promoted."
    );
  }
  return data;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const env = collectEnv();
  const missing = REQUIRED_VARS.filter((k) => !env[k]);
  if (missing.length > 0) {
    console.error(
      `[demo:accounts] Missing required variable(s): ${missing.join(", ")}\n` +
        `Create ${ENV_FILE} by copying .env.demo.example and filling in the real values.`
    );
    process.exit(1);
  }

  // Guard: a demo email must never point at the existing administrator. The
  // script would otherwise reset that administrator's password.
  const demoEmails = [env.DEMO_ADMIN_EMAIL, env.DEMO_STUDENT_EMAIL];
  const collision = demoEmails.find(
    (email) => email.toLowerCase() === env.EXISTING_ADMIN_EMAIL.toLowerCase()
  );
  if (collision) {
    console.error(
      "[demo:accounts] Refusing to run: a DEMO_*_EMAIL matches EXISTING_ADMIN_EMAIL. " +
        "The utility would reset the existing administrator's password. " +
        "Choose distinct demo email addresses in .env.demo.local."
    );
    process.exit(1);
  }

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const userClient = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1) Demo student — the auth trigger creates the profile as 'student'.
  const studentUser = await ensureAuthUser(
    admin,
    env.DEMO_STUDENT_EMAIL,
    env.DEMO_STUDENT_PASSWORD,
    { first: "Demo", last: "Student" },
    "DEMO-STUDENT"
  );
  await ensureProfileExists(admin, studentUser.id, env.DEMO_STUDENT_EMAIL, "student");

  // 2) Demo admin — the auth trigger creates the profile as 'student' first;
  //    promotion to 'admin' happens only through the authorized workflow below.
  const adminUser = await ensureAuthUser(
    admin,
    env.DEMO_ADMIN_EMAIL,
    env.DEMO_ADMIN_PASSWORD,
    { first: "Demo", last: "Administrator" },
    "DEMO-ADMIN"
  );
  await ensureProfileExists(admin, adminUser.id, env.DEMO_ADMIN_EMAIL, "student");

  // 3) Authorized workflow: the existing administrator signs in and finalizes
  //    both profiles so `public.is_admin()` is satisfied for every change.
  await signInAsExistingAdmin(userClient, env);

  const finalizedStudent = await finalizeProfileThroughAdmin(userClient, studentUser.id, {
    is_active: true,
    first_name: "Demo",
    last_name: "Student",
  });
  const finalizedAdmin = await finalizeProfileThroughAdmin(userClient, adminUser.id, {
    role: "admin",
    is_active: true,
    first_name: "Demo",
    last_name: "Administrator",
  });

  if (finalizedAdmin.role !== "admin" || finalizedAdmin.is_active !== true) {
    throw new Error("Demo administrator promotion did not take effect. No account changes were completed.");
  }
  if (finalizedStudent.role !== "student" || finalizedStudent.is_active !== true) {
    throw new Error("Demo student profile is not in the expected state (role 'student', active).");
  }

  try {
    await userClient.auth.signOut();
  } catch {
    // Local cleanup only; nothing depends on it.
  }

  // 4) Print ONLY the final demonstration login information. The service-role
  //    key and the existing administrator's password are never printed.
  console.log("");
  console.log("Demo accounts provisioned successfully.");
  console.log("The passwords below come from .env.demo.local — store them in a private handoff document, never in the app or in chat.");
  console.log("--------------------------------------------------------------------------------");
  console.log("Portal   : Admin Portal (protected administrator routes)");
  console.log("Route    : /admin");
  console.log("Role     : admin");
  console.log(`Email    : ${env.DEMO_ADMIN_EMAIL}`);
  console.log(`Password : ${env.DEMO_ADMIN_PASSWORD}`);
  console.log("");
  console.log("Portal   : Student portal");
  console.log("Route    : /map (usable once student authentication is connected)");
  console.log("Role     : student");
  console.log(`Email    : ${env.DEMO_STUDENT_EMAIL}`);
  console.log(`Password : ${env.DEMO_STUDENT_PASSWORD}`);
  console.log("");
  console.log("Guest    : no account required — public pages and the published campus map remain accessible.");
  console.log("--------------------------------------------------------------------------------");
}

main().catch((err) => {
  console.error(`[demo:accounts] Failed safely — ${err.message}`);
  process.exit(1);
});

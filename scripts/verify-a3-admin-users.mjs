/** Repeatable A3 live check using only publishable-key demo sessions. */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv(path) {
  const values = {};
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[line.slice(0, separator).trim()] = value;
  }
  return values;
}

function required(values, key) {
  if (!values[key]) throw new Error(`Missing ${key} in .env.local`);
  return values[key];
}

function pass(condition, label) {
  if (!condition) throw new Error(label);
  console.log(`PASS ${label}`);
}

const env = loadEnv(".env.local");
const url = required(env, "VITE_SUPABASE_URL");
const key = required(env, "VITE_SUPABASE_PUBLISHABLE_KEY");
const makeClient = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const admin = makeClient();
const student = makeClient();

try {
  const adminLogin = await admin.auth.signInWithPassword({ email: required(env, "VITE_DEMO_ADMIN_EMAIL"), password: required(env, "VITE_DEMO_ADMIN_PASSWORD") });
  const studentLogin = await student.auth.signInWithPassword({ email: required(env, "VITE_DEMO_STUDENT_EMAIL"), password: required(env, "VITE_DEMO_STUDENT_PASSWORD") });
  pass(!adminLogin.error && !!adminLogin.data.user, "demo administrator authentication");
  pass(!studentLogin.error && !!studentLogin.data.user, "demo student authentication");

  const adminProfiles = await admin.from("profiles").select("id, role, is_active");
  pass(!adminProfiles.error && (adminProfiles.data?.length ?? 0) >= 2, "administrator can list managed profiles");
  const studentProfiles = await student.from("profiles").select("id, role, is_active");
  pass(!studentProfiles.error && studentProfiles.data?.length === 1 && studentProfiles.data[0].id === studentLogin.data.user.id, "student profile listing remains self-only");

  const deniedRpc = await student.rpc("admin_update_profile", {
    p_target_id: studentLogin.data.user.id,
    p_first_name: "Denied",
    p_last_name: "Student",
    p_department: "",
    p_student_number: "",
    p_role: "student",
    p_is_active: true,
  });
  pass(!!deniedRpc.error, "student cannot execute privileged profile changes");

  const adminCheck = await admin.functions.invoke("admin-users", { body: { action: "check" } });
  pass(!adminCheck.error && adminCheck.data?.authorized === true, "active administrator reaches protected Auth endpoint");
  const studentCheck = await student.functions.invoke("admin-users", { body: { action: "check" } });
  pass(!!studentCheck.error, "student is denied by protected Auth endpoint");

  const unauthenticated = await fetch(`${url}/functions/v1/admin-users`, { method: "POST", headers: { apikey: key, "Content-Type": "application/json" }, body: JSON.stringify({ action: "check" }) });
  pass(unauthenticated.status === 401, "unauthenticated protected endpoint request denied");
} finally {
  await Promise.all([admin.auth.signOut(), student.auth.signOut()]);
}

console.log("A3 live administrator user-management verification passed.");

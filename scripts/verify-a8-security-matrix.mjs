/**
 * Repeatable A8 cross-system security and integration verification.
 *
 * Uses only publishable-key demo sessions. It creates controlled fixtures,
 * temporarily deactivates the demo student to verify that an already-issued
 * session loses private RLS/Storage access, restores the profile in `finally`,
 * and removes every transient fixture.
 */

import { randomUUID } from "node:crypto";
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
    if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1);
    }
    values[line.slice(0, separator).trim()] = value;
  }
  return values;
}

function required(values, key) {
  if (!values[key]) throw new Error(`Missing ${key} in .env.local`);
  return values[key];
}

function makeClient(url, key) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function pass(condition, label) {
  if (!condition) throw new Error(label);
  console.log(`PASS ${label}`);
}

function ok(result, label) {
  pass(!result.error, `${label}${result.error ? `: ${result.error.message}` : ""}`);
  return result.data;
}

function denied(result, label) {
  if (!result.error) throw new Error(`${label}: operation unexpectedly succeeded`);
  console.log(`PASS ${label} (denied)`);
}

function deniedOrZero(result, label) {
  if (!result.error && Array.isArray(result.data) && result.data.length > 0) {
    throw new Error(`${label}: operation affected a protected row`);
  }
  console.log(`PASS ${label} (${result.error ? "denied" : "zero rows"})`);
}

const env = loadEnv(".env.local");
const url = required(env, "VITE_SUPABASE_URL");
const key = required(env, "VITE_SUPABASE_PUBLISHABLE_KEY");
const admin = makeClient(url, key);
const student = makeClient(url, key);
const guest = makeClient(url, key);

const runId = randomUUID();
const suffix = runId.replaceAll("-", "").slice(0, 10).toUpperCase();
const ids = {
  campusA: randomUUID(),
  campusB: randomUUID(),
  draftCampus: randomUUID(),
  versionA: randomUUID(),
  versionB: randomUUID(),
  draftVersion: randomUUID(),
  buildingA: randomUUID(),
  buildingB: randomUUID(),
  studentReport: randomUUID(),
  foreignReport: randomUUID(),
};
const paths = {
  report: `${ids.studentReport}/${runId}.png`,
  campus: `${ids.campusA}/${runId}.png`,
  unreferencedCampus: `${ids.campusA}/${runId}-private.png`,
  avatar: "",
};

let adminId;
let studentId;
let originalStudentProfile;
let studentWasDeactivated = false;

const updateStudentActiveState = async (isActive) => {
  const profile = originalStudentProfile;
  return admin.rpc("admin_update_profile", {
    p_target_id: studentId,
    p_first_name: profile.first_name ?? "",
    p_last_name: profile.last_name ?? "",
    p_department: profile.department ?? "",
    p_student_number: profile.student_number ?? "",
    p_role: profile.role,
    p_is_active: isActive,
  });
};

async function createCampusFixture(id, versionId, code, name, snapshot, logoPath = null) {
  ok(await admin.from("campuses").insert({
    id,
    name,
    code,
    status: "draft",
    logo_path: logoPath,
    created_by: adminId,
    updated_by: adminId,
  }), `${name} campus creation`);
  ok(await admin.from("campus_versions").insert({
    id: versionId,
    campus_id: id,
    version_number: 1,
    state: "draft",
    snapshot,
    created_by: adminId,
  }), `${name} version creation`);
}

async function publishFixture(campusId, versionId, name) {
  ok(await admin.from("validation_runs").insert({
    campus_id: campusId,
    campus_version_id: versionId,
    run_by: adminId,
    status: "passed",
    score: 100,
    passed_count: 1,
  }), `${name} validation creation`);
  ok(await admin.rpc("publish_campus_version", { p_version_id: versionId }), `${name} publication`);
}

try {
  const [adminLogin, studentLogin] = await Promise.all([
    admin.auth.signInWithPassword({
      email: required(env, "VITE_DEMO_ADMIN_EMAIL"),
      password: required(env, "VITE_DEMO_ADMIN_PASSWORD"),
    }),
    student.auth.signInWithPassword({
      email: required(env, "VITE_DEMO_STUDENT_EMAIL"),
      password: required(env, "VITE_DEMO_STUDENT_PASSWORD"),
    }),
  ]);
  pass(!adminLogin.error && !!adminLogin.data.user, "active administrator authentication");
  pass(!studentLogin.error && !!studentLogin.data.user, "active student authentication");
  adminId = adminLogin.data.user.id;
  studentId = studentLogin.data.user.id;
  paths.avatar = `${studentId}/${runId}.png`;

  originalStudentProfile = ok(
    await admin.from("profiles").select("id,email,first_name,last_name,department,student_number,role,is_active").eq("id", studentId).single(),
    "student profile fixture lookup",
  );
  pass(originalStudentProfile.is_active === true && originalStudentProfile.role === "student", "student fixture begins active");

  const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  ok(await admin.storage.from("campus-images").upload(paths.campus, png, { contentType: "image/png" }), "published campus image upload");
  ok(await admin.storage.from("campus-images").upload(paths.unreferencedCampus, png, { contentType: "image/png" }), "unreferenced campus image upload");

  await createCampusFixture(ids.campusA, ids.versionA, `A8A${suffix}`, "A8 Campus A", { marker: "public-a" }, paths.campus);
  await createCampusFixture(ids.campusB, ids.versionB, `A8B${suffix}`, "A8 Campus B", { marker: "public-b" });
  await createCampusFixture(ids.draftCampus, ids.draftVersion, `A8D${suffix}`, "A8 Private Draft", { marker: "private-draft-secret" });
  await publishFixture(ids.campusA, ids.versionA, "campus A");
  await publishFixture(ids.campusB, ids.versionB, "campus B");

  ok(await admin.from("buildings").insert([
    { id: ids.buildingA, campus_id: ids.campusA, name: "A8 Hall A", code: `HA${suffix}`, category: "academic", width: 20, height: 20 },
    { id: ids.buildingB, campus_id: ids.campusB, name: "A8 Hall B", code: `HB${suffix}`, category: "academic", width: 20, height: 20 },
  ]), "cross-campus building fixtures");

  const guestCampuses = ok(await guest.from("campuses").select("id").in("id", [ids.campusA, ids.campusB, ids.draftCampus]), "guest campus matrix query");
  pass(guestCampuses.length === 2 && !guestCampuses.some((row) => row.id === ids.draftCampus), "guest sees published campuses but not draft campus");
  const guestVersions = ok(await guest.from("campus_versions").select("id,snapshot").in("id", [ids.versionA, ids.versionB, ids.draftVersion]), "guest version matrix query");
  pass(guestVersions.length === 2 && !guestVersions.some((row) => row.id === ids.draftVersion), "guest sees active published snapshots but not draft snapshot");
  const studentDraft = ok(await student.from("campus_versions").select("id").eq("id", ids.draftVersion), "student draft isolation query");
  pass(studentDraft.length === 0, "student cannot read private draft snapshot");
  const adminDraft = ok(await admin.from("campus_versions").select("id").eq("id", ids.draftVersion), "admin draft visibility query");
  pass(adminDraft.length === 1, "administrator can read private draft snapshot");

  ok(await guest.storage.from("campus-images").download(paths.campus), "guest reads image referenced by published campus");
  denied(await guest.storage.from("campus-images").download(paths.unreferencedCampus), "guest cannot read unreferenced private campus image");

  ok(await student.from("reports").insert({
    id: ids.studentReport,
    reporter_id: studentId,
    campus_id: ids.campusA,
    building_id: ids.buildingA,
    category: "navigation_error",
    title: `A8 Student ${suffix}`,
    description: "Controlled A8 student report",
  }), "student own-report creation");
  ok(await admin.from("reports").insert({
    id: ids.foreignReport,
    reporter_id: adminId,
    campus_id: ids.campusA,
    building_id: ids.buildingA,
    category: "navigation_error",
    title: `A8 Foreign ${suffix}`,
    description: "Controlled A8 cross-owner report",
  }), "administrator foreign report fixture");
  const studentReports = ok(await student.from("reports").select("id").in("id", [ids.studentReport, ids.foreignReport]), "student cross-user report query");
  pass(studentReports.length === 1 && studentReports[0].id === ids.studentReport, "student reads only own report");

  denied(await student.from("reports").insert({
    reporter_id: studentId,
    campus_id: ids.campusA,
    building_id: ids.buildingB,
    category: "navigation_error",
    title: "Cross-campus denied",
    description: "Building belongs to another campus",
  }), "cross-campus report association");
  denied(await student.from("favorites").insert({ user_id: studentId, campus_id: ids.campusA, building_id: ids.buildingB }), "cross-campus favorite association");
  denied(await student.from("recent_destinations").insert({ user_id: studentId, campus_id: ids.campusA, building_id: ids.buildingB, name: "Wrong campus" }), "cross-campus recent-destination association");
  denied(await student.from("favorites").insert({ user_id: adminId, campus_id: ids.campusA, building_id: ids.buildingA }), "cross-user favorite creation");

  ok(await student.from("favorites").insert({ user_id: studentId, campus_id: ids.campusA, building_id: ids.buildingA }), "student own favorite creation");
  ok(await student.from("recent_destinations").insert({ user_id: studentId, campus_id: ids.campusA, building_id: ids.buildingA, name: "A8 Hall A" }), "student own recent destination creation");
  ok(await student.storage.from("report-images").upload(paths.report, png, { contentType: "image/png" }), "student private report image upload");
  ok(await student.from("report_images").insert({ report_id: ids.studentReport, storage_path: paths.report, uploaded_by: studentId }), "student private report image link");
  denied(await guest.storage.from("report-images").download(paths.report), "guest private report image read");
  denied(await student.storage.from("report-images").upload(`${ids.foreignReport}/${runId}.png`, png, { contentType: "image/png" }), "cross-user report image upload");

  ok(await updateStudentActiveState(false), "administrator deactivates student fixture");
  studentWasDeactivated = true;
  const stillAuthenticated = await student.auth.getUser();
  pass(!stillAuthenticated.error && stillAuthenticated.data.user?.id === studentId, "deactivated profile retains issued Auth identity until session revocation");
  const inactiveProfile = ok(await student.from("profiles").select("id,is_active").eq("id", studentId).single(), "inactive student can read account-state profile");
  pass(inactiveProfile.is_active === false, "inactive profile state is visible to its owner");
  const inactiveReports = ok(await student.from("reports").select("id").eq("id", ids.studentReport), "inactive student private report query");
  pass(inactiveReports.length === 0, "inactive student cannot read own private report");
  const inactiveFavorites = ok(await student.from("favorites").select("id").eq("user_id", studentId), "inactive student favorite query");
  pass(inactiveFavorites.length === 0, "inactive student cannot read own favorites");
  const inactiveRecents = ok(await student.from("recent_destinations").select("id").eq("user_id", studentId), "inactive student recent-destination query");
  pass(inactiveRecents.length === 0, "inactive student cannot read own recent destinations");
  denied(await student.from("reports").insert({
    reporter_id: studentId,
    campus_id: ids.campusA,
    building_id: ids.buildingA,
    category: "other",
    title: "Inactive denied",
    description: "Must not persist",
  }), "inactive student report creation");
  deniedOrZero(await student.from("profiles").update({ first_name: "Inactive mutation denied" }).eq("id", studentId).select("id"), "inactive student profile mutation");
  denied(await student.storage.from("avatars").upload(paths.avatar, png, { contentType: "image/png" }), "inactive student avatar upload");
  denied(await student.storage.from("report-images").download(paths.report), "inactive student private report-image read");
  const inactivePublic = ok(await student.from("campuses").select("id").eq("id", ids.campusA), "inactive account public campus query");
  pass(inactivePublic.length === 1, "inactive account retains guest-equivalent public data access");

  ok(await updateStudentActiveState(true), "administrator restores student fixture");
  studentWasDeactivated = false;
  const restoredReports = ok(await student.from("reports").select("id").eq("id", ids.studentReport), "restored student report query");
  pass(restoredReports.length === 1, "restored active student regains own private data access");
  ok(await student.storage.from("report-images").download(paths.report), "restored student private report-image read");

  denied(await guest.rpc("archive_campus_map", { p_campus_id: ids.campusA, p_expected_updated_at: null }), "guest privileged publication RPC");
  denied(await student.rpc("archive_campus_map", { p_campus_id: ids.campusA, p_expected_updated_at: null }), "student privileged publication RPC");
  denied(await student.rpc("admin_update_profile", {
    p_target_id: studentId,
    p_first_name: originalStudentProfile.first_name ?? "",
    p_last_name: originalStudentProfile.last_name ?? "",
    p_department: originalStudentProfile.department ?? "",
    p_student_number: originalStudentProfile.student_number ?? "",
    p_role: "admin",
    p_is_active: true,
  }), "student role escalation RPC");

  const expiredResponse = await fetch(`${url}/rest/v1/reports?select=id`, {
    headers: { apikey: key, Authorization: "Bearer expired.invalid.token" },
  });
  pass(expiredResponse.status === 401, "expired or invalid access token receives HTTP 401");

  console.log("A8 cross-system security matrix passed.");
} finally {
  if (studentWasDeactivated && originalStudentProfile && studentId) {
    const restored = await updateStudentActiveState(true);
    if (restored.error) console.error(`CLEANUP student activation: ${restored.error.message}`);
    else studentWasDeactivated = false;
  }

  if (paths.report) {
    const result = await admin.storage.from("report-images").remove([paths.report, `${ids.foreignReport}/${runId}.png`]);
    if (result.error) console.error(`CLEANUP report images: ${result.error.message}`);
  }
  if (paths.avatar && studentId) {
    const result = await student.storage.from("avatars").remove([paths.avatar]);
    if (result.error && !result.error.message.toLowerCase().includes("not found")) console.error(`CLEANUP avatar: ${result.error.message}`);
  }
  const campusImages = await admin.storage.from("campus-images").remove([paths.campus, paths.unreferencedCampus]);
  if (campusImages.error) console.error(`CLEANUP campus images: ${campusImages.error.message}`);

  await admin.from("favorites").delete().eq("user_id", studentId ?? randomUUID()).in("campus_id", [ids.campusA, ids.campusB]);
  await admin.from("recent_destinations").delete().eq("user_id", studentId ?? randomUUID()).in("campus_id", [ids.campusA, ids.campusB]);
  await admin.from("reports").delete().in("id", [ids.studentReport, ids.foreignReport]);
  await admin.from("buildings").delete().in("id", [ids.buildingA, ids.buildingB]);
  await admin.from("campuses").update({ latest_published_version_id: null, status: "draft", is_default: false }).in("id", [ids.campusA, ids.campusB]);
  await admin.from("validation_runs").delete().in("campus_version_id", [ids.versionA, ids.versionB, ids.draftVersion]);
  await admin.from("campus_versions").delete().in("id", [ids.versionA, ids.versionB, ids.draftVersion]);
  await admin.from("campuses").delete().in("id", [ids.campusA, ids.campusB, ids.draftCampus]);
  await Promise.allSettled([admin.auth.signOut(), student.auth.signOut(), guest.auth.signOut()]);
}

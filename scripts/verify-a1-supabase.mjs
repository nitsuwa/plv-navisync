/**
 * Repeatable A1 integration verification for the shared development project.
 *
 * Usage:
 *   node scripts/verify-a1-supabase.mjs
 *
 * The script reads .env.local, authenticates with the disposable demo admin
 * and student accounts, creates controlled fixtures, verifies the core
 * guest/student/admin RLS and Storage matrix, removes transient fixtures, and
 * archives its reusable published campus. It never uses a service-role key.
 */

import { randomUUID } from "node:crypto";
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
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
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

function client(url, key) {
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function expectOk(result, label) {
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }
  console.log(`PASS ${label}`);
  return result.data;
}

function expectDenied(result, label) {
  if (!result.error) {
    throw new Error(`${label}: operation unexpectedly succeeded`);
  }
  console.log(`PASS ${label} (denied)`);
}

function expectNoRows(result, label) {
  if (result.error) {
    console.log(`PASS ${label} (denied)`);
    return;
  }
  if (!Array.isArray(result.data) || result.data.length !== 0) {
    throw new Error(`${label}: operation affected an unauthorized row`);
  }
  console.log(`PASS ${label} (zero rows)`);
}

const env = loadEnvFile(".env.local");
const url = required(env, "VITE_SUPABASE_URL");
const publishableKey = required(env, "VITE_SUPABASE_PUBLISHABLE_KEY");
const adminEmail = required(env, "VITE_DEMO_ADMIN_EMAIL");
const adminPassword = required(env, "VITE_DEMO_ADMIN_PASSWORD");
const studentEmail = required(env, "VITE_DEMO_STUDENT_EMAIL");
const studentPassword = required(env, "VITE_DEMO_STUDENT_PASSWORD");

const anonymous = client(url, publishableKey);
const admin = client(url, publishableKey);
const student = client(url, publishableKey);

const runId = randomUUID();
const suffix = runId.replaceAll("-", "").slice(0, 12).toUpperCase();
const created = {
  campusIds: [],
  reportIds: [],
  buildingIds: [],
  favoriteIds: [],
  studentStorage: [],
  adminStorage: [],
};

let adminId;
let studentId;
let publishedCampus;
let building;
let studentReport;
let adminReport;

try {
  const adminAuth = await admin.auth.signInWithPassword({
    email: adminEmail,
    password: adminPassword,
  });
  expectOk(adminAuth, "admin demo authentication");
  adminId = adminAuth.data.user.id;

  const studentAuth = await student.auth.signInWithPassword({
    email: studentEmail,
    password: studentPassword,
  });
  expectOk(studentAuth, "student demo authentication");
  studentId = studentAuth.data.user.id;

  const anonProfiles = expectOk(
    await anonymous.from("profiles").select("id"),
    "guest profile query"
  );
  assert(anonProfiles.length === 0, "guest unexpectedly saw profile rows");

  const studentProfiles = expectOk(
    await student.from("profiles").select("id, role"),
    "student own-profile query"
  );
  assert(
    studentProfiles.length === 1 &&
      studentProfiles[0].id === studentId &&
      studentProfiles[0].role === "student",
    "student profile visibility did not resolve to exactly the signed-in student"
  );

  const adminProfiles = expectOk(
    await admin.from("profiles").select("id, role"),
    "admin profile query"
  );
  assert(
    adminProfiles.some((profile) => profile.id === adminId) &&
      adminProfiles.some((profile) => profile.id === studentId),
    "administrator could not see the expected admin and student profiles"
  );

  expectDenied(
    await student.from("profiles").update({ role: "admin" }).eq("id", studentId),
    "student role escalation"
  );

  expectDenied(
    await admin
      .from("campuses")
      .insert({
        name: `A1 Forbidden Published Fixture ${suffix}`,
        code: `A1BAD${suffix}`,
        status: "published",
        created_by: adminId,
        updated_by: adminId,
      }),
    "direct published-campus creation"
  );

  const existingVerificationCampus = expectOk(
    await admin.from("campuses").select("*").eq("code", "A1VERIFY").maybeSingle(),
    "controlled verification-campus lookup"
  );
  publishedCampus = existingVerificationCampus ?? expectOk(
    await admin.from("campuses").insert({
      name: "A1 Verification Fixture",
      code: "A1VERIFY",
      status: "draft",
      created_by: adminId,
      updated_by: adminId,
    }).select().single(),
    "admin publishable draft-campus fixture creation"
  );
  if (publishedCampus.status === "archived") {
    publishedCampus = expectOk(
      await admin.from("campuses").update({ status: "draft", archived_at: null }).eq("id", publishedCampus.id).select().single(),
      "controlled verification-campus restore"
    );
  }

  const existingVersions = expectOk(
    await admin.from("campus_versions").select("version_number").eq("campus_id", publishedCampus.id).order("version_number", { ascending: false }).limit(1),
    "verification-campus version lookup"
  );

  const publishVersion = expectOk(
    await admin.from("campus_versions").insert({
      campus_id: publishedCampus.id,
      version_number: (existingVersions[0]?.version_number ?? 0) + 1,
      state: "draft",
      snapshot: { campus: { id: publishedCampus.id, name: publishedCampus.name } },
      created_by: adminId,
    }).select().single(),
    "admin draft-version fixture creation"
  );
  const validationRun = expectOk(
    await admin.from("validation_runs").insert({
      campus_id: publishedCampus.id,
      campus_version_id: publishVersion.id,
      run_by: adminId,
      status: "passed",
      score: 100,
      passed_count: 1,
    }).select().single(),
    "admin passing validation fixture creation"
  );
  expectOk(
    await admin.rpc("publish_campus_version", { p_version_id: publishVersion.id }),
    "atomic campus-version publication"
  );

  const draftCampus = expectOk(
    await admin
      .from("campuses")
      .insert({
        name: `A1 Draft Fixture ${suffix}`,
        code: `A1DRF${suffix}`,
        status: "draft",
        created_by: adminId,
        updated_by: adminId,
      })
      .select()
      .single(),
    "admin draft-campus fixture creation"
  );
  created.campusIds.push(draftCampus.id);

  const guestCampuses = expectOk(
    await anonymous
      .from("campuses")
      .select("id")
      .in("id", [publishedCampus.id, draftCampus.id]),
    "guest campus visibility query"
  );
  assert(
    guestCampuses.length === 1 && guestCampuses[0].id === publishedCampus.id,
    "guest did not see exactly the published campus fixture"
  );

  expectDenied(
    await student.from("campuses").insert({
      name: `A1 Forbidden Student Campus ${suffix}`,
      code: `A1NO${suffix}`,
    }),
    "student campus creation"
  );

  building = expectOk(
    await admin
      .from("buildings")
      .insert({
        campus_id: publishedCampus.id,
        name: `A1 Building Fixture ${suffix}`,
        code: `A1BLD${suffix}`,
        category: "academic",
        width: 10,
        height: 10,
        created_by: adminId,
        updated_by: adminId,
      })
      .select()
      .single(),
    "admin building fixture creation"
  );
  created.buildingIds.push(building.id);

  const guestBuildings = expectOk(
    await anonymous.from("buildings").select("id").eq("id", building.id),
    "guest live-building query"
  );
  assert(guestBuildings.length === 0, "guest saw a live authoring building row");

  const studentBuildings = expectOk(
    await student.from("buildings").select("id").eq("id", building.id),
    "student live-building query"
  );
  assert(studentBuildings.length === 0, "student saw a live authoring building row");

  const adminBuildings = expectOk(
    await admin.from("buildings").select("id").eq("id", building.id),
    "admin live-building query"
  );
  assert(adminBuildings.length === 1, "admin could not see the live building fixture");

  studentReport = expectOk(
    await student
      .from("reports")
      .insert({
        reporter_id: studentId,
        campus_id: publishedCampus.id,
        building_id: building.id,
        category: "navigation_error",
        title: `A1 Student Report ${suffix}`,
        description: "Controlled A1 RLS fixture",
      })
      .select()
      .single(),
    "student own-report creation"
  );
  created.reportIds.push(studentReport.id);

  adminReport = expectOk(
    await admin
      .from("reports")
      .insert({
        reporter_id: adminId,
        campus_id: publishedCampus.id,
        building_id: building.id,
        category: "navigation_error",
        title: `A1 Admin Report ${suffix}`,
        description: "Controlled cross-owner A1 fixture",
      })
      .select()
      .single(),
    "admin cross-owner report fixture creation"
  );
  created.reportIds.push(adminReport.id);

  const studentReports = expectOk(
    await student
      .from("reports")
      .select("id")
      .in("id", [studentReport.id, adminReport.id]),
    "student report isolation query"
  );
  assert(
    studentReports.length === 1 && studentReports[0].id === studentReport.id,
    "student report isolation failed"
  );

  expectNoRows(
    await student
      .from("reports")
      .update({ status: "resolved" })
      .eq("id", studentReport.id)
      .select("id"),
    "student report workflow update"
  );

  const favorite = expectOk(
    await student
      .from("favorites")
      .insert({
        user_id: studentId,
        campus_id: publishedCampus.id,
        building_id: building.id,
      })
      .select()
      .single(),
    "student own-favorite creation"
  );
  created.favoriteIds.push(favorite.id);

  expectDenied(
    await student.from("favorites").insert({
      user_id: adminId,
      campus_id: publishedCampus.id,
      building_id: building.id,
    }),
    "student cross-user favorite creation"
  );

  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const avatarPath = `${studentId}/${runId}.png`;
  expectOk(
    await student.storage.from("avatars").upload(avatarPath, png, {
      contentType: "image/png",
      upsert: false,
    }),
    "student own-avatar upload"
  );
  created.studentStorage.push({ bucket: "avatars", path: avatarPath });

  expectDenied(
    await student.storage
      .from("avatars")
      .upload(`${adminId}/${runId}.png`, png, {
        contentType: "image/png",
        upsert: false,
      }),
    "student cross-user avatar upload"
  );

  expectDenied(
    await student.storage
      .from("avatars")
      .upload(`${studentId}/${runId}.txt`, new TextEncoder().encode("not an image"), {
        contentType: "text/plain",
        upsert: false,
      }),
    "avatar MIME restriction"
  );

  expectDenied(
    await student.storage
      .from("avatars")
      .upload(`${studentId}/${runId}-oversize.png`, new Uint8Array(2097153), {
        contentType: "image/png",
        upsert: false,
      }),
    "avatar size restriction"
  );

  expectDenied(
    await student.storage
      .from("building-images")
      .upload(`${runId}.png`, png, { contentType: "image/png", upsert: false }),
    "student building-image upload"
  );

  const buildingImagePath = `${runId}.png`;
  expectOk(
    await admin.storage.from("building-images").upload(buildingImagePath, png, {
      contentType: "image/png",
      upsert: false,
    }),
    "admin building-image upload"
  );
  created.adminStorage.push({ bucket: "building-images", path: buildingImagePath });

  expectOk(
    await anonymous.storage.from("building-images").download(buildingImagePath),
    "guest public building-image read"
  );

  const reportImagePath = `${studentReport.id}/${runId}.png`;
  expectOk(
    await student.storage.from("report-images").upload(reportImagePath, png, {
      contentType: "image/png",
      upsert: false,
    }),
    "student own-report image upload"
  );
  created.studentStorage.push({ bucket: "report-images", path: reportImagePath });

  expectDenied(
    await student.storage
      .from("report-images")
      .upload(`${adminReport.id}/${runId}.png`, png, {
        contentType: "image/png",
        upsert: false,
      }),
    "student cross-owner report-image upload"
  );

  console.log("A1 Supabase integration verification passed.");
} finally {
  for (const { bucket, path } of created.studentStorage.reverse()) {
    const result = await student.storage.from(bucket).remove([path]);
    if (result.error) console.error(`CLEANUP ${bucket}/${path}: ${result.error.message}`);
  }
  for (const { bucket, path } of created.adminStorage.reverse()) {
    const result = await admin.storage.from(bucket).remove([path]);
    if (result.error) console.error(`CLEANUP ${bucket}/${path}: ${result.error.message}`);
  }
  if (created.favoriteIds.length) {
    const result = await admin.from("favorites").delete().in("id", created.favoriteIds);
    if (result.error) console.error(`CLEANUP favorites: ${result.error.message}`);
  }
  if (created.reportIds.length) {
    const result = await admin.from("reports").delete().in("id", created.reportIds);
    if (result.error) console.error(`CLEANUP reports: ${result.error.message}`);
  }
  if (created.buildingIds.length) {
    const result = await admin.from("buildings").delete().in("id", created.buildingIds);
    if (result.error) console.error(`CLEANUP buildings: ${result.error.message}`);
  }
  if (publishedCampus?.id) {
    const result = await admin.from("campuses").update({ status: "archived", archived_at: new Date().toISOString(), is_default: false }).eq("id", publishedCampus.id);
    if (result.error) console.error(`CLEANUP verification campus archive: ${result.error.message}`);
  }
  if (created.campusIds.length) {
    const result = await admin.from("campuses").delete().in("id", created.campusIds);
    if (result.error) console.error(`CLEANUP campuses: ${result.error.message}`);
  }
  await Promise.allSettled([admin.auth.signOut(), student.auth.signOut()]);
}

/** Repeatable A7 guest/student/admin RLS and Storage verification with controlled fixtures. */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv(path) {
  return Object.fromEntries(readFileSync(path, "utf8").split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
    const at = line.indexOf("="); let value = line.slice(at + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    return [line.slice(0, at).trim(), value];
  }));
}
function required(values, key) { if (!values[key]) throw new Error(`Missing ${key} in .env.local`); return values[key]; }
function pass(condition, label) { if (!condition) throw new Error(label); console.log(`PASS ${label}`); }

const env = loadEnv(".env.local"); const url = required(env, "VITE_SUPABASE_URL"); const key = required(env, "VITE_SUPABASE_PUBLISHABLE_KEY");
const client = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const admin = client(); const student = client(); const guest = client();
const id = Object.fromEntries(["campus", "version", "building", "event", "location", "stall", "expiredEvent", "announcement", "report"].map((name) => [name, crypto.randomUUID()]));
const suffix = id.campus.slice(0, 8); const settingKey = `a7_fixture_${suffix}`; const imagePath = `${id.report}/fixture.png`;

try {
  const [adminLogin, studentLogin] = await Promise.all([
    admin.auth.signInWithPassword({ email: required(env, "VITE_DEMO_ADMIN_EMAIL"), password: required(env, "VITE_DEMO_ADMIN_PASSWORD") }),
    student.auth.signInWithPassword({ email: required(env, "VITE_DEMO_STUDENT_EMAIL"), password: required(env, "VITE_DEMO_STUDENT_PASSWORD") }),
  ]);
  pass(!adminLogin.error, "administrator authentication"); pass(!studentLogin.error, "student authentication");
  const studentId = studentLogin.data.user.id; const adminId = adminLogin.data.user.id;
  const campus = await admin.from("campuses").insert({ id: id.campus, name: "A7 Operations Fixture", code: `A7-${suffix}`, created_by: adminId }).select().single();
  const version = await admin.from("campus_versions").insert({ id: id.version, campus_id: id.campus, version_number: 1, state: "draft", snapshot: { campus: { id: id.campus } }, created_by: adminId }).select().single();
  const validation = await admin.from("validation_runs").insert({ campus_id: id.campus, campus_version_id: id.version, run_by: adminId, status: "passed", score: 100, passed_count: 1 });
  const published = await admin.rpc("publish_campus_version", { p_version_id: id.version });
  pass(!campus.error && !version.error && !validation.error && !published.error, "controlled campus fixture published through lifecycle contract");
  const building = await admin.from("buildings").insert({ id: id.building, campus_id: id.campus, name: "A7 Hall", code: `H-${suffix}`, category: "academic", width: 20, height: 20 }).select().single();
  pass(!building.error, "building fixture created");

  const guestReport = await guest.from("reports").insert({ id: crypto.randomUUID(), reporter_id: studentId, campus_id: id.campus, category: "other", title: "Guest", description: "Not allowed" });
  pass(Boolean(guestReport.error), "guest report creation denied");
  const report = await student.from("reports").insert({ id: id.report, reporter_id: studentId, campus_id: id.campus, building_id: id.building, category: "damaged_facility", title: "Fixture report", description: "Controlled A7 fixture" });
  pass(!report.error, "student creates own report");
  const foreignReports = await student.from("reports").select("id").neq("reporter_id", studentId);
  pass(!foreignReports.error && foreignReports.data.length === 0, "student cannot read other reports");
  const png = Uint8Array.from([137,80,78,71,13,10,26,10]);
  const uploaded = await student.storage.from("report-images").upload(imagePath, png, { contentType: "image/png" });
  pass(!uploaded.error, "student uploads allowed private report image");
  const linked = await student.from("report_images").insert({ report_id: id.report, storage_path: imagePath, uploaded_by: studentId });
  pass(!linked.error, "student links image to own report");
  const publicUrl = await guest.storage.from("report-images").download(imagePath);
  pass(Boolean(publicUrl.error), "guest cannot download private report image");

  const now = Date.now();
  const events = await admin.from("events").insert([
    { id: id.event, campus_id: id.campus, title: "A7 Fair", category: "event", starts_at: new Date(now - 60000).toISOString(), ends_at: new Date(now + 3600000).toISOString(), status: "published", created_by: adminId },
    { id: id.expiredEvent, campus_id: id.campus, title: "Expired", category: "event", starts_at: new Date(now - 7200000).toISOString(), ends_at: new Date(now - 3600000).toISOString(), status: "published", created_by: adminId },
  ]);
  pass(!events.error, "scheduled event fixtures created");
  const location = await admin.from("event_locations").insert({ id: id.location, event_id: id.event, label: "Quad", x: 10, y: 10 });
  const stall = await admin.from("event_stalls").insert({ id: id.stall, event_id: id.event, event_location_id: id.location, name: "Registrar", x: 4, y: 5 });
  pass(!location.error && !stall.error, "administrator creates event location and stall");
  const guestStalls = await guest.from("event_stalls").select("id").eq("event_id", id.event);
  pass(!guestStalls.error && guestStalls.data.length === 1, "guest sees stalls for active published event");
  const expiredStall = await admin.from("event_stalls").insert({ event_id: id.expiredEvent, name: "Expired stall", x: 1, y: 1 });
  pass(!expiredStall.error, "expired-event stall fixture created");
  const hiddenExpired = await guest.from("event_stalls").select("id").eq("event_id", id.expiredEvent);
  pass(!hiddenExpired.error && hiddenExpired.data.length === 0, "automatic expiration hides event stalls");

  const announcement = await admin.from("announcements").insert({ id: id.announcement, campus_id: id.campus, title: "Temporary closure", content: "Use the alternate entrance", category: "closure", priority: "high", status: "published", created_by: adminId }).select().single();
  const mapped = await admin.from("announcement_locations").insert({ announcement_id: id.announcement, building_id: id.building, effect_type: "closure" });
  pass(!announcement.error && !mapped.error, "administrator maps a published closure notice");
  const guestMapped = await guest.from("announcement_locations").select("id").eq("announcement_id", id.announcement);
  pass(!guestMapped.error && guestMapped.data.length === 1, "guest reads active mapped announcement");

  const favorite = await student.from("favorites").insert({ user_id: studentId, campus_id: id.campus, building_id: id.building });
  const recent = await student.from("recent_destinations").insert({ user_id: studentId, campus_id: id.campus, building_id: id.building, name: "A7 Hall" });
  pass(!favorite.error && !recent.error, "student persists own favorite and recent destination");
  const deniedSetting = await student.rpc("upsert_system_settings", { p_entries: [{ key: settingKey, value: true, is_public: false }] });
  pass(Boolean(deniedSetting.error), "student settings update denied");
  const setting = await admin.rpc("upsert_system_settings", { p_entries: [{ key: settingKey, value: true, is_public: false }] });
  pass(!setting.error && setting.data === 1, "administrator settings batch succeeds atomically");
  const workflow = await admin.rpc("update_report_workflow", { p_report_id: id.report, p_status: "resolved", p_resolution_notes: "Verified", p_internal_notes: null });
  pass(!workflow.error, "administrator report workflow succeeds");
  const history = await admin.from("report_history").select("id").eq("report_id", id.report);
  pass(!history.error && history.data.length === 1, "report workflow writes history");
} finally {
  await student.storage.from("report-images").remove([imagePath]);
  await admin.from("system_settings").delete().eq("key", settingKey).is("campus_id", null);
  await admin.from("reports").delete().eq("id", id.report);
  await admin.from("announcements").delete().eq("id", id.announcement);
  await admin.from("events").delete().in("id", [id.event, id.expiredEvent]);
  await admin.from("buildings").delete().eq("id", id.building);
  await admin.from("campuses").update({ latest_published_version_id: null, status: "draft" }).eq("id", id.campus);
  await admin.from("validation_runs").delete().eq("campus_version_id", id.version);
  await admin.from("campus_versions").delete().eq("id", id.version);
  await admin.from("campuses").delete().eq("id", id.campus);
  await Promise.all([admin.auth.signOut(), student.auth.signOut(), guest.auth.signOut()]);
}
console.log("A7 live operations verification passed.");

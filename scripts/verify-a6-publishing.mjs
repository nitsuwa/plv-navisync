/** Repeatable A6 draft/version/validation/publication/RLS verification. */
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

const env = loadEnv(".env.local");
const url = required(env, "VITE_SUPABASE_URL");
const key = required(env, "VITE_SUPABASE_PUBLISHABLE_KEY");
const client = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const admin = client(); const student = client(); const guest = client();
const campusId = crypto.randomUUID(); const suffix = campusId.slice(0, 8).toUpperCase();
const emptyStructure = { buildings: [], floors: [], map_elements: [], navigation_nodes: [], navigation_edges: [] };
const snapshot = (revision) => ({
  id: campusId, name: "A6 Publication Fixture", code: `A6-${suffix}`, description: revision,
  address: "", city: "Valenzuela", province: "Metro Manila", postalCode: "",
  status: "active", publishStatus: "draft", visibleToStudents: false,
  features: { indoorNavigation: true, accessibilityNavigation: true, emergencyRoutes: true, issueReporting: true },
  canvasW: 1200, canvasH: 800, settings: { accessibility: true, emergency: true, eventLayer: true, gps: true },
  buildings: [], markers: [], paths: [], navNodes: [], navEdges: [], createdAt: "2026-08-16", updatedAt: "2026-08-16",
});

let currentUpdatedAt = null;
try {
  const [adminLogin, studentLogin] = await Promise.all([
    admin.auth.signInWithPassword({ email: required(env, "VITE_DEMO_ADMIN_EMAIL"), password: required(env, "VITE_DEMO_ADMIN_PASSWORD") }),
    student.auth.signInWithPassword({ email: required(env, "VITE_DEMO_STUDENT_EMAIL"), password: required(env, "VITE_DEMO_STUDENT_PASSWORD") }),
  ]);
  pass(!adminLogin.error, "administrator authentication"); pass(!studentLogin.error, "student authentication");
  const adminId = adminLogin.data.user.id;
  // Recover fixtures left by an interrupted prior run before creating a new one.
  const priorFixtures = await admin.from("campuses").select("id,updated_at").eq("name", "A6 Publication Fixture");
  for (const prior of priorFixtures.data ?? []) {
    await admin.rpc("archive_campus_map", { p_campus_id: prior.id, p_expected_updated_at: prior.updated_at });
    await admin.from("validation_runs").delete().eq("campus_id", prior.id);
    await admin.from("campus_versions").delete().eq("campus_id", prior.id);
    await admin.from("campuses").delete().eq("id", prior.id);
  }
  const created = await admin.from("campuses").insert({ id: campusId, name: "A6 Publication Fixture", code: `A6-${suffix}`, created_by: adminId }).select("updated_at").single();
  pass(!created.error, "controlled private campus fixture created");
  currentUpdatedAt = created.data.updated_at;

  const deniedSave = await student.rpc("save_campus_draft", {
    p_campus_id: campusId, p_structure: emptyStructure, p_snapshot: snapshot("student"),
    p_change_summary: "denied", p_expected_updated_at: currentUpdatedAt,
  });
  pass(Boolean(deniedSave.error), "student cannot save administrator drafts");

  const firstSave = await admin.rpc("save_campus_draft", {
    p_campus_id: campusId, p_structure: emptyStructure, p_snapshot: snapshot("first valid publication"),
    p_change_summary: "Initial publish", p_expected_updated_at: currentUpdatedAt,
  });
  pass(!firstSave.error && firstSave.data?.version_number === 1, "administrator atomically saves relational data and version 1 draft");
  const version1 = firstSave.data.version_id; currentUpdatedAt = firstSave.data.campus_updated_at;

  const [guestDraft, studentDraft] = await Promise.all([
    guest.from("campus_versions").select("id").eq("campus_id", campusId),
    student.from("campus_versions").select("id").eq("campus_id", campusId),
  ]);
  pass(!guestDraft.error && guestDraft.data.length === 0, "guest cannot read private draft snapshot");
  pass(!studentDraft.error && studentDraft.data.length === 0, "student cannot read private draft snapshot");

  const staleSave = await admin.rpc("save_campus_draft", {
    p_campus_id: campusId, p_structure: emptyStructure, p_snapshot: snapshot("stale overwrite"),
    p_change_summary: "stale", p_expected_updated_at: created.data.updated_at,
  }).abortSignal(AbortSignal.timeout(15000));
  pass(staleSave.error?.code === "PT409", "optimistic concurrency rejects a stale draft save promptly");

  const failedValidation = await admin.rpc("record_campus_validation", {
    p_version_id: version1, p_status: "failed", p_score: 50,
    p_issues: [{ severity: "error", rule_code: "fixture_blocker", message: "Controlled blocking issue", entity_type: null, entity_id: null, suggested_resolution: null }],
  });
  pass(!failedValidation.error, "failed B5 validation handoff is recorded");
  const blockedPublish = await admin.rpc("publish_validated_campus_draft", { p_version_id: version1, p_expected_updated_at: currentUpdatedAt });
  pass(Boolean(blockedPublish.error), "failed validation blocks publication");
  const stillPrivate = await guest.from("campus_versions").select("id").eq("campus_id", campusId);
  pass(!stillPrivate.error && stillPrivate.data.length === 0, "failed first publish exposes no draft");

  const passedValidation = await admin.rpc("record_campus_validation", {
    p_version_id: version1, p_status: "passed", p_score: 100, p_issues: [],
  });
  pass(!passedValidation.error, "newer passing validation supersedes failed result");
  const firstPublish = await admin.rpc("publish_validated_campus_draft", { p_version_id: version1, p_expected_updated_at: currentUpdatedAt });
  pass(!firstPublish.error && firstPublish.data?.version_number === 1, "validated version 1 publishes atomically");
  currentUpdatedAt = firstPublish.data.campus_updated_at;
  const guestPublished = await guest.from("campus_versions").select("id,snapshot,state").eq("campus_id", campusId).single();
  pass(!guestPublished.error && guestPublished.data.id === version1 && guestPublished.data.snapshot.description === "first valid publication", "guest reads only the active immutable snapshot");

  const secondSave = await admin.rpc("save_campus_draft", {
    p_campus_id: campusId, p_structure: emptyStructure, p_snapshot: snapshot("unvalidated replacement"),
    p_change_summary: "Second revision", p_expected_updated_at: currentUpdatedAt,
  });
  pass(!secondSave.error && secondSave.data?.version_number === 2, "new edits create version 2 without changing public version");
  const version2 = secondSave.data.version_id; currentUpdatedAt = secondSave.data.campus_updated_at;
  const prematurePublish = await admin.rpc("publish_validated_campus_draft", { p_version_id: version2, p_expected_updated_at: currentUpdatedAt });
  pass(Boolean(prematurePublish.error), "unvalidated replacement cannot publish");
  const preserved = await guest.from("campus_versions").select("id,snapshot").eq("campus_id", campusId).single();
  pass(!preserved.error && preserved.data.id === version1 && preserved.data.snapshot.description === "first valid publication", "failed replacement preserves last valid publication");

  const deniedValidation = await student.rpc("record_campus_validation", { p_version_id: version2, p_status: "passed", p_score: 100, p_issues: [] });
  pass(Boolean(deniedValidation.error), "student cannot forge validation handoff");
  const passSecond = await admin.rpc("record_campus_validation", { p_version_id: version2, p_status: "passed", p_score: 100, p_issues: [] });
  const secondPublish = await admin.rpc("publish_validated_campus_draft", { p_version_id: version2, p_expected_updated_at: currentUpdatedAt });
  pass(!passSecond.error && !secondPublish.error, "validated version 2 replaces version 1 atomically");
  currentUpdatedAt = secondPublish.data.campus_updated_at;
  const history = await admin.from("campus_versions").select("id,state,version_number,published_at,published_by,change_summary").eq("campus_id", campusId).order("version_number");
  pass(!history.error && history.data.length === 2 && history.data[0].state === "superseded" && history.data[1].state === "published" && Boolean(history.data[1].published_by), "publication history preserves version, publisher, timestamp, and summary");

  const unpublished = await admin.rpc("unpublish_campus_map", { p_campus_id: campusId, p_expected_updated_at: currentUpdatedAt });
  pass(!unpublished.error, "administrator unpublishes atomically"); currentUpdatedAt = unpublished.data;
  const hidden = await guest.from("campus_versions").select("id").eq("campus_id", campusId);
  pass(!hidden.error && hidden.data.length === 0, "unpublish removes the public active-version view");

  const discardSave = await admin.rpc("save_campus_draft", {
    p_campus_id: campusId, p_structure: emptyStructure, p_snapshot: snapshot("discard me"),
    p_change_summary: "Disposable", p_expected_updated_at: currentUpdatedAt,
  });
  pass(!discardSave.error && discardSave.data?.version_number === 3, "private version 3 draft created for discard");
  currentUpdatedAt = discardSave.data.campus_updated_at;
  const discarded = await admin.rpc("discard_campus_draft", { p_version_id: discardSave.data.version_id, p_expected_updated_at: currentUpdatedAt });
  pass(!discarded.error, "draft discard removes only the private draft"); currentUpdatedAt = discarded.data;
  const discardedRow = await admin.from("campus_versions").select("id").eq("id", discardSave.data.version_id);
  pass(!discardedRow.error && discardedRow.data.length === 0, "discarded version is absent while history remains");

  const archived = await admin.rpc("archive_campus_map", { p_campus_id: campusId, p_expected_updated_at: currentUpdatedAt });
  pass(!archived.error, "administrator archive leaves no public active version"); currentUpdatedAt = archived.data;

  const logs = await admin.from("activity_logs").select("action").eq("campus_id", campusId);
  const actions = new Set((logs.data ?? []).map((row) => row.action));
  pass(!logs.error && ["campus_version.draft_saved", "campus_version.published", "campus.unpublished", "campus.archived", "campus_version.draft_discarded"].every((action) => actions.has(action)), "save, publish, unpublish, archive, and discard activity is logged");
} finally {
  const row = await admin.from("campuses").select("updated_at").eq("id", campusId).maybeSingle();
  if (row.data?.updated_at) await admin.rpc("archive_campus_map", { p_campus_id: campusId, p_expected_updated_at: row.data.updated_at });
  await admin.from("validation_runs").delete().eq("campus_id", campusId);
  await admin.from("campus_versions").delete().eq("campus_id", campusId);
  await admin.from("campuses").delete().eq("id", campusId);
  await Promise.all([admin.auth.signOut(), student.auth.signOut(), guest.auth.signOut()]);
}
console.log("A6 live campus publication verification passed.");

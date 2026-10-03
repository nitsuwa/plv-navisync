/**
 * Staging identity/feed preflight for event publication verification.
 *
 * This intentionally reads process.env only. It never loads .env.local, creates
 * fixtures, calls a service-role API, or prints credentials. It sends one
 * deliberately stale RPC against the explicitly recorded, inactive disposable
 * probe event and compares its row and activity history before/after. This is
 * mutation-shaped and must only run against the explicitly verified staging
 * project. Set the EVENT_TEST_* values explicitly in that staging shell.
 */
import { createClient } from "@supabase/supabase-js";
import { assertAllowlistedPublicEventPreview, isExpectedPrivateRowDenial, makeStaleRevision, probeSnapshotUnchanged } from "./event-full-pack-verifier-safety.mjs";

function requireValue(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}.`);
  return value;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function keyRole(key) {
  if (key.startsWith("sb_publishable_")) return "publishable";
  if (key.startsWith("sb_secret_") || key.startsWith("sb_service_role_")) return "privileged";
  const payload = key.split(".")[1];
  if (!payload) return "unknown";
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")).role ?? "unknown";
  } catch {
    return "unknown";
  }
}

function makeClient(url, key) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

assert(process.env.EVENT_TEST_ENVIRONMENT === "staging", "Set EVENT_TEST_ENVIRONMENT=staging. This verifier refuses development and production targets.");
assert(process.env.EVENT_TEST_ALLOW_WRITES === "staging-only", "Set EVENT_TEST_ALLOW_WRITES=staging-only to confirm this is the isolated verification project.");

const url = new URL(requireValue("EVENT_TEST_SUPABASE_URL"));
const allowedProjectRef = requireValue("EVENT_TEST_ALLOWED_PROJECT_REF");
const key = requireValue("EVENT_TEST_SUPABASE_PUBLISHABLE_KEY");
const campusId = requireValue("EVENT_TEST_CAMPUS_ID");
const expectedOrgAEventId = requireValue("EVENT_TEST_EXPECT_ORG_A_EVENT_ID");
const probeEventId = requireValue("EVENT_TEST_PROBE_EVENT_ID");
const expectedPublishedEventId = requireValue("EVENT_TEST_EXPECT_PUBLISHED_EVENT_ID");
const projectMatch = /^([a-z0-9]{20})\.supabase\.co$/i.exec(url.hostname);
assert(url.protocol === "https:" && projectMatch && projectMatch[1] === allowedProjectRef && url.pathname === "/" && !url.search && !url.hash,
  "The HTTPS Supabase URL must be the exact project ref named in EVENT_TEST_ALLOWED_PROJECT_REF.");
assert(keyRole(key) === "publishable" || keyRole(key) === "anon", "Use a publishable/anon key. Service-role and secret keys are refused.");
assert(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(campusId), "EVENT_TEST_CAMPUS_ID must be a UUID from the isolated staging project.");
const eventIds = [expectedOrgAEventId, probeEventId, expectedPublishedEventId];
assert(eventIds.every((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)), "Expected private, probe, and published event IDs must be staging UUIDs.");
assert(expectedOrgAEventId !== probeEventId, "Use separate owned-event and inactive disposable-probe fixtures.");
assert(expectedPublishedEventId !== probeEventId, "Use a separate known published event and inactive disposable probe fixture.");

const credentials = [
  ["administrator", "admin", "EVENT_TEST_ADMIN_EMAIL", "EVENT_TEST_ADMIN_PASSWORD"],
  ["student", "student", "EVENT_TEST_STUDENT_EMAIL", "EVENT_TEST_STUDENT_PASSWORD"],
  ["organization A", "student_org", "EVENT_TEST_ORG_A_EMAIL", "EVENT_TEST_ORG_A_PASSWORD"],
  ["organization B", "student_org", "EVENT_TEST_ORG_B_EMAIL", "EVENT_TEST_ORG_B_PASSWORD"],
].map(([label, expectedRole, emailName, passwordName]) => ({
  label, expectedRole, email: requireValue(emailName), password: requireValue(passwordName),
}));
assert(new Set(credentials.map(({ email }) => email.toLowerCase())).size === credentials.length, "Each staging role must use a separate account.");

const anonymous = makeClient(url.origin, key);
const signedIn = [];
function pass(label) { console.log(`PASS ${label}`); }

try {
  const roleUsers = {};
  for (const credential of credentials) {
    const client = makeClient(url.origin, key);
    const login = await client.auth.signInWithPassword({ email: credential.email, password: credential.password });
    assert(!login.error && login.data.user, `Could not authenticate the staging ${credential.label} account.`);
    signedIn.push(client);
    const profile = await client.from("profiles").select("id, role, is_active").eq("id", login.data.user.id).single();
    assert(!profile.error && profile.data?.role === credential.expectedRole && profile.data.is_active === true,
      `The staging ${credential.label} account did not resolve to an active ${credential.expectedRole} profile.`);
    roleUsers[credential.label] = { id: login.data.user.id, client };
    pass(`active ${credential.expectedRole} session (${credential.label})`);
  }
  assert(roleUsers["organization A"].id !== roleUsers["organization B"].id, "Organization A and B must be different users.");

  const publicFeed = await anonymous.rpc("list_published_event_previews", { p_campus_id: campusId });
  assert(!publicFeed.error && publicFeed.data && Array.isArray(publicFeed.data.events), "The anonymous event preview RPC is missing or unreadable for this staging campus.");
  assertAllowlistedPublicEventPreview(publicFeed.data.events);
  assert(publicFeed.data.events.some((event) => event.id === expectedPublishedEventId && event.campusId === campusId), "The expected published staging event was absent from this campus's public feed.");
  pass(`allowlisted public event feed with known visible positive control (${publicFeed.data.events.length} events)`);

  const readExactEvent = (client) => client.from("map_elements").select("id, metadata").eq("id", expectedOrgAEventId).maybeSingle();
  const adminOwnedEvent = await readExactEvent(roleUsers.administrator.client);
  assert(!adminOwnedEvent.error && adminOwnedEvent.data?.id === expectedOrgAEventId, "Administrator could not read the exact private positive-control event row.");
  pass("administrator can read the exact private-event positive control");

  const orgAOwnedEvent = await readExactEvent(roleUsers["organization A"].client);
  assert(!orgAOwnedEvent.error && orgAOwnedEvent.data?.id === expectedOrgAEventId, "Organization A could not read its exact private-event positive-control row.");
  assert(orgAOwnedEvent.data.metadata?.createdByUserId === roleUsers["organization A"].id, "The positive-control event is not owned by Organization A.");
  pass("organization A can read its exact owned-event positive control");

  for (const [label, client] of [
    ["anonymous", anonymous],
    ["student", roleUsers.student.client],
    ["organization B", roleUsers["organization B"].client],
  ]) {
    const raw = await readExactEvent(client);
    assert(isExpectedPrivateRowDenial(raw), `${label} session can read Organization A's exact private event, or the query failed for an unrecognized reason.`);
    pass(`${label} session cannot read Organization A's exact private event`);
  }

  const readProbeSnapshot = async () => {
    const [eventResult, activityResult] = await Promise.all([
      roleUsers.administrator.client.from("map_elements")
        .select("id, campus_id, element_type, archived_at, updated_at, metadata")
        .eq("id", probeEventId).eq("campus_id", campusId).maybeSingle(),
      roleUsers.administrator.client.from("activity_logs")
        .select("id, created_at, action, entity_type, entity_id, metadata")
        .eq("entity_type", "event_overlay").eq("entity_id", probeEventId)
        .order("created_at", { ascending: true }).order("id", { ascending: true }),
    ]);
    assert(!eventResult.error && eventResult.data?.id === probeEventId, "Could not read the exact recorded disposable probe event on the selected staging campus.");
    assert(!activityResult.error && Array.isArray(activityResult.data), "Could not read the probe event's relevant activity history as the administrator.");
    return {
      event: eventResult.data,
      activity: activityResult.data,
    };
  };
  const before = await readProbeSnapshot();
  assert(before.event.archived_at === null, "The disposable probe event must not be archived.");
  assert(before.event.element_type === "event_overlay" || before.event.metadata?.kind === "event_overlay", "The recorded probe ID is not an event layout.");
  assert(before.event.metadata?.status === "approved" && before.event.metadata?.isActive === false, "The stale probe target must be approved and already unpublished so a broken guard cannot hide a live student event.");

  const deniedCommand = await roleUsers["organization A"].client.rpc("manage_event_publication", {
    p_overlay_id: probeEventId,
    p_expected_updated_at: before.event.updated_at,
    p_action: "unpublish",
    p_publication_at: null,
  });
  const afterOrganizationCommand = await readProbeSnapshot();
  assert(probeSnapshotUnchanged(before, afterOrganizationCommand), "The organization publication-denial probe changed its disposable event or activity history.");
  assert(deniedCommand.error?.code === "42501", "A student organization could execute an administrator publication command against the exact staging probe fixture.");
  pass("student organization is denied administrator publication against the exact inactive probe fixture");

  const staleRevision = makeStaleRevision(before.event.updated_at);
  const stale = await roleUsers.administrator.client.rpc("manage_event_publication", {
    p_overlay_id: probeEventId,
    p_expected_updated_at: staleRevision,
    p_action: "unpublish",
    p_publication_at: null,
  });
  const after = await readProbeSnapshot();
  assert(probeSnapshotUnchanged(before, after), "The stale probe changed its disposable event or activity history. Stop staging verification and inspect the fixture immediately.");
  assert(stale.error?.code === "40001", "The admin RPC did not reject the deliberately stale event revision with SQLSTATE 40001.");
  pass("administrator RPC rejects a stale revision and leaves the exact inactive probe event/activity history unchanged");
} finally {
  await Promise.all(signedIn.map((client) => client.auth.signOut()));
}

console.log("Event staging identity/feed preflight passed. This does not replace the full browser lifecycle run.");

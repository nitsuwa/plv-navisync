/** Repeatable A5 live check using only publishable-key browser sessions. */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv(path) {
  return Object.fromEntries(readFileSync(path, "utf8").split(/\r?\n/).map((raw) => raw.trim()).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
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
const ids = { campus: crypto.randomUUID(), otherCampus: crypto.randomUUID(), building: crypto.randomUUID(), otherBuilding: crypto.randomUUID(), floor: crypto.randomUUID(), room: crypto.randomUUID(), nodeA: crypto.randomUUID(), nodeB: crypto.randomUUID(), edge: crypto.randomUUID() };
const suffix = ids.campus.slice(0, 8).toUpperCase();

try {
  const [adminLogin, studentLogin] = await Promise.all([
    admin.auth.signInWithPassword({ email: required(env, "VITE_DEMO_ADMIN_EMAIL"), password: required(env, "VITE_DEMO_ADMIN_PASSWORD") }),
    student.auth.signInWithPassword({ email: required(env, "VITE_DEMO_STUDENT_EMAIL"), password: required(env, "VITE_DEMO_STUDENT_PASSWORD") }),
  ]);
  pass(!adminLogin.error, "administrator authentication"); pass(!studentLogin.error, "student authentication");
  const created = await admin.from("campuses").insert([
    { id: ids.campus, name: "A5 Structure Fixture", code: `A5-${suffix}` },
    { id: ids.otherCampus, name: "A5 Boundary Fixture", code: `A5-X-${suffix}` },
  ]);
  pass(!created.error, "controlled campus fixtures created");
  const payload = {
    buildings: [{ id: ids.building, name: "Engineering", code: "ENG", description: "", category: "academic", x: 10, y: 20, width: 100, height: 80, rotation: 0, is_searchable: true, is_visible: true, is_accessible: true, metadata: {} }],
    floors: [{ id: ids.floor, building_id: ids.building, name: "Ground", floor_number: 1, display_order: 0, canvas_width: 1200, canvas_height: 800, map_scale_m_per_unit: 1, is_visible: true, metadata: {} }],
    map_elements: [{ id: ids.room, building_id: ids.building, floor_id: ids.floor, element_type: "classroom", name: "ENG 101", search_keywords: ["eng 101"], x: 5, y: 6, width: 40, height: 30, rotation: 0, z_index: 0, style: {}, metadata: {}, is_accessible: true, is_emergency_asset: false, is_searchable: true, is_visible: true }],
    navigation_nodes: [
      { id: ids.nodeA, building_id: ids.building, node_type: "entrance", name: "Entrance", x: 10, y: 20, is_accessible: true, is_emergency_safe: true, is_active: true, metadata: {} },
      { id: ids.nodeB, building_id: ids.building, floor_id: ids.floor, node_type: "destination", name: "ENG 101", x: 5, y: 6, is_accessible: true, is_emergency_safe: true, is_active: true, metadata: {} },
    ],
    navigation_edges: [{ id: ids.edge, from_node_id: ids.nodeA, to_node_id: ids.nodeB, distance_m: 10, weight: 1, edge_type: "walkway", is_bidirectional: true, is_accessible: true, is_emergency_safe: true, is_temporarily_closed: false, metadata: {} }],
  };
  const saved = await admin.rpc("save_campus_structure", { p_campus_id: ids.campus, p_payload: payload });
  pass(!saved.error && saved.data?.buildings === 1 && saved.data?.navigation_edges === 1, "administrator atomic batch save");
  const loaded = await admin.from("map_elements").select("id,building_id,floor_id,is_accessible").eq("campus_id", ids.campus);
  pass(!loaded.error && loaded.data?.[0]?.floor_id === ids.floor && loaded.data[0].is_accessible, "typed structure reload preserves links and accessibility");

  const studentRows = await student.from("map_elements").select("id").eq("campus_id", ids.campus);
  const guestRows = await guest.from("map_elements").select("id").eq("campus_id", ids.campus);
  pass(!studentRows.error && studentRows.data?.length === 0, "student cannot read live authoring rows");
  pass(Boolean(guestRows.error) || guestRows.data?.length === 0, "guest cannot read live authoring rows");
  const studentSave = await student.rpc("save_campus_structure", { p_campus_id: ids.campus, p_payload: { buildings: [], floors: [], map_elements: [], navigation_nodes: [], navigation_edges: [] } });
  pass(Boolean(studentSave.error), "student cannot execute structure saves");

  const otherBuilding = await admin.from("buildings").insert({ id: ids.otherBuilding, campus_id: ids.otherCampus, name: "Other", code: "OTHER", category: "other", width: 10, height: 10 });
  pass(!otherBuilding.error, "cross-campus boundary fixture created");
  const invalid = await admin.from("map_elements").insert({ campus_id: ids.campus, building_id: ids.otherBuilding, element_type: "room", name: "Invalid cross-campus room" });
  pass(Boolean(invalid.error), "cross-campus map relationship rejected");

  const retired = await admin.rpc("save_campus_structure", { p_campus_id: ids.campus, p_payload: { buildings: [], floors: [], map_elements: [], navigation_nodes: [], navigation_edges: [] } });
  pass(!retired.error, "empty draft update remains recoverable");
  const archived = await admin.from("buildings").select("archived_at").eq("id", ids.building).single();
  pass(Boolean(archived.data?.archived_at), "omitted building is archived rather than deleted");
} finally {
  await admin.from("campuses").delete().in("id", [ids.campus, ids.otherCampus]);
  await Promise.all([admin.auth.signOut(), student.auth.signOut(), guest.auth.signOut()]);
}
console.log("A5 live campus structure verification passed.");

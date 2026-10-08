// Continue the same QA event after the card displayed "Pin 1: ..." instead of the raw pin comment.
// Browser UI performs owner acknowledgement, publication, student viewing, and final unpublish.
import fs from "node:fs";
import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
  .filter((line) => /^[A-Z_]+=/.test(line))
  .map((line) => { const i = line.indexOf("="); return [line.slice(0, i), line.slice(i + 1).trim().replace(/^['"]|['"]$/g, "")]; }));
const { chromium } = createRequire(import.meta.url)("C:/Users/Rj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const output = "docs/verification/create-event-2026-10-07-manual/evidence";
const resultPath = `${output}/live-flow-results.json`;
const report = JSON.parse(fs.readFileSync(resultPath, "utf8"));
report.checks = report.checks.filter((item) => !["ORG-UPDATE", "ORG-ACK", "STU-FLOW", "CLEANUP"].includes(item.id));
const eventId = "db0da611-5738-4c55-a9c1-61d2714d77bc";
const comment = "QA feedback: place the event chair beside the main gathering area.";
const resolutionNote = "Checked the marked setup as the event organizer.";
const orgClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const adminClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const studentClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" });
const errors = [];
let adminPage;
let studentPage;
let orgPage;
let adminUser;

function assert(condition, message) { if (!condition) throw new Error(message); }
function pass(id, label, details = {}) { report.checks.push({ id, label, status: "PASS", ...details }); console.log(`PASS ${id} ${label}`); }
async function row() {
  const value = await orgClient.from("map_elements").select("id,metadata,updated_at").eq("id", eventId).single();
  assert(!value.error, value.error?.message ?? "Could not read resumed QA event");
  return value.data;
}
async function waitFor(test, page, message, tries = 80) {
  for (let index = 0; index < tries; index += 1) { const value = await test(); if (value) return value; await page.waitForTimeout(250); }
  throw new Error(message);
}
function storageKey() { return `sb-${new URL(env.VITE_SUPABASE_URL).hostname.split(".")[0]}-auth-token`; }
async function signIn(client, email, password, label) {
  const result = await client.auth.signInWithPassword({ email, password });
  assert(!result.error && result.data.session, `Configured ${label} session could not be opened`);
  return result.data;
}
async function openPage(identity, path, viewport) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: storageKey(), session: identity.session });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://localhost:5173${path}`, { waitUntil: "domcontentloaded" });
  try { await page.waitForLoadState("networkidle", { timeout: 25000 }); } catch {}
  return page;
}
async function capture(page, name) { await page.screenshot({ path: `${output}/${name}.png`, fullPage: false }); }
async function adminCard(page) {
  await page.getByText(report.title, { exact: true }).waitFor({ timeout: 60000 });
  return page.getByText(report.title, { exact: true }).locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
}
async function openEvents(page) {
  await page.getByRole("button", { name: "Open event map", exact: true }).waitFor({ timeout: 60000 });
  await page.getByRole("button", { name: "Open event map", exact: true }).click();
  const panel = page.getByRole("region", { name: "Campus events", exact: true });
  await panel.getByRole("group", { name: "Filter events", exact: true }).waitFor();
  await panel.getByRole("button", { name: "Upcoming", exact: true }).click();
  await panel.getByRole("button", { name: report.title }).waitFor({ timeout: 60000 });
  return panel;
}
async function unpublishIfActive() {
  const current = await row();
  if (current.metadata.isActive !== true || !adminPage) return;
  await adminPage.goto("http://localhost:5173/admin-dashboard/event-layouts", { waitUntil: "domcontentloaded" });
  const card = await adminCard(adminPage);
  await card.getByRole("button", { name: /Manage publication/i }).click();
  const dialog = adminPage.getByRole("dialog", { name: "Manage event publication" });
  await dialog.getByRole("button", { name: /^Unpublish$/i }).click();
  await dialog.getByRole("alertdialog", { name: "Confirm unpublish event" }).getByRole("button", { name: "Confirm unpublish", exact: true }).click();
  await waitFor(async () => { const next = await row(); return next.metadata.isActive === false ? next : null; }, adminPage, "QA event did not unpublish through the admin UI");
  report.unpublished = true;
  report.retainedApprovedRecord = true;
}

try {
  const orgIdentity = await signIn(orgClient, env.VITE_DEMO_ORG_STUDENT_EMAIL, env.VITE_DEMO_ORG_STUDENT_PASSWORD, "Org");
  adminUser = await signIn(adminClient, env.VITE_DEMO_ADMIN_EMAIL, env.VITE_DEMO_ADMIN_PASSWORD, "Admin");
  const studentIdentity = await signIn(studentClient, env.VITE_DEMO_STUDENT_EMAIL, env.VITE_DEMO_STUDENT_PASSWORD, "Student");
  let current = await row();
  assert(current.metadata.title === report.title && current.metadata.status === "approved" && current.metadata.isActive === false, "Resume target is not the same approved, unpublished QA event");
  const groundsLocationId = current.metadata.locations.find((location) => location.locationRef?.type === "campus")?.id;
  assert(groundsLocationId, "QA event has no Campus Grounds location");

  orgPage = await openPage(orgIdentity, "/student/events", { width: 390, height: 844 });
  const orgCard = orgPage.locator(`[data-testid="org-event-card-${eventId}"]`);
  await orgCard.waitFor({ timeout: 60000 });
  await orgCard.getByText("Approved", { exact: true }).waitFor();
  await orgCard.getByText("New GSO update", { exact: true }).waitFor();
  assert((await orgCard.innerText()).includes(`Pin 1: ${comment}`), "Org event card did not display the location feedback pin");
  await capture(orgPage, "10-org-approved-card-mobile");
  pass("ORG-UPDATE", "Org sees the event-specific unread mark, Approved status, and location pin on mobile", { unreadMarkerVisible: true, feedbackVisible: true });
  await orgCard.getByRole("link", { name: "View maps", exact: true }).click();
  await orgPage.waitForURL(`**/student/events/${eventId}/edit`, { timeout: 60000 });
  const checklist = orgPage.locator("[data-feedback-checklist]");
  await checklist.waitFor();
  if (!(await checklist.evaluate((node) => node.open))) await checklist.locator("summary").click();
  await checklist.getByText(comment, { exact: false }).waitFor();
  assert(await orgPage.getByRole("button", { name: "Save Draft", exact: true }).count() === 0, "Approved map exposed a Save Draft control");
  await capture(orgPage, "11-org-approved-map-mobile");
  current = await row();
  const existingResolution = current ? Object.values(current.metadata.feedbackResolutions?.[groundsLocationId] ?? {})[0] : null;
  if (!existingResolution) {
    const resolution = checklist.getByLabel(/Resolution note for pin 1 in/);
    if (await resolution.count()) await resolution.fill(resolutionNote);
    await checklist.getByRole("button", { name: "Mark as addressed", exact: true }).click();
    await checklist.getByRole("button", { name: "Reopen issue", exact: true }).waitFor();
    current = await waitFor(async () => {
      const value = await row();
      return Object.values(value.metadata.feedbackResolutions?.[groundsLocationId] ?? {}).length ? value : null;
    }, orgPage, "Org acknowledgement did not persist");
  }
  assert(Object.values(current.metadata.feedbackResolutions[groundsLocationId])[0].note === resolutionNote, "Org acknowledgement note changed");
  await orgPage.goto("http://localhost:5173/student/events", { waitUntil: "domcontentloaded" });
  const refreshedOrgCard = orgPage.locator(`[data-testid="org-event-card-${eventId}"]`);
  await refreshedOrgCard.waitFor({ timeout: 60000 });
  await refreshedOrgCard.getByText("Approved", { exact: true }).waitFor();
  current = await row();
  assert(Object.values(current.metadata.feedbackResolutions?.[groundsLocationId] ?? {}).length === 1, "Org acknowledgement disappeared after reload");
  pass("ORG-ACK", "Org acknowledged the approved follow-up pin, kept the approved map locked, and the note survived reload");

  adminPage = await openPage(adminUser, "/admin-dashboard/event-layouts", { width: 1440, height: 900 });
  let card = await adminCard(adminPage);
  await card.getByRole("button", { name: /Manage publication/i }).click();
  let publicationDialog = adminPage.getByRole("dialog", { name: "Manage event publication" });
  await publicationDialog.getByRole("button", { name: "Publish now", exact: true }).click();
  current = await waitFor(async () => { const value = await row(); return value.metadata.isActive === true ? value : null; }, adminPage, "Admin could not republish the QA event for student verification");
  report.publicationResumed = true;
  await capture(adminPage, "16-admin-republished-event");

  studentPage = await openPage(studentIdentity, "/map", { width: 1440, height: 900 });
  let panel = await openEvents(studentPage);
  await capture(studentPage, "12-student-upcoming-desktop");
  await panel.getByRole("button", { name: report.title }).click();
  await panel.getByText(`Event locations (${current.metadata.locations.length})`, { exact: true }).waitFor();
  await panel.getByRole("button", { name: /Campus Grounds.*View$/ }).click();
  await panel.getByRole("button", { name: /Campus Grounds.*Viewing$/ }).waitFor();
  await capture(studentPage, "13-student-event-detail-desktop");
  const buildingLocation = current.metadata.locations.find((location) => location.locationRef?.type === "building");
  if (buildingLocation) {
    const buildingButton = panel.getByRole("button").filter({ hasText: buildingLocation.locationRef.label });
    await buildingButton.click();
    await buildingButton.getByText("Viewing", { exact: true }).waitFor();
    await capture(studentPage, "14-student-building-location-desktop");
  }
  await studentPage.setViewportSize({ width: 390, height: 844 });
  await studentPage.reload();
  panel = await openEvents(studentPage);
  await panel.getByRole("button", { name: report.title }).click();
  await panel.getByText(`Event locations (${current.metadata.locations.length})`, { exact: true }).waitFor();
  await capture(studentPage, "15-student-upcoming-mobile");
  pass("STU-FLOW", "Regular student sees this event in Upcoming on desktop and mobile, opens details, and views both maps", { locations: current.metadata.locations.length, desktop: true, mobile: true });

  await unpublishIfActive();
  await studentPage.reload();
  await studentPage.getByRole("button", { name: "Open event map", exact: true }).waitFor({ timeout: 60000 });
  await studentPage.getByRole("button", { name: "Open event map", exact: true }).click();
  panel = studentPage.getByRole("region", { name: "Campus events", exact: true });
  await panel.getByRole("group", { name: "Filter events", exact: true }).waitFor();
  await panel.getByRole("button", { name: "Upcoming", exact: true }).click();
  await panel.getByRole("button", { name: report.title }).waitFor({ state: "detached", timeout: 30000 });
  report.pageErrors.push(...errors);
  pass("CLEANUP", "Admin unpublished the event after student verification; it no longer appears in Upcoming", { eventId, approvedRecordRetained: true });
  report.status = errors.length === 0 ? "PASS" : "FAIL";
  delete report.failure;
  delete report.partialFixtureState;
  delete report.resumeFailure;
  report.resumedAt = new Date().toISOString();
  report.previousSelectorFailure = "The owner card correctly prefixes pin comments with 'Pin 1:'; the selector now checks the rendered card text.";
} catch (error) {
  report.status = "FAIL";
  report.resumeFailure = error instanceof Error ? error.message : String(error);
  for (const [page, name] of [[orgPage, "resume-failure-org"], [adminPage, "resume-failure-admin"], [studentPage, "resume-failure-student"]]) {
    if (page) try { await capture(page, name); } catch {}
  }
  try { await unpublishIfActive(); } catch (cleanupError) { report.cleanupError = cleanupError instanceof Error ? cleanupError.message : String(cleanupError); }
  console.log(`FAIL ${report.resumeFailure}`);
  process.exitCode = 1;
} finally {
  await browser.close();
  await Promise.all([orgClient.auth.signOut({ scope: "local" }), adminClient.auth.signOut({ scope: "local" }), studentClient.auth.signOut({ scope: "local" })]);
  fs.writeFileSync(resultPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, eventId, approved: report.approved, unpublished: report.unpublished, checks: report.checks.map(({ id, status }) => ({ id, status })), failure: report.resumeFailure ?? null }));
}

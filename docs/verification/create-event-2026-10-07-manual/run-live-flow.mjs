// QA-only browser flow: Student Org creates -> Admin pins/approves -> Org acknowledges -> Student views Upcoming.
// All create/review/publication writes are performed through the visible app UI.
// Supabase reads below only verify persistence. Never log auth tokens, credentials, or session objects.
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
  .filter((line) => /^[A-Z_]+=/.test(line))
  .map((line) => { const i = line.indexOf("="); return [line.slice(0, i), line.slice(i + 1).trim().replace(/^['"]|['"]$/g, "")]; }));
const { chromium } = createRequire(import.meta.url)("C:/Users/Rj/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const out = "docs/verification/create-event-2026-10-07-manual/evidence";
fs.mkdirSync(out, { recursive: true });

const shortId = randomUUID().slice(0, 8);
const report = {
  runDate: new Date().toISOString(),
  timezone: "Asia/Manila",
  appUrl: "http://localhost:5173",
  title: `QA TEST Event Flow ${shortId}`,
  description: "Temporary QA event used to verify create, review feedback, approval, and student Upcoming view.",
  eventId: null,
  requestedLocations: [],
  viewportRuns: [],
  checks: [],
  pageErrors: [],
  consoleErrors: [],
  approved: false,
  unpublished: false,
  status: "RUNNING",
};
const orphanFromFirstAttempt = {
  id: "cb47fd69-4039-4b51-8f7c-22e2967cface",
  title: "QA TEST Event Flow 626078be",
};

const orgClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const adminClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const studentClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" });
let orgIdentity;
let adminIdentity;
let studentIdentity;
let orgPage;
let adminPage;
let studentPage;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function pass(id, label, details = {}) {
  report.checks.push({ id, label, status: "PASS", ...details });
  console.log(`PASS ${id} ${label}`);
}

function notRun(id, label, reason) {
  report.checks.push({ id, label, status: "NOT RUN", reason });
}

async function overlayRow() {
  const result = await orgClient.from("map_elements").select("id,metadata,updated_at").eq("id", report.eventId).single();
  assert(!result.error, result.error?.message ?? "QA event readback failed");
  return result.data;
}

async function waitFor(test, page, message, tries = 80) {
  for (let i = 0; i < tries; i += 1) {
    const value = await test();
    if (value) return value;
    await page.waitForTimeout(250);
  }
  throw new Error(message);
}

function phtDateAfter(days) {
  const pieces = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date());
  const part = (type) => pieces.find((item) => item.type === type)?.value ?? "";
  const utcNoon = new Date(Date.UTC(Number(part("year")), Number(part("month")) - 1, Number(part("day")) + days, 12));
  const date = `${utcNoon.getUTCFullYear()}-${String(utcNoon.getUTCMonth() + 1).padStart(2, "0")}-${String(utcNoon.getUTCDate()).padStart(2, "0")}`;
  return { date, month: new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", month: "long", year: "numeric" }).format(utcNoon), label: new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", month: "long", day: "numeric", year: "numeric" }).format(utcNoon) };
}

async function login(client, email, password, roleName) {
  assert(email && password, `Missing configured ${roleName} demo login`);
  const result = await client.auth.signInWithPassword({ email, password });
  assert(!result.error && result.data.session, `Configured ${roleName} login failed`);
  return result.data;
}

function authKey() {
  return `sb-${new URL(env.VITE_SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
}

async function pageFor(identity, route, viewport) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: authKey(), session: identity.session });
  const page = await context.newPage();
  page.on("pageerror", (error) => report.pageErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") report.consoleErrors.push(message.text().slice(0, 300)); });
  await page.goto(`http://localhost:5173${route}`, { waitUntil: "domcontentloaded" });
  try { await page.waitForLoadState("networkidle", { timeout: 25000 }); } catch { report.checks.push({ id: "SET-02-NETWORKIDLE", label: "App settled after route navigation", status: "WARN", details: "networkidle timed out; continued after the rendered app became available" }); }
  return page;
}

async function screenshot(page, name, fullPage = false) {
  await page.screenshot({ path: `${out}/${name}.png`, fullPage });
}

async function assertToastDoesNotBlockSubmit(page, stage) {
  await page.getByText("Draft saved", { exact: true }).waitFor({ timeout: 10000 });
  const submit = page.getByRole("button", { name: "Review & submit", exact: true });
  const blocked = await submit.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return !hit || !(hit === element || element.contains(hit));
  });
  assert(!blocked, `A Draft saved toast intercepts Review & submit after ${stage}`);
  pass("TOAST-01", "Save confirmation leaves the primary submit action clickable", { stage });
}

async function pageMetrics(page, selector) {
  return page.locator(selector).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      width: Math.round(rect.width), height: Math.round(rect.height),
      top: Math.round(rect.top), bottom: Math.round(rect.bottom),
      clientHeight: element.clientHeight, scrollHeight: element.scrollHeight,
      hasInternalVerticalScroll: element.scrollHeight > element.clientHeight + 1,
      viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
      documentHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
}

async function mapClick(page, x, y) {
  const canvas = page.getByLabel("Event layout canvas", { exact: true });
  await canvas.waitFor({ timeout: 30000 });
  const box = await canvas.boundingBox();
  assert(box && box.width > 0 && box.height > 0, "Event map canvas has no visible size");
  await canvas.click({ position: { x: box.width * x, y: box.height * y } });
}

async function selectDate(page, label, dateValue) {
  const field = page.getByRole("button", { name: new RegExp(`^Choose ${label.toLowerCase()} date$`) });
  await field.click();
  const monthHeader = page.locator("[data-radix-popper-content-wrapper] p[aria-live='polite']").first();
  await monthHeader.waitFor();
  const [targetYear, targetMonthNumber, targetDay] = dateValue.split("-").map(Number);
  const targetMonthName = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long" }).format(new Date(Date.UTC(targetYear, targetMonthNumber - 1, 1)));
  const targetMonth = `${targetMonthName} ${targetYear}`;
  const targetLabel = `${targetMonthName} ${targetDay}, ${targetYear}`;
  let visible = await monthHeader.innerText();
  function monthIndex(value) {
    const [monthName, yearText] = value.split(/\s+/);
    return Number(yearText) * 12 + new Date(`${monthName} 1, ${yearText}`).getMonth();
  }
  for (let attempt = 0; visible !== targetMonth && attempt < 4; attempt += 1) {
    const delta = monthIndex(targetMonth) - monthIndex(visible);
    await page.getByRole("button", { name: delta < 0 ? "Previous month" : "Next month", exact: true }).click();
    visible = await monthHeader.innerText();
  }
  assert(visible === targetMonth, `Calendar did not reach ${targetMonth} for ${label}; saw ${visible}`);
  await page.getByRole("button", { name: targetLabel, exact: true }).click();
}

async function setDisclosureOpen(disclosure, open) {
  if (await disclosure.evaluate((node) => node.open) !== open) await disclosure.locator("summary").click();
}

async function adminReviewCard(page) {
  await page.getByText(report.title, { exact: true }).waitFor({ timeout: 60000 });
  return page.getByText(report.title, { exact: true }).locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
}

async function cleanupOwnedFixtureAfterFailure() {
  if (!report.eventId || !orgIdentity) return;
  const result = await orgClient.from("map_elements").select("id,metadata").eq("id", report.eventId).maybeSingle();
  if (result.error || !result.data) return;
  const metadata = result.data.metadata;
  if (metadata.title !== report.title || metadata.createdByUserId !== orgIdentity.user.id) return;
  if (metadata.status === "approved") {
    if (!metadata.isActive) { report.unpublished = true; report.retainedApprovedRecord = true; return; }
    if (!adminPage || !adminIdentity) return;
    await adminPage.goto("http://localhost:5173/admin-dashboard/event-layouts", { waitUntil: "domcontentloaded" });
    const card = await adminReviewCard(adminPage);
    await card.getByRole("button", { name: /Manage publication/i }).click();
    const dialog = adminPage.getByRole("dialog", { name: "Manage event publication" });
    await dialog.getByRole("button", { name: /^Unpublish$/i }).click();
    await dialog.getByRole("alertdialog", { name: "Confirm unpublish event" }).getByRole("button", { name: "Confirm unpublish", exact: true }).click();
    await waitFor(async () => { const value = await overlayRow(); return value.metadata.isActive === false ? value : null; }, adminPage, "Failure cleanup could not unpublish the approved QA event");
    report.unpublished = true;
    report.retainedApprovedRecord = true;
    return;
  }
  if (!orgPage) return;
  await orgPage.goto("http://localhost:5173/student/events", { waitUntil: "domcontentloaded" });
  const card = orgPage.locator(`[data-testid="org-event-card-${report.eventId}"]`);
  await card.waitFor({ timeout: 30000 });
  let current = await overlayRow();
  if (current.metadata.status === "pending") {
    await card.getByRole("button", { name: "Withdraw submission", exact: true }).click();
    await orgPage.getByRole("button", { name: "Withdraw to draft", exact: true }).click();
    current = await waitFor(async () => { const value = await overlayRow(); return value.metadata.status === "draft" ? value : null; }, orgPage, "Failure cleanup could not withdraw the QA submission");
    await orgPage.reload();
  }
  if (["draft", "disapproved"].includes(current.metadata.status)) {
    const deletableCard = orgPage.locator(`[data-testid="org-event-card-${report.eventId}"]`);
    await deletableCard.getByRole("button", { name: "Delete", exact: true }).click();
    await orgPage.getByText("Delete event proposal?", { exact: true }).waitFor();
    await orgPage.getByRole("dialog").getByRole("button", { name: "Delete event", exact: true }).click();
    await deletableCard.waitFor({ state: "detached", timeout: 30000 });
    const deleted = await orgClient.from("map_elements").select("id").eq("id", report.eventId).maybeSingle();
    if (!deleted.error && !deleted.data) report.fixtureCleanedByUI = true;
  }
}

try {
  assert(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_PUBLISHABLE_KEY, "Supabase local configuration is incomplete");
  orgIdentity = await login(orgClient, env.VITE_DEMO_ORG_STUDENT_EMAIL, env.VITE_DEMO_ORG_STUDENT_PASSWORD, "student organization");
  adminIdentity = await login(adminClient, env.VITE_DEMO_ADMIN_EMAIL, env.VITE_DEMO_ADMIN_PASSWORD, "administrator");
  studentIdentity = await login(studentClient, env.VITE_DEMO_STUDENT_EMAIL, env.VITE_DEMO_STUDENT_PASSWORD, "regular student");
  pass("SET-03", "Separate configured Org, Admin, and Student sessions authenticate");

  // Student Org: create a uniquely named QA proposal with Campus Grounds and one published building floor.
  orgPage = await pageFor(orgIdentity, "/student/events", { width: 1440, height: 900 });
  const orphanResult = await orgClient.from("map_elements").select("id,metadata").eq("id", orphanFromFirstAttempt.id).maybeSingle();
  assert(!orphanResult.error, "Could not check the previous incomplete QA draft before continuing");
  if (orphanResult.data) {
    const orphan = orphanResult.data;
    assert(orphan.metadata.title === orphanFromFirstAttempt.title && orphan.metadata.createdByUserId === orgIdentity.user.id && orphan.metadata.status === "draft", "Previous QA draft no longer matches the safe cleanup target; it was left untouched");
    const orphanCard = orgPage.locator(`[data-testid="org-event-card-${orphanFromFirstAttempt.id}"]`);
    await orphanCard.waitFor({ timeout: 60000 });
    await orphanCard.getByRole("button", { name: "Delete", exact: true }).click();
    await orgPage.getByText("Delete event proposal?", { exact: true }).waitFor();
    await orgPage.getByRole("dialog").getByRole("button", { name: "Delete event", exact: true }).click();
    await orphanCard.waitFor({ state: "detached", timeout: 30000 });
    const deletedOrphan = await orgClient.from("map_elements").select("id").eq("id", orphanFromFirstAttempt.id).maybeSingle();
    assert(!deletedOrphan.error && !deletedOrphan.data, "The previous incomplete QA draft remains after the UI delete");
    pass("RECOVERY", "Removed the incomplete draft from the first browser attempt through the Org UI");
  }
  const createButton = orgPage.getByRole("button", { name: "Create event", exact: true });
  await createButton.waitFor({ timeout: 60000 });
  await createButton.click();
  const createDialog = orgPage.getByRole("dialog", { name: "Create event proposal" });
  await createDialog.waitFor();
  await orgPage.getByLabel("Event title *", { exact: true }).fill(report.title);
  await orgPage.getByLabel("Description", { exact: true }).fill(report.description);
  const organizationField = orgPage.getByLabel(/Organization name/i);
  if (await organizationField.count()) await organizationField.fill("QA Demo Organization");
  report.viewportRuns.push({ role: "Student Org", viewport: "1440x900", createDialog: await pageMetrics(orgPage, '[role="dialog"]') });
  await screenshot(orgPage, "01-org-create-details-desktop");
  await orgPage.getByRole("button", { name: "Continue", exact: true }).click();
  const picker = orgPage.getByTestId("event-location-picker");
  await picker.waitFor();
  await picker.getByRole("checkbox", { name: "Campus Grounds", exact: true }).check();
  const firstFloor = picker.locator('fieldset[aria-label^="Available floors in"] input[type="checkbox"]').first();
  if (await firstFloor.count()) await firstFloor.check();
  const selectedLocations = await picker.locator('[aria-label="Selected locations"]').innerText();
  assert(selectedLocations.includes("Campus Grounds"), "Campus Grounds did not appear in the selected location summary");
  report.requestedLocations = selectedLocations.split("\n").map((value) => value.trim()).filter(Boolean);
  const selectedCount = await picker.locator('[aria-label="Selected locations"] > *').count();
  assert(selectedCount >= 1, "No requested location is shown in the selected summary");
  await screenshot(orgPage, "02-org-location-selection-desktop");
  await orgPage.getByRole("button", { name: "Create & design maps", exact: true }).click();
  const confirmation = orgPage.getByRole("alertdialog", { name: "Review event proposal" });
  await confirmation.waitFor();
  assert((await confirmation.innerText()).includes(report.title), "Confirmation omitted the event title");
  await screenshot(orgPage, "03-org-create-confirmation-desktop");
  await orgPage.getByRole("button", { name: "Confirm & design", exact: true }).click();
  await orgPage.waitForURL("**/student/events/*/edit", { timeout: 60000 });
  report.eventId = orgPage.url().split("/").at(-2);
  let current = await waitFor(async () => {
    const result = await orgClient.from("map_elements").select("id,metadata,updated_at").eq("id", report.eventId).maybeSingle();
    return !result.error && result.data ? result.data : null;
  }, orgPage, "Created QA draft was not readable after the UI completed");
  assert(current.metadata.title === report.title && current.metadata.createdByUserId === orgIdentity.user.id && current.metadata.status === "draft", "UI did not create an owned draft with the entered title");
  const locations = current.metadata.locations ?? [];
  report.locationIds = locations.map((location) => location.id);
  report.groundsLocationId = locations.find((location) => location.locationRef?.type === "campus")?.id;
  report.buildingLocationId = locations.find((location) => location.locationRef?.type === "building")?.id ?? null;
  assert(report.groundsLocationId, "Created draft has no Campus Grounds map");
  report.createdByUI = true;
  const skipTour = orgPage.getByRole("button", { name: "Skip tour", exact: true });
  await skipTour.first().waitFor({ timeout: 15000 });
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const count = await skipTour.count();
    let visibleIndex = -1;
    for (let index = 0; index < count; index += 1) {
      if (await skipTour.nth(index).isVisible()) { visibleIndex = index; break; }
    }
    if (visibleIndex < 0) break;
    await skipTour.nth(visibleIndex).click();
    await orgPage.waitForTimeout(150);
  }
  const furnitureTool = orgPage.getByRole("button", { name: "Furniture", exact: true });
  await furnitureTool.waitFor({ timeout: 15000 });
  await furnitureTool.click();
  await orgPage.getByRole("button", { name: "Chair", exact: true }).click();
  await mapClick(orgPage, 0.52, 0.72);
  await orgPage.getByRole("button", { name: "Save Draft", exact: true }).click();
  await assertToastDoesNotBlockSubmit(orgPage, "Campus Grounds save");
  current = await waitFor(async () => {
    const result = await orgClient.from("map_elements").select("id,metadata,updated_at").eq("id", report.eventId).single();
    return !result.error && result.data.metadata.locations?.some((location) => location.eventFurniture?.length > 0) ? result.data : null;
  }, orgPage, "Furniture placement did not persist after Save Draft");
  report.initialFurnitureCount = current.metadata.locations.reduce((sum, location) => sum + (location.eventFurniture?.length ?? 0), 0);
  assert(report.initialFurnitureCount >= 1, "The saved event map has no furniture");
  await screenshot(orgPage, "04-org-editor-saved-desktop");
  await orgPage.getByRole("button", { name: "Review & submit", exact: true }).click();
  let submissionReview = orgPage.getByRole("dialog", { name: "Review before submitting" });
  await submissionReview.waitFor();
  assert((await submissionReview.innerText()).includes(`${locations.length} requested maps`), "Submission summary does not include all requested locations");
  const firstConfirm = submissionReview.getByRole("button", { name: "Confirm submission", exact: true });
  if (!(await firstConfirm.isEnabled())) {
    const floorLocation = current.metadata.locations.find((location) => location.id === report.buildingLocationId);
    assert(floorLocation && (await submissionReview.innerText()).includes("Required fix: Add the planned assets or labels to this map."), "Submission was blocked without a clear empty-map explanation");
    pass("SUBMIT-GATE", "Review blocked an empty requested building map and explained the required fix", { location: floorLocation.locationRef.label });
    await submissionReview.getByRole("button", { name: `Review ${floorLocation.locationRef.label}`, exact: true }).click();
    await submissionReview.waitFor({ state: "hidden" });
    await orgPage.getByRole("button", { name: "Furniture", exact: true }).click();
    await orgPage.getByRole("button", { name: "Chair", exact: true }).click();
    await mapClick(orgPage, 0.48, 0.55);
    await orgPage.getByRole("button", { name: "Save Draft", exact: true }).click();
    await assertToastDoesNotBlockSubmit(orgPage, "building floor save");
    current = await waitFor(async () => {
      const result = await orgClient.from("map_elements").select("id,metadata,updated_at").eq("id", report.eventId).single();
      return !result.error && result.data.metadata.locations?.some((location) => location.id === report.buildingLocationId && location.eventFurniture?.length > 0) ? result.data : null;
    }, orgPage, "Furniture did not persist on the requested building floor");
    await screenshot(orgPage, "05-org-building-map-saved-desktop");
    await orgPage.getByRole("button", { name: "Review & submit", exact: true }).click();
    submissionReview = orgPage.getByRole("dialog", { name: "Review before submitting" });
    await submissionReview.waitFor();
  }
  assert(await submissionReview.getByRole("button", { name: "Confirm submission", exact: true }).isEnabled(), "Submission remained blocked after all requested maps received assets");
  report.initialFurnitureCount = current.metadata.locations.reduce((sum, location) => sum + (location.eventFurniture?.length ?? 0), 0);
  assert(current.metadata.locations.filter((location) => [report.groundsLocationId, report.buildingLocationId].includes(location.id)).every((location) => (location.eventFurniture?.length ?? 0) > 0), "Each requested map must have its own saved event asset before submission");
  await screenshot(orgPage, "05-org-submission-review-desktop");
  await orgPage.getByRole("button", { name: "Confirm submission", exact: true }).click();
  await orgPage.waitForURL("**/student/events", { timeout: 60000 });
  current = await waitFor(async () => { const value = await overlayRow(); return value.metadata.status === "pending" ? value : null; }, orgPage, "Submitted event did not enter Pending review");
  pass("CRE-FLOW", "Org created a multi-location draft, saved furniture, reviewed the map summary, and submitted it", { eventId: report.eventId, requestedLocations: locations.map((location) => location.locationRef.label), furniture: report.initialFurnitureCount });

  // Admin: inspect the real pending card, add one map feedback pin, set a future PHT schedule, approve.
  adminPage = await pageFor(adminIdentity, "/admin-dashboard/event-layouts", { width: 1440, height: 900 });
  const pendingCard = await adminReviewCard(adminPage);
  await pendingCard.getByRole("button", { name: "Review submission", exact: true }).click();
  const reviewDialog = adminPage.getByRole("dialog", { name: "Review Event Layout" });
  await reviewDialog.waitFor();
  report.viewportRuns.push({ role: "Admin", viewport: "1440x900", reviewDialog: await pageMetrics(adminPage, '[role="dialog"]') });
  await screenshot(adminPage, "06-admin-review-desktop");
  const scheduleDate = phtDateAfter(45);
  await adminPage.getByRole("button", { name: "Preview requested maps", exact: true }).click();
  const previewCanvas = adminPage.getByLabel("Event layout canvas", { exact: true });
  await previewCanvas.waitFor({ timeout: 30000 });
  await adminPage.getByRole("button", { name: "Add pin", exact: true }).click();
  const previewBox = await previewCanvas.boundingBox();
  assert(previewBox && previewBox.width > 0, "Admin map preview canvas is not visible");
  await previewCanvas.click({ position: { x: previewBox.width * 0.42, y: previewBox.height * 0.65 } });
  await adminPage.getByLabel("Pin comment", { exact: true }).fill("QA feedback: place the event chair beside the main gathering area.");
  await adminPage.getByRole("button", { name: "Save pin", exact: true }).click();
  await adminPage.getByText("1/30 pins", { exact: true }).waitFor();
  await screenshot(adminPage, "07-admin-feedback-pin-desktop");
  await adminPage.getByRole("button", { name: "Close map preview", exact: true }).click();
  const adminComment = adminPage.getByLabel(/Admin Comment/i);
  if (await adminComment.count()) await adminComment.fill("QA approval: please note the marked chair placement.");

  // Exercise the mobile time picker and its minute input before applying the schedule.
  await adminPage.setViewportSize({ width: 390, height: 844 });
  const startTime = adminPage.getByRole("button", { name: /^Event starts time:/ });
  await startTime.click();
  const timeDialog = adminPage.getByRole("dialog", { name: "Event starts time picker" });
  await timeDialog.waitFor();
  report.viewportRuns.push({ role: "Admin", viewport: "390x844", timePicker: await pageMetrics(adminPage, '[aria-label="Event starts time picker"]') });
  const minuteInput = timeDialog.getByRole("spinbutton", { name: "Minute" });
  await minuteInput.fill("30");
  await timeDialog.getByRole("button", { name: "Done", exact: true }).click();
  assert(await adminPage.getByRole("button", { name: "Event starts time: 9:30 AM", exact: true }).count(), "Minute entry did not update the event start time");
  await screenshot(adminPage, "08-admin-time-picker-mobile");
  await selectDate(adminPage, "Event starts", scheduleDate.date);
  await selectDate(adminPage, "Event ends", scheduleDate.date);
  await adminPage.setViewportSize({ width: 1440, height: 900 });
  await screenshot(adminPage, "09-admin-schedule-desktop");
  report.approvedSchedule = { date: scheduleDate.date, start: "09:30", end: "17:00", timezone: "Asia/Manila" };
  const conflictText = await reviewDialog.innerText();
  if (/Location\/time conflict:/i.test(conflictText)) {
    report.scheduleConflictWarning = conflictText.match(/Location\/time conflict:[^\n]*/i)?.[0] ?? "Location/time conflict warning visible";
  }
  const approveButton = reviewDialog.getByRole("button", { name: "Approve", exact: true });
  assert(await approveButton.isEnabled(), "Approve stayed disabled after valid future schedule selection");
  await approveButton.click();
  current = await waitFor(async () => { const value = await overlayRow(); return value.metadata.status === "approved" ? value : null; }, adminPage, "Approve did not persist the QA event");
  report.approved = true;
  assert(current.metadata.dateStart && current.metadata.dateEnd, "Approved event has no schedule");
  const approvedFeedback = current.metadata.locationFeedback?.[report.groundsLocationId];
  assert(typeof approvedFeedback === "string" && approvedFeedback.includes("QA feedback: place the event chair"), "Approval did not persist the pin feedback with the decision");
  report.publication = { isActive: Boolean(current.metadata.isActive), publicationAt: current.metadata.publicationAt ?? null };
  assert(report.publication.isActive, "Approve did not publish the event immediately");
  pass("ADM-FLOW", "Admin previewed the submitted maps, saved a feedback pin, set schedule, and approved/published", { schedule: report.approvedSchedule, conflictWarning: report.scheduleConflictWarning ?? null });

  // Student Org: inspect the approved card and feedback, then acknowledge the follow-up pin on mobile.
  await orgPage.setViewportSize({ width: 390, height: 844 });
  await orgPage.reload();
  const orgCard = orgPage.locator(`[data-testid="org-event-card-${report.eventId}"]`);
  await orgCard.waitFor({ timeout: 60000 });
  await orgCard.getByText("Approved", { exact: true }).waitFor();
  await orgCard.getByText("New GSO update", { exact: true }).waitFor({ timeout: 15000 }).catch(() => {});
  await orgCard.getByText("QA feedback: place the event chair beside the main gathering area.", { exact: true }).waitFor();
  report.orgUnreadMarkerVisible = (await orgCard.getByText("New GSO update", { exact: true }).count()) > 0;
  report.viewportRuns.push({ role: "Student Org", viewport: "390x844", eventCard: await pageMetrics(orgPage, `[data-testid="org-event-card-${report.eventId}"]`) });
  await screenshot(orgPage, "10-org-approved-card-mobile");
  await orgCard.getByRole("link", { name: "View maps", exact: true }).click();
  await orgPage.waitForURL(`**/student/events/${report.eventId}/edit`, { timeout: 60000 });
  const orgChecklist = orgPage.locator("[data-feedback-checklist]");
  await orgChecklist.waitFor();
  await setDisclosureOpen(orgChecklist, true);
  await orgChecklist.getByText("QA feedback: place the event chair beside the main gathering area.", { exact: true }).waitFor();
  assert(await orgPage.getByRole("button", { name: "Save Draft", exact: true }).count() === 0, "Approved event exposes an editable Save Draft action");
  await screenshot(orgPage, "11-org-approved-map-mobile");
  const resolution = orgChecklist.getByLabel(/Resolution note for pin 1 in/);
  if (await resolution.count()) await resolution.fill("Checked the marked setup as the event organizer.");
  await orgChecklist.getByRole("button", { name: "Mark as addressed", exact: true }).click();
  await orgChecklist.getByRole("button", { name: "Reopen issue", exact: true }).waitFor();
  current = await waitFor(async () => {
    const value = await overlayRow();
    const feedbackResolutions = value.metadata.feedbackResolutions?.[report.groundsLocationId] ?? {};
    return Object.keys(feedbackResolutions).length ? value : null;
  }, orgPage, "Student organization did not persist the feedback acknowledgement");
  const resolutionEntry = Object.values(current.metadata.feedbackResolutions?.[report.groundsLocationId] ?? {})[0];
  assert(resolutionEntry?.note === "Checked the marked setup as the event organizer.", "Owner feedback resolution note did not persist");
  await orgPage.reload();
  await orgPage.getByRole("button", { name: "View maps", exact: true }).waitFor();
  current = await overlayRow();
  assert(Object.values(current.metadata.feedbackResolutions?.[report.groundsLocationId] ?? {}).length === 1, "Owner feedback acknowledgement disappeared after reload");
  pass("ORG-FLOW", "Org saw the approved status and pin on mobile, confirmed the map is locked, and saved an addressed note", { unreadMarkerVisible: report.orgUnreadMarkerVisible });

  // Regular Student: upcoming filter and both requested locations, first on desktop then on mobile.
  studentPage = await pageFor(studentIdentity, "/map", { width: 1440, height: 900 });
  await studentPage.getByRole("button", { name: "Open event map", exact: true }).waitFor({ timeout: 60000 });
  await studentPage.getByRole("button", { name: "Open event map", exact: true }).click();
  const panel = studentPage.getByRole("region", { name: "Campus events", exact: true });
  await panel.getByRole("group", { name: "Filter events", exact: true }).waitFor();
  await panel.getByText(/Loading published events/).waitFor({ state: "hidden" });
  await panel.getByRole("button", { name: "Upcoming", exact: true }).click();
  await panel.getByRole("button", { name: report.title }).waitFor({ timeout: 60000 });
  await screenshot(studentPage, "12-student-upcoming-desktop");
  await panel.getByRole("button", { name: report.title }).click();
  await panel.getByText(`Event locations (${locations.length})`, { exact: true }).waitFor();
  await panel.getByRole("button", { name: /Campus Grounds.*View$/ }).click();
  await panel.getByRole("button", { name: /Campus Grounds.*Viewing$/ }).waitFor();
  await screenshot(studentPage, "13-student-event-detail-desktop");
  if (report.buildingLocationId) {
    const buildingLocation = locations.find((location) => location.id === report.buildingLocationId);
    const buildingButton = panel.getByRole("button").filter({ hasText: buildingLocation.locationRef.label });
    await buildingButton.waitFor();
    await buildingButton.click();
    await buildingButton.getByText("Viewing", { exact: true }).waitFor();
    await screenshot(studentPage, "14-student-building-location-desktop");
  }
  report.viewportRuns.push({ role: "Student", viewport: "1440x900", eventPanel: await pageMetrics(studentPage, '[aria-label="Campus events"]') });

  await studentPage.setViewportSize({ width: 390, height: 844 });
  await studentPage.reload();
  await studentPage.getByRole("button", { name: "Open event map", exact: true }).waitFor({ timeout: 60000 });
  await studentPage.getByRole("button", { name: "Open event map", exact: true }).click();
  const mobilePanel = studentPage.getByRole("region", { name: "Campus events", exact: true });
  await mobilePanel.getByRole("group", { name: "Filter events", exact: true }).waitFor();
  await mobilePanel.getByRole("button", { name: "Upcoming", exact: true }).click();
  await mobilePanel.getByRole("button", { name: report.title }).waitFor({ timeout: 60000 });
  await mobilePanel.getByRole("button", { name: report.title }).click();
  await mobilePanel.getByText(`Event locations (${locations.length})`, { exact: true }).waitFor();
  report.viewportRuns.push({ role: "Student", viewport: "390x844", eventPanel: await pageMetrics(studentPage, '[aria-label="Campus events"]') });
  await screenshot(studentPage, "15-student-upcoming-mobile");
  pass("STU-FLOW", "Regular Student found the published event under Upcoming, opened its details, and switched locations", { locations: locations.length, desktop: true, mobile: true });

  // Cleanup through the supported UI: unpublish the approved event and verify student visibility is removed.
  await adminPage.setViewportSize({ width: 1440, height: 900 });
  await adminPage.goto("http://localhost:5173/admin-dashboard/event-layouts", { waitUntil: "domcontentloaded" });
  try { await adminPage.waitForLoadState("networkidle", { timeout: 25000 }); } catch {}
  const approvedCard = await adminReviewCard(adminPage);
  await approvedCard.getByRole("button", { name: /Manage publication/i }).click();
  const publicationDialog = adminPage.getByRole("dialog", { name: "Manage event publication" });
  await publicationDialog.waitFor();
  await screenshot(adminPage, "16-admin-publication-settings");
  await publicationDialog.getByRole("button", { name: /^Unpublish$/i }).click();
  const unpublishConfirmation = publicationDialog.getByRole("alertdialog", { name: "Confirm unpublish event" });
  await unpublishConfirmation.waitFor();
  await unpublishConfirmation.getByRole("button", { name: "Confirm unpublish", exact: true }).click();
  current = await waitFor(async () => { const value = await overlayRow(); return value.metadata.isActive === false ? value : null; }, adminPage, "Unpublish did not remove the QA event from active publication");
  report.unpublished = true;
  report.retainedApprovedRecord = true;
  await studentPage.reload();
  await studentPage.getByRole("button", { name: "Open event map", exact: true }).waitFor({ timeout: 60000 });
  await studentPage.getByRole("button", { name: "Open event map", exact: true }).click();
  const hiddenPanel = studentPage.getByRole("region", { name: "Campus events", exact: true });
  await hiddenPanel.getByRole("button", { name: "Upcoming", exact: true }).click();
  await hiddenPanel.getByRole("button", { name: report.title }).waitFor({ state: "detached", timeout: 30000 });
  pass("CLEANUP", "Admin unpublished the tested event through the supported dialog; Student Upcoming no longer lists it", { eventId: report.eventId, approvedRecordRetained: true });

  report.status = report.pageErrors.length === 0 ? "PASS" : "FAIL";
  if (report.pageErrors.length) throw new Error(`Browser page errors: ${report.pageErrors.join(" | ")}`);
} catch (error) {
  report.status = "FAIL";
  report.failure = error instanceof Error ? error.message : String(error);
  report.partialFixtureState = report.approved ? (report.unpublished ? "approved and unpublished" : "approved; cleanup still required") : report.createdByUI ? "created; approval not completed" : "not created";
  for (const [page, name] of [[orgPage, "failure-org"], [adminPage, "failure-admin"], [studentPage, "failure-student"]]) {
    if (!page) continue;
    try { await screenshot(page, name); } catch {}
  }
  try { await cleanupOwnedFixtureAfterFailure(); } catch (cleanupError) { report.cleanupError = cleanupError instanceof Error ? cleanupError.message : String(cleanupError); }
  console.log(`FAIL ${report.failure}`);
  process.exitCode = 1;
} finally {
  await browser.close();
  await Promise.all([orgClient.auth.signOut({ scope: "local" }), adminClient.auth.signOut({ scope: "local" }), studentClient.auth.signOut({ scope: "local" })]);
  fs.writeFileSync(`${out}/live-flow-results.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, eventId: report.eventId, requestedLocations: report.requestedLocations, approved: report.approved, unpublished: report.unpublished, checks: report.checks.map(({ id, status }) => ({ id, status })), pageErrors: report.pageErrors.length, failure: report.failure ?? null }));
}

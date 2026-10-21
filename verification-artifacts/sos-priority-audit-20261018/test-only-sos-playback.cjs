const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(process.env.TEMP, "plv-navisync-acceptance", "node_modules", "playwright"));
const base = process.env.SOS_AUDIT_BASE || "http://[::1]:5173";
const campusPath = path.resolve("verification-artifacts/assembly-point-ordinary-sos/admin-conflict-rerun-draft/student-preview/test-only-campus-saved-route-approved.json");
const out = path.resolve(process.env.SOS_OUTPUT_DIR || "verification-artifacts/route-discovery-admin/admin-automatic-sos-student");
const screenshotSuffix = Number(process.env.SOS_VIEWPORT || 1440);
const viewportHeight = Number(process.env.SOS_HEIGHT || 900);
let campus = JSON.parse(fs.readFileSync(campusPath, "utf8").replace(/^\uFEFF/, ""));
const target = campus.buildings.flatMap((building) => building.floors.flatMap((floor) => floor.rooms.map((room) => ({ building, floor, room }))))
  .find(({ room }) => /CABA LECTURE HALL/i.test(room.name));
if (!target) throw new Error("TEST ONLY CABA Lecture Hall fixture is missing");
target.room.emergencyEvacuation = { enabled: false, routes: [] };
const primary = campus.assemblyPoints.find((point) => point.buildingAssignments?.some((assignment) =>
  assignment.buildingId === target.building.id && assignment.designation === "primary"));
const results = { viewport: { width: screenshotSuffix, height: viewportHeight }, theme: process.env.SOS_THEME === "dark" ? "dark" : "light", localDraft: { publishStatus: campus.publishStatus, lifecycleStatus: campus.lifecycleStatus, visibleToStudents: campus.visibleToStudents, preview: "browser-local published-like snapshot only" }, isolation: "TEST ONLY exact saved local Admin campus served as browser-local published-like snapshot; remote writes blocked", source: { campusId: campus.id, campusName: campus.name, pointCount: campus.assemblyPoints.length, room: target.room.name, smartMultiExit: target.room.emergencyEvacuation.enabled, approvedRouteCount: target.room.emergencyEvacuation.routes.filter((route) => route.approved).length, primaryName: primary?.name, primaryNodeId: primary?.navNodeId, approvedRouteDestination: primary?.navNodeId ?? null }, browserErrors: [], blockedWrites: [], screenshots: [], progression: [] };
function json(route, value, status = 200) { return route.fulfill({ status, body: JSON.stringify(value), headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS" } }); }
async function main() {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Users/user/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe", args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-gl=angle", "--use-angle=swiftshader"] });
  const context = await browser.newContext({ viewport: { width: screenshotSuffix, height: viewportHeight }, colorScheme: process.env.SOS_THEME === "dark" ? "dark" : "light", reducedMotion: "reduce" });
  await context.route("**/*", async (route) => {
    const request = route.request(); const url = new URL(request.url());
    if (["127.0.0.1", "localhost", "[::1]", "::1"].includes(url.hostname)) return route.continue();
    const pathname = url.pathname; const method = request.method().toUpperCase();
    if (pathname.endsWith("/auth/v1/user")) return json(route, { message: "TEST ONLY signed out" }, 401);
    if (/\/rest\/v1\/(profiles|system_settings|favorites)$/.test(pathname)) return json(route, []);
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS" } });
    if (pathname.endsWith("/rpc/list_event_safe_published_campuses") && method === "POST") return json(route, [{ snapshot: { campus }, published_at: "2026-10-16T00:00:00.000Z" }]);
    if (pathname.endsWith("/rpc/list_published_campus_version_status") && method === "POST") return json(route, [{ campus_id: campus.id, latest_published_version_id: "TEST_ONLY_LOCAL_SNAPSHOT", published_at: "2026-10-16T00:00:00.000Z" }]);
    if (pathname.endsWith("/rpc/list_coming_soon_campuses") && method === "POST") return json(route, []);
    if (["POST", "PATCH", "PUT", "DELETE"].includes(method)) { results.blockedWrites.push({ method, path: pathname }); return json(route, { message: "Blocked by TEST ONLY browser adapter" }, 403); }
    return json(route, []);
  });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => results.browserErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && !message.text().includes("ERR_BLOCKED_BY_CLIENT")) results.browserErrors.push(message.text().slice(0, 300)); });
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
  const prepared = await page.evaluate(async (sourceCampus) => {
    const { assemblyPointReviewFingerprint, assemblyPointValidation } = await import("/src/lib/emergencyAssemblyPoints.ts");
    const { evaluateRoomEmergencyEvacuation } = await import("/src/lib/roomEmergencyEvacuation.ts");
    const { resolveAutomaticStudentEvacuationRoutes } = await import("/src/lib/studentEmergencyEvacuation.ts");
    const originalEvaluation = evaluateRoomEmergencyEvacuation(sourceCampus, "15676664-3144-4fd6-8954-0b99b5bf437b", "c6a8cedf-d462-4abc-aa68-f5465b2e158e", "ffe40872-45b8-4ca2-a148-61e6c7d00b40");
    const stairIds = new Set(originalEvaluation.candidates.flatMap((candidate) =>
      (candidate.emergencyReviewRequirements ?? []).filter((requirement) => requirement.kind === "stairs").map((requirement) => requirement.id)));
    const nodes = sourceCampus.navNodes ?? [];
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const campusWithReviewedStairs = {
      ...sourceCampus,
      buildings: sourceCampus.buildings.map((building) => ({
        ...building,
        floors: (building.floors ?? []).map((floor) => ({
          ...floor,
          stairs: (floor.stairs ?? []).map((stair) => stairIds.has(stair.id) ? { ...stair, emergencySafe: true } : stair),
        })),
      })),
      navNodes: nodes.map((node) => node.stairId && stairIds.has(node.stairId) ? { ...node, emergencySafe: true } : node),
      navEdges: (sourceCampus.navEdges ?? []).map((edge) => {
        const start = nodeById.get(edge.startNodeId);
        const end = nodeById.get(edge.endNodeId);
        return !edge.closed && !edge.emergencyReason && (stairIds.has(start?.stairId) || stairIds.has(end?.stairId))
          ? { ...edge, emergencySafe: true }
          : edge;
      }),
    };
    const point = campusWithReviewedStairs.assemblyPoints.find((item) => item.id === "1d3aefea-b57e-4dfb-a1c3-93ca9d3eb411");
    if (!point) throw new Error("TEST ONLY Primary Assembly Point is missing");
    const fingerprint = assemblyPointReviewFingerprint(campusWithReviewedStairs, point);
    const testCampus = {
      ...campusWithReviewedStairs,
      assemblyPoints: campusWithReviewedStairs.assemblyPoints.map((item) => item.id === point.id
        ? { ...item, safetyReview: { status: "approved", approvedAt: "2026-10-17T00:00:00.000Z", approvedBy: "90000000-0000-4000-8000-000000000199", approvedByRole: "admin", fingerprint: fingerprint ?? undefined } }
        : item),
    };
    const evaluation = evaluateRoomEmergencyEvacuation(testCampus, "15676664-3144-4fd6-8954-0b99b5bf437b", "c6a8cedf-d462-4abc-aa68-f5465b2e158e", "ffe40872-45b8-4ca2-a148-61e6c7d00b40");
    const targetBuilding = testCampus.buildings.find((building) => building.id === "15676664-3144-4fd6-8954-0b99b5bf437b");
    const targetFloor = targetBuilding?.floors.find((floor) => floor.id === "c6a8cedf-d462-4abc-aa68-f5465b2e158e");
    const targetRoom = targetFloor?.rooms.find((room) => room.id === "ffe40872-45b8-4ca2-a148-61e6c7d00b40");
    const automatic = targetBuilding && targetFloor && targetRoom
      ? resolveAutomaticStudentEvacuationRoutes(testCampus, {
          type: "room", buildingId: targetBuilding.id, floorNumber: targetFloor.number,
          roomId: targetRoom.id, roomName: targetRoom.name, buildingLabel: targetBuilding.name,
          buildingCode: targetBuilding.code, accessDoorIds: targetRoom.accessDoorIds,
        })
      : null;
    return {
      campus: testCampus,
      safetySetup: {
        note: "TEST ONLY in-memory simulation of authorized stair designation and current Assembly Point review; no source file, production data, or remote service was changed",
        stairCountMarkedForTest: stairIds.size,
        assemblyPointValidation: assemblyPointValidation(testCampus, testCampus.assemblyPoints.find((item) => item.id === point.id)),
        candidateCount: evaluation.candidates.length,
        eligibleCandidateCount: evaluation.candidates.filter((candidate) => candidate.completeAssemblyRoute).length,
        candidates: evaluation.candidates.map((candidate) => ({ exit: candidate.exitLabel, destination: candidate.assemblyPointName, complete: candidate.completeAssemblyRoute, stairReviewRequired: candidate.emergencyUseReviewRequired, assemblyPointReviewRequired: candidate.assemblyPointReviewRequired, distanceM: candidate.distanceM })),
        automaticRoutes: automatic?.routes.map((route) => ({ id: route.id, exitId: route.candidate.exitId, kind: route.candidate.kind, destinationNodeId: route.candidate.destinationNodeId, distanceM: route.candidate.distanceM })) ?? [],
      },
    };
  }, campus);
  campus = prepared.campus;
  results.safetySetup = prepared.safetySetup;
  const readProgress = async () => page.evaluate(() => {
    const surface = document.querySelector('[data-testid="student-map-surface"]');
    const instruction = [...document.querySelectorAll('[data-testid="current-route-instruction"], [data-testid="collapsed-current-instruction"], [data-testid="compact-current-route-instruction"]')].find((item) => item.getClientRects().length);
    const panelText = instruction?.parentElement?.innerText ?? instruction?.innerText ?? "";
    const floor = document.querySelector('button[aria-label^="Choose floor. Current floor:"]')?.getAttribute("aria-label") ?? null;
    const activeMarkers = [...document.querySelectorAll("[data-route-current-position]")];
    return { phase: surface?.getAttribute("data-route-phase") ?? null, floor, step: panelText.match(/Step (\d+) of (\d+)/i)?.[0] ?? panelText.match(/STEP (\d+) OF (\d+)/i)?.[0] ?? null, instruction: instruction?.textContent?.trim() ?? null, panelText: panelText.replace(/\s+/g, " ").trim(), markerCount: activeMarkers.length, markerProgress: activeMarkers.map((marker) => marker.getAttribute("data-progress")) };
  });
  try {
    await page.goto(`${base}/map`, { waitUntil: "domcontentloaded" });
    const search = page.getByRole("searchbox", { name: "Search campus map" }); await search.waitFor(); await page.waitForFunction(() => document.body.innerText.includes("CABA"));
    await search.fill("CABA LECTURE HALL"); await page.getByRole("option", { name: /CABA LECTURE HALL/i }).first().click();
    await page.getByRole("button", { name: "Start", exact: true }).click(); await page.getByRole("button", { name: "SOS routing" }).click();
    const dialog = page.getByRole("dialog", { name: "Route planner" }); await dialog.waitFor();
    const initialStatus = dialog.getByTestId("emergency-route-status"); await initialStatus.waitFor({ state: "visible" });
    results.planner = { status: await initialStatus.getAttribute("data-status"), text: (await initialStatus.innerText()).replace(/\s+/g, " ").trim(), primaryShown: (await dialog.innerText()).includes(primary.name), findEnabled: await dialog.getByRole("button", { name: "Find Route", exact: true }).isEnabled() };
    if (results.planner.status !== "not-calculated" || !results.planner.primaryShown || !results.planner.findEnabled) throw new Error(`Student planner did not expose SOS planning without individual Route A approval: ${JSON.stringify(results.planner)}`);
    await dialog.getByRole("button", { name: "Find Route", exact: true }).click();
    await page.getByText(/Route ready from .* to TEST ONLY - Admin Main Assembly Point A/i).waitFor();
    const expandPreview = page.getByRole("button", { name: /Expand route panel/i }).last();
    if (await expandPreview.isVisible().catch(() => false)) await expandPreview.click();
    await page.getByRole("button", { name: "Start", exact: true }).last().waitFor({ state: "visible", timeout: 12000 });
    const routePreviewText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    let routeFrame = page.mainFrame();
    let routeTabCount = await routeFrame.locator("[data-testid^='emergency-route-tab-']").count();
    for (const frame of page.frames()) {
      if (routeTabCount > 0) break;
      const count = await frame.locator("[data-testid^='emergency-route-tab-']").count();
      if (count > 0) { routeFrame = frame; routeTabCount = count; }
    }
    const routeOptionButtons = routeFrame.locator("[data-testid^='emergency-route-tab-']");
    const routeB = routeFrame.locator("[data-testid='emergency-route-tab-1']").first();
    results.routePreview = { destinationShown: routePreviewText.includes(primary.name), routeAOnly: routeTabCount === 1, routeChoiceStatus: routeTabCount === 0 ? "NOT VERIFIED: route-choice selector was not detected in this responsive DOM" : routeTabCount === 1 ? "PASS: one eligible route" : "PASS: multiple route choices detected", routeTabCount, routeFrameUrl: routeFrame.url(), routeLabels: await routeOptionButtons.evaluateAll((buttons) => buttons.map((button) => button.textContent?.trim() ?? "")), routeBVisible: await routeB.isVisible().catch(() => false), startCount: await page.getByRole("button", { name: "Start", exact: true }).count() };
    if (results.routePreview.routeBVisible) {
      results.routePreview.routeBExitLabel = await routeB.getAttribute("aria-label");
      await routeB.click();
      await page.waitForFunction(() => [...document.querySelectorAll("button[aria-label^='Route B:']")].some((button) => button.getAttribute("aria-pressed") === "true"), null, { timeout: 5000 });
      results.routePreview.routeBSelected = await routeB.getAttribute("aria-pressed") === "true";
      results.routePreview.sameDestinationAfterSwitch = (await page.locator("body").innerText()).includes(primary.name);
    }
    const previewButton = page.getByRole("button", { name: "Start", exact: true }).last();
    results.routePreview.startDisabled = await previewButton.isDisabled();
    const beforeStart = path.join(out, `student-automatic-sos-route-preview-${screenshotSuffix}.png`); await page.screenshot({ path: beforeStart, fullPage: false }); results.screenshots.push(path.basename(beforeStart));
    if (results.routePreview.startDisabled) throw new Error("Eligible automatic SOS Start remained disabled");
    await previewButton.click();
    await page.waitForFunction(() => document.querySelector('[data-testid="student-map-surface"]')?.getAttribute("data-route-phase") === "navigating", null, { timeout: 12000 });
    const followMode = page.getByRole("button", { name: /Follow mode|Return to Follow|^Follow$/ }).first();
    if (await followMode.isVisible().catch(() => false)) await followMode.click();
    const expandNavigation = page.getByRole("button", { name: /Expand navigation panel|Expand route panel|^Expand$|^Steps$/ }).first();
    if (await expandNavigation.isVisible().catch(() => false)) await expandNavigation.click();
    const showSteps = page.getByRole("button", { name: "Steps", exact: true }).last();
    if (await showSteps.isVisible().catch(() => false)) await showSteps.click();
    await page.getByTestId("guided-route-steps").waitFor({ state: "visible", timeout: 12000 });
    const pause = page.getByRole("button", { name: "Pause navigation" }).first();
    if (await pause.isVisible().catch(() => false)) await pause.click();
    results.active2d = await readProgress();
    const active2d = path.join(out, `student-automatic-sos-active-2d-${screenshotSuffix}.png`); await page.screenshot({ path: active2d, fullPage: false }); results.screenshots.push(path.basename(active2d));
    await page.getByRole("button", { name: "Switch to 3D view" }).click();
    await page.getByRole("button", { name: "Switch to 2D view" }).waitFor({ state: "visible", timeout: 15000 });
    await page.waitForFunction(() => [...document.querySelectorAll("canvas")].some((canvas) => { const rect = canvas.getBoundingClientRect(); return rect.width > 100 && rect.height > 100; }), null, { timeout: 12000 });
    await page.waitForTimeout(700); results.active3d = await readProgress();
    const active3d = path.join(out, `student-automatic-sos-active-3d-${screenshotSuffix}.png`); await page.screenshot({ path: active3d, fullPage: false }); results.screenshots.push(path.basename(active3d));
    await page.getByRole("button", { name: "Switch to 2D view" }).click(); await page.getByRole("button", { name: "Switch to 3D view" }).waitFor({ state: "visible", timeout: 15000 });
    results.active2dReturn = await readProgress();
    results.rendererRoundTripPreserved = [results.active3d, results.active2dReturn].every((state) => state.phase === "navigating" && state.step === results.active2d.step && state.instruction === results.active2d.instruction && state.floor === results.active2d.floor);
    for (let index = 0; index < 80; index += 1) {
      const progress = await readProgress(); results.progression.push({ iteration: index + 1, phase: progress.phase, floor: progress.floor, step: progress.step, instruction: progress.instruction });
      if (progress.phase === "arrived") break;
      const continueTransition = page.getByRole("button", { name: /continue/i }).first();
      if (await continueTransition.isVisible().catch(() => false) && await continueTransition.isEnabled().catch(() => false)) {
        await continueTransition.click({ timeout: 1200 }).catch(() => {}); await page.waitForTimeout(180); continue;
      }
      const next = page.getByRole("button", { name: "Next", exact: true }).first();
      if (await next.isVisible().catch(() => false) && await next.isEnabled().catch(() => false)) { await next.click({ timeout: 1200 }).catch(() => {}); await page.waitForTimeout(180); continue; }
      const resume = page.getByRole("button", { name: /resume/i }).first();
      if (await resume.isVisible().catch(() => false) && await resume.isEnabled().catch(() => false)) { await resume.click({ timeout: 1200 }).catch(() => {}); await page.waitForTimeout(250); continue; }
      await page.waitForTimeout(250);
    }
    results.arrival = await readProgress();
    results.arrival.title = await page.locator('[data-testid="route-arrival-title"], [data-testid="mobile-route-arrival-compact"] p').first().textContent().catch(() => null);
    results.arrival.text = (await page.locator('[data-testid="route-arrival-state"], [data-testid="mobile-route-arrival-compact"]').first().innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    const arrivalShot = path.join(out, `student-automatic-sos-arrival-2d-${screenshotSuffix}.png`); await page.screenshot({ path: arrivalShot, fullPage: false }); results.screenshots.push(path.basename(arrivalShot));
    results.arrivalReached = results.arrival.phase === "arrived" && results.arrival.text.includes(primary.name);
    if (!results.arrivalReached) throw new Error(`Student route did not arrive at the assigned Primary: ${JSON.stringify(results.arrival)}`);
    await page.getByRole("button", { name: "Switch to 3D view" }).click();
    await page.getByRole("button", { name: "Switch to 2D view" }).waitFor({ state: "visible", timeout: 15000 });
    await page.waitForFunction(() => [...document.querySelectorAll("canvas")].some((canvas) => { const rect = canvas.getBoundingClientRect(); return rect.width > 100 && rect.height > 100; }), null, { timeout: 12000 });
    const arrivalMarker = page.locator(`[data-testid="student-3d-emergency-assembly-point"][data-assembly-point-id="${primary.id}"]`).first();
    await arrivalMarker.waitFor({ state: "visible", timeout: 12000 });
    results.arrival3d = { phase: await page.getByTestId("student-map-surface").getAttribute("data-route-phase"), pointVisible: await arrivalMarker.isVisible(), pointName: await arrivalMarker.getAttribute("title"), pointId: await arrivalMarker.getAttribute("data-assembly-point-id"), currentPositionMarkerCount: await page.locator("[data-route-current-position]").count() };
    if (results.arrival3d.phase !== "arrived" || results.arrival3d.pointId !== primary.id) throw new Error(`3D arrival did not preserve the approved Assembly Point: ${JSON.stringify(results.arrival3d)}`);
    const arrival3dShot = path.join(out, `student-automatic-sos-arrival-3d-${screenshotSuffix}.png`); await page.screenshot({ path: arrival3dShot, fullPage: false }); results.screenshots.push(path.basename(arrival3dShot));
  } catch (error) {
    results.failure = { message: error.message, stack: error.stack?.slice(0, 3000) };
    const shot = path.join(out, "student-approved-route-failure.png"); await page.screenshot({ path: shot, fullPage: false }).catch(() => {}); results.screenshots.push(path.basename(shot)); process.exitCode = 1;
  } finally {
    fs.writeFileSync(path.join(out, "student-approved-ordinary-sos-results.json"), JSON.stringify(results, null, 2));
    await browser.close(); console.log(JSON.stringify(results, null, 2));
  }
}
main();

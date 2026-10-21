const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(process.env.TEMP, "plv-navisync-acceptance", "node_modules", "playwright"));
const base = "http://127.0.0.1:5174";
const campusPath = path.resolve("verification-artifacts/assembly-point-ordinary-sos/admin-conflict-rerun-draft/student-preview/test-only-campus-saved-route-approved.json");
const out = path.resolve("verification-artifacts/assembly-point-ordinary-sos/admin-conflict-rerun-draft/student-preview/mobile");
const campus = JSON.parse(fs.readFileSync(campusPath, "utf8").replace(/^\uFEFF/, ""));
const target = campus.buildings.flatMap((building) => building.floors.flatMap((floor) => floor.rooms.map((room) => ({ building, floor, room }))))
  .find(({ room }) => /CABA LECTURE HALL/i.test(room.name));
if (!target?.room.emergencyEvacuation?.routes?.[0]?.approved) throw new Error("Saved TEST ONLY campus lacks its UI-approved ordinary Route A");
const primary = campus.assemblyPoints.find((point) => point.buildingAssignments?.some((assignment) => assignment.buildingId === target.building.id && assignment.designation === "primary"));
const results = { localDraft: { publishStatus: campus.publishStatus, lifecycleStatus: campus.lifecycleStatus, visibleToStudents: campus.visibleToStudents, preview: "browser-local published-like snapshot only" }, isolation: "TEST ONLY exact saved local Admin campus served as browser-local published-like snapshot; remote writes blocked", source: { campusId: campus.id, campusName: campus.name, pointCount: campus.assemblyPoints.length, room: target.room.name, smartMultiExit: target.room.emergencyEvacuation.enabled, approvedRouteCount: target.room.emergencyEvacuation.routes.filter((route) => route.approved).length, primaryName: primary?.name, primaryNodeId: primary?.navNodeId, approvedRouteDestination: target.room.emergencyEvacuation.routes[0].destinationNodeId }, browserErrors: [], screenshots: [], progression: [] };
function json(route, value, status = 200) { return route.fulfill({ status, body: JSON.stringify(value), headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS" } }); }
async function main() {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Users/user/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe", args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-gl=angle", "--use-angle=swiftshader"] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  await context.route("**/*", async (route) => {
    const request = route.request(); const url = new URL(request.url());
    if (["127.0.0.1", "localhost"].includes(url.hostname)) return route.continue();
    const pathname = url.pathname; const method = request.method().toUpperCase();
    if (pathname.endsWith("/auth/v1/user")) return json(route, { message: "TEST ONLY signed out" }, 401);
    if (/\/rest\/v1\/(profiles|system_settings|favorites)$/.test(pathname)) return json(route, []);
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS" } });
    if (pathname.endsWith("/rpc/list_event_safe_published_campuses") && method === "POST") return json(route, [{ snapshot: { campus }, published_at: "2026-10-16T00:00:00.000Z" }]);
    if (pathname.endsWith("/rpc/list_published_campus_version_status") && method === "POST") return json(route, [{ campus_id: campus.id, latest_published_version_id: "TEST_ONLY_LOCAL_SNAPSHOT", published_at: "2026-10-16T00:00:00.000Z" }]);
    if (pathname.endsWith("/rpc/list_coming_soon_campuses") && method === "POST") return json(route, []);
    if (["POST", "PATCH", "PUT", "DELETE"].includes(method)) return json(route, { message: "Blocked by TEST ONLY browser adapter" }, 403);
    return json(route, []);
  });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => results.browserErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && !message.text().includes("ERR_BLOCKED_BY_CLIENT")) results.browserErrors.push(message.text().slice(0, 300)); });
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
    if (results.planner.status !== "approved" || !results.planner.primaryShown || !results.planner.findEnabled) throw new Error(`Student planner did not accept the UI-approved Primary route: ${JSON.stringify(results.planner)}`);
    await dialog.getByRole("button", { name: "Find Route", exact: true }).click();
    await page.getByText(/Route ready from .* to TEST ONLY - Admin Main Assembly Point A/i).waitFor();
    const routePreviewText = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    results.routePreview = { destinationShown: routePreviewText.includes(primary.name), routeAOnly: !routePreviewText.includes("Both Routes") && !routePreviewText.includes("Route B"), startCount: await page.getByRole("button", { name: "Start", exact: true }).count() };
    const previewButton = page.getByRole("button", { name: "Start", exact: true }).last();
    results.routePreview.startDisabled = await previewButton.isDisabled();
    const beforeStart = path.join(out, "student-approved-ordinary-sos-route-a-preview-390.png"); await page.screenshot({ path: beforeStart, fullPage: false }); results.screenshots.push(path.basename(beforeStart));
    if (results.routePreview.startDisabled) throw new Error("Student route is correctly approved but Start remained disabled");
    await previewButton.click();
    await page.waitForFunction(() => document.querySelector('[data-testid="student-map-surface"]')?.getAttribute("data-route-phase") === "navigating", null, { timeout: 12000 });
    await page.evaluate(() => {
      const state = { pauseClicks: 0, step: null };
      const pauseWhenAvailable = () => {
        const button = [...document.querySelectorAll('button[aria-label="Pause navigation"]')]
          .find((candidate) => candidate.getClientRects().length > 0 && !candidate.disabled);
        if (!button) return;
        state.pauseClicks += 1;
        state.step = [...document.querySelectorAll('[data-testid="current-route-instruction"], [data-testid="collapsed-current-instruction"], [data-testid="compact-current-route-instruction"]')]
          .find((item) => item.getClientRects().length > 0)?.parentElement?.innerText ?? null;
        button.click();
        observer.disconnect(); window.clearInterval(timer);
      };
      const observer = new MutationObserver(pauseWhenAvailable);
      observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
      const timer = window.setInterval(pauseWhenAvailable, 10);
      window.__ordinaryMobilePause = state;
      pauseWhenAvailable();
    });
    const followMode = page.getByRole("button", { name: /Follow mode|Return to Follow|^Follow$/ }).first();
    if (await followMode.isVisible().catch(() => false)) await followMode.click();
    const expandNavigation = page.getByRole("button", { name: /Expand navigation panel|Expand route panel|^Expand$|^Steps$/ }).first();
    if (await expandNavigation.isVisible().catch(() => false)) await expandNavigation.click();
    const showSteps = page.getByRole("button", { name: "Steps", exact: true }).last();
    if (await showSteps.isVisible().catch(() => false)) await showSteps.click();
    await page.getByTestId("guided-route-steps").waitFor({ state: "visible", timeout: 12000 });
    results.pauseAction = await page.evaluate(() => window.__ordinaryMobilePause ?? null);
    results.active2d = await readProgress();
    const active2d = path.join(out, "student-approved-ordinary-sos-active-2d-390.png"); await page.screenshot({ path: active2d, fullPage: false }); results.screenshots.push(path.basename(active2d));
    const collapseNavigation = page.getByRole("button", { name: "Collapse navigation panel" }).first();
    if (await collapseNavigation.isVisible().catch(() => false)) await collapseNavigation.click();
    await page.getByRole("button", { name: "Switch to 3D view" }).click();
    await page.getByRole("button", { name: "Switch to 2D view" }).waitFor({ state: "visible", timeout: 15000 });
    await page.waitForFunction(() => [...document.querySelectorAll("canvas")].some((canvas) => { const rect = canvas.getBoundingClientRect(); return rect.width > 100 && rect.height > 100; }), null, { timeout: 12000 });
    await page.waitForTimeout(700); results.active3d = await readProgress();
    const active3d = path.join(out, "student-approved-ordinary-sos-active-3d-390.png"); await page.screenshot({ path: active3d, fullPage: false }); results.screenshots.push(path.basename(active3d));
    await page.getByRole("button", { name: "Switch to 2D view" }).click(); await page.getByRole("button", { name: "Switch to 3D view" }).waitFor({ state: "visible", timeout: 15000 });
    results.active2dReturn = await readProgress();
    results.rendererRoundTripPreserved = [results.active3d, results.active2dReturn].every((state) => state.phase === "navigating" && state.step?.toLowerCase() === results.active2d.step?.toLowerCase() && state.instruction === results.active2d.instruction && state.floor === results.active2d.floor);
    if (!results.rendererRoundTripPreserved) throw new Error(`Mobile renderer switch changed the paused route: ${JSON.stringify({ before: results.active2d, after3d: results.active3d, after2d: results.active2dReturn })}`);
  } catch (error) {
    results.failure = { message: error.message, stack: error.stack?.slice(0, 3000) };
    const shot = path.join(out, "student-approved-route-failure.png"); await page.screenshot({ path: shot, fullPage: false }).catch(() => {}); results.screenshots.push(path.basename(shot)); process.exitCode = 1;
  } finally {
    fs.writeFileSync(path.join(out, "student-approved-ordinary-sos-results.json"), JSON.stringify(results, null, 2));
    await browser.close(); console.log(JSON.stringify(results, null, 2));
  }
}
main();


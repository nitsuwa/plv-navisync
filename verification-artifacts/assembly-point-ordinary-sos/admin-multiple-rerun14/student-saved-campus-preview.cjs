const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(process.env.TEMP, "plv-navisync-acceptance", "node_modules", "playwright"));
const base = "http://127.0.0.1:5174";
const campusPath = path.resolve("verification-artifacts/assembly-point-ordinary-sos/admin-multiple-rerun14/test-only-campus-saved.json");
const out = path.resolve("verification-artifacts/assembly-point-ordinary-sos/admin-multiple-rerun14/student-preview");
const campus = JSON.parse(fs.readFileSync(campusPath, "utf8").replace(/^\uFEFF/, ""));
const results = { isolation: "TEST ONLY saved local Admin draft served as a browser-local published-like snapshot; all writes blocked", source: { campusId: campus.id, campusName: campus.name, code: campus.code, assemblyPoints: campus.assemblyPoints?.map((point) => ({ id: point.id, name: point.name, navNodeId: point.navNodeId, assignments: point.buildingAssignments?.length, review: point.safetyReview?.status })) }, browserErrors: [], screenshots: [] };
function json(route, value, status = 200) { return route.fulfill({ status, body: JSON.stringify(value), headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS" } }); }
async function main() {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Users/user/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe", args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-gl=angle", "--use-angle=swiftshader"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
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
  try {
    await page.goto(`${base}/map`, { waitUntil: "domcontentloaded" });
    const search = page.getByRole("searchbox", { name: "Search campus map" }); await search.waitFor();
    await page.waitForFunction(() => document.body.innerText.includes("CABA"));
    await search.fill("CABA LECTURE HALL");
    await page.getByRole("option", { name: /CABA LECTURE HALL/i }).first().click();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await page.getByRole("button", { name: "SOS routing" }).click();
    const dialog = page.getByRole("dialog", { name: "Route planner" }); await dialog.waitFor();
    const status = dialog.getByTestId("emergency-route-status"); await status.waitFor({ state: "visible" });
    results.roomRoute = {
      selectedRoom: "CABA LECTURE HALL",
      status: await status.getAttribute("data-status"),
      statusText: (await status.innerText()).replace(/\s+/g, " ").trim(),
      primaryDestinationShown: (await dialog.innerText()).includes("TEST ONLY - Admin Main Assembly Point A"),
      findRouteEnabled: await dialog.getByRole("button", { name: "Find Route", exact: true }).isEnabled(),
    };
    if (results.roomRoute.findRouteEnabled) {
      await dialog.getByRole("button", { name: "Find Route", exact: true }).click();
      await page.waitForFunction(() => /Route ready from .* to TEST ONLY - Admin Main Assembly Point A/i.test(document.body.innerText), null, { timeout: 12000 });
      const statusAfter = page.getByTestId("emergency-route-status");
      const startButtons = page.getByRole("button", { name: "Start", exact: true });
      const count = await startButtons.count();
      results.roomRoute.preview = {
        status: await statusAfter.getAttribute("data-status"),
        statusText: (await statusAfter.innerText()).replace(/\s+/g, " ").trim(),
        destinationShown: (await page.locator("body").innerText()).includes("TEST ONLY - Admin Main Assembly Point A"),
        startButtonCount: count,
        startDisabled: count ? await startButtons.last().isDisabled() : null,
      };
    }
    const shot = path.join(out, "saved-draft-caba-ordinary-sos-review-gate-1440.png"); await page.screenshot({ path: shot, fullPage: false }); results.screenshots.push(path.basename(shot));
    results.roomRoute.noRouteApprovalInSavedDraft = !campus.buildings.flatMap((building) => building.floors.flatMap((floor) => floor.rooms)).some((room) => room.emergencyEvacuation?.routes?.some((route) => route.approved));
    results.roomRoute.expectation = "assigned approved Primary is named in preview; Start remains disabled until an approved room evacuation route exists";
  } catch (error) {
    results.failure = { message: error.message, stack: error.stack?.slice(0, 2500) };
    const shot = path.join(out, "student-preview-failure.png"); await page.screenshot({ path: shot, fullPage: false }).catch(() => {}); results.screenshots.push(path.basename(shot));
    process.exitCode = 1;
  } finally {
    fs.writeFileSync(path.join(out, "student-saved-campus-preview-results.json"), JSON.stringify(results, null, 2));
    await browser.close();
    console.log(JSON.stringify(results, null, 2));
  }
}
main();

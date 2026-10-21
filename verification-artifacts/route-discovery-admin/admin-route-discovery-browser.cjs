const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(process.env.TEMP, "plv-navisync-acceptance", "node_modules", "playwright"));
const base = "http://127.0.0.1:5174";
const source = path.resolve("verification-artifacts/assembly-point-ordinary-sos/admin-conflict-rerun-draft/test-only-campus-saved.json");
const out = path.resolve("verification-artifacts/route-discovery-admin/admin-preview");
const campus = JSON.parse(fs.readFileSync(source, "utf8").replace(/^\uFEFF/, ""));
const target = campus.buildings.flatMap((building) => building.floors.flatMap((floor) => floor.rooms.map((room) => ({ building, floor, room }))))
  .find(({ room }) => /CABA LECTURE HALL/i.test(room.name));
if (!target) throw new Error("Ordinary CABA LECTURE HALL test room not found");
const results = { isolation: "TEST ONLY saved local campus; real FloorEditor + properties controls; remote writes blocked", target: { building: target.building.name, buildingId: target.building.id, floor: target.floor.label, floorId: target.floor.id, room: target.room.name, roomId: target.room.id, initialSmartMultiExit: target.room.emergencyEvacuation?.enabled ?? false }, browserErrors: [] };
function json(route, value, status = 200) { return route.fulfill({ status, body: JSON.stringify(value), headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS" } }); }
async function main() {
  fs.mkdirSync(out, { recursive: true });
  const envText = fs.readFileSync(path.resolve(".env.local"), "utf8");
  const getEnv = (key) => { const line = envText.split(/\r?\n/).find((item) => item.trimStart().startsWith(`${key}=`)); if (!line) throw new Error(`Missing ${key} in .env.local`); return line.slice(line.indexOf("=") + 1).trim().replace(/^(\")(.*)\1$/, "$2").replace(/^'(.*)'$/, "$1"); };
  const storageKey = `sb-${new URL(getEnv("VITE_SUPABASE_URL")).hostname.split(".")[0]}-auth-token`;
  const user = { id: "90000000-0000-4000-8000-000000000199", email: "test-admin@example.test", aud: "authenticated", role: "authenticated", app_metadata: { provider: "email", providers: ["email"] }, user_metadata: { full_name: "TEST ONLY Admin" }, created_at: "2026-10-15T00:00:00.000Z" };
  const session = { access_token: "test-only-editor-token", refresh_token: "test-only-editor-refresh-token", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user };
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Users/user/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe", args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-gl=angle", "--use-angle=swiftshader"] });
  const context = await browser.newContext({ viewport: { width: 1560, height: 1000 }, reducedMotion: "reduce" });
  await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: storageKey, value: session });
  await context.route("**/*", async (route) => {
    const request = route.request(); const url = new URL(request.url());
    if (["127.0.0.1", "localhost"].includes(url.hostname)) return route.continue();
    const pathname = url.pathname; const method = request.method().toUpperCase();
    if (pathname.endsWith("/auth/v1/user")) return json(route, user);
    if (/\/rest\/v1\/profiles(?:\?|$)/.test(pathname)) return json(route, { ...user, role: "admin", is_active: true });
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS" } });
    if (pathname.endsWith("/rpc/list_event_safe_published_campuses") && method === "POST") return json(route, [{ snapshot: { campus }, published_at: "2026-10-16T00:00:00.000Z" }]);
    if (pathname.endsWith("/rpc/list_published_campus_version_status") && method === "POST") return json(route, [{ campus_id: campus.id, latest_published_version_id: "TEST_ONLY_LOCAL_SNAPSHOT", published_at: "2026-10-16T00:00:00.000Z" }]);
    if (pathname.endsWith("/rpc/list_coming_soon_campuses") && method === "POST") return json(route, []);
    if (pathname.includes("/rpc/")) return json(route, []);
    if (["POST", "PATCH", "PUT", "DELETE"].includes(method)) return json(route, { message: "TEST ONLY write blocked" }, 403);
    return json(route, []);
  });
  const page = await context.newPage(); page.setDefaultTimeout(20000);
  page.on("pageerror", (error) => results.browserErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && !message.text().includes("ERR_BLOCKED_BY_CLIENT")) results.browserErrors.push(message.text().slice(0, 300)); });
  try {
    await page.goto(`${base}/`, { waitUntil: "domcontentloaded" });
    await page.locator("#root").waitFor({ state: "attached" });
    await page.evaluate(async ({ campus, buildingId, floorId, roomId }) => {
      const reactModule = await import("/node_modules/.vite/deps/react.js"); const React = reactModule.default ?? reactModule;
      const reactDomModule = await import("/node_modules/.vite/deps/react-dom_client.js"); const createRoot = reactDomModule.createRoot ?? reactDomModule.default?.createRoot;
      const { FloorEditor } = await import("/src/components/map-builder/FloorEditor.tsx");
      const { AuthProvider } = await import("/src/contexts/StudentAuthContext.tsx");
      const { UnsavedChangesProvider } = await import("/src/components/map-builder/UnsavedChangesContext.tsx");
      const draftStore = await import("/src/lib/campusDraftPersistence.ts");
      const rootElement = document.getElementById("test-floor-editor-root") ?? document.createElement("div"); rootElement.id = "test-floor-editor-root";
      Object.assign(rootElement.style, { position: "fixed", inset: "0", zIndex: "50", background: "white", display: "flex", flexDirection: "column" });
      if (!rootElement.isConnected) document.body.append(rootElement);
      function Harness() {
        const [current, setCurrent] = React.useState(campus);
        const [saved, setSaved] = React.useState(campus);
        React.useEffect(() => { window.__floorAcceptance = { campus: current, saved }; }, [current, saved]);
        const update = (next) => { setCurrent(next); window.__floorAcceptance = { campus: next, saved }; draftStore.writeCampusDraft(next, campus); };
        const save = async (next) => { setSaved(next); window.__floorAcceptance = { campus: next, saved: next }; sessionStorage.setItem("plv-test-only-admin-saved-campus", JSON.stringify(next)); return next; };
        return React.createElement(FloorEditor, { campus: current, buildingId, floorId, initialSelection: { type: "room", id: roomId }, onBack: () => {}, onOpenFloor: () => {}, onSwitchFloor: () => {}, onUpdate: update, onSave: save, onPublish: () => {}, publishingEnabled: false, savedSnapshot: JSON.stringify(saved) });
      }
      const root = createRoot(rootElement); window.__floorAcceptanceRoot?.unmount?.(); window.__floorAcceptanceRoot = root;
      root.render(React.createElement(AuthProvider, null, React.createElement(UnsavedChangesProvider, null, React.createElement(Harness))));
    }, { campus, buildingId: target.building.id, floorId: target.floor.id, roomId: target.room.id });
    const section = page.getByTestId("room-emergency-evacuation-section"); await section.waitFor({ state: "visible" });
    await section.getByRole("button", { name: "Emergency Evacuation", exact: true }).click();
    const smart = section.getByRole("checkbox", { name: "Enable Smart Multi-Exit Evacuation" });
    results.smartMultiExitInitiallyOff = !(await smart.isChecked());
    await section.getByRole("button", { name: "Find Evacuation Routes" }).click();
    await section.getByTestId("emergency-route-picker-A").waitFor({ state: "visible" });
    results.validationSummary = (await section.getByTestId("room-emergency-validation-summary").innerText()).replace(/\s+/g, " ").trim();
    results.candidates = await section.getByTestId("emergency-route-picker-A").getAttribute("data-testid");
    await section.getByRole("combobox", { name: "Evacuation Route A" }).click();
    const options = section.getByRole("option");
    const count = await options.count();
    results.candidateCount = count;
    results.candidateLabels = await options.allTextContents();
    if (!count) throw new Error("Admin discovered zero connected candidates for the TEST ONLY ordinary CABA copy");
    await options.first().click();
    const preview = section.getByTestId("evacuation-route-preview-0");
    await preview.locator("summary").click();
    results.routePreview = (await preview.innerText()).replace(/\s+/g, " ").trim();
    if (!results.routePreview.includes("TEST ONLY - Admin Main Assembly Point A")) throw new Error("Route A did not resolve to the designated TEST ONLY Primary");
    const approvalButton = section.getByRole("button", { name: "Emergency-use review required" });
    results.reviewRequired = await approvalButton.isDisabled();
    if (!results.reviewRequired) throw new Error("Unreviewed emergency-use candidate unexpectedly allowed student-facing approval");
    results.smartMultiExitRemainedOff = !(await smart.isChecked());
    const beforeSave = await page.evaluate(() => window.__floorAcceptance?.campus);
    const route = beforeSave.buildings.flatMap((building) => building.floors.flatMap((floor) => floor.rooms)).find((room) => /CABA LECTURE HALL/i.test(room.name)).emergencyEvacuation;
    results.savedRouteConfigurationBeforeUiSave = route;
    const saveButton = page.getByRole("button", { name: "Save floor draft", exact: true });
    await saveButton.waitFor({ state: "visible" });
    if (!(await saveButton.isEnabled())) throw new Error("Floor Save button did not enable after route approval");
    await saveButton.click();
    await page.getByText("Floor Changes Saved", { exact: true }).waitFor({ state: "visible", timeout: 15000 });
    await page.waitForTimeout(400);
    const saved = await page.evaluate(() => window.__floorAcceptance?.saved);
    const savedRoom = saved.buildings.flatMap((building) => building.floors.flatMap((floor) => floor.rooms)).find((room) => /CABA LECTURE HALL/i.test(room.name));
    results.saveReload = { saveOverlaySucceeded: true, hasConfig: Boolean(savedRoom.emergencyEvacuation), enabled: savedRoom.emergencyEvacuation?.enabled, routeCount: savedRoom.emergencyEvacuation?.routes?.length, approved: savedRoom.emergencyEvacuation?.routes?.[0]?.approved, approvedSignature: Boolean(savedRoom.emergencyEvacuation?.routes?.[0]?.approvedRouteSignature), destinationNodeId: savedRoom.emergencyEvacuation?.routes?.[0]?.destinationNodeId };
    if (results.saveReload.approved || results.saveReload.enabled !== false || results.saveReload.routeCount !== 1) throw new Error("Saved ordinary Route A draft did not persist without approval and with Smart Multi-Exit off");
    fs.writeFileSync(path.join(out, "test-only-campus-saved-route-draft.json"), JSON.stringify(saved));
    const tourDismiss = page.getByRole("button", { name: /maybe later/i }); if (await tourDismiss.isVisible().catch(() => false)) await tourDismiss.click(); await page.waitForTimeout(3200);
    const shot = path.join(out, "admin-ordinary-route-a-draft-caba-floor6-1560.png"); await page.screenshot({ path: shot, fullPage: false }); results.screenshots = [path.basename(shot)];
  } catch (error) {
    results.failure = { message: error.message, stack: error.stack?.slice(0, 2500) };
    const shot = path.join(out, "admin-room-route-approval-failure.png"); await page.screenshot({ path: shot, fullPage: false }).catch(() => {}); results.screenshots = [path.basename(shot)]; process.exitCode = 1;
  } finally {
    fs.writeFileSync(path.join(out, "admin-room-route-approval-results.json"), JSON.stringify(results, null, 2));
    await browser.close(); console.log(JSON.stringify(results, null, 2));
  }
}
main();


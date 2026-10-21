const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(process.env.TEMP, "plv-navisync-acceptance", "node_modules", "playwright"));

const base = "http://127.0.0.1:5174";
const source = path.resolve("verification-artifacts/assembly-point-ordinary-sos/admin-conflict-rerun-draft/test-only-campus-saved.json");
const output = path.resolve("verification-artifacts/emergency-route-final");
const campus = JSON.parse(fs.readFileSync(source, "utf8").replace(/^\uFEFF/, ""));
const target = campus.buildings.flatMap((building) => building.floors.flatMap((floor) => floor.rooms.map((room) => ({ building, floor, room }))))
  .find(({ room }) => /CABA LECTURE HALL/i.test(room.name));
if (!target) throw new Error("TEST ONLY CABA Lecture Hall was not found");
const accessDoorIds = target.room.accessDoorIds ?? (target.room.accessDoorId ? [target.room.accessDoorId] : []);
const door = target.floor.doors.find((candidate) => candidate.id === (accessDoorIds[1] ?? accessDoorIds[0]));
if (!door) throw new Error("TEST ONLY CABA Lecture Hall has no authored Room Door to isolate");

// Isolate the missing-node case in memory only; do not write campus or service data.
target.room.accessDoorId = undefined;
target.room.accessDoorIds = [door.id];
const removedNodeIds = new Set((campus.navNodes ?? []).filter((node) => node.doorId === door.id).map((node) => node.id));
if (removedNodeIds.size === 0) throw new Error("Chosen TEST ONLY Door already lacks a navigation node");
campus.navNodes = (campus.navNodes ?? []).filter((node) => !removedNodeIds.has(node.id));
campus.navEdges = (campus.navEdges ?? []).filter((edge) => !removedNodeIds.has(edge.startNodeId) && !removedNodeIds.has(edge.endNodeId));

function json(route, value, status = 200) {
  return route.fulfill({ status, body: JSON.stringify(value), headers: {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
  } });
}

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const envText = fs.readFileSync(path.resolve(".env.local"), "utf8");
  const getEnv = (key) => {
    const line = envText.split(/\r?\n/).find((item) => item.trimStart().startsWith(`${key}=`));
    if (!line) throw new Error(`Missing ${key} in .env.local`);
    return line.slice(line.indexOf("=") + 1).trim().replace(/^(\")(.*)\1$/, "$2").replace(/^'(.*)'$/, "$1");
  };
  const storageKey = `sb-${new URL(getEnv("VITE_SUPABASE_URL")).hostname.split(".")[0]}-auth-token`;
  const user = { id: "90000000-0000-4000-8000-000000000199", email: "test-admin@example.test", aud: "authenticated", role: "authenticated", app_metadata: { provider: "email", providers: ["email"] }, user_metadata: { full_name: "TEST ONLY Admin" }, created_at: "2026-10-15T00:00:00.000Z" };
  const session = { access_token: "test-only-editor-token", refresh_token: "test-only-editor-refresh-token", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user };
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Users/user/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: storageKey, value: session });
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (["127.0.0.1", "localhost"].includes(url.hostname)) return route.continue();
    const method = request.method().toUpperCase();
    if (url.pathname.endsWith("/auth/v1/user")) return json(route, user);
    if (/\/rest\/v1\/profiles(?:\?|$)/.test(url.pathname)) return json(route, { ...user, role: "admin", is_active: true });
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS" } });
    if (["POST", "PATCH", "PUT", "DELETE"].includes(method)) return json(route, { message: "TEST ONLY remote write blocked" }, 403);
    return json(route, []);
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  const result = {
    isolation: "TEST ONLY saved local campus copy with one Door node removed in memory; remote writes blocked",
    room: target.room.name,
    door: door.label || door.id,
    removedNodeCount: removedNodeIds.size,
    browserErrors,
  };

  try {
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.locator("#root").waitFor({ state: "attached" });
    await page.evaluate(async ({ campus, buildingId, floorId, roomId }) => {
      const reactModule = await import("/node_modules/.vite/deps/react.js");
      const React = reactModule.default ?? reactModule;
      const reactDomModule = await import("/node_modules/.vite/deps/react-dom_client.js");
      const createRoot = reactDomModule.createRoot ?? reactDomModule.default?.createRoot;
      const { FloorEditor } = await import("/src/components/map-builder/FloorEditor.tsx");
      const { AuthProvider } = await import("/src/contexts/StudentAuthContext.tsx");
      const { UnsavedChangesProvider } = await import("/src/components/map-builder/UnsavedChangesContext.tsx");
      const rootElement = document.getElementById("test-floor-editor-root") ?? document.createElement("div");
      rootElement.id = "test-floor-editor-root";
      Object.assign(rootElement.style, { position: "fixed", inset: "0", zIndex: "50", background: "white", display: "flex", flexDirection: "column" });
      if (!rootElement.isConnected) document.body.append(rootElement);
      function Harness() {
        const [current, setCurrent] = React.useState(campus);
        window.__doorInspectorCampus = current;
        return React.createElement(FloorEditor, {
          campus: current,
          buildingId,
          floorId,
          initialSelection: { type: "room", id: roomId },
          onBack: () => {},
          onOpenFloor: () => {},
          onSwitchFloor: () => {},
          onUpdate: (next) => { setCurrent(next); window.__doorInspectorCampus = next; },
          onSave: async () => current,
          onPublish: () => {},
          publishingEnabled: false,
          savedSnapshot: JSON.stringify(current),
        });
      }
      const root = createRoot(rootElement);
      window.__doorInspectorTestRoot?.unmount?.();
      window.__doorInspectorTestRoot = root;
      root.render(React.createElement(AuthProvider, null, React.createElement(UnsavedChangesProvider, null, React.createElement(Harness))));
    }, { campus, buildingId: target.building.id, floorId: target.floor.id, roomId: target.room.id });

    const section = page.getByTestId("room-emergency-evacuation-section");
    await section.waitFor({ state: "visible" });
    await section.getByRole("button", { name: "Emergency Evacuation", exact: true }).click();
    await section.getByRole("button", { name: "Find Emergency Route" }).click();
    await section.getByRole("button", { name: "Inspect Connections" }).waitFor({ state: "visible" });
    result.routeStatus = (await section.getByTestId("room-emergency-validation-summary").innerText()).replace(/\s+/g, " ").trim();
    result.routeStatusIdentifiesMissingConnection = result.routeStatus.includes("Route connection missing");
    await section.getByRole("button", { name: "Inspect Connections" }).click();
    result.doorFocused = (await page.locator('[data-testid="floor-properties-panel"] > div:first-child p').first().innerText()).includes(door.label || "Door");
    result.addToNavigationVisible = await page.getByRole("button", { name: "Add to Navigation", exact: true }).isVisible();
    result.noNodeFabricated = await page.evaluate((doorId) => !(window.__doorInspectorCampus.navNodes ?? []).some((node) => node.doorId === doorId), door.id);
    result.noBrowserExceptions = browserErrors.length === 0;
    const maybeLater = page.getByRole("button", { name: "Maybe Later", exact: true });
    if (await maybeLater.isVisible().catch(() => false)) await maybeLater.click();
    await page.getByRole("button", { name: "Add to Navigation", exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, "missing-door-inspect-repair-action-1440.png"), fullPage: false });
    if (!result.routeStatusIdentifiesMissingConnection || !result.doorFocused || !result.addToNavigationVisible || !result.noNodeFabricated || !result.noBrowserExceptions) throw new Error(`Door inspector assertion failed: ${JSON.stringify(result)}`);
  } catch (error) {
    result.failure = error.message;
    await page.screenshot({ path: path.join(output, "missing-door-inspect-failure-1440.png"), fullPage: false }).catch(() => {});
    throw error;
  } finally {
    fs.writeFileSync(path.join(output, "missing-door-inspect-browser-results.json"), JSON.stringify(result, null, 2));
    await browser.close();
  }
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

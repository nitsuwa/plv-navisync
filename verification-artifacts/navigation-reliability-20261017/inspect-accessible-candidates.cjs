const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(process.env.TEMP, "plv-navisync-acceptance", "node_modules", "playwright"));

const out = __dirname;
const result = { errors: [] };
async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Users/user/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => result.errors.push(error.message));
  await page.route("**/*", async (route) => {
    const request = route.request(); const url = new URL(request.url());
    if (url.hostname.endsWith("supabase.co") && ["POST", "PATCH", "PUT", "DELETE"].includes(request.method())) {
      const readRpc = request.method() === "POST" && /\/rpc\/(list_event_safe_published_campuses|list_published_campus_version_status|list_coming_soon_campuses)$/.test(url.pathname);
      if (!readRpc) return route.fulfill({ status: 403, body: "Blocked by read-only navigation test" });
    }
    return route.continue();
  });
  try {
    await page.goto("http://127.0.0.1:5174/map", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.getByRole("searchbox", { name: "Search campus map" }).waitFor();
    await page.getByRole("button", { name: "Open directions" }).click();
    const dialog = page.getByRole("dialog", { name: "Route planner" });
    await dialog.getByRole("button", { name: "Accessible routing" }).click();
    for (const [endpoint, query] of [["start", "CANTEEN"], ["destination", "CABA-403"]]) {
      await dialog.getByTestId(`route-endpoint-card-${endpoint}`).getByRole("button", { name: endpoint === "start" ? "Choose start" : "Choose destination" }).click();
      const search = dialog.getByRole("searchbox", { name: endpoint === "start" ? "Search start" : "Search destination" });
      await search.fill(query); await page.waitForTimeout(700); await page.locator('[role="option"]').first().click();
    }
    await dialog.getByRole("button", { name: "Find Route", exact: true }).click();
    await page.getByTestId("route-summary").waitFor();
    await page.waitForTimeout(400);
    result.state = await page.evaluate(() => {
      const root = document.querySelector("#root");
      const containerKey = Object.keys(root ?? {}).find((key) => key.startsWith("__reactContainer$"));
      const rootFiber = containerKey ? root[containerKey] : null;
      const start = rootFiber?.stateNode?.current ?? rootFiber;
      const nodes = [];
      const seen = new Set();
      const visitFiber = (fiber) => {
        if (!fiber || seen.has(fiber)) return;
        seen.add(fiber);
        const name = fiber.type?.displayName ?? fiber.type?.name ?? "";
        if (/CampusMapPage/.test(name)) nodes.push({ fiber, name });
        visitFiber(fiber.child);
        visitFiber(fiber.sibling);
      };
      visitFiber(start);
      const summarizeRoute = (route) => ({
        routeId: route.routeId,
        dist: route.dist,
        points: route.points,
        campusPoints: route.campusPoints,
        authoredGraphNodeIds: route.authoredGraphNodeIds,
        authoredGraphEdgeIds: route.authoredGraphEdgeIds,
        indoorSegments: route.indoorSegments?.map((segment) => ({ buildingId: segment.buildingId, floorNumber: segment.floorNumber, floorId: segment.floorId, afterOutdoor: segment.afterOutdoor, waypoints: segment.waypoints })),
        contextLegs: route.contextLegs?.map((leg) => ({ kind: leg.kind, buildingId: leg.buildingId, floorId: leg.floorId, floorNumber: leg.floorNumber, waypoints: leg.waypoints, distanceM: leg.distanceM })),
        contextHandoffs: route.contextHandoffs?.map((handoff) => ({ kind: handoff.kind, label: handoff.label, buildingId: handoff.buildingId, nodeId: handoff.nodeId, detail: handoff.detail })),
      });
      const candidateArrays = [];
      const graphStates = [];
      const inspectValue = (value, hookIndex, visited = new Set(), depth = 0) => {
        if (depth > 7 || !value || typeof value !== "object" || visited.has(value)) return;
        visited.add(value);
        if (Array.isArray(value) && value.length && value.every((entry) => entry?.route?.authoredGraphEdgeIds)) {
          candidateArrays.push({ hookIndex, candidates: value.map((entry) => ({ id: entry.id, label: entry.label, route: summarizeRoute(entry.route) })) });
        }
        if (Array.isArray(value.navNodes) && Array.isArray(value.navEdges)) {
          graphStates.push({ hookIndex, navNodes: value.navNodes, navEdges: value.navEdges });
        }
        if (Array.isArray(value)) value.forEach((entry) => inspectValue(entry, hookIndex, visited, depth + 1));
        else Object.values(value).forEach((entry) => inspectValue(entry, hookIndex, visited, depth + 1));
      };
      nodes.forEach(({ fiber, name }) => {
        let hook = fiber.memoizedState; let index = 0;
        while (hook && index < 500) {
          inspectValue(hook.memoizedState, index);
          hook = hook.next; index += 1;
        }
      });
      return {
        rootKeys: Object.keys(root ?? {}),
        campusMapComponents: nodes.map((node) => node.name),
        candidateArrays,
        graphStates,
      };
    });
  } catch (error) { result.errors.push(error.stack ?? String(error)); }
  finally {
    await context.close(); await browser.close();
    fs.writeFileSync(path.join(out, "accessible-candidate-internals.json"), JSON.stringify(result, null, 2));
  }
  console.log(JSON.stringify(result, null, 2));
}
main();

const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(process.env.TEMP, "plv-navisync-acceptance", "node_modules", "playwright"));

const base = "http://127.0.0.1:5173";
const out = path.resolve("verification-artifacts/emergency-video-test-only");
const results = {
  fixture: "TEST ONLY: in-memory clone of the read-only published PLV snapshot",
  productionWrites: "blocked; test Assembly Point and review state never leave this browser context",
  adapterRequests: [],
  rooms: {},
  browserErrors: [],
  screenshots: [],
};
let testCampus = null;
let snapshotRows = [];

function json(route, value, status = 200) {
  return route.fulfill({ status, body: JSON.stringify(value), headers: {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
  } });
}

const fixtureBuilder = async () => {
  const service = await import("/src/services/campusService.ts");
  const original = (await service.listPublishedCampusSnapshots()).find((campus) =>
    campus.code === "MAIN" && /MAIN CAMPUS - PLV/i.test(campus.name));
  if (!original) throw new Error("Read-only published snapshot did not include MAIN CAMPUS - PLV");

  const campus = structuredClone(original);
  const originalCampusId = campus.id;
  const testCampusId = "90000000-0000-4000-8000-000000000100";
  const replaceCampusIds = (value) => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (key === "campusId" && child === originalCampusId) value[key] = testCampusId;
      else replaceCampusIds(child);
    }
  };
  replaceCampusIds(campus);
  campus.id = testCampusId;
  campus.name = "TEST ONLY - Isolated PLV Campus Snapshot";
  campus.code = "PLV-TEST";
  campus.assemblyPoints = [];

  const panel = await import("/src/components/map-builder/TestNavigationPanel.tsx");
  const evacuation = await import("/src/lib/roomEmergencyEvacuation.ts");
  const assembly = await import("/src/lib/emergencyAssemblyPoints.ts");
  const placement = await import("/src/lib/editorPlacement.ts");
  const student = await import("/src/lib/studentEmergencyEvacuation.ts");
  const target = /ASSEMBLY HALL|CABA LECTURE HALL|CEIT LECTURE HALL|PLV AUDITORIUM/i;
  const targetRooms = campus.buildings.flatMap((building) => building.floors.flatMap((floor) =>
    floor.rooms.filter((room) => target.test(room.name)).map((room) => ({ building, floor, room }))));
  if (targetRooms.length !== 4) throw new Error(`Expected four target rooms; found ${targetRooms.length}`);

  const routeEdges = panel.buildTestRouteEdges(campus).filter((edge) => edge.type !== "room_door_transition");
  const routePaths = [];
  for (const { building, floor, room } of targetRooms) {
    for (const doorId of room.accessDoorIds ?? (room.accessDoorId ? [room.accessDoorId] : [])) {
      const doorNode = campus.navNodes.find((node) => node.doorId === doorId
        && node.buildingId === building.id && node.floorId === floor.id);
      const route = doorNode && panel.chooseEmergencyDestinationCandidates(campus, routeEdges, doorNode.id)[0];
      if (route?.path) routePaths.push(new Set(route.path.nodeIds));
    }
  }
  if (!routePaths.length) throw new Error("The authored graph has no complete emergency egress candidates for the target rooms");

  const sharedOutdoorNodes = [...routePaths[0]]
    .filter((id) => routePaths.every((candidate) => candidate.has(id)))
    .map((id) => campus.navNodes.find((node) => node.id === id))
    .filter((node) => node && node.type === "outdoor" && !node.floorId && !node.entranceId && !node.doorId
      && !node.roomId && !node.gateId && !node.exteriorEmergencyStairId && !node.derivedOwnerType
      && !campus.buildings.some((building) => placement.pointInBuilding(building, node))
      && campus.navEdges.some((edge) => (edge.startNodeId === node.id || edge.endNodeId === node.id)
        && !edge.closed && edge.emergencySafe !== false && edge.type !== "room_door_transition"));
  if (!sharedOutdoorNodes.length) throw new Error("No shared authored outdoor waypoint can host the test destination");

  const anchor = sharedOutdoorNodes[0];
  const pointId = "90000000-0000-4000-8000-000000000101";
  const pointName = "TEST ONLY - Main Assembly Point A";
  // Mirror the editor's valid existing-waypoint placement path: mark the real
  // authored waypoint as the Assembly Point anchor and retain undo provenance.
  campus.navNodes = campus.navNodes.map((node) => node.id === anchor.id
    ? { ...node, name: pointName, type: "assembly", assemblyPointId: pointId }
    : node);
  const point = {
    id: pointId,
    name: pointName,
    x: anchor.x,
    y: anchor.y,
    campusId: testCampusId,
    navNodeId: anchor.id,
    connectionOrigin: { kind: "reused-node", previousType: anchor.type, previousName: anchor.name },
    buildingAssignments: [...new Set(targetRooms.map(({ building }) => building.id))]
      .map((buildingId) => ({ buildingId, designation: "primary" })),
  };
  campus.assemblyPoints = [point];
  let linked = assembly.syncEmergencyAssemblyPointNavigation(campus, (prefix) => `${prefix}-test-only`);
  const linkedPoint = linked.assemblyPoints[0];
  let validation = assembly.assemblyPointValidation(linked, linkedPoint);
  if (validation.connection !== "connected" || validation.readiness !== "ready_for_review") {
    throw new Error(`Test Assembly Point connection validation failed: ${JSON.stringify(validation)}`);
  }
  linkedPoint.safetyReview = {
    status: "approved",
    approvedAt: "2026-10-15T00:00:00.000Z",
    approvedBy: "TEST ONLY reviewer",
    approvedByRole: "admin",
    fingerprint: assembly.assemblyPointReviewFingerprint(linked, linkedPoint),
  };
  validation = assembly.assemblyPointValidation(linked, linkedPoint);
  if (validation.readiness !== "approved") throw new Error("Test-only review fingerprint did not validate");

  const roomSummary = [];
  for (const { building, floor, room } of targetRooms) {
    const evaluation = evacuation.evaluateRoomEmergencyEvacuation(linked, building.id, floor.id, room.id);
    const complete = evaluation.candidates.filter((candidate) => candidate.completeAssemblyRoute
      && candidate.assemblyPointId === pointId && candidate.destinationNodeId === linkedPoint.navNodeId);
    room.emergencyEvacuation = {
      enabled: true,
      routes: complete.map((candidate, index) => ({
        id: candidate.id,
        doorId: candidate.doorId,
        exitId: candidate.exitId,
        destinationNodeId: candidate.destinationNodeId,
        label: index === 0 ? "Route A" : "Route B",
        approved: true,
        approvedAt: "2026-10-15T00:00:00.000Z",
        approvedBy: "TEST ONLY reviewer",
        approvedByRole: "admin",
        approvedRouteSignature: candidate.routeSignature,
      })),
    };
    const resolved = student.resolveApprovedStudentEvacuationRoutes(linked, {
      type: "room",
      buildingId: building.id,
      floorNumber: floor.number,
      roomId: room.id,
      roomName: room.name,
      buildingLabel: building.name,
      buildingCode: building.code,
    });
    const segments = student.studentEmergencyCampusRouteSegments(resolved.routes);
    const completePaths = resolved.routes.every((option) => option.candidate.completeAssemblyRoute
      && option.candidate.destinationNodeId === linkedPoint.navNodeId);
    const endsAtPoint = segments.length > 0 && segments.every((segment) =>
      segment.points.at(-1)?.x === linkedPoint.x && segment.points.at(-1)?.y === linkedPoint.y);
    if (!completePaths || !endsAtPoint || resolved.routes.length !== complete.length) {
      throw new Error(`${room.name}: route did not resolve to complete approved Assembly Point paths`);
    }
    roomSummary.push({
      name: room.name,
      building: building.name,
      displayFloor: floor.label,
      internalFloor: floor.number,
      assignedDoorCount: room.accessDoorIds?.length ?? (room.accessDoorId ? 1 : 0),
      doorReadiness: evaluation.doorReadiness.map(({ label, state, routeCount }) => ({ label, state, routeCount })),
      routeCount: resolved.routes.length,
      distinctPhysicalExits: [...new Set(resolved.routes.map((option) => option.candidate.exitId))].length,
      finalNodeIds: resolved.routes.map((option) => option.candidate.destinationNodeId),
      allPathsEndAtAssemblyPoint: endsAtPoint,
      outdoorSegments: segments.map((segment) => ({ label: segment.label, pointCount: segment.points.length, endsAtPoint: segment.points.at(-1)?.x === linkedPoint.x && segment.points.at(-1)?.y === linkedPoint.y })),
    });
  }

  return { campus: linked, summary: {
    testOnly: true,
    source: "read-only published MAIN CAMPUS - PLV snapshot; edits and synthetic review stay local to this test",
    point: {
      id: linkedPoint.id,
      name: linkedPoint.name,
      navNodeId: linkedPoint.navNodeId,
      x: linkedPoint.x,
      y: linkedPoint.y,
      connection: validation.connection,
      review: validation.readiness,
      incidentEdges: linked.navEdges.filter((edge) => edge.startNodeId === linkedPoint.navNodeId || edge.endNodeId === linkedPoint.navNodeId).length,
      assignedBuildings: linkedPoint.buildingAssignments.length,
      placementModel: "placed directly on an existing authored outdoor waypoint",
    },
    rooms: roomSummary,
  } };
};

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const envText = fs.readFileSync(path.resolve(".env.local"), "utf8");
  const envValue = (name) => {
    const line = envText.split(/\r?\n/).find((entry) => entry.trimStart().startsWith(`${name}=`));
    if (!line) throw new Error(`Missing ${name} in local environment file`);
    return line.slice(line.indexOf("=") + 1).trim().replace(/^(["'])(.*)\1$/, "$2");
  };
  const supabaseUrl = envValue("VITE_SUPABASE_URL");
  const publishableKey = envValue("VITE_SUPABASE_PUBLISHABLE_KEY");
  const snapshotResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/list_event_safe_published_campuses`, {
    method: "POST",
    headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}`, "content-type": "application/json" },
    body: "{}",
  });
  if (!snapshotResponse.ok) throw new Error(`Read-only published snapshot request failed with HTTP ${snapshotResponse.status}`);
  const publishedRows = await snapshotResponse.json();
  snapshotRows = publishedRows.filter((row) => row?.snapshot?.campus?.code === "MAIN"
    && /MAIN CAMPUS - PLV/i.test(row.snapshot.campus.name));
  if (snapshotRows.length !== 1) throw new Error(`Expected one published MAIN CAMPUS - PLV snapshot; found ${snapshotRows.length}`);
  results.sourceSnapshot = { rows: publishedRows.length, selected: snapshotRows.map((row) => ({ code: row.snapshot.campus.code, name: row.snapshot.campus.name })) };
  results.productionSnapshotAccess = "one public read-only published-snapshot RPC; no production mutations";
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Users/user/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe",
    args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-gl=angle", "--use-angle=swiftshader", "--autoplay-policy=no-user-gesture-required"],
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (["127.0.0.1", "localhost"].includes(url.hostname)) return route.continue();
    const pathname = url.pathname;
    const method = request.method().toUpperCase();
    if (pathname.endsWith("/auth/v1/user")) return json(route, { message: "Test browser is signed out" }, 401);
    if (/\/rest\/v1\/(profiles|system_settings|favorites)$/.test(pathname)) return json(route, []);
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS" } });
    if (pathname.endsWith("/rpc/list_event_safe_published_campuses") && method === "POST") {
      results.adapterRequests.push({ method, pathname, source: testCampus ? "test-fixture" : "read-only-snapshot-clone", rowCount: testCampus ? 1 : snapshotRows.length });
      if (testCampus) return json(route, [{ snapshot: { campus: testCampus }, published_at: "2026-10-15T00:00:00.000Z" }]);
      return json(route, snapshotRows);
    }
    if (pathname.endsWith("/rpc/list_published_campus_version_status") && method === "POST") {
      const rows = testCampus
        ? [{ snapshot: { campus: testCampus }, published_at: "2026-10-15T00:00:00.000Z" }]
        : snapshotRows;
      return json(route, rows.map((row) => ({
        campus_id: row.snapshot.campus.id,
        latest_published_version_id: "TEST_ONLY_VERSION",
        published_at: row.published_at ?? "2026-10-15T00:00:00.000Z",
      })));
    }
    if (pathname.endsWith("/rpc/list_coming_soon_campuses") && method === "POST") return json(route, []);
    if (["POST", "PATCH", "PUT", "DELETE"].includes(method)) return json(route, { message: "Blocked by TEST ONLY browser adapter" }, 403);
    return json(route, []);
  });

  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (error) => results.browserErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && !message.text().includes("ERR_BLOCKED_BY_CLIENT")) results.browserErrors.push(message.text().slice(0, 300)); });
  page.on("requestfailed", (request) => results.browserErrors.push(`requestfailed ${new URL(request.url()).pathname}: ${request.failure()?.errorText ?? "unknown"}`));

  try {
    await page.goto(`${base}/map`, { waitUntil: "domcontentloaded" });
    await page.getByRole("searchbox", { name: "Search campus map" }).waitFor();

    // Capture the current published CABA state before introducing any fixture data.
    const publishedSearch = page.getByRole("searchbox", { name: "Search campus map" });
    await publishedSearch.click();
    await publishedSearch.fill("CABA LECTURE HALL");
    await page.getByRole("option", { name: /CABA LECTURE HALL/ }).click();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await page.getByRole("button", { name: "SOS routing" }).click();
    const noAssemblyDialog = page.getByRole("dialog", { name: "Route planner" });
    const noAssemblyStatus = noAssemblyDialog.getByTestId("emergency-route-status");
    await noAssemblyStatus.waitFor();
    const noAssemblyFind = noAssemblyDialog.getByRole("button", { name: "Find Route", exact: true });
    const noAssemblySummary = {
      viewport: { width: 390, height: 844 },
      status: await noAssemblyStatus.getAttribute("data-status"),
      copy: await noAssemblyStatus.innerText(),
      statusCount: await noAssemblyDialog.getByTestId("emergency-route-status").count(),
      technicalDetailsCount: await noAssemblyStatus.locator("details").count(),
      findRouteLabel: await noAssemblyFind.innerText(),
      findRouteDisabled: await noAssemblyFind.isDisabled(),
      noMisleadingStandardAdvice: !(await noAssemblyDialog.innerText()).match(/switch to Standard mode|choose a different destination above/i),
    };
    results.pathfindingUi = { publishedCabaUnavailable: noAssemblySummary, responsive: [] };
    for (const viewport of [
      { width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 },
      { width: 768, height: 1024 }, { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(150);
      const screenshot = path.join(out, `pathfinding-ui-caba-unavailable-${viewport.width}x${viewport.height}.png`);
      await page.screenshot({ path: screenshot, fullPage: false });
      results.screenshots.push(path.basename(screenshot));
      results.pathfindingUi.responsive.push({
        ...viewport,
        scrollWidth: await page.evaluate(() => document.documentElement.scrollWidth),
        statusVisible: await noAssemblyStatus.isVisible(),
        findRouteVisible: await noAssemblyFind.isVisible(),
      });
    }

    const prepared = await page.evaluate(fixtureBuilder);
    testCampus = prepared.campus;
    results.fixtureSummary = prepared.summary;
    if (process.env.AP_PLAYBACK_ONLY === "1" || process.env.AP_OUTDOOR_ONLY === "1") {
      const previous = JSON.parse(fs.readFileSync(path.join(out, "pathfinding-ui-audit-results.json"), "utf8").replace(/^\uFEFF/, ""));
      results.rooms = previous.rooms ?? {};
      results.screenshots = previous.screenshots ?? [];
      results.playback = previous.playback;
    }
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("searchbox", { name: "Search campus map" }).waitFor();
    await page.waitForFunction(() => document.body.innerText.includes("SC"));

    const roomCases = process.env.AP_PLAYBACK_ONLY === "1" || process.env.AP_OUTDOOR_ONLY === "1" ? [] : [
      { name: "CABA LECTURE HALL", key: "caba", alternatives: 2 },
      { name: "CEIT LECTURE HALL", key: "ceit", alternatives: 2 },
      { name: "PLV AUDITORIUM", key: "auditorium", alternatives: 2 },
      { name: "ASSEMBLY HALL", key: "assembly-hall", alternatives: 1 },
    ];
    for (const testCase of roomCases) {
      // The published-state responsive captures end at desktop width. Reset
      // before every fixture room so these files are genuine mobile renders.
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${base}/map`, { waitUntil: "domcontentloaded" });
      const search = page.getByRole("searchbox", { name: "Search campus map" });
      await search.waitFor();
      await search.click();
      await search.fill(testCase.name);
      await page.getByRole("option", { name: new RegExp(testCase.name) }).click();
      await page.getByRole("button", { name: "Start", exact: true }).click();

      const standardHasPoint = await page.getByText(/TEST ONLY - Main Assembly Point A/i).count() > 0;
      await page.getByRole("button", { name: "Accessible routing" }).click();
      const accessibleHasPoint = await page.getByText(/TEST ONLY - Main Assembly Point A/i).count() > 0;
      await page.getByRole("button", { name: "SOS routing" }).click();
      const dialog = page.getByRole("dialog", { name: "Route planner" });
      await dialog.waitFor();
      const destinationSummary = await dialog.innerText();
      const findRoute = dialog.getByRole("button", { name: "Find Route", exact: true });
      await findRoute.waitFor({ state: "visible" });
      const findRouteEnabled = await findRoute.isEnabled();
      await findRoute.click();
      await page.getByText(/Route ready from .* to TEST ONLY - Main Assembly Point A/i).waitFor();
      if (testCase.alternatives === 2) {
        await page.locator('[data-testid="emergency-route-overview"], [data-testid="emergency-route-overview-compact"]').waitFor();
        await page.getByRole("button").filter({ hasText: /^Route A/ }).first().waitFor();
        await page.getByRole("button").filter({ hasText: /^Route B/ }).first().waitFor();
      }
      const expandOverview = page.getByRole("button", { name: /Expand route panel/ });
      if (await expandOverview.isVisible().catch(() => false)) await expandOverview.click();

      const bodyText = await page.locator("body").innerText();
      const roomResult = {
        selected: true,
        displayFloor: await page.locator('button[aria-label^="Choose floor. Current floor:"]').first().getAttribute("aria-label").catch(() => null),
        standardMarkerVisible: standardHasPoint,
        accessibleMarkerVisible: accessibleHasPoint,
        sosFindRouteEnabled: findRouteEnabled,
        destinationSummary: destinationSummary.split("\n").filter((line) => /Destination|TEST ONLY|Main Assembly/.test(line)).slice(-4),
        bothRoutesVisible: testCase.alternatives === 2 && bodyText.includes("Route A") && bodyText.includes("Route B"),
        singleRouteMode: testCase.alternatives === 1 && !bodyText.includes("Route B"),
        assemblyPointInSosView: bodyText.includes("TEST ONLY - Main Assembly Point A"),
        routeOptionCount: await page.getByRole("button").filter({ hasText: /^Route (A|B)/ }).count(),
        mobileWidth: await page.evaluate(() => ({ viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth })),
      };
      const overviewFile = path.join(out, `pathfinding-ui-${testCase.key}-${testCase.alternatives === 1 ? "single-route" : "both-routes"}-mobile-390.png`);
      await page.screenshot({ path: overviewFile, fullPage: false });
      results.screenshots.push(path.basename(overviewFile));

      if (roomResult.routeOptionCount > 0) {
        const firstOption = page.getByRole("button").filter({ hasText: /^Route A/ }).first();
        await firstOption.click();
        const activePlanner = page.getByRole("dialog", { name: "Route planner" });
        const previewFollow = activePlanner.getByRole("button", { name: /Switch to Follow mode|Return to Follow mode|Return to Follow/ }).first();
        if (await previewFollow.isVisible().catch(() => false)) await previewFollow.click();
        await activePlanner.getByRole("button", { name: "Start", exact: true }).click();
        const expandActivePanel = page.getByRole("button", { name: /Expand route panel/ });
        if (await expandActivePanel.isVisible().catch(() => false)) await expandActivePanel.click();
        await page.waitForTimeout(350);
        await page.getByTestId("guided-navigation-summary").waitFor({ state: "visible" });
        const activeFile = path.join(out, `pathfinding-ui-${testCase.key}-active-2d-mobile-390.png`);
        await page.screenshot({ path: activeFile, fullPage: false });
        results.screenshots.push(path.basename(activeFile));
        roomResult.activeRouteSelected = true;
        const collapseActivePanel = page.getByRole("button", { name: /Collapse navigation panel/ });
        if (await collapseActivePanel.isVisible().catch(() => false)) await collapseActivePanel.click();
        const view3d = page.getByRole("button", { name: "Switch to 3D view" });
        if (await view3d.isVisible().catch(() => false)) {
          await view3d.click();
          await page.getByRole("button", { name: "Switch to 2D view" }).waitFor();
          await page.waitForTimeout(2500);
          const expand3dPanel = page.getByRole("button", { name: /Expand route panel/ });
          if (await expand3dPanel.isVisible().catch(() => false)) await expand3dPanel.click();
          roomResult.renderer3dCanvasVisible = await page.locator("canvas").evaluateAll((canvases) => canvases.some((canvas) => {
            const rect = canvas.getBoundingClientRect();
            return rect.width > 100 && rect.height > 100;
          }));
          const threeDFile = path.join(out, `pathfinding-ui-${testCase.key}-active-3d-mobile-390.png`);
          await page.screenshot({ path: threeDFile, fullPage: false });
          results.screenshots.push(path.basename(threeDFile));
          roomResult.renderer3d = true;
        }
      }
      roomResult.expectedAlternatives = testCase.alternatives;
      results.rooms[testCase.key] = roomResult;
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${base}/map`, { waitUntil: "domcontentloaded" });
    const search = page.getByRole("searchbox", { name: "Search campus map" });
    await search.waitFor();
    await search.click();
    await search.fill("CABA LECTURE HALL");
    await page.getByRole("option", { name: /CABA LECTURE HALL/ }).click();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await page.getByRole("button", { name: "SOS routing" }).click();
    await page.getByRole("button", { name: "Find Route", exact: true }).click();
    await page.getByRole("button", { name: "Both Routes", exact: true }).waitFor();
    await page.getByRole("button").filter({ hasText: /^Route A/ }).first().waitFor();
    await page.getByRole("button").filter({ hasText: /^Route B/ }).first().waitFor();
    const desktopFile = path.join(out, "pathfinding-ui-caba-both-routes-desktop-1440.png");
    await page.screenshot({ path: desktopFile, fullPage: false });
    results.screenshots.push(path.basename(desktopFile));
    results.desktop = {
      viewport: await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth })),
      bothRoutesVisible: true,
      testDestinationVisible: (await page.locator("body").innerText()).includes("TEST ONLY - Main Assembly Point A"),
    };
    results.responsiveMeasurements = [];
    for (const viewport of [
      { width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 },
      { width: 768, height: 1024 }, { width: 1280, height: 720 }, { width: 1920, height: 1080 },
    ]) {
      await page.setViewportSize(viewport);
      results.responsiveMeasurements.push({ ...viewport, scrollWidth: await page.evaluate(() => document.documentElement.scrollWidth) });
    }

    if (process.env.AP_OUTDOOR_ONLY === "1") {
      const backToCampus = page.getByRole("button", { name: /Back to campus map/ }).first();
      await backToCampus.click();
      const assemblyMarker = page.getByTestId("student-emergency-assembly-point");
      await assemblyMarker.waitFor({ state: "visible" });
      results.outdoor2d = {
        markerVisibleInSos: true,
        markerId: await assemblyMarker.getAttribute("data-assembly-point-id"),
        markerText: await assemblyMarker.innerText(),
        routeEndsAtAssemblyNode: results.fixtureSummary.rooms.find((room) => room.name === "CABA LECTURE HALL")?.allPathsEndAtAssemblyPoint ?? false,
      };
      const outdoor2dFile = path.join(out, "pathfinding-ui-caba-outdoor-2d-desktop-1440.png");
      await page.screenshot({ path: outdoor2dFile, fullPage: false });
      results.screenshots.push(path.basename(outdoor2dFile));
      const switch3d = page.getByRole("button", { name: "Switch to 3D view" });
      await switch3d.click();
      await page.getByRole("button", { name: "Switch to 2D view" }).waitFor();
      await page.waitForTimeout(1800);
      results.outdoor3d = {
        canvasVisible: await page.locator("canvas").evaluateAll((canvases) => canvases.some((canvas) => {
          const rect = canvas.getBoundingClientRect();
          return rect.width > 100 && rect.height > 100;
        })),
        assemblyPointLabelVisible: (await page.locator("body").innerText()).includes("TEST ONLY - Main Assembly Point A"),
      };
      const outdoor3dFile = path.join(out, "pathfinding-ui-caba-outdoor-3d-desktop-1440.png");
      await page.screenshot({ path: outdoor3dFile, fullPage: false });
      results.screenshots.push(path.basename(outdoor3dFile));
    }

    if (process.env.PATHFINDING_UI_ONLY !== "1") {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/map`, { waitUntil: "domcontentloaded" });
    const playbackSearch = page.getByRole("searchbox", { name: "Search campus map" });
    await playbackSearch.waitFor();
    await playbackSearch.click();
    await playbackSearch.fill("CABA LECTURE HALL");
    await page.getByRole("option", { name: /CABA LECTURE HALL/ }).click();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await page.getByRole("button", { name: "SOS routing" }).click();
    await page.getByRole("button", { name: "Find Route", exact: true }).click();
    await page.getByRole("button", { name: "Both Routes", exact: true }).waitFor();
    await page.getByRole("button").filter({ hasText: /^Route B/ }).first().click();
    const routeBSelected = (await page.locator("body").innerText()).includes("Route B");
    await page.getByRole("button").filter({ hasText: /^Route A/ }).first().click();
    const startPlayback = page.getByRole("dialog", { name: "Route planner" }).getByRole("button", { name: "Start", exact: true });
    await startPlayback.waitFor({ state: "visible" });
    await startPlayback.click();
    const returnFollowOnStart = page.getByRole("button", { name: /Return to Follow/ });
    if (await returnFollowOnStart.isVisible().catch(() => false)) await returnFollowOnStart.click();
    const followTextButton = page.locator("button").filter({ hasText: /^FOLLOW$/ }).first();
    if (await followTextButton.isVisible().catch(() => false)) await followTextButton.click();
    const currentInstruction = page.locator('[data-testid="current-route-instruction"], [data-testid="collapsed-current-instruction"], [data-testid="compact-current-route-instruction"]');
    await currentInstruction.waitFor();
    const expandRoute = page.getByRole("button", { name: /Expand navigation panel|Expand route panel|Expand$/ });
    if (await expandRoute.isVisible().catch(() => false)) await expandRoute.click();
    const pausePlayback = page.getByRole("button", { name: "Pause navigation" });
    if (await pausePlayback.isVisible().catch(() => false) && await pausePlayback.isEnabled().catch(() => false)) {
      await pausePlayback.click();
      await page.getByRole("button", { name: "Resume navigation" }).waitFor({ timeout: 10000 }).catch(() => undefined);
    }
    const stepBefore = (await page.locator("body").innerText()).match(/Step (\d+) of (\d+)/i)?.[0] ?? null;
    const enterExplore = page.getByRole("button", { name: /Switch to Explore mode|Explore route/ });
    await enterExplore.click();
    await page.getByTestId("emergency-explore-playback-controls").waitFor();
    const exploreBefore = await page.getByTestId("explore-inspected-step").textContent().catch(() => null);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    const exploreAfter = await page.getByTestId("explore-inspected-step").textContent().catch(() => null);
    await page.getByRole("button", { name: /Return to Follow/ }).click();
    const playbackVisitedFloors = new Set();
    let arrivalReached = false;
    let manualAdvanceCount = 0;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const floorButton = page.locator('button[aria-label^="Choose floor. Current floor:"]').first();
      const floorLabel = await floorButton.getAttribute("aria-label").catch(() => null);
      if (floorLabel) playbackVisitedFloors.add(floorLabel.replace("Choose floor. Current floor: ", ""));
      if (await page.getByTestId("route-arrival-state").isVisible().catch(() => false)) {
        arrivalReached = true;
        break;
      }
      const continueTransition = page.getByRole("button", { name: /Continue through the active route transition|^Continue$/ }).first();
      if (await continueTransition.isVisible().catch(() => false) && await continueTransition.isEnabled().catch(() => false)) {
        await continueTransition.click();
        await page.waitForTimeout(250);
        continue;
      }
      const nextStep = page.getByRole("button", { name: "Next step" });
      if (await nextStep.isVisible().catch(() => false) && await nextStep.isEnabled().catch(() => false)) {
        await nextStep.click();
        manualAdvanceCount += 1;
        await page.waitForTimeout(250);
        continue;
      }
      const collapsedNext = page.getByRole("button", { name: "Next", exact: true });
      if (await collapsedNext.isVisible().catch(() => false) && await collapsedNext.isEnabled().catch(() => false)) {
        await collapsedNext.click();
        manualAdvanceCount += 1;
        await page.waitForTimeout(250);
        continue;
      }
      await page.waitForTimeout(250);
    }
    const arrivalNameVisible = (await page.locator("body").innerText()).includes("TEST ONLY - Main Assembly Point A");
    const stairFile = path.join(out, "pathfinding-ui-caba-active-stair-transition-mobile-390.png");
    await page.screenshot({ path: stairFile, fullPage: false });
    results.screenshots.push(path.basename(stairFile));
    results.playback = {
      scenario: "CABA Route A active playback on the isolated assigned/approved test Assembly Point snapshot",
      routeBWasSelectable: routeBSelected,
      startedRoutePreview: true,
      initialStep: stepBefore,
      exploreAdvancedStep: exploreBefore !== exploreAfter,
      returnedToFollow: true,
      manualAdvanceCount,
      visitedFloorLabels: [...playbackVisitedFloors],
      arrivalReached,
      arrivalNameVisible,
      routeArrivalCardVisible: await page.getByTestId("route-arrival-state").isVisible().catch(() => false),
      finalView: (await page.locator("body").innerText()).slice(-1400),
    };
    }
  } catch (error) {
    results.failure = { message: error.message, stack: error.stack };
    results.pageDebug = await page.evaluate(() => ({ url: location.href, title: document.title, text: document.body?.innerText?.slice(0, 1200) ?? "", htmlLength: document.documentElement?.innerHTML?.length ?? 0 })).catch(() => null);
    results.visibleButtons = await page.locator("button").evaluateAll((buttons) => buttons.filter((button) => button.getClientRects().length).map((button) => ({ text: button.innerText, ariaLabel: button.getAttribute("aria-label"), disabled: button.disabled })).slice(0, 50)).catch(() => []);
    try {
    const failure = path.join(out, "pathfinding-ui-audit-failure.png");
      await page.screenshot({ path: failure, fullPage: false });
      results.screenshots.push(path.basename(failure));
    } catch {}
  } finally {
    results.browserErrors = [...new Set(results.browserErrors)];
    results.screenshots = [...new Set(results.screenshots)];
    fs.writeFileSync(path.join(out, "pathfinding-ui-audit-results.json"), JSON.stringify(results, null, 2));
    if (testCampus) testCampus = null;
    await context.close();
    await browser.close();
    process.stdout.write(JSON.stringify(results, null, 2) + "\n");
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});

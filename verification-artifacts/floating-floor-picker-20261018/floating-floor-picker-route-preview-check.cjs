const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(process.env.TEMP, "plv-navisync-acceptance", "node_modules", "playwright"));

const base = process.env.ROUTE_PREVIEW_BASE || "http://[::1]:5173";
const output = path.resolve(process.env.ROUTE_PREVIEW_OUTPUT || "verification-artifacts/floating-floor-picker-20261018");
const fixtureFile = path.resolve("verification-artifacts/route-discovery-admin/admin-dual-exit/test-only-campus-saved-dual-route-draft.json");
const screenshots = [];
const results = {
  fixture: "TEST ONLY saved dual-exit draft with an in-memory published MAIN CAMPUS read-only browser adapter",
  writes: "all non-read-only Supabase mutations blocked",
  browserErrors: [],
  browserResponses: [],
  apiRequests: [],
  viewports: [],
  floorPickerChecks: [],
  screenshots,
};
async function checkFloorPickerOwnership(page, stage) {
  const state = await page.evaluate(() => {
    const pickers = [...document.querySelectorAll('[data-testid="student-floor-picker"], [data-testid="student-floor-picker-inline"]')];
    const picker = document.querySelector('[data-testid="student-floor-picker"]');
    const button = picker?.querySelector("button");
    const profile = document.querySelector('[data-testid="student-map-profile-trigger"] > button');
    const account = document.querySelector('[data-testid="student-map-floating-account-controls"]');
    const rect = (element) => element?.getBoundingClientRect().toJSON() ?? null;
    return {
      count: pickers.length,
      inlineCount: document.querySelectorAll('[data-testid="student-floor-picker-inline"]').length,
      visible: Boolean(picker?.getClientRects().length),
      ownedByAccountControls: Boolean(account && picker && account.contains(picker)),
      nestedInRoutePanel: Boolean(picker?.closest('[data-testid="route-planner-dialog"]')),
      belowAccount: picker?.getAttribute("data-below-account") === "true",
      width: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      pickerRect: rect(picker),
      buttonRect: rect(button),
      profileRect: rect(profile),
      label: button?.textContent?.replace(/\s+/g, " ").trim() ?? null,
    };
  });
  results.floorPickerChecks.push({ stage, ...state });
  if (state.count !== 1 || state.inlineCount !== 0 || !state.visible || !state.ownedByAccountControls || state.nestedInRoutePanel) {
    throw new Error(`Floor picker has duplicate or incorrect ownership at ${stage}: ${JSON.stringify(state)}`);
  }
  if (state.documentWidth !== state.width) {
    throw new Error(`Floor picker caused horizontal overflow at ${stage}: ${JSON.stringify(state)}`);
  }
  if (state.width < 768 && state.profileRect && state.pickerRect) {
    const overlapsProfile = state.pickerRect.left < state.profileRect.right
      && state.pickerRect.right > state.profileRect.left
      && state.pickerRect.top < state.profileRect.bottom
      && state.pickerRect.bottom > state.profileRect.top;
    if (overlapsProfile || (state.belowAccount && state.pickerRect.top < state.profileRect.bottom)) {
      throw new Error(`Floor picker overlaps the profile control at ${stage}: ${JSON.stringify(state)}`);
    }
    if (!state.belowAccount && state.pickerRect.right > state.profileRect.left) {
      throw new Error(`Inline floor picker is not positioned to the left of the profile control at ${stage}: ${JSON.stringify(state)}`);
    }
  }
  return state;
}
const sanitizeAssets = (value) => {
  if (typeof value === "string") return /token=|\/storage\/v1\/object\/sign\//i.test(value) ? null : value;
  if (Array.isArray(value)) return value.map(sanitizeAssets);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, sanitizeAssets(child)]));
  return value;
};
let testCampus = sanitizeAssets(JSON.parse(fs.readFileSync(fixtureFile, "utf8").replace(/^\uFEFF/, "")));
let testCampusVersion = "TEST_ONLY_LAYOUT_FIXTURE_INITIAL";

function json(route, value, status = 200) {
  return route.fulfill({ status, body: JSON.stringify(value), headers: {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
  } });
}

async function waitForCameraSettled(page) {
  await page.waitForFunction(() => new Promise((resolve) => {
    let previousHeight = -1;
    let stableFrames = 0;
    const check = () => {
      const height = document.querySelector('[data-testid="route-planner-dialog"]')?.getBoundingClientRect().height ?? 0;
      stableFrames = height > 0 && Math.abs(height - previousHeight) < 0.5 ? stableFrames + 1 : 0;
      previousHeight = height;
      if (stableFrames >= 4) resolve(true);
      else requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  }), null, { timeout: 8000 });
  await page.waitForFunction(() => new Promise((resolve) => {
    let previous = null;
    let stableFrames = 0;
    let frames = 0;
    const check = () => {
      const current = document.querySelector('[data-testid="student-map-camera-transform"]')?.getAttribute("transform") ?? null;
      if (current === previous) stableFrames += 1;
      else stableFrames = 0;
      previous = current;
      frames += 1;
      if ((frames >= 10 && stableFrames >= 5) || frames >= 120) resolve(true);
      else requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  }), null, { timeout: 8000 });
}

async function makeTestCampus() {
  const service = await import("/src/services/campusService.ts");
  const published = (await service.listPublishedCampusSnapshots()).find((campus) =>
    campus.code === "MAIN" && /MAIN CAMPUS - PLV/i.test(campus.name));
  if (!published) throw new Error("Read-only published MAIN CAMPUS snapshot was not available");
  const campus = structuredClone(published);
  const originalId = campus.id;
  const testId = "90000000-0000-4000-8000-000000000188";
  const replaceCampusIds = (value) => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (key === "campusId" && child === originalId) value[key] = testId;
      else replaceCampusIds(child);
    }
  };
  replaceCampusIds(campus);
  campus.id = testId;
  campus.code = "PLV-TEST";
  campus.name = "TEST ONLY - Route Preview Layout";
  // Prevent any imported signed Storage URLs from being used in this isolated browser fixture.
  campus.logo = null;
  campus.logoPath = null;
  campus.overviewImagePath = null;

  const panel = await import("/src/components/map-builder/TestNavigationPanel.tsx");
  const evacuation = await import("/src/lib/roomEmergencyEvacuation.ts");
  const assembly = await import("/src/lib/emergencyAssemblyPoints.ts");
  const placement = await import("/src/lib/editorPlacement.ts");
  const student = await import("/src/lib/studentEmergencyEvacuation.ts");
  const target = campus.buildings.flatMap((building) => (building.floors ?? []).flatMap((floor) =>
    (floor.rooms ?? []).filter((room) => /CABA LECTURE HALL/i.test(room.name)).map((room) => ({ building, floor, room }))));
  if (target.length !== 1) throw new Error(`Expected one CABA lecture hall in the source snapshot; found ${target.length}`);

  const routeEdges = panel.buildTestRouteEdges(campus).filter((edge) => edge.type !== "room_door_transition");
  const paths = [];
  const { building, floor, room } = target[0];
  for (const doorId of room.accessDoorIds ?? (room.accessDoorId ? [room.accessDoorId] : [])) {
    const doorNode = campus.navNodes.find((node) => node.doorId === doorId
      && node.buildingId === building.id && node.floorId === floor.id);
    const candidate = doorNode && panel.chooseEmergencyDestinationCandidates(campus, routeEdges, doorNode.id)[0];
    if (candidate?.path) paths.push(new Set(candidate.path.nodeIds));
  }
  if (!paths.length) throw new Error("CABA lecture hall had no complete authored egress path for the test fixture");
  const sharedOutdoor = [...paths[0]].filter((id) => paths.every((candidate) => candidate.has(id)))
    .map((id) => campus.navNodes.find((node) => node.id === id))
    .filter((node) => node && node.type === "outdoor" && !node.floorId && !node.entranceId && !node.doorId
      && !node.roomId && !node.gateId && !node.exteriorEmergencyStairId && !node.derivedOwnerType
      && !campus.buildings.some((item) => placement.pointInBuilding(item, node))
      && campus.navEdges.some((edge) => (edge.startNodeId === node.id || edge.endNodeId === node.id)
        && !edge.closed && edge.emergencySafe !== false && edge.type !== "room_door_transition"));
  if (!sharedOutdoor.length) throw new Error("No shared authored outdoor waypoint can host the isolated test point");

  const anchor = sharedOutdoor[0];
  const pointId = "90000000-0000-4000-8000-000000000189";
  const pointName = "TEST ONLY - Main Assembly Point A";
  campus.navNodes = campus.navNodes.map((node) => node.id === anchor.id
    ? { ...node, name: pointName, type: "assembly", assemblyPointId: pointId }
    : node);
  campus.assemblyPoints = [{
    id: pointId,
    name: pointName,
    x: anchor.x,
    y: anchor.y,
    campusId: testId,
    navNodeId: anchor.id,
    connectionOrigin: { kind: "reused-node", previousType: anchor.type, previousName: anchor.name },
    buildingAssignments: [{ buildingId: building.id, designation: "primary" }],
  }];
  campus = assembly.syncEmergencyAssemblyPointNavigation(campus, (prefix) => `${prefix}-layout-test`);
  const point = campus.assemblyPoints[0];
  point.safetyReview = {
    status: "approved",
    approvedAt: "2026-10-17T00:00:00.000Z",
    approvedBy: "TEST ONLY reviewer",
    approvedByRole: "admin",
    fingerprint: assembly.assemblyPointReviewFingerprint(campus, point),
  };
  const readiness = assembly.assemblyPointValidation(campus, point);
  if (readiness.connection !== "connected" || readiness.readiness !== "approved") {
    throw new Error(`Test destination failed graph and review validation: ${JSON.stringify(readiness)}`);
  }

  const evaluation = evacuation.evaluateRoomEmergencyEvacuation(campus, building.id, floor.id, room.id);
  const complete = evaluation.candidates.filter((candidate) => candidate.completeAssemblyRoute
    && candidate.assemblyPointId === pointId && candidate.destinationNodeId === point.navNodeId);
  if (!complete.length) throw new Error("CABA lecture hall did not resolve a complete route to the test Assembly Point");
  room.emergencyEvacuation = {
    enabled: true,
    routes: complete.map((candidate, index) => ({
      id: candidate.id,
      doorId: candidate.doorId,
      exitId: candidate.exitId,
      destinationNodeId: candidate.destinationNodeId,
      label: index === 0 ? "Route A" : "Route B",
      approved: true,
      approvedAt: "2026-10-17T00:00:00.000Z",
      approvedBy: "TEST ONLY reviewer",
      approvedByRole: "admin",
      approvedRouteSignature: candidate.routeSignature,
    })),
  };
  const resolved = student.resolveApprovedStudentEvacuationRoutes(campus, {
    type: "room", buildingId: building.id, floorNumber: floor.number,
    roomId: room.id, roomName: room.name, buildingLabel: building.name, buildingCode: building.code,
  });
  if (!resolved.routes.length || resolved.routes.some((item) => !item.candidate.completeAssemblyRoute
    || item.candidate.destinationNodeId !== point.navNodeId)) {
    throw new Error("The app resolver did not retain complete, connected test routes to the same destination");
  }
  return {
    campus,
    summary: {
      testOnly: true,
      pointName,
      pointNodeId: point.navNodeId,
      sourceRoom: room.name,
      assignedToBuilding: true,
      candidateCount: complete.length,
      distinctExits: new Set(resolved.routes.map((item) => item.candidate.exitId)).size,
      allRoutesComplete: resolved.routes.every((item) => item.candidate.completeAssemblyRoute),
    },
  };
}

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Users/user/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe",
    args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-gl=angle", "--use-angle=swiftshader"],
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (["127.0.0.1", "localhost", "[::1]", "::1"].includes(url.hostname)) return route.continue();
    const pathname = url.pathname;
    const method = request.method().toUpperCase();
    if (pathname.endsWith("/auth/v1/user")) return json(route, { message: "TEST ONLY signed out" }, 401);
    if (/\/rest\/v1\/(profiles|system_settings|favorites)$/.test(pathname)) return json(route, []);
    if (pathname.endsWith("/rest/v1/rpc/get_published_room_videos_for_room") && method === "POST") return json(route, []);
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS" } });
    if (pathname.endsWith("/rpc/list_event_safe_published_campuses") && method === "POST" && testCampus) {
      return json(route, [{ snapshot: { campus: testCampus }, published_at: "2026-10-17T00:00:00.000Z" }]);
    }
    if (pathname.endsWith("/rpc/list_published_campus_version_status") && method === "POST" && testCampus) {
      return json(route, [{ campus_id: testCampus.id, latest_published_version_id: testCampusVersion, published_at: "2026-10-17T00:00:00.000Z" }]);
    }
    if (pathname.endsWith("/rpc/list_coming_soon_campuses") && method === "POST") return json(route, []);
    if (pathname.includes("/rpc/list_") && method === "POST") return route.continue();
    if (["POST", "PATCH", "PUT", "DELETE"].includes(method)) return json(route, { message: "Blocked by TEST ONLY browser adapter" }, 403);
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.includes("/rest/v1/") || url.pathname.includes("/rpc/")) {
      results.apiRequests.push({ method: request.method().toUpperCase(), pathname: url.pathname });
    }
  });
  page.on("pageerror", (error) => results.browserErrors.push(error.message));
  page.on("response", (response) => {
    if (response.status() < 400) return;
    const request = response.request();
    const url = new URL(response.url());
    const method = request.method().toUpperCase();
    const expectedBlockedWrite = response.status() === 403 && ["POST", "PATCH", "PUT", "DELETE"].includes(method);
    const expectedSignedOut = response.status() === 401 && url.pathname.endsWith("/auth/v1/user");
    results.browserResponses.push({
      status: response.status(),
      method,
      pathname: url.pathname,
      expected: expectedBlockedWrite ? "TEST ONLY write blocked" : expectedSignedOut ? "TEST ONLY signed out" : false,
    });
    if (!expectedBlockedWrite && !expectedSignedOut) {
      results.browserErrors.push(`Unexpected HTTP ${response.status()} ${method} ${url.pathname}`);
    }
  });
  page.on("console", (message) => {
    if (message.type() !== "error" || message.text().includes("ERR_BLOCKED_BY_CLIENT")
      || message.text().startsWith("Failed to load resource: the server responded with a status of")) return;
    results.browserErrors.push(message.text().slice(0, 250));
  });

  try {
    await page.goto(`${base}/map`, { waitUntil: "domcontentloaded" });
    await page.getByRole("searchbox", { name: "Search campus map" }).waitFor();
    const prepared = await page.evaluate(async (sourceCampus) => {
      const campus = structuredClone(sourceCampus);
      const evacuation = await import("/src/lib/roomEmergencyEvacuation.ts");
      const student = await import("/src/lib/studentEmergencyEvacuation.ts");
      const assembly = await import("/src/lib/emergencyAssemblyPoints.ts");
      const target = campus.buildings.flatMap((building) => building.floors.flatMap((floor) =>
        floor.rooms.filter((room) => /CABA LECTURE HALL/i.test(room.name)).map((room) => ({ building, floor, room }))))[0];
      if (!target) throw new Error("TEST ONLY CABA lecture hall is missing");
      const before = evacuation.evaluateRoomEmergencyEvacuation(campus, target.building.id, target.floor.id, target.room.id);
      const stairIds = new Set(before.candidates.flatMap((candidate) =>
        (candidate.emergencyReviewRequirements ?? []).filter((requirement) => requirement.kind === "stairs").map((requirement) => requirement.id)));
      if (!stairIds.size) throw new Error("TEST ONLY route fixture did not identify an emergency-stair review requirement to configure");
      const nodeById = new Map((campus.navNodes ?? []).map((node) => [node.id, node]));
      campus.buildings = campus.buildings.map((building) => ({
        ...building,
        floors: building.floors.map((floor) => ({
          ...floor,
          stairs: floor.stairs.map((stair) => stairIds.has(stair.id) ? { ...stair, emergencySafe: true } : stair),
        })),
      }));
      campus.navNodes = (campus.navNodes ?? []).map((node) => node.stairId && stairIds.has(node.stairId)
        ? { ...node, emergencySafe: true }
        : node);
      campus.navEdges = (campus.navEdges ?? []).map((edge) => {
        const start = nodeById.get(edge.startNodeId);
        const end = nodeById.get(edge.endNodeId);
        return !edge.closed && !edge.emergencyReason && (stairIds.has(start?.stairId) || stairIds.has(end?.stairId))
          ? { ...edge, emergencySafe: true }
          : edge;
      });
      for (const point of campus.assemblyPoints ?? []) {
        point.safetyReview = {
          ...(point.safetyReview ?? {}),
          status: "approved",
          approvedAt: "2026-10-17T00:00:00.000Z",
          approvedBy: "TEST ONLY reviewer",
          approvedByRole: "admin",
          fingerprint: assembly.assemblyPointReviewFingerprint(campus, point) ?? undefined,
        };
      }
      const after = evacuation.evaluateRoomEmergencyEvacuation(campus, target.building.id, target.floor.id, target.room.id);
      const origin = { type: "room", buildingId: target.building.id, floorNumber: target.floor.number,
        roomId: target.room.id, roomName: target.room.name, buildingLabel: target.building.name, buildingCode: target.building.code };
      const routes = student.resolveAutomaticStudentEvacuationRoutes(campus, origin).routes;
      const assemblyCheck = (campus.assemblyPoints ?? []).map((point) => ({ name: point.name, readiness: assembly.assemblyPointValidation(campus, point).readiness }));
      if (routes.length < 2 || new Set(routes.map((route) => route.candidate.exitId)).size < 2
        || routes.some((route) => !route.candidate.completeAssemblyRoute || route.candidate.emergencyUseReviewRequired
          || route.candidate.assemblyPointReviewRequired)) {
        const pathEligibility = await import("/src/lib/emergencyPathEligibility.ts");
        const traversalEdges = (await import("/src/components/map-builder/TestNavigationPanel.tsx")).buildTestRouteEdges(campus);
        throw new Error(JSON.stringify({
          stairIds: [...stairIds], assemblyCheck, eligibleRouteCount: routes.length,
          automaticMessage: student.resolveAutomaticStudentEvacuationRoutes(campus, origin).message,
          candidates: after.candidates.map((candidate) => {
            const point = campus.assemblyPoints.find((item) => item.id === candidate.assemblyPointId);
            const nodeIds = candidate.route.authoredGraphNodeIds ?? [];
            const pathAssessment = pathEligibility.assessEmergencyAuthoredPath(campus, traversalEdges, {
                nodeIds,
                edgeIds: candidate.route.authoredGraphEdgeIds ?? [],
                destinationNodeId: candidate.destinationNodeId,
                originBuildingId: campus.navNodes.find((node) => node.id === nodeIds[0])?.buildingId,
                destinationPoint: candidate.route.campusPoints?.at(-1) ?? candidate.route.points.at(-1),
              });
            return {
              exit: candidate.exitLabel,
              completeDestination: candidate.completeDestinationRoute,
              complete: candidate.completeAssemblyRoute,
              graphCompleteAssembly: candidate.graphCompleteAssemblyRoute,
              emergencyReview: candidate.emergencyUseReviewRequired,
              assemblyReview: candidate.assemblyPointReviewRequired,
              requirements: candidate.emergencyReviewRequirements,
              eligible: student.isAutomaticStudentEvacuationCandidateEligible(campus, candidate),
              pointId: candidate.assemblyPointId,
              pointAnchor: point?.navNodeId,
              destinationOwner: campus.navNodes.find((node) => node.id === candidate.destinationNodeId)?.assemblyPointId,
              routeOwner: candidate.route.emergencyAssemblyPointId,
              designation: candidate.assemblyPointDesignation,
              pointApprovedForBuilding: point ? assembly.isAssemblyPointApprovedForBuilding(campus, point, target.building.id) : false,
              assigned: point?.buildingAssignments?.filter((item) => item.buildingId === target.building.id),
              authoredGraph: candidate.route.isAuthoredGraph,
              nodeCount: nodeIds.length,
              edgeCount: candidate.route.authoredGraphEdgeIds?.length ?? 0,
              pathStart: nodeIds[0],
              pathEnd: nodeIds.at(-1),
              destinationNodeId: candidate.destinationNodeId,
              missingPathEdgeIds: (candidate.route.authoredGraphEdgeIds ?? []).filter((id) => !traversalEdges.some((edge) => edge.id === id)),
              pathAssessment,
            };
          }),
        }));
      }
      return { campus, summary: {
        testOnly: true,
        source: "isolated saved MAIN CAMPUS clone; only fixture review metadata was adjusted, production data is untouched",
        pointNames: (campus.assemblyPoints ?? []).map((point) => point.name),
        approvedPointCount: assemblyCheck.filter((point) => point.readiness === "approved").length,
        stairIdsConfiguredForFixture: [...stairIds],
        eligibleRouteCount: routes.length,
        distinctPhysicalExits: new Set(routes.map((route) => route.candidate.exitId)).size,
        allComplete: routes.every((route) => route.candidate.completeAssemblyRoute),
      } };
    }, testCampus);
    testCampus = prepared.campus;
    testCampusVersion = "TEST_ONLY_LAYOUT_FIXTURE_SAFETY_CONFIGURED";
    results.fixtureSafetySetup = prepared.summary;
    const room = testCampus.buildings.flatMap((building) => (building.floors ?? []).flatMap((floor) =>
      (floor.rooms ?? []).filter((candidate) => /CABA LECTURE HALL/i.test(candidate.name)).map((candidate) => ({ building, floor, room: candidate }))));
    if (room.length !== 1) throw new Error(`Expected one TEST ONLY CABA lecture hall; found ${room.length}`);
    const destination = testCampus.assemblyPoints?.find((point) => point.id === room[0].room.emergencyEvacuation?.routes?.[0]?.destinationAssemblyPointId)
      ?? testCampus.assemblyPoints?.find((point) => point.buildingAssignments?.some((assignment) => assignment.buildingId === room[0].building.id));
    const savedRoutes = room[0].room.emergencyEvacuation?.routes ?? [];
    results.fixtureSummary = {
      source: "TEST ONLY saved local dual-exit campus fixture; no authored or production data changed",
      room: room[0].room.name,
      campus: testCampus.name,
      assignedAssemblyPoint: Boolean(destination),
      destinationName: destination?.name ?? null,
      routeCount: savedRoutes.length,
      distinctPhysicalExits: new Set(savedRoutes.map((route) => route.exitId)).size,
    };
    if (!testCampus.name.startsWith("TEST ONLY") || !destination || savedRoutes.length < 2 || results.fixtureSummary.distinctPhysicalExits < 2) {
      throw new Error("TEST ONLY dual-exit route preconditions failed");
    }
    results.fixtureDiagnostics = await page.evaluate(async (campus) => {
      const emergency = await import("/src/lib/roomEmergencyEvacuation.ts");
      const student = await import("/src/lib/studentEmergencyEvacuation.ts");
      const assembly = await import("/src/lib/emergencyAssemblyPoints.ts");
      const { building, floor, room: authoredRoom } = campus.buildings.flatMap((item) => item.floors.flatMap((itemFloor) =>
        itemFloor.rooms.filter((candidate) => /CABA LECTURE HALL/i.test(candidate.name)).map((candidate) => ({ building: item, floor: itemFloor, room: candidate }))))[0];
      const room = { type: "room", buildingId: building.id, floorNumber: floor.number, roomId: authoredRoom.id, roomName: authoredRoom.name, buildingLabel: building.name, buildingCode: building.code };
      const evaluation = emergency.evaluateRoomEmergencyEvacuation(campus, building.id, floor.id, authoredRoom.id);
      const automatic = student.resolveAutomaticStudentEvacuationRoutes(campus, room);
      return {
        destinationChecks: campus.assemblyPoints.map((point) => ({ name: point.name, validation: assembly.assemblyPointValidation(campus, point) })),
        candidateCount: evaluation.candidates.length,
        candidates: evaluation.candidates.map((candidate) => ({
          exit: candidate.exitLabel, completeDestination: candidate.completeDestinationRoute,
          completeAssembly: candidate.completeAssemblyRoute, graphCompleteAssembly: candidate.graphCompleteAssemblyRoute,
          emergencyReview: candidate.emergencyUseReviewRequired, pointReview: candidate.assemblyPointReviewRequired,
          pointId: candidate.assemblyPointId, designation: candidate.assemblyPointDesignation,
          authored: candidate.route.isAuthoredGraph, pathNodes: candidate.route.authoredGraphNodeIds?.length,
          pathEdges: candidate.route.authoredGraphEdgeIds?.length,
        })),
        automaticRouteCount: automatic.routes.length,
        automaticMessage: automatic.message,
        candidateEligibility: evaluation.candidates.map((candidate) => {
          const destination = campus.navNodes.find((node) => node.id === candidate.destinationNodeId);
          const point = campus.assemblyPoints.find((item) => item.id === candidate.assemblyPointId);
          return {
            exit: candidate.exitLabel,
            eligible: student.isAutomaticStudentEvacuationCandidateEligible(campus, candidate),
            pointId: candidate.assemblyPointId,
            pointAnchorId: point?.navNodeId,
            destinationOwnerId: destination?.assemblyPointId,
            routeOwnerId: candidate.route.emergencyAssemblyPointId,
            designation: candidate.assemblyPointDesignation,
            buildingId: building.id,
            assigned: point?.buildingAssignments?.filter((item) => item.buildingId === building.id),
            authoredGraph: candidate.route.isAuthoredGraph,
          };
        }),
      };
    }, testCampus);

    await page.evaluate(async () => {
      localStorage.clear();
      sessionStorage.clear();
      const databases = await indexedDB.databases?.() ?? [];
      await Promise.all(databases.map((database) => new Promise((resolve) => {
        if (!database.name) return resolve();
        const request = indexedDB.deleteDatabase(database.name);
        request.onsuccess = request.onerror = request.onblocked = () => resolve();
      })));
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("searchbox", { name: "Search campus map" }).waitFor();
    const search = page.getByRole("searchbox", { name: "Search campus map" });
    await search.fill("CABA LECTURE HALL");
    await page.getByRole("option", { name: /CABA LECTURE HALL/i }).click();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await page.getByRole("button", { name: "SOS routing" }).click();
    const dialog = page.getByRole("dialog", { name: "Route planner" });
    const findRoute = dialog.getByRole("button", { name: "Find Route", exact: true });
    await findRoute.waitFor({ state: "visible" });
    if (!(await findRoute.isEnabled())) {
      results.plannerPreconditions = {
        status: await dialog.getByTestId("emergency-route-status").getAttribute("data-status").catch(() => null),
        statusText: (await dialog.getByTestId("emergency-route-status").innerText().catch(() => "")).replace(/\s+/g, " ").trim(),
        text: (await dialog.innerText()).replace(/\s+/g, " ").trim(),
        runtimeOrigin: await page.evaluate(() => {
          const element = document.querySelector('[data-testid="route-planner-dialog"]');
          const fiberKey = element && Object.keys(element).find((key) => key.startsWith("__reactFiber$"));
          let fiber = fiberKey ? element[fiberKey] : null;
          const candidates = [];
          while (fiber) {
            const props = fiber.memoizedProps;
            if (props && Object.prototype.hasOwnProperty.call(props, "fromRoom")) {
              candidates.push({ fromRoom: props.fromRoom, from: props.from && { id: props.from.id, name: props.from.name }, mode: props.mode });
            }
            fiber = fiber.return;
          }
          let pageFiber = fiberKey ? element[fiberKey] : null;
          while (pageFiber && pageFiber.type?.name !== "CampusMapPage") pageFiber = pageFiber.return;
          const campusStates = [];
          for (let hook = pageFiber?.memoizedState; hook; hook = hook.next) {
            const value = hook.memoizedState;
            const maybeCampuses = Array.isArray(value) ? value : value?.campuses;
            if (Array.isArray(maybeCampuses) && maybeCampuses.some((item) => item?.navNodes)) {
              campusStates.push(maybeCampuses.filter((item) => item?.navNodes).map((item) => ({ id: item.id, name: item.name, points: item.assemblyPoints?.length, nodes: item.navNodes?.length })));
            }
          }
          const dialog = document.querySelector('[data-testid="route-planner-dialog"]');
          return {
            candidates,
            routeMode: dialog?.getAttribute("data-route-mode"),
            modeButtons: [...(dialog?.querySelectorAll('button[aria-pressed]') ?? [])]
              .filter((button) => /routing/i.test(button.getAttribute("aria-label") ?? ""))
              .map((button) => ({ label: button.getAttribute("aria-label"), pressed: button.getAttribute("aria-pressed") })),
            campusStates,
          };
        }),
      };
      throw new Error(`TEST ONLY planner correctly blocked an incomplete or unapproved route: ${JSON.stringify(results.plannerPreconditions)}`);
    }
    await findRoute.click();
    await dialog.getByTestId("mobile-route-preview-collapsed-summary").waitFor({ state: "visible" });
    await page.getByTestId("mobile-route-preview-collapsed-summary").getByText(results.fixtureSummary.destinationName, { exact: false }).waitFor({ state: "visible" });
    await checkFloorPickerOwnership(page, "route-preview-collapsed");
    const collapsed = page.getByTestId("mobile-route-preview-collapsed-summary");
    await collapsed.waitFor({ state: "visible" });
    await page.waitForFunction(() => ![...document.querySelectorAll('[data-testid="emergency-route-overview"], [data-testid="emergency-route-selector"]')]
      .some((node) => node.getClientRects().length > 0));
    const collapseState = await page.evaluate(() => {
      const dialog = document.querySelector('[data-testid="route-planner-dialog"]');
      const summary = document.querySelector('[data-testid="mobile-route-preview-collapsed-summary"]');
      const rect = dialog?.getBoundingClientRect();
      const summaryRect = summary?.getBoundingClientRect();
      return {
        sheetState: dialog?.getAttribute("data-mobile-sheet-state"),
        height: rect?.height,
        withinViewport: Boolean(rect && rect.top >= 0 && rect.bottom <= innerHeight),
        summaryInsideSheet: Boolean(rect && summaryRect && summaryRect.top >= rect.top && summaryRect.bottom <= rect.bottom),
        routeControlsVisible: [...document.querySelectorAll('[data-testid="emergency-route-selector"]')].some((node) => node.getClientRects().length > 0),
        startVisible: [...document.querySelectorAll('button')].some((button) => button.getClientRects().length > 0 && button.textContent?.trim() === "Start"),
        headerUtilityVisible: Boolean(document.querySelector('[data-testid="route-planner-responsive-header-controls"]')?.getClientRects().length),
        bodyText: summary?.textContent?.replace(/\s+/g, " ").trim(),
      };
    });
    const collapsedShot = path.join(output, "test-only-sos-preview-collapsed-390x844.png");
    await page.screenshot({ path: collapsedShot, fullPage: false });
    screenshots.push(path.basename(collapsedShot));
    results.collapsed390 = collapseState;
    if (collapseState.routeControlsVisible || collapseState.startVisible || collapseState.headerUtilityVisible || !collapseState.withinViewport) {
      throw new Error(`Collapsed preview exposed clipped controls or exceeded its viewport: ${JSON.stringify(collapseState)}`);
    }

    await page.getByRole("button", { name: "Expand route panel" }).click();
    await dialog.getByTestId("emergency-route-selector").waitFor({ state: "visible" });
    await checkFloorPickerOwnership(page, "route-preview-expanded-390");
    const optionsShot = path.join(output, "test-only-sos-preview-expanded-route-choices-390x844.png");
    await page.screenshot({ path: optionsShot, fullPage: false });
    screenshots.push(path.basename(optionsShot));
    results.expandedChoices390 = {
      routeAVisible: await dialog.getByTestId("emergency-route-tab-0").isVisible(),
      routeBVisible: await dialog.getByTestId("emergency-route-tab-1").isVisible(),
      destination: (await dialog.getByTestId("emergency-route-summary-destination").textContent())?.trim(),
    };
    if (!results.expandedChoices390.routeAVisible || !results.expandedChoices390.routeBVisible) {
      throw new Error(`Expanded eligible SOS alternatives were not visible: ${JSON.stringify(results.expandedChoices390)}`);
    }
    await dialog.getByTestId("emergency-route-tab-1").click();
    await page.waitForFunction(() => document.querySelector('[data-testid="emergency-route-tab-1"]')?.getAttribute("aria-pressed") === "true");
    results.routeBSwitchPreservesDestination = (await page.locator("body").innerText()).includes(results.fixtureSummary.destinationName);
    await dialog.getByTestId("emergency-route-tab-0").click();
    await page.waitForFunction(() => document.querySelector('[data-testid="emergency-route-tab-0"]')?.getAttribute("aria-pressed") === "true");
    await dialog.getByTestId("route-summary").waitFor({ state: "visible" });
    await dialog.getByTestId("route-planner-footer").waitFor({ state: "visible" });
    await waitForCameraSettled(page);
    let start = page.getByRole("button", { name: "Start", exact: true }).last();
    await start.waitFor({ state: "visible" });
    await waitForCameraSettled(page);
    const expanded390 = await page.evaluate(() => {
      const dialog = document.querySelector('[data-testid="route-planner-dialog"]');
      const scroll = document.querySelector('[data-testid="route-planner-scroll-region"]');
      const footer = document.querySelector('[data-testid="route-planner-footer"]');
      const start = [...(footer?.querySelectorAll("button") ?? [])].find((button) => button.textContent?.trim() === "Start");
      const dialogRect = dialog?.getBoundingClientRect();
      const footerRect = footer?.getBoundingClientRect();
      const startRect = start?.getBoundingClientRect();
      const nav = document.querySelector('[aria-label="Mobile navigation"]')?.getBoundingClientRect();
      return {
        sheetState: dialog?.getAttribute("data-mobile-sheet-state"),
        height: dialogRect?.height,
        dialogTop: dialogRect?.top,
        dialogBottom: dialogRect?.bottom,
        footerTop: footerRect?.top,
        footerBottom: footerRect?.bottom,
        startTop: startRect?.top,
        startBottom: startRect?.bottom,
        startFullyInFooter: Boolean(footerRect && startRect && startRect.top >= footerRect.top && startRect.bottom <= footerRect.bottom),
        startFullyInViewport: Boolean(startRect && startRect.top >= 0 && startRect.bottom <= innerHeight),
        sheetAboveBottomNavigation: Boolean(nav && dialogRect && dialogRect.bottom <= nav.top),
        routeSelectorCount: [...document.querySelectorAll('[data-testid="emergency-route-selector"]')].filter((node) => node.getClientRects().length > 0).length,
        emergencyPosition: (() => {
          const marker = document.querySelector('[data-testid="student-emergency-floor-progress-marker"]');
          const rect = marker?.getBoundingClientRect();
          return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
        })(),
        routeLine: (() => {
          const line = document.querySelector('[data-testid="floor-indoor-route-line"]');
          const rect = line?.getBoundingClientRect();
          return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
        })(),
        startDisabled: start?.disabled ?? null,
        scrollFlex: scroll ? getComputedStyle(scroll).flex : null,
        scrollOverflowY: scroll ? getComputedStyle(scroll).overflowY : null,
        scrollRegionHeight: scroll?.getBoundingClientRect().height,
      };
    });
    results.expanded390 = expanded390;
    const previewSteps = dialog.getByTestId("route-preview-steps");
    await previewSteps.locator("summary").click();
    const scrollRegion = dialog.getByTestId("route-planner-scroll-region");
    await page.waitForFunction(() => {
      const region = document.querySelector('[data-testid="route-planner-scroll-region"]');
      return Boolean(region && region.scrollHeight > region.clientHeight);
    });
    const scrollBefore = await page.evaluate(() => ({ pageY: window.scrollY, footerTop: document.querySelector('[data-testid="route-planner-footer"]')?.getBoundingClientRect().top ?? null }));
    await scrollRegion.evaluate((region) => { region.scrollTop = region.scrollHeight; });
    await page.waitForFunction(() => {
      const region = document.querySelector('[data-testid="route-planner-scroll-region"]');
      return Boolean(region && region.scrollTop > 0);
    });
    results.instructionScroll = await page.evaluate(() => ({
      scrollTop: document.querySelector('[data-testid="route-planner-scroll-region"]')?.scrollTop ?? 0,
      pageY: window.scrollY,
      footerTop: document.querySelector('[data-testid="route-planner-footer"]')?.getBoundingClientRect().top ?? null,
      documentHeight: document.documentElement.scrollHeight,
      viewportHeight: innerHeight,
    }));
    results.instructionScroll.keptPageAndFooterStable = results.instructionScroll.pageY === scrollBefore.pageY
      && results.instructionScroll.footerTop === scrollBefore.footerTop
      && results.instructionScroll.documentHeight <= results.instructionScroll.viewportHeight + 1;
    if (!results.instructionScroll.scrollTop || !results.instructionScroll.keptPageAndFooterStable) {
      throw new Error(`Preview instructions did not scroll independently inside the sheet: ${JSON.stringify(results.instructionScroll)}`);
    }
    await scrollRegion.evaluate((region) => { region.scrollTop = 0; });
    await previewSteps.locator("summary").click();
    const expandedShot = path.join(output, "test-only-sos-preview-expanded-390x844.png");
    await page.screenshot({ path: expandedShot, fullPage: false });
    screenshots.push(path.basename(expandedShot));
    if (!expanded390.startFullyInFooter || !expanded390.startFullyInViewport || !expanded390.sheetAboveBottomNavigation) {
      throw new Error(`Expanded Start action was not fully reachable: ${JSON.stringify(expanded390)}`);
    }

    // Check that expanding/collapsing changes sheet bounds without reframing the map.
    const cameraBefore = await page.evaluate(() => {
      const routeLine = document.querySelector('[data-route-line], [data-testid*="route-line"], .student-route-line');
      const markers = [...document.querySelectorAll('[data-route-marker], [data-route-current-position], [data-testid*="route-marker"]')]
        .map((node) => { const r = node.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; });
      const r = routeLine?.getBoundingClientRect();
      return { markers, routeLine: r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null };
    });
    await page.getByRole("button", { name: "Collapse route preview" }).click();
    // The dialog's compact preview is distinct from the route card rendered by
    // CampusMapPage after the user collapses the full planner. Accept both
    // intentional compact states instead of waiting for an element that is
    // only used inside the still-open dialog.
    await page.getByTestId("collapsed-route-card").waitFor({ state: "visible" });
    await page.getByTestId("collapsed-route-card").getByRole("button", { name: "Expand route panel" }).click();
    await dialog.getByTestId("route-planner-footer").waitFor({ state: "visible" });
    await waitForCameraSettled(page);
    const cameraAfter = await page.evaluate(() => {
      const routeLine = document.querySelector('[data-route-line], [data-testid*="route-line"], .student-route-line');
      const markers = [...document.querySelectorAll('[data-route-marker], [data-route-current-position], [data-testid*="route-marker"]')]
        .map((node) => { const r = node.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; });
      const r = routeLine?.getBoundingClientRect();
      return { markers, routeLine: r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null };
    });
    results.expandCollapseCameraStable = JSON.stringify(cameraBefore) === JSON.stringify(cameraAfter);

    const viewports = process.env.ROUTE_PREVIEW_VIEWPORTS
      ? process.env.ROUTE_PREVIEW_VIEWPORTS.split(",").map((item) => {
        const [width, height] = item.split("x").map(Number);
        return { width, height };
      })
      : [
      { width: 320, height: 568 }, { width: 360, height: 640 }, { width: 390, height: 844 },
      { width: 430, height: 932 }, { width: 768, height: 1024 }, { width: 1440, height: 900 },
    ];
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(180);
      let compactCheck = null;
      if (viewport.width < 768) {
        const collapse = dialog.getByRole("button", { name: "Collapse route preview" }).last();
        await collapse.waitFor({ state: "visible" });
        await collapse.click();
        await page.getByTestId("collapsed-route-card").waitFor({ state: "visible" });
        await page.waitForFunction(() => !document.querySelector('[data-testid="route-planner-dialog"]'));
        compactCheck = await page.evaluate(() => ({
          sheet: document.querySelector('[data-testid="collapsed-route-card"]')?.getBoundingClientRect().toJSON() ?? null,
          viewportWidth: innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          summary: Boolean(document.querySelector('[data-testid="collapsed-route-card"]')?.getClientRects().length),
          routeSelectorVisible: [...document.querySelectorAll('[data-testid="emergency-route-selector"]')].some((node) => node.getClientRects().length > 0),
          start: (() => {
            const button = [...document.querySelectorAll('button')].find((node) => node.getClientRects().length > 0 && /^(?:Start(?:\s|$)|Start Navigation$)/.test(node.textContent?.trim() ?? ""));
            const rect = button?.getBoundingClientRect();
            const card = document.querySelector('[data-testid="collapsed-route-card"]')?.getBoundingClientRect();
            return { visible: Boolean(rect), fullyInViewport: Boolean(rect && rect.top >= 0 && rect.bottom <= innerHeight), insideCollapsedCard: Boolean(!card || (rect && rect.top >= card.top && rect.bottom <= card.bottom)) };
          })(),
        }));
        const collapsedCard = page.getByTestId("collapsed-route-card");
        if (await collapsedCard.isVisible().catch(() => false)) {
          await collapsedCard.getByRole("button", { name: "Expand route panel" }).click();
        } else {
          await page.getByRole("button", { name: "Expand route panel" }).last().click();
        }
        await page.waitForFunction(() => {
          const dialog = document.querySelector('[data-testid="route-planner-dialog"]');
          return dialog?.getAttribute("data-mobile-sheet-state") === "expanded";
        }, null, { timeout: 5000 }).catch(async () => {
          results.expandDockDiagnostic = await page.evaluate(() => ({
            dialog: document.querySelector('[data-testid="route-planner-dialog"]')?.outerHTML.slice(0, 500) ?? null,
            collapsedCard: document.querySelector('[data-testid="collapsed-route-card"]')?.innerText.replace(/\s+/g, " ").trim() ?? null,
            buttons: [...document.querySelectorAll('[data-testid="collapsed-route-card"] button')].map((button) => ({
              label: button.getAttribute("aria-label"), text: button.textContent?.trim(),
              rect: button.getBoundingClientRect().toJSON(),
            })),
          }));
        });
        await dialog.getByTestId("route-planner-footer").waitFor({ state: "visible" });
        await waitForCameraSettled(page);
      }
      const check = await page.evaluate(() => {
        const dialog = document.querySelector('[data-testid="route-planner-dialog"]');
        const footer = document.querySelector('[data-testid="route-planner-footer"]');
        const start = [...(footer?.querySelectorAll("button") ?? [])].find((button) => button.textContent?.trim() === "Start");
        const d = dialog?.getBoundingClientRect();
        const s = start?.getBoundingClientRect();
        const nav = document.querySelector('[aria-label="Mobile navigation"]')?.getBoundingClientRect();
        return {
          width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight,
          sheetState: dialog?.getAttribute("data-mobile-sheet-state"), sheet: d?.toJSON(),
          startVisible: Boolean(s && s.width > 0 && s.height > 0),
          startInsideFooter: Boolean(start && footer && s && s.top >= footer.getBoundingClientRect().top && s.bottom <= footer.getBoundingClientRect().bottom),
          startInsideViewport: Boolean(s && s.top >= 0 && s.bottom <= innerHeight),
          aboveBottomNav: Boolean(!nav || nav.height <= 0 || !d || d.bottom <= nav.top),
          routeSelectorVisible: [...document.querySelectorAll('[data-testid="emergency-route-selector"]')].some((node) => node.getClientRects().length > 0),
          emergencyPosition: (() => {
            const marker = document.querySelector('[data-testid="student-emergency-floor-progress-marker"]');
            const rect = marker?.getBoundingClientRect();
            const sheet = d;
            return {
              rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
              clearOfSheet: Boolean(!rect || !sheet || rect.bottom <= sheet.top || rect.top >= sheet.bottom),
            };
          })(),
        };
      });
      const pickerState = await checkFloorPickerOwnership(page, `route-preview-expanded-${viewport.width}`);
      const entry = { ...viewport, check };
      entry.floorPicker = pickerState;
      if (viewport.width < 768) entry.collapsed = compactCheck;
      results.viewports.push(entry);
      const file = path.join(output, `test-only-sos-preview-expanded-${viewport.width}x${viewport.height}.png`);
      await page.screenshot({ path: file, fullPage: false });
      screenshots.push(path.basename(file));
      if (check.documentWidth !== viewport.width || !check.startInsideFooter || !check.startInsideViewport || !check.aboveBottomNav) {
        throw new Error(`Responsive preview failed at ${viewport.width}x${viewport.height}: ${JSON.stringify(entry)}`);
      }
      if (viewport.width < 768 && check.documentHeight > viewport.height + 1) {
        throw new Error(`The mobile page scrolls outside its intended sheet scroll region at ${viewport.width}px: ${JSON.stringify(entry)}`);
      }
      if (viewport.width < 768 && !check.emergencyPosition.clearOfSheet) {
        throw new Error(`The route position marker is obscured by the expanded sheet at ${viewport.width}px: ${JSON.stringify(entry)}`);
      }
      if (viewport.width < 768 && (!entry.collapsed.summary || entry.collapsed.routeSelectorVisible || entry.collapsed.documentWidth !== viewport.width
        || entry.collapsed.start.visible && (!entry.collapsed.start.fullyInViewport || !entry.collapsed.start.insideCollapsedCard))) {
        throw new Error(`Collapsed preview failed at ${viewport.width}x${viewport.height}: ${JSON.stringify(entry.collapsed)}`);
      }

      await page.emulateMedia({ colorScheme: "dark" });
      const switchTo3D = dialog.getByRole("button", { name: "Switch to 3D view" }).first();
      if (await switchTo3D.isVisible().catch(() => false)) {
        await switchTo3D.click();
        await dialog.getByRole("button", { name: "Switch to 2D view" }).first().waitFor({ state: "visible" });
        await page.waitForFunction(() => [...document.querySelectorAll("canvas")].some((canvas) => canvas.getBoundingClientRect().width > 100));
        await page.waitForFunction(() => Boolean(document.querySelector('[data-testid="student-indoor-3d-renderer"], [data-testid="student-campus-3d-surface"]')));
        await page.waitForFunction(() => new Promise((resolve) => {
          let frames = 0;
          const settle = () => { if (++frames >= 18) resolve(true); else requestAnimationFrame(settle); };
          requestAnimationFrame(settle);
        }));
        entry.dark3D = await page.evaluate(() => ({
          startVisible: [...document.querySelectorAll('[data-testid="route-planner-footer"] button')].some((button) => button.textContent?.trim() === "Start" && button.getBoundingClientRect().height > 0),
          routeChoicesVisible: [...document.querySelectorAll('[data-testid="emergency-route-selector"]')].some((node) => node.getBoundingClientRect().height > 0),
          sheetWithinViewport: (() => { const rect = document.querySelector('[data-testid="route-planner-dialog"]')?.getBoundingClientRect(); return Boolean(rect && rect.top >= 0 && rect.bottom <= innerHeight); })(),
          transitionCue: (() => {
            const renderer = document.querySelector('[data-testid="student-indoor-3d-renderer"]');
            const sheet = document.querySelector('[data-testid="route-planner-dialog"]')?.getBoundingClientRect();
            const cue = [...(renderer?.querySelectorAll("button") ?? [])].find((button) => /Continue (Upstairs|Downstairs).*Floor/i.test(button.textContent ?? ""));
            const rect = cue?.getBoundingClientRect();
            return rect ? { text: cue.textContent?.trim(), rect: rect.toJSON(), visibleAboveSheet: Boolean(rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= (sheet?.top ?? innerHeight) && rect.left < innerWidth && rect.right > 0) } : null;
          })(),
          renderer: (() => {
            const element = document.querySelector('[data-testid="student-indoor-3d-renderer"], [data-testid="student-campus-3d-surface"]');
            const canvas = element?.querySelector("canvas");
            const rect = element?.getBoundingClientRect();
            const canvasRect = canvas?.getBoundingClientRect();
            const state = canvas?.__r3f?.store?.getState?.();
            return { present: Boolean(element), rect: rect?.toJSON() ?? null, opacity: element ? getComputedStyle(element).opacity : null,
              canvasRect: canvasRect?.toJSON() ?? null, canvasPixels: canvas ? { width: canvas.width, height: canvas.height } : null,
              camera: state ? { position: state.camera.position.toArray(), target: state.controls?.target?.toArray?.() ?? null } : null,
              routeLabelRects: [...(element?.querySelectorAll("span") ?? [])].filter((node) => /Route [AB]/.test(node.textContent ?? "")).map((node) => ({
                text: node.textContent?.trim(), rect: node.getBoundingClientRect().toJSON(), opacity: getComputedStyle(node).opacity,
              })),
              labelRects: [...(element?.querySelectorAll("span") ?? [])].filter((node) => node.textContent?.trim()).slice(0, 20).map((node) => ({
                text: node.textContent?.trim(), rect: node.getBoundingClientRect().toJSON(), opacity: getComputedStyle(node).opacity,
              })),
              labelTexts: [...(element?.querySelectorAll("button, span") ?? [])].filter((node) => node.getClientRects().length > 0).map((node) => node.textContent?.trim()).filter(Boolean).slice(0, 12) };
          })(),
          routeStartMarker: (() => {
            const marker = document.querySelector('[data-testid="student-indoor-3d-route-start-pin"], [data-testid="student-3d-route-start-pin"]');
            const sheet = document.querySelector('[data-testid="route-planner-dialog"]')?.getBoundingClientRect();
            const rect = marker?.getBoundingClientRect();
            return rect ? { rect: rect.toJSON(), clearOfSheet: Boolean(!sheet || rect.bottom <= sheet.top || rect.top >= sheet.bottom) } : null;
          })(),
        }));
        if (!entry.dark3D.startVisible || !entry.dark3D.routeChoicesVisible || !entry.dark3D.sheetWithinViewport) {
          throw new Error(`Dark 3D preview lost controls at ${viewport.width}px: ${JSON.stringify(entry.dark3D)}`);
        }
        if (viewport.width === 390 && !entry.dark3D.transitionCue?.visibleAboveSheet) {
          throw new Error(`Dark 3D preview route transition cue is missing or obscured at 390px: ${JSON.stringify(entry.dark3D.transitionCue)}`);
        }
        if (viewport.width === 390) {
          const dark3DShot = path.join(output, `test-only-sos-preview-expanded-${viewport.width}-dark-3d.png`);
          // Flush Chromium's WebGL compositor before capturing the rendered
          // map surface and its anchored HTML controls.
          await page.screenshot({ fullPage: false });
          await page.locator('[data-testid="student-indoor-3d-renderer"] canvas').screenshot({ path: dark3DShot });
          screenshots.push(path.basename(dark3DShot));
        }
        await dialog.getByRole("button", { name: "Switch to 2D view" }).first().click();
        await dialog.getByRole("button", { name: "Switch to 3D view" }).first().waitFor({ state: "visible" });
        await checkFloorPickerOwnership(page, `route-preview-3d-${viewport.width}`);
        entry.dark2D = await page.evaluate(() => ({
          startVisible: [...document.querySelectorAll('[data-testid="route-planner-footer"] button')].some((button) => button.textContent?.trim() === "Start" && button.getBoundingClientRect().height > 0),
          routeChoicesVisible: [...document.querySelectorAll('[data-testid="emergency-route-selector"]')].some((node) => node.getBoundingClientRect().height > 0),
        }));
        if (!entry.dark2D.startVisible || !entry.dark2D.routeChoicesVisible) {
          throw new Error(`Dark 2D preview lost controls at ${viewport.width}px: ${JSON.stringify(entry.dark2D)}`);
        }
        await page.emulateMedia({ colorScheme: "light" });
        await dialog.getByRole("button", { name: "Switch to 3D view" }).first().click();
        await dialog.getByRole("button", { name: "Switch to 2D view" }).first().waitFor({ state: "visible" });
        await page.waitForFunction(() => [...document.querySelectorAll("canvas")].some((canvas) => canvas.getBoundingClientRect().width > 100));
        entry.light3D = await page.evaluate(() => ({
          startVisible: [...document.querySelectorAll('[data-testid="route-planner-footer"] button')].some((button) => button.textContent?.trim() === "Start" && button.getBoundingClientRect().height > 0),
          routeChoicesVisible: [...document.querySelectorAll('[data-testid="emergency-route-selector"]')].some((node) => node.getBoundingClientRect().height > 0),
          sheetWithinViewport: (() => { const rect = document.querySelector('[data-testid="route-planner-dialog"]')?.getBoundingClientRect(); return Boolean(rect && rect.top >= 0 && rect.bottom <= innerHeight); })(),
        }));
        if (!entry.light3D.startVisible || !entry.light3D.routeChoicesVisible || !entry.light3D.sheetWithinViewport) {
          throw new Error(`Light 3D preview lost controls at ${viewport.width}px: ${JSON.stringify(entry.light3D)}`);
        }
        if (viewport.width === 390) {
          const light3DShot = path.join(output, `test-only-sos-preview-expanded-${viewport.width}-light-3d.png`);
          await page.screenshot({ fullPage: false });
          await page.locator('[data-testid="student-indoor-3d-renderer"] canvas').screenshot({ path: light3DShot });
          screenshots.push(path.basename(light3DShot));
        }
        await dialog.getByRole("button", { name: "Switch to 2D view" }).first().click();
        await dialog.getByRole("button", { name: "Switch to 3D view" }).first().waitFor({ state: "visible" });
        entry.light2D = await page.evaluate(() => ({
          startVisible: [...document.querySelectorAll('[data-testid="route-planner-footer"] button')].some((button) => button.textContent?.trim() === "Start" && button.getBoundingClientRect().height > 0),
          routeChoicesVisible: [...document.querySelectorAll('[data-testid="emergency-route-selector"]')].some((node) => node.getBoundingClientRect().height > 0),
        }));
        if (!entry.light2D.startVisible || !entry.light2D.routeChoicesVisible) {
          throw new Error(`Light 2D preview lost controls at ${viewport.width}px: ${JSON.stringify(entry.light2D)}`);
        }
      } else {
        entry.dark3D = { unavailable: true };
      }
      await page.emulateMedia({ colorScheme: "light" });
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(180);
    const expandDark = page.getByRole("button", { name: "Expand route panel" });
    if (await expandDark.isVisible().catch(() => false)) await expandDark.click();
    await page.getByRole("button", { name: "Start", exact: true }).last().waitFor({ state: "visible" });
    const darkShot = path.join(output, "test-only-sos-preview-expanded-390-dark.png");
    await page.emulateMedia({ colorScheme: "dark" });
    await page.screenshot({ path: darkShot, fullPage: false });
    screenshots.push(path.basename(darkShot));
    const renderer = page.getByRole("button", { name: "Switch to 3D view" }).first();
    await renderer.click();
    await page.getByRole("button", { name: "Switch to 2D view" }).waitFor({ state: "visible" });
    await page.waitForFunction(() => [...document.querySelectorAll("canvas")].some((canvas) => canvas.getBoundingClientRect().width > 100));
    results.rendererSwitchPreservesPreview = {
      assemblyDestination: (await dialog.getByTestId("emergency-route-summary-destination").textContent())?.trim() ?? null,
      startVisible: await page.getByRole("button", { name: "Start", exact: true }).last().isVisible(),
      selectorVisible: await page.getByTestId("emergency-route-selector").isVisible(),
    };
    if (!results.rendererSwitchPreservesPreview.assemblyDestination?.includes(results.fixtureSummary.destinationName)) {
      throw new Error(`3D switching changed the resolved SOS destination: ${JSON.stringify(results.rendererSwitchPreservesPreview)}`);
    }
    await checkFloorPickerOwnership(page, "profile-menu-before-open-390");
    await page.getByTestId("student-map-profile-trigger").getByRole("button").click();
    await page.getByRole("menu", { name: "Student account menu" }).waitFor({ state: "visible" });
    results.profileMenuOwnsForeground = await page.evaluate(() => ({
      profileMenuVisible: Boolean(document.querySelector('[role="menu"][aria-label="Student account menu"]')?.getClientRects().length),
      floorPickerCount: document.querySelectorAll('[data-testid="student-floor-picker"], [data-testid="student-floor-picker-inline"]').length,
    }));
    if (!results.profileMenuOwnsForeground.profileMenuVisible || results.profileMenuOwnsForeground.floorPickerCount !== 0) {
      throw new Error(`The profile menu and floor picker competed for the same floating area: ${JSON.stringify(results.profileMenuOwnsForeground)}`);
    }
    await page.keyboard.press("Escape");
    await page.getByTestId("student-floor-picker").waitFor({ state: "visible" });
    await checkFloorPickerOwnership(page, "profile-menu-closed-390");
    await dialog.getByRole("button", { name: "Start", exact: true }).last().click();
    await page.waitForFunction(() => document.querySelector('[data-testid="student-map-surface"]')?.getAttribute("data-route-phase") === "navigating", null, { timeout: 12000 });
    const pauseNavigation = page.getByRole("button", { name: "Pause navigation" }).first();
    if (await pauseNavigation.isVisible().catch(() => false)) await pauseNavigation.click();
    await checkFloorPickerOwnership(page, "guided-navigation-390");
    results.guidedNavigation = await page.evaluate(() => ({
      phase: document.querySelector('[data-testid="student-map-surface"]')?.getAttribute("data-route-phase"),
      step: document.querySelector('[data-testid="collapsed-route-card"]')?.innerText.match(/Step \d+ of \d+/)?.[0]
        ?? document.querySelector('[data-testid="route-planner-dialog"]')?.innerText.match(/Step \d+ of \d+/)?.[0]
        ?? null,
      paused: Boolean(document.querySelector('button[aria-label="Resume navigation"]')?.getClientRects().length),
    }));
    if (results.guidedNavigation.phase !== "navigating") {
      throw new Error(`Route preview did not enter Guided Navigation: ${JSON.stringify(results.guidedNavigation)}`);
    }
    const expandNavigation = page.getByRole("button", { name: /Expand navigation panel|Expand route panel/ }).first();
    if (await expandNavigation.isVisible().catch(() => false)) {
      await expandNavigation.click();
      await page.getByTestId("route-planner-dialog").waitFor({ state: "visible" });
    }
    await checkFloorPickerOwnership(page, "guided-navigation-expanded-390");
    const guidedDialog = page.getByTestId("route-planner-dialog");
    const followStateBeforeExplore = await page.evaluate(() => ({
      phase: document.querySelector('[data-testid="student-map-surface"]')?.getAttribute("data-route-phase"),
      step: document.querySelector('[data-testid="route-planner-dialog"]')?.innerText.match(/Step \d+ of \d+/)?.[0] ?? null,
      instruction: document.querySelector('[data-testid="current-route-instruction"]')?.textContent?.trim()
        ?? document.querySelector('[data-testid="explore-inspected-step"]')?.innerText.replace(/\s+/g, " ").trim() ?? null,
      floor: document.querySelector('[data-testid="student-floor-picker"] button')?.innerText.replace(/\s+/g, " ").trim() ?? null,
      paused: Boolean(document.querySelector('button[aria-label="Resume navigation"]')?.getClientRects().length),
    }));
    await guidedDialog.getByRole("button", { name: "Switch to Explore mode" }).click();
    await guidedDialog.getByRole("button", { name: "Return to Follow mode" }).waitFor({ state: "visible" });
    await checkFloorPickerOwnership(page, "guided-explore-390");
    const floorTrigger = page.getByTestId("student-floor-picker").getByRole("button", { name: /Choose floor/ });
    await floorTrigger.click();
    const otherFloor = page.locator('[role="option"][aria-selected="false"]').first();
    await otherFloor.waitFor({ state: "visible" });
    const exploredFloorLabel = await otherFloor.innerText();
    await otherFloor.click();
    const exploreFloorState = await page.evaluate(() => ({
      phase: document.querySelector('[data-testid="student-map-surface"]')?.getAttribute("data-route-phase"),
      step: document.querySelector('[data-testid="route-planner-dialog"]')?.innerText.match(/Step \d+ of \d+/)?.[0] ?? null,
      instruction: document.querySelector('[data-testid="current-route-instruction"]')?.textContent?.trim()
        ?? document.querySelector('[data-testid="explore-inspected-step"]')?.innerText.replace(/\s+/g, " ").trim() ?? null,
      floor: document.querySelector('[data-testid="student-floor-picker"] button')?.innerText.replace(/\s+/g, " ").trim() ?? null,
      paused: Boolean(document.querySelector('button[aria-label="Resume navigation"]')?.getClientRects().length),
    }));
    await guidedDialog.getByRole("button", { name: "Return to Follow mode" }).click();
    const followStateRestored = await page.evaluate(() => ({
      phase: document.querySelector('[data-testid="student-map-surface"]')?.getAttribute("data-route-phase"),
      step: document.querySelector('[data-testid="route-planner-dialog"]')?.innerText.match(/Step \d+ of \d+/)?.[0] ?? null,
      instruction: document.querySelector('[data-testid="current-route-instruction"]')?.textContent?.trim()
        ?? document.querySelector('[data-testid="explore-inspected-step"]')?.innerText.replace(/\s+/g, " ").trim() ?? null,
      floor: document.querySelector('[data-testid="student-floor-picker"] button')?.innerText.replace(/\s+/g, " ").trim() ?? null,
      paused: Boolean(document.querySelector('button[aria-label="Resume navigation"]')?.getClientRects().length),
    }));
    results.exploreFloorInspection = { followStateBeforeExplore, exploredFloorLabel, exploreFloorState, followStateRestored };
    if (followStateBeforeExplore.phase !== "navigating" || exploreFloorState.phase !== "navigating"
      || followStateRestored.phase !== "navigating" || !followStateBeforeExplore.paused || !followStateRestored.paused
      || followStateBeforeExplore.step !== exploreFloorState.step || followStateBeforeExplore.step !== followStateRestored.step
      || !followStateBeforeExplore.instruction || followStateBeforeExplore.instruction !== followStateRestored.instruction
      || exploreFloorState.floor === followStateBeforeExplore.floor
      || followStateRestored.floor !== followStateBeforeExplore.floor) {
      throw new Error(`Explore floor inspection changed Follow playback state: ${JSON.stringify(results.exploreFloorInspection)}`);
    }
    await page.screenshot({ path: path.join(output, "test-only-guided-navigation-expanded-390x844.png"), fullPage: false });
    screenshots.push("test-only-guided-navigation-expanded-390x844.png");
    if (results.browserErrors.length) throw new Error(`Chromium reported browser errors: ${results.browserErrors.join(" | ")}`);
  } catch (error) {
    results.failure = { message: error.message, stack: error.stack?.slice(0, 2500) };
    await page.screenshot({ path: path.join(output, "test-only-sos-preview-failure.png"), fullPage: false }).catch(() => {});
    process.exitCode = 1;
  } finally {
    fs.writeFileSync(path.join(output, "route-preview-layout-results.json"), JSON.stringify(results, null, 2));
    await browser.close();
    console.log(JSON.stringify(results, null, 2));
  }
}

main();

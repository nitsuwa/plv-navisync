const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(process.env.TEMP, "plv-video-acceptance", "node_modules", "playwright"));

const base = "http://127.0.0.1:5173";
const out = path.resolve(process.env.AP_OUTPUT_DIR || "verification-artifacts/emergency-video-test-only/premium-video-player-acceptance/full-map-video");
const sampleMp4 = fs.readFileSync(path.join(process.env.TEMP, "plv-video-acceptance", "sample.mp4"));
const sampleVtt = fs.readFileSync(path.join(process.env.TEMP, "plv-video-acceptance", "sample.vtt"));
const playbackRoomKeyForResults = () => /ASSEMBLY HALL/i.test(process.env.AP_ARRIVAL_ROOM || "CABA LECTURE HALL") ? "assembly-hall"
  : /CEIT/i.test(process.env.AP_ARRIVAL_ROOM || "") ? "ceit"
    : /AUDITORIUM/i.test(process.env.AP_ARRIVAL_ROOM || "") ? "auditorium" : "caba";
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
  const routeFlow = await import("/src/lib/studentRouteFlow.ts");
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
    if (/CABA LECTURE HALL/i.test(room.name)) {
      const fingerprint = student.currentApprovedRoomEvacuationFingerprint(linked, building.id, floor.id, room.id);
      if (!fingerprint) throw new Error("CABA TEST ONLY approved route fingerprint is unavailable for the sample video");
      room.emergencyEvacuation.videoGuide = {
        enabled: true,
        videoId: "90000000-0000-4000-8000-000000000102",
        title: "TEST ONLY — PLV emergency video guide",
        reviewStatus: "approved",
        reviewedRouteFingerprint: fingerprint,
      };
    }
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
    const selectedRoute = resolved.routes[0]?.candidate.route;
    const selectedSteps = selectedRoute ? routeFlow.studentFacingRouteSteps(selectedRoute) : [];
    const arrivalTarget = selectedRoute ? routeFlow.studentRouteArrivalTarget(selectedRoute, selectedSteps) : null;
    const arrivalLeg = arrivalTarget?.contextLegIndex === undefined
      ? undefined
      : selectedRoute?.contextLegs?.[arrivalTarget.contextLegIndex];
    const arrivalPoints = arrivalLeg?.waypoints ?? arrivalTarget?.segment?.waypoints ?? [];
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
      selectedRouteArrival: selectedRoute ? {
        emergencyAssemblyPointId: selectedRoute.emergencyAssemblyPointId ?? null,
        emergencyDestinationLabel: selectedRoute.emergencyDestinationLabel ?? null,
        targetContext: arrivalTarget?.context ?? null,
        targetPhase: arrivalTarget?.phase ?? null,
        targetContextLegIndex: arrivalTarget?.contextLegIndex ?? null,
        finalWaypoint: arrivalPoints.at(-1) ?? null,
        assemblyWaypoint: { x: linkedPoint.x, y: linkedPoint.y },
        steps: selectedSteps.map((step, index) => ({ index, icon: step.icon, instruction: step.instruction, contextLegIndex: step.contextLegIndex ?? null })),
        contextLegs: selectedRoute.contextLegs?.map((leg, index) => ({ index, kind: leg.kind, segmentIndex: leg.segmentIndex ?? null, start: leg.waypoints[0] ?? null, end: leg.waypoints.at(-1) ?? null })),
      } : null,
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

function mutateStatusFixture(campus, scenario) {
  const point = campus.assemblyPoints?.[0];
  const roomEntry = campus.buildings.flatMap((building) => building.floors.flatMap((floor) =>
    floor.rooms.filter((room) => /CABA LECTURE HALL/i.test(room.name)).map((room) => ({ building, floor, room }))
  ))[0];
  if (!point || !roomEntry) throw new Error("TEST ONLY status fixture is missing its Assembly Point or CABA room");

  if (scenario === "disconnected") {
    const before = campus.navEdges.length;
    campus.navEdges = campus.navEdges.filter((edge) => edge.startNodeId !== point.navNodeId && edge.endNodeId !== point.navNodeId);
    return { scenario, removedIncidentEdges: before - campus.navEdges.length, pointNodeId: point.navNodeId };
  }
  if (scenario === "unapproved") {
    point.safetyReview = { ...point.safetyReview, status: "ready_for_review" };
    return { scenario, reviewStatus: point.safetyReview.status };
  }
  if (scenario === "stale-point") {
    point.safetyReview = { ...point.safetyReview, fingerprint: "TEST_ONLY_STALE_POINT_FINGERPRINT" };
    return { scenario, reviewStatus: point.safetyReview.status, fingerprint: point.safetyReview.fingerprint };
  }
  if (scenario === "stale-route") {
    const routes = roomEntry.room.emergencyEvacuation?.routes ?? [];
    roomEntry.room.emergencyEvacuation = {
      ...roomEntry.room.emergencyEvacuation,
      routes: routes.map((route) => ({ ...route, approvedRouteSignature: "TEST_ONLY_STALE_ROUTE_SIGNATURE" })),
    };
    return { scenario, staleRoomRouteCount: routes.length, pointReviewStatus: point.safetyReview?.status };
  }
  throw new Error(`Unknown AP_STATUS_SCENARIO: ${scenario}`);
}

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
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: process.env.AP_REDUCED_MOTION || "reduce" });
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const method = request.method().toUpperCase();
    if (pathname.includes("/storage/v1/object/sign/emergency-evacuation-videos/") && method === "GET") {
      if (results.videoAdapter) results.videoAdapter.mediaRequests += 1;
      const caption = pathname.toLowerCase().endsWith(".vtt");
      const data = caption ? sampleVtt : sampleMp4;
      const headers = {
        "content-type": caption ? "text/vtt; charset=utf-8" : "video/mp4",
        "accept-ranges": "bytes",
        "access-control-allow-origin": "*",
        "access-control-expose-headers": "content-length, content-range, accept-ranges, content-type, content-disposition",
        "cache-control": "private, no-store",
      };
      const downloadName = url.searchParams.get("download");
      if (!caption && downloadName) headers["content-disposition"] = `attachment; filename="${downloadName.replace(/[\"\\]/g, "_")}"`;
      const range = request.headers().range;
      if (!caption && range) {
        const match = range.match(/bytes=(\d+)-(\d*)/);
        const start = match ? Number(match[1]) : 0;
        const end = Math.min(match?.[2] ? Number(match[2]) : data.length - 1, data.length - 1);
        const chunk = data.subarray(start, end + 1);
        return route.fulfill({ status: 206, body: chunk, headers: { ...headers, "content-length": String(chunk.length), "content-range": `bytes ${start}-${end}/${data.length}` } });
      }
      return route.fulfill({ status: 200, body: data, headers: { ...headers, "content-length": String(data.length) } });
    }
    if (["127.0.0.1", "localhost"].includes(url.hostname)) return route.continue();
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
    if (pathname.endsWith("/rpc/get_published_emergency_evacuation_video") && method === "POST") {
      const id = String(request.postDataJSON()?.p_video_id ?? "");
      const target = testCampus?.buildings.flatMap((building) => building.floors.flatMap((floor) =>
        floor.rooms.filter((room) => /CABA LECTURE HALL/i.test(room.name)).map((room) => ({ building, floor, room }))
      ))[0];
      const guide = target?.room.emergencyEvacuation?.videoGuide;
      const published = guide?.videoId === id;
      results.videoAdapter = results.videoAdapter ?? { testOnly: true, publishedVideoReads: 0, mediaRequests: 0, productionWrites: 0 };
      if (published) results.videoAdapter.publishedVideoReads += 1;
      return json(route, published ? {
        id,
        campus_id: testCampus.id,
        building_id: target.building.id,
        floor_id: target.floor.id,
        room_id: target.room.id,
        storage_path: "TEST_ONLY/CABA/sample.mp4",
        captions_path: "TEST_ONLY/CABA/sample.vtt",
        original_filename: "PLV_NaviSync_Emergency_Video_TEST_ONLY.mp4",
        mime_type: "video/mp4",
        file_size_bytes: sampleMp4.length,
        title: guide.title,
        duration_seconds: 16,
        approved_route_fingerprint: JSON.parse(guide.reviewedRouteFingerprint),
        updated_at: "2026-10-15T00:00:00.000Z",
      } : null);
    }
    if (pathname.includes("/storage/v1/object/sign/emergency-evacuation-videos/") && method === "POST") {
      const suffix = pathname.toLowerCase().endsWith(".vtt") ? "sample.vtt" : "sample.mp4";
      return json(route, { signedURL: `/object/sign/emergency-evacuation-videos/TEST_ONLY/CABA/${suffix}?token=isolated-test-only` });
    }
    if (["POST", "PATCH", "PUT", "DELETE"].includes(method)) return json(route, { message: "Blocked by TEST ONLY browser adapter" }, 403);
    return json(route, []);
  });

  const page = await context.newPage();
  // Keep this continuation bounded so a missing UI control is diagnosed from
  // the current page state instead of leaving Chromium waiting indefinitely.
  page.setDefaultTimeout(8000);
  page.on("pageerror", (error) => results.browserErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && !message.text().includes("ERR_BLOCKED_BY_CLIENT")) results.browserErrors.push(message.text().slice(0, 300)); });
  page.on("requestfailed", (request) => results.browserErrors.push(`requestfailed ${new URL(request.url()).pathname}: ${request.failure()?.errorText ?? "unknown"}`));

  let currentStage = "open Student Map";
  const setStage = (nextStage) => {
    currentStage = nextStage;
    process.stdout.write(`[stage] ${nextStage}\n`);
  };
  try {
    await page.goto(`${base}/map`, { waitUntil: "domcontentloaded" });
    await page.getByRole("searchbox", { name: "Search campus map" }).waitFor();
    const prepared = await page.evaluate(fixtureBuilder);
    testCampus = prepared.campus;
    results.fixtureSummary = prepared.summary;
    if (process.env.AP_STATUS_SCENARIO) {
      results.statusFixtureMutation = mutateStatusFixture(testCampus, process.env.AP_STATUS_SCENARIO);
    }
    if (process.env.AP_FIXTURE_SUMMARY_ONLY === "1") return;
    if (process.env.AP_PLAYBACK_ONLY === "1" || process.env.AP_OUTDOOR_ONLY === "1") {
      const previous = JSON.parse(fs.readFileSync(path.join(out, "assembly-point-student-browser-results.json"), "utf8").replace(/^\uFEFF/, ""));
      results.rooms = previous.rooms ?? {};
      results.screenshots = previous.screenshots ?? [];
      results.playback = previous.playback;
    }
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("searchbox", { name: "Search campus map" }).waitFor();
    await page.waitForFunction(() => document.body.innerText.includes("SC"));

    if (process.env.AP_VIDEO_MAP_ONLY === "1") {
      currentStage = "CABA TEST ONLY Student Map video in 2D and 3D";
      await page.setViewportSize({ width: 1440, height: 900 });
      const search = page.getByRole("searchbox", { name: "Search campus map" });
      await search.click();
      await search.fill("CABA LECTURE HALL");
      await page.getByRole("option", { name: /CABA LECTURE HALL/i }).click();
      const card = page.getByTestId("student-emergency-video-card");
      await card.waitFor({ state: "visible", timeout: 15000 });
      const video = card.locator("video");
      await video.waitFor({ state: "attached" });
      await page.waitForFunction(() => {
        const player = document.querySelector('[data-testid="student-emergency-video-card"] video');
        return player && player.readyState >= 2 && Number.isFinite(player.duration) && player.duration > 0;
      }, null, { timeout: 15000 });
      await page.waitForTimeout(700);
      results.studentMapVideo = { renderer: "2D", desktopViewport: "1440x900", testOnly: true };
      results.studentMapVideo.before3d = await video.evaluate((player) => ({
        readyState: player.readyState,
        duration: player.duration,
        currentTime: player.currentTime,
        muted: player.muted,
        paused: player.paused,
        loop: player.loop,
        controls: player.controls,
        playsInline: player.playsInline,
        trackCount: player.textTracks.length,
      }));
      const videoDesktop2d = path.join(out, "student-map-video-caba-desktop-2d-1440.png");
      await page.screenshot({ path: videoDesktop2d, fullPage: false });
      results.screenshots.push(path.basename(videoDesktop2d));

      const playerControls = results.studentMapVideo.playerControls = {};
      playerControls.mutedAutoplay = await video.evaluate((player) => !player.paused && player.muted && player.currentTime > 0);
      const compactPause = page.getByRole("button", { name: "Pause video guide" });
      if (await compactPause.isVisible().catch(() => false)) await compactPause.click();
      playerControls.pauseButtonWorks = await page.waitForFunction(() => document.querySelector('[data-testid="student-emergency-video-card"] video')?.paused === true, null, { timeout: 4000 }).then(() => true).catch(() => false);
      const compactPlay = page.getByRole("button", { name: "Play video guide" });
      if (await compactPlay.isVisible().catch(() => false)) await compactPlay.click();
      playerControls.playButtonWorks = await page.waitForFunction(() => {
        const player = document.querySelector('[data-testid="student-emergency-video-card"] video');
        return Boolean(player && !player.paused);
      }, null, { timeout: 4000 }).then(() => true).catch(() => false);

      const unmute = page.getByRole("button", { name: "Enable video voiceover" });
      if (await unmute.isVisible().catch(() => false)) await unmute.click();
      playerControls.unmuteWorks = await video.evaluate((player) => !player.muted);
      const mute = page.getByRole("button", { name: "Mute video voiceover" });
      if (await mute.isVisible().catch(() => false)) await mute.click();
      playerControls.muteWorks = await video.evaluate((player) => player.muted);

      const showControls = page.getByRole("button", { name: "Show video guide controls" });
      await showControls.click();
      await page.waitForFunction(() => document.querySelector('[data-testid="student-emergency-video-card"] video')?.controls === true);
      const nativeVideoBounds = await video.boundingBox();
      if (nativeVideoBounds) await page.mouse.move(nativeVideoBounds.x + nativeVideoBounds.width * 0.62, nativeVideoBounds.y + nativeVideoBounds.height - 16);
      await page.waitForTimeout(250);
      playerControls.nativeControlsEnabled = await video.evaluate((player) => player.controls);
      playerControls.nativeDurationSeconds = await video.evaluate((player) => player.duration);
      await page.screenshot({ path: path.join(out, "student-map-video-caba-desktop-player-controls-1440.png"), fullPage: false });
      results.screenshots.push("student-map-video-caba-desktop-player-controls-1440.png");

      await video.evaluate((player) => { player.pause(); player.currentTime = Math.min(5, player.duration / 2); });
      await page.getByRole("button", { name: "Replay video guide" }).click();
      playerControls.replayWorks = await page.waitForFunction(() => {
        const player = document.querySelector('[data-testid="student-emergency-video-card"] video');
        return Boolean(player && player.currentTime < 0.6 && !player.paused);
      }, null, { timeout: 4000 }).then(() => true).catch(() => false);
      const loopOff = page.getByRole("button", { name: "Turn video loop off" });
      if (await loopOff.isVisible().catch(() => false)) await loopOff.click();
      playerControls.loopToggleOffWorks = await video.evaluate((player) => !player.loop);
      const loopOn = page.getByRole("button", { name: "Turn video loop on" });
      if (await loopOn.isVisible().catch(() => false)) await loopOn.click();
      playerControls.loopToggleOnWorks = await video.evaluate((player) => player.loop);

      playerControls.nativeSeekKeyboardWorks = false;
      playerControls.nativeSeekPointerWorks = false;
      playerControls.nativeVolumeKeyboardWorks = false;
      playerControls.captionToggleKeyboardWorks = false;
      playerControls.fullscreenKeyboardWorks = false;
      await video.evaluate((player) => { player.pause(); player.currentTime = 1; player.muted = false; player.volume = 0.5; });
      await video.focus();
      const timeBeforeSeek = await video.evaluate((player) => player.currentTime);
      await page.keyboard.press("ArrowRight");
      playerControls.nativeSeekKeyboardWorks = await page.waitForFunction((before) => {
        const player = document.querySelector('[data-testid="student-emergency-video-card"] video');
        return Boolean(player && player.currentTime > before + 1);
      }, timeBeforeSeek, { timeout: 2500 }).then(() => true).catch(() => false);
      if (nativeVideoBounds) {
        const seekX = nativeVideoBounds.x + nativeVideoBounds.width * 0.68;
        const seekY = nativeVideoBounds.y + nativeVideoBounds.height - 18;
        const pointerTimeBefore = await video.evaluate((player) => player.currentTime);
        await page.mouse.move(seekX, seekY);
        await page.mouse.click(seekX, seekY);
        playerControls.nativeSeekPointerWorks = await page.waitForFunction((before) => {
          const player = document.querySelector('[data-testid="student-emergency-video-card"] video');
          return Boolean(player && player.currentTime > before + 1);
        }, pointerTimeBefore, { timeout: 2500 }).then(() => true).catch(() => false);
      }
      const volumeBefore = await video.evaluate((player) => player.volume);
      await page.keyboard.press("ArrowUp");
      playerControls.nativeVolumeKeyboardWorks = await page.waitForFunction((before) => {
        const player = document.querySelector('[data-testid="student-emergency-video-card"] video');
        return Boolean(player && player.volume > before);
      }, volumeBefore, { timeout: 2500 }).then(() => true).catch(() => false);
      const captionsBefore = await video.evaluate((player) => player.textTracks.length ? player.textTracks[0].mode : "disabled");
      await page.keyboard.press("c");
      playerControls.captionToggleKeyboardWorks = await page.waitForFunction((before) => {
        const player = document.querySelector('[data-testid="student-emergency-video-card"] video');
        return Boolean(player?.textTracks.length && player.textTracks[0].mode !== before);
      }, captionsBefore, { timeout: 2500 }).then(() => true).catch(() => false);
      const captionsShowing = await video.evaluate((player) => Boolean(player.textTracks.length && player.textTracks[0].mode === "showing"));
      if (!captionsShowing) await video.evaluate((player) => { if (player.textTracks.length) player.textTracks[0].mode = "showing"; });
      playerControls.captionsShowing = await video.evaluate((player) => Boolean(player.textTracks.length && player.textTracks[0].mode === "showing"));
      await page.keyboard.press("f");
      playerControls.fullscreenKeyboardWorks = await page.waitForFunction(() => Boolean(document.fullscreenElement), null, { timeout: 2500 }).then(() => true).catch(() => false);
      if (!playerControls.fullscreenKeyboardWorks && nativeVideoBounds) {
        await page.mouse.move(nativeVideoBounds.x + nativeVideoBounds.width - 70, nativeVideoBounds.y + nativeVideoBounds.height - 24);
        await page.waitForTimeout(100);
        await page.mouse.click(nativeVideoBounds.x + nativeVideoBounds.width - 70, nativeVideoBounds.y + nativeVideoBounds.height - 24);
        playerControls.fullscreenPointerWorks = await page.waitForFunction(() => Boolean(document.fullscreenElement), null, { timeout: 2500 }).then(() => true).catch(() => false);
      }
      if (playerControls.fullscreenKeyboardWorks || playerControls.fullscreenPointerWorks) {
        await page.screenshot({ path: path.join(out, "student-map-video-caba-desktop-fullscreen.png"), fullPage: false });
        results.screenshots.push("student-map-video-caba-desktop-fullscreen.png");
        await page.keyboard.press("Escape");
        playerControls.fullscreenExitWorks = await page.waitForFunction(() => !document.fullscreenElement, null, { timeout: 2500 }).then(() => true).catch(() => false);
      } else {
        playerControls.fullscreenExitWorks = false;
      }

      const downloadPromise = page.waitForEvent("download", { timeout: 8000 }).catch(() => null);
      await page.getByRole("button", { name: "Download" }).click();
      const download = await downloadPromise;
      if (download) {
        const downloadedPath = await download.path();
        const downloadedBytes = downloadedPath ? fs.readFileSync(downloadedPath) : Buffer.alloc(0);
        playerControls.downloadedFilename = download.suggestedFilename();
        playerControls.downloadMatchesTestMp4 = downloadedBytes.equals(sampleMp4);
        playerControls.downloadedBytes = downloadedBytes.length;
      } else {
        playerControls.downloadMatchesTestMp4 = false;
      }

      await page.getByRole("button", { name: "Collapse emergency video guide" }).click();
      const playAfterControls = page.getByRole("button", { name: "Play video guide" });
      if (await playAfterControls.isVisible().catch(() => false)) await playAfterControls.click();
      await page.waitForFunction(() => {
        const player = document.querySelector('[data-testid="student-emergency-video-card"] video');
        return Boolean(player && !player.paused && player.currentTime > 0.2);
      }, null, { timeout: 4000 }).catch(() => {});

      // Store the actual DOM video node reference to detect accidental player
      // remounts while the map renderer changes.
      await page.evaluate(() => { window.__plvMapVideoNode = document.querySelector('[data-testid="student-emergency-video-card"] video'); });
      await page.getByRole("button", { name: "Switch to 3D view" }).click();
      await page.getByRole("button", { name: "Switch to 2D view" }).waitFor({ state: "visible", timeout: 15000 });
      await page.waitForFunction(() => [...document.querySelectorAll("canvas")].some((canvas) => {
        const rect = canvas.getBoundingClientRect();
        return rect.width > 100 && rect.height > 100;
      }), null, { timeout: 12000 }).catch(() => {});
      await page.waitForTimeout(500);
      await page.waitForTimeout(350);
      results.studentMapVideo.after3d = await video.evaluate((player) => ({
        sameNode: window.__plvMapVideoNode === player,
        currentTime: player.currentTime,
        muted: player.muted,
        paused: player.paused,
        loop: player.loop,
        controls: player.controls,
        playsInline: player.playsInline,
        trackCount: player.textTracks.length,
        captionsMode: player.textTracks.length ? player.textTracks[0].mode : null,
        canvasVisible: [...document.querySelectorAll("canvas")].some((canvas) => canvas.getBoundingClientRect().width > 100 && canvas.getBoundingClientRect().height > 100),
      }));
      const videoDesktop3d = path.join(out, "student-map-video-caba-desktop-3d-1440.png");
      await page.screenshot({ path: videoDesktop3d, fullPage: false });
      results.screenshots.push(path.basename(videoDesktop3d));
      await page.getByRole("button", { name: "Switch to 2D view" }).click();
      await page.getByRole("button", { name: "Switch to 3D view" }).waitFor({ state: "visible", timeout: 15000 });
      results.studentMapVideo.after2dReturn = await video.evaluate((player) => ({
        sameNode: window.__plvMapVideoNode === player,
        currentTime: player.currentTime,
        muted: player.muted,
        paused: player.paused,
        loop: player.loop,
        controls: player.controls,
      }));
      const videoMobile2d = path.join(out, "student-map-video-caba-mobile-2d-390.png");
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(150);
      results.studentMapVideo.mobileControlLayout2d = await page.evaluate(() => {
        const toggle = document.querySelector('[data-testid="student-campus-view-mode-toggle"]');
        const stack = document.querySelector('[data-testid="student-room-and-video-stack"]');
        const a = toggle?.getBoundingClientRect();
        const b = stack?.getBoundingClientRect();
        return { toggle: a && { left: a.left, top: a.top, right: a.right, bottom: a.bottom }, stack: b && { left: b.left, top: b.top, right: b.right, bottom: b.bottom }, overlaps: Boolean(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) };
      });
      await page.screenshot({ path: videoMobile2d, fullPage: false });
      results.screenshots.push(path.basename(videoMobile2d));
      await page.getByRole("button", { name: "Switch to 3D view" }).click();
      await page.getByRole("button", { name: "Switch to 2D view" }).waitFor({ state: "visible", timeout: 15000 });
      await page.waitForFunction(() => [...document.querySelectorAll("canvas")].some((canvas) => {
        const rect = canvas.getBoundingClientRect();
        return rect.width > 100 && rect.height > 100;
      }), null, { timeout: 12000 }).catch(() => {});
      await page.waitForTimeout(300);
      const videoMobile3d = path.join(out, "student-map-video-caba-mobile-3d-390.png");
      await page.screenshot({ path: videoMobile3d, fullPage: false });
      results.screenshots.push(path.basename(videoMobile3d));
      results.studentMapVideo.mobile = await page.evaluate(() => ({
        viewportWidth: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        playerCount: document.querySelectorAll('[data-testid="student-emergency-video-card"] video').length,
        cardVisible: Boolean(document.querySelector('[data-testid="student-emergency-video-card"]')?.getClientRects().length),
      }));
      results.studentMapVideo.responsive = [];
      for (const viewport of [
        { width: 360, height: 800 }, { width: 390, height: 844 }, { width: 430, height: 932 },
        { width: 1280, height: 800 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 },
      ]) {
        await page.setViewportSize(viewport);
        await page.waitForTimeout(120);
        results.studentMapVideo.responsive.push({ ...viewport, ...(await page.evaluate(() => {
          const toggle = document.querySelector('[data-testid="student-campus-view-mode-toggle"]')?.getBoundingClientRect();
          const stack = document.querySelector('[data-testid="student-room-and-video-stack"]')?.getBoundingClientRect();
          return {
            viewportWidth: innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            playerCount: document.querySelectorAll('[data-testid="student-emergency-video-card"] video').length,
            videoToggleVisible: Boolean(toggle && toggle.width > 0 && toggle.height > 0),
            toggleOverlapsVideoStack: Boolean(toggle && stack && toggle.left < stack.right && toggle.right > stack.left && toggle.top < stack.bottom && toggle.bottom > stack.top),
          };
        })) });
      }
      await page.setViewportSize({ width: 390, height: 844 });

      const sosRoutes = {};
      for (const routeLabel of ["Route A", "Route B"]) {
        currentStage = `CABA ${routeLabel} video pause and resume handoff`;
        await page.goto(`${base}/map`, { waitUntil: "domcontentloaded" });
        await page.getByRole("searchbox", { name: "Search campus map" }).waitFor();
        const routeSearch = page.getByRole("searchbox", { name: "Search campus map" });
        await routeSearch.click();
        await routeSearch.fill("CABA LECTURE HALL");
        await page.getByRole("option", { name: /CABA LECTURE HALL/i }).click();
        await page.getByRole("button", { name: "Start", exact: true }).click();
        await page.getByRole("button", { name: "SOS routing" }).click();
        const dialog = page.getByRole("dialog", { name: "Route planner" });
        await dialog.waitFor({ state: "visible" });
        await dialog.getByRole("button", { name: "Find Route", exact: true }).click();
        const option = page.getByRole("button").filter({ hasText: new RegExp(`^${routeLabel}`) }).first();
        await option.waitFor({ state: "visible", timeout: 10000 });
        await option.click();
        const expandPreview = page.getByRole("button", { name: /Expand route panel|^Expand$/ }).first();
        if (await expandPreview.isVisible().catch(() => false)) await expandPreview.click();
        await page.getByRole("button", { name: "Start", exact: true }).last().click();
        const surface = page.getByTestId("student-map-surface");
        await page.waitForFunction(() => document.querySelector('[data-testid="student-map-surface"]')?.getAttribute("data-route-phase") === "navigating", null, { timeout: 12000 });
        const returnFollow = page.getByRole("button", { name: /Return to Follow/ });
        if (await returnFollow.isVisible().catch(() => false)) await returnFollow.click();
        const followControl = page.locator("button").filter({ hasText: /^FOLLOW$/ }).first();
        if (await followControl.isVisible().catch(() => false)) await followControl.click();
        const expandNavigation = page.getByRole("button", { name: /Expand navigation panel|Expand route panel|^Expand$/ }).first();
        if (await expandNavigation.isVisible().catch(() => false)) await expandNavigation.click();
        const pause = page.getByRole("button", { name: "Pause navigation" });
        const resume = page.getByRole("button", { name: "Resume navigation" });
        let stairTransitionAcceptance = { actualStudentControls: true, stairStepReached: false, transitionContinueAvailable: false, transitionStatusObserved: false, attempts: [] };
        {
          const currentInstructionText = () => page.evaluate(() => [...document.querySelectorAll('[data-testid="current-route-instruction"], [data-testid="collapsed-current-instruction"], [data-testid="compact-current-route-instruction"]')]
            .find((item) => item.getClientRects().length)?.textContent?.trim() ?? "");
          for (let seek = 0; seek < 8; seek += 1) {
            const text = await currentInstructionText();
            if (/take the .* (?:stairs?|elevator).*floor/i.test(text)) {
              stairTransitionAcceptance.stairStepReached = true;
              stairTransitionAcceptance.instruction = text;
              break;
            }
            const continueButton = page.locator("button:visible").filter({ hasText: /^Continue$/ }).first();
            const canContinue = await continueButton.isVisible().catch(() => false)
              && await continueButton.isEnabled().catch(() => false);
            let action = continueButton;
            let actionName = "Continue";
            if (!canContinue) {
              action = page.getByRole("button", { name: "Next step" });
              if (!(await action.isVisible().catch(() => false))) action = page.getByRole("button", { name: "Next", exact: true });
              actionName = "Next";
            }
            const visible = await action.isVisible().catch(() => false);
            const enabled = visible && await action.isEnabled().catch(() => false);
            stairTransitionAcceptance.attempts.push({ before: text, action: actionName, visible, enabled });
            if (!visible || !enabled) break;
            await action.click();
            await page.waitForTimeout(260);
          }
          stairTransitionAcceptance.finalInstruction = await currentInstructionText();
          stairTransitionAcceptance.visibleButtons = await page.locator("button").evaluateAll((buttons) => buttons.filter((button) => button.getClientRects().length)
            .map((button) => ({ text: button.innerText.trim(), ariaLabel: button.getAttribute("aria-label"), disabled: button.disabled })).slice(-16));
          const continueStairs = page.getByRole("button", { name: /Continue through the active route transition|^Continue$/ }).first();
          if (await continueStairs.isVisible().catch(() => false) && await continueStairs.isEnabled().catch(() => false)) {
            stairTransitionAcceptance.transitionContinueAvailable = true;
            await continueStairs.click();
            stairTransitionAcceptance.transitionStatusObserved = await page.getByTestId("route-floor-transition-status").isVisible().catch(() => false);
            stairTransitionAcceptance.transitionStatusText = stairTransitionAcceptance.transitionStatusObserved
              ? await page.getByTestId("route-floor-transition-status").innerText().catch(() => null) : null;
          }
        }
        const beforeVideo = await page.evaluate(() => ({
          phase: document.querySelector('[data-testid="student-map-surface"]')?.getAttribute("data-route-phase"),
          instruction: [...document.querySelectorAll('[data-testid="current-route-instruction"], [data-testid="collapsed-current-instruction"], [data-testid="compact-current-route-instruction"]')].find((item) => item.getClientRects().length)?.textContent?.trim() ?? null,
          stepText: [...document.querySelectorAll('[data-testid="current-route-instruction"], [data-testid="collapsed-current-instruction"], [data-testid="compact-current-route-instruction"]')].find((item) => item.getClientRects().length)?.parentElement?.innerText.match(/Step \d+ of \d+/i)?.[0] ?? null,
          floor: document.querySelector('button[aria-label^="Choose floor. Current floor:"]')?.getAttribute("aria-label") ?? null,
          paused: Boolean(document.querySelector('button[aria-label="Resume navigation"]')),
        }));
        const watch = page.getByTestId("route-watch-emergency-video");
        await watch.waitFor({ state: "visible", timeout: 10000 });
        await watch.click();
        const overlay = page.getByTestId("student-emergency-video-overlay");
        await overlay.waitFor({ state: "visible", timeout: 10000 });
        const overlayVideo = overlay.locator("video");
        await overlayVideo.waitFor({ state: "attached" });
        await page.waitForTimeout(900);
        const duringVideo = await page.evaluate(() => ({
          phase: document.querySelector('[data-testid="student-map-surface"]')?.getAttribute("data-route-phase"),
          instruction: [...document.querySelectorAll('[data-testid="current-route-instruction"], [data-testid="collapsed-current-instruction"], [data-testid="compact-current-route-instruction"]')].find((item) => item.getClientRects().length)?.textContent?.trim() ?? null,
          stepText: [...document.querySelectorAll('[data-testid="current-route-instruction"], [data-testid="collapsed-current-instruction"], [data-testid="compact-current-route-instruction"]')].find((item) => item.getClientRects().length)?.parentElement?.innerText.match(/Step \d+ of \d+/i)?.[0] ?? null,
          floor: document.querySelector('button[aria-label^="Choose floor. Current floor:"]')?.getAttribute("aria-label") ?? null,
          paused: Boolean(document.querySelector('button[aria-label="Resume navigation"]')),
        }));
        await page.waitForTimeout(900);
        const afterVideoQuietWindow = await page.evaluate(() => ({
          instruction: [...document.querySelectorAll('[data-testid="current-route-instruction"], [data-testid="collapsed-current-instruction"], [data-testid="compact-current-route-instruction"]')].find((item) => item.getClientRects().length)?.textContent?.trim() ?? null,
          stepText: [...document.querySelectorAll('[data-testid="current-route-instruction"], [data-testid="collapsed-current-instruction"], [data-testid="compact-current-route-instruction"]')].find((item) => item.getClientRects().length)?.parentElement?.innerText.match(/Step \d+ of \d+/i)?.[0] ?? null,
          floor: document.querySelector('button[aria-label^="Choose floor. Current floor:"]')?.getAttribute("aria-label") ?? null,
          paused: Boolean(document.querySelector('button[aria-label="Resume navigation"]')),
        }));
        await overlayVideo.evaluate((player) => player.play());
        await page.waitForFunction(() => {
          const player = document.querySelector('[data-testid="student-emergency-video-overlay"] video');
          return player && player.currentTime > 0.4 && !player.paused;
        }, null, { timeout: 8000 });
        const overlayShot = path.join(out, `student-map-video-${routeLabel.toLowerCase().replace(/ /g, "-")}-sos-paused-mobile-390.png`);
        await page.screenshot({ path: overlayShot, fullPage: false });
        results.screenshots.push(path.basename(overlayShot));
        await overlay.getByRole("button", { name: "Return to route" }).click();
        await overlay.waitFor({ state: "detached", timeout: 8000 });
        await page.waitForTimeout(300);
        const afterClose = await page.evaluate(() => ({
          phase: document.querySelector('[data-testid="student-map-surface"]')?.getAttribute("data-route-phase"),
          instruction: [...document.querySelectorAll('[data-testid="current-route-instruction"], [data-testid="collapsed-current-instruction"], [data-testid="compact-current-route-instruction"]')].find((item) => item.getClientRects().length)?.textContent?.trim() ?? null,
          stepText: [...document.querySelectorAll('[data-testid="current-route-instruction"], [data-testid="collapsed-current-instruction"], [data-testid="compact-current-route-instruction"]')].find((item) => item.getClientRects().length)?.parentElement?.innerText.match(/Step \d+ of \d+/i)?.[0] ?? null,
          floor: document.querySelector('button[aria-label^="Choose floor. Current floor:"]')?.getAttribute("aria-label") ?? null,
          paused: Boolean(document.querySelector('button[aria-label="Resume navigation"]')),
        }));
        const canResume = await page.getByRole("button", { name: "Resume navigation" }).isVisible().catch(() => false);
        const canContinue = await page.locator("button:visible").filter({ hasText: /^Continue$/ }).first().isEnabled().catch(() => false);
        if (canResume) await page.getByRole("button", { name: "Resume navigation" }).click();
        else if (canContinue) await page.locator("button:visible").filter({ hasText: /^Continue$/ }).first().click();
        const resumes = await page.getByRole("button", { name: "Pause navigation" }).isVisible().catch(() => false);
        const stableDuringVideo = duringVideo.instruction === afterVideoQuietWindow.instruction
          && duringVideo.stepText === afterVideoQuietWindow.stepText
          && duringVideo.floor === afterVideoQuietWindow.floor
          && duringVideo.paused && afterVideoQuietWindow.paused;
        const preservedAfterClose = afterVideoQuietWindow.instruction === afterClose.instruction
          && afterVideoQuietWindow.stepText === afterClose.stepText
          && afterVideoQuietWindow.floor === afterClose.floor
          && afterClose.paused;
        sosRoutes[routeLabel] = { beforeVideo, duringVideo, afterVideoQuietWindow, afterClose, stableDuringVideo, preservedAfterClose, explicitResumeWorked: resumes, videoPlayedInOverlay: true, stairTransitionAcceptance };
        await page.getByTestId("student-map-surface").screenshot({ path: path.join(out, `student-map-video-${routeLabel.toLowerCase().replace(/ /g, "-")}-route-desktop-1440.png`) }).catch(() => {});
      }
      results.sosRouteHandoff = sosRoutes;
      results.browserErrors = [...new Set(results.browserErrors)];
      fs.writeFileSync(path.join(out, "student-map-video-acceptance-browser-results.json"), JSON.stringify(results, null, 2));
      return;
    }

    if (process.env.AP_STATUS_ONLY === "1") {
      const scenario = process.env.AP_STATUS_SCENARIO;
      if (!scenario) throw new Error("AP_STATUS_SCENARIO is required for AP_STATUS_ONLY");
      currentStage = `Student SOS status: ${scenario}`;
      await page.setViewportSize({ width: 390, height: 844 });
      const search = page.getByRole("searchbox", { name: "Search campus map" });
      await search.click();
      await search.fill("CABA LECTURE HALL");
      await page.getByRole("option", { name: /CABA LECTURE HALL/i }).click();
      await page.getByRole("button", { name: "Start", exact: true }).click();
      await page.getByRole("button", { name: "SOS routing" }).click();
      const dialog = page.getByRole("dialog", { name: "Route planner" });
      await dialog.waitFor();
      const status = dialog.getByTestId("emergency-route-status");
      await status.waitFor({ state: "visible" });
      const statusState = await status.getAttribute("data-status");
      const statusText = (await status.innerText()).replace(/\s+/g, " ").trim();
      const findRoute = dialog.getByRole("button", { name: "Find Route", exact: true });
      const findRouteEnabled = await findRoute.isEnabled();
      const visibleText = (await dialog.innerText()).replace(/\s+/g, " ").trim();
      const technicalDiagnosticTerms = ["Pathway connection:", "Complete emergency-safe route:", "Emergency-safe egress:", "Admin review:"];
      const technicalDiagnosticsExposed = technicalDiagnosticTerms.filter((term) => visibleText.includes(term));
      const statusCount = await dialog.getByTestId("emergency-route-status").count();
      const unavailableCount = await dialog.getByRole("alert").count();
      const statusFile = path.join(out, `assembly-point-status-${scenario}-390.png`);
      await page.screenshot({ path: statusFile, fullPage: false });
      results.screenshots.push(path.basename(statusFile));
      const statusResult = {
        scenario,
        viewport: "390x844",
        statusState,
        statusText,
        statusCount,
        unavailableAlertCount: unavailableCount,
        findRouteEnabled,
        technicalDiagnosticsExposed,
        documentWidth: await page.evaluate(() => ({ viewport: innerWidth, scrollWidth: document.documentElement.scrollWidth })),
      };
      if (scenario === "disconnected") statusResult.expected = { state: "unavailable", copy: "No route reaches the assembly point.", findRouteEnabled: false };
      if (scenario === "unapproved" || scenario === "stale-point") statusResult.expected = { state: "unavailable", copy: "No approved assembly point for this building.", findRouteEnabled: false };
      if (scenario === "stale-route") statusResult.expected = { state: "review-required", copy: "Evacuation route needs review", findRouteEnabled: true };
      statusResult.expected.alertCount = statusResult.expected.state === "unavailable" ? 1 : 0;
      statusResult.expectationsMet = statusCount === 1
        && unavailableCount === statusResult.expected.alertCount
        && technicalDiagnosticsExposed.length === 0
        && (statusResult.expected?.state !== undefined ? statusState === statusResult.expected.state : true)
        && (statusResult.expected?.copy ? statusText.includes(statusResult.expected.copy) : true)
        && findRouteEnabled === statusResult.expected?.findRouteEnabled
        && statusResult.documentWidth.viewport === statusResult.documentWidth.scrollWidth;

      if (scenario === "stale-route" && findRouteEnabled) {
        currentStage = "calculate unapproved graph route preview for stale approval";
        await findRoute.click();
        await page.getByText(/Route ready from .* to TEST ONLY - Main Assembly Point A/i).waitFor();
        const previewStatus = page.getByTestId("emergency-route-status");
        statusResult.previewStatusState = await previewStatus.getAttribute("data-status");
        statusResult.previewStatusText = (await previewStatus.innerText()).replace(/\s+/g, " ").trim();
        statusResult.previewDestinationVisible = (await page.locator("body").innerText()).includes("TEST ONLY - Main Assembly Point A");
        const expandPreview = page.getByRole("button", { name: /Expand route panel|^Expand$/ }).first();
        statusResult.previewWasCollapsed = await expandPreview.isVisible().catch(() => false);
        if (statusResult.previewWasCollapsed) await expandPreview.click();
        const previewStart = page.getByRole("button", { name: "Start", exact: true }).last();
        statusResult.previewStartActionVisible = await previewStart.isVisible().catch(() => false);
        statusResult.previewStartDisabled = await previewStart.isDisabled().catch(() => false);
        const previewFile = path.join(out, `assembly-point-status-${scenario}-route-preview-390.png`);
        await page.screenshot({ path: previewFile, fullPage: false });
        results.screenshots.push(path.basename(previewFile));
        statusResult.expectationsMet = statusResult.expectationsMet
          && statusResult.previewStatusState === "review-required"
          && statusResult.previewDestinationVisible
          && statusResult.previewStartActionVisible
          && statusResult.previewStartDisabled;
      }
      results.statusScenario = statusResult;
      return;
    }

    if (process.env.AP_FOLLOW_OUTDOOR_ONLY === "1") {
      currentStage = "CABA Route B Follow through the outdoor Assembly Point leg";
      await page.setViewportSize({ width: 390, height: 844 });
      const search = page.getByRole("searchbox", { name: "Search campus map" });
      await search.click();
      await search.fill("CABA LECTURE HALL");
      await page.getByRole("option", { name: /CABA LECTURE HALL/i }).click();
      await page.getByRole("button", { name: "Start", exact: true }).click();
      await page.getByRole("button", { name: "SOS routing" }).click();
      await page.getByRole("button", { name: "Find Route", exact: true }).click();
      await page.getByRole("button", { name: "Both Routes", exact: true }).waitFor();
      await page.getByRole("button").filter({ hasText: /^Route B/ }).first().click();
      const expandPreview = page.getByRole("button", { name: /Expand route panel|^Expand$/ }).first();
      if (await expandPreview.isVisible().catch(() => false)) await expandPreview.click();
      await page.getByRole("button", { name: "Start", exact: true }).last().click();
      await page.waitForFunction(() => document.querySelector('[data-testid="student-map-surface"]')?.getAttribute("data-route-phase") === "navigating", null, { timeout: 12000 });
      const expandActive = page.getByRole("button", { name: /Expand navigation panel|Expand route panel|^Expand$/ }).first();
      if (await expandActive.isVisible().catch(() => false)) await expandActive.click();
      await page.getByTestId("guided-route-steps").waitFor({ state: "visible" });
      await page.evaluate(() => {
        const state = { pauseClicks: 0, pausedAtStep: null };
        const check = () => {
          const instruction = [...document.querySelectorAll('[data-testid="current-route-instruction"], [data-testid="collapsed-current-instruction"], [data-testid="compact-current-instruction"]')]
            .find((item) => item.getClientRects().length > 0);
          const panelText = instruction?.parentElement?.innerText ?? instruction?.innerText ?? "";
          if (!/STEP\s+10\s+OF|Follow the path toward TEST ONLY - Main Assembly Point A/i.test(panelText)) return;
          const button = [...document.querySelectorAll('button[aria-label="Pause navigation"]')]
            .find((candidate) => candidate.getClientRects().length > 0 && !candidate.disabled);
          if (!button) return;
          state.pauseClicks += 1;
          state.pausedAtStep = panelText;
          button.click();
        };
        const observer = new MutationObserver(check);
        observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
        const timer = window.setInterval(check, 10);
        window.__assemblyOutdoorFollowPause = state;
        window.__assemblyOutdoorFollowPauseObserver = observer;
        window.__assemblyOutdoorFollowPauseTimer = timer;
        check();
      });
      const followMode = page.getByRole("button", { name: /Return to Follow mode|Switch to Follow mode/ }).first();
      if (await followMode.isVisible().catch(() => false)) await followMode.click();
      const readFollowProgress = async () => page.evaluate(() => {
        const surface = document.querySelector('[data-testid="student-map-surface"]');
        const instruction = [...document.querySelectorAll('[data-testid="current-route-instruction"], [data-testid="collapsed-current-instruction"], [data-testid="compact-current-route-instruction"]')]
          .find((item) => item.getClientRects().length > 0);
        const panelText = instruction?.parentElement?.innerText ?? instruction?.innerText ?? "";
        return {
          phase: surface?.getAttribute("data-route-phase") ?? null,
          floor: document.querySelector('button[aria-label^="Choose floor. Current floor:"]')?.getAttribute("aria-label") ?? null,
          step: panelText.match(/STEP (\d+) OF (\d+)/i)?.[0] ?? panelText.match(/Step (\d+) of (\d+)/i)?.[0] ?? null,
          instruction: instruction?.textContent?.trim() ?? null,
          held: [...document.querySelectorAll('button[aria-label="Resume navigation"]')].some((button) => button.getClientRects().length > 0),
        };
      });
      const deadline = Date.now() + 45000;
      const actions = [];
      while (Date.now() < deadline) {
        const progress = await readFollowProgress();
        const stepNumber = Number(progress.step?.match(/STEP (\d+) OF|Step (\d+) of/i)?.[1] ?? progress.step?.match(/STEP (\d+) OF|Step (\d+) of/i)?.[2] ?? 0);
        if (progress.phase === "arrived" || progress.phase !== "navigating") break;
        if (stepNumber === 10 && progress.held) break;
        const continueAction = page.getByRole("button", { name: "Continue through the active route transition" });
        const textContinue = page.getByRole("button", { name: "Continue", exact: true });
        const action = await continueAction.isVisible().catch(() => false) && await continueAction.isEnabled().catch(() => false)
          ? continueAction
          : await textContinue.isVisible().catch(() => false) && await textContinue.isEnabled().catch(() => false) ? textContinue : null;
        if (action) {
          actions.push({ action: "Continue", from: progress });
          await action.click();
          await page.waitForTimeout(40);
        } else {
          await page.waitForTimeout(60);
        }
      }
      results.followOutdoor = { viewport: "390x844", actions, progress: await readFollowProgress(), pauseDriver: await page.evaluate(() => window.__assemblyOutdoorFollowPause) };
      if (results.followOutdoor.progress.step !== "STEP 10 OF 11" || !results.followOutdoor.progress.held) {
        results.followOutdoor.reachedActiveOutdoorPause = false;
        results.followOutdoor.routePhase = await page.getByTestId("student-map-surface").getAttribute("data-route-phase");
        results.followOutdoor.visibleButtons = await page.locator("button:visible").evaluateAll((buttons) => buttons.map((button) => ({ text: button.innerText.trim(), ariaLabel: button.getAttribute("aria-label"), disabled: button.disabled })));
        const failed = path.join(out, "assembly-point-caba-follow-outdoor-not-paused-mobile-390.png");
        await page.screenshot({ path: failed, fullPage: false });
        results.screenshots.push(path.basename(failed));
        await page.evaluate(() => { window.__assemblyOutdoorFollowPauseObserver?.disconnect(); window.clearInterval(window.__assemblyOutdoorFollowPauseTimer); });
        return;
      }
      results.followOutdoor.reachedActiveOutdoorPause = true;
      const readMarker2d = async () => page.evaluate(() => {
        const surface = document.querySelector('[data-testid="student-map-surface"]');
        const marker = document.querySelector('[data-testid="student-emergency-assembly-point"]');
        const rect = marker?.getBoundingClientRect();
        const transform = marker?.getAttribute("transform") ?? "";
        const world = transform.match(/translate\(([-\d.]+),([\d.]+)\)/);
        const lineCount = [...document.querySelectorAll('polyline[data-testid="route-outer-casing"]')].filter((line) => {
          const endpoint = line.getAttribute("points")?.trim().split(/\s+/).at(-1)?.split(",").map(Number) ?? [];
          return world && Number(endpoint[0]) === Number(world[1]) && Number(endpoint[1]) === Number(world[2]);
        }).length;
        return { phase: surface?.getAttribute("data-route-phase"), step: document.querySelector('[data-testid="current-route-instruction"]')?.parentElement?.innerText.match(/STEP (\d+) OF (\d+)/i)?.[0] ?? null, markerVisible: Boolean(rect && rect.width > 0 && rect.height > 0), world: world ? { x: Number(world[1]), y: Number(world[2]) } : null, matchingRouteLineCount: lineCount, rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null };
      });
      results.followOutdoor.marker2d = await readMarker2d();
      const screenshot2d = path.join(out, "assembly-point-caba-follow-outdoor-2d-mobile-390.png");
      await page.screenshot({ path: screenshot2d, fullPage: false });
      results.screenshots.push(path.basename(screenshot2d));
      await page.getByRole("button", { name: "Switch to 3D view" }).click();
      await page.getByTestId("student-3d-emergency-assembly-point").waitFor({ state: "visible", timeout: 12000 });
      await page.waitForFunction(() => [...document.querySelectorAll("canvas")].some((canvas) => { const rect = canvas.getBoundingClientRect(); return rect.width > 100 && rect.height > 100; }), null, { timeout: 10000 });
      await page.waitForTimeout(500);
      results.followOutdoor.progress3d = await readFollowProgress();
      results.followOutdoor.marker3d = await page.getByTestId("student-3d-emergency-assembly-point").evaluate((marker) => {
        const rect = marker.getBoundingClientRect();
        const panel = [...document.querySelectorAll('[data-testid="route-planner-dialog"], [data-testid="collapsed-route-card"], [data-testid="mobile-active-route-dock"]')]
          .find((element) => { const box = element.getBoundingClientRect(); const style = getComputedStyle(element); return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0.05 && box.width > 0 && box.height > 0; })
          ?.getBoundingClientRect();
        return { visible: rect.width > 0 && rect.height > 0, title: marker.getAttribute("title"), rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, panelOverlap: Boolean(panel && rect.left < panel.right && rect.right > panel.left && rect.top < panel.bottom && rect.bottom > panel.top) };
      });
      const screenshot3d = path.join(out, "assembly-point-caba-follow-outdoor-3d-mobile-390.png");
      await page.screenshot({ path: screenshot3d, fullPage: false });
      results.screenshots.push(path.basename(screenshot3d));
      await page.getByRole("button", { name: "Switch to 2D view" }).click();
      await page.getByRole("button", { name: "Switch to 3D view" }).waitFor({ state: "visible", timeout: 12000 });
      results.followOutdoor.progress2dReturn = await readFollowProgress();
      results.followOutdoor.progressPreserved = [results.followOutdoor.progress, results.followOutdoor.progress3d, results.followOutdoor.progress2dReturn]
        .every((state) => state.phase === "navigating" && state.step === "STEP 10 OF 11" && state.instruction === results.followOutdoor.progress.instruction);
      const screenshot2dReturn = path.join(out, "assembly-point-caba-follow-outdoor-return-2d-mobile-390.png");
      await page.screenshot({ path: screenshot2dReturn, fullPage: false });
      results.screenshots.push(path.basename(screenshot2dReturn));
      await page.evaluate(() => { window.__assemblyOutdoorFollowPauseObserver?.disconnect(); window.clearInterval(window.__assemblyOutdoorFollowPauseTimer); });
      await page.getByRole("button", { name: "Resume navigation" }).click();
      // Let the real Follow playback resume first. The outdoor leg is long,
      // and may remain on its current instruction while moving along the
      // authored path. If it has not naturally reached the final step within
      // this bounded interval, use the visible Next control to complete the
      // last authored instruction through the normal navigation UI.
      await page.waitForTimeout(1200);
      results.followOutdoor.progressAfterResume = await readFollowProgress();
      if (results.followOutdoor.progressAfterResume.phase !== "arrived") {
        const nextStep = page.getByRole("button", { name: "Next", exact: true });
        await nextStep.waitFor({ state: "visible", timeout: 5000 });
        if (await nextStep.isEnabled()) {
          results.followOutdoor.finalStepAction = "Next";
          await nextStep.click();
        }
      }
      await page.waitForFunction(() => document.querySelector('[data-testid="student-map-surface"]')?.getAttribute("data-route-phase") === "arrived", null, { timeout: 15000 });
      await page.waitForTimeout(700);
      results.followOutdoor.arrival = await page.evaluate(() => {
        const surface = document.querySelector('[data-testid="student-map-surface"]');
        const title = document.querySelector('[data-testid="route-arrival-title"], [data-testid="mobile-route-arrival-compact"] p');
        const card = document.querySelector('[data-testid="route-arrival-state"], [data-testid="mobile-route-arrival-compact"]');
        return {
          phase: surface?.getAttribute("data-route-phase"),
          title: title?.textContent?.trim() ?? null,
          cardText: card?.textContent?.trim() ?? null,
          cameraContext: surface?.getAttribute("data-arrival-camera-context"),
          cameraTarget: { x: Number(surface?.getAttribute("data-arrival-camera-x")), y: Number(surface?.getAttribute("data-arrival-camera-y")) },
          playbackStopped: ![...document.querySelectorAll('button[aria-label="Pause navigation"]')].some((button) => button.getClientRects().length > 0),
        };
      });
      const arrivalScreenshot = path.join(out, "assembly-point-caba-route-b-arrival-after-renderer-roundtrip-mobile-390.png");
      await page.screenshot({ path: arrivalScreenshot, fullPage: false });
      results.screenshots.push(path.basename(arrivalScreenshot));
      return;
    }

    if (process.env.AP_RENDERER_ROUNDTRIP_ONLY === "1") {
      currentStage = "CABA SOS active route, 2D to 3D to 2D";
      await page.setViewportSize({ width: 390, height: 844 });
      const search = page.getByRole("searchbox", { name: "Search campus map" });
      await search.click();
      await search.fill("CABA LECTURE HALL");
      await page.getByRole("option", { name: /CABA LECTURE HALL/i }).click();
      await page.getByRole("button", { name: "Start", exact: true }).click();
      await page.getByRole("button", { name: "SOS routing" }).click();
      await page.getByRole("button", { name: "Find Route", exact: true }).click();
      await page.getByRole("button", { name: "Both Routes", exact: true }).waitFor();
      const rendererRouteLabel = process.env.AP_ARRIVAL_ROUTE === "B" ? "Route B" : "Route A";
      await page.getByRole("button").filter({ hasText: new RegExp(`^${rendererRouteLabel}`) }).first().click();
      const expandRoutePreview = page.getByRole("button", { name: /Expand route panel|^Expand$/ }).first();
      if (await expandRoutePreview.isVisible().catch(() => false)) await expandRoutePreview.click();
      await page.getByRole("button", { name: "Start", exact: true }).last().click();
      const mapSurface = page.getByTestId("student-map-surface");
      await page.waitForFunction(() => document.querySelector('[data-testid="student-map-surface"]')?.getAttribute("data-route-phase") === "navigating", null, { timeout: 12000 });
      const followMode = page.getByRole("button", { name: /Return to Follow|Switch to Follow mode/ }).first();
      if (await followMode.isVisible().catch(() => false)) await followMode.click();
      const expandNavigation = page.getByRole("button", { name: /Expand navigation panel|Expand route panel|^Expand$/ }).first();
      if (await expandNavigation.isVisible().catch(() => false)) await expandNavigation.click();
      // A route may start on a stair transition, where Pause is temporarily
      // replaced by Continue. Observe for the first visible Pause control and
      // click that real control immediately so the short outdoor leg cannot
      // auto-complete while the renderer is inspected.
      await page.evaluate(() => {
        const state = { clicked: false, count: 0, at: null, lastClickAt: 0 };
        const observer = new MutationObserver(() => {
          const button = [...document.querySelectorAll('button[aria-label="Pause navigation"]')]
            .find((candidate) => candidate.getClientRects().length > 0 && !candidate.disabled);
          if (!button) return;
          if (Date.now() - state.lastClickAt < 300) return;
          state.clicked = true;
          state.count += 1;
          state.lastClickAt = Date.now();
          state.at = [...document.querySelectorAll('[data-testid="current-route-instruction"], [data-testid="collapsed-current-instruction"], [data-testid="compact-current-route-instruction"]')]
            .find((item) => item.getClientRects().length > 0)?.parentElement?.innerText ?? null;
          button.click();
        });
        window.__assemblyImmediatePause = state;
        window.__assemblyImmediatePauseObserver = observer;
        observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
        window.__assemblyImmediatePauseTimer = window.setInterval(() => {
          const button = [...document.querySelectorAll('button[aria-label="Pause navigation"]')]
            .find((candidate) => candidate.getClientRects().length > 0 && !candidate.disabled);
          if (!button || Date.now() - state.lastClickAt < 300) return;
          state.clicked = true;
          state.count += 1;
          state.lastClickAt = Date.now();
          state.at = [...document.querySelectorAll('[data-testid="current-route-instruction"], [data-testid="collapsed-current-instruction"], [data-testid="compact-current-instruction"]')]
            .find((item) => item.getClientRects().length > 0)?.parentElement?.innerText ?? null;
          button.click();
        }, 20);
        observer.takeRecords();
        const button = [...document.querySelectorAll('button[aria-label="Pause navigation"]')]
          .find((candidate) => candidate.getClientRects().length > 0 && !candidate.disabled);
        if (button) { state.clicked = true; state.count = 1; state.lastClickAt = Date.now(); button.click(); }
      });
      const initialContinue = page.getByRole("button", { name: "Continue through the active route transition" });
      const initialVisibleContinue = await initialContinue.isVisible().catch(() => false)
        ? initialContinue
        : page.getByRole("button", { name: "Continue", exact: true });
      if (await initialVisibleContinue.isVisible().catch(() => false) && await initialVisibleContinue.isEnabled().catch(() => false)) await initialVisibleContinue.click();
      await page.getByRole("button", { name: "Resume navigation" }).waitFor({ state: "visible", timeout: 8000 });
      const currentInstruction = page.locator('[data-testid="current-route-instruction"]:visible, [data-testid="collapsed-current-instruction"]:visible, [data-testid="compact-current-route-instruction"]:visible').first();
      await currentInstruction.waitFor({ timeout: 8000 });
      const readProgress = async () => page.evaluate(() => {
        const surface = document.querySelector('[data-testid="student-map-surface"]');
        const instruction = [...document.querySelectorAll('[data-testid="current-route-instruction"], [data-testid="collapsed-current-instruction"], [data-testid="compact-current-route-instruction"]')].find((item) => item.getClientRects().length);
        const panelText = instruction?.parentElement?.innerText ?? instruction?.innerText ?? "";
        const floor = document.querySelector('button[aria-label^="Choose floor. Current floor:"]')?.getAttribute("aria-label") ?? null;
        return {
          phase: surface?.getAttribute("data-route-phase") ?? null,
          floor,
          instruction: instruction?.textContent?.trim() ?? null,
          step: panelText.match(/Step (\d+) of (\d+)/i)?.[0] ?? null,
          held: Boolean([...document.querySelectorAll('button[aria-label="Resume navigation"], button[aria-label="Continue through the active route transition"]')].find((button) => button.getClientRects().length)),
        };
      });
      await page.evaluate(() => {
        const state = { triggered: false, step: null, reason: "waiting for outdoor leg" };
        const pauseOnOutdoorLeg = () => {
          if (state.triggered || document.querySelector('[data-testid="student-map-surface"]')?.getAttribute("data-route-phase") !== "navigating") return;
          const instruction = [...document.querySelectorAll('[data-testid="current-route-instruction"], [data-testid="collapsed-current-instruction"], [data-testid="compact-current-route-instruction"]')]
            .find((item) => item.getClientRects().length);
          const panelText = instruction?.parentElement?.innerText ?? instruction?.innerText ?? "";
          if (!/STEP 10 OF/i.test(panelText)) return;
          state.step = panelText.match(/STEP 10 OF \d+/i)?.[0] ?? "STEP 10";
          state.triggered = true;
          state.reason = "detected the outdoor leg; Playwright will click the visible Pause navigation control";
        };
        const observer = new MutationObserver(pauseOnOutdoorLeg);
        observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
        window.__assemblyOutdoorPause = state;
        window.__assemblyOutdoorPauseObserver = observer;
        pauseOnOutdoorLeg();
      });
      results.roundtrip = { viewport: "390x844", initial: await readProgress(), pauseAtStart: await page.evaluate(() => window.__assemblyImmediatePause), screenshots: [] };
      const initialImage = path.join(out, "assembly-point-caba-active-roundtrip-2d-mobile-390.png");
      await page.screenshot({ path: initialImage, fullPage: false });
      results.screenshots.push(path.basename(initialImage));
      results.roundtrip.screenshots.push(path.basename(initialImage));

      const switch3d = page.getByRole("button", { name: "Switch to 3D view" });
      await switch3d.waitFor({ state: "visible", timeout: 8000 });
      await switch3d.click();
      await page.getByRole("button", { name: "Switch to 2D view" }).waitFor({ state: "visible", timeout: 12000 });
      await page.waitForFunction(() => [...document.querySelectorAll("canvas")].some((canvas) => { const rect = canvas.getBoundingClientRect(); return rect.width > 100 && rect.height > 100; }), null, { timeout: 10000 }).catch(() => false);
      await page.waitForTimeout(2200);
      results.roundtrip.after3d = await readProgress();
      results.roundtrip.canvasVisible = await page.locator("canvas").evaluateAll((canvases) => canvases.some((canvas) => {
        const rect = canvas.getBoundingClientRect(); return rect.width > 100 && rect.height > 100;
      }));
      const threeDImage = path.join(out, "assembly-point-caba-active-roundtrip-3d-mobile-390.png");
      await page.screenshot({ path: threeDImage, fullPage: false });
      results.screenshots.push(path.basename(threeDImage));
      results.roundtrip.screenshots.push(path.basename(threeDImage));

      await page.getByRole("button", { name: "Switch to 2D view" }).click();
      await page.getByRole("button", { name: "Switch to 3D view" }).waitFor({ state: "visible", timeout: 12000 });
      results.roundtrip.after2d = await readProgress();
      const returnedImage = path.join(out, "assembly-point-caba-active-roundtrip-return-2d-mobile-390.png");
      await page.screenshot({ path: returnedImage, fullPage: false });
      results.screenshots.push(path.basename(returnedImage));
      results.roundtrip.screenshots.push(path.basename(returnedImage));
      results.roundtrip.progressPreserved = [results.roundtrip.after3d, results.roundtrip.after2d].every((state) =>
        state.phase === results.roundtrip.initial.phase
        && state.floor === results.roundtrip.initial.floor
        && state.instruction === results.roundtrip.initial.instruction
        && state.step === results.roundtrip.initial.step,
      );
      results.roundtrip.returnedTo2d = true;
      results.roundtrip.routeStillActive = results.roundtrip.after2d.phase === "navigating";
      results.roundtrip.outdoorStaging = { actions: [] };
      const campusDeadline = Date.now() + 90000;
      for (let attempt = 0; attempt < 16 && Date.now() < campusDeadline; attempt += 1) {
        const automaticPause = await page.evaluate(() => window.__assemblyOutdoorPause?.triggered === true);
        if (automaticPause) {
          const pauseAtOutdoor = page.locator('button:visible[aria-label="Pause navigation"]').first();
          if (await pauseAtOutdoor.isVisible().catch(() => false) && await pauseAtOutdoor.isEnabled().catch(() => false)) {
            await pauseAtOutdoor.click({ timeout: 1500 });
          } else {
            results.roundtrip.outdoorStaging.pauseUnavailableAtOutdoor = {
              ...(await readProgress()),
              buttons: await page.locator("button:visible").evaluateAll((buttons) => buttons.map((button) => ({ text: button.innerText.trim(), ariaLabel: button.getAttribute("aria-label"), disabled: button.disabled }))),
            };
          }
          await page.getByRole("button", { name: "Resume navigation" }).waitFor({ state: "visible", timeout: 5000 });
          results.roundtrip.outdoorStaging.actions.push({ action: "Pause at outdoor Assembly Point leg", ...(await page.evaluate(() => window.__assemblyOutdoorPause)) });
          break;
        }
        const activeProgress = await readProgress();
        const activeStep = Number(activeProgress.step?.match(/STEP (\d+) OF/i)?.[1] ?? 0);
        if (activeProgress.phase === "navigating" && activeStep >= 10) {
          const alreadyPaused = await page.getByRole("button", { name: "Resume navigation" }).isVisible().catch(() => false);
          if (alreadyPaused) {
            results.roundtrip.outdoorStaging.actions.push({ action: "Hold at outdoor Assembly Point leg", step: activeProgress.step, via: "visible Pause navigation control" });
            break;
          }
          const pauseAtOutdoor = page.getByRole("button", { name: "Pause navigation" });
          if (await pauseAtOutdoor.isVisible().catch(() => false) && await pauseAtOutdoor.isEnabled().catch(() => false)) {
            await pauseAtOutdoor.click();
            await page.getByRole("button", { name: "Resume navigation" }).waitFor({ state: "visible", timeout: 5000 });
            results.roundtrip.outdoorStaging.actions.push({ action: "Pause at outdoor Assembly Point leg", step: activeProgress.step });
            break;
          }
          results.roundtrip.outdoorStaging.pauseUnavailableAtOutdoor = activeProgress;
        }
        if (activeProgress.phase === "arrived") break;
        const before = await readProgress();
        const continueAction = page.locator("button:visible").filter({ hasText: /^Continue$/ }).first();
        const nextAction = page.getByRole("button", { name: "Next step" });
        const collapsedNextAction = page.getByRole("button", { name: "Next", exact: true });
        const action = await continueAction.isVisible().catch(() => false) && await continueAction.isEnabled().catch(() => false)
          ? continueAction
          : await nextAction.isVisible().catch(() => false) && await nextAction.isEnabled().catch(() => false) ? nextAction
            : await collapsedNextAction.isVisible().catch(() => false) && await collapsedNextAction.isEnabled().catch(() => false) ? collapsedNextAction : null;
        if (!action) {
          const pausePlayback = page.getByRole("button", { name: "Pause navigation" });
          if (await pausePlayback.isVisible().catch(() => false) && await pausePlayback.isEnabled().catch(() => false)) {
            const autoTransitionProgressed = await page.waitForFunction((previous) => {
              if (document.querySelector('[data-testid="student-emergency-assembly-point"]')?.getClientRects().length) return true;
              if (document.querySelector('[data-testid="student-map-surface"]')?.getAttribute("data-route-phase") === "arrived") return true;
              const instruction = [...document.querySelectorAll('[data-testid="current-route-instruction"], [data-testid="collapsed-current-instruction"], [data-testid="compact-current-route-instruction"]')].find((item) => item.getClientRects().length);
              const panelText = instruction?.parentElement?.innerText ?? instruction?.innerText ?? "";
              const step = panelText.match(/Step (\d+) of (\d+)/i)?.[0] ?? null;
              const floor = document.querySelector('button[aria-label^="Choose floor. Current floor:"]')?.getAttribute("aria-label") ?? null;
              return step !== previous.step || floor !== previous.floor;
            }, before, { timeout: 8000 }).then(() => true).catch(() => false);
            results.roundtrip.outdoorStaging.actions.push({ action: "Wait for active route progression", from: before, progressed: autoTransitionProgressed });
            if (autoTransitionProgressed) continue;
          }
          results.roundtrip.outdoorStaging.blockedAt = before;
          results.roundtrip.outdoorStaging.visibleButtons = await page.locator("button").evaluateAll((buttons) => buttons
            .filter((button) => button.getClientRects().length)
            .map((button) => ({ text: button.innerText.trim(), ariaLabel: button.getAttribute("aria-label"), disabled: button.disabled })));
          const blockedFile = path.join(out, "assembly-point-caba-active-outdoor-staging-blocked-mobile-390.png");
          await page.screenshot({ path: blockedFile, fullPage: false });
          results.screenshots.push(path.basename(blockedFile));
          break;
        }
        results.roundtrip.outdoorStaging.actions.push({ action: action === continueAction ? "Continue transition" : action === nextAction ? "Next step" : "Next", from: before });
        await action.click();
        await page.waitForFunction((previous) => {
          if (document.querySelector('[data-testid="student-emergency-assembly-point"]')?.getClientRects().length) return true;
          if (document.querySelector('[data-testid="student-map-surface"]')?.getAttribute("data-route-phase") === "arrived") return true;
          const instruction = [...document.querySelectorAll('[data-testid="current-route-instruction"], [data-testid="collapsed-current-instruction"], [data-testid="compact-current-route-instruction"]')].find((item) => item.getClientRects().length);
          const panelText = instruction?.parentElement?.innerText ?? instruction?.innerText ?? "";
          const step = panelText.match(/Step (\d+) of (\d+)/i)?.[0] ?? null;
          const floor = document.querySelector('button[aria-label^="Choose floor. Current floor:"]')?.getAttribute("aria-label") ?? null;
          return step !== previous.step || floor !== previous.floor;
        }, before, { timeout: 8000 });
      }
      results.roundtrip.outdoorStaging.progress = await readProgress();
      results.roundtrip.outdoorStaging.routePhase = await mapSurface.getAttribute("data-route-phase");
      results.roundtrip.outdoorStaging.marker2d = await page.evaluate(() => {
        const marker = document.querySelector('[data-testid="student-emergency-assembly-point"]');
        if (!marker) return { visible: false };
        const markerTransform = marker.getAttribute("transform") ?? "";
        const match = markerTransform.match(/translate\(([-\d.]+),([\d.]+)\)/);
        const world = match ? { x: Number(match[1]), y: Number(match[2]) } : null;
        const matchingRouteLineCount = [...document.querySelectorAll('polyline[data-testid="route-outer-casing"]')].filter((line) => {
          const points = line.getAttribute("points")?.trim().split(/\s+/) ?? [];
          const endpoint = points.at(-1)?.split(",").map(Number) ?? [];
          return world && endpoint[0] === world.x && endpoint[1] === world.y;
        }).length;
        const rect = marker.getBoundingClientRect();
        return { visible: rect.width > 0 && rect.height > 0, id: marker.getAttribute("data-assembly-point-id"), world, matchingRouteLineCount, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
      });
      results.roundtrip.outdoorStaging.markerVisible = results.roundtrip.outdoorStaging.marker2d.visible === true;
      if (results.roundtrip.outdoorStaging.markerVisible) {
        const outdoorFile = path.join(out, "assembly-point-caba-active-outdoor-2d-mobile-390.png");
        await page.screenshot({ path: outdoorFile, fullPage: false });
        results.screenshots.push(path.basename(outdoorFile));
        results.roundtrip.screenshots.push(path.basename(outdoorFile));
        const outdoorPause = page.getByRole("button", { name: "Pause navigation" });
        if (await outdoorPause.isVisible().catch(() => false)) {
          await outdoorPause.click();
          await page.getByRole("button", { name: "Resume navigation" }).waitFor({ state: "visible", timeout: 5000 }).catch(() => undefined);
        }
        results.roundtrip.outdoorStaging.pausedOrHeld = await page.getByRole("button", { name: "Resume navigation" }).isVisible().catch(() => false)
          || await page.getByRole("button", { name: /Continue through the active route transition|^Continue$/ }).first().isVisible().catch(() => false);
        const activeOutdoorBefore3d = await readProgress();
        await page.getByRole("button", { name: "Switch to 3D view" }).click();
        await page.getByRole("button", { name: "Switch to 2D view" }).waitFor({ state: "visible", timeout: 12000 });
        await page.getByTestId("student-3d-emergency-assembly-point").waitFor({ state: "visible", timeout: 12000 });
        await page.waitForFunction(() => [...document.querySelectorAll("canvas")].some((canvas) => { const rect = canvas.getBoundingClientRect(); return rect.width > 100 && rect.height > 100; }), null, { timeout: 10000 }).catch(() => false);
        results.roundtrip.outdoorStaging.after3d = await readProgress();
        results.roundtrip.outdoorStaging.marker3d = await page.getByTestId("student-3d-emergency-assembly-point").evaluate((marker) => {
          const rect = marker.getBoundingClientRect();
          const panel = document.querySelector('[data-testid="route-planner-dialog"]')?.getBoundingClientRect();
          return { visible: rect.width > 0 && rect.height > 0, id: marker.getAttribute("data-assembly-point-id"), title: marker.getAttribute("title"), rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, panelOverlap: Boolean(panel && rect.left < panel.right && rect.right > panel.left && rect.top < panel.bottom && rect.bottom > panel.top) };
        }).catch(() => null);
        results.roundtrip.outdoorStaging.canvasVisible = await page.locator("canvas").evaluateAll((canvases) => canvases.some((canvas) => { const rect = canvas.getBoundingClientRect(); return rect.width > 100 && rect.height > 100; }));
        const outdoor3dFile = path.join(out, "assembly-point-caba-active-outdoor-3d-mobile-390.png");
        await page.screenshot({ path: outdoor3dFile, fullPage: false });
        results.screenshots.push(path.basename(outdoor3dFile));
        results.roundtrip.screenshots.push(path.basename(outdoor3dFile));
        await page.getByRole("button", { name: "Switch to 2D view" }).click();
        await page.getByRole("button", { name: "Switch to 3D view" }).waitFor({ state: "visible", timeout: 12000 });
        results.roundtrip.outdoorStaging.afterReturn2d = await readProgress();
        results.roundtrip.outdoorStaging.progressPreserved = [results.roundtrip.outdoorStaging.after3d, results.roundtrip.outdoorStaging.afterReturn2d].every((state) =>
          state.phase === activeOutdoorBefore3d.phase && state.floor === activeOutdoorBefore3d.floor
          && state.instruction === activeOutdoorBefore3d.instruction && state.step === activeOutdoorBefore3d.step,
        );
        results.roundtrip.outdoorStaging.markerVisibleAfterReturn2d = await page.getByTestId("student-emergency-assembly-point").isVisible().catch(() => false);
        const outdoorReturnFile = path.join(out, "assembly-point-caba-active-outdoor-return-2d-mobile-390.png");
        await page.screenshot({ path: outdoorReturnFile, fullPage: false });
        results.screenshots.push(path.basename(outdoorReturnFile));
        results.roundtrip.screenshots.push(path.basename(outdoorReturnFile));
      }
      await page.evaluate(() => { window.__assemblyImmediatePauseObserver?.disconnect(); window.clearInterval(window.__assemblyImmediatePauseTimer); });
      results.roundtrip.noBrowserErrors = results.browserErrors.length === 0;
      return;
    }

    if (process.env.AP_EXPLORE_OUTDOOR_ONLY === "1") {
      currentStage = "CABA Route B outdoor destination in Explore, 2D/3D/2D";
      await page.setViewportSize({ width: 390, height: 844 });
      const search = page.getByRole("searchbox", { name: "Search campus map" });
      await search.click();
      await search.fill("CABA LECTURE HALL");
      await page.getByRole("option", { name: /CABA LECTURE HALL/i }).click();
      await page.getByRole("button", { name: "Start", exact: true }).click();
      await page.getByRole("button", { name: "SOS routing" }).click();
      await page.getByRole("button", { name: "Find Route", exact: true }).click();
      await page.getByRole("button", { name: "Both Routes", exact: true }).waitFor();
      await page.getByRole("button").filter({ hasText: /^Route B/ }).first().click();
      const expandPreview = page.getByRole("button", { name: /Expand route panel|^Expand$/ }).first();
      if (await expandPreview.isVisible().catch(() => false)) await expandPreview.click();
      await page.getByRole("button", { name: "Start", exact: true }).last().click();
      await page.waitForFunction(() => document.querySelector('[data-testid="student-map-surface"]')?.getAttribute("data-route-phase") === "navigating", null, { timeout: 12000 });
      const expandActive = page.getByRole("button", { name: /Expand navigation panel|Expand route panel|^Expand$/ }).first();
      if (await expandActive.isVisible().catch(() => false)) await expandActive.click();
      await page.getByTestId("guided-route-steps").waitFor({ state: "visible" });
      const outdoorStep = page.locator('[data-testid^="explore-instruction-"]').filter({ hasText: /Follow the path toward TEST ONLY - Main Assembly Point A/i }).first();
      await outdoorStep.waitFor({ state: "visible" });
      await outdoorStep.click();
      await page.getByTestId("explore-inspected-step").waitFor({ state: "visible" });
      results.activeOutdoorExplore = { viewport: "390x844", inspectedStepBeforeCollapse: await page.getByTestId("explore-inspected-step").innerText() };
      await page.waitForFunction(() => document.querySelector('[data-testid="student-emergency-assembly-point"]')?.getClientRects().length > 0, null, { timeout: 8000 });
      const collapseActive = page.getByRole("button", { name: /Collapse navigation panel|Collapse route panel/ }).first();
      if (await collapseActive.isVisible().catch(() => false)) await collapseActive.click();
      await page.waitForTimeout(600);
      const readOutdoor = async () => page.evaluate(() => {
        const surface = document.querySelector('[data-testid="student-map-surface"]');
        const row = document.querySelector('[data-testid="explore-inspected-step"]');
        const marker = document.querySelector('[data-testid="student-emergency-assembly-point"]');
        const rect = marker?.getBoundingClientRect();
        const panel = [...document.querySelectorAll('[data-testid="route-planner-dialog"], [data-testid="collapsed-route-card"], [data-testid="mobile-active-route-dock"], [data-testid="student-selected-place-card"], [data-testid="mobile-building-sheet"]')]
          .find((element) => { const box = element.getBoundingClientRect(); const style = getComputedStyle(element); return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0.05 && element.getAttribute("aria-hidden") !== "true" && box.width > 0 && box.height > 0; })
          ?.getBoundingClientRect();
        const markerTransform = marker?.getAttribute("transform") ?? "";
        const world = markerTransform.match(/translate\(([-\d.]+),([\d.]+)\)/);
        const matchingRouteLineCount = [...document.querySelectorAll('polyline[data-testid="route-outer-casing"]')].filter((line) => {
          const endpoint = line.getAttribute("points")?.trim().split(/\s+/).at(-1)?.split(",").map(Number) ?? [];
          return world && Number(endpoint[0]) === Number(world[1]) && Number(endpoint[1]) === Number(world[2]);
        }).length;
        return {
          phase: surface?.getAttribute("data-route-phase"),
          camera: document.querySelector('[data-testid="camera-mode"] button[aria-label="Switch to Explore mode"]')?.getAttribute("aria-pressed"),
          inspectedStep: row?.innerText ?? null,
          markerVisible: Boolean(rect && rect.width > 0 && rect.height > 0),
          markerId: marker?.getAttribute("data-assembly-point-id") ?? null,
          markerWorld: world ? { x: Number(world[1]), y: Number(world[2]) } : markerTransform,
          matchingRouteLineCount,
          markerRect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
          panelRect: panel ? { x: panel.x, y: panel.y, width: panel.width, height: panel.height } : null,
          panelOverlap: Boolean(rect && panel && rect.left < panel.right && rect.right > panel.left && rect.top < panel.bottom && rect.bottom > panel.top),
        };
      });
      results.activeOutdoorExplore.renderer = "2D";
      results.activeOutdoorExplore.state = await readOutdoor();
      const image2d = path.join(out, "assembly-point-caba-explore-outdoor-2d-mobile-390.png");
      await page.screenshot({ path: image2d, fullPage: false });
      results.screenshots.push(path.basename(image2d));
      await page.getByRole("button", { name: "Switch to 3D view" }).click();
      await page.getByTestId("student-3d-emergency-assembly-point").waitFor({ state: "visible", timeout: 12000 });
      await page.waitForFunction(() => [...document.querySelectorAll("canvas")].some((canvas) => { const rect = canvas.getBoundingClientRect(); return rect.width > 100 && rect.height > 100; }), null, { timeout: 10000 });
      await page.waitForTimeout(600);
      results.activeOutdoorExplore.state3d = await page.getByTestId("student-3d-emergency-assembly-point").evaluate((marker) => {
        const rect = marker.getBoundingClientRect();
        const panel = [...document.querySelectorAll('[data-testid="route-planner-dialog"], [data-testid="collapsed-route-card"], [data-testid="mobile-active-route-dock"], [data-testid="student-selected-place-card"], [data-testid="mobile-building-sheet"]')]
          .find((element) => { const box = element.getBoundingClientRect(); const style = getComputedStyle(element); return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0.05 && element.getAttribute("aria-hidden") !== "true" && box.width > 0 && box.height > 0; })
          ?.getBoundingClientRect();
        const canvas = marker.closest("[data-testid='student-campus-3d-surface']")?.getBoundingClientRect();
        return {
          visible: rect.width > 0 && rect.height > 0,
          title: marker.getAttribute("title"),
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          canvasRect: canvas ? { x: canvas.x, y: canvas.y, width: canvas.width, height: canvas.height } : null,
          panelRect: panel ? { x: panel.x, y: panel.y, width: panel.width, height: panel.height } : null,
          panelOverlap: Boolean(panel && rect.left < panel.right && rect.right > panel.left && rect.top < panel.bottom && rect.bottom > panel.top),
        };
      });
      const image3d = path.join(out, "assembly-point-caba-explore-outdoor-3d-mobile-390.png");
      await page.screenshot({ path: image3d, fullPage: false });
      results.screenshots.push(path.basename(image3d));
      await page.getByRole("button", { name: "Switch to 2D view" }).click();
      await page.getByRole("button", { name: "Switch to 3D view" }).waitFor({ state: "visible", timeout: 12000 });
      results.activeOutdoorExplore.state2dReturn = await readOutdoor();
      results.activeOutdoorExplore.progressPreserved = results.activeOutdoorExplore.state.phase === results.activeOutdoorExplore.state2dReturn.phase
        && results.activeOutdoorExplore.state.markerId === results.activeOutdoorExplore.state2dReturn.markerId
        && JSON.stringify(results.activeOutdoorExplore.state.markerWorld) === JSON.stringify(results.activeOutdoorExplore.state2dReturn.markerWorld)
        && results.activeOutdoorExplore.state.matchingRouteLineCount === results.activeOutdoorExplore.state2dReturn.matchingRouteLineCount;
      const image2dReturn = path.join(out, "assembly-point-caba-explore-outdoor-return-2d-mobile-390.png");
      await page.screenshot({ path: image2dReturn, fullPage: false });
      results.screenshots.push(path.basename(image2dReturn));
      return;
    }

    if (process.env.AP_VISIBILITY_ONLY === "1") {
      currentStage = "Standard, Accessible, and SOS marker visibility on the Student Map";
      await page.setViewportSize({ width: 390, height: 844 });
      const search = page.getByRole("searchbox", { name: "Search campus map" });
      await search.click();
      await search.fill("CABA LECTURE HALL");
      await page.getByRole("option", { name: /CABA LECTURE HALL/i }).click();
      await page.getByRole("button", { name: "Start", exact: true }).click();
      const marker = page.getByTestId("student-emergency-assembly-point");
      results.markerVisibility = { viewport: "390x844" };
      results.markerVisibility.standardHidden = await marker.count() === 0;
      const standardImage = path.join(out, "assembly-point-standard-marker-hidden-390.png");
      await page.screenshot({ path: standardImage, fullPage: false });
      results.screenshots.push(path.basename(standardImage));

      await page.getByRole("button", { name: "Accessible routing" }).click();
      results.markerVisibility.accessibleHidden = await marker.count() === 0;
      const accessibleImage = path.join(out, "assembly-point-accessible-marker-hidden-390.png");
      await page.screenshot({ path: accessibleImage, fullPage: false });
      results.screenshots.push(path.basename(accessibleImage));

      await page.getByRole("button", { name: "SOS routing" }).click();
      await page.getByRole("dialog", { name: "Route planner" }).waitFor();
      // In the indoor planning view the destination is represented by its
      // name; its outdoor marker is verified during completed SOS playback.
      results.markerVisibility.sosIndoorFloorMarkerHidden = await marker.count() === 0;

      await page.getByRole("button", { name: "Standard routing" }).click();
      results.markerVisibility.hiddenAfterLeavingSos = await marker.count() === 0;
      results.markerVisibility.documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      return;
    }

    const roomCases = process.env.AP_PLAYBACK_ONLY === "1" || process.env.AP_OUTDOOR_ONLY === "1" ? [] : [
      { name: "CABA LECTURE HALL", key: "caba", alternatives: 2 },
      { name: "CEIT LECTURE HALL", key: "ceit", alternatives: 2 },
      { name: "PLV AUDITORIUM", key: "auditorium", alternatives: 2 },
      { name: "ASSEMBLY HALL", key: "assembly-hall", alternatives: 1 },
    ];
    for (const testCase of roomCases) {
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
        // The compact Student planner labels the selector "CHOOSE A ROUTE";
        // wait on the actual route controls instead of obsolete copy.
        await page.getByRole("button").filter({ hasText: /^Route A/ }).first().waitFor();
        await page.getByRole("button").filter({ hasText: /^Route B/ }).first().waitFor();
      }

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
      const overviewFile = path.join(out, `assembly-point-${testCase.key}-${testCase.alternatives === 1 ? "single-route" : "both-routes"}-mobile-390.png`);
      await page.screenshot({ path: overviewFile, fullPage: false });
      results.screenshots.push(path.basename(overviewFile));

      if (roomResult.routeOptionCount > 0) {
        const firstOption = page.getByRole("button").filter({ hasText: /^Route A/ }).first();
        await firstOption.click();
        const activeFile = path.join(out, `assembly-point-${testCase.key}-active-2d-mobile-390.png`);
        await page.screenshot({ path: activeFile, fullPage: false });
        results.screenshots.push(path.basename(activeFile));
        roomResult.activeRouteSelected = true;
        const view3d = page.getByRole("button", { name: "Switch to 3D view" });
        if (await view3d.isVisible().catch(() => false)) {
          await view3d.click();
          await page.getByRole("button", { name: "Switch to 2D view" }).waitFor();
          await page.waitForTimeout(2500);
          roomResult.renderer3dCanvasVisible = await page.locator("canvas").evaluateAll((canvases) => canvases.some((canvas) => {
            const rect = canvas.getBoundingClientRect();
            return rect.width > 100 && rect.height > 100;
          }));
          const threeDFile = path.join(out, `assembly-point-${testCase.key}-active-3d-mobile-390.png`);
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
    const desktopFile = path.join(out, "assembly-point-caba-both-routes-desktop-1440.png");
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
      const outdoor2dFile = path.join(out, "assembly-point-caba-outdoor-2d-desktop-1440.png");
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
      const outdoor3dFile = path.join(out, "assembly-point-caba-outdoor-3d-desktop-1440.png");
      await page.screenshot({ path: outdoor3dFile, fullPage: false });
      results.screenshots.push(path.basename(outdoor3dFile));
    }

    if (process.env.AP_OUTDOOR_ONLY !== "1") {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/map`, { waitUntil: "domcontentloaded" });
    const playbackSearch = page.getByRole("searchbox", { name: "Search campus map" });
    await playbackSearch.waitFor();
    await playbackSearch.click();
    const playbackRoomName = process.env.AP_ARRIVAL_ROOM || "CABA LECTURE HALL";
    const playbackRoomKey = /ASSEMBLY HALL/i.test(playbackRoomName) ? "assembly-hall"
      : /CEIT/i.test(playbackRoomName) ? "ceit"
        : /AUDITORIUM/i.test(playbackRoomName) ? "auditorium" : "caba";
    await playbackSearch.fill(playbackRoomName);
    await page.getByRole("option", { name: new RegExp(playbackRoomName, "i") }).click();
    await page.getByRole("button", { name: "Start", exact: true }).click();
    await page.getByRole("button", { name: "SOS routing" }).click();
    await page.getByRole("button", { name: "Find Route", exact: true }).click();
    const bothRoutes = page.getByRole("button", { name: "Both Routes", exact: true });
    const hasTwoRoutes = await bothRoutes.isVisible().catch(() => false);
    const playbackRouteLabel = process.env.AP_ARRIVAL_ROUTE === "B" ? "Route B" : "Route A";
    let routeBSelected = false;
    if (hasTwoRoutes) {
      const selectedRouteControl = page.getByRole("button").filter({ hasText: new RegExp(`^${playbackRouteLabel}`) }).first();
      await selectedRouteControl.click();
      routeBSelected = await selectedRouteControl.getAttribute("aria-pressed") === "true";
    }
    // The route preview's primary action is labelled "Start" in the live
    // Student Map. Earlier acceptance scripts expected a stale label and
    // stopped before navigation began.
    setStage("start selected CABA route from preview");
    const expandSelectedRoute = page.getByRole("button", { name: /Expand route panel|^Expand$/ }).first();
    if (await expandSelectedRoute.isVisible().catch(() => false)) await expandSelectedRoute.click();
    const startPlayback = page.getByRole("button", { name: "Start", exact: true }).last();
    await startPlayback.waitFor({ state: "visible", timeout: 10000 });
    await startPlayback.click();
    setStage("return camera to Follow after route start");
    const returnFollowOnStart = page.getByRole("button", { name: /Return to Follow/ });
    if (await returnFollowOnStart.isVisible().catch(() => false)) await returnFollowOnStart.click();
    const followTextButton = page.locator("button").filter({ hasText: /^FOLLOW$/ }).first();
    if (await followTextButton.isVisible().catch(() => false)) await followTextButton.click();
    setStage("read active route instruction");
    const currentInstruction = page.locator('[data-testid="current-route-instruction"]:visible, [data-testid="collapsed-current-instruction"]:visible, [data-testid="compact-current-route-instruction"]:visible').first();
    await currentInstruction.waitFor();
    const expandRoute = page.getByRole("button", { name: /Expand navigation panel|Expand route panel|Expand$/ });
    if (await expandRoute.isVisible().catch(() => false)) await expandRoute.click();
    const stepBefore = await currentInstruction.evaluate((element) => element.parentElement?.innerText ?? element.innerText).catch(() => null);
    const playbackVisitedFloors = new Set();
    const playbackInstructions = [];
    const playbackStepSequence = [];
    await page.evaluate(() => {
      window.__assemblyRouteStepHistory = [];
      const capture = () => {
        const instruction = [...document.querySelectorAll('[data-testid="current-route-instruction"], [data-testid="collapsed-current-instruction"], [data-testid="compact-current-route-instruction"]')]
          .find((element) => element.getClientRects().length > 0);
        const panelText = instruction?.parentElement?.innerText ?? instruction?.innerText ?? "";
        const match = panelText.match(/Step (\d+) of (\d+)/i);
        if (!match) return;
        const floor = document.querySelector('button[aria-label^="Choose floor. Current floor:"]')?.getAttribute("aria-label") ?? "";
        const signature = `${match[1]}|${floor}|${instruction?.textContent?.trim() ?? ""}`;
        const last = window.__assemblyRouteStepHistory.at(-1);
        if (last?.signature !== signature) window.__assemblyRouteStepHistory.push({ step: Number(match[1]), total: Number(match[2]), floor, instruction: instruction?.textContent?.trim() ?? "", signature });
      };
      capture();
      window.__assemblyRouteStepObserver = new MutationObserver(capture);
      window.__assemblyRouteStepObserver.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
    });
    let arrivalReached = false;
    let manualAdvanceCount = 0;
    let transitionContinueCount = 0;
    let noProgressCount = 0;
    let lastProgressSignature = "";
    let arrivalCamera = null;
    const playbackDeadline = Date.now() + 90000;
    setStage("advance route through authored transitions (maximum 100 steps)");
    // Keep the final step-sequence audit at the default 1x playback speed.
    for (let attempt = 0; attempt < 100 && Date.now() < playbackDeadline; attempt += 1) {
      const floorButton = page.locator('button[aria-label^="Choose floor. Current floor:"]').first();
      const floorLabel = await floorButton.count() ? await floorButton.getAttribute("aria-label", { timeout: 1000 }).catch(() => null) : null;
      if (floorLabel) playbackVisitedFloors.add(floorLabel.replace("Choose floor. Current floor: ", ""));
      const mapSurface = page.getByTestId("student-map-surface");
      const routePhase = await mapSurface.getAttribute("data-route-phase").catch(() => null);
      const arrivalCard = page.locator('[data-testid="route-arrival-state"]:visible, [data-testid="mobile-route-arrival-compact"]:visible').first();
      if (routePhase === "arrived" || await arrivalCard.isVisible().catch(() => false)) {
        arrivalReached = true;
        await page.waitForTimeout(750);
        const arrivalTitle = page.locator('[data-testid="route-arrival-title"]:visible, [data-testid="mobile-route-arrival-compact"] p:visible').first();
        results.arrivalAtMoment = {
          title: await arrivalTitle.innerText().catch(() => null),
          currentInstruction: await currentInstruction.innerText().catch(() => null),
          visibleText: await arrivalCard.innerText().catch(() => null),
          planner: await page.getByTestId("route-planner-dialog").evaluate((element) => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return { exists: true, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, display: style.display, visibility: style.visibility, opacity: style.opacity, suspended: element.getAttribute("data-suspended-for-building") };
          }).catch(() => ({ exists: false })),
          collapsedCard: await page.getByTestId("collapsed-route-card").isVisible().catch(() => false),
          mapState: await mapSurface.evaluate((surface) => ({
            routePhase: surface.getAttribute("data-route-phase"),
            routeCollapsed: surface.getAttribute("data-route-collapsed"),
            arrivalCameraActive: surface.getAttribute("data-arrival-camera-active"),
            arrivalCameraContext: surface.getAttribute("data-arrival-camera-context"),
            arrivalCameraX: surface.getAttribute("data-arrival-camera-x"),
            arrivalCameraY: surface.getAttribute("data-arrival-camera-y"),
          })).catch(() => null),
        };
        results.arrivalText = await page.locator("body").innerText().then((text) => text.slice(-1000)).catch(() => null);
        const immediateArrivalFile = path.join(out, `assembly-point-${playbackRoomKey}-arrival-mobile-390.png`);
        await page.screenshot({ path: immediateArrivalFile, fullPage: false });
        results.screenshots.push(path.basename(immediateArrivalFile));
        arrivalCamera = await page.evaluate(() => {
          const marker = document.querySelector('[data-testid="student-emergency-assembly-point"]');
          if (!marker) return { visible: false };
          const rect = marker.getBoundingClientRect();
          const panel = document.querySelector('[data-testid="route-planner-dialog"]');
          const panelRect = panel?.getBoundingClientRect();
          const group = document.querySelector('[data-testid="student-map-camera-transform"]');
          return {
            visible: rect.width > 0 && rect.height > 0,
            rect: { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) },
            center: { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) },
            text: marker.textContent?.trim() ?? "",
            plannerOverlap: Boolean(panelRect && rect.left < panelRect.right && rect.right > panelRect.left && rect.top < panelRect.bottom && rect.bottom > panelRect.top),
            cameraTransform: group?.getAttribute("transform") ?? null,
            screenAnchor: (() => { const matrix = marker.getScreenCTM(); return matrix ? { x: Math.round(matrix.e), y: Math.round(matrix.f) } : null; })(),
            markerWorldAnchor: marker.getAttribute("transform") ?? null,
            svgViewBox: marker.ownerSVGElement?.getAttribute("viewBox") ?? null,
            svgRect: (() => { const svg = marker.ownerSVGElement; if (!svg) return null; const r = svg.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }; })(),
          };
        });
        results.outdoor2d = {
          marker: arrivalCamera,
          routeLinePresent: await page.locator('[data-testid="campus-route-context-legs"] [data-testid="route-outer-casing"]').count().catch(() => 0) > 0,
          routePhase,
        };
        const routeOverlayEvidence = await page.evaluate(() => {
          const group = document.querySelector('[data-testid="campus-route-context-legs"]');
          const marker = document.querySelector('[data-testid="student-emergency-assembly-point"]');
          const markerId = marker?.getAttribute("data-assembly-point-id") ?? null;
          const markerMatrix = marker?.getScreenCTM();
          const markerScreen = markerMatrix ? { x: markerMatrix.e, y: markerMatrix.f } : null;
          const lines = [...document.querySelectorAll('polyline[data-testid="route-outer-casing"]')].map((line) => {
            const points = line.getAttribute("points")?.trim().split(/\s+/) ?? [];
            const endpoints = points.length ? [points[0], points.at(-1)].map((raw) => { const [x, y] = raw.split(",").map(Number); return { x, y }; }) : [];
            const matrix = line.getScreenCTM();
            const worldEnd = endpoints.at(-1);
            const screenEnd = matrix && worldEnd ? { x: matrix.a * worldEnd.x + matrix.c * worldEnd.y + matrix.e, y: matrix.b * worldEnd.x + matrix.d * worldEnd.y + matrix.f } : null;
            return { endpoints, screenEnd, assemblyMatch: Boolean(worldEnd && marker && marker.getAttribute("transform") === `translate(${worldEnd.x},${worldEnd.y})`) };
          });
          return {
            routePolylineCount: group?.querySelectorAll('[data-testid="route-outer-casing"]').length ?? 0,
            routeEndpoint: [...(group?.querySelectorAll("polyline") ?? [])].map((line) => {
              const points = line.getAttribute("points")?.trim().split(/\s+/) ?? [];
              const last = points.at(-1)?.split(",").map(Number) ?? [];
              return last.length === 2 ? { x: last[0], y: last[1] } : null;
            }).find(Boolean) ?? null,
            allRouteLines: lines,
            linesEndingAtAssemblyPoint: lines.filter((line) => line.assemblyMatch).length,
            markerId,
            markerScreen,
            markerAnchor: marker?.getAttribute("transform") ?? null,
            approvedOverviewCount: document.querySelectorAll('[data-testid="approved-emergency-campus-overview"]').length,
          };
        });
        results.routeOverlayEvidence = routeOverlayEvidence;
        // The approved emergency overview owns the SOS polylines, which may
        // render outside the active route-context group after arrival. Count
        // the actual page-wide lines that end at the marker.
        results.outdoor2d.routeLinePresent = routeOverlayEvidence.linesEndingAtAssemblyPoint > 0;
        const switch3d = page.getByRole("button", { name: "Switch to 3D view" });
        if (await switch3d.isVisible().catch(() => false)) {
          const panTarget = await page.getByTestId("student-emergency-assembly-point").boundingBox();
          if (panTarget) {
            await page.mouse.move(panTarget.x + panTarget.width / 2, panTarget.y + panTarget.height / 2);
            await page.mouse.wheel(0, -160);
            await page.waitForTimeout(350);
            results.afterPanZoom = await page.evaluate(() => {
              const marker = document.querySelector('[data-testid="student-emergency-assembly-point"]');
              const group = document.querySelector('[data-testid="campus-route-context-legs"]');
              const svg = document.querySelector('[data-testid="student-map-camera-transform"]');
              const endpoint = [...(group?.querySelectorAll("polyline") ?? [])].map((line) => line.getAttribute("points")?.trim().split(/\s+/).at(-1)?.split(",").map(Number)).find((point) => point?.length === 2);
              const matrix = svg?.getScreenCTM();
              const projected = endpoint && matrix ? { x: matrix.a * endpoint[0] + matrix.c * endpoint[1] + matrix.e, y: matrix.b * endpoint[0] + matrix.d * endpoint[1] + matrix.f } : null;
          const rect = marker?.getBoundingClientRect();
              const markerTransform = marker?.getAttribute("transform") ?? "";
              const markerXY = markerTransform.match(/translate\(([-\d.]+),([-\d.]+)\)/);
              const markerPoint = markerXY ? { x: Number(markerXY[1]), y: Number(markerXY[2]) } : null;
              const lines = [...document.querySelectorAll('polyline[data-testid="route-outer-casing"]')].map((line) => {
                const points = line.getAttribute("points")?.trim().split(/\s+/) ?? [];
                const rawEnd = points.at(-1)?.split(",").map(Number) ?? [];
                const matrix = line.getScreenCTM();
                const end = rawEnd.length === 2 && matrix ? { x: matrix.a * rawEnd[0] + matrix.c * rawEnd[1] + matrix.e, y: matrix.b * rawEnd[0] + matrix.d * rawEnd[1] + matrix.f } : null;
                return { matchesAssembly: Boolean(markerPoint && rawEnd[0] === markerPoint.x && rawEnd[1] === markerPoint.y), end };
              });
              const markerMatrix = marker?.getScreenCTM();
              const markerScreen = markerMatrix ? { x: markerMatrix.e, y: markerMatrix.f } : null;
              const alignedLines = lines.filter((line) => line.matchesAssembly && line.end && markerScreen).map((line) => ({ dx: line.end.x - markerScreen.x, dy: line.end.y - markerScreen.y }));
              return { markerAnchor: markerTransform || null, endpoint: endpoint ? { x: endpoint[0], y: endpoint[1] } : null, projectedEnd: projected ? { x: projected.x, y: projected.y } : null, markerRect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null, matchingRouteCount: alignedLines.length, routeEndpointScreenDeltas: alignedLines };
            });
          }
          await page.setViewportSize({ width: 360, height: 800 });
          await page.waitForTimeout(250);
          const mobile360File = path.join(out, `assembly-point-${playbackRoomKey}-arrival-outdoor-2d-mobile-360.png`);
          await page.screenshot({ path: mobile360File, fullPage: false });
          results.screenshots.push(path.basename(mobile360File));
          await page.setViewportSize({ width: 390, height: 844 });
          await page.waitForTimeout(250);
          await switch3d.click();
          await page.getByRole("button", { name: "Switch to 2D view" }).waitFor({ timeout: 10000 });
          await page.waitForTimeout(1800);
          const threeDFile = path.join(out, `assembly-point-${playbackRoomKey}-arrival-outdoor-3d-mobile-390.png`);
          await page.screenshot({ path: threeDFile, fullPage: false });
          results.screenshots.push(path.basename(threeDFile));
          results.outdoor3d = {
            canvasVisible: await page.locator("canvas").evaluateAll((canvases) => canvases.some((canvas) => {
              const rect = canvas.getBoundingClientRect(); return rect.width > 100 && rect.height > 100;
            })),
            markerLabelPresent: (await page.locator("body").innerText()).includes("TEST ONLY - Main Assembly Point A"),
            marker: await page.locator('[data-testid="student-3d-emergency-assembly-point"]').evaluate(async (marker) => {
              const rect = marker.getBoundingClientRect();
              const canvas = document.querySelector("canvas")?.getBoundingClientRect();
              const panel = document.querySelector('[data-testid="route-planner-dialog"]')?.getBoundingClientRect();
              const overlayElements = [...document.querySelectorAll(".map-layer-building-sheet, [data-testid='student-selected-place-card'], [data-testid='mobile-building-sheet'], [data-testid='event-map-panel'], [data-testid='route-planner-dialog'], [data-testid='collapsed-route-card'], [data-testid='mobile-active-route-dock'], [data-testid='student-floor-picker'], [data-map-search-header='true']")].filter((item) => {
                const box = item.getBoundingClientRect(); const style = getComputedStyle(item);
                return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
              }).map((item) => { const box = item.getBoundingClientRect(); return { selector: item.getAttribute("data-testid") || item.className?.baseVal || item.className, left: box.left, top: box.top, width: box.width, height: box.height }; });
              const focus = await import("/src/lib/student3dCameraFocus.ts");
              const mapRect = canvas && { left: canvas.left, top: canvas.top, width: canvas.width, height: canvas.height };
              const safeFocusRect = mapRect ? focus.student3dSafeFocusRect(mapRect, overlayElements) : null;
              const safeFocusCenter = mapRect ? focus.student3dSafeFocusCenter(mapRect, overlayElements) : null;
              return { id: marker.getAttribute("data-assembly-point-id"), rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }, canvas: canvas && { x: Math.round(canvas.x), y: Math.round(canvas.y), width: Math.round(canvas.width), height: Math.round(canvas.height) }, panel: panel && { x: Math.round(panel.x), y: Math.round(panel.y), width: Math.round(panel.width), height: Math.round(panel.height) }, panelOverlap: Boolean(panel && rect.left < panel.right && rect.right > panel.left && rect.top < panel.bottom && rect.bottom > panel.top), overlayElements, safeFocusRect, safeFocusCenter };
            }).catch(() => null),
            routePhase: await mapSurface.getAttribute("data-route-phase").catch(() => null),
          };
          await page.getByRole("button", { name: "Switch to 2D view" }).click();
          await page.getByRole("button", { name: "Switch to 3D view" }).waitFor({ timeout: 10000 });
          await page.waitForTimeout(400);
          results.rendererRoundTrip = {
            routePhase: await mapSurface.getAttribute("data-route-phase").catch(() => null),
            markerVisible: await page.locator('[data-testid="student-emergency-assembly-point"]').isVisible().catch(() => false),
            arrivalCameraActive: await mapSurface.getAttribute("data-arrival-camera-active").catch(() => null),
          };
          await page.setViewportSize({ width: 1440, height: 900 });
          await page.waitForTimeout(250);
          const desktopArrival = path.join(out, `assembly-point-${playbackRoomKey}-arrival-desktop-1440.png`);
          await page.screenshot({ path: desktopArrival, fullPage: false });
          results.screenshots.push(path.basename(desktopArrival));
          results.desktopArrival = await mapSurface.evaluate((surface) => ({ viewport: innerWidth, routePhase: surface.getAttribute("data-route-phase"), documentWidth: document.documentElement.scrollWidth }));
        }
        break;
      }
      const instructionCount = await currentInstruction.count();
      if (!instructionCount) {
        // Give React one short handoff window when leaving a floor. If the
        // active instruction remains absent, capture the exact campus-view
        // state instead of retrying missing selectors indefinitely.
        await page.waitForTimeout(700);
        if (!(await currentInstruction.count())) {
          results.playbackStall = {
            attempt,
            floorLabel,
            reason: "Active route instruction panel is absent after the floor-to-campus handoff",
            visibleText: await page.locator("body").innerText().then((text) => text.slice(-1400)).catch(() => null),
            buttons: await page.locator("button").evaluateAll((buttons) => buttons
              .filter((button) => button.getClientRects().length)
              .map((button) => ({ text: button.innerText.trim(), ariaLabel: button.getAttribute("aria-label"), disabled: button.disabled }))
              .slice(0, 30)).catch(() => []),
          };
          const handoffFile = path.join(out, "assembly-point-caba-campus-handoff-mobile-390.png");
          await page.screenshot({ path: handoffFile, fullPage: false });
          results.screenshots.push(path.basename(handoffFile));
          break;
        }
      }
      const instructionText = await currentInstruction.innerText({ timeout: 1000 }).catch(() => null);
      if (instructionText && playbackInstructions.at(-1) !== instructionText) playbackInstructions.push(instructionText);
      const progressLabel = instructionText
        ? await currentInstruction.evaluate((element) => element.parentElement?.innerText ?? "")
          .then((text) => text.match(/Step (\d+) of (\d+)/i)?.[0] ?? "").catch(() => "")
        : "";
      const stepNumber = progressLabel.match(/Step (\d+) of/i)?.[1];
      if (stepNumber && playbackStepSequence.at(-1) !== Number(stepNumber)) playbackStepSequence.push(Number(stepNumber));
      const signature = `${floorLabel ?? ""}|${progressLabel}|${instructionText ?? ""}`;
      if (signature !== lastProgressSignature) {
        lastProgressSignature = signature;
        noProgressCount = 0;
        process.stdout.write(`[route] ${floorLabel ?? "floor ?"} ${progressLabel || ""} ${instructionText ?? ""}\n`);
      }
      // Hidden responsive panels can contain duplicate controls. Advance only
      // through the currently visible Continue button.
      const continueTransition = page.locator("button:visible").filter({ hasText: /^Continue$/ }).first();
      if (await continueTransition.isVisible().catch(() => false) && await continueTransition.isEnabled().catch(() => false)) {
        await continueTransition.click();
        transitionContinueCount += 1;
        await page.waitForTimeout(250);
        continue;
      }
      const nextStep = page.getByRole("button", { name: "Next step" });
      if (await nextStep.isVisible().catch(() => false) && await nextStep.isEnabled().catch(() => false)) {
        await nextStep.click({ timeout: 3000 });
        manualAdvanceCount += 1;
        await page.waitForTimeout(250);
        continue;
      }
      const collapsedNext = page.getByRole("button", { name: "Next", exact: true });
      if (await collapsedNext.isVisible().catch(() => false) && await collapsedNext.isEnabled().catch(() => false)) {
        await collapsedNext.click({ timeout: 3000 });
        manualAdvanceCount += 1;
        await page.waitForTimeout(250);
        continue;
      }
      await page.waitForTimeout(500);
      noProgressCount += 1;
      // Allow authored stair/elevator transition animation up to ten seconds;
      // report the exact current state if it remains idle after that.
      if (noProgressCount >= 20) {
        results.playbackStall = {
          attempt,
          floorLabel,
          instruction: instructionText,
          step: progressLabel,
      reason: "No enabled Next/Continue action and no route-step progress for 10 seconds",
        };
        break;
      }
    }
    const arrivalNameVisible = (await page.locator("body").innerText()).includes("TEST ONLY - Main Assembly Point A");
    results.domObservedStepHistory = await page.evaluate(() => {
      window.__assemblyRouteStepObserver?.disconnect();
      return window.__assemblyRouteStepHistory ?? [];
    }).catch(() => []);
    const domObservedStepSequence = [];
    for (const entry of results.domObservedStepHistory) {
      if (entry.step && domObservedStepSequence.at(-1) !== entry.step) domObservedStepSequence.push(entry.step);
    }
    const arrivalFile = path.join(out, `assembly-point-${playbackRoomKey}-arrival-final-mobile-390.png`);
    await page.screenshot({ path: arrivalFile, fullPage: false });
    results.screenshots.push(path.basename(arrivalFile));
    results.playback = {
      scenario: `${playbackRoomName} ${hasTwoRoutes ? playbackRouteLabel : "single route"} active playback on the isolated assigned/approved test Assembly Point snapshot`,
      routeBWasSelectable: routeBSelected,
      startedRoutePreview: true,
      initialStep: stepBefore,
      playbackSpeed: await page.locator('button[aria-label^="Playback speed "]').first().getAttribute("aria-label").catch(() => null),
      manualAdvanceCount,
      transitionContinueCount,
      instructionsObserved: playbackInstructions,
      observedStepSequence: domObservedStepSequence,
      sampledStepSequence: playbackStepSequence,
      noSkippedOrRepeatedObservedSteps: domObservedStepSequence.every((step, index) => index === 0 || step === domObservedStepSequence[index - 1] + 1),
      visitedFloorLabels: [...playbackVisitedFloors],
      arrivalReached,
      arrivalNameVisible,
      routeArrivalCardVisible: await page.locator('[data-testid="route-arrival-state"]:visible, [data-testid="mobile-route-arrival-compact"]:visible').first().isVisible().catch(() => false),
      arrivalTitle: results.arrivalAtMoment?.title ?? await page.locator('[data-testid="route-arrival-title"]:visible, [data-testid="mobile-route-arrival-compact"] p:visible').first().innerText().catch(() => null),
      arrivalText: results.arrivalAtMoment?.visibleText ?? null,
      finalAssemblyMarker: arrivalCamera,
      playbackStopped: await page.getByRole("button", { name: "Pause navigation" }).isHidden().catch(() => false),
      finalMapState: await page.getByTestId("student-map-surface").evaluate((surface) => ({
        routePhase: surface.getAttribute("data-route-phase"),
        routeCollapsed: surface.getAttribute("data-route-collapsed"),
        arrivalCameraActive: surface.getAttribute("data-arrival-camera-active"),
        arrivalCameraContext: surface.getAttribute("data-arrival-camera-context"),
        arrivalCameraX: surface.getAttribute("data-arrival-camera-x"),
        arrivalCameraY: surface.getAttribute("data-arrival-camera-y"),
      })).catch(() => null),
      finalView: (await page.locator("body").innerText()).slice(-1400),
    };
    }
  } catch (error) {
    results.failure = { stage: currentStage, message: error.message, stack: error.stack };
    results.pageDebug = await page.evaluate(() => ({ url: location.href, title: document.title, text: document.body?.innerText?.slice(0, 1200) ?? "", htmlLength: document.documentElement?.innerHTML?.length ?? 0 })).catch(() => null);
    results.visibleButtons = await page.locator("button").evaluateAll((buttons) => buttons.filter((button) => button.getClientRects().length).map((button) => ({ text: button.innerText, ariaLabel: button.getAttribute("aria-label"), disabled: button.disabled })).slice(0, 50)).catch(() => []);
    try {
      const failure = path.join(out, "assembly-point-browser-failure.png");
      await page.screenshot({ path: failure, fullPage: false });
      results.screenshots.push(path.basename(failure));
    } catch {}
  } finally {
    results.browserErrors = [...new Set(results.browserErrors)];
    results.screenshots = [...new Set(results.screenshots)];
    if (process.env.AP_STATUS_ONLY === "1") {
      fs.writeFileSync(path.join(out, `assembly-point-status-${process.env.AP_STATUS_SCENARIO}-browser-results.json`), JSON.stringify(results, null, 2));
    } else if (process.env.AP_RENDERER_ROUNDTRIP_ONLY === "1") {
      fs.writeFileSync(path.join(out, "assembly-point-caba-active-renderer-roundtrip-browser-results.json"), JSON.stringify(results, null, 2));
    } else if (process.env.AP_VIDEO_MAP_ONLY === "1") {
      fs.writeFileSync(path.join(out, "student-map-video-acceptance-browser-results.json"), JSON.stringify(results, null, 2));
    } else if (process.env.AP_VISIBILITY_ONLY === "1") {
      fs.writeFileSync(path.join(out, "assembly-point-marker-visibility-browser-results.json"), JSON.stringify(results, null, 2));
    } else {
      fs.writeFileSync(path.join(out, "assembly-point-student-browser-results.json"), JSON.stringify(results, null, 2));
      fs.writeFileSync(path.join(out, `assembly-point-${playbackRoomKeyForResults()}-browser-results.json`), JSON.stringify(results, null, 2));
    }
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

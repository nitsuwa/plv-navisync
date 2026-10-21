const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(process.env.TEMP, "plv-navisync-acceptance", "node_modules", "playwright"));

const base = process.env.SOS_AUDIT_BASE || "http://[::1]:5173";
const output = path.resolve(__dirname, "main-campus-emergency-readonly-deep-results.json");
const safeReadRpcs = new Set([
  "list_event_safe_published_campuses",
  "list_published_campus_version_status",
  "list_coming_soon_campuses",
]);
const result = {
  source: "Current published MAIN CAMPUS snapshot; browser blocks all non-read-only Supabase mutations",
  checks: [],
  screenshots: [],
  errors: [],
};

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Users/user/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe",
    args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-gl=angle", "--use-angle=swiftshader"],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (["127.0.0.1", "localhost", "[::1]", "::1"].includes(url.hostname)) return route.continue();
    if (url.hostname.endsWith("supabase.co")) {
      if (request.method() === "GET" || request.method() === "OPTIONS") return route.continue();
      const rpc = url.pathname.match(/\/rpc\/([^/]+)$/)?.[1];
      if (request.method() === "POST" && rpc && safeReadRpcs.has(rpc)) return route.continue();
      return route.fulfill({ status: 403, body: "Blocked by MAIN CAMPUS read-only emergency audit" });
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => result.errors.push(error.message));
  try {
    await page.goto(`${base}/map`, { waitUntil: "domcontentloaded" });
    const audit = await page.evaluate(async () => {
      const [{ listPublishedCampusSnapshots, listPublishedCampusVersionStatus }, { evaluateRoomEmergencyEvacuation }, { resolveAutomaticStudentEvacuationRoutes }, { buildTestRouteEdges }, { assessEmergencyAuthoredPath }, { routeEdgeTrace }] = await Promise.all([
        import("/src/services/campusService.ts"),
        import("/src/lib/roomEmergencyEvacuation.ts"),
        import("/src/lib/studentEmergencyEvacuation.ts"),
        import("/src/components/map-builder/TestNavigationPanel.tsx"),
        import("/src/lib/emergencyPathEligibility.ts"),
        import("/src/components/map-builder/TestNavigationPanel.tsx"),
      ]);
      const [snapshots, publicationRows] = await Promise.all([
        listPublishedCampusSnapshots(),
        listPublishedCampusVersionStatus(),
      ]);
      const campus = snapshots.find((candidate) => candidate.code === "MAIN" && /MAIN CAMPUS - PLV/i.test(candidate.name));
      if (!campus) return { found: false, publishedSnapshotCount: snapshots.length };
      const publication = publicationRows.find((row) => row.campus_id === campus.id);
      const buildings = (campus.buildings ?? []).filter((building) => /CABA|CANTEEN|COED|CEIT|STUDENT.?CENTER/i.test(`${building.code ?? ""} ${building.name ?? ""}`));
      const routeEdges = buildTestRouteEdges(campus);
      const summarizeBuilding = (building) => ({
        id: building.id,
        code: building.code,
        name: building.name,
        floors: (building.floors ?? []).map((floor) => ({ id: floor.id, number: floor.number, label: floor.label })),
        exteriorEmergencyStairs: (building.exteriorEmergencyStairs ?? []).map((stair) => ({
          id: stair.id,
          label: stair.label,
          state: stair.state,
          emergencySafe: stair.emergencySafe,
          servedFloorIds: stair.servedFloorIds,
          outdoorNodeId: stair.outdoorNodeId,
        })),
        entrances: (building.entrances ?? []).map((entrance) => ({ id: entrance.id, name: entrance.name, type: entrance.type, direction: entrance.direction })),
        floorStairs: (building.floors ?? []).flatMap((floor) => (floor.stairs ?? []).map((stair) => ({
          id: stair.id, floorId: floor.id, floorLabel: floor.label, label: stair.label, emergencySafe: stair.emergencySafe,
        }))),
      });
      const caba = buildings.find((building) => building.code === "CABA");
      const roomRows = caba ? caba.floors.flatMap((floor) => floor.rooms.map((room) => ({ floor, room }))) : [];
      const roomMatch = roomRows.find(({ room }) => /CABA\s*[- ]?201|^201$/i.test(`${room.code ?? ""} ${room.name ?? ""}`));
      let caba201 = null;
      if (roomMatch) {
        const { floor, room } = roomMatch;
        const origin = {
          type: "room", buildingId: caba.id, floorNumber: floor.number, roomId: room.id,
          roomName: room.name, buildingLabel: caba.name, buildingCode: caba.code,
          accessDoorIds: room.accessDoorIds,
        };
        const evaluation = evaluateRoomEmergencyEvacuation(campus, caba.id, floor.id, room.id);
        const automatic = resolveAutomaticStudentEvacuationRoutes(campus, origin);
        caba201 = {
          room: { id: room.id, name: room.name, floorId: floor.id, floorNumber: floor.number, accessDoorIds: room.accessDoorIds },
          doorEntities: (room.accessDoorIds ?? []).map((doorId) => {
            const door = floor.doors.find((item) => item.id === doorId);
            const node = campus.navNodes?.find((item) => item.doorId === doorId && item.buildingId === caba.id && item.floorId === floor.id);
            return { id: doorId, label: door?.label, nodeId: node?.id, nodeName: node?.name };
          }),
          candidates: evaluation.candidates.map((candidate) => {
            const nodeIds = candidate.route.authoredGraphNodeIds ?? [];
            const edgeIds = routeEdgeTrace({ nodeIds, edgeTraversals: [] }, routeEdges, candidate.route.authoredGraphEdgeIds).map((item) => item.edgeId);
            const path = assessEmergencyAuthoredPath(campus, routeEdges, {
              nodeIds, edgeIds, destinationNodeId: candidate.destinationNodeId,
              originBuildingId: caba.id,
              destinationPoint: candidate.route.campusPoints?.at(-1) ?? candidate.route.points.at(-1),
            });
            const traversedStairs = nodeIds.flatMap((id) => {
              const node = campus.navNodes?.find((item) => item.id === id);
              if (!node) return [];
              if (node.exteriorEmergencyStairId) {
                const owner = caba.exteriorEmergencyStairs?.find((item) => item.id === node.exteriorEmergencyStairId);
                return [{ id: owner?.id, label: owner?.label, type: "exterior", floorId: node.floorId }];
              }
              if (node.stairId) {
                const owner = caba.floors.find((item) => item.id === node.floorId)?.stairs.find((item) => item.id === node.stairId);
                return [{ id: owner?.id ?? node.stairId, label: owner?.label ?? node.name, type: "ordinary", floorId: node.floorId, emergencySafe: owner?.emergencySafe }];
              }
              return [];
            });
            return {
              exitId: candidate.exitId, kind: candidate.kind, exitLabel: candidate.exitLabel,
              destinationNodeId: candidate.destinationNodeId, assemblyPointId: candidate.assemblyPointId,
              completeDestinationRoute: candidate.completeDestinationRoute,
              emergencyUseReviewRequired: candidate.emergencyUseReviewRequired,
              issues: path.issues, connected: path.connected, emergencyEligible: path.emergencyEligible,
              traversedStairs: [...new Map(traversedStairs.map((stair) => [stair.id, stair])).values()],
              nodeIds, edgeIds,
            };
          }),
          automaticRoutes: automatic.routes.map((route) => ({
            id: route.id, label: route.label, exitId: route.candidate.exitId,
            kind: route.candidate.kind, assemblyPointId: route.candidate.assemblyPointId,
            destinationNodeId: route.candidate.destinationNodeId,
          })),
          automaticMessage: automatic.message,
        };
      }
      const buildingReadiness = buildings.map((building) => {
        const preferredRoom = building.code === "CABA" ? roomMatch : undefined;
        const sample = preferredRoom ?? building.floors.flatMap((floor) => floor.rooms.map((room) => ({ floor, room })))
          .find(({ room }) => Boolean(room.accessDoorId || room.accessDoorIds?.length));
        const assignedPoints = (campus.assemblyPoints ?? []).filter((point) =>
          point.buildingAssignments?.some((assignment) => assignment.buildingId === building.id));
        if (!sample) return {
          buildingId: building.id, code: building.code, name: building.name,
          assignedAssemblyPoints: assignedPoints.map((point) => ({ id: point.id, name: point.name })),
          sampleRoom: null, eligibleRouteCount: 0, status: "NOT VERIFIED: no room with authored Door access found",
        };
        const { floor, room } = sample;
        const origin = {
          type: "room", buildingId: building.id, floorNumber: floor.number, roomId: room.id,
          roomName: room.name, buildingLabel: building.name, buildingCode: building.code,
          accessDoorIds: room.accessDoorIds ?? (room.accessDoorId ? [room.accessDoorId] : []),
        };
        const evaluation = evaluateRoomEmergencyEvacuation(campus, building.id, floor.id, room.id);
        const automatic = resolveAutomaticStudentEvacuationRoutes(campus, origin);
        return {
          buildingId: building.id, code: building.code, name: building.name,
          assignedAssemblyPoints: assignedPoints.map((point) => ({ id: point.id, name: point.name })),
          sampleRoom: { id: room.id, name: room.name, floorId: floor.id, floorNumber: floor.number },
          eligibleRouteCount: automatic.routes.length,
          automaticRoutes: automatic.routes.map((route) => ({
            id: route.id, label: route.label, exitId: route.candidate.exitId,
            kind: route.candidate.kind, destinationNodeId: route.candidate.destinationNodeId,
            destinationLabel: route.candidate.route.emergencyDestinationLabel,
            campusGateFallback: route.candidate.route.emergencyDestinationFallback === true,
            finalNodeId: route.candidate.route.authoredGraphNodeIds?.at(-1) ?? null,
          })),
          candidates: evaluation.candidates.map((candidate) => ({
            exitId: candidate.exitId, kind: candidate.kind, completeDestinationRoute: candidate.completeDestinationRoute,
            emergencyUseReviewRequired: candidate.emergencyUseReviewRequired,
            reviewRequirements: candidate.emergencyReviewRequirements ?? [],
          })),
          message: automatic.message,
        };
      });
      return {
        found: true,
        campus: {
          id: campus.id, name: campus.name, code: campus.code,
          publishedAt: campus.publishedAt,
          latestPublishedVersionId: publication?.latest_published_version_id ?? null,
          emergencyDestinationPolicy: campus.settings?.emergencyDestinationPolicy ?? "fixed_primary (legacy default)",
          assemblyPoints: (campus.assemblyPoints ?? []).map((point) => ({
            id: point.id, name: point.name, navNodeId: point.navNodeId,
            anchorPresent: campus.navNodes?.some((node) => node.id === point.navNodeId && node.assemblyPointId === point.id) ?? false,
            buildingAssignments: point.buildingAssignments ?? [],
          })),
          gates: (campus.markers ?? []).filter((marker) => marker.type === "gate").map((marker) => ({ id: marker.id, name: marker.name, purpose: marker.purpose, navNodeId: marker.navNodeId })),
        },
        buildings: buildings.map(summarizeBuilding),
        buildingReadiness,
        caba201,
        relevantGraphCounts: {
          navNodes: campus.navNodes?.length ?? 0,
          navEdges: campus.navEdges?.length ?? 0,
          emergencyTraversalEdges: routeEdges.length,
        },
      };
    });
    result.audit = audit;
    if (!audit.found) result.errors.push("Published MAIN CAMPUS snapshot was not returned by the read-only student snapshot RPC.");
    if (!audit.caba201) result.checks.push({ id: "CABA-201", status: "NOT VERIFIED", reason: "No matching CABA-201 room entity was found in the published snapshot." });
    else result.checks.push({ id: "CABA-201", status: audit.caba201.automaticRoutes.length ? "PASS" : "BLOCKED BY CAMPUS DATA", eligibleRouteCount: audit.caba201.automaticRoutes.length, message: audit.caba201.automaticMessage });

    if (audit.caba201) {
      await page.setViewportSize({ width: 390, height: 844 });
      const search = page.getByRole("searchbox", { name: "Search campus map" });
      await search.waitFor({ state: "visible" });
      await search.fill("CABA-201");
      const roomOption = page.getByRole("option", { name: /CABA-201/i }).first();
      await roomOption.waitFor({ state: "visible" });
      await roomOption.click();
      await page.getByRole("button", { name: "Start", exact: true }).click();
      await page.getByRole("button", { name: "SOS routing" }).click();
      const planner = page.getByRole("dialog", { name: "Route planner" });
      await planner.waitFor({ state: "visible" });
      const status = planner.getByTestId("emergency-route-status");
      await status.waitFor({ state: "visible" });
      const findButton = planner.getByRole("button", { name: "Find Route", exact: true });
      const startButtons = planner.getByRole("button", { name: "Start", exact: true });
      const startCount = await startButtons.count();
      result.liveStudentUi = {
        viewport: { width: 390, height: 844 },
        status: await status.getAttribute("data-status"),
        message: (await status.innerText()).replace(/\s+/g, " ").trim(),
        findRouteEnabled: await findButton.isEnabled(),
        startButtonCount: startCount,
        startDisabled: startCount ? await startButtons.last().isDisabled() : null,
      };
      const mobileScreenshot = path.join(__dirname, "main-campus-caba201-sos-unavailable-deep-390.png");
      await page.screenshot({ path: mobileScreenshot, fullPage: false });
      result.screenshots.push(path.basename(mobileScreenshot));
      if (result.liveStudentUi.status !== "unavailable") result.errors.push(`Published CABA-201 status was ${result.liveStudentUi.status ?? "missing"}, expected unavailable.`);
      if (startCount !== 0 && !result.liveStudentUi.startDisabled) result.errors.push("Published CABA-201 exposed an enabled Start action despite an unavailable route.");
      if (result.errors.length) process.exitCode = 1;
      await page.setViewportSize({ width: 1440, height: 900 });
      const desktopScreenshot = path.join(__dirname, "main-campus-caba201-sos-unavailable-deep-1440.png");
      await page.screenshot({ path: desktopScreenshot, fullPage: false });
      result.screenshots.push(path.basename(desktopScreenshot));
    }
  } catch (error) {
    result.errors.push(error.message);
    result.failure = { stack: error.stack?.slice(0, 3000) };
    process.exitCode = 1;
  } finally {
    fs.writeFileSync(output, JSON.stringify(result, null, 2));
    await browser.close();
    console.log(JSON.stringify(result, null, 2));
  }
}

main();

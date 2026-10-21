const path = require("node:path");
const { chromium } = require(path.join(process.env.TEMP, "plv-navisync-acceptance", "node_modules", "playwright"));
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Users/user/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe", args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-gl=angle", "--use-angle=swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto("http://127.0.0.1:5174/map", { waitUntil: "domcontentloaded" });
    await page.getByRole("searchbox", { name: "Search campus map" }).waitFor();
    const summary = await page.evaluate(async () => {
      const service = await import("/src/services/campusService.ts");
      const evacuation = await import("/src/lib/roomEmergencyEvacuation.ts");
      const student = await import("/src/lib/studentEmergencyEvacuation.ts");
      const campuses = await service.listPublishedCampusSnapshots();
      const campus = campuses.find((item) => item.code === "MAIN" && /MAIN CAMPUS - PLV/i.test(item.name));
      if (!campus) throw new Error("Published MAIN CAMPUS snapshot not found");
      const wanted = [/CABA/i, /CEIT/i, /COED/i, /STUDENT CENTER/i];
      const buildings = wanted.map((pattern) => campus.buildings.find((building) => pattern.test(`${building.name} ${building.code}`))).filter(Boolean);
      const rooms = buildings.map((building) => {
        const candidates = building.floors.flatMap((floor) => floor.rooms.map((room) => ({ floor, room }))).sort((a, b) => b.floor.number - a.floor.number);
        const match = building.code === "CABA" ? candidates.find(({ room }) => Boolean(room.accessDoorId || room.accessDoorIds?.length)) ?? candidates[0] : candidates.find(({ room }) => /PLV AUDITORIUM|LECTURE HALL/i.test(room.name)) ?? candidates[0];
        if (!match) return { building: building.name, room: null };
        const { floor, room } = match;
        const evaluation = evacuation.evaluateRoomEmergencyEvacuation(campus, building.id, floor.id, room.id);
        const automatic = student.resolveAutomaticStudentEvacuationRoutes(campus, { type: "room", buildingId: building.id, floorNumber: floor.number, roomId: room.id, roomName: room.name, buildingLabel: building.name, buildingCode: building.code, accessDoorIds: room.accessDoorIds ?? (room.accessDoorId ? [room.accessDoorId] : []) });
        return {
          building: building.name, buildingCode: building.code, room: room.name, floor: { id: floor.id, number: floor.number, label: floor.label },
          ordinaryStairs: building.floors.flatMap((servedFloor) => servedFloor.stairs.map((stair) => ({ floor: servedFloor.label, id: stair.id, label: stair.label, emergencySafe: stair.emergencySafe ?? null, state: stair.state ?? null }))),
          exteriorEmergencyStairs: (building.exteriorEmergencyStairs ?? []).map((stair) => ({ id: stair.id, label: stair.label, emergencySafe: stair.emergencySafe ?? null, servedFloorIds: stair.servedFloorIds, state: stair.state })),
          doorReadiness: evaluation.doorReadiness.map(({ label, state, routeCount }) => ({ label, state, routeCount })),
          graphCandidates: evaluation.candidates.map((candidate) => ({ exit: candidate.exitLabel, assemblyPoint: candidate.assemblyPointName ?? null, completeAssemblyRoute: candidate.completeAssemblyRoute ?? false, emergencyUseReviewRequired: candidate.emergencyUseReviewRequired ?? false, reason: candidate.reason ?? null, indoorSegments: candidate.route.indoorSegments?.map((segment) => ({ floorId: segment.floorId, floorNumber: segment.floorNumber, floorLabel: segment.floorLabel, stairs: segment.stairs })), routeNodes: (candidate.route.authoredGraphNodeIds ?? []).map((id) => { const node = campus.navNodes?.find((item) => item.id === id); return node ? { id, name: node.name, floorId: node.floorId, stairId: node.stairId, exteriorEmergencyStairId: node.exteriorEmergencyStairId, entranceId: node.entranceId, doorId: node.doorId, type: node.type, emergencyStair: node.emergencyStair } : { id }; }), routeEdges: (candidate.route.authoredGraphEdgeIds ?? []).map((id) => { const edge = campus.navEdges?.find((item) => item.id === id); return edge ? { id, type: edge.type, emergencySafe: edge.emergencySafe ?? null, closed: edge.closed ?? false, startNodeId: edge.startNodeId, endNodeId: edge.endNodeId } : { id }; }) })),
          studentEligibleCompleteRoutes: automatic.routes.map((route) => ({ exit: route.candidate.exitLabel, destination: route.candidate.assemblyPointName ?? route.candidate.campusGatePurpose ?? null })),
        };
      });
      return { publishedSnapshot: { id: campus.id, name: campus.name, code: campus.code, assemblyPointCount: campus.assemblyPoints?.length ?? 0, assemblyPoints: (campus.assemblyPoints ?? []).map((point) => ({ id: point.id, name: point.name, navNodeId: point.navNodeId, reviewStatus: point.safetyReview?.status ?? null, assignments: (point.buildingAssignments ?? []).map((assignment) => ({ buildingId: assignment.buildingId, building: campus.buildings.find((building) => building.id === assignment.buildingId)?.name ?? null, designation: assignment.designation })) })) }, buildings: rooms };
    });
    process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
  } finally { await browser.close(); }
})().catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });
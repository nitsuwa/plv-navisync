import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const fixturePath = path.join(os.tmpdir(), "plv-navisync-assembly-test-only.json");
const expectedRooms = [
  /ASSEMBLY HALL/i,
  /CABA LECTURE HALL/i,
  /CEIT LECTURE HALL/i,
  /PLV AUDITORIUM/i,
];

const vite = await createServer({
  configFile: path.join(root, "vite.config.ts"),
  root,
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true, hmr: false },
});

try {
  const campusService = await vite.ssrLoadModule("/src/services/campusService.ts");
  // This is the only production-backed call: the published snapshot RPC is
  // read-only. Every edit, review, approval, and publish below is local data.
  const publishedCampuses = await campusService.listPublishedCampusSnapshots();
  const published = publishedCampuses.find((campus) => campus.code === "MAIN" && /MAIN CAMPUS - PLV/i.test(campus.name));
  assert(published, "The read-only published snapshot did not contain MAIN CAMPUS - PLV.");

  const panel = await vite.ssrLoadModule("/src/components/map-builder/TestNavigationPanel.tsx");
  const evacuation = await vite.ssrLoadModule("/src/lib/roomEmergencyEvacuation.ts");
  const assembly = await vite.ssrLoadModule("/src/lib/emergencyAssemblyPoints.ts");
  const placement = await vite.ssrLoadModule("/src/lib/editorPlacement.ts");
  const student = await vite.ssrLoadModule("/src/lib/studentEmergencyEvacuation.ts");

  const campus = structuredClone(published);
  const originalCampusId = campus.id;
  const testCampusId = "90000000-0000-4000-8000-000000000100";
  const replaceCampusId = (value) => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (key === "campusId" && child === originalCampusId) value[key] = testCampusId;
      else replaceCampusId(child);
    }
  };
  replaceCampusId(campus);
  campus.id = testCampusId;
  campus.name = "TEST ONLY - Isolated PLV Campus Snapshot";
  campus.code = "PLV-TEST";
  campus.isDefault = true;
  campus.assemblyPoints = [];

  const targetRooms = [];
  for (const building of campus.buildings) {
    for (const floor of building.floors) {
      for (const room of floor.rooms) {
        if (expectedRooms.some((pattern) => pattern.test(room.name))) targetRooms.push({ building, floor, room });
      }
    }
  }
  assert.equal(targetRooms.length, expectedRooms.length, "All four required rooms must be present in the isolated snapshot.");

  const routeEdges = panel.buildTestRouteEdges(campus).filter((edge) => edge.type !== "room_door_transition");
  const routePaths = [];
  const rawRoomResults = [];
  for (const { building, floor, room } of targetRooms) {
    for (const doorId of room.accessDoorIds ?? (room.accessDoorId ? [room.accessDoorId] : [])) {
      const doorNode = campus.navNodes.find((node) => node.doorId === doorId && node.buildingId === building.id && node.floorId === floor.id);
      if (!doorNode) continue;
      const choices = panel.chooseEmergencyDestinationCandidates(campus, routeEdges, doorNode.id);
      const path = choices[0]?.path;
      if (!path) continue;
      const nodes = path.nodeIds.map((id) => campus.navNodes.find((node) => node.id === id)).filter(Boolean);
      routePaths.push(new Set(nodes.filter((node) => node.type === "outdoor"
        && !node.floorId && !node.entranceId && !node.doorId && !node.roomId && !node.gateId
        && !node.exteriorEmergencyStairId && !node.derivedOwnerType).map((node) => node.id)));
      rawRoomResults.push({ room: room.name, doorId, destinationNodeId: choices[0].candidate.nodeId, routeNodeCount: path.nodeIds.length });
    }
  }
  assert(routePaths.length > 0, "The published graph has no emergency-safe door-to-campus route paths.");
  const sharedOutdoorNodeIds = [...routePaths[0]].filter((id) => routePaths.every((nodes) => nodes.has(id)));
  const sharedOutdoorNodes = sharedOutdoorNodeIds.map((id) => campus.navNodes.find((node) => node.id === id))
    .filter((node) => node && !campus.buildings.some((building) => placement.pointInBuilding(building, node)));
  assert(sharedOutdoorNodes.length > 0, "The authored exit paths have no shared outdoor walking waypoint for an isolated test destination.");
  const anchor = sharedOutdoorNodes[0];

  const pointId = "90000000-0000-4000-8000-000000000101";
  const pointName = "TEST ONLY - Main Assembly Point A";
  campus.assemblyPoints = [{
    id: pointId,
    name: pointName,
    x: anchor.x,
    y: anchor.y,
    campusId: testCampusId,
    navNodeId: anchor.id,
    buildingAssignments: targetRooms.map(({ building }) => ({ buildingId: building.id, designation: "primary" })),
  }];
  const linkedCampus = assembly.syncEmergencyAssemblyPointNavigation(campus, (prefix) => `${prefix}-test-only`);
  const linkedPoint = linkedCampus.assemblyPoints[0];
  assert.equal(linkedPoint.navNodeId, anchor.id, "Placement on a real outdoor graph node should reuse that node.");
  const initialValidation = assembly.assemblyPointValidation(linkedCampus, linkedPoint);
  assert.equal(initialValidation.connection, "connected", JSON.stringify(initialValidation.reasons));
  assert.equal(initialValidation.readiness, "ready_for_review", JSON.stringify(initialValidation.reasons));
  linkedPoint.safetyReview = {
    status: "approved",
    approvedAt: "2026-10-15T00:00:00.000Z",
    approvedBy: "isolated-test-reviewer",
    approvedByRole: "admin",
    fingerprint: assembly.assemblyPointReviewFingerprint(linkedCampus, linkedPoint),
  };
  const pointValidation = assembly.assemblyPointValidation(linkedCampus, linkedPoint);
  assert.equal(pointValidation.readiness, "approved", JSON.stringify(pointValidation.reasons));

  const roomResults = [];
  for (const { building, floor, room } of targetRooms) {
    const evaluation = evacuation.evaluateRoomEmergencyEvacuation(linkedCampus, building.id, floor.id, room.id);
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
        approvedBy: "isolated-test-reviewer",
        approvedByRole: "admin",
        approvedRouteSignature: candidate.routeSignature,
      })),
    };
    const roomDest = {
      type: "room",
      buildingId: building.id,
      floorNumber: floor.number,
      roomId: room.id,
      roomName: room.name,
      buildingLabel: building.name,
      buildingCode: building.code,
    };
    const resolved = student.resolveApprovedStudentEvacuationRoutes(linkedCampus, roomDest);
    assert.equal(resolved.routes.length, complete.length, `${room.name}: resolved routes should match complete graph candidates.`);
    assert(resolved.routes.every((option) => option.candidate.assemblyPointId === pointId), `${room.name}: every route should end at the test Assembly Point.`);
    assert(resolved.routes.every((option) => option.candidate.destinationNodeId === linkedPoint.navNodeId), `${room.name}: final graph node should be the Assembly Point anchor.`);
    roomResults.push({
      name: room.name,
      building: building.name,
      floor: floor.label,
      internalFloor: floor.number,
      assignedDoors: room.accessDoorIds ?? (room.accessDoorId ? [room.accessDoorId] : []),
      connectedDoorCount: evaluation.doorReadiness.filter((door) => door.state === "route_ready").length,
      distinctExits: [...new Set(complete.map((candidate) => candidate.exitId))],
      routeCount: resolved.routes.length,
      destinations: resolved.routes.map((option) => option.candidate.assemblyPointName),
      distances: resolved.routes.map((option) => option.candidate.distanceM),
      routeNodeIds: resolved.routes.map((option) => option.candidate.route.pathNodeIds ?? []),
      doorReadiness: evaluation.doorReadiness.map((door) => ({ label: door.label, state: door.state, routeCount: door.routeCount })),
    });
  }

  const assemblyPointPath = (linkedCampus.navEdges ?? []).filter((edge) => edge.startNodeId === linkedPoint.navNodeId || edge.endNodeId === linkedPoint.navNodeId);
  assert(assemblyPointPath.length > 0, "The point anchor must retain actual authored pathway edges.");
  const campusSegments = roomResults.map((result) => {
    const target = targetRooms.find(({ room }) => room.name === result.name);
    const resolved = student.resolveApprovedStudentEvacuationRoutes(linkedCampus, {
      type: "room", buildingId: target.building.id, floorNumber: target.floor.number,
      roomId: target.room.id, roomName: target.room.name, buildingLabel: target.building.name, buildingCode: target.building.code,
    });
    return student.studentEmergencyCampusRouteSegments(resolved.routes).map((segment) => ({
      label: segment.label,
      points: segment.points.length,
      endsAtPoint: segment.points.at(-1)?.x === linkedPoint.x && segment.points.at(-1)?.y === linkedPoint.y,
    }));
  });
  assert(campusSegments.flat().every((segment) => segment.points > 1), "Student outdoor route overlays must have connected waypoint geometry.");

  const output = {
    testOnly: true,
    source: "sanitized published PLV snapshot read via the public read-only snapshot RPC; all edits remain in memory/local fixture",
    campusName: linkedCampus.name,
    campusId: linkedCampus.id,
    assemblyPoint: {
      id: linkedPoint.id,
      name: linkedPoint.name,
      x: linkedPoint.x,
      y: linkedPoint.y,
      navNodeId: linkedPoint.navNodeId,
      connection: pointValidation.connection,
      approval: pointValidation.readiness,
      incidentPathEdgeCount: assemblyPointPath.length,
      assignedBuildings: linkedPoint.buildingAssignments.map((assignment) => assignment.buildingId),
    },
    rooms: roomResults,
    studentOutdoorSegments: campusSegments,
    originalSnapshotAssemblyPointCount: published.assemblyPoints?.length ?? 0,
    snapshotPath: fixturePath,
  };

  fs.writeFileSync(fixturePath, JSON.stringify(linkedCampus), "utf8");
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
} finally {
  await vite.close();
}

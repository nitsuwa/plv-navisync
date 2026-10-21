const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(process.env.TEMP, "plv-navisync-acceptance", "node_modules", "playwright"));
const file = "verification-artifacts/assembly-point-ordinary-sos/admin-conflict-rerun-draft/student-preview/test-only-campus-saved-route-approved.json";
const campus = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
const target = campus.buildings.flatMap((building) => building.floors.flatMap((floor) => floor.rooms.map((room) => ({ building, floor, room })))).find(({ room }) => /CABA LECTURE HALL/i.test(room.name));
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Users/user/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe" });
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:5174/");
  const result = await page.evaluate(async ({ campus, buildingId, floorId, roomId }) => {
    const [{ evaluateRoomEmergencyEvacuation }, { assemblyPointValidation }] = await Promise.all([
      import("/src/lib/roomEmergencyEvacuation.ts"), import("/src/lib/emergencyAssemblyPoints.ts")
    ]);
    const evaluation = evaluateRoomEmergencyEvacuation(campus, buildingId, floorId, roomId);
    const points = (campus.assemblyPoints || []).filter((point) => point.buildingAssignments?.some((assignment) => assignment.buildingId === buildingId)).map((point) => ({ id: point.id, name: point.name, assignment: point.buildingAssignments.filter((assignment) => assignment.buildingId === buildingId), validation: assemblyPointValidation(campus, point) }));
    return { message: evaluation.message, doorReadiness: evaluation.doorReadiness, candidates: evaluation.candidates.map(({ id, doorLabel, exitLabel, destination, assemblyPointId, assemblyPointDesignation, completeAssemblyRoute, graphCompleteAssemblyRoute, emergencyUseReviewRequired, assemblyPointReviewRequired, routeSignature, transitions, distanceM, emergencyReviewRequirements }) => ({ id, doorLabel, exitLabel, destination, assemblyPointId, assemblyPointDesignation, completeAssemblyRoute, graphCompleteAssemblyRoute, emergencyUseReviewRequired, assemblyPointReviewRequired, routeSignature, transitions: transitions?.length, distanceM, emergencyReviewRequirements })), points };
  }, { campus, buildingId: target.building.id, floorId: target.floor.id, roomId: target.room.id });
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})();
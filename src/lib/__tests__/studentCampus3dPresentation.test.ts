import { describe, expect, it } from "vitest";
import type { CampusBuilding, CampusDecorAsset, CampusMarker } from "../../components/map-builder/types";
import { canEnterOutdoorBuilding } from "../../components/map-builder/ReadonlyOutdoorVisuals";
import type { ReadonlyOutdoorCampus, ReadonlyOutdoorEntrance } from "../readonlyOutdoorCampus";
import { campusEmergencyExitDoorHeight, campusEmergencyExitVisualElevation, campusEntranceFacingYaw, campusFireEscapeLevels, campusGateFacingRotation, campusParkingMarkingSegments, dedupePhysicalCampusEntrances, groundedModelOffset, groupCampusDecorAssetsByType, resolveCampusEntrancePresentations, STUDENT_CAMPUS_3D_GROUND_EPSILON, studentEntranceStairFlightLayout, resolveStudentEntranceRampPlacement, resolveStudentEntranceStairPlacement, resolveStudentEntranceStairYaw, resolveSuhayHusayDecorAssetId, resolveSuhayHusayDecorAssetIds, studentEntranceRampGroundDirection, studentExteriorZone3dHeights, studentExteriorZone3dPresentation, usesCompactGroundEmergencyExit } from "../studentCampus3dPresentation";
import { exteriorZoneAccessFeatureGeometry } from "../exteriorFloorZones";

const building = { id: "b1", x: 0, y: 0, width: 100, height: 60, floors: [] } as unknown as CampusBuilding;
const entrance = (id: string, overrides: Partial<ReadonlyOutdoorEntrance> = {}): ReadonlyOutdoorEntrance => ({
  id,
  buildingId: building.id,
  edge: "bottom",
  offset: 0.5,
  type: "general",
  ...overrides,
});

describe("Student Campus 3D presentation helpers", () => {
  it("keeps veranda surfaces thin and integrated without hiding authored exterior access", () => {
    expect(studentExteriorZone3dPresentation("veranda")).toEqual({ thickness: 0.035, color: "#cbbb9f", sideRails: false });
    expect(studentExteriorZone3dPresentation("covered_walkway")).toMatchObject({ thickness: 0.08, sideRails: true });
    expect(studentExteriorZone3dPresentation("entrance_landing").sideRails).toBe(false);
  });

  it("orients local +Z toward the authored campus-side facade direction", () => {
    const outward = (mapAngle: number) => {
      const yaw = campusEntranceFacingYaw(mapAngle);
      return { x: Math.sin(yaw), z: Math.cos(yaw) };
    };
    expect(outward(-90)).toMatchObject({ x: expect.closeTo(0), z: expect.closeTo(-1) }); // north
    expect(outward(0)).toMatchObject({ x: expect.closeTo(1), z: expect.closeTo(0) }); // east
    expect(outward(90)).toMatchObject({ x: expect.closeTo(0), z: expect.closeTo(1) }); // south
    expect(outward(180)).toMatchObject({ x: expect.closeTo(-1), z: expect.closeTo(0) }); // west
  });

  it("deduplicates multiple authored records for the same physical entrance and keeps the primary one", () => {
    const duplicate = entrance("secondary");
    const primary = entrance("primary", { isPrimary: true });
    expect(dedupePhysicalCampusEntrances([duplicate, primary], [building])).toEqual([primary]);
  });

  it("keeps exit-only physical doors while withholding the Campus Enter action", () => {
    const exitOnly = entrance("exit", { direction: "exit_only" });
    const firstDoor = entrance("door-a", { edge: "left", offset: 0.2 });
    const secondDoor = entrance("door-b", { edge: "right", offset: 0.8 });
    const visible = resolveCampusEntrancePresentations([exitOnly, firstDoor, secondDoor], [building], canEnterOutdoorBuilding);

    expect(visible.map((item) => item.entrance)).toEqual([exitOnly, firstDoor, secondDoor]);
    expect(visible.map((item) => item.canEnterFromCampus)).toEqual([false, true, true]);
  });

  it("draws one physical doorway and keeps its Enter action if any coincident authored record permits it", () => {
    const exitOnlyPrimary = entrance("exit-primary", { direction: "exit_only", isPrimary: true });
    const bidirectional = entrance("door-bidirectional");
    const resolved = resolveCampusEntrancePresentations([exitOnlyPrimary, bidirectional], [building], canEnterOutdoorBuilding);

    expect(resolved).toHaveLength(1);
    expect(resolved[0].canEnterFromCampus).toBe(true);
  });

  it("grounds a model by subtracting its scaled local-space lower bound", () => {
    expect(groundedModelOffset(-0.5, 2)).toBeCloseTo(1.002);
  });

  it("generates restrained two-row parking markings inside the authored area", () => {
    const markings = campusParkingMarkingSegments(120, 28);
    expect(markings.filter((line) => line.kind === "stall-divider")).toHaveLength(6);
    expect(markings.filter((line) => line.kind === "stall-row-edge")).toHaveLength(2);
    expect(markings.filter((line) => line.kind === "drive-aisle")).toHaveLength(1);
    for (const line of markings) {
      for (const [x, z] of [[line.x1, line.z1], [line.x2, line.z2]]) {
        expect(Math.abs(x)).toBeLessThanOrEqual(60);
        expect(Math.abs(z)).toBeLessThanOrEqual(14);
      }
    }
  });

  it("orients parking bays along the dominant authored axis", () => {
    const markings = campusParkingMarkingSegments(24, 96);
    const divider = markings.find((line) => line.kind === "stall-divider");
    expect(divider).toBeDefined();
    expect(divider!.x1).not.toBe(divider!.x2);
    expect(divider!.z1).toBe(divider!.z2);
  });

  it("caps parking stripe density at a readable renderer-only level", () => {
    const markings = campusParkingMarkingSegments(500, 70);
    expect(markings.filter((line) => line.kind === "stall-divider")).toHaveLength(18);
  });

  it("faces attached veranda steps toward their authored ramp before using the facade", () => {
    expect(resolveStudentEntranceStairYaw({
      authoredRotation: 0,
      connectionDirection: { x: 1, y: 0 },
      outwardDirection: { x: 0, y: 1 },
    })).toBeCloseTo(Math.PI / 2);
    expect(resolveStudentEntranceStairYaw({ authoredRotation: 0, outwardDirection: { x: 0, y: 1 } })).toBeCloseTo(0);
    expect(resolveStudentEntranceStairYaw({ authoredRotation: 0, outwardDirection: { x: -1, y: 0 } })).toBeCloseTo(-Math.PI / 2);
  });

  it("meets the rendered veranda and points both side-mounted stairs outward", () => {
    const zone = { id: "veranda", type: "veranda" as const, side: "bottom" as const, offset: 0.5, width: 200, depth: 40 };
    const authored = { x: 9000, y: 8000, width: 40, height: 24, rotation: 0 };
    const leftAttachment = exteriorZoneAccessFeatureGeometry(zone, {
      ...authored, attachmentEdge: "start", attachmentOffset: 0.5,
    }, 400, 300)!;
    const rightAttachment = exteriorZoneAccessFeatureGeometry(zone, {
      ...authored, attachmentEdge: "end", attachmentOffset: 0.5,
    }, 400, 300)!;
    const { topY } = studentExteriorZone3dHeights("veranda", 0.012);
    const left = resolveStudentEntranceStairPlacement({
      authored, attachment: leftAttachment, floorSurfaceY: 0.012, platformTopY: topY,
      connectionDirection: { x: 0, y: 1 }, // sibling ramp is not allowed to face this side stair along the facade
    });
    const right = resolveStudentEntranceStairPlacement({
      authored, attachment: rightAttachment, floorSurfaceY: 0.012, platformTopY: topY,
      connectionDirection: { x: 0, y: 1 },
    });

    expect(left).toMatchObject({ center: { x: 88, y: 320 }, width: 40, depth: 24 });
    expect(right).toMatchObject({ center: { x: 312, y: 320 }, width: 40, depth: 24 });
    // The Student 3D veranda is renderer-only geometry, so its elevation is
    // the authored stair's presentation endpoint. Five visible steps need a
    // real rise; a 4 cm platform makes the current 7 cm treads overlap.
    expect(left.rise).toBeCloseTo(0.42);
    expect(right.rise).toBeCloseTo(0.42);
    expect(left.rise / 5).toBeGreaterThan(0.07);
    expect(right.rise / 5).toBeGreaterThan(0.07);
    expect(Math.sin(left.yaw)).toBeCloseTo(-1);
    expect(Math.cos(left.yaw)).toBeCloseTo(0);
    expect(Math.sin(right.yaw)).toBeCloseTo(1);
    expect(Math.cos(right.yaw)).toBeCloseTo(0);
    expect(0.012 + left.rise).toBeCloseTo(topY);
    expect(0.012 + right.rise).toBeCloseTo(topY);
  });

  it("keeps entrance stair treads visibly stepped and lands them flush at both ends", () => {
    for (const count of [5, 10]) {
      const flight = studentEntranceStairFlightLayout(1.15, 0.42, count);
      expect(flight.stepRise).toBeGreaterThan(flight.treadThickness);
      expect(flight.treadSurfaceHeights).toHaveLength(count);
      expect(flight.treadSurfaceHeights[0]).toBeGreaterThan(0);
      expect(flight.treadSurfaceHeights.at(-1)).toBeCloseTo(0.42);
      expect(flight.treadSurfaceHeights.every((height, index, heights) =>
        index === 0 || height > heights[index - 1]!
      )).toBe(true);
      expect(flight.lowerLandingCenterZ - flight.lowerLandingDepth / 2).toBeCloseTo(flight.fromZ);
      // The bottom tread meets the lower landing at fromZ; the top tread
      // terminates at the veranda edge, and its top surface reaches the
      // veranda elevation rather than stopping half a step short.
      const firstTreadCenterZ = flight.fromZ - flight.treadDepth / 2;
      const lastTreadCenterZ = flight.toZ + flight.treadDepth / 2;
      expect(firstTreadCenterZ + flight.treadDepth / 2).toBeCloseTo(flight.fromZ);
      expect(lastTreadCenterZ - flight.treadDepth / 2).toBeCloseTo(flight.toZ);
      expect(flight.toZ).toBeCloseTo(-1.15 / 2);
    }
  });

  it("aligns both authored veranda ramps to the rendered platform and sends them down to ground", () => {
    const zone = { id: "veranda", type: "veranda" as const, side: "bottom" as const, offset: 0.5, width: 400, depth: 48 };
    const authored = { x: 9000, y: 8000, width: 100, height: 40, rotation: 0 };
    const { topY } = studentExteriorZone3dHeights("veranda", 0.012);
    const placements = [0.25, 0.75].map((attachmentOffset) => {
      const attachment = exteriorZoneAccessFeatureGeometry(zone, {
        ...authored, attachmentEdge: "outer", attachmentOffset,
      }, 400, 300)!;
      return resolveStudentEntranceRampPlacement({ authored, attachment, floorSurfaceY: 0.012, platformTopY: topY });
    });

    expect(placements).toHaveLength(2);
    for (const placement of placements) {
      expect(placement).not.toBeNull();
      expect(placement!.direction).toBe(-1);
      expect(placement!.yaw).toBeCloseTo(0);
      expect(placement!.outwardDirection).toEqual({ x: 0, y: 1 });
      // Local +Z points outside. Its positive end is the ground end; the
      // negative end lands exactly on the veranda attachment edge.
      expect(placement!.center.y + placement!.outwardDirection.y * placement!.depth / 2).toBeCloseTo(388);
      expect(placement!.center.y - placement!.outwardDirection.y * placement!.depth / 2).toBeCloseTo(348);
      expect(0.012 + STUDENT_CAMPUS_3D_GROUND_EPSILON).toBeCloseTo(0.014);
      expect(0.012 + placement!.rise + STUDENT_CAMPUS_3D_GROUND_EPSILON).toBeCloseTo(topY);
      expect(placement!.rise).toBeGreaterThan(0.35);
    }
    expect(placements[0]!.center.x).toBeLessThan(placements[1]!.center.x);
    expect(placements[0]!.center.x).toBeCloseTo(100);
    expect(placements[1]!.center.x).toBeCloseTo(300);
  });

  it("orients attached side ramps toward their actual exterior edge", () => {
    const zone = { id: "veranda", type: "veranda" as const, side: "bottom" as const, offset: 0.5, width: 200, depth: 40 };
    const authored = { x: 0, y: 0, width: 64, height: 32, rotation: 0 };
    const leftAttachment = exteriorZoneAccessFeatureGeometry(zone, {
      ...authored, attachmentEdge: "start", attachmentOffset: 0.5,
    }, 400, 300)!;
    const rightAttachment = exteriorZoneAccessFeatureGeometry(zone, {
      ...authored, attachmentEdge: "end", attachmentOffset: 0.5,
    }, 400, 300)!;
    const left = resolveStudentEntranceRampPlacement({ authored, attachment: leftAttachment, floorSurfaceY: 0.012, platformTopY: 0.432 });
    const right = resolveStudentEntranceRampPlacement({ authored, attachment: rightAttachment, floorSurfaceY: 0.012, platformTopY: 0.432 });

    expect(left?.outwardDirection).toEqual({ x: -1, y: 0 });
    expect(right?.outwardDirection).toEqual({ x: 1, y: 0 });
    expect(Math.sin(left!.yaw)).toBeCloseTo(-1);
    expect(Math.cos(left!.yaw)).toBeCloseTo(0);
    expect(Math.sin(right!.yaw)).toBeCloseTo(1);
    expect(Math.cos(right!.yaw)).toBeCloseTo(0);
    expect(left!.width).toBeCloseTo(64);
    expect(left!.depth).toBeCloseTo(32);
  });

  it("uses the authored entrance ramp downhill end when orienting veranda steps", () => {
    expect(studentEntranceRampGroundDirection({ x: 10, y: 30 }, {
      x: 0, y: 0, width: 20, height: 40, rotation: 0, direction: "forward",
    })).toEqual({ x: 0, y: -30 });
    expect(studentEntranceRampGroundDirection({ x: 10, y: 30 }, {
      x: 0, y: 0, width: 20, height: 40, rotation: 0, direction: "reverse",
    })).toEqual({ x: 0, y: 10 });
  });

  it("projects only authored served floors into a compact fire-escape layout", () => {
    const floors = [
      { id: "g", number: 1 }, { id: "2f", number: 2 }, { id: "3f", number: 3 }, { id: "4f", number: 4 },
    ];
    expect(campusFireEscapeLevels(floors, ["g"], 0.2)).toEqual([{ floorIndex: 0, elevation: 0, served: true }]);
    expect(campusFireEscapeLevels(floors, ["2f"], 0.2)).toEqual([
      { floorIndex: 0, elevation: 0, served: false },
      { floorIndex: 1, elevation: 0.2, served: true },
    ]);
    expect(campusFireEscapeLevels(floors, ["4f"], 0.2)).toEqual([
      { floorIndex: 0, elevation: 0, served: false },
      { floorIndex: 1, elevation: 0.2, served: false },
      { floorIndex: 2, elevation: 0.4, served: false },
      { floorIndex: 3, elevation: 0.6000000000000001, served: true },
    ]);
    expect(campusFireEscapeLevels(floors, ["g", "4f"], 0.2)).toEqual([
      { floorIndex: 0, elevation: 0, served: true },
      { floorIndex: 1, elevation: 0.2, served: false },
      { floorIndex: 2, elevation: 0.4, served: false },
      { floorIndex: 3, elevation: 0.6000000000000001, served: true },
    ]);
    expect(usesCompactGroundEmergencyExit(campusFireEscapeLevels(floors, ["g"], 0.2))).toBe(true);
    expect(usesCompactGroundEmergencyExit(campusFireEscapeLevels(floors, ["2f"], 0.2))).toBe(false);
    expect(campusEmergencyExitDoorHeight(campusFireEscapeLevels(floors, ["4f"], 0.2))).toBeCloseTo(0.164);
  });

  it("raises a ground-level emergency threshold for a visible short egress stair", () => {
    expect(campusEmergencyExitVisualElevation(0, 0)).toBe(0.18);
    expect(campusEmergencyExitVisualElevation(2, 0.4)).toBe(0.4);
    expect(campusEmergencyExitVisualElevation(0, 0.24)).toBe(0.24);
  });

  it("batches outdoor assets without inventing, dropping, sorting, or cloning authored instances", () => {
    const firstTree = { id: "tree-1", type: "tree-large", x: 20, y: 40 } as CampusDecorAsset;
    const firstBench = { id: "bench-1", type: "bench", x: 22, y: 80 } as CampusDecorAsset;
    const secondTree = { id: "tree-2", type: "tree-large", x: 20, y: 120 } as CampusDecorAsset;
    const secondBench = { id: "bench-2", type: "bench", x: 22, y: 160 } as CampusDecorAsset;
    const authored = [firstTree, firstBench, secondTree, secondBench];
    const groups = groupCampusDecorAssetsByType(authored);

    expect(groups.get("tree-large")).toEqual([firstTree, secondTree]);
    expect(groups.get("bench")).toEqual([firstBench, secondBench]);
    expect([...groups.values()].flat()).toHaveLength(authored.length);
    expect(groups.get("tree-large")?.[0]).toBe(firstTree);
    expect(groups.get("bench")?.[0]).toBe(firstBench);
  });

  it("resolves the same authored Suhay Husay monument for 2D and 3D, with a legacy single-monument fallback", () => {
    const assets = [
      { id: "plaza-statue", type: "monument", name: "Suhay Husay", x: 20, y: 20 },
      { id: "another-statue", type: "monument", name: "Other Landmark", x: 40, y: 40 },
    ] as CampusDecorAsset[];
    expect(resolveSuhayHusayDecorAssetId(assets)).toBe("plaza-statue");
    expect(resolveSuhayHusayDecorAssetId([assets[1]])).toBe("another-statue");
    expect(resolveSuhayHusayDecorAssetId([])).toBeNull();
  });

  it("resolves explicitly identified Suhay instances without reclassifying unnamed legacy monuments", () => {
    const assets = [
      { id: "new-suhay-a", type: "monument", visualVariant: "suhay-husay", x: 10, y: 10 },
      { id: "legacy-statue", type: "monument", name: "Memorial", x: 30, y: 30 },
      { id: "named-suhay-b", type: "monument", name: "Suhay Husay South", x: 50, y: 50 },
    ] as CampusDecorAsset[];
    expect([...resolveSuhayHusayDecorAssetIds(assets)]).toEqual(["new-suhay-a", "named-suhay-b"]);
    expect([...resolveSuhayHusayDecorAssetIds(assets.slice(0, 2))]).toEqual(["new-suhay-a"]);
  });

  it("uses the nearest campus path direction to face the gate toward campus circulation", () => {
    const marker = { id: "gate", x: 0, y: 100, type: "gate", name: "Gate", color: "#2563eb" } as CampusMarker;
    const campus = {
      buildings: [{ ...building, x: 0, y: 0, width: 50, height: 20 }],
      paths: [{ id: "approach", type: "walkway", width: 12, color: "#fff", points: [{ x: 0, y: 100 }, { x: 0, y: 50 }] }],
      canvasW: 100,
      canvasH: 120,
    } as unknown as ReadonlyOutdoorCampus;
    const angle = campusGateFacingRotation(marker, campus);
    expect(Math.sin(angle)).toBeCloseTo(0);
    expect(Math.cos(angle)).toBeLessThan(0);
  });

  it("aligns the gate to its approach path when the saved yaw is slightly skewed", () => {
    const marker = { id: "gate", x: 0, y: 100, type: "gate", name: "Gate", color: "#2563eb", rotation: 17 } as CampusMarker;
    const campus = {
      buildings: [{ ...building, x: 0, y: 0, width: 50, height: 20 }],
      paths: [{ id: "approach", type: "walkway", width: 12, color: "#fff", points: [{ x: 0, y: 100 }, { x: 0, y: 50 }] }],
      canvasW: 100,
      canvasH: 120,
    } as unknown as ReadonlyOutdoorCampus;
    const angle = campusGateFacingRotation(marker, campus);
    expect(Math.sin(angle)).toBeCloseTo(0);
    expect(Math.cos(angle)).toBeLessThan(0);
  });

  it("keeps a diagonal approach from introducing a tilted gate yaw", () => {
    const marker = { id: "gate", x: 0, y: 0, type: "gate", name: "Gate", color: "#2563eb" } as CampusMarker;
    const campus = {
      buildings: [{ ...building, x: 100, y: 0, width: 50, height: 20 }],
      paths: [{ id: "diagonal-approach", type: "walkway", width: 12, color: "#fff", points: [{ x: 0, y: 0 }, { x: 40, y: 40 }] }],
      canvasW: 200,
      canvasH: 120,
    } as unknown as ReadonlyOutdoorCampus;
    expect(campusGateFacingRotation(marker, campus)).toBeCloseTo(Math.PI / 2);
  });

  it("prefers an authored gate rotation when one is present", () => {
    const marker = { id: "gate", x: 0, y: 100, type: "gate", name: "Gate", color: "#2563eb", rotation: 90 } as CampusMarker;
    const campus = { buildings: [], paths: [], canvasW: 100, canvasH: 100 } as unknown as ReadonlyOutdoorCampus;
    expect(campusGateFacingRotation(marker, campus)).toBeCloseTo(-Math.PI / 2);
  });
});

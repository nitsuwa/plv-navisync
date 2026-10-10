import { describe, expect, it } from "vitest";
import type { CampusBuilding, CampusDecorAsset, CampusMarker } from "../../components/map-builder/types";
import { canEnterOutdoorBuilding } from "../../components/map-builder/ReadonlyOutdoorVisuals";
import type { ReadonlyOutdoorCampus, ReadonlyOutdoorEntrance } from "../readonlyOutdoorCampus";
import { campusEntranceFacingYaw, campusFireEscapeLevels, campusGateFacingRotation, campusParkingMarkingSegments, dedupePhysicalCampusEntrances, groundedModelOffset, groupCampusDecorAssetsByType, resolveCampusEntrancePresentations, resolveSuhayHusayDecorAssetId } from "../studentCampus3dPresentation";

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
    expect(markings.filter((line) => line.kind === "stall-divider")).toHaveLength(12);
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

  it("projects only authored served floors into a compact fire-escape layout", () => {
    const floors = [
      { id: "g", number: 1 }, { id: "2f", number: 2 }, { id: "3f", number: 3 }, { id: "4f", number: 4 },
    ];
    expect(campusFireEscapeLevels(floors, ["g"], 0.2)).toEqual([{ floorIndex: 0, elevation: 0, served: true }]);
    expect(campusFireEscapeLevels(floors, ["2f"], 0.2)).toEqual([
      { floorIndex: 0, elevation: 0, served: false },
      { floorIndex: 1, elevation: 0.2, served: true },
    ]);
    expect(campusFireEscapeLevels(floors, ["g", "4f"], 0.2)).toEqual([
      { floorIndex: 0, elevation: 0, served: true },
      { floorIndex: 1, elevation: 0.2, served: false },
      { floorIndex: 2, elevation: 0.4, served: false },
      { floorIndex: 3, elevation: 0.6000000000000001, served: true },
    ]);
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

  it("prefers an authored gate rotation when one is present", () => {
    const marker = { id: "gate", x: 0, y: 100, type: "gate", name: "Gate", color: "#2563eb", rotation: 90 } as CampusMarker;
    const campus = { buildings: [], paths: [], canvasW: 100, canvasH: 100 } as unknown as ReadonlyOutdoorCampus;
    expect(campusGateFacingRotation(marker, campus)).toBeCloseTo(-Math.PI / 2);
  });
});

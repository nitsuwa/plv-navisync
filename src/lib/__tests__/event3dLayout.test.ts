import { describe, expect, it } from "vitest";
import { eventAsset3DTransform, event3DLayoutBounds, event3DCameraPose, event3DOutdoorTargetBounds } from "../event3dLayout";
import * as THREE from "three";
import type { FloorFurniture } from "../../components/map-builder/types";

const chair: FloorFurniture = { id: "chair", type: "chair", name: "Chair", category: "event", x: 100, y: 200, width: 40, height: 20, rotation: 90, color: "#123456", layer: "events" };
describe("event 3D layout", () => {
  it("keeps the plotted center and rotation in indoor world coordinates", () => {
    const value = eventAsset3DTransform(chair, { scale: 0.025, originX: 400, originY: 300 });
    expect(value?.position).toEqual([-7, 0.025, -2.25]);
    expect(value?.width).toBe(1);
    expect(value?.depth).toBe(0.5);
    expect(value?.rotation).toBeCloseTo(-Math.PI / 2);
  });
  it("uses outdoor authored coordinates and never caps a large stage footprint", () => {
    const value = eventAsset3DTransform({ ...chair, type: "stage", width: 600, height: 300 }, { scale: 0.01, originX: 0, originY: 0 });
    expect(value?.position).toEqual([4, 0.025, 3.5]);
    expect(value?.width).toBe(6);
    expect(value?.depth).toBe(3);
  });
  it("excludes hidden and malformed assets instead of putting them at the origin", () => {
    for (const patch of [{ visible: false }, { x: NaN }, { width: 0 }, { height: -1 }]) {
      expect(eventAsset3DTransform({ ...chair, ...patch }, { scale: 0.01, originX: 0, originY: 0 })).toBeNull();
    }
  });
  it("focuses the rotated footprint and includes labels without mutating input", () => {
    const bounds = event3DLayoutBounds([chair, { ...chair, id: "hidden", x: 900, visible: false }], [{ id: "label", x: 80, y: 190, text: "Welcome", fontSize: 14, color: "#000", rotation: 0, align: "left" }]);
    expect(bounds).toEqual({ x: 80, y: 190, width: 50, height: 40 });
    expect(chair.rotation).toBe(90);
  });
  it("returns no focus bounds for an empty layout", () => {
    expect(event3DLayoutBounds([], [])).toBeNull();
  });
  it.each([{ type: "tent", width: 80, height: 80, wantHeight: 3.3 }, { type: "chair", width: 400, height: 400, wantHeight: 19.5 }])("keeps the complete $type model inside a focused camera view", ({ type, width, height, wantHeight }: { type: string; width: number; height: number; wantHeight: number }) => {
    const item = { ...chair, type, width, height, rotation: 0 };
    const frame = { scale: 0.025, originX: 400, originY: 300 };
    const model = eventAsset3DTransform(item, frame)!;
    expect(model.height).toBeCloseTo(wantHeight);
    const pose = event3DCameraPose(event3DLayoutBounds([item], [])!, frame, 1.5, 42, model.height);
    const camera = new THREE.PerspectiveCamera(42, 1.5, 0.1, 1000);
    camera.position.set(...pose.position); camera.lookAt(new THREE.Vector3(...pose.target)); camera.updateMatrixWorld();
    for (const x of [-model.width / 2, model.width / 2]) for (const z of [-model.depth / 2, model.depth / 2]) for (const y of [0, wantHeight]) {
      const projected = new THREE.Vector3(model.position[0] + x, model.position[1] + y, model.position[2] + z).project(camera);
      expect(Math.abs(projected.x)).toBeLessThan(1);
      expect(Math.abs(projected.y)).toBeLessThan(1);
    }
  });
  it("allows focusing event assets anywhere inside the outdoor canvas", () => {
    const base = { minX: 0.5, maxX: 3.5, minY: 0.02, maxY: 2, minZ: 0.5, maxZ: 3.5 };
    const result = event3DOutdoorTargetBounds(base, 900, 680, 0.01, true);
    expect(result).toEqual({ ...base, minX: 0, maxX: 9, minZ: 0, maxZ: 6.8 });
    expect(event3DOutdoorTargetBounds(base, 900, 680, 0.01, false)).toEqual(base);
    expect(event3DOutdoorTargetBounds(base, 900, 680, 0.01, true, 8).maxY).toBe(4.025);
  });
  it("fits a wide layout in a narrow viewport with finite camera coordinates", () => {
    const narrow = event3DCameraPose({ x: 0, y: 0, width: 800, height: 200 }, { scale: 0.025, originX: 400, originY: 100 }, 0.5, 42);
    const wide = event3DCameraPose({ x: 0, y: 0, width: 800, height: 200 }, { scale: 0.025, originX: 400, originY: 100 }, 2, 42);
    expect(narrow.target).toEqual([0, 0.025, 0]);
    expect(narrow.distance).toBeGreaterThan(wide.distance);
    expect(narrow.position.every(Number.isFinite)).toBe(true);
  });
});

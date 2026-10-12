import { MOUSE, TOUCH } from "three";
import { describe, expect, it } from "vitest";
import { clampStudent3dCameraTarget, configureStudent3dInputMappings, crossedStudent3dDragThreshold } from "../student3dInput";

describe("Student 3D camera input", () => {
  it("keeps mouse mappings available at any viewport and configures touch gestures independently", () => {
    const controls = {
      mouseButtons: { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN },
      touches: { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN },
    };

    configureStudent3dInputMappings(controls);

    expect(controls.mouseButtons).toEqual({ LEFT: MOUSE.PAN, MIDDLE: MOUSE.PAN, RIGHT: MOUSE.ROTATE });
    expect(controls.touches).toEqual({ ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_ROTATE });
  });

  it("requires intentional pointer movement before suppressing entity clicks", () => {
    expect(crossedStudent3dDragThreshold({ x: 10, y: 10 }, { x: 14, y: 13 })).toBe(false);
    expect(crossedStudent3dDragThreshold({ x: 10, y: 10 }, { x: 16, y: 14 })).toBe(true);
  });

  it("clamps the orbit target and translates the camera by the same amount", () => {
    let updates = 0;
    const controls = {
      target: { x: 12, y: -3, z: 2 },
      object: { position: { x: 15, y: 4, z: -1 } },
      update: () => { updates += 1; },
    };

    expect(clampStudent3dCameraTarget(controls, {
      minX: -5, maxX: 5, minY: 0.05, maxY: 2, minZ: -4, maxZ: 4,
    })).toBe(true);
    expect(controls.target).toEqual({ x: 5, y: 0.05, z: 2 });
    expect(controls.object.position).toEqual({ x: 8, y: 7.05, z: -1 });
    expect(updates).toBe(1);
    expect(clampStudent3dCameraTarget(controls, {
      minX: -5, maxX: 5, minY: 0.05, maxY: 2, minZ: -4, maxZ: 4,
    })).toBe(false);
  });
});

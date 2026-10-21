import { MOUSE, TOUCH } from "three";
import { describe, expect, it } from "vitest";
import { clampStudent3dCameraTarget, configureStudent3dInputMappings, crossedStudent3dDragThreshold, shouldPauseFollowForManualCameraGesture, shouldPreventStudent3dContextMenu, student3dCameraGesture, student3dTouchGestureMotion, translateStudent3dFollowCamera } from "../student3dInput";

describe("Student 3D camera input", () => {
  it("keeps mouse mappings consistent across desktop and mobile-sized viewports", () => {
    const originalWidth = window.innerWidth;
    try {
      for (const width of [1440, 1024, 768, 390, 360]) {
        Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
        const controls = {
          mouseButtons: { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN },
          touches: { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN },
        };

        configureStudent3dInputMappings(controls);

        expect(controls.mouseButtons, `mouse at ${width}px`).toEqual({
          LEFT: MOUSE.PAN,
          MIDDLE: MOUSE.DOLLY,
          RIGHT: MOUSE.ROTATE,
        });
        expect(controls.touches, `touch at ${width}px`).toEqual({ ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN });
      }
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
    }
  });

  it("pauses Follow only after an intentional drag crosses the movement threshold", () => {
    expect(shouldPauseFollowForManualCameraGesture(true, false)).toBe(false);
    expect(shouldPauseFollowForManualCameraGesture(true, true)).toBe(true);
    expect(shouldPauseFollowForManualCameraGesture(false, true)).toBe(false);
  });

  it("pauses Follow for a mouse pan but keeps right-drag orbit and zoom live", () => {
    const gesture = (button: number) => student3dCameraGesture({ pointerType: "mouse", button, pointerCount: 1, movement: 9 });
    const pan = gesture(0);
    const orbit = gesture(2);
    const zoom = gesture(1);

    expect(pan).toBe("pan");
    expect(orbit).toBe("orbit");
    expect(zoom).toBe("zoom");
    expect(shouldPauseFollowForManualCameraGesture(true, pan === "pan")).toBe(true);
    expect(shouldPauseFollowForManualCameraGesture(true, orbit === "pan")).toBe(false);
    expect(shouldPauseFollowForManualCameraGesture(true, zoom === "pan")).toBe(false);
    expect(student3dCameraGesture({ pointerType: "mouse", button: 0, pointerCount: 1, movement: 4 })).toBe("none");
  });

  it("keeps one-finger touch orbit live and pauses only deliberate two-finger pan", () => {
    expect(student3dCameraGesture({ pointerType: "touch", button: 0, pointerCount: 1, movement: 9 })).toBe("orbit");
    const pan = student3dTouchGestureMotion([{ x: 10, y: 20 }, { x: 110, y: 20 }], [{ x: 20, y: 30 }, { x: 120, y: 30 }]);
    expect(pan.centroidDistance).toBeGreaterThan(7);
    expect(pan.pinchDistance).toBeLessThan(7);
    expect(student3dCameraGesture({ pointerType: "touch", button: 0, pointerCount: 2, movement: pan.centroidDistance, pinchMovement: pan.pinchDistance })).toBe("pan");
    const pinch = student3dTouchGestureMotion([{ x: 10, y: 20 }, { x: 110, y: 20 }], [{ x: 5, y: 20 }, { x: 125, y: 20 }]);
    expect(student3dCameraGesture({ pointerType: "touch", button: 0, pointerCount: 2, movement: pinch.centroidDistance, pinchMovement: pinch.pinchDistance })).toBe("zoom");
  });

  it("tracks a moving marker while preserving the chosen camera orbit offset", () => {
    const target = { x: 2, y: 1, z: 3 };
    const camera = { x: 8, y: 9, z: 13 };
    const initialOffset = { x: camera.x - target.x, y: camera.y - target.y, z: camera.z - target.z };

    translateStudent3dFollowCamera(camera, target, { x: 12, y: 1, z: -5 }, 0.5);

    expect(target).toEqual({ x: 7, y: 1, z: -1 });
    expect({ x: camera.x - target.x, y: camera.y - target.y, z: camera.z - target.z }).toEqual(initialOffset);

    // A changed orbit/zoom offset remains the chosen offset over subsequent
    // marker updates rather than being replaced with the default Follow pose.
    camera.x = target.x - 8;
    camera.y = target.y + 11;
    camera.z = target.z + 6;
    const inspectedOffset = { x: camera.x - target.x, y: camera.y - target.y, z: camera.z - target.z };
    translateStudent3dFollowCamera(camera, target, { x: 18, y: 1, z: -8 }, 0.35);
    translateStudent3dFollowCamera(camera, target, { x: 24, y: 1, z: -12 }, 0.45);
    expect(camera.x - target.x).toBeCloseTo(inspectedOffset.x);
    expect(camera.y - target.y).toBeCloseTo(inspectedOffset.y);
    expect(camera.z - target.z).toBeCloseTo(inspectedOffset.z);
  });

  it("suppresses a context menu only after a right-button camera drag", () => {
    expect(shouldPreventStudent3dContextMenu(2, true)).toBe(true);
    expect(shouldPreventStudent3dContextMenu(2, false)).toBe(false);
    expect(shouldPreventStudent3dContextMenu(0, true)).toBe(false);
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

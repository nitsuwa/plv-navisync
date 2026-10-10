import { MOUSE, TOUCH } from "three";
import { describe, expect, it } from "vitest";
import { configureStudent3dInputMappings, crossedStudent3dDragThreshold } from "../student3dInput";

describe("Student 3D camera input", () => {
  it("keeps mouse mappings available at any viewport and configures touch gestures independently", () => {
    const controls = {
      mouseButtons: { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN },
      touches: { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN },
    };

    configureStudent3dInputMappings(controls);

    expect(controls.mouseButtons).toEqual({ LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.PAN, RIGHT: MOUSE.PAN });
    expect(controls.touches).toEqual({ ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN });
  });

  it("requires intentional pointer movement before suppressing entity clicks", () => {
    expect(crossedStudent3dDragThreshold({ x: 10, y: 10 }, { x: 14, y: 13 })).toBe(false);
    expect(crossedStudent3dDragThreshold({ x: 10, y: 10 }, { x: 16, y: 14 })).toBe(true);
  });
});

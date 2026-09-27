import { describe, expect, it } from "vitest";
import { clientToEventWorld, eventWorldToClient, type GestureFrame } from "../eventGestureCoordinates";

describe("event gesture coordinates", () => {
  it.each([
    [0.7, { x: 470, y: 340 }, { x: 200, y: 200 }, { x: 30, y: 0 }],
    [1, { x: 350, y: 230 }, { x: 20, y: 30 }, { x: 30, y: 0 }],
    [1.45, { x: 455, y: 345 }, { x: 100, y: 100 }, { x: 10, y: 0 }],
    [3, { x: 130, y: 60 }, { x: 10, y: 20 }, { x: -200, y: -200 }],
  ])("converts client coordinates at zoom %s", (zoom, client, expected, pan) => {
    const frame: GestureFrame = { left: 300, top: 200, zoom, pan };
    const actual = clientToEventWorld(client, frame);
    expect(actual.x).toBeCloseTo(expected.x);
    expect(actual.y).toBeCloseTo(expected.y);
  });

  it("round trips authored coordinates through the same gesture frame", () => {
    const frame: GestureFrame = { left: 84, top: 121, zoom: 1.45, pan: { x: -72, y: 38 } };
    const authored = { x: 136, y: 94 };
    expect(clientToEventWorld(eventWorldToClient(authored, frame), frame)).toEqual({
      x: expect.closeTo(authored.x),
      y: expect.closeTo(authored.y),
    });
  });

  it("uses a safe unit zoom for invalid zoom values", () => {
    expect(clientToEventWorld({ x: 150, y: 180 }, { left: 100, top: 100, zoom: 0, pan: { x: 10, y: 20 } })).toEqual({ x: 40, y: 60 });
    expect(clientToEventWorld({ x: 150, y: 180 }, { left: 100, top: 100, zoom: Number.NaN, pan: { x: 10, y: 20 } })).toEqual({ x: 40, y: 60 });
  });
});

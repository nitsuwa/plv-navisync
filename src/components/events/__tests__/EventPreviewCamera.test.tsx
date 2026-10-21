import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { EventPreviewCamera } from "../EventPreviewCamera";
const loop = vi.hoisted(() => ({ frame: null as ((state: any) => void) | null, invalidate: vi.fn() }));
vi.mock("@react-three/fiber", () => ({ useThree: () => ({ invalidate: loop.invalidate }), useFrame: (callback: any) => { loop.frame = callback; } }));
const frame = { scale: .01, originX: 0, originY: 0 };
const fit = { nonce: 0, kind: "fit" as const, bounds: { x: 0, y: 0, width: 800, height: 600 } };
function state() { return { camera: new THREE.PerspectiveCamera(50, 1.4, .1, 100), controls: { target: new THREE.Vector3(), minDistance: .8, maxDistance: 100, update: vi.fn() }, size: { width: 1400, height: 1000 } }; }
function tick(value: ReturnType<typeof state>) { act(() => loop.frame!(value)); }
beforeEach(() => { loop.frame = null; loop.invalidate.mockClear(); });
describe("event preview camera view round trip", () => {
  it("captures the latest native pose on unmount even before another frame", () => {
    const session = { current: undefined as any }, scene = state();
    const view = render(<EventPreviewCamera request={fit} frame={frame} session={session}/>); tick(scene);
    scene.camera.position.set(5, 3, 7); scene.controls.target.set(2, .2, 3);
    view.unmount(); expect(session.current.position).toEqual([5, 3, 7]); expect(session.current.target).toEqual([2, .2, 3]);
  });
  it("leaves shared public renderer camera controls alone without an event request", () => {
    const scene = state(); scene.camera.position.set(5, 3, 7);
    render(<EventPreviewCamera frame={frame}/>); tick(scene);
    expect(scene.camera.position.toArray()).toEqual([5, 3, 7]); expect(scene.controls.update).not.toHaveBeenCalled();
  });
  it("restores the actual orbit pose after 3D unmount and remount rather than repeating Fit", () => {
    const session = { current: undefined as any };
    const first = state(); const view = render(<EventPreviewCamera request={fit} frame={frame} session={session}/>); tick(first);
    first.camera.position.set(3, 2, 4); first.controls.target.set(1, .1, 2); first.camera.zoom = 1.2; tick(first); view.unmount();
    const second = state(); render(<EventPreviewCamera request={fit} frame={frame} session={session}/>); tick(second);
    expect(second.camera.position.toArray()).toEqual([3, 2, 4]); expect(second.controls.target.toArray()).toEqual([1, .1, 2]); expect(second.camera.zoom).toBe(1.2);
  });
  it("still applies a new explicit Fit request after restoring a saved view", () => {
    const session = { current: { position: [3, 2, 4], target: [1, .1, 2], zoom: 1, far: 200, minDistance: .8, maxDistance: 100 } } as any;
    const scene = state(); const view = render(<EventPreviewCamera request={fit} frame={frame} session={session}/>); tick(scene);
    view.rerender(<EventPreviewCamera request={{ ...fit, nonce: 1 }} frame={frame} session={session}/>); tick(scene);
    expect(scene.controls.target.toArray()).toEqual([4, .025, 3]); expect(scene.camera.position.toArray()).not.toEqual([3, 2, 4]);
  });
  it("starts a fresh session with the normal map Fit", () => {
    const session = { current: undefined as any }, scene = state(); render(<EventPreviewCamera request={fit} frame={frame} session={session}/>); tick(scene);
    expect(scene.controls.target.toArray()).toEqual([4, .025, 3]); expect(session.current.position).toEqual(scene.camera.position.toArray());
  });
});

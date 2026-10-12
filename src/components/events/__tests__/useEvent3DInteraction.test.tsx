import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import * as THREE from "three";
import { useEvent3DInteraction } from "../useEvent3DInteraction";
import type { Event3DLayout } from "../../../lib/event3dEditing";

const graphics = vi.hoisted(() => ({ state: {} as Record<string, unknown> }));
vi.mock("@react-three/fiber", () => ({ useThree: () => graphics.state }));
const initial: Event3DLayout = { furniture: [{ id: "chair", type: "chair", category: "event", name: "Chair", x: 190, y: 190, width: 20, height: 20, rotation: 0, color: "#123456" }], labels: [] };
let canvas: HTMLCanvasElement;
beforeEach(() => {
  canvas = document.createElement("canvas"); document.body.append(canvas);
  canvas.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 400, height: 400, right: 400, bottom: 400, toJSON: () => ({}) });
  const captured = new Set<number>();
  canvas.setPointerCapture = id => { captured.add(id); };
  canvas.hasPointerCapture = id => captured.has(id);
  canvas.releasePointerCapture = id => { captured.delete(id); };
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
  camera.position.set(0, 10, 0); camera.up.set(0, 0, -1); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  graphics.state = { camera, gl: { domElement: canvas }, controls: { enabled: true, update: () => {} }, invalidate: () => {} };
});
afterEach(() => canvas.remove());
function Surface() {
  const [layout, setLayout] = useState(initial), [busy, setBusy] = useState(false);
  const { preview, start } = useEvent3DInteraction({ furniture: layout.furniture, labels: layout.labels, frame: { scale: 0.025, originX: 200, originY: 200 }, editing: { tool: "move", selectedIds: ["chair"], bounds: { width: 400, height: 400 }, grid: 0, onSelect: () => {}, onPlacementPoint: () => {}, onBusyChange: setBusy, onCommit: (_start, next) => setLayout(next) } });
  return <><button onPointerDown={event => start("chair", event)}>Event item</button><button disabled={busy}>Save layout</button><output aria-label="Displayed X">{(preview || layout).furniture[0].x}</output><output aria-label="Committed X">{layout.furniture[0].x}</output></>;
}
const pointer = (pointerId: number, clientX: number, isPrimary = true) => ({ pointerId, clientX, clientY: 200, pointerType: "touch", isPrimary, button: 0, bubbles: true });
describe("3D native pointer transaction lifecycle", () => {
  it("samples the final release before camera damping resumes", async () => {
    const camera = graphics.state.camera as THREE.Camera;
    (graphics.state.controls as { enabled: boolean; update: () => void }).update = () => { camera.position.x += 1; camera.updateMatrixWorld(); };
    render(<Surface />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Event item" }), pointer(1, 200));
    fireEvent.pointerMove(window, pointer(1, 240));
    await waitFor(() => expect(screen.getByLabelText("Displayed X")).toHaveTextContent("230"));
    fireEvent.pointerUp(window, pointer(1, 240));
    expect(screen.getByLabelText("Committed X")).toHaveTextContent("230");
    expect(screen.getByRole("button", { name: "Save layout" })).toBeEnabled();
  });
  it("cancels both touches instead of starting a replacement item drag", async () => {
    render(<Surface />);
    const item = screen.getByRole("button", { name: "Event item" });
    fireEvent.pointerDown(item, pointer(1, 200)); fireEvent.pointerMove(window, pointer(1, 220));
    await waitFor(() => expect(screen.getByLabelText("Displayed X")).toHaveTextContent("210"));
    fireEvent.pointerDown(item, pointer(2, 220, false));
    expect(screen.getByRole("button", { name: "Save layout" })).toBeEnabled();
    fireEvent.pointerMove(window, pointer(2, 260, false)); fireEvent.pointerUp(window, pointer(2, 260, false)); fireEvent.pointerUp(window, pointer(1, 220));
    expect(screen.getByLabelText("Committed X")).toHaveTextContent("190");
    fireEvent.pointerDown(item, pointer(3, 200)); fireEvent.pointerUp(window, pointer(3, 230));
    expect(screen.getByLabelText("Committed X")).toHaveTextContent("220");
  });
  it("commits the release sample even when no final move event arrived", () => {
    render(<Surface />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Event item" }), pointer(1, 200));
    fireEvent.pointerUp(window, pointer(1, 250));
    expect(screen.getByLabelText("Committed X")).toHaveTextContent("240");
  });
  it("cancels a pending drag on Escape and restores camera input", async () => {
    render(<Surface />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Event item" }), pointer(1, 200)); fireEvent.pointerMove(window, pointer(1, 240));
    await waitFor(() => expect(screen.getByLabelText("Displayed X")).toHaveTextContent("230"));
    fireEvent.keyDown(window, { key: "Escape" }); fireEvent.pointerUp(window, pointer(1, 240));
    expect(screen.getByLabelText("Committed X")).toHaveTextContent("190");
    expect((graphics.state.controls as { enabled: boolean }).enabled).toBe(true);
  });
  it("cancels on lost capture without saving the preview", async () => {
    render(<Surface />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Event item" }), pointer(1, 200)); fireEvent.pointerMove(window, pointer(1, 240));
    await waitFor(() => expect(screen.getByLabelText("Displayed X")).toHaveTextContent("230"));
    act(() => canvas.dispatchEvent(new PointerEvent("lostpointercapture", pointer(1, 240))));
    expect(screen.getByLabelText("Committed X")).toHaveTextContent("190");
    expect(screen.getByRole("button", { name: "Save layout" })).toBeEnabled();
  });
});

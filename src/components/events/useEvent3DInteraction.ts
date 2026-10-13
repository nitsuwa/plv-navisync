import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { FloorFurniture, FloorLabel } from "../map-builder/types";
import { beginEvent3DGesture, event3DPointToLayout, previewEvent3DGesture, type Event3DEditing, type Event3DGesture, type Event3DLayout, type Event3DManipulation, type Event3DPoint } from "../../lib/event3dEditing";
import type { Event3DFrame } from "../../lib/event3dLayout";

interface ActivePointer {
  id: number;
  client: { x: number; y: number };
  gesture?: Event3DGesture;
  controls?: { enabled: boolean; update: () => void };
  wasEnabled: boolean;
  editing: Event3DEditing;
}
const EMPTY_FURNITURE: readonly FloorFurniture[] = [];
const EMPTY_LABELS: readonly FloorLabel[] = [];

export function useEvent3DInteraction({ furniture = EMPTY_FURNITURE, labels = EMPTY_LABELS, frame, editing }: { furniture?: readonly FloorFurniture[]; labels?: readonly FloorLabel[]; frame: Event3DFrame; editing?: Event3DEditing }) {
  const { camera, gl, controls, invalidate } = useThree();
  const [preview, setPreview] = useState<Event3DLayout | null>(null);
  const latest = useRef({ furniture, labels, frame, editing }); latest.current = { furniture, labels, frame, editing };
  const active = useRef<ActivePointer | null>(null), animation = useRef<number | null>(null);
  const pressedPointers = useRef(new Set<number>());
  const suppressMultiTouch = useRef(false);
  const floorPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.025));
  const ray = useRef(new THREE.Raycaster());
  const sample = useCallback((clientX: number, clientY: number): Event3DPoint | null => {
    const rect = gl.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    ray.current.setFromCamera(new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1), camera);
    const hit = ray.current.ray.intersectPlane(floorPlane.current, new THREE.Vector3());
    return hit ? event3DPointToLayout(hit, latest.current.frame) : null;
  }, [camera, gl]);
  const finish = useCallback((cancel: boolean, event?: PointerEvent) => {
    const pointer = active.current;
    if (!pointer || (event && event.pointerId !== pointer.id)) return;
    // OrbitControls.update can resume residual damping and move the camera.
    // Resolve release geometry while it still matches the displayed preview.
    const point = !cancel && event ? sample(event.clientX, event.clientY) : null;
    const distance = event ? Math.hypot(event.clientX - pointer.client.x, event.clientY - pointer.client.y) : 0;
    const completed = point && pointer.gesture && distance > 3 ? previewEvent3DGesture(pointer.gesture, point) : null;
    active.current = null;
    if (animation.current !== null) cancelAnimationFrame(animation.current);
    animation.current = null;
    setPreview(null);
    if (pointer.controls) { pointer.controls.enabled = pointer.wasEnabled; pointer.controls.update(); }
    try { if (gl.domElement.hasPointerCapture(pointer.id)) gl.domElement.releasePointerCapture(pointer.id); } catch { /* capture may already be released */ }
    try {
      if (completed && pointer.gesture) pointer.editing.onCommit(pointer.gesture.start, completed);
      else if (point && !pointer.gesture && distance <= 6) (pointer.editing.onPlace || pointer.editing.onPlacementPoint)(point);
    } finally { pointer.editing.onBusyChange(false); invalidate(); }
  }, [gl, invalidate, sample]);
  const start = useCallback((id: string | null, event: PointerEvent | ReactPointerEvent, override?: Event3DManipulation) => {
    const state = latest.current, edit = state.editing;
    if (!edit || event.button !== 0 || active.current || edit.tool === "pan" || event.isPrimary === false || suppressMultiTouch.current || pressedPointers.current.size > 1) return;
    const point = sample(event.clientX, event.clientY);
    if (!point) return;
    const placing = edit.tool === "place-item" || edit.tool === "place-label";
    if (!id && !placing) return;
    if (id && !placing) edit.onSelect(id);
    const gesture = !placing && id ? beginEvent3DGesture({ furniture: [...state.furniture], labels: [...state.labels] }, id, override || edit.tool as Event3DManipulation, point, edit.bounds, edit.grid, edit.preserveAspect) : null;
    if (!placing && !gesture) return;
    event.preventDefault(); event.stopPropagation();
    const orbit = controls as unknown as ActivePointer["controls"];
    active.current = { id: event.pointerId, client: { x: event.clientX, y: event.clientY }, gesture: gesture || undefined, controls: orbit, wasEnabled: orbit?.enabled ?? true, editing: edit };
    if (orbit) orbit.enabled = false;
    try { gl.domElement.setPointerCapture(event.pointerId); } catch { /* window listeners still finish a drag */ }
    edit.onBusyChange(true);
  }, [controls, gl, sample]);

  useEffect(() => {
    if (!latest.current.editing) return;
    const move = (event: PointerEvent) => {
      const pointer = active.current;
      const edit = latest.current.editing;
      if (!pointer && edit && (edit.tool === "place-item" || edit.tool === "place-label") && event.pointerType !== "touch" && !pressedPointers.current.size && event.target === gl.domElement) {
        if (animation.current !== null) cancelAnimationFrame(animation.current);
        animation.current = requestAnimationFrame(() => { animation.current = null; const point = sample(event.clientX, event.clientY); if (point) edit.onPlacementPoint(point); });
        return;
      }
      if (!pointer?.gesture || event.pointerId !== pointer.id) return;
      if (animation.current !== null) cancelAnimationFrame(animation.current);
      animation.current = requestAnimationFrame(() => {
        animation.current = null;
        if (active.current !== pointer) return;
        const point = sample(event.clientX, event.clientY);
        if (point && Math.hypot(event.clientX - pointer.client.x, event.clientY - pointer.client.y) > 3) { setPreview(previewEvent3DGesture(pointer.gesture!, point)); invalidate(); }
      });
    };
    const release = (event: PointerEvent, cancelled: boolean) => {
      pressedPointers.current.delete(event.pointerId);
      if (!pressedPointers.current.size) suppressMultiTouch.current = false;
      finish(cancelled, event);
    };
    const up = (event: PointerEvent) => release(event, false);
    const cancel = (event: PointerEvent) => release(event, true);
    const lostCapture = (event: PointerEvent) => finish(true, event);
    const stop = () => { finish(true); pressedPointers.current.clear(); suppressMultiTouch.current = false; };
    const secondPointer = (event: PointerEvent) => {
      pressedPointers.current.add(event.pointerId);
      if (pressedPointers.current.size > 1) { suppressMultiTouch.current = true; finish(true); }
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (active.current) { event.preventDefault(); finish(true); }
      const edit = latest.current.editing;
      if (edit?.tool === "place-item" || edit?.tool === "place-label") edit.onCancelPlacement?.();
    };
    const hidden = () => { if (document.hidden) stop(); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", cancel); window.addEventListener("pointerdown", secondPointer, true);
    window.addEventListener("lostpointercapture", lostCapture, true); window.addEventListener("blur", stop); window.addEventListener("resize", stop); window.addEventListener("keydown", key); document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel); window.removeEventListener("pointerdown", secondPointer, true);
      window.removeEventListener("lostpointercapture", lostCapture, true); window.removeEventListener("blur", stop); window.removeEventListener("resize", stop); window.removeEventListener("keydown", key); document.removeEventListener("visibilitychange", hidden); stop();
    };
  }, [Boolean(editing), finish, gl, invalidate, sample]);
  useEffect(() => { if (active.current) finish(true); }, [furniture, labels, editing?.tool, finish]);
  return { preview, start };
}

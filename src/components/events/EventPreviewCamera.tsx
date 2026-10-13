import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { event3DCameraPose, type Event3DCameraRequest, type Event3DFrame, type Event3DCameraSession } from "../../lib/event3dLayout";

type Orbit = { target: THREE.Vector3; update: () => void; minDistance: number; maxDistance: number };
function capture(session: Event3DCameraSession | undefined, camera: THREE.Camera, orbit: Orbit) {
  if (!session) return;
  const lens = camera as THREE.PerspectiveCamera;
  const previous = session.current;
  if (previous && camera.position.toArray().every((value, index) => value === previous.position[index]) && orbit.target.toArray().every((value, index) => value === previous.target[index]) && lens.zoom === previous.zoom && lens.far === previous.far && orbit.minDistance === previous.minDistance && orbit.maxDistance === previous.maxDistance) return;
  session.current = { position: camera.position.toArray() as [number, number, number], target: orbit.target.toArray() as [number, number, number], zoom: lens.zoom, far: lens.far, minDistance: orbit.minDistance, maxDistance: orbit.maxDistance };
}
export function EventPreviewCamera({ request, frame, session }: { request?: Event3DCameraRequest; frame: Event3DFrame; session?: Event3DCameraSession }) {
  const { invalidate } = useThree();
  const applied = useRef<number | null>(null);
  const lastScene = useRef<{ camera: THREE.Camera; orbit: Orbit } | null>(null);
  useEffect(() => () => { if (lastScene.current) capture(session, lastScene.current.camera, lastScene.current.orbit); }, [session]);
  useEffect(() => { if (request) invalidate(); }, [request, invalidate]);
  useFrame(({ camera, controls, size }) => {
    if (!request || !controls) return;
    const orbit = controls as unknown as Orbit;
    lastScene.current = { camera, orbit };
    if (applied.current === request.nonce) { capture(session, camera, orbit); return; }
    const saved = applied.current === null && request.nonce === 0 ? session?.current : undefined;
    applied.current = request.nonce;
    if (saved) {
      camera.position.set(...saved.position); orbit.target.set(...saved.target);
      orbit.minDistance = saved.minDistance; orbit.maxDistance = saved.maxDistance;
      const lens = camera as THREE.PerspectiveCamera;
      lens.zoom = saved.zoom; lens.far = Math.max(lens.far, saved.far); lens.updateProjectionMatrix();
    } else if (request.kind === "zoom-in" || request.kind === "zoom-out") {
      const offset = camera.position.clone().sub(orbit.target);
      const distance = Math.max(orbit.minDistance, Math.min(orbit.maxDistance, offset.length() * (request.kind === "zoom-in" ? 0.8 : 1.25)));
      camera.position.copy(orbit.target).add(offset.setLength(distance));
    } else {
      const pose = event3DCameraPose(request.bounds, frame, size.width / Math.max(1, size.height), (camera as THREE.PerspectiveCamera).fov, request.maxHeight);
      orbit.maxDistance = Math.max(orbit.maxDistance, pose.distance * 1.5);
      orbit.minDistance = Math.min(orbit.minDistance, 0.8);
      camera.position.set(...pose.position); orbit.target.set(...pose.target);
      const lens = camera as THREE.PerspectiveCamera;
      lens.far = Math.max(lens.far, pose.distance * 4); lens.updateProjectionMatrix();
    }
    camera.lookAt(orbit.target); orbit.update(); invalidate();
    capture(session, camera, orbit);
  });
  return null;
}

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { event3DCameraPose, type Event3DCameraRequest, type Event3DFrame } from "../../lib/event3dLayout";

export function EventPreviewCamera({ request, frame }: { request?: Event3DCameraRequest; frame: Event3DFrame }) {
  const { invalidate } = useThree();
  const applied = useRef<number | null>(null);
  useEffect(() => { if (request) invalidate(); }, [request, invalidate]);
  useFrame(({ camera, controls, size }) => {
    if (!request || applied.current === request.nonce || !controls) return;
    applied.current = request.nonce;
    const orbit = controls as unknown as { target: THREE.Vector3; update: () => void; minDistance: number; maxDistance: number };
    if (request.kind === "zoom-in" || request.kind === "zoom-out") {
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
  });
  return null;
}

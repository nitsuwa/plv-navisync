import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useRef, type MutableRefObject, type RefObject } from "react";
import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import * as THREE from "three";
import { IskolarWalker3D } from "./IskolarWalker3D";
import { NaviBuddyPortrait } from "./NaviBuddyPortrait";
import type { NaviBuddyAppearance } from "../../lib/naviBuddy";

function PreviewModel({ appearance, reducedMotion, groupRef, targetYawRef, onInvalidate }: {
  appearance: NaviBuddyAppearance;
  reducedMotion: boolean;
  groupRef: RefObject<THREE.Group | null>;
  targetYawRef: MutableRefObject<number>;
  onInvalidate: (invalidate: () => void) => void;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const reactionTime = useRef(0);
  useEffect(() => onInvalidate(invalidate), [invalidate, onInvalidate]);
  useEffect(() => { reactionTime.current = reducedMotion ? 0 : 0.38; invalidate(); }, [appearance.outfit, appearance.backpack, reducedMotion, invalidate]);
  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const difference = Math.atan2(Math.sin(targetYawRef.current - group.rotation.y), Math.cos(targetYawRef.current - group.rotation.y));
    if (Math.abs(difference) >= 0.001) {
      group.rotation.y += difference * (1 - Math.exp(-delta * 18));
      invalidate();
    }
    if (reactionTime.current > 0) {
      reactionTime.current = Math.max(0, reactionTime.current - delta);
      const pop = Math.sin((0.38 - reactionTime.current) / 0.38 * Math.PI);
      const scale = 1.42 + pop * 0.045;
      group.scale.setScalar(scale);
      if (reactionTime.current > 0) invalidate();
    }
  });

  return <>
    <ambientLight intensity={1.6} />
    <directionalLight position={[2, 4, 3]} intensity={2.1} />
    <directionalLight position={[-2, 2, -2]} intensity={0.65} color="#dce8ff" />
    <group ref={groupRef} scale={1.42}>
      <IskolarWalker3D appearance={appearance} reducedMotion={reducedMotion} idleAnimation />
    </group>
  </>;
}

/** One demand-rendered, tab-scoped preview of the same procedural navigation walker. */
export function NaviBuddy3DPreview({ appearance, reducedMotion }: { appearance: NaviBuddyAppearance; reducedMotion: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const targetYawRef = useRef(0);
  const invalidateRef = useRef<(() => void) | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; yaw: number } | null>(null);
  // Keep unit-test and constrained-browser rendering available without trying to
  // create a second graphics context where the platform has no WebGL API.
  const webglAvailable = typeof window !== "undefined" && typeof window.WebGLRenderingContext !== "undefined";

  const invalidate = useCallback(() => invalidateRef.current?.(), []);
  const rotateBy = useCallback((radians: number) => {
    targetYawRef.current += radians;
    invalidate();
  }, [invalidate]);
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, yaw: targetYawRef.current };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !groupRef.current) return;
    targetYawRef.current = drag.yaw + (event.clientX - drag.x) * 0.012;
    invalidate();
  };
  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      rotateBy(event.key === "ArrowLeft" ? -Math.PI / 8 : Math.PI / 8);
    }
  };

  if (!webglAvailable) return <NaviBuddyPortrait appearance={appearance} className="h-52 w-44 drop-shadow-md" waving />;

  return <div className="relative h-[290px] w-full min-w-0 touch-pan-y select-none overflow-hidden sm:h-[360px]" aria-label="Interactive 3D NaviBuddy preview">
    <div
      role="application"
      tabIndex={0}
      aria-label="NaviBuddy preview. Drag or swipe to rotate. Use the left and right arrow keys to turn."
      className="h-full w-full min-w-0 cursor-grab active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-2xl"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
    >
      <Canvas frameloop="demand" dpr={[1, 1.35]} camera={{ position: [0, 0.24, 1.4], fov: 36 }} onCreated={({ camera }) => camera.lookAt(0, 0.24, 0)} gl={{ antialias: true, alpha: true }}>
        <Suspense fallback={null}>
          <PreviewModel appearance={appearance} reducedMotion={reducedMotion} groupRef={groupRef} targetYawRef={targetYawRef} onInvalidate={(fn) => { invalidateRef.current = fn; }} />
        </Suspense>
      </Canvas>
    </div>
    <div className="absolute bottom-3 right-2 flex gap-2">
      <button type="button" aria-label="Rotate NaviBuddy left" onClick={() => rotateBy(-Math.PI / 6)} className="rounded-full border border-border/70 bg-card/90 p-2.5 text-foreground shadow-sm transition hover:-translate-y-0.5 hover:bg-muted active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">‹</button>
      <button type="button" aria-label="Rotate NaviBuddy right" onClick={() => rotateBy(Math.PI / 6)} className="rounded-full border border-border/70 bg-card/90 p-2.5 text-foreground shadow-sm transition hover:-translate-y-0.5 hover:bg-muted active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">›</button>
    </div>
  </div>;
}

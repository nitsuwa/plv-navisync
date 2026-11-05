import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

const NAVY = "#0e2a6e";
const NAVY_DARK = "#0a1f52";
const GOLD = "#c8960c";
const SKIN = "#f2c9a0";
const SKIN_SHADE = "#e8b88c";
const HAIR = "#1e1b2e";
const SHOE = "#1f2937";

/** World distance covered by half a walk cycle (one footfall). */
const STRIDE = 0.07;
/** Cap leg speed so fast playback never turns into a blur. */
const MAX_PHASE_RATE = Math.PI * 5;
/** Per-frame moves larger than this are repositions (new leg, floor swap), not steps. */
const TELEPORT_DISTANCE = 0.6;
const MIN_STEP_DISTANCE = 0.0004;

/**
 * Iskolar, the student route guide, built from primitives so no model file has
 * to load. Mount it inside the group the renderer moves along the route: the
 * walker reads that group's own world motion to face its travel direction and
 * drive the walk cycle, so neither renderer needs to pass route data in.
 * About 0.37 world units tall, feet at the parent's origin, facing +Z at yaw 0.
 */
export function IskolarWalker3D({ reducedMotion = false }: { reducedMotion?: boolean }) {
  const invalidate = useThree((state) => state.invalidate);
  const figureRef = useRef<THREE.Group>(null);
  const upperRef = useRef<THREE.Group>(null);
  const legLeftRef = useRef<THREE.Group>(null);
  const legRightRef = useRef<THREE.Group>(null);
  const armLeftRef = useRef<THREE.Group>(null);
  const armRightRef = useRef<THREE.Group>(null);
  const motion = useRef({ last: new THREE.Vector3(), current: new THREE.Vector3(), hasLast: false, yaw: 0, phase: 0, amplitude: 0 });

  useFrame((_, delta) => {
    const figure = figureRef.current;
    if (!figure) return;
    const state = motion.current;
    figure.getWorldPosition(state.current);
    const dx = state.current.x - state.last.x;
    const dz = state.current.z - state.last.z;
    const step = state.hasLast ? Math.hypot(dx, dz) : 0;
    state.last.copy(state.current);
    state.hasLast = true;
    const dt = Math.min(0.1, Math.max(delta, 1 / 240));
    const walking = step > MIN_STEP_DISTANCE && step < TELEPORT_DISTANCE;
    if (walking) {
      const turn = Math.atan2(dx, dz) - state.yaw;
      state.yaw += Math.atan2(Math.sin(turn), Math.cos(turn)) * (1 - Math.exp(-dt * 14));
      state.phase += Math.min((step / STRIDE) * Math.PI, dt * MAX_PHASE_RATE);
    } else if (step >= TELEPORT_DISTANCE) {
      state.amplitude = 0;
    }
    const targetAmplitude = walking && !reducedMotion ? 1 : 0;
    state.amplitude += (targetAmplitude - state.amplitude) * (1 - Math.exp(-dt * 10));
    if (state.amplitude < 0.002) state.amplitude = 0;

    figure.rotation.y = state.yaw;
    const swing = Math.sin(state.phase) * state.amplitude;
    if (legLeftRef.current) legLeftRef.current.rotation.x = swing * 0.65;
    if (legRightRef.current) legRightRef.current.rotation.x = -swing * 0.65;
    if (armLeftRef.current) armLeftRef.current.rotation.x = -swing * 0.55;
    if (armRightRef.current) armRightRef.current.rotation.x = swing * 0.55;
    if (upperRef.current) upperRef.current.position.y = Math.abs(Math.sin(state.phase)) * 0.012 * state.amplitude;
    // On a demand frameloop, keep rendering until the legs settle after a stop.
    if (!walking && state.amplitude > 0) invalidate();
  });

  return <>
    <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={20}><circleGeometry args={[0.23, 24]} /><meshBasicMaterial color={NAVY} depthWrite={false} /></mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]} renderOrder={21}><circleGeometry args={[0.19, 24]} /><meshBasicMaterial color="#ffffff" depthWrite={false} /></mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.016, 0]} renderOrder={22}><circleGeometry args={[0.15, 24]} /><meshBasicMaterial color={GOLD} depthWrite={false} /></mesh>
    <group ref={figureRef} name="iskolar-walker" position={[0, 0.02, 0]}>
      {([[legLeftRef, 0.03], [legRightRef, -0.03]] as const).map(([ref, x]) => <group key={x} ref={ref} position={[x, 0.115, 0]}>
        <mesh position={[0, -0.045, 0]}><capsuleGeometry args={[0.021, 0.05, 4, 10]} /><meshStandardMaterial color={NAVY_DARK} roughness={0.6} /></mesh>
        <mesh position={[0, -0.104, 0.012]}><boxGeometry args={[0.042, 0.022, 0.064]} /><meshStandardMaterial color={SHOE} roughness={0.5} /></mesh>
      </group>)}
      <group ref={upperRef}>
        <mesh position={[0, 0.16, 0]}><cylinderGeometry args={[0.052, 0.06, 0.1, 18]} /><meshStandardMaterial color={NAVY} roughness={0.55} /></mesh>
        <mesh position={[0.03, 0.163, 0.054]} rotation={[-0.08, 0, 0.06]}><boxGeometry args={[0.012, 0.09, 0.006]} /><meshStandardMaterial color={GOLD} roughness={0.45} /></mesh>
        <mesh position={[-0.03, 0.163, 0.054]} rotation={[-0.08, 0, -0.06]}><boxGeometry args={[0.012, 0.09, 0.006]} /><meshStandardMaterial color={GOLD} roughness={0.45} /></mesh>
        <mesh position={[0, 0.168, -0.07]}><boxGeometry args={[0.078, 0.088, 0.04]} /><meshStandardMaterial color={GOLD} roughness={0.5} /></mesh>
        <mesh position={[0, 0.198, -0.072]}><boxGeometry args={[0.08, 0.026, 0.042]} /><meshStandardMaterial color="#a57a08" roughness={0.5} /></mesh>
        {([[armLeftRef, 0.068], [armRightRef, -0.068]] as const).map(([ref, x]) => <group key={x} ref={ref} position={[x, 0.198, 0]} rotation={[0, 0, x > 0 ? 0.12 : -0.12]}>
          <mesh position={[0, -0.042, 0]}><capsuleGeometry args={[0.017, 0.05, 4, 10]} /><meshStandardMaterial color={NAVY} roughness={0.55} /></mesh>
          <mesh position={[0, -0.084, 0]}><sphereGeometry args={[0.02, 12, 8]} /><meshStandardMaterial color={SKIN} roughness={0.7} /></mesh>
        </group>)}
        <mesh position={[0, 0.218, 0]}><cylinderGeometry args={[0.018, 0.018, 0.03, 10]} /><meshStandardMaterial color={SKIN} roughness={0.7} /></mesh>
        <mesh position={[0, 0.29, 0]}><sphereGeometry args={[0.074, 24, 16]} /><meshStandardMaterial color={SKIN} roughness={0.7} /></mesh>
        <mesh position={[0.073, 0.288, 0]}><sphereGeometry args={[0.017, 10, 8]} /><meshStandardMaterial color={SKIN_SHADE} roughness={0.7} /></mesh>
        <mesh position={[-0.073, 0.288, 0]}><sphereGeometry args={[0.017, 10, 8]} /><meshStandardMaterial color={SKIN_SHADE} roughness={0.7} /></mesh>
        <mesh position={[0, 0.294, -0.004]} rotation={[-0.5, 0, 0]}><sphereGeometry args={[0.079, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.56]} /><meshStandardMaterial color={HAIR} roughness={0.8} side={THREE.DoubleSide} /></mesh>
        <mesh position={[0.027, 0.296, 0.067]} scale={[1, 1.25, 0.5]}><sphereGeometry args={[0.011, 10, 8]} /><meshStandardMaterial color={HAIR} roughness={0.4} /></mesh>
        <mesh position={[-0.027, 0.296, 0.067]} scale={[1, 1.25, 0.5]}><sphereGeometry args={[0.011, 10, 8]} /><meshStandardMaterial color={HAIR} roughness={0.4} /></mesh>
        <mesh position={[0, 0.272, 0.069]} rotation={[0, 0, Math.PI]}><torusGeometry args={[0.016, 0.0038, 6, 14, Math.PI]} /><meshStandardMaterial color={HAIR} roughness={0.5} /></mesh>
      </group>
    </group>
  </>;
}

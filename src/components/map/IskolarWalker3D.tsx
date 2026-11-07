import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { useNaviBuddyAppearance } from "../../contexts/NaviBuddyStore";
import { NAVIBUDDY_OUTFIT_DETAILS } from "../../lib/naviBuddy";

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
export function IskolarWalker3D({ reducedMotion = false, idleAnimation = false, navigationPresentation = false, appearance: appearanceOverride }: { reducedMotion?: boolean; idleAnimation?: boolean; navigationPresentation?: boolean; appearance?: ReturnType<typeof useNaviBuddyAppearance> }) {
  const sharedAppearance = useNaviBuddyAppearance();
  const appearance = appearanceOverride ?? sharedAppearance;
  const outfit = NAVIBUDDY_OUTFIT_DETAILS[appearance.outfit];
  const invalidate = useThree((state) => state.invalidate);
  const figureRef = useRef<THREE.Group>(null);
  const upperRef = useRef<THREE.Group>(null);
  const legLeftRef = useRef<THREE.Group>(null);
  const legRightRef = useRef<THREE.Group>(null);
  const armLeftRef = useRef<THREE.Group>(null);
  const armRightRef = useRef<THREE.Group>(null);
  const motion = useRef({ last: new THREE.Vector3(), current: new THREE.Vector3(), hasLast: false, yaw: 0, phase: 0, amplitude: 0, idlePhase: 0 });

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
    if (idleAnimation && !reducedMotion) state.idlePhase += dt;
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
    if (upperRef.current) upperRef.current.position.y = Math.abs(Math.sin(state.phase)) * 0.012 * state.amplitude + (idleAnimation && !reducedMotion ? Math.sin(state.idlePhase * 2) * 0.002 : 0);
    // On a demand frameloop, keep rendering until the legs settle after a stop.
    if (!walking && state.amplitude > 0) invalidate();
    // The preview opts into this only while its customization tab is mounted.
    if (idleAnimation && !reducedMotion) invalidate();
  });

  return <>
    {navigationPresentation
      ? <mesh name="iskolar-contact-shadow" rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} renderOrder={10}>
        <circleGeometry args={[0.062, 24]} />
        <meshBasicMaterial color="#182b40" transparent opacity={0.18} depthWrite={false} />
      </mesh>
      : <>
        <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={20}><circleGeometry args={[0.23, 24]} /><meshBasicMaterial color={NAVY} depthWrite={false} /></mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]} renderOrder={21}><circleGeometry args={[0.19, 24]} /><meshBasicMaterial color="#ffffff" depthWrite={false} /></mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.016, 0]} renderOrder={22}><circleGeometry args={[0.15, 24]} /><meshBasicMaterial color={GOLD} depthWrite={false} /></mesh>
      </>}
    <group ref={figureRef} name="iskolar-walker" position={[0, navigationPresentation ? 0 : 0.02, 0]}>
      {([[legLeftRef, 0.03], [legRightRef, -0.03]] as const).map(([ref, x]) => <group key={x} ref={ref} position={[x, 0.115, 0]}>
        <mesh position={[0, -0.045, 0]}><capsuleGeometry args={[0.021, 0.05, 4, 10]} /><meshStandardMaterial color={outfit.pants} roughness={0.6} /></mesh>
        <mesh position={[0, -0.104, 0.012]}><boxGeometry args={appearance.outfit === "adventurer" ? [0.046, 0.038, 0.072] : [0.042, 0.022, 0.064]} /><meshStandardMaterial color={appearance.outfit === "adventurer" ? "#5a402e" : appearance.outfit === "plv_uniform" ? "#090a0d" : SHOE} roughness={0.5} /></mesh>
      </group>)}
      <group ref={upperRef}>
        <mesh position={[0, 0.16, 0]}><cylinderGeometry args={[0.052, 0.06, 0.1, 18]} /><meshStandardMaterial color={outfit.jacket} roughness={0.55} /></mesh>
        {appearance.outfit === "classic" && <>
          <mesh position={[0.03, 0.163, 0.054]} rotation={[-0.08, 0, 0.06]}><boxGeometry args={[0.012, 0.09, 0.006]} /><meshStandardMaterial color={outfit.accent} roughness={0.45} /></mesh>
          <mesh position={[-0.03, 0.163, 0.054]} rotation={[-0.08, 0, -0.06]}><boxGeometry args={[0.012, 0.09, 0.006]} /><meshStandardMaterial color={outfit.accent} roughness={0.45} /></mesh>
        </>}
        {appearance.outfit === "casual" && <>
          <mesh position={[0, 0.211, -0.036]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.036, 0.006, 6, 18, Math.PI]} /><meshStandardMaterial color="#245b59" roughness={0.7} /></mesh>
          <mesh position={[0, 0.135, 0.058]}><boxGeometry args={[0.044, 0.026, 0.009]} /><meshStandardMaterial color={outfit.accent} roughness={0.65} /></mesh>
          <mesh position={[0, 0.143, 0.064]}><boxGeometry args={[0.02, 0.004, 0.003]} /><meshStandardMaterial color={outfit.jacket} roughness={0.6} /></mesh>
          <mesh position={[-0.009, 0.188, 0.056]}><cylinderGeometry args={[0.002, 0.002, 0.026, 6]} /><meshStandardMaterial color={outfit.accent} roughness={0.5} /></mesh>
          <mesh position={[0.009, 0.188, 0.056]}><cylinderGeometry args={[0.002, 0.002, 0.026, 6]} /><meshStandardMaterial color={outfit.accent} roughness={0.5} /></mesh>
        </>}
        {appearance.outfit === "sporty" && <>
          <mesh position={[0, 0.183, 0.057]}><boxGeometry args={[0.075, 0.009, 0.006]} /><meshStandardMaterial color={outfit.accent} roughness={0.45} /></mesh>
          <mesh position={[0, 0.166, 0.057]}><boxGeometry args={[0.075, 0.006, 0.006]} /><meshStandardMaterial color={outfit.accent} roughness={0.45} /></mesh>
          <mesh position={[0, 0.143, 0.061]}><sphereGeometry args={[0.012, 8, 6]} /><meshStandardMaterial color={outfit.accent} roughness={0.45} /></mesh>
        </>}
        {appearance.outfit === "plv_uniform" && <>
          {/* Clean polo collar, center button placket, and one understated pocket. */}
          <mesh position={[-0.019, 0.198, 0.056]} rotation={[0.12, 0, -0.22]}><boxGeometry args={[0.031, 0.014, 0.007]} /><meshStandardMaterial color="#d7edf8" roughness={0.6} /></mesh>
          <mesh position={[0.019, 0.198, 0.056]} rotation={[0.12, 0, 0.22]}><boxGeometry args={[0.031, 0.014, 0.007]} /><meshStandardMaterial color="#d7edf8" roughness={0.6} /></mesh>
          <mesh position={[0, 0.159, 0.061]}><boxGeometry args={[0.006, 0.052, 0.004]} /><meshStandardMaterial color="#83b4d0" roughness={0.6} /></mesh>
          {[0.145, 0.159, 0.173].map((y) => <mesh key={y} position={[0, y, 0.064]}><sphereGeometry args={[0.0022, 7, 5]} /><meshStandardMaterial color="#31566e" roughness={0.55} /></mesh>)}
          <mesh position={[0.034, 0.168, 0.058]}><boxGeometry args={[0.024, 0.018, 0.005]} /><meshStandardMaterial color="#a9d2e6" roughness={0.6} /></mesh>
          <mesh position={[0.034, 0.168, 0.061]}><boxGeometry args={[0.020, 0.0015, 0.001]} /><meshStandardMaterial color="#83b4d0" roughness={0.6} /></mesh>
        </>}
        {appearance.outfit === "adventurer" && <>
          <mesh position={[0, 0.115, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.052, 0.006, 6, 20]} /><meshStandardMaterial color="#65472d" roughness={0.65} /></mesh>
          <mesh position={[0.045, 0.119, 0.046]} rotation={[0, 0, -0.12]}><boxGeometry args={[0.024, 0.03, 0.012]} /><meshStandardMaterial color="#805837" roughness={0.65} /></mesh>
          <mesh position={[0.045, 0.119, 0.053]}><boxGeometry args={[0.009, 0.009, 0.003]} /><meshStandardMaterial color={outfit.accent} roughness={0.5} /></mesh>
          <mesh position={[0.026, 0.177, 0.057]} rotation={[0, 0, 0.46]}><boxGeometry args={[0.009, 0.086, 0.006]} /><meshStandardMaterial color="#d1ae70" roughness={0.6} /></mesh>
          <mesh position={[-0.033, 0.161, 0.059]}><boxGeometry args={[0.025, 0.023, 0.008]} /><meshStandardMaterial color="#687644" roughness={0.6} /></mesh>
          <mesh position={[0.033, 0.161, 0.059]}><boxGeometry args={[0.025, 0.023, 0.008]} /><meshStandardMaterial color="#687644" roughness={0.6} /></mesh>
          {[0.153, 0.166, 0.179].map((y) => <mesh key={y} position={[0, y, 0.06]}><sphereGeometry args={[0.0025, 7, 5]} /><meshStandardMaterial color={outfit.accent} roughness={0.5} /></mesh>)}
        </>}
        {appearance.outfit === "sporty" && <mesh position={[0, 0.14, 0.06]}><sphereGeometry args={[0.013, 8, 6]} /><meshStandardMaterial color={outfit.accent} roughness={0.45} /></mesh>}
        {appearance.outfit === "casual" && <mesh position={[0, 0.195, 0.053]}><boxGeometry args={[0.028, 0.007, 0.006]} /><meshStandardMaterial color={outfit.accent} roughness={0.45} /></mesh>}
        {appearance.backpack !== "none" && <>
          {(() => {
            const compact = appearance.backpack === "compact";
            const bodyColor = compact ? "#8b5e3c" : GOLD;
            const pocketColor = compact ? "#aa7953" : "#f1d36f";
            return <>
              {/* Soft ellipsoid shell keeps the pack rounded in profile and rear views. */}
              <mesh position={[0, compact ? 0.161 : 0.164, -0.064]} scale={compact ? [0.037, 0.039, 0.022] : [0.043, 0.049, 0.025]}><sphereGeometry args={[1, 16, 12]} /><meshStandardMaterial color={bodyColor} roughness={0.62} /></mesh>
              {/* Shoulder straps are visible from the back and wrap just around the pack sides. */}
              {([-1, 1] as const).map((side) => <mesh key={side} position={[side * (compact ? 0.015 : 0.018), 0.166, -0.09]} scale={[0.003, compact ? 0.029 : 0.036, 0.003]}><sphereGeometry args={[1, 10, 8]} /><meshStandardMaterial color={compact ? "#69442e" : "#947006"} roughness={0.68} /></mesh>)}
              {/* Rounded outer pocket, centered below a small stitched closure. */}
              <mesh position={[0, compact ? 0.151 : 0.153, -0.093]} scale={compact ? [0.023, 0.014, 0.005] : [0.027, 0.017, 0.005]}><sphereGeometry args={[1, 14, 10]} /><meshStandardMaterial color={pocketColor} roughness={0.58} /></mesh>
              <mesh position={[0, compact ? 0.164 : 0.168, -0.097]} scale={[0.009, 0.0035, 0.002]}><sphereGeometry args={[1, 10, 8]} /><meshStandardMaterial color={compact ? "#5a402e" : "#8d6907"} roughness={0.6} /></mesh>
              {!compact && <mesh position={[0, 0.207, -0.089]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.013, 0.003, 5, 12]} /><meshStandardMaterial color="#a57a08" roughness={0.6} /></mesh>}
            </>;
          })()}
        </>}
        {([[armLeftRef, 0.068], [armRightRef, -0.068]] as const).map(([ref, x]) => <group key={x} ref={ref} position={[x, 0.198, 0]} rotation={[0, 0, x > 0 ? 0.12 : -0.12]}>
          {appearance.outfit === "plv_uniform" ? <>
            <mesh position={[0, -0.014, 0]}><capsuleGeometry args={[0.018, 0.018, 4, 10]} /><meshStandardMaterial color={outfit.jacket} roughness={0.58} /></mesh>
            <mesh position={[0, -0.055, 0]}><capsuleGeometry args={[0.015, 0.035, 4, 10]} /><meshStandardMaterial color={SKIN} roughness={0.7} /></mesh>
          </> : <mesh position={[0, -0.042, 0]}><capsuleGeometry args={[0.017, 0.05, 4, 10]} /><meshStandardMaterial color={outfit.jacket} roughness={0.55} /></mesh>}
          <mesh position={[0, -0.084, 0]}><sphereGeometry args={[0.02, 12, 8]} /><meshStandardMaterial color={SKIN} roughness={0.7} /></mesh>
        </group>)}
        <mesh position={[0, 0.218, 0]}><cylinderGeometry args={[0.018, 0.018, 0.03, 10]} /><meshStandardMaterial color={SKIN} roughness={0.7} /></mesh>
        <mesh position={[0, 0.29, 0]}><sphereGeometry args={[0.074, 24, 16]} /><meshStandardMaterial color={SKIN} roughness={0.7} /></mesh>
        <mesh position={[0.073, 0.288, 0]}><sphereGeometry args={[0.017, 10, 8]} /><meshStandardMaterial color={SKIN_SHADE} roughness={0.7} /></mesh>
        <mesh position={[-0.073, 0.288, 0]}><sphereGeometry args={[0.017, 10, 8]} /><meshStandardMaterial color={SKIN_SHADE} roughness={0.7} /></mesh>
        {/* A rounded, layered cut: a full crown and back volume, then soft swept locks. */}
        <mesh position={[0, 0.329, -0.008]} scale={[1.02, 0.86, 1.04]}><sphereGeometry args={[0.067, 16, 12]} /><meshStandardMaterial color={HAIR} roughness={0.82} /></mesh>
        <mesh position={[-0.026, 0.354, -0.004]} rotation={[0.12, 0, 0.18]} scale={[1.1, 0.8, 0.86]}><sphereGeometry args={[0.034, 14, 10]} /><meshStandardMaterial color={HAIR} roughness={0.8} /></mesh>
        {([-1, 1] as const).map((side) => <group key={side}>
          {/* Keep the side locks tucked into the crown for a smooth silhouette. */}
          <mesh position={[side * 0.052, 0.322, 0.004]} rotation={[0.08, side * 0.18, -side * 0.12]} scale={[0.46, 0.78, 0.68]}><sphereGeometry args={[0.034, 12, 10]} /><meshStandardMaterial color={HAIR} roughness={0.8} /></mesh>
          <mesh position={[side * 0.054, 0.302, 0.006]} rotation={[0.05, side * 0.16, side * 0.1]} scale={[0.36, 0.78, 0.62]}><sphereGeometry args={[0.027, 12, 8]} /><meshStandardMaterial color={HAIR} roughness={0.82} /></mesh>
        </group>)}
        {/* Soft swept layers continue across the rear crown without forming a spiky nape. */}
        {[["rear-a", -0.028, 0.328], ["rear-b", 0, 0.335], ["rear-c", 0.029, 0.329]].map(([key, x, y]) => <mesh key={String(key)} position={[Number(x), Number(y), -0.067]} rotation={[0.08, 0, Number(x) * 1.8]} scale={[0.88, 0.72, 0.48]}><sphereGeometry args={[0.024, 12, 9]} /><meshStandardMaterial color={key === "rear-b" ? "#292638" : HAIR} roughness={0.82} /></mesh>)}
        {/* Five overlapping tapered-looking fringe locks create visible texture without sharp spikes. */}
        {[
          [-0.047, 0.337, -0.17, 0.82], [-0.024, 0.333, -0.08, 0.92], [0, 0.333, 0.02, 1], [0.025, 0.336, 0.13, 0.94], [0.047, 0.339, 0.22, 0.82],
        ].map(([x, y, angle, size]) => <mesh key={x} position={[x, y, 0.057]} rotation={[0.12, 0, angle]} scale={[0.76 * size, 1.15 * size, 0.62]}><sphereGeometry args={[0.023, 12, 8]} /><meshStandardMaterial color={HAIR} roughness={0.78} /></mesh>)}
        <mesh position={[0.027, 0.296, 0.067]} scale={[1, 1.25, 0.5]}><sphereGeometry args={[0.011, 10, 8]} /><meshStandardMaterial color={HAIR} roughness={0.4} /></mesh>
        <mesh position={[-0.027, 0.296, 0.067]} scale={[1, 1.25, 0.5]}><sphereGeometry args={[0.011, 10, 8]} /><meshStandardMaterial color={HAIR} roughness={0.4} /></mesh>
        <mesh position={[0, 0.272, 0.069]} rotation={[0, 0, Math.PI]}><torusGeometry args={[0.016, 0.0038, 6, 14, Math.PI]} /><meshStandardMaterial color={HAIR} roughness={0.5} /></mesh>
        {appearance.outfit === "adventurer" && <>
          {/* Lower the full hat onto the crown so the layered hair tucks beneath the brim. */}
          <mesh position={[0, 0.379, 0]}><cylinderGeometry args={[0.082, 0.086, 0.012, 20]} /><meshStandardMaterial color="#a77a43" roughness={0.72} /></mesh>
          <mesh position={[0, 0.419, 0]} scale={[0.94, 0.74, 0.72]}><sphereGeometry args={[0.056, 18, 12]} /><meshStandardMaterial color="#b58a52" roughness={0.72} /></mesh>
          <mesh position={[0, 0.401, 0]}><cylinderGeometry args={[0.058, 0.06, 0.007, 18]} /><meshStandardMaterial color="#6f543a" roughness={0.75} /></mesh>
        </>}
      </group>
    </group>
  </>;
}

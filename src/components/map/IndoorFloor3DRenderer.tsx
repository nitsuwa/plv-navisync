import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { ThreeElements } from "@react-three/fiber";
import { Html, Line, OrbitControls } from "@react-three/drei";
import { DoorOpen, MapPin } from "lucide-react";
import { Component, Fragment, Suspense, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type MutableRefObject, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import * as THREE from "three";
import type { FloorLabel, FloorPlan, FloorRoom, FloorStairs, FloorFurniture } from "../map-builder/types";
import { roomOutlinePoints } from "../../lib/roomShape";
import { getFloorShapeRegions } from "../../lib/floorShape";
import { clampIndoorPriorityRoomLabel, exteriorEmergencyStairOpenings, indoorDoorVisualWidth, indoorFloorCameraFarPlane, indoorFloorCameraHalfDepth, indoorRoomLabelPriority, indoorWallOccludesFocus, isIndoorOpenBelowRoom, layoutIndoorRoomLabels, normalizeIndoorWallSegments, radialFurnitureSeatAngles, shouldRenderDescendingIndoorStair, shouldRenderIndoorLandmarkFurniture, shouldShowIndoorExitCue } from "../../lib/indoor3dGeometry";
import { exteriorZoneGeometry } from "../../lib/exteriorFloorZones";
import { exteriorStairVisualItem } from "../map-builder/ExteriorEmergencyFloorModule";
import type { Pt } from "../../lib/routePlanner";
import { createRoutePointSampler, createRouteWorldSampler, routeArrowPlacements } from "../../lib/studentRoute3dPresentation";
import { configureStudent3dInputMappings, crossedStudent3dDragThreshold } from "../../lib/student3dInput";
import { student3dFocusDistance, student3dSafeFocusCenter } from "../../lib/student3dCameraFocus";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}

interface FloorViewport { width: number; height: number; offsetX: number; offsetY: number }
interface IndoorFloor3DRendererProps {
  floor: FloorPlan;
  floorLabel: string;
  viewport: FloorViewport;
  routePoints?: readonly Pt[];
  walkProgress?: number;
  walkProgressRef?: MutableRefObject<number>;
  showStartMarker?: boolean;
  showDestinationMarker?: boolean;
  humanVisible?: boolean;
  selectedRoomId?: string | null;
  interactiveExitDoorIds?: ReadonlySet<string>;
  routeRelevantExitDoorIds?: ReadonlySet<string>;
  activeExitDoorId?: string | null;
  onExitDoorClick?: (doorId: string) => void;
  focusRoomId?: string | null;
  focusNonce?: number;
  destinationRoomId?: string | null;
  eventFurniture?: readonly FloorFurniture[];
  eventLabels?: readonly FloorLabel[];
  eventMarker?: { point: Pt; label: string } | null;
  activeTransition?: { point: Pt; label: string; onActivate?: () => void } | null;
  followMode?: boolean;
  followPlaying?: boolean;
  freeLook?: boolean;
  recenterNonce?: number;
  reducedMotion?: boolean;
  onRoomClick?: (roomId: string) => void;
  onIntentionalPan?: () => void;
  onFallback?: () => void;
}
type StairVisualItem = Pick<FloorStairs, "id" | "x" | "y" | "width" | "height" | "label"> & {
  rotation?: number; visible?: boolean; exteriorEmergencyStairId?: string; attachment?: FloorStairs["attachment"];
  direction?: FloorStairs["direction"] | "forward" | "reverse"; flip?: boolean;
};
type RampVisualItem = { x: number; y: number; width: number; height: number; rotation?: number; visible?: boolean; slope?: "gentle" | "medium" | "steep"; handrails?: boolean; direction?: "up" | "down" | "both" | "forward" | "reverse"; layout?: "straight" | "l_turn_left" | "l_turn_right" };

const FLOOR_SCALE = 0.025;
const WALL_HEIGHT = 2.9;
const FLOOR_SURFACE_Y = 0.012;
const EMPTY_FLOOR_ROUTE: readonly Pt[] = Object.freeze([]);
const EMPTY_STRING_SET: ReadonlySet<string> = new Set();

interface WallOcclusionEntry {
  material: THREE.MeshStandardMaterial;
  start: [number, number, number];
  end: [number, number, number];
  thickness: number;
  baseHeight: number;
  height: number;
  targetOpacity: number;
  registered: boolean;
}
type WallOcclusionRegistry = MutableRefObject<Map<string, WallOcclusionEntry>>;

class IndoorSceneBoundary extends Component<{ children: ReactNode; onError?: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError?.(); }
  render() { return this.state.failed ? null : this.props.children; }
}

function pointToWorld(point: Pt, viewport: FloorViewport, elevation = 0): [number, number, number] {
  return [
    (point.x + viewport.offsetX - viewport.width / 2) * FLOOR_SCALE,
    elevation,
    (point.y + viewport.offsetY - viewport.height / 2) * FLOOR_SCALE,
  ];
}

function rectShape(x: number, y: number, width: number, height: number, viewport: FloorViewport) {
  const shape = new THREE.Shape();
  const left = (x + viewport.offsetX - viewport.width / 2) * FLOOR_SCALE;
  const right = (x + width + viewport.offsetX - viewport.width / 2) * FLOOR_SCALE;
  const top = (y + viewport.offsetY - viewport.height / 2) * FLOOR_SCALE;
  const bottom = (y + height + viewport.offsetY - viewport.height / 2) * FLOOR_SCALE;
  // ShapeGeometry is authored in XY then rotated onto the XZ floor plane.
  shape.moveTo(left, -top);
  shape.lineTo(right, -top);
  shape.lineTo(right, -bottom);
  shape.lineTo(left, -bottom);
  shape.closePath();
  return shape;
}

function polygonShape(points: readonly Pt[], viewport: FloorViewport) {
  const shape = new THREE.Shape();
  points.forEach((point, index) => {
    const x = (point.x + viewport.offsetX - viewport.width / 2) * FLOOR_SCALE;
    const y = -(point.y + viewport.offsetY - viewport.height / 2) * FLOOR_SCALE;
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  shape.closePath();
  return shape;
}

function polygonShapeWithHoles(points: readonly Pt[], holes: readonly Pt[][], viewport: FloorViewport) {
  const shape = polygonShape(points, viewport);
  for (const polygon of holes) {
    if (polygon.length < 3) continue;
    const path = new THREE.Path();
    polygon.forEach((point, index) => {
      const x = (point.x + viewport.offsetX - viewport.width / 2) * FLOOR_SCALE;
      const y = -(point.y + viewport.offsetY - viewport.height / 2) * FLOOR_SCALE;
      if (index === 0) path.moveTo(x, y); else path.lineTo(x, y);
    });
    path.closePath();
    shape.holes.push(path);
  }
  return shape;
}

function polygonArea(points: readonly Pt[]) {
  return Math.abs(points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length];
    return area + point.x * next.y - next.x * point.y;
  }, 0) / 2);
}

function pointInPolygon(point: Pt, polygon: readonly Pt[]) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[index]; const b = polygon[previous];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function VoidGuardrail({ polygon, viewport }: { polygon: readonly Pt[]; viewport: FloorViewport }) {
  if (polygon.length < 3) return null;
  return <group>
    {polygon.map((point, index) => {
      const next = polygon[(index + 1) % polygon.length];
      const start = pointToWorld(point, viewport, FLOOR_SURFACE_Y + 0.025);
      const end = pointToWorld(next, viewport, FLOOR_SURFACE_Y + 0.025);
      const length = Math.hypot(end[0] - start[0], end[2] - start[2]);
      if (length < 0.12) return null;
      const angle = -Math.atan2(end[2] - start[2], end[0] - start[0]);
      const postCount = Math.max(1, Math.ceil(length / 0.75));
      return <group key={index}>
        {[0.4, 0.96].map((height) => <mesh key={height} position={[(start[0] + end[0]) / 2, FLOOR_SURFACE_Y + height, (start[2] + end[2]) / 2]} rotation={[0, angle, 0]}>
          <boxGeometry args={[length, 0.045, 0.035]} /><meshStandardMaterial color="#6b7780" metalness={0.2} roughness={0.54} />
        </mesh>)}
        {Array.from({ length: postCount + 1 }, (_, post) => {
          const t = post / postCount;
          return <mesh key={post} position={[start[0] + (end[0] - start[0]) * t, FLOOR_SURFACE_Y + 0.48, start[2] + (end[2] - start[2]) * t]}>
            <boxGeometry args={[0.035, 0.96, 0.035]} /><meshStandardMaterial color="#69757e" metalness={0.18} roughness={0.56} />
          </mesh>;
        })}
      </group>;
    })}
  </group>;
}

function routeRibbon(points: readonly Pt[], viewport: FloorViewport, fullWidth = 0.17, elevations?: readonly number[]) {
  const geometry = new THREE.BufferGeometry();
  if (points.length < 2) return geometry;
  const positions: number[] = [];
  const indices: number[] = [];
  const half = fullWidth / 2;
  const mapped = points.map((point, index) => pointToWorld(point, viewport, 0.075 + (elevations?.[index] ?? 0)));
  for (let index = 0; index < mapped.length; index += 1) {
    const before = mapped[Math.max(0, index - 1)];
    const after = mapped[Math.min(mapped.length - 1, index + 1)];
    const dx = after[0] - before[0];
    const dz = after[2] - before[2];
    const length = Math.max(1e-5, Math.hypot(dx, dz));
    const nx = -dz / length;
    const nz = dx / length;
    positions.push(mapped[index][0] + nx * half, mapped[index][1], mapped[index][2] + nz * half);
    positions.push(mapped[index][0] - nx * half, mapped[index][1], mapped[index][2] - nz * half);
    if (index < mapped.length - 1) {
      const start = index * 2;
      indices.push(start, start + 1, start + 2, start + 1, start + 3, start + 2);
    }
  }
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function rampHeightAt(point: Pt, ramps: readonly RampVisualItem[]) {
  for (const ramp of ramps) {
    if (ramp.visible === false) continue;
    const rotation = (ramp.rotation ?? 0) * Math.PI / 180;
    const dx = point.x - (ramp.x + ramp.width / 2);
    const dy = point.y - (ramp.y + ramp.height / 2);
    const localX = dx * Math.cos(rotation) + dy * Math.sin(rotation);
    const localY = -dx * Math.sin(rotation) + dy * Math.cos(rotation);
    if (Math.abs(localX) > ramp.width / 2 || Math.abs(localY) > ramp.height / 2) continue;
    const depth = Math.max(0.45, ramp.height * FLOOR_SCALE);
    const slope = ramp.slope ?? "medium";
    const rise = Math.min(0.72, depth * (slope === "gentle" ? 0.075 : slope === "steep" ? 0.19 : 0.12));
    const direction = ramp.direction === "down" || ramp.direction === "reverse" ? -1 : 1;
    const localRatio = localY / ramp.height + 0.5;
    return Math.max(0, Math.min(1, direction > 0 ? localRatio : 1 - localRatio)) * rise;
  }
  return 0;
}

type RoomLabelRegistry = MutableRefObject<Map<string, { element: HTMLSpanElement; position: THREE.Vector3; priority: number }>>;

function RoomFloor({ room, viewport, level, selected, destination, holes = [], labelPriority = 1, labelRegistry, onClick }: {
  room: FloorRoom; viewport: FloorViewport; level: number; selected: boolean; destination: boolean; holes?: readonly Pt[][]; labelPriority?: number; labelRegistry: RoomLabelRegistry; onClick?: () => void;
}) {
  const points = useMemo(() => roomOutlinePoints(room), [room]);
  const geometry = useMemo(() => new THREE.ShapeGeometry(polygonShapeWithHoles(points, holes, viewport)), [holes, points, viewport]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const color = destination ? "#4b98f0" : selected ? "#79b4f4" : "#e4e2dc";
  const protectedLabel = selected || destination;
  const center = points.reduce((sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }), { x: 0, y: 0 });
  const labelWorld = pointToWorld(center, viewport, FLOOR_SURFACE_Y + 0.025 + level * 0.003);
  const labelRef = useCallback((element: HTMLSpanElement | null) => {
    if (element) labelRegistry.current.set(room.id, { element, position: new THREE.Vector3(...labelWorld), priority: labelPriority });
    else labelRegistry.current.delete(room.id);
  }, [labelPriority, labelRegistry, labelWorld[0], labelWorld[1], labelWorld[2], room.id]);
  const outline = [...points, points[0]].map((point) => pointToWorld(point, viewport, FLOOR_SURFACE_Y + 0.018 + level * 0.003));
  return <group>
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR_SURFACE_Y + level * 0.003, 0]} onClick={onClick}>
    <meshStandardMaterial color={color} roughness={0.9} side={THREE.DoubleSide} emissive={destination ? "#1764c4" : selected ? "#2875ca" : "#000000"} emissiveIntensity={destination ? 0.34 : selected ? 0.24 : 0} />
    </mesh>
    {(selected || destination) && <Line points={outline} color={destination ? "#064fb8" : "#1471d4"} lineWidth={destination ? 4 : 3.5} />}
    <Html position={labelWorld} center style={{ pointerEvents: "none", whiteSpace: "nowrap" }}>
      <span ref={labelRef} style={{
        // Html's default wrapper shrink-wraps inline content to its min-content
        // width. For protected labels that made `overflow-wrap:anywhere` split
        // even short room codes into one vertical column. Give the label a
        // stable intrinsic width, then let the max-width wrap long names.
        display: "inline-block",
        width: "max-content",
        maxWidth: "min(70vw, 280px)",
        whiteSpace: protectedLabel ? "normal" : "nowrap",
        overflow: protectedLabel ? "visible" : "hidden",
        overflowWrap: protectedLabel ? "anywhere" : "normal",
        textAlign: "center",
        lineHeight: 1.2,
        textOverflow: protectedLabel ? "clip" : "ellipsis",
      }} className={`rounded-md px-2 py-1 text-[10px] transition-colors duration-150 ease-out ${destination ? "bg-blue-800 text-white font-extrabold shadow-md ring-2 ring-white/90" : selected ? "bg-blue-700 text-white font-extrabold shadow-md ring-2 ring-white/90" : "bg-white/85 font-semibold text-slate-700"}`}>{room.name}</span>
    </Html>
  </group>;
}
const MemoRoomFloor = memo(RoomFloor);

function IndoorRoomLabelDeclutter({ registry }: { registry: RoomLabelRegistry }) {
  const { camera, size } = useThree();
  const projected = useMemo(() => new THREE.Vector3(), []);
  const elapsed = useRef(0);
  useFrame((_, delta) => {
    // Label placement is presentation-only and does not need to run at the
    // avatar/camera frame rate on dense Floors.
    elapsed.current += Math.min(delta, 0.05);
    if (elapsed.current < 0.08) return;
    elapsed.current = 0;
    const entries = [...registry.current.entries()].filter(([, entry]) => entry.element.isConnected);
    const candidates = entries.flatMap(([id, entry]) => {
      projected.copy(entry.position).project(camera);
      const width = Math.max(24, entry.element.offsetWidth);
      const height = Math.max(16, entry.element.offsetHeight);
      const screenX = (projected.x * 0.5 + 0.5) * size.width;
      const screenY = (-projected.y * 0.5 + 0.5) * size.height;
      const important = entry.priority >= 4;
      if (!important && (projected.z < -1 || projected.z > 1 || projected.x < -1.5 || projected.x > 1.5 || projected.y < -1.5 || projected.y > 1.5)) return [];
      if (!Number.isFinite(screenX) || !Number.isFinite(screenY)) return [];
      const screenPosition = clampIndoorPriorityRoomLabel({ x: screenX, y: screenY, width, height, priority: entry.priority }, size.width, size.height);
      return [{ id,
        x: screenPosition.x,
        y: screenPosition.y,
        anchorOffsetX: screenPosition.anchorOffsetX,
        anchorOffsetY: screenPosition.anchorOffsetY,
        width, height, priority: entry.priority }];
    });
    const placements = layoutIndoorRoomLabels(candidates, size.width, size.height);
    const byId = new Map(placements.map((placement) => [placement.id, placement]));
    const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    for (const [id, entry] of entries) {
      const placement = byId.get(id);
      const visibility = placement?.visible ? "visible" : "hidden";
      const candidate = candidateById.get(id);
      const translate = placement?.visible
        ? `${placement.offsetX + (candidate?.anchorOffsetX ?? 0)}px ${placement.offsetY + (candidate?.anchorOffsetY ?? 0)}px`
        : "0px 0px";
      if (entry.element.style.visibility !== visibility) entry.element.style.visibility = visibility;
      if (entry.element.style.translate !== translate) entry.element.style.translate = translate;
      const zIndex = String(Math.round(entry.priority * 10));
      if (entry.element.style.zIndex !== zIndex) entry.element.style.zIndex = zIndex;
    }
  });
  return null;
}

function Wall({ id, segment, viewport, registry }: {
  id: string;
  segment: ReturnType<typeof normalizeIndoorWallSegments>[number];
  viewport: FloorViewport;
  registry: WallOcclusionRegistry;
}) {
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  const invalidate = useThree((state) => state.invalidate);
  const start = pointToWorld({ x: segment.x1, y: segment.y1 }, viewport);
  const end = pointToWorld({ x: segment.x2, y: segment.y2 }, viewport);
  const dx = end[0] - start[0]; const dz = end[2] - start[2];
  const length = Math.hypot(dx, dz);
  const angle = -Math.atan2(dz, dx);
  const thickness = Math.max(0.055, segment.thickness * FLOOR_SCALE);
  const height = segment.height || WALL_HEIGHT;
  useEffect(() => {
    const material = materialRef.current;
    if (!material) return;
    registry.current.set(id, {
      material,
      start,
      end,
      thickness,
      baseHeight: segment.baseHeight,
      height,
      targetOpacity: 1,
      registered: true,
    });
    invalidate();
    return () => {
      const entry = registry.current.get(id);
      if (entry) entry.registered = false;
      registry.current.delete(id);
      invalidate();
    };
  }, [end[0], end[2], height, id, invalidate, registry, segment.baseHeight, start[0], start[2], thickness]);
  const wallColor = useMemo(() => {
    const authored = new THREE.Color(segment.color || "#8d999f");
    // Keep a warm architectural wall tone without blending it into the floor.
    // A lighter mix made the full floor read as one washed-out mass at overview.
    return `#${authored.lerp(new THREE.Color("#ece7dd"), 0.38).getHexString()}`;
  }, [segment.color]);
  return <mesh position={[(start[0] + end[0]) / 2, FLOOR_SURFACE_Y + segment.baseHeight + height / 2, (start[2] + end[2]) / 2]} rotation={[0, angle, 0]} castShadow receiveShadow>
    <boxGeometry args={[length, height, thickness]} />
    <meshStandardMaterial ref={materialRef} color={wallColor} roughness={0.88} />
  </mesh>;
}
const MemoWall = memo(Wall);

function IndoorWallOcclusionController({ registry, viewport, route, progressRef, focusPoint, followMode }: {
  registry: WallOcclusionRegistry;
  viewport: FloorViewport;
  route: readonly Pt[];
  progressRef?: MutableRefObject<number>;
  focusPoint: Pt | null;
  followMode?: boolean;
}) {
  const { invalidate } = useThree();
  const sampleRoute = useMemo(() => createRoutePointSampler(route), [route]);
  const samplePoint = useRef<Pt>({ x: 0, y: 0 });
  const timeSinceCheck = useRef(1);
  const animating = useRef(new Set<WallOcclusionEntry>());
  useFrame(({ camera }, delta) => {
    const safeDelta = Math.min(delta, 0.05);
    timeSinceCheck.current += safeDelta;
    if (timeSinceCheck.current >= 0.08) {
      timeSinceCheck.current = 0;
      const point = followMode && progressRef
        ? sampleRoute(progressRef.current, samplePoint.current)
        : focusPoint;
      if (point) {
        const focus = pointToWorld(point, viewport, 0.16);
        for (const entry of registry.current.values()) {
          const occludesFocus = indoorWallOccludesFocus(
            camera.position,
            { x: focus[0], y: focus[1], z: focus[2] },
            { startX: entry.start[0], startZ: entry.start[2], endX: entry.end[0], endZ: entry.end[2], thickness: entry.thickness, baseY: FLOOR_SURFACE_Y + entry.baseHeight, height: entry.height },
          );
          // Preserve the room boundary while revealing the selected route point.
          // Very low opacity made several unrelated walls appear to vanish at once.
          const nextOpacity = occludesFocus ? 0.5 : 1;
          if (entry.targetOpacity !== nextOpacity) {
            entry.targetOpacity = nextOpacity;
            animating.current.add(entry);
            if (occludesFocus && !entry.material.transparent) {
              entry.material.transparent = true;
              entry.material.depthWrite = false;
              entry.material.needsUpdate = true;
            }
          }
        }
      } else {
        for (const entry of registry.current.values()) {
          if (entry.targetOpacity !== 1) {
            entry.targetOpacity = 1;
            animating.current.add(entry);
          }
        }
      }
    }

    const fade = 1 - Math.exp(-safeDelta * 8);
    for (const entry of animating.current) {
      if (!entry.registered) {
        animating.current.delete(entry);
        continue;
      }
      entry.material.opacity += (entry.targetOpacity - entry.material.opacity) * fade;
      if (Math.abs(entry.material.opacity - entry.targetOpacity) < 0.008) {
        entry.material.opacity = entry.targetOpacity;
        if (entry.targetOpacity === 1 && entry.material.transparent) {
          entry.material.transparent = false;
          entry.material.depthWrite = true;
          entry.material.needsUpdate = true;
        }
        animating.current.delete(entry);
      }
    }
    if (animating.current.size > 0) invalidate();
  });
  return null;
}

function IndoorRouteArrows({ arrows, points, viewport, ramps, reducedMotion = false }: {
  arrows: ReturnType<typeof routeArrowPlacements>;
  points: readonly Pt[];
  viewport: FloorViewport;
  ramps: readonly RampVisualItem[];
  reducedMotion?: boolean;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const sampler = useMemo(() => createRouteWorldSampler(points, FLOOR_SCALE), [points]);
  const elapsedRef = useRef(0);
  const transform = useMemo(() => new THREE.Object3D(), []);
  const pointScratch = useMemo(() => ({ x: 0, y: 0 }), []);
  const geometry = useMemo(() => {
    const shape = new THREE.Shape().moveTo(-0.18, -0.14).lineTo(0.18, 0).lineTo(-0.18, 0.14).lineTo(-0.065, 0).lineTo(-0.18, -0.14);
    const result = new THREE.ShapeGeometry(shape);
    result.rotateX(-Math.PI / 2);
    return result;
  }, []);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffffff", side: THREE.DoubleSide, depthWrite: false }), []);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const transform = new THREE.Object3D();
    arrows.forEach((arrow, index) => {
      transform.position.set(...pointToWorld(arrow.point, viewport, 0.1 + rampHeightAt(arrow.point, ramps)));
      transform.rotation.set(0, arrow.yaw, 0);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
    });
    mesh.count = arrows.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [arrows, ramps, viewport]);
  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh || reducedMotion || arrows.length === 0) return;
    const usable = sampler.totalLength - 1.8;
    if (usable <= 0) return;
    elapsedRef.current += Math.min(delta, 0.05);
    const spacing = usable / arrows.length;
    const phase = (elapsedRef.current * 0.3) % spacing;
    for (let index = 0; index < arrows.length; index += 1) {
      const distance = 0.9 + ((index * spacing + phase) % usable);
      const point = sampler.sample(distance, pointScratch);
      if (!point) continue;
      transform.position.set(...pointToWorld(point, viewport, 0.1 + rampHeightAt(point, ramps)));
      transform.rotation.set(0, sampler.yawAt(distance), 0);
      transform.scale.setScalar(sampler.isNearCorner(distance) ? 0 : 1);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
  if (!arrows.length) return null;
  return <instancedMesh ref={meshRef} args={[geometry, material, arrows.length]} renderOrder={11} frustumCulled />;
}

function ChairGeometry({ width, depth, color, tablet = false }: { width: number; depth: number; color: string; tablet?: boolean }) {
  const legColor = "#59616b";
  return <>
    <mesh position={[0, 0.47, 0]} castShadow><boxGeometry args={[width * 0.82, 0.055, depth * 0.78]} /><meshStandardMaterial color={color} roughness={0.78} /></mesh>
    <mesh position={[0, 0.73, -depth * 0.34]} castShadow><boxGeometry args={[width * 0.82, 0.48, 0.055]} /><meshStandardMaterial color={color} roughness={0.78} /></mesh>
    {[-1, 1].flatMap((x) => [-1, 1].map((z) => <mesh key={`${x}:${z}`} position={[x * width * 0.34, 0.225, z * depth * 0.31]}><boxGeometry args={[0.035, 0.43, 0.035]} /><meshStandardMaterial color={legColor} metalness={0.12} roughness={0.56} /></mesh>))}
    {tablet && <>
      <mesh position={[width * 0.47, 0.58, -depth * 0.04]} rotation={[0, 0, -0.09]} castShadow><boxGeometry args={[width * 0.58, 0.035, depth * 0.47]} /><meshStandardMaterial color={color} roughness={0.72} /></mesh>
      <mesh position={[width * 0.28, 0.52, -depth * 0.04]}><boxGeometry args={[0.025, 0.17, 0.025]} /><meshStandardMaterial color={legColor} metalness={0.25} /></mesh>
    </>}
  </>;
}

function TableGeometry({ width, depth, color, height = 0.76, pedestal = false }: { width: number; depth: number; color: string; height?: number; pedestal?: boolean }) {
  const legColor = "#6d6257";
  return <>
    <mesh position={[0, height, 0]} castShadow receiveShadow><boxGeometry args={[width, 0.07, depth]} /><meshStandardMaterial color={color} roughness={0.64} /></mesh>
    {pedestal
      ? <mesh position={[0, height / 2, 0]}><cylinderGeometry args={[0.075, 0.11, height - 0.04, 8]} /><meshStandardMaterial color={legColor} metalness={0.12} /></mesh>
      : [-1, 1].flatMap((x) => [-1, 1].map((z) => <mesh key={`${x}:${z}`} position={[x * width * 0.42, height / 2, z * depth * 0.4]}><boxGeometry args={[0.045, height, 0.045]} /><meshStandardMaterial color={legColor} /></mesh>))}
  </>;
}

function Furniture({ item, viewport }: { item: FloorPlan["furniture"][number]; viewport: FloorViewport }) {
  if (item.visible === false) return null;
  const position = pointToWorld({ x: item.x + item.width / 2, y: item.y + item.height / 2 }, viewport, FLOOR_SURFACE_Y);
  const width = Math.max(0.22, Math.min(4, item.width * FLOOR_SCALE));
  const depth = Math.max(0.22, Math.min(4, item.height * FLOOR_SCALE));
  const rotation = -(item.rotation || 0) * Math.PI / 180;
  const type = `${item.assetKey ?? ""} ${item.type}`.toLowerCase().replace(/[_\s]+/g, "-");
  const kind = `${type} ${item.category} ${item.name}`.toLowerCase();
  const color = item.color || "#9a795b";
  const deskChair = !/row/.test(type) && /student-desk-chair|faculty-desk-chair|computer-workstation|workstation|drafting-table-stool/.test(type);
  const lectureRow = /lecture-row-(4|6|8)|speech-lab-row|computer-workstation-row-(4|6)|computer-lab-table-(4|6)/.test(type);
  const lectureRowCount = Number(type.match(/(?:lecture-row|workstation-row|lab-table)-(\d+)/)?.[1]) || 4;
  const chair = /chair|seat|stool/.test(type) && !deskChair && !/table|desk|workstation|row|bench|cluster/.test(type);
  const tabletChair = /writing-arm|tablet-chair|lecture-chair/.test(type);
  const sofa = /sofa|couch|lounge/.test(kind);
  const loungeChair = /lounge-chair|arm-chair/.test(type);
  const loungeCluster = /lounge-chair-cluster/.test(type);
  const storage = /shelf|cabinet|locker|bookcase|storage|server-rack|vending-machine|printer-copier/.test(kind);
  const counter = /counter|reception/.test(kind);
  const seatingGrid = /audience-seating-4x4/.test(type);
  const bench = /bench/.test(kind);
  const roundGroup = /round-table-chairs/.test(type);
  const dinner4 = /dining-table-4-seats/.test(type);
  const dinner6 = /dining-table-6-seats/.test(type);
  const conference = /conference-table|boardroom-table-chairs/.test(type);
  const studyTable4 = /study-table-4/.test(type);
  const studyTable6 = /study-table-6/.test(type);
  const officeVisitors = /office-desk-visitors/.test(type);
  const workbenchStools = /lab-workbench-stools/.test(type);
  const libraryStudy = /library-study-table/.test(type);
  const tableSeatAngles = radialFurnitureSeatAngles(roundGroup ? 6 : dinner4 ? 4 : dinner6 || studyTable6 || libraryStudy ? 6 : conference ? 8 : studyTable4 ? 4 : 4);
  const doubleSided = /double-sided-study-table/.test(type);
  const longStudy = /communal-study-table|long-table/.test(type);
  const communal = longStudy || doubleSided;
  const hub = /collaborative-hub-table/.test(type);
  const carrel = /study-carrel/.test(type);
  const computer = /computer|workstation/.test(type);
  const teacherDesk = /teacher-desk/.test(type);
  const labTable = /lab-table|lab-workbench|computer-lab-table|drafting-table/.test(type);
  const carrelRow = /study-carrel-row/.test(type);
  const lShapedWorkstation = /l-shaped-workstation/.test(type);
  const whiteboard = /whiteboard|wall-display/.test(type);
  const lectern = /lectern/.test(type);
  const bed = /clinic-bed/.test(type);
  const waterFixture = /drinking-fountain/.test(type);
  const tableTennis = /table-tennis/.test(type);
  const restroomFixture = /toilet|urinal|sink|faucet|stall-partition|mirror|dispenser|floor-drain/.test(type);
  const table = /table|desk|workstation|carrel/.test(kind);
  const tabletopColor = color;
  const chairAt = (x: number, z: number, key: string, w = Math.min(0.34, width * 0.2), d = Math.min(0.34, depth * 0.28), tablet = false) =>
    <group key={key} position={[x, 0, z]}><ChairGeometry width={w} depth={d} color={color} tablet={tablet} /></group>;
  return <group position={position} rotation={[0, rotation, 0]} scale={[item.flipX ? -1 : 1, 1, item.flipY ? -1 : 1]}>
    {bed ? <>
      <mesh position={[0, 0.34, 0]} castShadow><boxGeometry args={[width * 0.9, 0.12, depth * 0.9]} /><meshStandardMaterial color="#d7dfe2" roughness={0.88} /></mesh>
      <mesh position={[0, 0.47, -depth * 0.3]}><boxGeometry args={[width * 0.84, 0.13, depth * 0.32]} /><meshStandardMaterial color="#f4f2ec" roughness={0.96} /></mesh>
      {[-1, 1].flatMap((side) => [-1, 1].map((end) => <mesh key={`${side}:${end}`} position={[side * width * 0.38, 0.16, end * depth * 0.38]}><boxGeometry args={[0.045, 0.32, 0.045]} /><meshStandardMaterial color="#697780" metalness={0.2} /></mesh>))}
      <mesh position={[0, 0.56, depth * 0.48]}><boxGeometry args={[width, 0.48, 0.055]} /><meshStandardMaterial color="#909ba1" /></mesh>
    </> : bench ? <>
      <mesh position={[0, 0.37, 0]} castShadow><boxGeometry args={[width * 0.95, 0.1, depth * 0.72]} /><meshStandardMaterial color={color} roughness={0.84} /></mesh>
      <mesh position={[0, 0.66, -depth * 0.28]} castShadow><boxGeometry args={[width * 0.95, 0.43, 0.075]} /><meshStandardMaterial color={color} roughness={0.82} /></mesh>
      {[-1, 1].map((side) => <Fragment key={side}>
        <mesh position={[side * width * 0.39, 0.19, 0]}><boxGeometry args={[0.07, 0.38, depth * 0.62]} /><meshStandardMaterial color="#59616b" metalness={0.16} /></mesh>
        <mesh position={[side * width * 0.39, 0.54, -depth * 0.28]}><boxGeometry args={[0.065, 0.58, 0.065]} /><meshStandardMaterial color="#59616b" metalness={0.16} /></mesh>
      </Fragment>)}
    </> : lShapedWorkstation ? <>
      <TableGeometry width={width * 0.92} depth={depth * 0.42} color={color} height={0.76} />
      <group position={[-width * 0.29, 0, depth * 0.2]} rotation={[0, Math.PI / 2, 0]}><TableGeometry width={width * 0.46} depth={depth * 0.42} color={color} height={0.76} /></group>
      {chairAt(width * 0.17, depth * 0.55, "l-workstation-seat")}
      <mesh position={[width * 0.14, 1.02, -depth * 0.12]}><boxGeometry args={[width * 0.25, 0.28, 0.045]} /><meshStandardMaterial color="#344653" /></mesh>
    </> : deskChair ? <>
      <TableGeometry width={width * 0.9} depth={depth * 0.55} color={color} height={0.76} />
      {chairAt(0, depth * 0.58, "desk-chair", Math.min(0.36, width * 0.24), Math.min(0.36, depth * 0.24), tabletChair)}
      {computer && <mesh position={[0, 1.02, -depth * 0.19]}><boxGeometry args={[width * 0.26, 0.28, 0.045]} /><meshStandardMaterial color="#344653" /></mesh>}
    </> : loungeCluster ? <>
      {[-1, 1].flatMap((x) => [-1, 1].map((z) => <group key={`${x}:${z}`} position={[x * width * 0.24, 0, z * depth * 0.24]}>
        <mesh position={[0, 0.32, 0]}><boxGeometry args={[width * 0.34, 0.18, depth * 0.34]} /><meshStandardMaterial color={color} roughness={0.88} /></mesh>
        <mesh position={[0, 0.57, -depth * 0.11]}><boxGeometry args={[width * 0.34, 0.42, depth * 0.1]} /><meshStandardMaterial color={color} roughness={0.86} /></mesh>
      </group>))}
    </> : loungeChair ? <>
      <mesh position={[0, 0.37, 0]} castShadow><boxGeometry args={[width * 0.8, 0.17, depth * 0.72]} /><meshStandardMaterial color={color} roughness={0.86} /></mesh>
      <mesh position={[0, 0.63, -depth * 0.26]} castShadow rotation={[-0.1, 0, 0]}><boxGeometry args={[width * 0.8, 0.47, depth * 0.13]} /><meshStandardMaterial color={color} roughness={0.86} /></mesh>
      {[-1, 1].map((side) => <mesh key={side} position={[side * width * 0.42, 0.48, 0]}><boxGeometry args={[0.08, 0.35, depth * 0.74]} /><meshStandardMaterial color={color} roughness={0.88} /></mesh>)}
      {[-1, 1].flatMap((x) => [-1, 1].map((z) => <mesh key={`${x}:${z}`} position={[x * width * 0.32, 0.14, z * depth * 0.28]}><boxGeometry args={[0.04, 0.28, 0.04]} /><meshStandardMaterial color="#625b54" /></mesh>))}
    </> : lectureRow ? <>
      {Array.from({ length: lectureRowCount }, (_, index) => {
        const x = ((index + 0.5) / lectureRowCount - 0.5) * width * 0.92;
        return <group key={index} position={[x, 0, 0]}>
          <TableGeometry width={width * 0.88 / lectureRowCount} depth={depth * 0.48} color={color} height={0.76} />
          {computer && <mesh position={[0, 1.02, -depth * 0.12]}><boxGeometry args={[width * 0.12, 0.24, 0.04]} /><meshStandardMaterial color="#344653" /></mesh>}
          {chairAt(0, depth * 0.53, `row-seat-${index}`, Math.min(0.27, width / lectureRowCount * 0.64), Math.min(0.3, depth * 0.22), true)}
        </group>;
      })}
    </> : chair ? <ChairGeometry width={Math.max(0.28, width * 0.74)} depth={Math.max(0.28, depth * 0.72)} color={color} tablet={tabletChair} />
      : sofa ? <>
        <mesh position={[0, 0.28, 0]} castShadow><boxGeometry args={[width, 0.42, depth]} /><meshStandardMaterial color={color} roughness={0.88} /></mesh>
        <mesh position={[0, 0.6, -depth * 0.39]} castShadow><boxGeometry args={[width, 0.55, depth * 0.22]} /><meshStandardMaterial color={color} roughness={0.86} /></mesh>
        {[-1, 1].map((side) => <mesh key={side} position={[side * width * 0.47, 0.4, 0]}><boxGeometry args={[0.09, 0.4, depth]} /><meshStandardMaterial color={color} roughness={0.85} /></mesh>)}
      </> : storage ? <>
        <mesh position={[0, 0.84, 0]} castShadow><boxGeometry args={[width, 1.68, depth]} /><meshStandardMaterial color={color} roughness={0.78} /></mesh>
        {[-1, 0, 1].map((shelf) => <mesh key={shelf} position={[0, 0.18 + (shelf + 1) * 0.55, depth * 0.505]}><boxGeometry args={[width * 0.9, 0.035, 0.035]} /><meshStandardMaterial color="#ded6c9" /></mesh>)}
      </> : counter ? <>
        <mesh position={[0, 0.47, 0]} castShadow><boxGeometry args={[width, 0.9, depth]} /><meshStandardMaterial color={color} roughness={0.74} /></mesh>
        <mesh position={[0, 0.94, 0]}><boxGeometry args={[width * 1.04, 0.07, depth * 1.04]} /><meshStandardMaterial color="#d5c7b4" /></mesh>
      </> : waterFixture ? <>
        <mesh position={[0, 0.34, 0]} castShadow><boxGeometry args={[width * 0.58, 0.68, depth * 0.56]} /><meshStandardMaterial color="#adb8bc" roughness={0.42} metalness={0.22} /></mesh>
        <mesh position={[0, 0.69, 0]}><boxGeometry args={[width * 0.75, 0.06, depth * 0.7]} /><meshStandardMaterial color="#c8d3d5" metalness={0.25} /></mesh>
        <mesh position={[0, 0.75, -depth * 0.14]}><cylinderGeometry args={[0.025, 0.025, 0.14, 8]} /><meshStandardMaterial color="#6f8993" metalness={0.5} /></mesh>
      </> : restroomFixture ? <>
        {(/toilet|urinal/.test(type)) ? <>
          <mesh position={[0, 0.27, 0]}><cylinderGeometry args={[width * 0.28, width * 0.25, 0.48, 10]} /><meshStandardMaterial color="#e7e8e5" roughness={0.55} /></mesh>
          <mesh position={[0, 0.5, depth * 0.08]}><cylinderGeometry args={[width * 0.31, width * 0.31, 0.07, 12]} /><meshStandardMaterial color="#f7f7f2" roughness={0.42} /></mesh>
        </> : /sink|faucet/.test(type) ? <>
          <mesh position={[0, 0.8, 0]}><boxGeometry args={[width * 0.7, 0.12, depth * 0.52]} /><meshStandardMaterial color="#eef0ed" metalness={0.12} roughness={0.32} /></mesh>
          <mesh position={[0, 0.89, -depth * 0.12]}><cylinderGeometry args={[0.025, 0.025, 0.2, 8]} /><meshStandardMaterial color="#7d969e" metalness={0.48} /></mesh>
          {[-1, 1].map((side) => <mesh key={side} position={[side * width * 0.22, 0.4, 0]}><boxGeometry args={[0.045, 0.8, 0.045]} /><meshStandardMaterial color="#8b9699" /></mesh>)}
        </> : <mesh position={[0, 0.45, 0]}><boxGeometry args={[width * 0.8, 0.9, depth * 0.08]} /><meshStandardMaterial color="#c6c9c5" roughness={0.45} metalness={0.12} /></mesh>}
      </> : carrelRow ? <>
        {Array.from({ length: 4 }, (_, i) => <group key={i} position={[(i - 1.5) * width * 0.22, 0, 0]}>
          <TableGeometry width={width * 0.19} depth={depth * 0.78} color={color} height={0.76} />
          <mesh position={[0, 0.96, -depth * 0.36]}><boxGeometry args={[width * 0.18, 0.38, 0.04]} /><meshStandardMaterial color="#b8aa94" /></mesh>
          {chairAt(0, depth * 0.52, `seat-${i}`, Math.min(0.27, width * 0.13), Math.min(0.3, depth * 0.23))}
        </group>)}
      </> : seatingGrid ? <>
        {Array.from({ length: 16 }, (_, index) => {
          const row = Math.floor(index / 4); const col = index % 4;
          return chairAt((col - 1.5) * width * 0.24, (row - 1.5) * depth * 0.24, `audience-${index}`, Math.min(0.22, width * 0.14), Math.min(0.22, depth * 0.14));
        })}
      </> : roundGroup || dinner4 || dinner6 || studyTable4 || studyTable6 || conference || communal || hub || officeVisitors || workbenchStools || libraryStudy ? <>
        {hub ? <>
          {[0, 120, 240].map((angle) => <mesh key={angle} position={[0, 0.76, 0]} rotation={[0, angle * Math.PI / 180, 0]}><boxGeometry args={[width * 0.35, 0.07, depth * 0.78]} /><meshStandardMaterial color={color} /></mesh>)}
          <mesh position={[0, 0.76, 0]}><cylinderGeometry args={[Math.min(width, depth) * 0.18, Math.min(width, depth) * 0.18, 0.07, 8]} /><meshStandardMaterial color={color} /></mesh>
          {Array.from({ length: 6 }, (_, i) => { const a = i * Math.PI / 3; return chairAt(Math.cos(a) * width * 0.39, Math.sin(a) * depth * 0.39, `hub-seat-${i}`); })}
        </> : doubleSided ? <>
          <TableGeometry width={width * 0.9} depth={depth * 0.42} color={color} height={0.76} />
          {[-1, 1].flatMap((side) => Array.from({ length: 4 }, (_, index) => chairAt(((index + 0.5) / 4 - 0.5) * width * 0.78, side * depth * 0.29, `study-bench-${side}-${index}`, Math.min(0.28, width * 0.14), Math.min(0.28, depth * 0.2))))}
        </> : <>
          {roundGroup
            ? <mesh position={[0, 0.76, 0]}><cylinderGeometry args={[Math.min(width, depth) * 0.32, Math.min(width, depth) * 0.32, 0.07, 12]} /><meshStandardMaterial color={color} /></mesh>
            : <TableGeometry width={width * (conference || communal || libraryStudy ? 0.82 : 0.62)} depth={depth * (conference || communal || libraryStudy ? 0.55 : 0.62)} color={color} pedestal={roundGroup} />}
          {officeVisitors ? <>
            {chairAt(0, depth * 0.52, "visitor-seat-1")}{chairAt(-width * 0.3, depth * 0.52, "visitor-seat-2")}{chairAt(0, -depth * 0.5, "operator-seat")}
          </> : workbenchStools ? <>
            {[-1, 0, 1].map((seat) => chairAt(seat * width * 0.28, depth * 0.54, `workbench-stool-${seat}`))}
            <mesh position={[0, 0.99, -depth * 0.18]}><boxGeometry args={[width * 0.22, 0.26, 0.04]} /><meshStandardMaterial color="#344653" /></mesh>
          </> : communal ? <>
            {[-1, 1].flatMap((side) => Array.from({ length: longStudy ? 4 : 3 }, (_, i) => chairAt(((i + 0.5) / (longStudy ? 4 : 3) - 0.5) * width * 0.72, side * depth * 0.36, `communal-seat-${side}-${i}`)))}
          </> : tableSeatAngles.map((angle, i) => {
            const rx = roundGroup ? width * 0.4 : width * 0.42;
            const rz = roundGroup ? depth * 0.4 : depth * 0.42;
            return chairAt(Math.cos(angle) * rx, Math.sin(angle) * rz, `table-seat-${i}`, Math.min(0.27, width * 0.14), Math.min(0.27, depth * 0.18));
          })}
        </>}
      </> : whiteboard ? <>
        <mesh position={[0, 1.22, 0]} castShadow><boxGeometry args={[width * 0.92, 1.55, 0.06]} /><meshStandardMaterial color={/display/.test(type) ? "#344653" : "#eff1ed"} roughness={0.38} metalness={0.08} /></mesh>
        {[-1, 1].map((side) => <mesh key={side} position={[side * width * 0.43, 0.61, 0]}><boxGeometry args={[0.035, 1.2, 0.04]} /><meshStandardMaterial color="#7a8588" metalness={0.16} /></mesh>)}
      </> : lectern ? <>
        <mesh position={[0, 0.46, 0]} castShadow><boxGeometry args={[width * 0.75, 0.82, depth * 0.68]} /><meshStandardMaterial color={color} roughness={0.76} /></mesh>
        <mesh position={[0, 0.89, -depth * 0.12]} rotation={[-0.16, 0, 0]}><boxGeometry args={[width * 0.95, 0.08, depth * 0.85]} /><meshStandardMaterial color="#b99a72" /></mesh>
      </> : tableTennis ? <>
        <TableGeometry width={width} depth={depth} color="#28705b" height={0.76} />
        <mesh position={[0, 0.84, 0]}><boxGeometry args={[width * 1.01, 0.12, 0.025]} /><meshStandardMaterial color="#ecece4" /></mesh>
        <mesh position={[0, 0.8, 0]}><boxGeometry args={[0.025, 0.07, depth * 0.96]} /><meshStandardMaterial color="#f1f2e9" /></mesh>
      </> : table || labTable || computer || teacherDesk || carrel ? <>
        <TableGeometry width={width * (carrel ? 0.88 : 0.94)} depth={depth * (carrel ? 0.65 : 0.86)} color={color} height={teacherDesk ? 0.8 : labTable ? 0.84 : 0.76} />
        {(computer || labTable) && <>
          <mesh position={[0, 1.02, -depth * 0.28]}><boxGeometry args={[width * 0.26, 0.28, 0.045]} /><meshStandardMaterial color="#344653" /></mesh>
          {computer && <mesh position={[0, 0.82, -depth * 0.25]}><boxGeometry args={[width * 0.36, 0.035, depth * 0.16]} /><meshStandardMaterial color="#424c55" /></mesh>}
          {labTable && [-1, 1].map((s) => <mesh key={s} position={[s * width * 0.25, 0.95, 0]}><cylinderGeometry args={[0.045, 0.055, 0.2, 8]} /><meshStandardMaterial color="#b5c6cc" /></mesh>)}
        </>}
        {(teacherDesk || carrel || deskChair) && chairAt(0, depth * 0.58, "seat", Math.min(0.32, width * 0.24), Math.min(0.32, depth * 0.26), false)}
        {carrel && <mesh position={[0, 0.86, -depth * 0.44]}><boxGeometry args={[width * 0.86, 0.38, 0.045]} /><meshStandardMaterial color="#b8aa94" /></mesh>}
      </> : <>
        <TableGeometry width={width} depth={depth} color={color} />
      </>}
  </group>;
}
const MemoFurniture = memo(Furniture);

function Beam({ start, end, thickness, color, metalness = 0 }: { start: [number, number, number]; end: [number, number, number]; thickness: number; color: string; metalness?: number }) {
  const a = new THREE.Vector3(...start); const b = new THREE.Vector3(...end);
  const direction = b.clone().sub(a); const length = direction.length();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return <mesh position={a.add(b).multiplyScalar(0.5)} quaternion={quaternion} castShadow>
    <boxGeometry args={[thickness, length, thickness]} /><meshStandardMaterial color={color} metalness={metalness} roughness={metalness ? 0.44 : 0.74} />
  </mesh>;
}

function StairFlight({ x, width, fromZ, toZ, fromY, toY, steps, color = "#b7c1c7", railColor = "#63727b", railPostSegments = 4, railHeight = 0.79 }: {
  x: number; width: number; fromZ: number; toZ: number; fromY: number; toY: number; steps: number; color?: string; railColor?: string; railPostSegments?: number; railHeight?: number;
}) {
  const count = Math.max(3, steps);
  const direction = Math.sign(toZ - fromZ) || 1;
  const treadDepth = Math.abs(toZ - fromZ) / count;
  const edgeXs = [x - width / 2, x + width / 2];
  return <group>
    {Array.from({ length: count }, (_, index) => {
      const ratio = (index + 1) / count;
      const previousY = fromY + (toY - fromY) * (index / count);
      const treadY = fromY + (toY - fromY) * ratio;
      const treadZ = fromZ + (toZ - fromZ) * ratio;
      const riserY = (previousY + treadY) / 2;
      const riserZ = treadZ - direction * treadDepth * 0.47;
      return <Fragment key={index}>
        <mesh position={[x, treadY - 0.035, treadZ]} castShadow receiveShadow><boxGeometry args={[width, 0.07, treadDepth + 0.025]} /><meshStandardMaterial color={color} roughness={0.76} metalness={0.08} /></mesh>
        <mesh position={[x, riserY - 0.035, riserZ]}><boxGeometry args={[width - 0.015, Math.max(0.025, Math.abs(treadY - previousY)), 0.035]} /><meshStandardMaterial color="#9faab0" roughness={0.8} /></mesh>
      </Fragment>;
    })}
    {edgeXs.map((edgeX) => <Fragment key={edgeX}>
      <Beam start={[edgeX, fromY - 0.09, fromZ]} end={[edgeX, toY - 0.09, toZ]} thickness={0.07} color="#87949b" metalness={0.12} />
      <Beam start={[edgeX, fromY + railHeight, fromZ]} end={[edgeX, toY + railHeight, toZ]} thickness={0.045} color={railColor} metalness={0.22} />
      {Array.from({ length: Math.min(railPostSegments, count) + 1 }, (_, index) => {
        const ratio = index / Math.min(railPostSegments, count);
        const z = fromZ + (toZ - fromZ) * ratio;
        const y = fromY + (toY - fromY) * ratio;
        return <Beam key={index} start={[edgeX, y, z]} end={[edgeX, y + railHeight, z]} thickness={0.028} color={railColor} metalness={0.18} />;
      })}
    </Fragment>)}
  </group>;
}

function Landing({ width, depth, z, y, color = "#d8dfe2" }: { width: number; depth: number; z: number; y: number; color?: string }) {
  return <mesh position={[0, y - 0.04, z]} castShadow receiveShadow><boxGeometry args={[width, 0.08, depth]} /><meshStandardMaterial color={color} roughness={0.82} /></mesh>;
}

function StairModel({ stair, viewport, floor, entranceModel = false }: { stair: StairVisualItem; viewport: FloorViewport; floor: FloorPlan; entranceModel?: boolean }) {
  if (stair.visible === false) return null;
  if (stair.exteriorEmergencyStairId) return <ExteriorEmergencyStairModel stair={stair as FloorStairs} viewport={viewport} floor={floor} />;
  const position = pointToWorld({ x: stair.x + stair.width / 2, y: stair.y + stair.height / 2 }, viewport, FLOOR_SURFACE_Y);
  const width = Math.max(0.92, stair.width * FLOOR_SCALE);
  const depth = Math.max(1.15, stair.height * FLOOR_SCALE);
  const entrance = entranceModel || stair.direction === "forward" || stair.direction === "reverse";
  const yaw = -(stair.rotation ?? 0) * Math.PI / 180;
  const stepCount = Math.max(5, Math.min(10, Math.round(depth / 0.22)));
  const steel = "#657780";
  if (entrance) {
    const sign = stair.direction === "reverse" ? -1 : 1;
    const fromZ = sign * depth / 2;
    const toZ = -sign * depth / 2;
    const rise = 0.42;
    return <group position={position} rotation={[0, yaw, 0]}>
      <Landing width={width * 1.08} depth={0.34} z={fromZ + sign * 0.13} y={0.02} color="#d9ddd9" />
      <StairFlight x={0} width={width * 0.88} fromZ={fromZ} toZ={toZ} fromY={0} toY={rise} steps={stepCount} color="#d1d4d1" railColor={steel} railPostSegments={2} railHeight={0.44} />
      <Landing width={width * 1.08} depth={0.38} z={toZ - sign * 0.12} y={rise} color="#d9ddd9" />
    </group>;
  }

  // The first published Floor is ground level; never project a stair run
  // through the terrain when its authored direction is ambiguous/downward.
  const descending = shouldRenderDescendingIndoorStair(floor.number, stair.direction);
  const sign = descending ? -1 : 1;
  const halfRise = 0.62 * sign;
  const fullRise = 1.24 * sign;
  const landingDepth = Math.min(0.42, depth * 0.22);
  const frontZ = depth / 2 - landingDepth / 2;
  const backZ = -depth / 2 + landingDepth / 2;
  const laneWidth = Math.max(0.38, width * 0.39);
  const firstLane = stair.flip ? width * 0.23 : -width * 0.23;
  const secondLane = -firstLane;
  return <group position={position} rotation={[0, yaw, 0]}>
    <Landing width={width * 0.98} depth={landingDepth} z={frontZ} y={0} />
    <StairFlight x={firstLane} width={laneWidth} fromZ={frontZ - landingDepth * 0.28} toZ={backZ + landingDepth * 0.28} fromY={0} toY={halfRise} steps={stepCount} />
    <Landing width={width * 0.98} depth={landingDepth} z={backZ} y={halfRise} />
    <StairFlight x={secondLane} width={laneWidth} fromZ={backZ + landingDepth * 0.28} toZ={frontZ - landingDepth * 0.28} fromY={halfRise} toY={fullRise} steps={stepCount} />
    <Landing width={width * 0.98} depth={landingDepth} z={frontZ} y={fullRise} />
    <Html position={[0, fullRise + 0.1, backZ]} center style={{ pointerEvents: "none", whiteSpace: "nowrap" }}><span className="rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-bold text-slate-700 shadow-sm">{stair.label}</span></Html>
  </group>;
}
const MemoStairModel = memo(StairModel);

function EmergencyDoorwayFrame({ door, floor, viewport }: { door: FloorPlan["doors"][number]; floor: FloorPlan; viewport: FloorViewport }) {
  const wall = floor.walls.find((candidate) => candidate.id === door.wallId);
  const angle = wall ? Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1) : 0;
  const position = pointToWorld({ x: door.x, y: door.y }, viewport, FLOOR_SURFACE_Y);
  const width = Math.max(0.82, indoorDoorVisualWidth(door) * FLOOR_SCALE);
  const needsVisualLeaf = door.openingType === "open_passage";
  const leafCount = door.doorType === "double" || door.direction === "double" ? 2 : 1;
  return <group position={position} rotation={[0, -angle, 0]}>
    {[-1, 1].map((side) => <mesh key={side} position={[side * width * 0.5, 1.04, 0]} castShadow>
      <boxGeometry args={[0.055, 2.08, 0.09]} />
      <meshStandardMaterial color="#36434a" roughness={0.68} metalness={0.28} />
    </mesh>)}
    <mesh position={[0, 2.1, 0]} castShadow>
      <boxGeometry args={[width + 0.1, 0.08, 0.09]} />
      <meshStandardMaterial color="#36434a" roughness={0.68} metalness={0.28} />
    </mesh>
    {needsVisualLeaf && Array.from({ length: leafCount }, (_, index) => {
      const x = leafCount === 1 ? 0 : (index === 0 ? -1 : 1) * width / 4;
      return <group key={index}>
        <mesh position={[x, 1.02, 0.018]} castShadow>
          <boxGeometry args={[width / leafCount - 0.025, 2.02, 0.035]} />
          <meshStandardMaterial color="#4c5960" roughness={0.68} metalness={0.24} />
        </mesh>
        {leafCount === 2 && <mesh position={[x, 1.02, 0.041]}><boxGeometry args={[0.014, 1.96, 0.012]} /><meshStandardMaterial color="#d8c5a5" metalness={0.18} roughness={0.48} /></mesh>}
        <mesh position={[x, 0.98, 0.063]} castShadow><boxGeometry args={[Math.max(width / leafCount - 0.18, 0.32), 0.055, 0.055]} /><meshStandardMaterial color="#d5dde0" metalness={0.72} roughness={0.3} /></mesh>
      </group>;
    })}
    <Html position={[0, 2.34, 0.07]} center distanceFactor={12} style={{ pointerEvents: "none", whiteSpace: "nowrap" }}><span className="rounded-sm border border-white/80 bg-red-700 px-1.5 py-0.5 text-[8px] font-black tracking-[0.12em] text-white shadow">EXIT</span></Html>
  </group>;
}

function ExteriorEmergencyStairModel({ stair, viewport, floor }: { stair: FloorStairs; viewport: FloorViewport; floor: FloorPlan }) {
  const canvasW = floor.canvasW ?? 600;
  const canvasH = floor.canvasH ?? 450;
  const visual = exteriorStairVisualItem(stair, canvasW, canvasH);
  const edge = stair.attachment?.edge ?? "right";
  const center = pointToWorld({ x: visual.x + visual.width / 2, y: visual.y + visual.height / 2 }, viewport, 0);
  const yaw = edge === "right" ? Math.PI / 2 : edge === "left" ? -Math.PI / 2 : edge === "top" ? Math.PI : 0;
  const width = Math.max(0.55, (edge === "left" || edge === "right" ? visual.height : visual.width) * FLOOR_SCALE);
  const depth = Math.max(0.6, (edge === "left" || edge === "right" ? visual.width : visual.height) * FLOOR_SCALE);
  const count = Math.max(6, Math.min(10, Math.round(depth / 0.18)));
  // Exterior fire-escape metal is lighter and less wire-dense than the old
  // near-black treatment, which collapsed into a tangled silhouette at map scale.
  const steel = "#53666f";
  const upperZ = -depth / 2 + 0.16;
  const outerZ = depth / 2 - 0.18;
  const groundFloorAccess = floor.number <= 1;
  // The indoor Floor view anchors this model at its current landing. On the
  // Ground Floor, show only the short access flight to grade; repeating the
  // full two-flight descent below every Floor made ground exits look like a
  // basement tower. The campus renderer owns the complete authored fire
  // escape across served Floors.
  const middleY = groundFloorAccess ? -0.42 : -1.28;
  const lowerY = groundFloorAccess ? middleY : -2.56;
  const flightWidth = Math.max(0.44, width * 0.38);
  const firstLane = -width * 0.24;
  const secondLane = width * 0.24;
  const landingDepth = Math.max(0.32, Math.min(0.48, depth * 0.2));
  // The published 2D module includes a narrow platform from the authored wall
  // opening to the exterior stair. Carry that same connection into 3D so the
  // fire escape reads as attached to the building instead of a detached prop.
  const wallGap = 28 * FLOOR_SCALE;
  return <group>
    {/* The authored occurrence anchors the access door. The two flights and
        intermediate landing project out from that wall as a metal fire escape. */}
    <group position={center} rotation={[0, yaw, 0]}>
      <mesh position={[0, -0.035, upperZ - wallGap / 2]} castShadow receiveShadow>
        <boxGeometry args={[width * 0.92, 0.07, wallGap + 0.025]} />
        <meshStandardMaterial color="#7d8b91" roughness={0.78} metalness={0.12} />
      </mesh>
      {!groundFloorAccess && [-1, 1].map((side) => <Fragment key={`access-rail-${side}`}>
        <Beam start={[side * width * 0.47, 0.8, upperZ - wallGap]} end={[side * width * 0.47, 0.8, upperZ]} thickness={0.035} color="#52646d" metalness={0.28} />
        {[0, 0.33, 0.66, 1].map((step) => {
          const z = upperZ - wallGap + wallGap * step;
          return <Beam key={step} start={[side * width * 0.47, -0.02, z]} end={[side * width * 0.47, 0.8, z]} thickness={0.022} color="#60727a" metalness={0.24} />;
        })}
      </Fragment>)}
      <Landing width={width * 1.08} depth={landingDepth} z={upperZ} y={0} color="#687780" />
      <StairFlight x={firstLane} width={flightWidth} fromZ={upperZ + landingDepth * 0.38} toZ={outerZ - landingDepth * 0.3} fromY={0} toY={middleY} steps={count} color="#78888f" railColor={steel} railPostSegments={groundFloorAccess ? 1 : 2} railHeight={groundFloorAccess ? 0.62 : 0.79} />
      <Landing width={width} depth={landingDepth} z={outerZ} y={middleY} color="#77868d" />
      {!groundFloorAccess && <>
        <StairFlight x={secondLane} width={flightWidth} fromZ={outerZ - landingDepth * 0.3} toZ={upperZ + landingDepth * 0.38} fromY={middleY} toY={lowerY} steps={count} color="#78888f" railColor={steel} railPostSegments={2} />
        <Landing width={width * 1.08} depth={landingDepth} z={upperZ} y={lowerY} color="#687780" />
      </>}
      {!groundFloorAccess && [-1, 1].map((side) => <Fragment key={`support-${side}`}>
        <Beam start={[side * width * 0.48, 0.02, outerZ]} end={[side * width * 0.48, lowerY - 0.02, outerZ]} thickness={0.055} color={steel} metalness={0.42} />
        <Beam start={[side * width * 0.48, 0.02, upperZ]} end={[side * width * 0.48, lowerY - 0.02, upperZ]} thickness={0.055} color={steel} metalness={0.42} />
        {(groundFloorAccess ? [0] : [0, middleY, lowerY]).map((y) => <Beam key={y} start={[side * width * 0.52, y, upperZ]} end={[side * width * 0.52, y + 0.56, upperZ]} thickness={0.032} color={steel} metalness={0.3} />)}
      </Fragment>)}
      {(!groundFloorAccess ? [{ z: upperZ, y: 0 }, { z: outerZ, y: middleY }, { z: upperZ, y: lowerY }] : []).map(({ z, y }, index) => <mesh key={`landing-grate-${index}`} position={[0, y - 0.006, z]}>
        <boxGeometry args={[width * 0.92, 0.018, 0.025]} /><meshStandardMaterial color="#c2c9cc" metalness={0.25} roughness={0.55} />
      </mesh>)}
    </group>
  </group>;
}

function ElevatorModel({ elevator, viewport }: { elevator: FloorPlan["elevators"][number]; viewport: FloorViewport }) {
  if (elevator.visible === false) return null;
  const position = pointToWorld({ x: elevator.x + elevator.width / 2, y: elevator.y + elevator.height / 2 }, viewport, FLOOR_SURFACE_Y);
  const width = Math.max(0.45, elevator.width * FLOOR_SCALE);
  const depth = Math.max(0.4, elevator.height * FLOOR_SCALE);
  return <group position={position} rotation={[0, -(elevator.rotation ?? 0) * Math.PI / 180, 0]}>
    <mesh position={[0, 0.95, 0]}><boxGeometry args={[width, 1.9, depth]} /><meshStandardMaterial color="#4b5563" roughness={0.55} /></mesh>
    <mesh position={[0, 0.95, depth * 0.51]}><boxGeometry args={[width * 0.78, 1.72, 0.025]} /><meshStandardMaterial color="#dce5ec" metalness={0.36} roughness={0.34} /></mesh>
    <mesh position={[0, 0.95, depth * 0.53]}><boxGeometry args={[0.025, 1.72, 0.03]} /><meshStandardMaterial color="#8c9aa7" metalness={0.5} /></mesh>
    <Html position={[0, 2.05, 0]} center distanceFactor={11} style={{ pointerEvents: "none", whiteSpace: "nowrap" }}><span className="rounded bg-white/85 px-1.5 py-0.5 text-[9px] font-bold text-slate-700">{elevator.label}</span></Html>
  </group>;
}
const MemoElevatorModel = memo(ElevatorModel);

function RampModel({ item, viewport }: { item: RampVisualItem; viewport: FloorViewport }) {
  if (item.visible === false) return null;
  const position = pointToWorld({ x: item.x + item.width / 2, y: item.y + item.height / 2 }, viewport, FLOOR_SURFACE_Y);
  const width = Math.max(0.32, item.width * FLOOR_SCALE);
  const depth = Math.max(0.45, item.height * FLOOR_SCALE);
  const slope = "slope" in item ? item.slope : "medium";
  const rotation = -(item.rotation ?? 0) * Math.PI / 180;
  const rise = Math.min(0.72, depth * (slope === "gentle" ? 0.075 : slope === "steep" ? 0.19 : 0.12));
  const direction = item.direction === "down" || item.direction === "reverse" ? -1 : 1;
  const lowZ = direction < 0 ? depth / 2 : -depth / 2;
  const highZ = -lowZ;
  const handrails = "handrails" in item && item.handrails;
  const rampGeometry = useMemo(() => {
    const half = width / 2; const thick = 0.065;
    const lowY = 0.035; const highY = rise + 0.035;
    const vertices = [
      -half, lowY, lowZ, half, lowY, lowZ, half, highY, highZ, -half, highY, highZ,
      -half, lowY - thick, lowZ, half, lowY - thick, lowZ, half, highY - thick, highZ, -half, highY - thick, highZ,
    ];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0]);
    geometry.computeVertexNormals();
    return geometry;
  }, [highZ, lowZ, rise, width]);
  useEffect(() => () => rampGeometry.dispose(), [rampGeometry]);
  return <group position={position} rotation={[0, rotation, 0]}>
    <mesh geometry={rampGeometry} castShadow receiveShadow><meshStandardMaterial color="#c4ccca" roughness={0.84} side={THREE.DoubleSide} /></mesh>
    {handrails && [-1, 1].map((side) => <Fragment key={side}>
      <Beam start={[side * width * 0.53, (lowZ < 0 ? 0.035 : rise + 0.035) + 0.76, lowZ]} end={[side * width * 0.53, (highZ < 0 ? 0.035 : rise + 0.035) + 0.76, highZ]} thickness={0.035} color="#87939a" metalness={0.35} />
      {Array.from({ length: 4 }, (_, index) => {
        const t = index / 3; const z = lowZ + (highZ - lowZ) * t; const baseY = 0.035 + (direction > 0 ? t : 1 - t) * rise;
        return <Beam key={index} start={[side * width * 0.53, baseY, z]} end={[side * width * 0.53, baseY + 0.76, z]} thickness={0.025} color="#87939a" metalness={0.3} />;
      })}
    </Fragment>)}
  </group>;
}
const MemoRampModel = memo(RampModel);

function DoorModel({ door, floor, viewport }: { door: FloorPlan["doors"][number]; floor: FloorPlan; viewport: FloorViewport }) {
  if (door.visible === false || door.openingType === "open_passage") return null;
  const wall = floor.walls.find((candidate) => candidate.id === door.wallId);
  const wallAngle = wall ? Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1) : 0;
  const width = Math.max(0.82, indoorDoorVisualWidth(door) * FLOOR_SCALE);
  const position = pointToWorld({ x: door.x, y: door.y }, viewport, FLOOR_SURFACE_Y);
  const double = door.doorType === "double" || door.direction === "double";
  const leafCount = double ? 2 : 1;
  const leafWidth = width / leafCount;
  const emergency = Boolean(door.isEmergencyExit);
  const leafColor = emergency ? "#4c5960" : "#a77950";
  const frameColor = emergency ? "#36434a" : "#c4a37b";
  return <group position={position} rotation={[0, -wallAngle, 0]}>
    {[-1, 1].map((side) => <mesh key={`jamb-${side}`} position={[side * width * 0.5, 1.04, 0]} castShadow>
      <boxGeometry args={[0.045, 2.08, 0.08]} /><meshStandardMaterial color={frameColor} roughness={0.72} metalness={emergency ? 0.28 : 0} />
    </mesh>)}
    <mesh position={[0, 2.08, 0]} castShadow><boxGeometry args={[width + 0.045, 0.07, 0.08]} /><meshStandardMaterial color={frameColor} roughness={0.72} metalness={emergency ? 0.28 : 0} /></mesh>
    {Array.from({ length: leafCount }, (_, index) => {
      const side = double ? (index === 0 ? -1 : 1) : 0;
      const x = side * leafWidth * 0.5;
      const singleHingeSide = door.hinge === "right" || door.direction === "right" ? 1 : -1;
      const hingeX = double ? side * width * 0.5 : singleHingeSide * width * 0.5;
      const handleX = double ? x - side * leafWidth * 0.39 : -singleHingeSide * width * 0.35;
      return <Fragment key={index}>
        <mesh position={[x, 1.04, 0.028]} castShadow receiveShadow><boxGeometry args={[leafWidth - 0.012, 2.02, 0.035]} /><meshStandardMaterial color={leafColor} roughness={0.74} /></mesh>
        {double && <mesh position={[x - side * 0.015, 1.04, 0.05]}><boxGeometry args={[0.012, 1.98, 0.012]} /><meshStandardMaterial color="#d4bd94" metalness={0.18} roughness={0.4} /></mesh>}
        <mesh position={[handleX, 1.02, 0.055]}><sphereGeometry args={[0.022, 6, 6]} /><meshStandardMaterial color="#d9bd7c" metalness={0.42} roughness={0.35} /></mesh>
        {emergency && <mesh position={[x, 0.98, 0.073]} castShadow><boxGeometry args={[Math.max(leafWidth - 0.18, 0.32), 0.055, 0.055]} /><meshStandardMaterial color="#d5dde0" metalness={0.72} roughness={0.3} /></mesh>}
        <mesh position={[hingeX + (double ? -side : singleHingeSide) * 0.025, 0.43, 0.052]}><boxGeometry args={[0.045, 0.085, 0.045]} /><meshStandardMaterial color="#ddc89b" metalness={0.28} roughness={0.45} /></mesh>
        <mesh position={[hingeX + (double ? -side : singleHingeSide) * 0.025, 1.63, 0.052]}><boxGeometry args={[0.045, 0.085, 0.045]} /><meshStandardMaterial color="#ddc89b" metalness={0.28} roughness={0.45} /></mesh>
      </Fragment>;
    })}
    {emergency && <Html position={[0, 2.34, 0.06]} center distanceFactor={12} style={{ pointerEvents: "none", whiteSpace: "nowrap" }}><span className="rounded-sm border border-white/80 bg-red-700 px-1.5 py-0.5 text-[8px] font-black tracking-[0.12em] text-white shadow">EXIT</span></Html>}
  </group>;
}
const MemoDoorModel = memo(DoorModel);

function IndoorExitCue({ door, viewport, routeRelevant, onActivate }: {
  door: FloorPlan["doors"][number]; viewport: FloorViewport; routeRelevant: boolean; onActivate?: (doorId: string) => void;
}) {
  const position = pointToWorld({ x: door.x, y: door.y }, viewport, 2.3);
  const label = door.isEmergencyExit ? "Emergency Exit" : "Exit";
  // Exit affordances are UI, so keep them at a stable screen size instead of
  // shrinking them with the scene as the camera pulls back.
  return <Html position={position} center zIndexRange={routeRelevant ? [75, 0] : [35, 0]}>
    <button type="button" aria-label={`${label}${door.label ? `: ${door.label}` : ""}`} title={label}
      onClick={(event) => { event.stopPropagation(); onActivate?.(door.id); }}
      className={`inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-full border px-2 text-[10px] font-extrabold shadow-md whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${routeRelevant ? "border-blue-300 bg-blue-700 text-white" : "border-slate-300/80 bg-white/92 text-slate-700"}`}>
      <DoorOpen aria-hidden="true" className="h-3 w-3" />{label}
    </button>
  </Html>;
}

function FloorBase({ region, floor, viewport, index, holes = [] }: { region: { x: number; y: number; width: number; height: number }; floor: FloorPlan; viewport: FloorViewport; index: number; holes?: readonly Pt[][] }) {
  const geometry = useMemo(() => {
    const shape = rectShape(region.x, region.y, region.width, region.height, viewport);
    for (const polygon of holes) {
      if (polygon.length < 3 || !polygon.every((point) => point.x >= region.x - 0.01 && point.x <= region.x + region.width + 0.01 && point.y >= region.y - 0.01 && point.y <= region.y + region.height + 0.01)) continue;
      const path = new THREE.Path();
      polygon.forEach((point, i) => {
        const x = (point.x + viewport.offsetX - viewport.width / 2) * FLOOR_SCALE;
        const y = -(point.y + viewport.offsetY - viewport.height / 2) * FLOOR_SCALE;
        if (i === 0) path.moveTo(x, y); else path.lineTo(x, y);
      });
      path.closePath();
      shape.holes.push(path);
    }
    return new THREE.ShapeGeometry(shape);
  }, [region, viewport, holes]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02 + index * 0.0002, 0]} receiveShadow>
    <meshStandardMaterial color={floor.appearance?.color || floor.backgroundColor || "#f1eee8"} roughness={0.96} side={THREE.DoubleSide} />
  </mesh>;
}
const MemoFloorBase = memo(FloorBase);

function FloorPath({ path, viewport }: { path: FloorPlan["paths"][number]; viewport: FloorViewport }) {
  const geometry = useMemo(() => routeRibbon(path.points ?? [], viewport, Math.max(0.12, (path.width || 10) * FLOOR_SCALE)), [path.points, path.width, viewport]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  if (!path.points || path.points.length < 2) return null;
  const color = path.type === "accessible" ? "#adc7da" : path.type === "emergency" ? "#dfb1a8" : path.color || "#ddd8cf";
  return <mesh geometry={geometry} position={[0, 0.018, 0]}>
    <meshStandardMaterial color={color} roughness={0.9} side={THREE.DoubleSide} />
  </mesh>;
}
const MemoFloorPath = memo(FloorPath);

function FloorScene(props: IndoorFloor3DRendererProps & { shouldSuppressClick: () => boolean }) {
  const { floor, viewport } = props;
  const controls = useRef<any>(null);
  const wallRegistry = useRef(new Map<string, WallOcclusionEntry>());
  const humanMarkerRef = useRef<THREE.Group>(null);
  const routeSamplePointRef = useRef<Pt>({ x: 0, y: 0 });
  const followTargetScratch = useRef(new THREE.Vector3());
  const followOffsetScratch = useRef(new THREE.Vector3());
  const recenteringRef = useRef(false);
  const recenterFrameRef = useRef(0);
  const selectionTweenRef = useRef<{ startPosition: THREE.Vector3; endPosition: THREE.Vector3; startTarget: THREE.Vector3; endTarget: THREE.Vector3; startedAt: number; duration: number } | null>(null);
  const selectionFocusLockRef = useRef(false);
  const lastRoomFocusKeyRef = useRef("");
  const dampingBeforeRecenterRef = useRef<boolean | null>(null);
  const followCameraStateRef = useRef({ freeLook: Boolean(props.freeLook) });
  const { camera, invalidate, size } = useThree();
  const cancelRecenterTween = useCallback(() => {
    if (recenterFrameRef.current) cancelAnimationFrame(recenterFrameRef.current);
    recenterFrameRef.current = 0;
    selectionTweenRef.current = null;
    selectionFocusLockRef.current = false;
    recenteringRef.current = false;
    if (controls.current && dampingBeforeRecenterRef.current !== null) {
      controls.current.enableDamping = dampingBeforeRecenterRef.current;
      dampingBeforeRecenterRef.current = null;
    }
    invalidate();
  }, [invalidate]);
  useEffect(() => {
    const instance = controls.current;
    if (!instance) return;
    configureStudent3dInputMappings(instance);
    const cancelOnInput = () => cancelRecenterTween();
    const resetOnLifecycle = () => cancelRecenterTween();
    instance.addEventListener("start", cancelOnInput);
    window.addEventListener("blur", resetOnLifecycle);
    document.addEventListener("visibilitychange", resetOnLifecycle);
    (instance.domElement as HTMLElement).addEventListener("pointercancel", resetOnLifecycle);
    return () => {
      instance.removeEventListener("start", cancelOnInput);
      window.removeEventListener("blur", resetOnLifecycle);
      document.removeEventListener("visibilitychange", resetOnLifecycle);
      (instance.domElement as HTMLElement).removeEventListener("pointercancel", resetOnLifecycle);
    };
  }, [cancelRecenterTween]);
  const center = useMemo(() => pointToWorld({ x: viewport.width / 2 - viewport.offsetX, y: viewport.height / 2 - viewport.offsetY }, viewport), [viewport]);
  const route = props.routePoints ?? EMPTY_FLOOR_ROUTE;
  const sampleRoute = useMemo(() => createRoutePointSampler(route), [route]);
  const frameCenter = useMemo(() => {
    if (props.followMode || route.length < 2) return center;
    const bounds = route.reduce((result, point) => ({
      minX: Math.min(result.minX, point.x),
      minY: Math.min(result.minY, point.y),
      maxX: Math.max(result.maxX, point.x),
      maxY: Math.max(result.maxY, point.y),
    }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
    return pointToWorld({ x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }, viewport);
  }, [center, props.followMode, route, viewport]);
  const routeArrows = useMemo(() => routeArrowPlacements(route, { worldScale: FLOOR_SCALE }), [route]);
  const ramps = useMemo(() => [...(floor.ramps ?? []), ...(floor.entranceRamps ?? [])] as RampVisualItem[], [floor.entranceRamps, floor.ramps]);
  const routeElevations = useMemo(() => route.map((point) => rampHeightAt(point, ramps)), [ramps, route]);
  const routeGeometry = useMemo(() => routeRibbon(route, viewport, 0.17, routeElevations), [route, routeElevations, viewport]);
  useEffect(() => () => routeGeometry.dispose(), [routeGeometry]);
  const emergencyAccessOpenings = useMemo(
    () => exteriorEmergencyStairOpenings(floor.walls ?? [], floor.doors ?? [], floor.stairs ?? [], floor.canvasW ?? 600, floor.canvasH ?? 450),
    [floor.canvasH, floor.canvasW, floor.doors, floor.stairs, floor.walls],
  );
  const rendererDoorOpenings = useMemo(() => [...(floor.doors ?? []), ...emergencyAccessOpenings], [emergencyAccessOpenings, floor.doors]);
  const wallSegments = useMemo(() => normalizeIndoorWallSegments(floor.walls ?? [], rendererDoorOpenings, floor.windows ?? []), [floor.walls, floor.windows, rendererDoorOpenings]);
  const regions = useMemo(() => getFloorShapeRegions(floor, { canvasW: floor.canvasW, canvasH: floor.canvasH }), [floor]);
  const rooms = useMemo(() => (floor.rooms ?? []).filter((room) => room.visible !== false)
    .map((room) => {
      const points = roomOutlinePoints(room);
      return { room, points, openBelow: isIndoorOpenBelowRoom(room, points, floor.stairs ?? []) };
    })
    .sort((a, b) => polygonArea(b.points) - polygonArea(a.points)), [floor.rooms, floor.stairs]);
  const selectionRoom = rooms.find(({ room }) => room.id === props.focusRoomId) ?? null;
  const roomClickHandlerRef = useRef(props.onRoomClick);
  const suppressClickRef = useRef(props.shouldSuppressClick);
  roomClickHandlerRef.current = props.onRoomClick;
  suppressClickRef.current = props.shouldSuppressClick;
  const roomClickHandlers = useMemo(() => new Map(rooms.map(({ room }) => [room.id, () => {
    if (!suppressClickRef.current()) roomClickHandlerRef.current?.(room.id);
  }])), [rooms]);
  const roomLabelRegistry = useRef(new Map<string, { element: HTMLSpanElement; position: THREE.Vector3; priority: number }>());
  const routeRelevantRoomIds = useMemo(() => new Set(rooms.filter(({ openBelow, points: polygon }) => !openBelow
    && route.some((point) => pointInPolygon(point, polygon))).map(({ room }) => room.id)), [rooms, route]);
  const activeExitDoor = floor.doors?.find((door) => door.id === props.activeExitDoorId);
  const activeTransitionPoint = activeExitDoor ? { x: activeExitDoor.x, y: activeExitDoor.y } : props.activeTransition?.point;
  const exitCueDoors = useMemo(() => (floor.doors ?? []).filter((door) => shouldShowIndoorExitCue(door, {
    eligible: props.interactiveExitDoorIds ?? EMPTY_STRING_SET,
    activeDoorId: props.activeExitDoorId,
    routeRelevant: props.routeRelevantExitDoorIds ?? EMPTY_STRING_SET,
  })),
  [floor.doors, props.activeExitDoorId, props.interactiveExitDoorIds, props.routeRelevantExitDoorIds]);
  const openBelowPolygons = useMemo(() => rooms.filter((entry) => entry.openBelow).map((entry) => entry.points), [rooms]);
  const roomLevels = useMemo(() => rooms.map(({ room, points }) => {
    const centerPoint = points.reduce((sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }), { x: 0, y: 0 });
    return rooms.filter((candidate) => candidate.room.id !== room.id && polygonArea(candidate.points) > polygonArea(points)
      && pointInPolygon(centerPoint, candidate.points)).length;
  }), [rooms]);
  const nestedRoomPolygons = useMemo(() => rooms.map(({ room, points }) => rooms
    .filter((candidate) => candidate.room.id !== room.id && polygonArea(candidate.points) < polygonArea(points)
      && candidate.points.every((point) => pointInPolygon(point, points)))
    .map((candidate) => candidate.points)), [rooms]);
  const visualWalkProgress = props.walkProgressRef?.current ?? props.walkProgress;
  const humanPoint = props.humanVisible && visualWalkProgress !== undefined
    ? sampleRoute(visualWalkProgress, routeSamplePointRef.current)
    : props.walkProgress === undefined ? null : sampleRoute(props.walkProgress, routeSamplePointRef.current);
  const humanRampHeight = humanPoint ? rampHeightAt(humanPoint, ramps) : 0;
  const cutawayFocus = humanPoint ?? route.at(-1) ?? null;
  const routeBounds = useMemo(() => route.length > 1 ? route.reduce((bounds, point) => ({
    minX: Math.min(bounds.minX, point.x),
    minY: Math.min(bounds.minY, point.y),
    maxX: Math.max(bounds.maxX, point.x),
    maxY: Math.max(bounds.maxY, point.y),
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }) : null, [route]);
  const routeFitDepth = routeBounds && !props.followMode
    ? Math.max(
      (routeBounds.maxX - routeBounds.minX) * FLOOR_SCALE / Math.max(0.35, size.width / Math.max(1, size.height)),
      (routeBounds.maxY - routeBounds.minY) * FLOOR_SCALE * 0.78,
    )
    : 0;
  const floorBounds = regions.reduce((bounds, region) => ({
    minX: Math.min(bounds.minX, region.x),
    minY: Math.min(bounds.minY, region.y),
    maxX: Math.max(bounds.maxX, region.x + region.width),
    maxY: Math.max(bounds.maxY, region.y + region.height),
  }), { minX: 0, minY: 0, maxX: floor.canvasW ?? viewport.width, maxY: floor.canvasH ?? viewport.height });
  const floorCameraDepth = indoorFloorCameraHalfDepth(
    Math.max(floor.canvasW ?? viewport.width, floorBounds.maxX - floorBounds.minX),
    Math.max(floor.canvasH ?? viewport.height, floorBounds.maxY - floorBounds.minY),
    size.width / Math.max(1, size.height),
    FLOOR_SCALE,
  );
  const halfDepth = Math.max(floorCameraDepth, routeFitDepth);
  const recenterContextRef = useRef({ center, frameCenter, halfDepth, humanPoint: null as Pt | null, viewport, followMode: false, reducedMotion: false });
  recenterContextRef.current = { center, frameCenter, halfDepth, humanPoint, viewport, followMode: Boolean(props.followMode), reducedMotion: Boolean(props.reducedMotion) };
  const followResumeContextRef = useRef({
    humanPoint, viewport, halfDepth, ramps, walkProgress: props.walkProgress,
    walkProgressRef: props.walkProgressRef, humanVisible: props.humanVisible,
    reducedMotion: Boolean(props.reducedMotion), sampleRoute,
  });
  followResumeContextRef.current = {
    humanPoint, viewport, halfDepth, ramps, walkProgress: props.walkProgress,
    walkProgressRef: props.walkProgressRef, humanVisible: props.humanVisible,
    reducedMotion: Boolean(props.reducedMotion), sampleRoute,
  };

  useLayoutEffect(() => {
    // Camera clipping is independent of which selection owns the initial pose.
    // Keep large floors visible even when the renderer mounts directly on a
    // selected room and skips the general floor-fit camera effect below.
    const perspective = camera as THREE.PerspectiveCamera;
    perspective.near = 0.1;
    perspective.far = indoorFloorCameraFarPlane(halfDepth);
    perspective.updateProjectionMatrix();
    invalidate();
  }, [camera, halfDepth, invalidate]);

  useEffect(() => {
    // A cross-floor room search should animate directly from the current
    // camera pose to the selected room. Do not first fit the entire floor.
    if (props.focusRoomId && selectionRoom && !(props.followMode && !props.freeLook)) return;
    const progress = props.walkProgressRef?.current ?? props.walkProgress;
    const followPoint = props.followMode && !props.freeLook && props.humanVisible && progress !== undefined
      ? sampleRoute(progress, routeSamplePointRef.current)
      : null;
    const nextTarget = followPoint
      ? new THREE.Vector3(...pointToWorld(followPoint, viewport, 0.15 + rampHeightAt(followPoint, ramps)))
      : new THREE.Vector3(...frameCenter);
    controls.current?.target.copy(nextTarget);
    if (followPoint) {
      const distance = Math.max(8, Math.min(14, halfDepth * 0.62));
      camera.position.copy(nextTarget).add(new THREE.Vector3(distance * 0.46, distance * 0.7, distance * 0.54));
    } else camera.position.set(frameCenter[0] + halfDepth * 0.78, halfDepth * 1.18, frameCenter[2] + halfDepth * 0.86);
    camera.lookAt(nextTarget);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, floor.id, frameCenter, halfDepth, invalidate, props.followMode, props.freeLook, props.humanVisible, props.walkProgress, props.walkProgressRef, ramps, sampleRoute, viewport]);

  useEffect(() => {
    // Follow takes camera ownership back when the canonical session is
    // attached again. In Explore, cancel stale camera work but retain the
    // renderer-independent route cursor; Resume then frames that live point.
    const wasExploring = followCameraStateRef.current.freeLook;
    followCameraStateRef.current.freeLook = Boolean(props.freeLook);
    if (props.freeLook) {
      if (props.followMode) cancelRecenterTween();
      return;
    }
    if (!props.followMode) return;
    cancelRecenterTween();
    selectionFocusLockRef.current = false;
    lastRoomFocusKeyRef.current = "";
    if (!wasExploring || !controls.current) return;

    const context = followResumeContextRef.current;
    const liveProgress = context.walkProgressRef?.current ?? context.walkProgress;
    const point = context.humanVisible && liveProgress !== undefined
      ? context.sampleRoute(liveProgress, routeSamplePointRef.current)
      : context.humanPoint;
    if (!point) return;

    const target = new THREE.Vector3(...pointToWorld(point, context.viewport, 0.15 + rampHeightAt(point, context.ramps)));
    const distance = Math.max(8, Math.min(14, context.halfDepth * 0.62));
    const endPosition = target.clone().add(new THREE.Vector3(distance * 0.46, distance * 0.7, distance * 0.54));
    if (context.reducedMotion) {
      controls.current.target.copy(target);
      camera.position.copy(endPosition);
      camera.lookAt(target);
      controls.current.update();
      invalidate();
      return;
    }

    dampingBeforeRecenterRef.current = Boolean(controls.current.enableDamping);
    controls.current.enableDamping = false;
    selectionTweenRef.current = {
      startPosition: camera.position.clone(),
      endPosition,
      startTarget: controls.current.target.clone(),
      endTarget: target,
      startedAt: performance.now(),
      duration: 340,
    };
    invalidate();
  }, [cancelRecenterTween, props.followMode, props.freeLook]);

  useFrame((_, delta) => {
    const progress = props.walkProgressRef?.current ?? props.walkProgress;
    const livePoint = props.humanVisible && progress !== undefined
      ? sampleRoute(progress, routeSamplePointRef.current)
      : humanPoint;
    if (humanMarkerRef.current) {
      if (props.humanVisible && livePoint) {
        humanMarkerRef.current.visible = true;
        humanMarkerRef.current.position.set(...pointToWorld(livePoint, viewport, 0.18 + rampHeightAt(livePoint, ramps)));
      } else humanMarkerRef.current.visible = false;
    }
    if (selectionTweenRef.current) {
      const active = selectionTweenRef.current;
      const t = Math.min(1, Math.max(0, (performance.now() - active.startedAt) / active.duration));
      const eased = 1 - (1 - t) ** 3;
      camera.position.copy(active.startPosition).lerp(active.endPosition, eased);
      const target = controls.current?.target as THREE.Vector3 | undefined;
      if (target) target.copy(active.startTarget).lerp(active.endTarget, eased);
      camera.lookAt(target ?? active.endTarget);
      controls.current?.update();
      if (t >= 1) {
        selectionTweenRef.current = null;
        if (controls.current && dampingBeforeRecenterRef.current !== null) {
          controls.current.enableDamping = dampingBeforeRecenterRef.current;
          dampingBeforeRecenterRef.current = null;
        }
      }
      else invalidate();
      return;
    }
    if (selectionFocusLockRef.current && !(props.followMode && !props.freeLook)) return;
    if (!props.followMode || props.freeLook || recenteringRef.current || !livePoint) return;
    const safeDelta = Math.min(delta, 0.05);
    const controlsTarget = controls.current?.target as THREE.Vector3 | undefined;
    if (!controlsTarget) return;
    // Preserve the live camera offset (including user zoom) while translating
    // the target toward the human. This keeps OrbitControls zoom and Follow
    // tracking in one coherent camera update instead of resetting distance on
    // every frame.
    followTargetScratch.current.set(...pointToWorld(livePoint, viewport, 0.15 + rampHeightAt(livePoint, ramps)));
    followOffsetScratch.current.copy(camera.position).sub(controlsTarget);
    controlsTarget.lerp(followTargetScratch.current, props.reducedMotion ? 1 : 1 - Math.exp(-safeDelta * 4.5));
    camera.position.copy(controlsTarget).add(followOffsetScratch.current);
    camera.lookAt(controlsTarget);
  });

  const lastRecenterNonce = useRef(props.recenterNonce ?? 0);
  useEffect(() => {
    const nonce = props.recenterNonce ?? 0;
    if (nonce <= lastRecenterNonce.current || !controls.current) return;
    lastRecenterNonce.current = nonce;
    cancelRecenterTween();
    const context = recenterContextRef.current;
    selectionFocusLockRef.current = false;
    recenteringRef.current = true;
    // `humanPoint` is intentionally a low-frequency React prop while 3D
    // Follow reads the canonical progress ref every frame. Recenter must read
    // that same live progress at click time or it can send the camera back to
    // an older route position after the player has moved.
    const liveProgress = props.walkProgressRef?.current ?? props.walkProgress;
    const liveFollowPoint = context.followMode && liveProgress !== undefined
      ? sampleRoute(liveProgress, routeSamplePointRef.current)
      : context.humanPoint;
    const focus = context.followMode && liveFollowPoint
      ? pointToWorld(liveFollowPoint, context.viewport, 0.15 + rampHeightAt(liveFollowPoint, ramps))
      : context.frameCenter;
    const destination = new THREE.Vector3(...focus);
    const startPosition = camera.position.clone();
    const startTarget = controls.current.target.clone();
    const endPosition = destination.clone().add(new THREE.Vector3(context.halfDepth * 0.65, context.halfDepth * 0.95, context.halfDepth * 0.72));
    if (context.reducedMotion) {
      camera.position.copy(endPosition);
      controls.current.target.copy(destination);
      camera.lookAt(destination);
      cancelRecenterTween();
      return;
    }
    dampingBeforeRecenterRef.current = Boolean(controls.current.enableDamping);
    controls.current.enableDamping = false;
    const startTime = performance.now();
    const tick = (time: number) => {
      const t = Math.min(1, (time - startTime) / 320);
      const eased = 1 - (1 - t) ** 3;
      camera.position.copy(startPosition).lerp(endPosition, eased);
      controls.current?.target.copy(startTarget).lerp(destination, eased);
      camera.lookAt(controls.current?.target ?? destination);
      invalidate();
      if (t < 1) recenterFrameRef.current = requestAnimationFrame(tick);
      else cancelRecenterTween();
    };
    recenterFrameRef.current = requestAnimationFrame(tick);
    return cancelRecenterTween;
  }, [camera, cancelRecenterTween, invalidate, props.recenterNonce, props.walkProgress, props.walkProgressRef, ramps, sampleRoute]);

  useEffect(() => {
    if (props.followMode && !props.freeLook) {
      selectionTweenRef.current = null;
      selectionFocusLockRef.current = false;
      lastRoomFocusKeyRef.current = "";
      return;
    }
    if (!props.focusRoomId || !selectionRoom) {
      if (!props.focusRoomId) {
        lastRoomFocusKeyRef.current = "";
        selectionFocusLockRef.current = false;
      }
      return;
    }
    const key = `${floor.id}:${props.focusRoomId}:${props.focusNonce ?? 0}`;
    if (lastRoomFocusKeyRef.current === key) return;
    const roomPoints = selectionRoom.points;
    if (roomPoints.length < 3 || !controls.current) return;
    const bounds = roomPoints.reduce((value, point) => ({
      minX: Math.min(value.minX, point.x), minY: Math.min(value.minY, point.y),
      maxX: Math.max(value.maxX, point.x), maxY: Math.max(value.maxY, point.y),
    }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
    const centerPoint = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
    const target = new THREE.Vector3(...pointToWorld(centerPoint, viewport, FLOOR_SURFACE_Y + 0.16));
    const canvas = controls.current.domElement as HTMLElement;
    const canvasRect = canvas.getBoundingClientRect();
    const surface = canvas.closest<HTMLElement>("[data-testid='student-map-surface']");
    const overlayRects = surface ? Array.from(surface.querySelectorAll<HTMLElement>(
      ".map-layer-building-sheet, [data-testid='student-selected-place-card'], [data-testid='mobile-building-sheet'], [data-testid='event-map-panel'], [data-testid='route-planner-dialog'], [data-testid='collapsed-route-card'], [data-testid='mobile-active-route-dock'], [data-testid='student-floor-picker'], [data-map-search-header='true']",
    )).filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    }).map((element) => element.getBoundingClientRect()) : [];
    const safeCenter = student3dSafeFocusCenter(canvasRect, overlayRects);
    const contextPadding = size.width < 768 ? 2.1 : 1.1;
    const width = Math.max(0.6, (bounds.maxX - bounds.minX) * FLOOR_SCALE + contextPadding);
    const depth = Math.max(0.6, (bounds.maxY - bounds.minY) * FLOOR_SCALE + contextPadding);
    const perspective = camera as THREE.PerspectiveCamera;
    const distance = student3dFocusDistance(
      width,
      depth,
      3.1,
      perspective.fov ?? 42,
      size.width / Math.max(1, size.height),
      // Leave enough breathing room for the room outline and its door, and
      // account for wall height so selection does not dive inside the room.
      { padding: size.width < 768 ? 1.45 : 1.4, min: 12.5, max: size.width < 768 ? 40 : 21 },
    );
    const offsetDirection = new THREE.Vector3(0.22, 0.95, 0.2).normalize();
    const right = new THREE.Vector3().crossVectors(offsetDirection.clone().negate(), camera.up).normalize();
    const verticalSpan = 2 * distance * Math.tan(THREE.MathUtils.degToRad(perspective.fov ?? 42) / 2);
    const worldPerPixel = verticalSpan / Math.max(1, canvasRect.height);
    target.addScaledVector(right, -(safeCenter.x - (canvasRect.left + canvasRect.width / 2)) * worldPerPixel);
    target.addScaledVector(camera.up, (safeCenter.y - (canvasRect.top + canvasRect.height / 2)) * worldPerPixel);
    const endPosition = target.clone().add(offsetDirection.multiplyScalar(distance));
    const currentTarget = controls.current.target as THREE.Vector3;
    cancelRecenterTween();
    lastRoomFocusKeyRef.current = key;
    selectionFocusLockRef.current = true;
    if (props.reducedMotion) {
      currentTarget.copy(target);
      camera.position.copy(endPosition);
      camera.lookAt(target);
      controls.current.update();
      invalidate();
      return;
    }
    dampingBeforeRecenterRef.current = Boolean(controls.current.enableDamping);
    controls.current.enableDamping = false;
    controls.current.update();
    const startPosition = camera.position.clone();
    const startTarget = currentTarget.clone();
    selectionTweenRef.current = {
      startPosition,
      endPosition,
      startTarget,
      endTarget: target,
      startedAt: performance.now(),
      duration: 360,
    };
    invalidate();
  }, [camera, cancelRecenterTween, floor.id, invalidate, props.focusNonce, props.focusRoomId, props.followMode, props.freeLook, props.reducedMotion, selectionRoom, size.height, size.width, viewport]);

  const baseRegions = regions.length ? regions : [{ x: 0, y: 0, width: floor.canvasW ?? 600, height: floor.canvasH ?? 450 }];
  const visibleRoute = route.length > 1;
  return <>
    <color attach="background" args={["#dfe6e5"]} />
    <ambientLight intensity={1.08} />
    <directionalLight position={[5, 12, 7]} intensity={0.98} />
    <group>
      {baseRegions.map((region, index) => <MemoFloorBase key={`base-${index}`} region={region} floor={floor} viewport={viewport} index={index} holes={openBelowPolygons} />)}
      {floor.paths?.map((path) => <MemoFloorPath key={`path-${path.id}`} path={path} viewport={viewport} />)}
      {rooms.map(({ room, openBelow }, index) => openBelow ? null : <MemoRoomFloor key={`room-${room.id}`} room={room} viewport={viewport} level={roomLevels[index] ?? 0} holes={nestedRoomPolygons[index] ?? []}
        selected={room.id === props.selectedRoomId} destination={room.id === props.destinationRoomId}
        labelPriority={indoorRoomLabelPriority({
          selected: room.id === props.selectedRoomId,
          destination: room.id === props.destinationRoomId,
          routeRelevant: routeRelevantRoomIds.has(room.id),
        })}
        labelRegistry={roomLabelRegistry}
        onClick={props.onRoomClick ? roomClickHandlers.get(room.id) : undefined} />)}
      <IndoorRoomLabelDeclutter registry={roomLabelRegistry} />
      {openBelowPolygons.map((polygon, index) => <VoidGuardrail key={`void-guard-${index}`} polygon={polygon} viewport={viewport} />)}
      {floor.exteriorZones?.filter((zone) => zone.visible !== false).map((zone) => {
        const rect = exteriorZoneGeometry(zone, floor.canvasW ?? 600, floor.canvasH ?? 450);
        const x = rect.x + rect.width / 2;
        const y = rect.y + rect.height / 2;
        const sizeX = rect.width;
        const sizeZ = rect.height;
        const pos = pointToWorld({ x, y }, viewport, FLOOR_SURFACE_Y + 0.03);
        return <group key={`zone-${zone.id}`} position={pos} rotation={[0, -(zone.rotation ?? 0) * Math.PI / 180, 0]}>
          <mesh><boxGeometry args={[sizeX * FLOOR_SCALE, 0.08, sizeZ * FLOOR_SCALE]} /><meshStandardMaterial color="#c9d2d1" /></mesh>
          {zone.type !== "entrance_landing" && [-1, 1].map((side) => <mesh key={side} position={[side * sizeX * FLOOR_SCALE * 0.48, 0.48, 0]}><boxGeometry args={[0.035, 0.08, sizeZ * FLOOR_SCALE]} /><meshStandardMaterial color="#8e999a" metalness={0.35} /></mesh>)}
        </group>;
      })}
      <IndoorWallOcclusionController registry={wallRegistry} viewport={viewport} route={route} progressRef={props.walkProgressRef} focusPoint={cutawayFocus} followMode={props.followMode && props.humanVisible} />
      {wallSegments.map((segment, index) => {
        const id = `wall-${segment.sourceIds.join("-")}-${index}`;
        return <MemoWall key={id} id={id} segment={segment} viewport={viewport} registry={wallRegistry} />;
      })}
      {floor.windows?.filter((window) => window.visible !== false).map((window) => {
        const wall = floor.walls.find((candidate) => candidate.id === window.wallId);
        const angle = wall ? Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1) : 0;
        const position = pointToWorld({ x: window.x, y: window.y }, viewport, FLOOR_SURFACE_Y + 1.46);
        const width = Math.max(0.25, window.width * FLOOR_SCALE);
        const glassHeight = 1.12;
        return <group key={`window-${window.id}`} position={position} rotation={[0, -angle, 0]}>
          <mesh><boxGeometry args={[width - 0.06, glassHeight, 0.04]} /><meshPhysicalMaterial color={window.color || "#9bcbd7"} roughness={0.2} metalness={0.05} transparent opacity={0.48} /></mesh>
          {[-1, 1].map((side) => <mesh key={side} position={[side * (width / 2 - 0.025), 0, 0.012]}><boxGeometry args={[0.045, glassHeight + 0.08, 0.06]} /><meshStandardMaterial color="#9ba8ad" metalness={0.25} roughness={0.48} /></mesh>)}
          {[-1, 1].map((side) => <mesh key={side} position={[0, side * (glassHeight / 2 + 0.025), 0.012]}><boxGeometry args={[width, 0.05, 0.06]} /><meshStandardMaterial color="#9ba8ad" metalness={0.25} roughness={0.48} /></mesh>)}
        </group>;
      })}
      {floor.doors?.map((door) => <MemoDoorModel key={`door-${door.id}`} door={door} floor={floor} viewport={viewport} />)}
      {rendererDoorOpenings.filter((door) => door.id.startsWith("visual-emergency-access-") || (door.isEmergencyExit && door.openingType === "open_passage")).map((door) => <EmergencyDoorwayFrame key={`emergency-frame-${door.id}`} door={door} floor={floor} viewport={viewport} />)}
      {exitCueDoors.map((door) => <IndoorExitCue key={`exit-cue-${door.id}`} door={door} viewport={viewport} routeRelevant={Boolean(props.routeRelevantExitDoorIds?.has(door.id))} onActivate={props.onExitDoorClick} />)}
      {floor.stairs?.map((stair) => <MemoStairModel key={`stairs-${stair.id}`} stair={stair} viewport={viewport} floor={floor} />)}
      {floor.elevators?.map((elevator) => <MemoElevatorModel key={`elevator-${elevator.id}`} elevator={elevator} viewport={viewport} />)}
      {floor.ramps?.map((ramp) => <MemoRampModel key={`ramp-${ramp.id}`} item={ramp} viewport={viewport} />)}
      {floor.entranceRamps?.map((ramp) => <MemoRampModel key={`entrance-ramp-${ramp.id}`} item={ramp} viewport={viewport} />)}
      {floor.entranceSteps?.filter((step) => step.visible !== false).map((step) => <MemoStairModel key={`entrance-step-${step.id}`} stair={step} viewport={viewport} floor={floor} entranceModel />)}
      {floor.furniture?.filter(shouldRenderIndoorLandmarkFurniture).map((item) => <MemoFurniture key={`furniture-${item.id}`} item={item} viewport={viewport} />)}
      {props.eventFurniture?.filter(shouldRenderIndoorLandmarkFurniture).map((item) => <MemoFurniture key={`event-furniture-${item.id}`} item={item} viewport={viewport} />)}
      {props.eventLabels?.map((label) => <Html key={`event-label-${label.id}`} position={pointToWorld({ x: label.x, y: label.y }, viewport, 0.06)} center distanceFactor={10} style={{ pointerEvents: "none", whiteSpace: "nowrap" }}>
        <span className="rounded bg-orange-600 px-1.5 py-0.5 text-[9px] font-bold text-white shadow">{label.text}</span>
      </Html>)}
      {props.eventMarker && <Html position={pointToWorld(props.eventMarker.point, viewport, 0.3)} center distanceFactor={9} zIndexRange={[90, 0]}>
        <div className="rounded-xl border border-orange-200 bg-white/95 px-2 py-1.5 text-[10px] font-extrabold text-orange-800 shadow-lg">◉ {props.eventMarker.label}</div>
      </Html>}
      {visibleRoute && <mesh geometry={routeGeometry} renderOrder={10}>
        <meshStandardMaterial color="#1769e0" emissive="#0b4eb3" emissiveIntensity={0.17} side={THREE.DoubleSide} />
      </mesh>}
      {visibleRoute && <IndoorRouteArrows arrows={routeArrows} points={route} viewport={viewport} ramps={ramps} reducedMotion={props.reducedMotion} />}
      {props.showStartMarker && route[0] && <group position={pointToWorld(route[0], viewport, 0.1 + rampHeightAt(route[0], ramps))}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.12, 0.16, 24]} /><meshBasicMaterial color="#1769e0" side={THREE.DoubleSide} /></mesh>
        <Html position={[0, 0.01, 0]} center distanceFactor={9}><span className="grid h-7 w-7 place-items-center rounded-full border-2 border-white bg-blue-700 text-xs font-black text-white shadow-lg">A</span></Html>
      </group>}
      {props.showDestinationMarker && route.at(-1) && <group position={pointToWorld(route.at(-1)!, viewport, 0.1 + rampHeightAt(route.at(-1)!, ramps))}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.12, 0.16, 24]} /><meshBasicMaterial color="#e44646" transparent opacity={0.62} side={THREE.DoubleSide} /></mesh>
        <Html position={[0, 0.01, 0]} center distanceFactor={9} zIndexRange={[85, 0]}><span className="student-destination-pin block -translate-y-full drop-shadow-md"><MapPin className="h-8 w-8 fill-rose-600 stroke-white stroke-[2.25]" /></span></Html>
      </group>}
      {props.humanVisible && <group ref={humanMarkerRef} position={humanPoint ? pointToWorld(humanPoint, viewport, 0.18 + humanRampHeight) : [0, FLOOR_SURFACE_Y, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.28, 24]} /><meshBasicMaterial color="#ffffff" /></mesh>
        <mesh position={[0, 0.1, 0]}><cylinderGeometry args={[0.14, 0.2, 0.18, 16]} /><meshStandardMaterial color="#0b58c4" roughness={0.4} /></mesh>
        <mesh position={[0, 0.27, 0]}><sphereGeometry args={[0.09, 12, 10]} /><meshStandardMaterial color="#e9f2ff" /></mesh>
      </group>}
      {props.activeTransition && activeTransitionPoint && <Html position={pointToWorld(activeTransitionPoint, viewport, 0.42)} center zIndexRange={[100, 0]}>
        <button type="button" onClick={(event) => { event.stopPropagation(); if (!props.shouldSuppressClick()) props.activeTransition?.onActivate?.(); }} style={{ width: "max-content", maxWidth: "min(18rem, calc(100vw - 2rem))" }} className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border px-3 py-2 text-center text-[12px] font-extrabold shadow-lg whitespace-normal focus-visible:outline-none focus-visible:ring-2 ${activeExitDoor?.isEmergencyExit ? "border-red-300 bg-red-700 text-white ring-red-300 hover:bg-red-800" : "border-blue-200 bg-white/95 text-blue-800 hover:bg-blue-50 focus-visible:ring-blue-500"}`}>{activeExitDoor?.isEmergencyExit ? "Emergency Exit" : props.activeTransition.label}</button>
      </Html>}
      {floor.labels?.filter((label) => label.visible !== false).map((label) => <Html key={`label-${label.id}`} position={pointToWorld({ x: label.x, y: label.y }, viewport, 0.025)} center distanceFactor={12} style={{ pointerEvents: "none", whiteSpace: "nowrap" }}>
        <span className="text-[9px] font-semibold text-slate-500">{label.text}</span>
      </Html>)}
    </group>
    <OrbitControls ref={controls} makeDefault enableDamping={!props.reducedMotion} dampingFactor={0.12} minPolarAngle={0.25} maxPolarAngle={Math.PI / 2.05}
      enableRotate enablePan={!props.followMode || props.freeLook} enableZoom maxDistance={Math.max(18, halfDepth * 2.7)} minDistance={4} />
  </>;
}

function IndoorFloor3DRenderer(props: IndoorFloor3DRendererProps) {
  const [visible, setVisible] = useState(() => typeof document === "undefined" || !document.hidden);
  const invalidateRef = useRef<(() => void) | null>(null);
  const interactionSurfaceRef = useRef<HTMLDivElement>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const dragStartedRef = useRef(false);
  useEffect(() => {
    const resetGesture = () => { pointersRef.current.clear(); dragStartedRef.current = false; };
    const updateVisibility = () => {
      const isVisible = !document.hidden;
      setVisible(isVisible);
      if (isVisible) invalidateRef.current?.();
      else resetGesture();
    };
    document.addEventListener("visibilitychange", updateVisibility);
    window.addEventListener("blur", resetGesture);
    window.addEventListener("pageshow", updateVisibility);
    return () => {
      document.removeEventListener("visibilitychange", updateVisibility);
      window.removeEventListener("blur", resetGesture);
      window.removeEventListener("pageshow", updateVisibility);
    };
  }, []);
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const alreadyActive = pointersRef.current.size > 0;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (event.pointerType === "touch" && alreadyActive) dragStartedRef.current = true;
    else if (!alreadyActive) dragStartedRef.current = false;
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStartedRef.current) return;
    const start = pointersRef.current.get(event.pointerId);
    if (!start || !crossedStudent3dDragThreshold(start, { x: event.clientX, y: event.clientY })) return;
    // A drag in attached Follow is an orbit gesture. Panning is disabled on
    // OrbitControls and must not detach the camera or pause playback.
    dragStartedRef.current = true;
  };
  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (event.type === "pointercancel" && pointersRef.current.size === 0) dragStartedRef.current = false;
  };
  return <div ref={interactionSurfaceRef} data-testid="student-indoor-3d-renderer" className="absolute inset-0 touch-none" style={{ touchAction: "none" }} onContextMenu={(event) => event.preventDefault()} onClickCapture={(event: ReactMouseEvent<HTMLDivElement>) => {
    if (!dragStartedRef.current) return;
    event.preventDefault(); event.stopPropagation(); dragStartedRef.current = false;
  }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}>
    <IndoorSceneBoundary onError={props.onFallback}>
      <Canvas eventSource={interactionSurfaceRef as unknown as MutableRefObject<HTMLElement>} camera={{ position: [0, 14, 13], fov: 42, near: 0.1, far: 100 }} dpr={[1, 1.25]} frameloop={!visible ? "never" : (props.followPlaying || (Boolean(props.routePoints?.length && props.routePoints.length > 1) && !props.reducedMotion)) ? "always" : "demand"}
        onCreated={({ invalidate }) => { invalidateRef.current = invalidate; }}
        gl={{ antialias: false, powerPreference: "low-power", alpha: false, stencil: false }}>
        <Suspense fallback={null}><FloorScene {...props} shouldSuppressClick={() => dragStartedRef.current} /></Suspense>
      </Canvas>
    </IndoorSceneBoundary>
    <div className="sr-only" aria-label={`${props.floorLabel} in 3D view`}>
      {props.floor.rooms.filter((room) => room.visible !== false).map((room) => <button key={room.id} type="button" onClick={() => props.onRoomClick?.(room.id)}>{room.name}</button>)}
    </div>
  </div>;
}

export default memo(IndoorFloor3DRenderer);

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { ThreeElements } from "@react-three/fiber";
import { Billboard, Html, OrbitControls } from "@react-three/drei";
import { CalendarDays, DoorOpen, MapPin } from "lucide-react";
import { Component, Fragment, Suspense, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type MutableRefObject, type ReactNode, type RefObject } from "react";
import * as THREE from "three";
import type { ReadonlyOutdoorCampus } from "../../lib/readonlyOutdoorCampus";
import type { CampusDecorAsset, CampusPath } from "../map-builder/types";
import { DECOR_ASSET_MAP } from "../map-builder/constants";
import { decorRenderScale, decorWorldSize } from "../../lib/decorVisual";
import { entranceWorldPosition } from "../../lib/buildingEntrances";
import { campusMapPointToWorld, campusMapSizeToWorld, STUDENT_CAMPUS_3D_SCALE } from "../../lib/studentCampus3dCoordinates";
import { createRoutePointSampler, createRouteWorldSampler, routeArrowPlacements } from "../../lib/studentRoute3dPresentation";
import { student3dFocusDistance, student3dSafeFocusCenter } from "../../lib/student3dCameraFocus";
import { configureStudent3dInputMappings, crossedStudent3dDragThreshold } from "../../lib/student3dInput";
import { campusFireEscapeLevels, resolveCampusEntrancePresentations, campusEntranceFacingYaw, campusGateFacingRotation, groundedModelOffset, groupCampusDecorAssetsByType, resolveSuhayHusayDecorAssetId, campusParkingMarkingSegments, STUDENT_CAMPUS_3D_GROUND_EPSILON } from "../../lib/studentCampus3dPresentation";
import { canEnterOutdoorBuilding, exteriorEmergencyStairVisualDimensions } from "../map-builder/ReadonlyOutdoorVisuals";
import type { EventVenue } from "../../lib/eventMapView";
import type { Pt } from "../../lib/routePlanner";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}

interface StudentCampus3DRendererProps {
  campus: ReadonlyOutdoorCampus;
  routePoints?: Pt[];
  routePreview?: boolean;
  startPoint?: Pt | null;
  destinationPoint?: Pt | null;
  showStartMarker?: boolean;
  showDestinationMarker?: boolean;
  humanPoint?: Pt | null;
  walkProgressRef?: MutableRefObject<number>;
  activeTransition?: { point: Pt; label: string; buildingId?: string | null; entranceId?: string | null; onActivate: () => void } | null;
  focusPoint?: Pt | null;
  focusNonce?: number;
  recenterNonce?: number;
  selectedBuildingId?: string | null;
  selectedPlaceId?: string | null;
  showEvents?: boolean;
  eventVenues?: EventVenue[];
  selectedEventLocationId?: string | null;
  darkMode?: boolean;
  reducedMotion?: boolean;
  followPlaying?: boolean;
  followMode?: boolean;
  freeLook?: boolean;
  exploreTransitionsEnabled?: boolean;
  followSessionKey?: string;
  onSelectBuilding?: (buildingId: string) => void;
  onSelectPlace?: (placeId: string) => void;
  onEnterBuilding?: (buildingId: string) => void;
  onInspectEventVenue?: (venueId: string) => void;
  onIntentionalPan?: () => void;
  onSelectTransition?: () => void;
}
const EMPTY_EVENT_VENUES: readonly EventVenue[] = Object.freeze([]);

class SceneErrorBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

const worldPoint = (point: Pt, elevation = 0) => campusMapPointToWorld(point, elevation);
const worldTuple = (point: Pt, elevation = 0) => {
  const p = worldPoint(point, elevation);
  return [p.x, p.y, p.z] as [number, number, number];
};

function campusContentBounds(campus: ReadonlyOutdoorCampus) {
  const xs: number[] = [];
  const ys: number[] = [];
  const addBounds = (x: number, y: number, width: number, height: number, rotation = 0) => {
    const radians = (rotation * Math.PI) / 180;
    const spanX = Math.abs(width * Math.cos(radians)) + Math.abs(height * Math.sin(radians));
    const spanY = Math.abs(width * Math.sin(radians)) + Math.abs(height * Math.cos(radians));
    xs.push(x - spanX / 2, x + spanX / 2);
    ys.push(y - spanY / 2, y + spanY / 2);
  };
  campus.buildings.forEach((building) => addBounds(building.x + building.width / 2, building.y + building.height / 2, building.width, building.height, building.rotation));
  campus.paths.forEach((path) => path.points.forEach((point) => { xs.push(point.x); ys.push(point.y); }));
  campus.markers.forEach((marker) => { xs.push(marker.x); ys.push(marker.y); });
  campus.decorAssets.forEach((asset) => {
    if (["ground-area", "lawn-area", "garden-area", "plaza-area", "parking-lot"].includes(asset.type)) {
      addBounds(asset.x, asset.y, asset.width ?? 150, asset.height ?? 95, asset.rotation);
    } else {
      const descriptor = DECOR_ASSET_MAP[asset.type];
      const size = descriptor ? decorWorldSize(descriptor, asset.scale) : { width: 42, height: 42 };
      addBounds(asset.x, asset.y, size.width, size.height, asset.rotation);
    }
  });
  if (!xs.length || !ys.length) return { x: campus.canvasW / 2, y: campus.canvasH / 2, width: campus.canvasW, height: campus.canvasH };
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, width: maxX - minX, height: maxY - minY };
}

function buildRibbonGeometry(points: readonly Pt[], width: number, elevation: number): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  if (points.length < 2) return geometry;
  const mapped = points.map((point) => worldPoint(point, elevation));
  const positions: number[] = [];
  const indices: number[] = [];
  const half = Math.max(0.012, campusMapSizeToWorld(width)) / 2;
  for (let i = 0; i < mapped.length; i += 1) {
    const before = mapped[Math.max(0, i - 1)];
    const after = mapped[Math.min(mapped.length - 1, i + 1)];
    const dx = after.x - before.x;
    const dz = after.z - before.z;
    const length = Math.max(1e-5, Math.hypot(dx, dz));
    let nx = -dz / length;
    let nz = dx / length;
    if (i > 0 && i < mapped.length - 1) {
      const incoming = mapped[i].x - mapped[i - 1].x;
      const incomingZ = mapped[i].z - mapped[i - 1].z;
      const outgoing = mapped[i + 1].x - mapped[i].x;
      const outgoingZ = mapped[i + 1].z - mapped[i].z;
      const inLength = Math.max(1e-5, Math.hypot(incoming, incomingZ));
      const outLength = Math.max(1e-5, Math.hypot(outgoing, outgoingZ));
      const inNx = -incomingZ / inLength;
      const inNz = incoming / inLength;
      const outNx = -outgoingZ / outLength;
      const outNz = outgoing / outLength;
      const mx = inNx + outNx;
      const mz = inNz + outNz;
      const miterLength = Math.max(1e-5, Math.hypot(mx, mz));
      const miterDot = (mx / miterLength) * outNx + (mz / miterLength) * outNz;
      const miterScale = Math.min(2.2, 1 / Math.max(0.45, miterDot));
      nx = (mx / miterLength) * miterScale;
      nz = (mz / miterLength) * miterScale;
    }
    positions.push(mapped[i].x + nx * half, elevation, mapped[i].z + nz * half);
    positions.push(mapped[i].x - nx * half, elevation, mapped[i].z - nz * half);
    if (i < mapped.length - 1) {
      const start = i * 2;
      indices.push(start, start + 1, start + 2, start + 1, start + 3, start + 2);
    }
  }
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function PathSurface({ path, route = false, halo = false }: { path: CampusPath | { id: string; points: Pt[]; width: number; type: string; color?: string }; route?: boolean; halo?: boolean }) {
  const road = !route && path.type === "road";
  const width = (path.width || (route ? 10 : 12)) + (halo ? (route ? 14 : 7) : 0);
  const geometry = useMemo(() => buildRibbonGeometry(path.points, width, route ? (halo ? 0.105 : 0.12) : road ? (halo ? 0.006 : 0.009) : (halo ? 0.012 : 0.015)), [path.points, width, road, route, halo]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const color = route ? (halo ? "#ffffff" : "#1769e0") : halo ? "#8c9d89" : road ? "#77818b" : path.type === "accessible" ? "#c5d8e8" : path.color || "#f8f6ef";
  return <mesh geometry={geometry} receiveShadow={false} renderOrder={route ? (halo ? 8 : 9) : 2}>
    <meshStandardMaterial color={color} roughness={0.94} metalness={0} transparent={route && halo} opacity={route && halo ? 0.92 : 1} side={THREE.DoubleSide} depthWrite />
  </mesh>;
}
const MemoPathSurface = memo(PathSurface);

function RouteArrows({ points, reducedMotion = false }: { points: readonly Pt[]; reducedMotion?: boolean }) {
  const arrows = useMemo(() => routeArrowPlacements(points, { worldScale: STUDENT_CAMPUS_3D_SCALE }), [points]);
  const routeSampler = useMemo(() => createRouteWorldSampler(points, STUDENT_CAMPUS_3D_SCALE), [points]);
  const meshRef = useRef<THREE.InstancedMesh>(null);
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
      const [x, y, z] = worldTuple(arrow.point, 0.145);
      transform.position.set(x, y, z);
      transform.rotation.set(0, arrow.yaw, 0);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
    });
    mesh.count = arrows.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [arrows]);
  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh || reducedMotion || arrows.length === 0) return;
    const usable = routeSampler.totalLength - 1.8;
    if (usable <= 0) return;
    elapsedRef.current += Math.min(delta, 0.05);
    const spacing = usable / arrows.length;
    const phase = (elapsedRef.current * 0.36) % spacing;
    for (let index = 0; index < arrows.length; index += 1) {
      const distance = 0.9 + ((index * spacing + phase) % usable);
      const point = routeSampler.sample(distance, pointScratch);
      if (!point) continue;
      const [x, y, z] = worldTuple(point, 0.145);
      transform.position.set(x, y, z);
      transform.rotation.set(0, routeSampler.yawAt(distance), 0);
      transform.scale.setScalar(routeSampler.isNearCorner(distance) ? 0 : 1);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
  if (!arrows.length) return null;
  return <instancedMesh ref={meshRef} args={[geometry, material, arrows.length]} renderOrder={11} frustumCulled />;
}

function softBuildingColor(value: string): string {
  // Preserve the authored campus color. The previous near-white 76% blend
  // erased color identity once the building was lit in the 3D renderer.
  try { return `#${new THREE.Color(value).lerp(new THREE.Color("#edf0eb"), 0.28).getHexString()}`; }
  catch { return "#c8d5df"; }
}

function Building({ building, selected, onSelectBuilding, shouldSuppressClick }: { building: ReadonlyOutdoorCampus["buildings"][number]; selected: boolean; onSelectBuilding?: (buildingId: string) => void; shouldSuppressClick: () => boolean }) {
  const floors = Math.max(1, building.floors?.length ?? 1);
  const width = campusMapSizeToWorld(building.width);
  const depth = campusMapSizeToWorld(building.height);
  const height = 0.38 + floors * 0.15;
  const floorHeight = height / floors;
  const world = campusMapPointToWorld({ x: building.x + building.width / 2, y: building.y + building.height / 2 });
  const body = softBuildingColor(building.color || "#b9cad8");
  const longBays = Math.max(2, Math.min(6, Math.floor(width / 0.42)));
  const shortBays = Math.max(2, Math.min(5, Math.floor(depth / 0.38)));
  const paneHeight = Math.min(0.082, floorHeight * 0.42);
  const paneColor = "#5e8396";
  return <group position={[world.x, 0, world.z]} rotation={[0, -(building.rotation ?? 0) * Math.PI / 180, 0]}>
    <mesh position={[0, height / 2, 0]} castShadow receiveShadow onClick={(event) => { event.stopPropagation(); if (event.delta < 7 && !shouldSuppressClick()) onSelectBuilding?.(building.id); }}>
      <boxGeometry args={[width, height, depth]} />
      <meshStandardMaterial color={body} roughness={0.78} metalness={0.02} emissive={selected ? "#56a4ff" : "#000000"} emissiveIntensity={selected ? 0.18 : 0} />
    </mesh>
    {Array.from({ length: floors }, (_, index) => {
      const y = (index + 0.56) * floorHeight;
      const bayWidth = width / longBays;
      const bayDepth = depth / shortBays;
      return <group key={index}>
        {/* Quiet floor datum; individual window bays replace the old full-width
            ribbons that made every building read as a stack of stripes. */}
        <mesh position={[0, (index + 1) * floorHeight, 0]}><boxGeometry args={[width + 0.025, 0.022, depth + 0.025]} /><meshStandardMaterial color="#e4e8e7" roughness={0.66} /></mesh>
        {Array.from({ length: longBays }, (_, bay) => {
          const x = (bay - (longBays - 1) / 2) * bayWidth;
          return <Fragment key={`long-${bay}`}>
            <mesh position={[x, y, depth / 2 + 0.006]}><boxGeometry args={[bayWidth * 0.58, paneHeight, 0.016]} /><meshStandardMaterial color={paneColor} roughness={0.38} metalness={0.06} /></mesh>
            <mesh position={[x, y, -depth / 2 - 0.006]}><boxGeometry args={[bayWidth * 0.58, paneHeight, 0.016]} /><meshStandardMaterial color={paneColor} roughness={0.38} metalness={0.06} /></mesh>
          </Fragment>;
        })}
        {Array.from({ length: shortBays }, (_, bay) => {
          const z = (bay - (shortBays - 1) / 2) * bayDepth;
          return <Fragment key={`short-${bay}`}>
            <mesh position={[width / 2 + 0.006, y, z]}><boxGeometry args={[0.016, paneHeight, bayDepth * 0.56]} /><meshStandardMaterial color={paneColor} roughness={0.38} metalness={0.06} /></mesh>
            <mesh position={[-width / 2 - 0.006, y, z]}><boxGeometry args={[0.016, paneHeight, bayDepth * 0.56]} /><meshStandardMaterial color={paneColor} roughness={0.38} metalness={0.06} /></mesh>
          </Fragment>;
        })}
      </group>;
    })}
    <mesh position={[0, height + 0.035, 0]} castShadow><boxGeometry args={[width + 0.09, 0.07, depth + 0.09]} /><meshStandardMaterial color={selected ? "#b6d9fb" : "#f4f7f8"} roughness={0.64} /></mesh>
    <mesh position={[0, height + 0.078, 0]}><boxGeometry args={[width + 0.13, 0.012, depth + 0.13]} /><meshStandardMaterial color="#8394a0" roughness={0.72} /></mesh>
    <Billboard follow>
      <Html position={[0, height + 0.16, 0]} center occlude={false} style={{ pointerEvents: "none" }}>
        <div className="whitespace-nowrap rounded-md border border-white/75 bg-slate-900/85 px-1.5 py-0.5 text-[10px] font-extrabold tracking-wide text-white shadow-sm">{building.code || building.name}</div>
      </Html>
    </Billboard>
    <mesh position={[0, 0.04, 0]} onClick={(event) => { event.stopPropagation(); if (event.delta < 7 && !shouldSuppressClick()) onSelectBuilding?.(building.id); }}><boxGeometry args={[width + 0.025, 0.08, depth + 0.025]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
  </group>;
}
const MemoBuilding = memo(Building);

type Part = { geometry: THREE.BufferGeometry; material: THREE.Material; matrix: (asset: CampusDecorAsset) => THREE.Matrix4 };
const assetDummy = new THREE.Object3D();
const geo = {
  trunk: new THREE.CylinderGeometry(0.05, 0.07, 1, 7), canopy: new THREE.IcosahedronGeometry(0.45, 0),
  leaf: new THREE.ConeGeometry(0.11, 0.65, 5), benchTop: new THREE.BoxGeometry(1, 0.08, 0.32), benchSupport: new THREE.BoxGeometry(0.07, 0.28, 0.27), benchBack: new THREE.BoxGeometry(1, 0.3, 0.07),
  pole: new THREE.CylinderGeometry(0.025, 0.04, 1, 7), lamp: new THREE.SphereGeometry(0.085, 8, 6), post: new THREE.CylinderGeometry(0.05, 0.06, 0.34, 8),
  box: new THREE.BoxGeometry(0.45, 0.4, 0.45), cone: new THREE.ConeGeometry(0.36, 0.58, 7),
};
const mat = {
  wood: new THREE.MeshStandardMaterial({ color: "#765642", roughness: 0.92 }), leaf: new THREE.MeshStandardMaterial({ color: "#4f895e", roughness: 0.95 }),
  palm: new THREE.MeshStandardMaterial({ color: "#5b9460", roughness: 0.93 }), bench: new THREE.MeshStandardMaterial({ color: "#9b7657", roughness: 0.84 }),
  metal: new THREE.MeshStandardMaterial({ color: "#526a79", roughness: 0.55, metalness: 0.22 }), lamp: new THREE.MeshStandardMaterial({ color: "#f5e9bb", emissive: "#f6d779", emissiveIntensity: 0.25, roughness: 0.4 }),
  stone: new THREE.MeshStandardMaterial({ color: "#a9b4b7", roughness: 0.84 }), green: new THREE.MeshStandardMaterial({ color: "#79a76c", roughness: 1 }),
  accent: new THREE.MeshStandardMaterial({ color: "#386989", roughness: 0.65 }),
};
function PhilippineFlagSurface() {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    if (!context) return null;
    const { width, height } = canvas;

    context.fillStyle = "#0756a5";
    context.fillRect(0, 0, width, height / 2);
    context.fillStyle = "#ce293d";
    context.fillRect(0, height / 2, width, height / 2);

    context.fillStyle = "#fffdf3";
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(0, height);
    context.lineTo(width * 0.48, height / 2);
    context.closePath();
    context.fill();

    const centerX = width * 0.2;
    const centerY = height / 2;
    const sunRadius = height * 0.115;
    context.fillStyle = "#f2c230";
    for (let ray = 0; ray < 8; ray += 1) {
      const angle = (ray * Math.PI) / 4;
      context.beginPath();
      context.moveTo(centerX + Math.cos(angle) * sunRadius * 0.72, centerY + Math.sin(angle) * sunRadius * 0.72);
      context.lineTo(centerX + Math.cos(angle - 0.17) * sunRadius * 1.48, centerY + Math.sin(angle - 0.17) * sunRadius * 1.48);
      context.lineTo(centerX + Math.cos(angle + 0.17) * sunRadius * 1.48, centerY + Math.sin(angle + 0.17) * sunRadius * 1.48);
      context.closePath();
      context.fill();
    }
    context.beginPath();
    context.arc(centerX, centerY, sunRadius * 0.7, 0, Math.PI * 2);
    context.fill();

    const drawStar = (x: number, y: number, radius: number) => {
      context.beginPath();
      for (let point = 0; point < 10; point += 1) {
        const angle = -Math.PI / 2 + (point * Math.PI) / 5;
        const r = point % 2 === 0 ? radius : radius * 0.43;
        const px = x + Math.cos(angle) * r;
        const py = y + Math.sin(angle) * r;
        if (point === 0) context.moveTo(px, py); else context.lineTo(px, py);
      }
      context.closePath();
      context.fill();
    };
    context.fillStyle = "#f2c230";
    drawStar(width * 0.055, height * 0.09, height * 0.06);
    drawStar(width * 0.055, height * 0.91, height * 0.06);
    drawStar(width * 0.43, height * 0.5, height * 0.06);

    const result = new THREE.CanvasTexture(canvas);
    result.colorSpace = THREE.SRGBColorSpace;
    result.anisotropy = 4;
    result.needsUpdate = true;
    return result;
  }, []);
  useEffect(() => () => texture?.dispose(), [texture]);
  if (!texture) return null;
  return <mesh position={[0.244, 0.83, 0.009]}>
    <planeGeometry args={[0.42, 0.21]} />
    <meshBasicMaterial map={texture} side={THREE.DoubleSide} toneMapped={false} />
  </mesh>;
}

function matrixAt(asset: CampusDecorAsset, localX: number, y: number, localZ: number, sx: number, sy: number, sz: number, rotation = 0, groundedGeometry?: THREE.BufferGeometry) {
  const size = DECOR_ASSET_MAP[asset.type] ? decorWorldSize(DECOR_ASSET_MAP[asset.type], asset.scale) : { width: 42, height: 42 };
  // Decor dimensions are authored in the same campus map units used by the
  // 2D renderer. Convert them through the shared 0.01 map-to-world scale;
  // dividing by the old 55-unit visual-radius estimate made models wider
  // than their authored footprints and triggered bench collision offsets.
  const widthScale = campusMapSizeToWorld(size.width);
  const depthScale = campusMapSizeToWorld(size.height);
  const angle = (asset.rotation ?? 0) * Math.PI / 180;
  const x = (localX * Math.cos(angle) - localZ * Math.sin(angle)) * STUDENT_CAMPUS_3D_SCALE;
  const z = (localX * Math.sin(angle) + localZ * Math.cos(angle)) * STUDENT_CAMPUS_3D_SCALE;
  const verticalAssetScale = Math.max(0.2, asset.scale ?? 1);
  let positionY = y * verticalAssetScale;
  if (groundedGeometry) {
    groundedGeometry.computeBoundingBox();
    positionY = groundedModelOffset(groundedGeometry.boundingBox?.min.y ?? 0, sy * verticalAssetScale, STUDENT_CAMPUS_3D_GROUND_EPSILON);
  }
  const anchor = campusMapPointToWorld({ x: asset.x, y: asset.y }, positionY);
  assetDummy.position.set(anchor.x + x, anchor.y, anchor.z + z);
  assetDummy.rotation.set(0, -angle + rotation, 0);
  // Footprint dimensions affect horizontal size only. Deriving height from a
  // narrow authored footprint made lamps and trees float above the ground.
  assetDummy.scale.set(sx * widthScale, sy * verticalAssetScale, sz * depthScale);
  assetDummy.updateMatrix();
  return assetDummy.matrix.clone();
}

function InstancedPart({ assets, geometry, material, transform }: { assets: readonly CampusDecorAsset[]; geometry: THREE.BufferGeometry; material: THREE.Material; transform: (asset: CampusDecorAsset) => THREE.Matrix4 }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    assets.forEach((asset, index) => mesh.setMatrixAt(index, transform(asset)));
    mesh.count = assets.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [assets, transform]);
  return assets.length ? <instancedMesh ref={meshRef} args={[geometry, material, assets.length]} frustumCulled /> : null;
}

function benchLengthScale(asset: CampusDecorAsset) {
  // Match the occupied horizontal artwork in the authored 2D bench icon.
  return asset.type === "bench-long" ? 28 / 36 : 18 / 24;
}

function OutdoorAssetLayer({ assets, suhayHusaySelected = false }: { assets: readonly CampusDecorAsset[]; suhayHusaySelected?: boolean }) {
  const groups = useMemo(() => groupCampusDecorAssetsByType(assets), [assets]);
  const trees = [...(groups.get("tree") ?? []), ...(groups.get("tree-large") ?? [])];
  const palms = groups.get("palm") ?? [];
  const benches = [...(groups.get("bench") ?? []), ...(groups.get("bench-long") ?? [])];
  const lamps = groups.get("lamp-post") ?? [];
  const plants = [...(groups.get("plant") ?? []), ...(groups.get("bush") ?? []), ...(groups.get("flower") ?? [])];
  const suhayAssetId = resolveSuhayHusayDecorAssetId(assets);
  const used = new Set(["ground-area", "lawn-area", "garden-area", "plaza-area", "parking-lot", "tree", "tree-large", "palm", "bench", "bench-long", "lamp-post", "plant", "bush", "flower", "monument", "fountain", "gazebo", "guard-booth", "directory-board", "flag", "philippine-flag", "bike-rack", "trash-bin", "recycle-bin", "bollard", "gate-scanner", "picnic-table"]);
  const trunks = useMemo(() => (asset: CampusDecorAsset) => matrixAt(asset, 0, 0, 0, asset.type === "tree-large" ? 0.45 : 0.6, asset.type === "tree-large" ? 0.48 : 0.39, 1, 0, geo.trunk), []);
  const canopies = useMemo(() => (asset: CampusDecorAsset) => matrixAt(asset, 0, asset.type === "tree-large" ? 0.76 : 0.58, 0, asset.type === "tree-large" ? 0.83 : 0.82, asset.type === "tree-large" ? 1.12 : 0.82, asset.type === "tree-large" ? 0.68 : 0.71), []);
  const palmTrunks = useMemo(() => (asset: CampusDecorAsset) => matrixAt(asset, 0, 0, 0, 1, 0.64, 1, -0.04, geo.trunk), []);
  const palmLeaves = useMemo(() => (asset: CampusDecorAsset) => matrixAt(asset, 0, 0.88, 0, 1.2, 0.9, 1.2), []);
  const benchSeats = useMemo(() => (asset: CampusDecorAsset) => matrixAt(asset, 0, 0.29, 6.75, benchLengthScale(asset), 1, 2.05), []);
  const benchLegs = useMemo(() => (asset: CampusDecorAsset) => matrixAt(asset, 0, 0, 0, 1, 1, 1, 0, geo.benchSupport), []);
  const benchBacks = useMemo(() => (asset: CampusDecorAsset) => matrixAt(asset, 0, 0.46, -6, benchLengthScale(asset) * 0.9, 1, 1.2), []);
  const lampPosts = useMemo(() => (asset: CampusDecorAsset) => matrixAt(asset, 0, 0, 0, 1, 0.94, 1, 0, geo.pole), []);
  const lampHeads = useMemo(() => (asset: CampusDecorAsset) => matrixAt(asset, 0, 0.97, 0, 1, 1, 1), []);
  const plantCanopies = useMemo(() => (asset: CampusDecorAsset) => matrixAt(asset, 0, 0, 0, 0.72, 0.48, 0.72, 0, geo.canopy), []);
  return <group>
    <InstancedPart assets={trees} geometry={geo.trunk} material={mat.wood} transform={trunks} />
    <InstancedPart assets={trees} geometry={geo.canopy} material={mat.leaf} transform={canopies} />
    <InstancedPart assets={palms} geometry={geo.trunk} material={mat.wood} transform={palmTrunks} />
    <InstancedPart assets={palms} geometry={geo.leaf} material={mat.palm} transform={palmLeaves} />
    <InstancedPart assets={benches} geometry={geo.benchTop} material={mat.bench} transform={benchSeats} />
    <InstancedPart assets={benches} geometry={geo.benchSupport} material={mat.metal} transform={benchLegs} />
    <InstancedPart assets={benches} geometry={geo.benchBack} material={mat.bench} transform={benchBacks} />
    <InstancedPart assets={lamps} geometry={geo.pole} material={mat.metal} transform={lampPosts} />
    <InstancedPart assets={lamps} geometry={geo.lamp} material={mat.lamp} transform={lampHeads} />
    <InstancedPart assets={plants} geometry={geo.canopy} material={mat.green} transform={plantCanopies} />
    {assets.filter((asset) => ["ground-area", "lawn-area", "garden-area", "plaza-area", "parking-lot"].includes(asset.type)).map((asset) => <GroundArea key={asset.id} asset={asset} />)}
    {assets.filter((asset) => !used.has(asset.type)).map((asset) => <GenericAsset key={asset.id} asset={asset} />)}
    {assets.filter((asset) => ["monument", "fountain", "gazebo", "guard-booth", "directory-board", "flag", "philippine-flag", "bike-rack", "trash-bin", "recycle-bin", "bollard", "gate-scanner", "picnic-table"].includes(asset.type)).map((asset) => <GenericAsset key={`known-${asset.id}`} asset={asset} isSuhayHusay={asset.id === suhayAssetId} selectedLandmark={asset.id === suhayAssetId && suhayHusaySelected} />)}
  </group>;
}
const MemoOutdoorAssetLayer = memo(OutdoorAssetLayer);

function GroundArea({ asset }: { asset: CampusDecorAsset }) {
  const descriptor = DECOR_ASSET_MAP[asset.type];
  const width = asset.width ?? (descriptor?.defaultWidth ?? 150) * decorRenderScale(asset.scale);
  const depth = asset.height ?? (descriptor?.defaultHeight ?? 95) * decorRenderScale(asset.scale);
  const cells = asset.surfaceCells?.length ? asset.surfaceCells : null;
  const parking = asset.groundType === "parking" || asset.type === "parking-lot";
  // Surface-cell areas are intentionally just paved polygons in the 2D
  // reader, so keep their exact authored mask and avoid rectangular striping.
  const parkingSegments = useMemo(() => parking && (!cells || asset.type === "parking-lot")
    ? campusParkingMarkingSegments(width, depth)
    : [], [asset.type, cells, depth, parking, width]);
  const parkingMarkings = useMemo(() => {
    const positions: number[] = [];
    const indices: number[] = [];
    for (const segment of parkingSegments) {
      const x1 = segment.x1 * STUDENT_CAMPUS_3D_SCALE;
      const z1 = segment.z1 * STUDENT_CAMPUS_3D_SCALE;
      const x2 = segment.x2 * STUDENT_CAMPUS_3D_SCALE;
      const z2 = segment.z2 * STUDENT_CAMPUS_3D_SCALE;
      const dx = x2 - x1;
      const dz = z2 - z1;
      const length = Math.hypot(dx, dz);
      if (length < 1e-6) continue;
      const lineWidth = (segment.kind === "drive-aisle" ? 1.2 : 1) * STUDENT_CAMPUS_3D_SCALE;
      const nx = -(dz / length) * lineWidth / 2;
      const nz = (dx / length) * lineWidth / 2;
      const base = positions.length / 3;
      positions.push(x1 + nx, 0, z1 + nz, x1 - nx, 0, z1 - nz, x2 - nx, 0, z2 - nz, x2 + nx, 0, z2 + nz);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }, [parkingSegments]);
  useEffect(() => () => parkingMarkings.dispose(), [parkingMarkings]);
  const geometry = useMemo(() => {
    const cell = asset.surfaceCellSize ?? 20;
    const rects = cells && asset.type !== "parking-lot" ? cells.map((c) => ({ x: c.x * cell - asset.x, z: c.y * cell - asset.y, w: cell, d: cell })) : [{ x: -width / 2, z: -depth / 2, w: width, d: depth }];
    const vertices: number[] = []; const indices: number[] = [];
    rects.forEach((rect) => { const base = vertices.length / 3; const s = STUDENT_CAMPUS_3D_SCALE; vertices.push(rect.x * s, 0, rect.z * s, (rect.x + rect.w) * s, 0, rect.z * s, (rect.x + rect.w) * s, 0, (rect.z + rect.d) * s, rect.x * s, 0, (rect.z + rect.d) * s); indices.push(base, base + 2, base + 1, base, base + 3, base + 2); });
    const result = new THREE.BufferGeometry(); result.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3)); result.setIndex(indices); result.computeVertexNormals(); return result;
  }, [asset.scale, asset.surfaceCellSize, asset.surfaceCells, asset.type, asset.width, asset.height, asset.x, asset.y, cells, depth, width]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const position = campusMapPointToWorld({ x: asset.x, y: asset.y }, 0.002);
  const color = asset.groundColor ?? (asset.groundType === "plaza" || asset.type === "plaza-area" ? "#d8d9d1" : parking ? "#828b90" : asset.groundType === "field" ? "#91ae75" : "#9db989");
  return <group position={[position.x, position.y, position.z]} rotation={[0, -(asset.rotation ?? 0) * Math.PI / 180, 0]}>
    <mesh geometry={geometry} receiveShadow renderOrder={1}><meshStandardMaterial color={color} roughness={1} side={THREE.DoubleSide} /></mesh>
    {parkingSegments.length > 0 && <mesh name="student-campus-parking-stall-markings" geometry={parkingMarkings} position={[0, 0.004, 0]} renderOrder={2} frustumCulled>
      <meshBasicMaterial color="#f5f6f4" transparent opacity={0.86} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>}
  </group>;
}

function SculptureLimb({ from, to, radius, color }: { from: [number, number, number]; to: [number, number, number]; radius: number; color: string }) {
  const a = new THREE.Vector3(...from); const b = new THREE.Vector3(...to);
  const direction = b.clone().sub(a); const length = direction.length();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return <mesh position={a.add(b).multiplyScalar(0.5)} quaternion={quaternion} castShadow>
    <cylinderGeometry args={[radius * 0.86, radius, length, 6, 1]} />
    <meshStandardMaterial color={color} roughness={0.78} metalness={0.2} flatShading />
  </mesh>;
}

/** Dedicated, replaceable low-poly Suhay Husay sculpture. The figures are
 * separated along the normal isometric screen axis so their linked silhouette
 * remains readable from the campus navigation camera. */
function SuhayHusayModelLegacy() {
  const bronze = "#51483e";
  const litBronze = "#6a5a48";
  return <group name="suhay-husay-dedicated-sculpture" scale={0.68}>
    <mesh position={[0, 0.1, 0]} castShadow receiveShadow><boxGeometry args={[1.02, 0.2, 0.68]} /><meshStandardMaterial color="#272c30" roughness={0.92} flatShading /></mesh>
    <mesh position={[0, 0.29, 0]} rotation={[0, Math.PI / 4, 0]} castShadow receiveShadow><cylinderGeometry args={[0.31, 0.4, 0.2, 5, 1]} /><meshStandardMaterial color="#34383a" roughness={0.9} flatShading /></mesh>
    <mesh position={[0, 0.4, 0]} castShadow><boxGeometry args={[0.78, 0.06, 0.52]} /><meshStandardMaterial color="#45494a" roughness={0.88} flatShading /></mesh>
    {/* Local x is turned toward the usual isometric screen-right direction. */}
    <group rotation={[0, Math.PI / 4, 0]}>
      {/* Upper figure: long planted legs and a narrow torso leaning inward. */}
      <SculptureLimb from={[-0.52, 0.43, 0.055]} to={[-0.42, 0.59, 0.055]} radius={0.034} color={bronze} />
      <SculptureLimb from={[-0.42, 0.59, 0.055]} to={[-0.34, 0.77, 0.055]} radius={0.031} color={bronze} />
      <SculptureLimb from={[-0.25, 0.43, -0.055]} to={[-0.2, 0.61, -0.055]} radius={0.034} color={bronze} />
      <SculptureLimb from={[-0.2, 0.61, -0.055]} to={[-0.34, 0.77, -0.055]} radius={0.031} color={bronze} />
      <SculptureLimb from={[-0.34, 0.73, 0]} to={[-0.24, 1.1, 0]} radius={0.06} color={litBronze} />
      <SculptureLimb from={[-0.24, 1.1, 0]} to={[-0.12, 1.4, 0]} radius={0.041} color={bronze} />
      <SculptureLimb from={[-0.12, 1.4, 0]} to={[-0.055, 1.47, 0]} radius={0.024} color={bronze} />
      <mesh position={[-0.035, 1.55, 0]} castShadow><icosahedronGeometry args={[0.062, 1]} /><meshStandardMaterial color={litBronze} roughness={0.72} metalness={0.16} flatShading /></mesh>
      {/* The standing figure leans toward the lower figure and reaches down. */}
      <SculptureLimb from={[-0.2, 1.2, 0.055]} to={[0.08, 1.24, 0.055]} radius={0.031} color={bronze} />
      <SculptureLimb from={[0.08, 1.24, 0.055]} to={[0.36, 1.12, 0.055]} radius={0.026} color={bronze} />
      <SculptureLimb from={[-0.21, 1.15, -0.055]} to={[0.08, 1.25, -0.055]} radius={0.031} color={bronze} />
      <SculptureLimb from={[0.08, 1.25, -0.055]} to={[0.36, 1.12, -0.055]} radius={0.025} color={bronze} />
      {/* Lower figure: visibly folded legs, a low kneeling body and an upward reach. */}
      <SculptureLimb from={[0.42, 0.43, 0.09]} to={[0.68, 0.43, 0.09]} radius={0.031} color={bronze} />
      <SculptureLimb from={[0.42, 0.43, 0.09]} to={[0.36, 0.62, 0.09]} radius={0.034} color={bronze} />
      <SculptureLimb from={[0.62, 0.43, -0.09]} to={[0.83, 0.43, -0.09]} radius={0.031} color={bronze} />
      <SculptureLimb from={[0.62, 0.43, -0.09]} to={[0.35, 0.66, -0.09]} radius={0.034} color={bronze} />
      <SculptureLimb from={[0.35, 0.62, 0]} to={[0.23, 0.76, 0]} radius={0.056} color={litBronze} />
      <SculptureLimb from={[0.23, 0.76, 0]} to={[0.11, 0.82, 0]} radius={0.038} color={bronze} />
      <SculptureLimb from={[0.11, 0.82, 0]} to={[0.09, 0.87, 0]} radius={0.023} color={bronze} />
      <mesh position={[0.065, 0.94, 0]} castShadow><icosahedronGeometry args={[0.052, 1]} /><meshStandardMaterial color={litBronze} roughness={0.72} metalness={0.16} flatShading /></mesh>
      {/* The lower figure is seated/kneeling and reaches up to the upper hand. */}
      <SculptureLimb from={[0.13, 0.78, 0.055]} to={[0.24, 0.96, 0.055]} radius={0.027} color={bronze} />
      <SculptureLimb from={[0.24, 0.96, 0.055]} to={[0.36, 1.12, 0.055]} radius={0.024} color={bronze} />
      <SculptureLimb from={[0.2, 0.76, -0.055]} to={[0.25, 0.96, -0.055]} radius={0.028} color={bronze} />
      <SculptureLimb from={[0.25, 0.96, -0.055]} to={[0.36, 1.12, -0.055]} radius={0.023} color={bronze} />
      <mesh position={[0.36, 1.12, 0.055]} castShadow><icosahedronGeometry args={[0.035, 0]} /><meshStandardMaterial color="#806b52" roughness={0.7} flatShading /></mesh>
      <mesh position={[0.36, 1.12, -0.055]} castShadow><icosahedronGeometry args={[0.035, 0]} /><meshStandardMaterial color="#806b52" roughness={0.7} flatShading /></mesh>
    </group>
  </group>;
}

/** V2 uses a clear profile composition: the standing figure leans down and
 * right; the seated figure leans up and left. Their four reaching arms meet at
 * one small hand cluster centered above the pedestal. Keep scale and authored
 * placement identical to Legacy so only the silhouette changes. */
function SuhayHusayModelV2() {
  const bronze = "#90724f";
  const litBronze = "#ad8c62";
  const hand = "#c4a578";
  return <group name="suhay-husay-v2-sculpture" scale={0.68}>
    <mesh position={[0, 0.065, 0]} castShadow receiveShadow><boxGeometry args={[1.02, 0.13, 0.68]} /><meshStandardMaterial color="#625d54" roughness={0.92} flatShading /></mesh>
    {/* The smaller seat stone sits directly beneath the low figure's pelvis;
        the standing figure remains on the shared grounded plinth. */}
    <mesh position={[0.4, 0.195, 0.12]} rotation={[0, Math.PI / 10, 0]} scale={[1.05, 0.65, 0.9]} castShadow receiveShadow><dodecahedronGeometry args={[0.19, 0]} /><meshStandardMaterial color="#999489" roughness={0.88} flatShading /></mesh>
    {/* Keep the figures' separation aligned with the normal campus view's
        screen-horizontal axis. This preserves the visible height difference
        between the standing and seated silhouettes at ordinary zoom. */}
    <group>
      <group position={[0, 0, -0.16]}>
      {/* Standing figure: two planted legs, a long torso leaning right and a
          bowed head facing the lower figure. */}
      <SculptureLimb from={[-0.49, 0.15, 0]} to={[-0.43, 0.4, 0.015]} radius={0.034} color={bronze} />
      <SculptureLimb from={[-0.43, 0.4, 0.015]} to={[-0.32, 0.67, 0.015]} radius={0.037} color={bronze} />
      <SculptureLimb from={[-0.17, 0.15, 0]} to={[-0.14, 0.39, -0.015]} radius={0.034} color={bronze} />
      <SculptureLimb from={[-0.14, 0.39, -0.015]} to={[-0.32, 0.67, -0.015]} radius={0.037} color={bronze} />
      <SculptureLimb from={[-0.32, 0.64, 0]} to={[-0.29, 1.02, 0]} radius={0.066} color={litBronze} />
      <SculptureLimb from={[-0.29, 1.02, 0]} to={[-0.22, 1.29, 0]} radius={0.041} color={bronze} />
      <SculptureLimb from={[-0.22, 1.29, 0]} to={[-0.17, 1.34, 0]} radius={0.023} color={bronze} />
      <mesh position={[-0.15, 1.43, 0]} rotation={[0, 0, -0.28]} castShadow><icosahedronGeometry args={[0.061, 1]} /><meshStandardMaterial color={litBronze} roughness={0.72} metalness={0.12} flatShading /></mesh>
      </group>

      {/* The standing figure's arms reach down and the seated figure's arms
          reach up. Both pairs meet at two distinct grasp points, joined by a
          short sculptural link so the support gesture survives small views. */}
      <SculptureLimb from={[-0.24, 1.1, -0.045]} to={[-0.055, 1.08, 0.115]} radius={0.032} color={litBronze} />
      <SculptureLimb from={[-0.055, 1.08, 0.115]} to={[0.11, 1.015, 0.115]} radius={0.029} color={litBronze} />
      <SculptureLimb from={[-0.24, 1.03, -0.255]} to={[-0.055, 0.985, -0.095]} radius={0.031} color={bronze} />
      <SculptureLimb from={[-0.055, 0.985, -0.095]} to={[0.07, 0.94, -0.095]} radius={0.028} color={bronze} />

      {/* Lower figure is unmistakably seated: low hips on the stone, thighs
          running forward, folded shins at plinth level, torso lifted toward
          the standing person and head turned inward/up. */}
      <mesh position={[0.42, 0.39, 0.15]} scale={[1.15, 0.72, 0.88]} castShadow><icosahedronGeometry args={[0.075, 0]} /><meshStandardMaterial color={litBronze} roughness={0.72} metalness={0.12} flatShading /></mesh>
      <SculptureLimb from={[0.42, 0.39, 0.16]} to={[0.58, 0.37, 0.16]} radius={0.036} color={bronze} />
      <SculptureLimb from={[0.58, 0.37, 0.16]} to={[0.65, 0.15, 0.16]} radius={0.032} color={bronze} />
      <SculptureLimb from={[0.41, 0.39, 0.09]} to={[0.28, 0.34, 0.09]} radius={0.036} color={bronze} />
      <SculptureLimb from={[0.28, 0.34, 0.09]} to={[0.37, 0.15, 0.09]} radius={0.032} color={bronze} />
      <SculptureLimb from={[0.42, 0.41, 0.14]} to={[0.42, 0.62, 0.14]} radius={0.065} color={litBronze} />
      <SculptureLimb from={[0.42, 0.62, 0.14]} to={[0.39, 0.77, 0.16]} radius={0.046} color={bronze} />
      <SculptureLimb from={[0.39, 0.77, 0.16]} to={[0.37, 0.84, 0.17]} radius={0.024} color={bronze} />
      <mesh position={[0.36, 0.92, 0.18]} rotation={[0, 0, 0.28]} scale={[1, 0.88, 0.84]} castShadow><icosahedronGeometry args={[0.06, 1]} /><meshStandardMaterial color={litBronze} roughness={0.72} metalness={0.12} flatShading /></mesh>

      <SculptureLimb from={[0.4, 0.61, 0.2]} to={[0.25, 0.78, 0.2]} radius={0.032} color={litBronze} />
      <SculptureLimb from={[0.25, 0.78, 0.2]} to={[0.11, 1.015, 0.115]} radius={0.029} color={litBronze} />
      <SculptureLimb from={[0.43, 0.56, -0.1]} to={[0.25, 0.72, -0.1]} radius={0.031} color={bronze} />
      <SculptureLimb from={[0.25, 0.72, -0.1]} to={[0.07, 0.94, -0.095]} radius={0.028} color={bronze} />
      <SculptureLimb from={[0.11, 1.015, 0.115]} to={[0.07, 0.94, -0.095]} radius={0.019} color={hand} />
      <mesh position={[0.11, 1.015, 0.115]} castShadow><icosahedronGeometry args={[0.034, 0]} /><meshStandardMaterial color={hand} roughness={0.7} flatShading /></mesh>
      <mesh position={[0.07, 0.94, -0.095]} castShadow><icosahedronGeometry args={[0.034, 0]} /><meshStandardMaterial color={hand} roughness={0.7} flatShading /></mesh>
    </group>
  </group>;
}

/** V3 draws the sculpture as connected sculptural masses instead of a row of
 * exposed joints. The low figure sits on the stone and lifts its chest toward
 * the standing figure; their arms meet at two readable support points. */
function SuhayHusayModelV3() {
  const bronze = "#66523d";
  const bronzeLight = "#92734f";
  const joinedHands = "#c0a076";
  return <group name="suhay-husay-v3-sculpture" scale={0.68}>
    {/* One grounded, faceted stone supports both figures. A raised seat stone
        gives the lower figure a clear physical place to sit against. */}
    <mesh position={[0, 0.07, 0]} castShadow receiveShadow>
      <boxGeometry args={[1.02, 0.14, 0.68]} />
      <meshStandardMaterial color="#4b4a45" roughness={0.94} flatShading />
    </mesh>
    <mesh position={[0, 0.17, 0]} rotation={[0, Math.PI / 4, 0]} castShadow receiveShadow>
      <cylinderGeometry args={[0.36, 0.43, 0.12, 6, 1]} />
      <meshStandardMaterial color="#77766f" roughness={0.92} flatShading />
    </mesh>
    {/* Keep the seat on the far side of the low figure. The usual campus
        camera looks from +Z; placing the stone in front hid the seated torso. */}
    <mesh position={[0.39, 0.24, -0.12]} rotation={[0, 0.18, -0.08]} scale={[1, 0.58, 0.8]} castShadow receiveShadow>
      <dodecahedronGeometry args={[0.17, 0]} />
      <meshStandardMaterial color="#969187" roughness={0.9} flatShading />
    </mesh>

    {/* Standing figure: feet planted on the plinth, elongated torso leaning
        inward, and a small faceted head turned down toward the seated figure. */}
    <group name="suhay-husay-standing-figure">
      <SculptureLimb from={[-0.5, 0.22, -0.13]} to={[-0.43, 0.42, -0.13]} radius={0.045} color={bronze} />
      <SculptureLimb from={[-0.43, 0.42, -0.13]} to={[-0.34, 0.63, -0.13]} radius={0.05} color={bronze} />
      <SculptureLimb from={[-0.18, 0.22, -0.08]} to={[-0.2, 0.42, -0.08]} radius={0.044} color={bronze} />
      <SculptureLimb from={[-0.2, 0.42, -0.08]} to={[-0.34, 0.63, -0.13]} radius={0.05} color={bronze} />
      {/* Broad tapered trunk reads as a body rather than a single stick. */}
      <SculptureLimb from={[-0.34, 0.61, -0.12]} to={[-0.22, 1.13, -0.09]} radius={0.095} color={bronzeLight} />
      <SculptureLimb from={[-0.22, 1.11, -0.09]} to={[-0.13, 1.31, -0.055]} radius={0.047} color={bronze} />
      <mesh position={[-0.105, 1.395, -0.045]} rotation={[0.05, 0, -0.2]} scale={[0.82, 1.08, 0.8]} castShadow>
        <icosahedronGeometry args={[0.061, 1]} />
        <meshStandardMaterial color={bronzeLight} roughness={0.72} metalness={0.12} flatShading />
      </mesh>
    </group>

    {/* Seated / kneeling figure: hips rest on the raised stone, thighs fold
        forward, shins tuck back toward the plinth, and the torso rises toward
        the taller person. These joined masses preserve the low seated outline. */}
    <group name="suhay-husay-seated-figure">
      <SculptureLimb from={[0.37, 0.36, 0.12]} to={[0.59, 0.33, 0.13]} radius={0.067} color={bronzeLight} />
      <SculptureLimb from={[0.59, 0.33, 0.13]} to={[0.68, 0.17, 0.13]} radius={0.047} color={bronze} />
      <SculptureLimb from={[0.37, 0.36, 0.1]} to={[0.23, 0.32, 0.1]} radius={0.061} color={bronzeLight} />
      <SculptureLimb from={[0.23, 0.32, 0.1]} to={[0.34, 0.17, 0.1]} radius={0.046} color={bronze} />
      {/* Low pelvis and a lifted, inward-facing torso. */}
      <SculptureLimb from={[0.38, 0.4, 0.14]} to={[0.32, 0.62, 0.12]} radius={0.108} color={bronzeLight} />
      <SculptureLimb from={[0.32, 0.61, 0.12]} to={[0.23, 0.77, 0.075]} radius={0.065} color={bronze} />
      <mesh position={[0.2, 0.85, 0.07]} rotation={[0, 0, 0.22]} scale={[0.82, 1, 0.78]} castShadow>
        <icosahedronGeometry args={[0.057, 1]} />
        <meshStandardMaterial color={bronzeLight} roughness={0.72} metalness={0.12} flatShading />
      </mesh>
    </group>

    {/* Linked reach: both figures contribute both arms. The two close-set
        hand contacts form a supported clasp/arch, rather than crossing like
        combat poses. Slight depth offsets keep the joins legible in orbit. */}
    <group name="suhay-husay-connected-hands">
      {/* Standing figure, near arm */}
      <SculptureLimb from={[-0.22, 1.06, -0.025]} to={[-0.035, 1.16, 0.065]} radius={0.038} color={bronzeLight} />
      <SculptureLimb from={[-0.035, 1.16, 0.065]} to={[0.12, 1.075, 0.11]} radius={0.031} color={bronzeLight} />
      {/* Seated figure, near arm rises into the same upper clasp. */}
      <SculptureLimb from={[0.29, 0.65, 0.16]} to={[0.21, 0.82, 0.14]} radius={0.037} color={bronzeLight} />
      <SculptureLimb from={[0.21, 0.82, 0.14]} to={[0.12, 1.075, 0.11]} radius={0.031} color={bronzeLight} />
      {/* Far arms meet lower on the gesture, visibly bracing the clasp. */}
      <SculptureLimb from={[-0.25, 1.0, -0.16]} to={[-0.06, 0.94, -0.09]} radius={0.034} color={bronze} />
      <SculptureLimb from={[-0.06, 0.99, -0.09]} to={[0.105, 0.955, -0.015]} radius={0.03} color={bronze} />
      <SculptureLimb from={[0.28, 0.63, 0.22]} to={[0.19, 0.78, 0.12]} radius={0.034} color={bronze} />
      <SculptureLimb from={[0.19, 0.78, 0.12]} to={[0.105, 0.955, -0.015]} radius={0.03} color={bronze} />
      {/* Separate angular clasp forms mark each connected hand. Keeping the
          contacts distinct avoids the crossed, fight-like center in V2. */}
      <mesh position={[0.12, 1.075, 0.11]} rotation={[0.2, 0, -0.3]} castShadow>
        <octahedronGeometry args={[0.036, 0]} />
        <meshStandardMaterial color={joinedHands} roughness={0.66} flatShading />
      </mesh>
      <mesh position={[0.105, 0.955, -0.015]} rotation={[0.2, 0, -0.3]} castShadow>
        <octahedronGeometry args={[0.034, 0]} />
        <meshStandardMaterial color={joinedHands} roughness={0.66} flatShading />
      </mesh>
    </group>
  </group>;
}

// The existing 3D designs remain selectable rollback options.
const SUHAY_HUSAY_MODEL_VERSION: "legacy" | "v2" | "v3" = "v3";

function GenericAsset({ asset, isSuhayHusay = false, selectedLandmark = false }: { asset: CampusDecorAsset; isSuhayHusay?: boolean; selectedLandmark?: boolean }) {
  const rootRef = useRef<THREE.Group>(null);
  const modelRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);
  const size = DECOR_ASSET_MAP[asset.type] ? decorWorldSize(DECOR_ASSET_MAP[asset.type], asset.scale) : { width: 42, height: 42 };
  const position = campusMapPointToWorld({ x: asset.x, y: asset.y });
  const scaleX = Math.max(0.01, campusMapSizeToWorld(size.width));
  const scaleZ = Math.max(0.01, campusMapSizeToWorld(size.height));
  const scaleY = Math.max(0.65, asset.scale ?? 1);
  const stone = ["monument", "fountain", "gazebo", "guard-booth", "directory-board", "picnic-table"].includes(asset.type);
  const color = asset.type.includes("flag") ? "#dc3e48" : asset.type.includes("bench") || asset.type.includes("bike") ? "#80684f" : stone ? "#9daab0" : "#657e8a";
  const isCone = asset.type === "bollard";
  useLayoutEffect(() => {
    const root = rootRef.current;
    const model = modelRef.current;
    if (!root || !model) return;
    // Measure the physical meshes in their authored local arrangement, then
    // put their actual lowest point on terrain. HTML labels are siblings and
    // therefore never affect a physical object's ground anchor.
    root.position.y = 0;
    root.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(model);
    if (Number.isFinite(bounds.min.y)) root.position.y = groundedModelOffset(bounds.min.y, 1, STUDENT_CAMPUS_3D_GROUND_EPSILON);
  }, [asset.id, asset.type, scaleX, scaleY, scaleZ]);
  return <group ref={rootRef} position={[position.x, 0, position.z]} rotation={[0, -(asset.rotation ?? 0) * Math.PI / 180, 0]} scale={[scaleX, scaleY, scaleZ]}
    onPointerOver={(event) => { if (isSuhayHusay) setHovered(true); event.stopPropagation(); }}
    onPointerOut={(event) => {
      if (isSuhayHusay) {
        const remainsInside = event.intersections.some((hit) => Boolean(rootRef.current?.getObjectById(hit.object.id)));
        if (!remainsInside) setHovered(false);
      }
      event.stopPropagation();
    }}>
    <group ref={modelRef}>
    {asset.type === "monument" ? isSuhayHusay ? (SUHAY_HUSAY_MODEL_VERSION === "v3" ? <SuhayHusayModelV3 /> : SUHAY_HUSAY_MODEL_VERSION === "v2" ? <SuhayHusayModelV2 /> : <SuhayHusayModelLegacy />) : <GenericMonumentModel /> : asset.type === "gazebo" || asset.type === "picnic-table" ? <>
      {[-0.42, 0.42].flatMap((x) => [-0.3, 0.3].map((z) => <mesh key={`${x}-${z}`} position={[x, 0.35, z]}><boxGeometry args={[0.035, 0.7, 0.035]} /><meshStandardMaterial color="#76644e" /></mesh>))}
      <mesh position={[0, 0.74, 0]}><coneGeometry args={[0.58, 0.27, 4]} /><meshStandardMaterial color="#527894" /></mesh>
      {asset.type === "picnic-table" && <mesh position={[0, 0.25, 0]}><boxGeometry args={[0.9, 0.09, 0.42]} /><meshStandardMaterial color="#977658" /></mesh>}
    </> : asset.type.includes("flag") ? <>
      <mesh position={[0, 0.52, 0]}><cylinderGeometry args={[0.025, 0.035, 1.04, 7]} /><meshStandardMaterial color="#667987" metalness={0.2} roughness={0.6} /></mesh>
      <PhilippineFlagSurface />
    </> : asset.type === "bike-rack" ? <>
      {[-0.3, -0.1, 0.1, 0.3].map((x) => <mesh key={x} position={[x, 0.2, 0]}><torusGeometry args={[0.13, 0.025, 5, 12, Math.PI]} /><meshStandardMaterial color="#586f7b" metalness={0.35} roughness={0.5} /></mesh>)}
    </> : asset.type === "trash-bin" || asset.type === "recycle-bin" ? <>
      <mesh position={[0, 0.2, 0]}><cylinderGeometry args={[0.16, 0.13, 0.38, 8]} /><meshStandardMaterial color={asset.type === "recycle-bin" ? "#3583a8" : "#71858e"} /></mesh>
      <mesh position={[0, 0.41, 0]}><cylinderGeometry args={[0.17, 0.17, 0.045, 8]} /><meshStandardMaterial color="#435862" /></mesh>
    </> : asset.type === "directory-board" || asset.type === "guard-booth" || asset.type === "gate-scanner" ? <>
      <mesh position={[0, 0.26, 0]}><boxGeometry args={[0.48, 0.46, 0.08]} /><meshStandardMaterial color={asset.type === "directory-board" ? "#246187" : "#9daab0"} /></mesh>
      {asset.type === "directory-board" && <mesh position={[0, 0.27, 0.046]}><boxGeometry args={[0.34, 0.29, 0.012]} /><meshStandardMaterial color="#f6f4e9" /></mesh>}
    </> : asset.type === "fountain" ? <>
      <mesh position={[0, 0.12, 0]}><cylinderGeometry args={[0.42, 0.45, 0.24, 12]} /><meshStandardMaterial color="#aab8bd" /></mesh>
      <mesh position={[0, 0.3, 0]}><cylinderGeometry args={[0.23, 0.23, 0.12, 12]} /><meshStandardMaterial color="#78aebe" /></mesh>
      <mesh position={[0, 0.46, 0]}><sphereGeometry args={[0.12, 8, 6]} /><meshStandardMaterial color="#8bc7d3" roughness={0.25} /></mesh>
    </> : <mesh position={[0, 0.18, 0]}>{isCone ? <coneGeometry args={[0.22, 0.42, 7]} /> : <boxGeometry args={[0.38, 0.34, 0.38]} />}<meshStandardMaterial color={color} roughness={0.74} /></mesh>}
    </group>
    {isSuhayHusay && selectedLandmark && <mesh name="suhay-husay-selection-ring" rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.46, 0]}><ringGeometry args={[0.48, 0.515, 32]} /><meshBasicMaterial color="#2563eb" transparent opacity={0.9} side={THREE.DoubleSide} /></mesh>}
    {(isSuhayHusay ? hovered || selectedLandmark : Boolean(asset.name)) && <Html position={[0, isSuhayHusay ? 1.04 : 0.75, 0]} center style={{ pointerEvents: "none" }}><span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold shadow ${isSuhayHusay && selectedLandmark ? "bg-blue-700 text-white" : "bg-slate-900/75 text-white"}`}>{isSuhayHusay ? "Suhay Husay" : asset.name}</span></Html>}
  </group>;
}

function GenericMonumentModel() {
  return <group>
    <mesh position={[0, 0.12, 0]} castShadow><boxGeometry args={[0.72, 0.24, 0.58]} /><meshStandardMaterial color="#7b8588" roughness={0.88} flatShading /></mesh>
    <mesh position={[0, 0.38, 0]} rotation={[0, Math.PI / 4, 0]} castShadow><cylinderGeometry args={[0.22, 0.32, 0.3, 5]} /><meshStandardMaterial color="#8e9696" roughness={0.84} flatShading /></mesh>
    <mesh position={[0, 0.78, 0]} castShadow><octahedronGeometry args={[0.22, 0]} /><meshStandardMaterial color="#777f82" roughness={0.82} flatShading /></mesh>
  </group>;
}

function sameTransitionEntrance(entrance: ReadonlyOutdoorCampus["entrances"][number], building: ReadonlyOutdoorCampus["buildings"][number], active: NonNullable<StudentCampus3DRendererProps["activeTransition"]>) {
  if (active.entranceId === entrance.id) return true;
  if (active.buildingId && active.buildingId !== entrance.buildingId) return false;
  const point = entrance.legacyPosition ?? entranceWorldPosition(building, entrance);
  return Math.hypot(point.x - active.point.x, point.y - active.point.y) <= 8;
}

function ExteriorFireEscapeModel({ facadeWidth, outwardDepth, levels, suppressGroundDoor }: {
  facadeWidth: number; outwardDepth: number; levels: ReturnType<typeof campusFireEscapeLevels>; suppressGroundDoor: boolean;
}) {
  const steel = "#3f5058";
  const tread = "#788991";
  const railHeight = 0.1;
  const runLength = Math.max(0.26, Math.min(0.68, facadeWidth * 0.66));
  const landingWidth = Math.max(0.14, Math.min(0.22, outwardDepth * 0.46));
  const landingDepth = Math.max(0.075, Math.min(0.13, outwardDepth * 0.26));
  const treadDepth = Math.max(0.065, Math.min(0.11, outwardDepth * 0.28));
  const landingZ = landingDepth / 2 + 0.018;
  const stairZ = landingZ + landingDepth / 2 + treadDepth / 2;
  const centers = levels.map((_, index) => index % 2 === 0 ? -runLength / 2 : runLength / 2);
  const doorWidth = Math.max(0.105, Math.min(0.18, facadeWidth * 0.34));
  const doorHeight = 0.28;
  const firstServedLevelIndex = levels.findIndex((level) => level.served);
  const renderFlight = (index: number) => {
    const lower = levels[index];
    const upper = levels[index + 1];
    const fromX = centers[index];
    const toX = centers[index + 1];
    const run = Math.abs(toX - fromX);
    const rise = Math.abs(upper.elevation - lower.elevation);
    const count = Math.max(3, Math.min(8, Math.ceil(Math.max(run / 0.08, rise / 0.055))));
    return <Fragment key={"flight-" + index}>
      {Array.from({ length: count }, (_, step) => {
        const t = (step + 0.5) / count;
        const x = fromX + (toX - fromX) * t;
        const y = lower.elevation + (upper.elevation - lower.elevation) * t;
        return <mesh key={"tread-" + step} position={[x, y - 0.012, stairZ]} castShadow receiveShadow>
          <boxGeometry args={[run / count + 0.012, 0.024, treadDepth]} />
          <meshStandardMaterial color={tread} roughness={0.64} metalness={0.26} />
        </mesh>;
      })}
      {[-1, 1].map((side) => {
        const z = stairZ + side * treadDepth * 0.56;
        const railY = (t: number) => lower.elevation + (upper.elevation - lower.elevation) * t + railHeight;
        return <Fragment key={"flight-rail-" + side}>
          <SculptureLimb from={[fromX, railY(0), z]} to={[toX, railY(1), z]} radius={0.0065} color={steel} />
          {[0, 1].map((end) => {
            const x = end ? toX : fromX;
            const y = end ? railY(1) : railY(0);
            return <SculptureLimb key={end} from={[x, y - railHeight, z]} to={[x, y, z]} radius={0.0055} color={steel} />;
          })}
        </Fragment>;
      })}
    </Fragment>;
  };

  if (!levels.length) return null;
  return <group name="student-3d-exterior-fire-escape">
    {levels.map((level, index) => {
      const x = centers[index] ?? 0;
      const y = level.elevation;
      const connectsDoor = level.served && !(index === 0 && suppressGroundDoor);
      return <Fragment key={"level-" + level.floorIndex}>
        <mesh position={[x / 2, y - 0.016, landingZ]} castShadow receiveShadow>
          <boxGeometry args={[Math.max(landingWidth, Math.abs(x) + landingWidth * 0.45), 0.032, landingDepth]} />
          <meshStandardMaterial color="#677982" roughness={0.7} metalness={0.24} />
        </mesh>
        <mesh position={[x, y - 0.014, stairZ]} castShadow receiveShadow>
          <boxGeometry args={[landingWidth, 0.028, treadDepth + landingDepth * 0.35]} />
          <meshStandardMaterial color="#778990" roughness={0.68} metalness={0.25} />
        </mesh>
        {connectsDoor && <group name="student-3d-emergency-access-door" userData={{ servedLevel: level.floorIndex }}>
          <mesh position={[0, y + doorHeight / 2, -0.012]} castShadow>
            <boxGeometry args={[doorWidth, doorHeight, 0.025]} />
            <meshStandardMaterial color="#3b454a" roughness={0.68} metalness={0.34} />
          </mesh>
          {[-1, 1].map((side) => <SculptureLimb key={"frame-" + side} from={[side * (doorWidth / 2 + 0.009), y, -0.004]} to={[side * (doorWidth / 2 + 0.009), y + doorHeight + 0.01, -0.004]} radius={0.006} color="#c7d0d3" />)}
          <mesh position={[0, y + doorHeight * 0.62, 0.008]}><boxGeometry args={[doorWidth * 0.76, 0.012, 0.012]} /><meshStandardMaterial color="#dce3e4" metalness={0.5} roughness={0.38} /></mesh>
          <mesh position={[0, y + doorHeight + 0.035, 0.002]}><boxGeometry args={[doorWidth * 0.66, 0.035, 0.018]} /><meshStandardMaterial color="#167a53" roughness={0.72} /></mesh>
          {index === firstServedLevelIndex && <Html position={[0, y + doorHeight + 0.035, 0.016]} center transform sprite distanceFactor={7} style={{ pointerEvents: "none", whiteSpace: "nowrap" }}>
            <span className="rounded-[2px] bg-emerald-700 px-1 text-[7px] font-black tracking-wide text-white shadow">EXIT</span>
          </Html>}
        </group>}
      </Fragment>;
    })}
    {levels.slice(0, -1).map((_, index) => renderFlight(index))}
    {levels.length > 1 && [-1, 1].map((side) => <SculptureLimb key={"support-" + side} from={[side * runLength * 0.48, 0, stairZ + treadDepth * 0.56]} to={[side * runLength * 0.48, levels[levels.length - 1].elevation, stairZ + treadDepth * 0.56]} radius={0.008} color={steel} />)}
  </group>;
}
function EntranceLayer({ campus, hasRoute, exploreTransitionsEnabled, activeTransition, onEnterBuilding, shouldSuppressClick }: { campus: ReadonlyOutdoorCampus; hasRoute: boolean; exploreTransitionsEnabled?: boolean; activeTransition?: StudentCampus3DRendererProps["activeTransition"]; onEnterBuilding?: (buildingId: string) => void; shouldSuppressClick: () => boolean }) {
  const physicalEntrances = useMemo(
    () => resolveCampusEntrancePresentations(campus.entrances, campus.buildings, canEnterOutdoorBuilding),
    [campus.buildings, campus.entrances],
  );
  const physicalDoorPoints = physicalEntrances.map(({ entrance }) => {
    const building = campus.buildings.find((item) => item.id === entrance.buildingId);
    return building ? { buildingId: building.id, point: entrance.legacyPosition ?? entranceWorldPosition(building, entrance) } : null;
  }).filter((item): item is { buildingId: string; point: Pt } => Boolean(item));
  return <group>{physicalEntrances.map(({ entrance, canEnterFromCampus }) => {
    const building = campus.buildings.find((item) => item.id === entrance.buildingId);
    if (!building) return null;
    const world = entrance.legacyPosition ? entrance.legacyPosition : entranceWorldPosition(building, entrance);
    const isActiveDoor = Boolean(activeTransition && sameTransitionEntrance(entrance, building, activeTransition));
    const p = campusMapPointToWorld(world, STUDENT_CAMPUS_3D_GROUND_EPSILON);
    const angle = entrance.legacyPosition ? 0 : campusEntranceFacingYaw((world as { angle?: number }).angle);
    const buildingName = building.code || building.name;
    const emergencyDoor = campus.exteriorEmergencyStairs.some((stair) => {
      if (stair.buildingId !== building.id) return false;
      if (!campusFireEscapeLevels(building.floors, stair.servedFloorIds, 1).some((level) => level.floorIndex === 0 && level.served)) return false;
      const stairPoint = entranceWorldPosition(building, stair.attachment);
      return Math.hypot(stairPoint.x - world.x, stairPoint.y - world.y) <= 2.5;
    });
    return <group key={entrance.id} position={[p.x, p.y, p.z]} rotation={[0, angle, 0]}>
      {/* One quiet physical doorway is always drawn, regardless of whether
          Campus context permits an action at this authored door. */}
      <group name="student-3d-physical-entrance" userData={{ entranceId: entrance.id }}>
        <mesh position={[0, 0.17, 0.025]}><boxGeometry args={[emergencyDoor ? 0.2 : 0.19, 0.32, 0.045]} /><meshStandardMaterial color={emergencyDoor ? "#3b454a" : "#324754"} roughness={0.85} metalness={emergencyDoor ? 0.28 : 0} /></mesh>
        <mesh position={[-0.115, 0.18, 0.045]}><boxGeometry args={[0.035, 0.36, 0.075]} /><meshStandardMaterial color="#e8edf0" roughness={0.76} /></mesh>
        <mesh position={[0.115, 0.18, 0.045]}><boxGeometry args={[0.035, 0.36, 0.075]} /><meshStandardMaterial color="#e8edf0" roughness={0.76} /></mesh>
        <mesh position={[0, 0.35, 0.045]}><boxGeometry args={[0.265, 0.035, 0.075]} /><meshStandardMaterial color="#d6e0e5" roughness={0.7} /></mesh>
        <mesh position={[0.055, 0.17, 0.052]}><boxGeometry args={[0.012, 0.055, 0.012]} /><meshStandardMaterial color="#f2c875" metalness={0.25} roughness={0.38} /></mesh>
        {emergencyDoor && <>
          <mesh position={[0, 0.21, 0.083]}><boxGeometry args={[0.145, 0.015, 0.015]} /><meshStandardMaterial color="#dce3e4" metalness={0.48} roughness={0.38} /></mesh>
          <mesh position={[0, 0.405, 0.048]}><boxGeometry args={[0.13, 0.035, 0.018]} /><meshStandardMaterial color="#167a53" roughness={0.72} /></mesh>
          <Html position={[0, 0.405, 0.061]} center transform sprite distanceFactor={7} style={{ pointerEvents: "none", whiteSpace: "nowrap" }}><span className="rounded-[2px] bg-emerald-700 px-1 text-[7px] font-black tracking-wide text-white shadow">EXIT</span></Html>
        </>}
      </group>
      {canEnterFromCampus && !isActiveDoor && <Html position={[0, 0.43, 0.08]} center distanceFactor={12} zIndexRange={hasRoute ? [25, 0] : [55, 0]}>
        <div className="group/entrance relative">
          {hasRoute && !exploreTransitionsEnabled
            ? <span aria-label={`Entrance at ${buildingName}`} title={`Enter ${buildingName} building`} className="grid h-6 w-6 place-items-center rounded-full border border-white/70 bg-blue-800/45 text-white/85"><DoorOpen className="h-3 w-3" /></span>
            : <button type="button" aria-label={`Enter ${buildingName} building`} onClick={(event) => { event.stopPropagation(); if (!shouldSuppressClick()) onEnterBuilding?.(building.id); }} className="group/entry-button grid h-11 w-11 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"><span className="grid h-7 w-7 place-items-center rounded-full border border-white/90 bg-white/90 text-blue-700 shadow-sm transition group-hover/entry-button:bg-blue-700 group-hover/entry-button:text-white group-focus-visible/entry-button:bg-blue-700 group-focus-visible/entry-button:text-white"><DoorOpen className="h-3.5 w-3.5" /></span></button>}
          <span className={`pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/80 bg-blue-800 px-2.5 py-1 text-[11px] font-bold text-white opacity-0 shadow-md transition-opacity group-hover/entrance:opacity-100 group-focus-within/entrance:opacity-100 ${hasRoute && !exploreTransitionsEnabled ? "hidden" : ""}`}>Enter {buildingName} building</span>
        </div>
      </Html>}
    </group>;
  })}
    {campus.exteriorEmergencyStairs.map((stair) => {
      if (stair.visible === false) return null;
      const building = campus.buildings.find((item) => item.id === stair.buildingId);
      if (!building) return null;
      const world = entranceWorldPosition(building, stair.attachment);
      const hasAuthoredDoor = physicalDoorPoints.some((door) => door.buildingId === building.id
        && Math.hypot(door.point.x - world.x, door.point.y - world.y) <= 2.5);
      const p = campusMapPointToWorld(world, STUDENT_CAMPUS_3D_GROUND_EPSILON);
      const visual = exteriorEmergencyStairVisualDimensions(stair);
      const isSideFacade = stair.attachment.edge === "left" || stair.attachment.edge === "right";
      const facadeWidth = Math.max(0.28, campusMapSizeToWorld(isSideFacade ? visual.height : visual.width));
      const outwardDepth = Math.max(0.24, campusMapSizeToWorld(isSideFacade ? visual.width : visual.height));
      const angle = campusEntranceFacingYaw(world.angle);
      const floorCount = Math.max(1, building.floors?.length ?? 1);
      const buildingHeight = 0.38 + floorCount * 0.15;
      const levels = campusFireEscapeLevels(building.floors, stair.servedFloorIds, buildingHeight / floorCount);
      return <group key={stair.id} position={[p.x, p.y, p.z]} rotation={[0, angle, 0]}>
        <ExteriorFireEscapeModel facadeWidth={facadeWidth} outwardDepth={outwardDepth} levels={levels} suppressGroundDoor={hasAuthoredDoor} />
      </group>;
    })}
  </group>;
}
const MemoEntranceLayer = memo(EntranceLayer);

function EventMarker({ venue, selected, onSelectVenue, shouldSuppressClick }: { venue: EventVenue; selected: boolean; onSelectVenue: (venueId: string) => void; shouldSuppressClick: () => boolean }) {
  const position = worldTuple(venue, 0.36);
  const count = venue.eventIds.length;
  return <group position={position}>
    <mesh position={[0, -0.25, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[selected ? 0.2 : 0.15, selected ? 0.24 : 0.19, 24]} /><meshBasicMaterial color={selected ? "#2563eb" : "#f59e0b"} transparent opacity={0.72} side={THREE.DoubleSide} /></mesh>
    <Html center distanceFactor={14} zIndexRange={[80, 0]}>
      <button type="button" aria-label={`${count} ${count === 1 ? "event" : "events"} at ${venue.label}`} onClick={(event) => { event.stopPropagation(); if (!shouldSuppressClick()) onSelectVenue(venue.id); }} className={`relative flex h-11 min-w-11 items-center justify-center rounded-full border-2 border-white text-white shadow-lg transition-transform ${selected ? "scale-110 bg-blue-700 ring-4 ring-blue-400/30" : "bg-amber-600 hover:scale-105"}`}>
        <MapPin className="h-5 w-5 fill-white/20" />
        {count > 1 && <span className="absolute -right-2 -top-1 grid h-5 min-w-5 place-items-center rounded-full border-2 border-white bg-slate-900 px-1 text-[10px] font-extrabold text-white">{count}</span>}
      </button>
    </Html>
  </group>;
}
const MemoEventMarker = memo(EventMarker);

function ActiveTransitionLabel({ label, onActivate, reducedMotion, shouldSuppressClick }: { label: string; onActivate: () => void; reducedMotion?: boolean; shouldSuppressClick: () => boolean }) {
  const { camera, size } = useThree();
  const anchorRef = useRef<THREE.Group>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const projected = useRef(new THREE.Vector3());

  useFrame(() => {
    const anchor = anchorRef.current;
    const button = buttonRef.current;
    if (!anchor || !button) return;
    anchor.getWorldPosition(projected.current);
    projected.current.y += 0.8;
    projected.current.project(camera);
    const anchorX = (projected.current.x * 0.5 + 0.5) * size.width;
    button.style.maxWidth = `${Math.max(80, size.width - 24)}px`;
    const labelWidth = button.getBoundingClientRect().width;
    const minCenter = labelWidth / 2 + 12;
    const maxCenter = size.width - labelWidth / 2 - 12;
    const clampedCenter = Math.max(minCenter, Math.min(maxCenter, anchorX));
    button.style.setProperty("--active-transition-shift-x", `${clampedCenter - anchorX}px`);
  });

  return <group ref={anchorRef}>
    <Html position={[0, 0.8, 0]} center zIndexRange={[100, 0]}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        title={label}
        onClick={(event) => { event.stopPropagation(); if (!shouldSuppressClick()) onActivate(); }}
        style={{ transform: "translate(var(--active-transition-shift-x, 0px), calc(-100% - 8px))", maxWidth: "calc(100vw - 24px)" }}
        className={`inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full border border-white bg-blue-700 px-3 text-xs font-extrabold text-white shadow-[0_8px_22px_rgba(15,23,42,.32)] ring-2 ring-blue-300/55 ${reducedMotion ? "" : "animate-pulse"}`}
      >
        <DoorOpen className="h-4 w-4 shrink-0" />{label}
      </button>
    </Html>
  </group>;
}

function ActiveTransitionMarker({ transition, reducedMotion, shouldSuppressClick }: { transition: NonNullable<StudentCampus3DRendererProps["activeTransition"]>; reducedMotion?: boolean; shouldSuppressClick: () => boolean }) {
  const point = worldTuple(transition.point, STUDENT_CAMPUS_3D_GROUND_EPSILON);
  return <group position={point}>
    <mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.17, 0.22, 24]} /><meshBasicMaterial color="#1769e0" transparent opacity={0.82} side={THREE.DoubleSide} /></mesh>
    <mesh position={[0, 0.24, 0]}><cylinderGeometry args={[0.012, 0.012, 0.46, 8]} /><meshStandardMaterial color="#1769e0" transparent opacity={0.72} /></mesh>
    <ActiveTransitionLabel label={transition.label} onActivate={transition.onActivate} reducedMotion={reducedMotion} shouldSuppressClick={shouldSuppressClick} />
  </group>;
}

function WorldCamera({ campus, humanPoint, walkProgressRef, routePoints, routePreview, focusPoint, focusNonce, selectedBuildingId, selectedPlaceId, followMode, followPlaying, freeLook, followSessionKey, reducedMotion, orbitRef, recenterNonce, surfaceRef }: Pick<StudentCampus3DRendererProps, "campus" | "humanPoint" | "walkProgressRef" | "routePoints" | "routePreview" | "focusPoint" | "focusNonce" | "selectedBuildingId" | "selectedPlaceId" | "followMode" | "followPlaying" | "freeLook" | "followSessionKey" | "reducedMotion"> & { orbitRef: RefObject<any>; recenterNonce: number; surfaceRef: RefObject<HTMLCanvasElement | null> }) {
  const { invalidate, camera, size } = useThree();
  const initialized = useRef(false);
  const owner = useRef<"fit" | "focus" | "follow" | "user" | "recenter">("fit");
  const tween = useRef<{ startTarget: THREE.Vector3; endTarget: THREE.Vector3; startPosition: THREE.Vector3; endPosition: THREE.Vector3; startedAt: number; duration: number } | null>(null);
  const previousDamping = useRef<boolean | null>(null);
  const cameraTime = useRef(0);
  const lastHuman = useRef<Pt>({ x: Number.NaN, y: Number.NaN });
  const desired = useRef(new THREE.Vector3());
  const focusKey = useRef("");
  const enteredFollow = useRef(false);
  const route = routePoints ?? [];
  const sampleRoute = useMemo(() => createRoutePointSampler(route), [route]);
  const routeFrameKey = useMemo(() => routePreview && route.length > 1
    ? route.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(";")
    : "", [route, routePreview]);
  const lastRouteFrameKey = useRef("");
  const selectionKey = selectedBuildingId
    ? `building:${selectedBuildingId}`
    : selectedPlaceId
      ? `place:${selectedPlaceId}`
      : focusPoint
        ? `point:${focusPoint.x.toFixed(1)}:${focusPoint.y.toFixed(1)}`
        : "";
  const routePreviewFocusBaseline = useRef({ active: false, focusNonce: focusNonce ?? 0, selectionKey: "" });
  if (routePreview && !routePreviewFocusBaseline.current.active) {
    routePreviewFocusBaseline.current = { active: true, focusNonce: focusNonce ?? 0, selectionKey };
  } else if (!routePreview && routePreviewFocusBaseline.current.active) {
    routePreviewFocusBaseline.current.active = false;
  }
  const samplePointRef = useRef<Pt>({ x: 0, y: 0 });
  const routeFramePose = useCallback(() => {
    if (route.length < 2) return null;
    // Preview mirrors the 2D map's full-campus framing. Focusing only the
    // route's first point (or a planner-selected endpoint) clips the rest of
    // the route behind mobile panels and makes Preview feel like a new map.
    const content = campusContentBounds(campus);
    const worldCenter = campusMapPointToWorld(content);
    const target = new THREE.Vector3(worldCenter.x, 0, worldCenter.z);
    const perspective = camera as THREE.PerspectiveCamera;
    const aspect = Math.max(0.35, size.width / Math.max(1, size.height));
    const tangent = Math.tan(THREE.MathUtils.degToRad(perspective.fov ?? 44) / 2);
    const distance = Math.max(
      campusMapSizeToWorld(content.width) / (2 * tangent * aspect),
      campusMapSizeToWorld(content.height) / (2 * tangent),
    ) * 1.5;
    const offsetDirection = new THREE.Vector3(0, 0.74, 0.673).normalize();
    const canvas = surfaceRef.current;
    const rect = canvas?.getBoundingClientRect();
    const surface = canvas?.closest<HTMLElement>("[data-testid='student-map-surface']");
    const overlays = surface ? Array.from(surface.querySelectorAll<HTMLElement>(
      ".map-layer-building-sheet, [data-testid='student-selected-place-card'], [data-testid='mobile-building-sheet'], [data-testid='event-map-panel'], [data-testid='route-planner-dialog'], [data-testid='collapsed-route-card'], [data-testid='mobile-active-route-dock'], [data-testid='student-floor-picker'], [data-map-search-header='true']",
    )).filter((item) => {
      const panel = item.getBoundingClientRect();
      const style = getComputedStyle(item);
      return style.display !== "none" && style.visibility !== "hidden" && panel.width > 0 && panel.height > 0;
    }).map((item) => item.getBoundingClientRect()) : [];
    if (rect) {
      const safeCenter = student3dSafeFocusCenter(rect, overlays);
      const verticalSpan = 2 * distance * Math.tan(THREE.MathUtils.degToRad(perspective.fov ?? 44) / 2);
      const unitPerPx = verticalSpan / Math.max(1, rect.height);
      const offsetX = safeCenter.x - (rect.left + rect.width / 2);
      const offsetY = safeCenter.y - (rect.top + rect.height / 2);
      const viewDirection = offsetDirection.clone().negate();
      const right = new THREE.Vector3().crossVectors(viewDirection, camera.up).normalize();
      target.addScaledVector(right, -offsetX * unitPerPx).addScaledVector(camera.up, offsetY * unitPerPx);
    }
    return { target, position: target.clone().add(offsetDirection.multiplyScalar(distance)) };
  }, [camera, campus, route, size.height, size.width, surfaceRef]);
  const focusTarget = useCallback((point: Pt) => {
    const selectedBuilding = campus.buildings.find((building) => building.id === selectedBuildingId);
    const selectedPlace = campus.markers.find((marker) => marker.id === selectedPlaceId);
    const isSuhayHusay = Boolean(selectedPlace && /suhay\s*(?:ng\s*)?husay/i.test(`${selectedPlace.id} ${selectedPlace.name} ${selectedPlace.type}`));
    const suhayAssetId = isSuhayHusay ? resolveSuhayHusayDecorAssetId(campus.decorAssets) : null;
    const suhayAsset = suhayAssetId ? campus.decorAssets.find((asset) => asset.id === suhayAssetId) : undefined;
    const physicalFocusPoint = isSuhayHusay && suhayAsset ? { x: suhayAsset.x, y: suhayAsset.y } : point;
    const buildingHeight = selectedBuilding ? 0.38 + Math.max(1, selectedBuilding.floors?.length ?? 1) * 0.15 : 0;
    const isGate = selectedPlace?.type === "gate";
    const landmarkHeight = isGate ? 1.52 : isSuhayHusay ? 1.05 : /monument|suhay|landmark/i.test(`${selectedPlace?.name ?? ""} ${selectedPlace?.type ?? ""}`) ? 2.0 : 0.8;
    const width = selectedBuilding
      ? campusMapSizeToWorld(selectedBuilding.width)
      : isGate ? 1.72 : isSuhayHusay ? 0.92 : campusMapSizeToWorld(selectedPlace?.width ?? 72);
    const depth = selectedBuilding
      ? campusMapSizeToWorld(selectedBuilding.height)
      : isGate ? 0.42 : isSuhayHusay ? 0.72 : campusMapSizeToWorld(selectedPlace?.height ?? 58);
    const height = buildingHeight || landmarkHeight;
    const source = campusMapPointToWorld(physicalFocusPoint, Math.max(0.3, height * 0.52));
    const next = new THREE.Vector3(source.x, source.y, source.z);
    const canvas = surfaceRef.current;
    const rect = canvas?.getBoundingClientRect();
    const surface = canvas?.closest<HTMLElement>("[data-testid='student-map-surface']");
    const overlays = surface ? Array.from(surface.querySelectorAll<HTMLElement>(
      ".map-layer-building-sheet, [data-testid='student-selected-place-card'], [data-testid='mobile-building-sheet'], [data-testid='event-map-panel'], [data-testid='route-planner-dialog'], [data-testid='collapsed-route-card'], [data-testid='mobile-active-route-dock'], [data-testid='student-floor-picker'], [data-map-search-header='true']",
    )).filter((item) => {
      const panel = item.getBoundingClientRect();
      const style = getComputedStyle(item);
      return style.display !== "none" && style.visibility !== "hidden" && panel.width > 0 && panel.height > 0;
    }).map((item) => item.getBoundingClientRect()) : [];
    const safeCenter = rect
      ? student3dSafeFocusCenter(rect, overlays)
      : { x: size.width / 2, y: size.height / 2 };
    const perspective = camera as THREE.PerspectiveCamera;
    const distance = student3dFocusDistance(
      width,
      depth,
      height,
      perspective.fov ?? 44,
      size.width / Math.max(1, size.height),
      { padding: selectedBuilding ? 1.55 : 1.45, min: selectedBuilding ? 8 : 6.5, max: selectedBuilding ? 19 : 14 },
    );
    // Keep one stable elevated three-quarter direction for architectural
    // selections. Move the look target only enough to center it in the usable
    // area left after panels, using a single measurement at selection time.
    const offsetDirection = new THREE.Vector3(0.43, 0.72, 0.55).normalize();
    const viewDirection = offsetDirection.clone().negate();
    const right = new THREE.Vector3().crossVectors(viewDirection, camera.up).normalize();
    const verticalSpan = 2 * distance * Math.tan(THREE.MathUtils.degToRad(perspective.fov ?? 44) / 2);
    const unitPerPx = verticalSpan / Math.max(1, rect?.height ?? size.height);
    const offsetX = safeCenter.x - ((rect?.left ?? 0) + (rect?.width ?? size.width) / 2);
    const offsetY = safeCenter.y - ((rect?.top ?? 0) + (rect?.height ?? size.height) / 2);
    next.addScaledVector(right, -offsetX * unitPerPx).addScaledVector(camera.up, offsetY * unitPerPx);
    const position = next.clone().add(offsetDirection.multiplyScalar(distance));
    return { target: next, position, distance };
  }, [camera, campus.buildings, campus.decorAssets, campus.markers, selectedBuildingId, selectedPlaceId, size.height, size.width, surfaceRef]);
  const restoreDamping = useCallback(() => {
    const controls = orbitRef.current;
    if (!controls || previousDamping.current === null) return;
    controls.enableDamping = previousDamping.current;
    previousDamping.current = null;
  }, [orbitRef]);
  const startTween = useCallback((nextTarget: THREE.Vector3, kind: "focus" | "recenter" | "follow", nextPosition?: THREE.Vector3) => {
    const controls = orbitRef.current;
    if (!controls) return;
    tween.current = null;
    restoreDamping();
    owner.current = kind;
    previousDamping.current = Boolean(controls.enableDamping);
    controls.enableDamping = false;
    // Clear any decaying orbit delta before a deterministic camera movement.
    controls.update();
    const currentOffset = controls.object.position.clone().sub(controls.target);
    const endPosition = nextPosition ?? nextTarget.clone().add(currentOffset);
    tween.current = {
      startTarget: controls.target.clone(),
      endTarget: nextTarget,
      startPosition: controls.object.position.clone(),
      endPosition,
      startedAt: cameraTime.current,
      duration: kind === "follow" ? 0.36 : kind === "focus" ? 0.36 : 0.34,
    };
    invalidate();
  }, [invalidate, orbitRef, restoreDamping]);

  useEffect(() => {
    const controls = orbitRef.current;
    if (!controls) return;
    const cancelForUser = () => { tween.current = null; restoreDamping(); owner.current = followPlaying && !freeLook ? "follow" : "user"; };
    controls.addEventListener("start", cancelForUser);
    const resetInput = () => { tween.current = null; restoreDamping(); owner.current = freeLook ? "user" : followPlaying ? "follow" : "fit"; controls.end?.(); };
    window.addEventListener("blur", resetInput);
    const onVisibility = () => { if (document.hidden) resetInput(); else invalidate(); };
    document.addEventListener("visibilitychange", onVisibility);
    const canvas = controls.domElement as HTMLCanvasElement;
    canvas.addEventListener("pointercancel", resetInput, { passive: true });
    return () => { controls.removeEventListener("start", cancelForUser); window.removeEventListener("blur", resetInput); document.removeEventListener("visibilitychange", onVisibility); canvas.removeEventListener("pointercancel", resetInput); };
  }, [followPlaying, freeLook, invalidate, orbitRef, restoreDamping]);

  useEffect(() => {
    const controls = orbitRef.current;
    if (!controls) return;
    // Refit the initial camera when the viewport aspect changes, but keep any
    // user pan/orbit, selection focus, or Follow framing intact.
    if (initialized.current && owner.current !== "fit") return;
    const routePose = routeFrameKey ? routeFramePose() : null;
    if (routePose) {
      controls.target.copy(routePose.target);
      controls.object.position.copy(routePose.position);
      lastRouteFrameKey.current = routeFrameKey;
    } else {
      const content = campusContentBounds(campus);
      const worldCenter = campusMapPointToWorld(content);
      const center = new THREE.Vector3(worldCenter.x, 0, worldCenter.z);
      const perspective = camera as THREE.PerspectiveCamera;
      const tangent = Math.tan(THREE.MathUtils.degToRad(perspective.fov ?? 44) / 2);
      const aspect = Math.max(0.35, size.width / Math.max(1, size.height));
      // Fit the authored campus content, not the often much larger editing canvas.
      const distance = Math.max(campusMapSizeToWorld(content.width) / (2 * tangent * aspect), campusMapSizeToWorld(content.height) / (2 * tangent)) * 1.5;
      controls.target.set(center.x, 0, center.z);
      controls.object.position.set(center.x, distance * 0.74, center.z + distance * 0.673);
    }
    controls.update();
    initialized.current = true;
    owner.current = "fit";
    invalidate();
  }, [camera, campus, focusPoint, invalidate, orbitRef, routeFrameKey, routeFramePose, size.height, size.width]);

  useEffect(() => { enteredFollow.current = false; }, [followSessionKey]);
  useEffect(() => {
    // Follow owns the camera as soon as the canonical session returns to this
    // renderer, including a paused Follow session after Explore inspection.
    // A context renderer is mounted only for its active Campus/Floor, so this
    // also rebinds the camera when a route crosses a scene boundary.
    if (!followMode || freeLook || enteredFollow.current || !orbitRef.current) return;
    tween.current = null;
    const currentPoint = walkProgressRef ? sampleRoute(walkProgressRef.current, samplePointRef.current) : humanPoint;
    const source = currentPoint ? campusMapPointToWorld(currentPoint) : null;
    const target = source ? new THREE.Vector3(source.x, 0, source.z) : desired.current.clone();
    desired.current.copy(target);
    if (currentPoint) { lastHuman.current.x = currentPoint.x; lastHuman.current.y = currentPoint.y; }
    const position = target.clone().add(new THREE.Vector3(0, 8.88, 8.08));
    startTween(target, "follow", position);
    enteredFollow.current = true;
    invalidate();
  }, [followMode, freeLook, followSessionKey, humanPoint, invalidate, orbitRef, sampleRoute, startTween, walkProgressRef]);

  useEffect(() => {
    // Selection focus is a presentation action; it must never take camera
    // ownership away from the live player while Follow is attached.
    if (followMode && !freeLook) return;
    if (!focusPoint) { focusKey.current = ""; return; }
    const initialPreviewSelection = routePreviewFocusBaseline.current;
    if (routePreview && initialPreviewSelection.active
      && initialPreviewSelection.focusNonce === (focusNonce ?? 0)
      && initialPreviewSelection.selectionKey === selectionKey) return;
    const controls = orbitRef.current;
    if (!initialized.current || !controls) return;
    const key = selectedBuildingId
      ? `building:${selectedBuildingId}`
      : selectedPlaceId
        ? `place:${selectedPlaceId}`
        : `route:${focusPoint.x.toFixed(1)}:${focusPoint.y.toFixed(1)}`;
    const requestKey = `${key}:${focusNonce ?? 0}`;
    if (focusKey.current === requestKey) return;
    focusKey.current = requestKey;
    const pose = focusTarget(focusPoint);
    if (reducedMotion) {
      tween.current = null;
      restoreDamping();
      owner.current = "focus";
      controls.target.copy(pose.target);
      controls.object.position.copy(pose.position);
      controls.update();
      invalidate();
      return;
    }
    startTween(pose.target, "focus", pose.position);
  }, [focusNonce, focusPoint, focusTarget, followMode, freeLook, invalidate, orbitRef, reducedMotion, restoreDamping, routePreview, selectedBuildingId, selectedPlaceId, selectionKey, startTween]);
  useEffect(() => {
    if (!routePreview || !routeFrameKey || !initialized.current || !orbitRef.current) {
      if (!routePreview) lastRouteFrameKey.current = "";
      return;
    }
    if (lastRouteFrameKey.current === routeFrameKey) return;
    const controls = orbitRef.current;
    const pose = routeFramePose();
    if (!controls || !pose) return;
    lastRouteFrameKey.current = routeFrameKey;
    if (reducedMotion) {
      tween.current = null;
      restoreDamping();
      owner.current = "focus";
      controls.target.copy(pose.target);
      controls.object.position.copy(pose.position);
      controls.update();
      invalidate();
      return;
    }
    startTween(pose.target, "focus", pose.position);
  }, [invalidate, orbitRef, reducedMotion, restoreDamping, routeFrameKey, routeFramePose, routePreview, startTween]);
  const lastRecenterNonce = useRef(0);
  useEffect(() => {
    const currentPoint = walkProgressRef ? sampleRoute(walkProgressRef.current, samplePointRef.current) : humanPoint;
    if (currentPoint) {
      const source = campusMapPointToWorld(currentPoint);
      desired.current.set(source.x, 0, source.z);
      lastHuman.current.x = currentPoint.x;
      lastHuman.current.y = currentPoint.y;
    }
    if (!recenterNonce || recenterNonce <= lastRecenterNonce.current || !orbitRef.current || !initialized.current) return;
    lastRecenterNonce.current = recenterNonce;
    let target: THREE.Vector3;
    let distance: number;
    if (followMode && currentPoint) {
      const source = campusMapPointToWorld(currentPoint);
      target = new THREE.Vector3(source.x, 0, source.z);
      distance = 12;
    } else if (focusPoint) {
      const selectedBuilding = campus.buildings.find((building) => focusPoint.x >= building.x - 1 && focusPoint.x <= building.x + building.width + 1
        && focusPoint.y >= building.y - 1 && focusPoint.y <= building.y + building.height + 1);
      distance = selectedBuilding
        ? Math.max(8, Math.min(14, campusMapSizeToWorld(Math.max(selectedBuilding.width, selectedBuilding.height)) * 2.25))
        : 10;
      const pose = focusTarget(focusPoint);
      distance = pose.distance;
      target = pose.target;
      startTween(target, "recenter", pose.position);
      return;
    } else {
      const content = campusContentBounds(campus);
      const worldCenter = campusMapPointToWorld(content);
      target = new THREE.Vector3(worldCenter.x, 0, worldCenter.z);
      const perspective = camera as THREE.PerspectiveCamera;
      const tangent = Math.tan(THREE.MathUtils.degToRad(perspective.fov ?? 44) / 2);
      const aspect = Math.max(0.35, size.width / Math.max(1, size.height));
      distance = Math.max(campusMapSizeToWorld(content.width) / (2 * tangent * aspect), campusMapSizeToWorld(content.height) / (2 * tangent)) * 1.5;
    }
    const destinationPosition = target.clone().add(new THREE.Vector3(0, distance * 0.74, distance * 0.673));
    startTween(target, "recenter", destinationPosition);
  }, [camera, campus, focusPoint, focusTarget, followMode, followPlaying, freeLook, humanPoint, orbitRef, recenterNonce, sampleRoute, selectedBuildingId, selectedPlaceId, size.height, size.width, startTween, walkProgressRef]);

  useEffect(() => {
    if (freeLook) {
      tween.current = null;
      enteredFollow.current = false;
      restoreDamping();
      owner.current = "user";
    }
    else if (!followPlaying && owner.current !== "focus" && owner.current !== "recenter") owner.current = "fit";
  }, [followPlaying, freeLook, restoreDamping]);

  useFrame((_, delta) => {
    if (!initialized.current || document.hidden) return;
    const controls = orbitRef.current;
    if (!controls) return;
    const safeDelta = Math.min(delta, 0.05);
    cameraTime.current += safeDelta;
    let tweenOwnsFrame = false;
    if (tween.current && (owner.current === "focus" || owner.current === "recenter" || owner.current === "follow")) {
      const active = tween.current;
      const t = Math.min(1, Math.max(0, (cameraTime.current - active.startedAt) / active.duration));
      const eased = 1 - Math.pow(1 - t, 3);
      controls.target.copy(active.startTarget).lerp(active.endTarget, eased);
      controls.object.position.copy(active.startPosition).lerp(active.endPosition, eased);
      controls.update();
      tweenOwnsFrame = true;
      if (t >= 1) { tween.current = null; restoreDamping(); }
      else invalidate();
    }
    const currentPoint = walkProgressRef ? sampleRoute(walkProgressRef.current, samplePointRef.current) : humanPoint;
    if (!tweenOwnsFrame && followMode && currentPoint && !freeLook) {
      owner.current = "follow";
      if (Math.abs(currentPoint.x - lastHuman.current.x) > 0.015 || Math.abs(currentPoint.y - lastHuman.current.y) > 0.015) {
        lastHuman.current.x = currentPoint.x;
        lastHuman.current.y = currentPoint.y;
        const next = campusMapPointToWorld(currentPoint);
        desired.current.set(next.x, 0, next.z);
      }
      const amount = 1 - Math.exp(-safeDelta * 2.7);
      const previous = controls.target.clone();
      controls.target.x += (desired.current.x - controls.target.x) * amount;
      controls.target.z += (desired.current.z - controls.target.z) * amount;
      controls.object.position.add(controls.target.clone().sub(previous));
      controls.update();
    }
  });
  return null;
}

function FollowHumanMarker({ route, progressRef, initialPoint }: { route: readonly Pt[]; progressRef?: MutableRefObject<number>; initialPoint?: Pt | null }) {
  const groupRef = useRef<THREE.Group>(null);
  const sampleRoute = useMemo(() => createRoutePointSampler(route), [route]);
  const samplePoint = useRef<Pt>({ x: 0, y: 0 });
  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    const point = progressRef ? sampleRoute(progressRef.current, samplePoint.current) : initialPoint;
    if (!point) { group.visible = false; return; }
    const world = campusMapPointToWorld(point, 0.25);
    group.visible = true;
    group.position.set(world.x, world.y, world.z);
  });
  return <group ref={groupRef}>
    <mesh rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.24, 24]} /><meshBasicMaterial color="#1d4ed8" transparent opacity={0.2} /></mesh>
    <mesh><cylinderGeometry args={[0.17, 0.2, 0.12, 24]} /><meshStandardMaterial color="#1769e0" emissive="#1769e0" emissiveIntensity={0.25} /></mesh>
    <mesh position={[0, 0.13, 0]}><sphereGeometry args={[0.065, 12, 8]} /><meshStandardMaterial color="#fff" /></mesh>
  </group>;
}

function Scene(props: StudentCampus3DRendererProps & { surfaceRef: RefObject<HTMLCanvasElement | null>; draggedRef: MutableRefObject<boolean> }) {
  const { campus } = props;
  const worldW = campusMapSizeToWorld(campus.canvasW);
  const worldH = campusMapSizeToWorld(campus.canvasH);
  const route = props.routePoints ?? [];
  const routeEnd = props.destinationPoint ? worldTuple(props.destinationPoint, 0.12) : null;
  const start = props.startPoint ? worldTuple(props.startPoint, 0.12) : null;
  const human = props.humanPoint ? worldTuple(props.humanPoint, 0.25) : null;
  const hasRoute = route.length > 1;
  const orbitRef = useRef<any>(null);
  const pointerStart = useRef<{ x: number; y: number; id: number } | null>(null);
  const pointers = useRef(new Set<number>());
  const propsRef = useRef(props);
  propsRef.current = props;
  const selectBuilding = useCallback((buildingId: string) => propsRef.current.onSelectBuilding?.(buildingId), []);
  const selectPlace = useCallback((placeId: string) => propsRef.current.onSelectPlace?.(placeId), []);
  const enterBuilding = useCallback((buildingId: string) => propsRef.current.onEnterBuilding?.(buildingId), []);
  const inspectEventVenue = useCallback((venueId: string) => propsRef.current.onInspectEventVenue?.(venueId), []);
  const groundColor = props.darkMode ? "#3b4e5c" : (campus.canvasGroundColor || campus.canvasColor || "#dce8dc");

  useEffect(() => {
    const element = orbitRef.current?.domElement as HTMLCanvasElement | undefined;
    if (!element) return;
    const handleDown = (event: PointerEvent) => {
      pointers.current.add(event.pointerId);
      if (event.pointerType === "touch" && pointers.current.size > 1) { pointerStart.current = null; props.draggedRef.current = true; return; }
      pointerStart.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
      props.draggedRef.current = false;
    };
    const handleMove = (event: PointerEvent) => {
      if (!pointerStart.current || pointerStart.current.id !== event.pointerId || props.draggedRef.current || pointers.current.size > 1) return;
      if (crossedStudent3dDragThreshold(pointerStart.current, event)) {
        props.draggedRef.current = true;
        if (!props.followMode) props.onIntentionalPan?.();
      }
    };
    const handleUp = (event: PointerEvent) => { pointers.current.delete(event.pointerId); if (pointerStart.current?.id === event.pointerId) pointerStart.current = null; };
    const reset = () => { pointers.current.clear(); pointerStart.current = null; props.draggedRef.current = false; };
    element.addEventListener("pointerdown", handleDown, { passive: true });
    element.addEventListener("pointermove", handleMove, { passive: true });
    window.addEventListener("pointerup", handleUp, { passive: true });
    window.addEventListener("pointercancel", reset, { passive: true });
    window.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", reset);
    return () => {
      element.removeEventListener("pointerdown", handleDown); element.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp); window.removeEventListener("pointercancel", reset); window.removeEventListener("blur", reset); document.removeEventListener("visibilitychange", reset);
    };
  }, [props.draggedRef, props.followMode, props.onIntentionalPan]);

  useEffect(() => {
    const controls = orbitRef.current;
    if (!controls) return;
    configureStudent3dInputMappings(controls);
  }, []);

  const shouldSuppressClick = useCallback(() => props.draggedRef.current, [props.draggedRef]);

  const routes = useMemo(() => route.length > 1 ? { id: "canonical-route", points: route, width: 12, type: "route" } : null, [route]);
  const markers = props.showEvents ? props.eventVenues ?? EMPTY_EVENT_VENUES : EMPTY_EVENT_VENUES;
  const selectedLocationIds = new Set([props.selectedEventLocationId].filter(Boolean));
  const selectedPlace = campus.markers.find((marker) => marker.id === props.selectedPlaceId);
  const suhayHusaySelected = Boolean(selectedPlace && /suhay\s*(?:ng\s*)?husay/i.test(`${selectedPlace.id} ${selectedPlace.name} ${selectedPlace.type}`));
  return <>
    <color attach="background" args={[props.darkMode ? "#243443" : "#e8efe6"]} />
    <ambientLight intensity={props.darkMode ? 1.1 : 1.22} />
    <directionalLight position={[-5, 12, 8]} intensity={props.darkMode ? 1.12 : 1.52} castShadow={!(typeof window !== "undefined" && window.innerWidth < 768)} shadow-mapSize-width={512} shadow-mapSize-height={512} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[worldW / 2, -0.04, worldH / 2]} receiveShadow>
      <planeGeometry args={[worldW + 1.2, worldH + 1.2]} /><meshStandardMaterial color={groundColor} roughness={1} />
    </mesh>
    {campus.paths.map((path) => <group key={path.id}>
      <MemoPathSurface path={path} halo />
      <MemoPathSurface path={path} />
    </group>)}
    <MemoOutdoorAssetLayer assets={campus.decorAssets} suhayHusaySelected={suhayHusaySelected} />
    {campus.buildings.map((building) => <MemoBuilding key={building.id} building={building} selected={props.selectedBuildingId === building.id} onSelectBuilding={selectBuilding} shouldSuppressClick={shouldSuppressClick} />)}
    <MemoEntranceLayer campus={campus} hasRoute={hasRoute} exploreTransitionsEnabled={props.exploreTransitionsEnabled} activeTransition={props.activeTransition} onEnterBuilding={enterBuilding} shouldSuppressClick={shouldSuppressClick} />
    {campus.markers.map((marker) => {
      const position = worldTuple(marker, STUDENT_CAMPUS_3D_GROUND_EPSILON);
      const selected = props.selectedPlaceId === marker.id;
      const gateRotation = marker.type === "gate" ? campusGateFacingRotation(marker, campus) : 0;
      return <group key={marker.id} position={position} rotation={[0, gateRotation, 0]} onClick={(event) => { event.stopPropagation(); if (event.delta < 7 && !shouldSuppressClick()) selectPlace(marker.id); }}>
        {marker.type === "gate" ? <group name="student-campus-gate-structure">
          <mesh position={[-0.62, 0.58, 0]} castShadow receiveShadow><boxGeometry args={[0.28, 1.16, 0.38]} /><meshStandardMaterial color={selected ? "#8098a1" : "#91a1a4"} roughness={0.78} /></mesh>
          <mesh position={[0.62, 0.58, 0]} castShadow receiveShadow><boxGeometry args={[0.28, 1.16, 0.38]} /><meshStandardMaterial color={selected ? "#8098a1" : "#91a1a4"} roughness={0.78} /></mesh>
          <mesh position={[0, 1.14, 0]} castShadow receiveShadow><boxGeometry args={[1.72, 0.38, 0.42]} /><meshStandardMaterial color="#35677e" roughness={0.66} /></mesh>
          <mesh position={[0, 1.14, 0.216]}><boxGeometry args={[0.82, 0.14, 0.014]} /><meshStandardMaterial color="#f4f7f5" roughness={0.72} /></mesh>
          {[-0.52, 0.52].map((x) => <mesh key={x} position={[x, 1.14, 0.218]}><boxGeometry args={[0.025, 0.2, 0.016]} /><meshStandardMaterial color="#b4c1c3" /></mesh>)}
        <mesh position={[0, 0.48, 0]} onClick={(event) => { event.stopPropagation(); if (event.delta < 7 && !shouldSuppressClick()) selectPlace(marker.id); }}><boxGeometry args={[1.1, 1.08, 0.3]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
        </group> : <mesh><cylinderGeometry args={[0.075, 0.12, 0.28, 16]} /><meshStandardMaterial color={selected ? "#1d4ed8" : marker.color || "#2563eb"} /></mesh>}
        {!(hasRoute && props.activeTransition && selected) && <Html position={[0, marker.type === "gate" ? 1.38 : 0.38, 0]} center zIndexRange={selected ? [60, 0] : [10, 0]} style={{ pointerEvents: "none" }}><div className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-slate-800 shadow whitespace-nowrap">{marker.name}</div></Html>}
      </group>;
    })}
    {markers.map((venue) => <MemoEventMarker key={venue.id} venue={venue} selected={venue.locations.some((location) => selectedLocationIds.has(location.locationId))} onSelectVenue={inspectEventVenue} shouldSuppressClick={shouldSuppressClick} />)}
    {hasRoute && routes && <>
      <MemoPathSurface path={routes} route halo />
      <MemoPathSurface path={routes} route />
      <RouteArrows points={route} reducedMotion={props.reducedMotion} />
    </>}
    {start && (props.showStartMarker ?? true) && <group position={start}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.14, 0.19, 24]} /><meshBasicMaterial color="#22a06b" side={THREE.DoubleSide} /></mesh>
      <Html position={[0, 0.18, 0]} center distanceFactor={12}><span className="grid h-8 w-8 place-items-center rounded-full border-2 border-white bg-emerald-600 text-[13px] font-black text-white shadow-lg">A</span></Html>
    </group>}
    {routeEnd && (props.showDestinationMarker ?? true) && <group position={routeEnd}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.13, 0.17, 24]} /><meshBasicMaterial color="#e44646" transparent opacity={0.62} side={THREE.DoubleSide} /></mesh>
      <Html position={[0, 0.015, 0]} center distanceFactor={10} zIndexRange={[85, 0]}>
        <span className="student-destination-pin block -translate-y-full drop-shadow-md"><MapPin className="h-8 w-8 fill-rose-600 stroke-white stroke-[2.25]" /></span>
      </Html>
    </group>}
    {(props.followMode || human) && <FollowHumanMarker route={route} progressRef={props.walkProgressRef} initialPoint={props.humanPoint} />}
    {props.activeTransition && <ActiveTransitionMarker transition={props.activeTransition} reducedMotion={props.reducedMotion} shouldSuppressClick={shouldSuppressClick} />}
    <OrbitControls ref={orbitRef} makeDefault enableDamping={!props.reducedMotion} dampingFactor={0.08} enablePan={!props.followMode || props.freeLook} enableRotate enableZoom minPolarAngle={0.48} maxPolarAngle={1.2} minDistance={4} maxDistance={80} />
  <WorldCamera campus={campus} humanPoint={props.humanPoint} walkProgressRef={props.walkProgressRef} routePoints={route} routePreview={props.routePreview} focusPoint={props.focusPoint} focusNonce={props.focusNonce} selectedBuildingId={props.selectedBuildingId} selectedPlaceId={props.selectedPlaceId} followMode={props.followMode} followPlaying={props.followPlaying} freeLook={props.freeLook} followSessionKey={props.followSessionKey} reducedMotion={props.reducedMotion} orbitRef={orbitRef} recenterNonce={props.recenterNonce ?? 0} surfaceRef={props.surfaceRef} />
  </>;
}

function StudentCampus3DRenderer(props: StudentCampus3DRendererProps & { onFallback: () => void; recenterNonce?: number }) {
  const [visible, setVisible] = useState(() => typeof document === "undefined" || !document.hidden);
  const invalidateRef = useRef<(() => void) | null>(null);
  const surfaceRef = useRef<HTMLCanvasElement | null>(null);
  const interactionSurfaceRef = useRef<HTMLDivElement>(null);
  const draggedRef = useRef(false);
  useEffect(() => {
    const update = () => { setVisible(!document.hidden); if (!document.hidden) invalidateRef.current?.(); };
    document.addEventListener("visibilitychange", update);
    window.addEventListener("pageshow", update);
    return () => { document.removeEventListener("visibilitychange", update); window.removeEventListener("pageshow", update); };
  }, []);
  useEffect(() => {
    const canvas = surfaceRef.current;
    if (!canvas) return;
    const contextLost = (event: Event) => { event.preventDefault(); props.onFallback(); };
    canvas.addEventListener("webglcontextlost", contextLost);
    return () => canvas.removeEventListener("webglcontextlost", contextLost);
  }, [props.onFallback]);
  return <SceneErrorBoundary onError={props.onFallback}>
    <div ref={interactionSurfaceRef} data-testid="student-campus-3d-surface" className="absolute inset-0 touch-none" style={{ touchAction: "none" }} onContextMenu={(event) => event.preventDefault()} onClickCapture={(event: ReactMouseEvent<HTMLDivElement>) => {
      if (!draggedRef.current) return;
      event.preventDefault(); event.stopPropagation(); draggedRef.current = false;
    }}>
    <Canvas
      data-testid="student-campus-3d-canvas"
      className="absolute inset-0"
      eventSource={interactionSurfaceRef as unknown as MutableRefObject<HTMLElement>}
      dpr={[1, 1.25]}
      shadows={false}
      frameloop={!visible ? "never" : (props.followPlaying || (Boolean(props.routePoints?.length) && !props.reducedMotion)) ? "always" : "demand"}
      camera={{ fov: 44, near: 0.1, far: 150, position: [campusMapSizeToWorld(props.campus.canvasW) / 2, 8, campusMapSizeToWorld(props.campus.canvasH) / 2 + 8] }}
      onCreated={({ gl, invalidate }) => { surfaceRef.current = gl.domElement; invalidateRef.current = invalidate; }}
      fallback={<div>Interactive 3D campus view.</div>}
      gl={{ antialias: false, powerPreference: "low-power", alpha: false, stencil: false }}
    >
      <Suspense fallback={null}><Scene {...props} surfaceRef={surfaceRef} draggedRef={draggedRef} /></Suspense>
    </Canvas>
    <div className="sr-only" aria-label="Campus buildings in 3D view">
      {props.campus.buildings.map((building) => <button key={building.id} type="button" onClick={() => props.onSelectBuilding?.(building.id)}>{building.name}</button>)}
      {props.campus.markers.map((marker) => <button key={marker.id} type="button" onClick={() => props.onSelectPlace?.(marker.id)}>{marker.name}</button>)}
    </div>
    </div>
  </SceneErrorBoundary>;
}

export default memo(StudentCampus3DRenderer);

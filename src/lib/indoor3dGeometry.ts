import type { FloorDoor, FloorFurniture, FloorPlan, FloorRoom, FloorStairs, FloorWall, FloorWindow } from "../components/map-builder/types";
import { exteriorZoneAccessFeatureGeometry } from "./exteriorFloorZones";
import { getFloorShapeRegions } from "./floorShape";
import { roomOutlinePoints } from "./roomShape";

export interface IndoorWallSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number;
  height: number;
  /** Height above the floor surface. Allows lintels/sills to remain over an opening. */
  baseHeight: number;
  color: string;
  sourceIds: string[];
}

export interface IndoorWallOcclusionProbe {
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
  thickness: number;
  baseY: number;
  height: number;
}

export interface IndoorRoomLabelCandidate {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Higher values are protected first: selected/destination > route > ambient. */
  priority: number;
}

export interface IndoorRoomLabelPlacement {
  id: string;
  visible: boolean;
  offsetX: number;
  offsetY: number;
}

export interface IndoorRoomLabelScreenPosition {
  x: number;
  y: number;
  /** CSS correction from the projected anchor to the clamped screen point. */
  anchorOffsetX: number;
  anchorOffsetY: number;
}

/** Keep the label hierarchy stable as the camera moves around a Floor. */
export function indoorRoomLabelPriority(state: { selected?: boolean; destination?: boolean; routeRelevant?: boolean }): number {
  if (state.selected && state.destination) return 7;
  if (state.destination) return 6;
  if (state.selected) return 5;
  if (state.routeRelevant) return 4;
  return 1;
}

/** A first published Floor is grade in Student indoor 3D. Do not draw an
 * authored down-facing stair into empty space unless a higher Floor is shown. */
export function shouldRenderDescendingIndoorStair(
  floorNumber: number,
  direction?: string,
  hasLowerServedFloor = floorNumber > 1,
): boolean {
  return hasLowerServedFloor && (direction === "down" || direction === "reverse");
}

/** A down-only module has no run to render at the lowest served Floor. */
export function shouldRenderIndoorDownStairModule(direction: string | undefined, hasLowerServedFloor: boolean): boolean {
  return direction !== "down" || hasLowerServedFloor;
}

/** Renderer-only opening under a descending stair run. Width and depth are
 * the actual 3D stair dimensions; a small clearance keeps the treads and
 * stringers from intersecting the floor surface without changing authored data. */
export function descendingIndoorStairOpeningPolygon(
  stair: Pick<FloorStairs, "x" | "y" | "width" | "height" | "rotation">,
  visualWidth: number,
  visualDepth: number,
  floorScale: number,
  clearance = 0.08,
): { x: number; y: number }[] {
  const scale = Number.isFinite(floorScale) && floorScale > 0 ? floorScale : 1;
  const width = Math.max(0, visualWidth) / scale + Math.max(0, clearance) / scale;
  const height = Math.max(0, visualDepth) / scale + Math.max(0, clearance) / scale;
  const center = { x: stair.x + stair.width / 2, y: stair.y + stair.height / 2 };
  const angle = -(stair.rotation ?? 0) * Math.PI / 180;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [
    { x: -width / 2, y: -height / 2 },
    { x: width / 2, y: -height / 2 },
    { x: width / 2, y: height / 2 },
    { x: -width / 2, y: height / 2 },
  ].map((point) => ({
    x: center.x + point.x * cosine - point.y * sine,
    y: center.y + point.x * sine + point.y * cosine,
  }));
}

/** Keep selected, destination, and active route labels inside the visible viewport without
 * changing their world anchor. The returned anchor offset must be added to
 * the decluttering offset when applied to the HTML label. */
export function clampIndoorPriorityRoomLabel(
  candidate: Pick<IndoorRoomLabelCandidate, "x" | "y" | "width" | "height" | "priority">,
  viewportWidth: number,
  viewportHeight: number,
  padding = 2,
): IndoorRoomLabelScreenPosition {
  if (candidate.priority < 4) return { x: candidate.x, y: candidate.y, anchorOffsetX: 0, anchorOffsetY: 0 };
  const clampCenter = (value: number, labelSize: number, viewportSize: number) => {
    const half = Math.min(labelSize / 2 + padding, Math.max(1, viewportSize / 2));
    const low = half;
    const high = Math.max(low, viewportSize - half);
    return Math.max(low, Math.min(high, value));
  };
  const x = clampCenter(candidate.x, candidate.width, viewportWidth);
  const y = clampCenter(candidate.y, candidate.height, viewportHeight);
  return { x, y, anchorOffsetX: x - candidate.x, anchorOffsetY: y - candidate.y };
}

/**
 * Place indoor labels in projected screen space. Important route/selection
 * labels win first; other labels try small vertical and horizontal offsets
 * before being hidden when a crowded view leaves no readable placement.
 */
export function layoutIndoorRoomLabels(
  candidates: readonly IndoorRoomLabelCandidate[],
  viewportWidth: number,
  viewportHeight: number,
  padding = 3,
): IndoorRoomLabelPlacement[] {
  const ordered = [...candidates].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  const accepted: Array<{ left: number; top: number; right: number; bottom: number }> = [];
  const placements: IndoorRoomLabelPlacement[] = [];
  const verticalOffsets = [0, -16, 16, -32, 32, -48, 48, -64, 64];
  const horizontalOffsets = [0, -16, 16, -32, 32];
  const intersects = (a: typeof accepted[number], b: typeof accepted[number]) =>
    a.left < b.right + padding && a.right + padding > b.left
    && a.top < b.bottom + padding && a.bottom + padding > b.top;

  for (const item of ordered) {
    const baseLeft = item.x - item.width / 2;
    const baseTop = item.y - item.height / 2;
    const choices = horizontalOffsets.flatMap((offsetX) => verticalOffsets.map((offsetY) => ({ offsetX, offsetY })));
    let chosen: { rect: typeof accepted[number]; offsetX: number; offsetY: number; overlap: number } | null = null;
    for (const { offsetX, offsetY } of choices) {
      const rect = { left: baseLeft + offsetX, top: baseTop + offsetY, right: baseLeft + offsetX + item.width, bottom: baseTop + offsetY + item.height };
      if (rect.left < 2 || rect.top < 2 || rect.right > viewportWidth - 2 || rect.bottom > viewportHeight - 2) continue;
      const overlaps = accepted.some((other) => intersects(rect, other));
      if (!overlaps) { chosen = { rect, offsetX, offsetY, overlap: 0 }; break; }
      if (item.priority >= 4) {
        const overlap = accepted.reduce((sum, other) => {
          const width = Math.max(0, Math.min(rect.right, other.right) - Math.max(rect.left, other.left));
          const height = Math.max(0, Math.min(rect.bottom, other.bottom) - Math.max(rect.top, other.top));
          return sum + width * height;
        }, 0);
        if (!chosen || overlap < chosen.overlap) chosen = { rect, offsetX, offsetY, overlap };
      }
    }
    if (!chosen) {
      placements.push({ id: item.id, visible: false, offsetX: 0, offsetY: 0 });
      continue;
    }
    accepted.push(chosen.rect);
    placements.push({ id: item.id, visible: true, offsetX: chosen.offsetX, offsetY: chosen.offsetY });
  }
  return placements;
}

/** Renderer-only camera-to-focus test for a single solid wall. */
export function indoorWallOccludesFocus(
  camera: { x: number; y: number; z: number },
  focus: { x: number; y: number; z: number },
  wall: IndoorWallOcclusionProbe,
): boolean {
  const rayX = focus.x - camera.x;
  const rayZ = focus.z - camera.z;
  const wallX = wall.endX - wall.startX;
  const wallZ = wall.endZ - wall.startZ;
  const denominator = rayX * wallZ - rayZ * wallX;
  if (Math.abs(denominator) <= 1e-5) return false;
  const offsetX = wall.startX - camera.x;
  const offsetZ = wall.startZ - camera.z;
  const alongRay = (offsetX * wallZ - offsetZ * wallX) / denominator;
  const alongWall = (offsetX * rayZ - offsetZ * rayX) / denominator;
  const wallMargin = wall.thickness / Math.max(1e-5, Math.hypot(wallX, wallZ)) * 0.55;
  if (alongRay <= 0.025 || alongRay >= 0.975 || alongWall < -wallMargin || alongWall > 1 + wallMargin) return false;
  const sightY = camera.y + (focus.y - camera.y) * alongRay;
  return sightY >= wall.baseY - 0.08 && sightY <= wall.baseY + wall.height;
}

const DISTANCE_EPSILON = 1.75;
const ANGLE_EPSILON = 0.025;

export const INDOOR_FLOOR_CAMERA_DIRECTION = [0.78, 1.18, 0.86] as const;
export const DISCOVER_INDOOR_CAMERA_DIRECTION = [0.4, 1.25, 0.95] as const;
/** Portrait Discover views turn the long building axis into screen height so
 * an authored elongated floor uses the available phone viewport naturally. */
export const DISCOVER_INDOOR_PORTRAIT_CAMERA_DIRECTION = [1.2, 2, 0.22] as const;

export function discoverIndoorCameraDirection(aspect: number): readonly [number, number, number] {
  return Number.isFinite(aspect) && aspect < 0.82
    ? DISCOVER_INDOOR_PORTRAIT_CAMERA_DIRECTION
    : DISCOVER_INDOOR_CAMERA_DIRECTION;
}

/** Keep the ordinary indoor camera's three-quarter elevation while turning an
 * elongated floor's long axis toward screen-up on portrait viewports. This
 * reduces the width demanded from a phone's narrow horizontal field of view. */
export function indoorFloorCameraDirectionForViewport(
  floorWidth: number,
  floorHeight: number,
  aspect: number,
  baseDirection: readonly [number, number, number] = INDOOR_FLOOR_CAMERA_DIRECTION,
): readonly [number, number, number] {
  const safeAspect = Number.isFinite(aspect) ? Math.max(0.25, aspect) : 1;
  const width = Math.max(1, floorWidth);
  const height = Math.max(1, floorHeight);
  const elongation = Math.max(0, Math.min(1, (Math.max(width, height) / Math.min(width, height) - 1.03) / 0.45));
  const portrait = Math.max(0, Math.min(1, (0.95 - safeAspect) / 0.4));
  // Compact and square layouts need a modest portrait rotation too. Without
  // it, their default diagonal azimuth spends most of the phone's height on
  // empty space even though the floor itself has room to grow. Elongated
  // layouts continue to receive the full geometry-led adjustment.
  const blend = portrait * (0.35 + elongation * 0.65);
  if (blend <= 0.001) return baseDirection;

  const horizontalLength = Math.hypot(baseDirection[0], baseDirection[2]);
  const baseYaw = Math.atan2(baseDirection[2], baseDirection[0]);
  // Keep a visible three-quarter side while aligning an elongated floor more
  // closely to portrait screen-up. The lower mobile yaw reduces wasted width
  // in the narrow field of view without changing the camera's elevation.
  const sideAngle = Math.atan(0.18);
  const targetYaw = width >= height ? sideAngle : Math.PI / 2 - sideAngle;
  const fullTurn = 2 * Math.PI;
  const yawDelta = ((targetYaw - baseYaw + Math.PI) % fullTurn + fullTurn) % fullTurn - Math.PI;
  const yaw = baseYaw + yawDelta * blend;
  return [Math.cos(yaw) * horizontalLength, baseDirection[1], Math.sin(yaw) * horizontalLength];
}

/** Preserve desktop breathing room and use a tighter margin when the actual
 * usable fit area is portrait. Authored structural bounds already include a
 * small perimeter for doors, stairs and exits. */
export function indoorFloorCameraFitPadding(aspect: number): number {
  return Number.isFinite(aspect) && aspect < 0.82 ? 1.04 : 1.08;
}

export interface IndoorFloorCameraBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

function rotatedFloorRectPoints(x: number, y: number, width: number, height: number, rotation = 0) {
  const radians = rotation * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  return [
    { x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height },
  ].map((point) => ({
    x: centerX + (point.x - centerX) * cosine - (point.y - centerY) * sine,
    y: centerY + (point.x - centerX) * sine + (point.y - centerY) * cosine,
  }));
}

/** Fit to authored room and circulation geometry. Decorative furniture, text,
 * and broad exterior zones must not make a whole Floor appear tiny; those
 * remain rendered, but structural rooms, doors, stairs, exits and floor
 * extensions own the initial frame. Furniture is only a fallback for legacy
 * Floors that have no structural geometry. */
export function indoorFloorCameraBounds(
  floor: FloorPlan,
  fallback: IndoorFloorCameraBounds,
): IndoorFloorCameraBounds {
  const structural: { x: number; y: number }[] = [];
  const furniture: { x: number; y: number }[] = [];
  const addRect = (points: { x: number; y: number }[], x: number, y: number, width: number, height: number, rotation = 0) => {
    if (![x, y, width, height, rotation].every(Number.isFinite)) return;
    points.push(...rotatedFloorRectPoints(x, y, width, height, rotation));
  };
  const addPoint = (points: { x: number; y: number }[], x: number, y: number, padding = 0) => {
    if (![x, y, padding].every(Number.isFinite)) return;
    points.push({ x: x - padding, y: y - padding }, { x: x + padding, y: y + padding });
  };

  floor.rooms.filter((room) => room.visible !== false).forEach((room) => structural.push(...roomOutlinePoints(room)));
  floor.walls.filter((wall) => wall.visible !== false).forEach((wall) => {
    const thickness = Math.max(0, wall.thickness || 0) / 2;
    addPoint(structural, wall.x1, wall.y1, thickness);
    addPoint(structural, wall.x2, wall.y2, thickness);
  });
  floor.paths.forEach((path) => path.points.forEach((point) => addPoint(structural, point.x, point.y, Math.max(0, path.width || 0) / 2)));
  floor.doors.filter((door) => door.visible !== false).forEach((door) => addPoint(structural, door.x, door.y, Math.max(6, door.width / 2)));
  floor.windows.filter((window) => window.visible !== false).forEach((window) => addRect(structural, window.x - window.width / 2, window.y - window.height / 2, window.width, window.height));
  floor.stairs.filter((item) => item.visible !== false).forEach((item) => addRect(structural, item.x, item.y, item.width, item.height, item.rotation));
  floor.ramps.filter((item) => item.visible !== false).forEach((item) => addRect(structural, item.x, item.y, item.width, item.height, item.rotation));
  floor.elevators.filter((item) => item.visible !== false).forEach((item) => addRect(structural, item.x, item.y, item.width, item.height, item.rotation));
  const zones = new Map((floor.exteriorZones ?? []).map((zone) => [zone.id, zone]));
  const canvasW = floor.canvasW ?? 600;
  const canvasH = floor.canvasH ?? 450;
  const addEntranceFeature = (item: { x: number; y: number; width: number; height: number; rotation?: number; visible?: boolean; parentZoneId?: string }) => {
    if (item.visible === false) return;
    const parent = item.parentZoneId ? zones.get(item.parentZoneId) : undefined;
    const geometry = parent ? exteriorZoneAccessFeatureGeometry(parent, item, canvasW, canvasH) : null;
    if (geometry) addRect(structural, geometry.x, geometry.y, geometry.width, geometry.height, geometry.rotation);
    else if (!parent) addRect(structural, item.x, item.y, item.width, item.height, item.rotation);
  };
  floor.entranceRamps?.forEach(addEntranceFeature);
  floor.entranceSteps?.forEach(addEntranceFeature);
  getFloorShapeRegions(floor).slice(1).forEach((region) => addRect(structural, region.x, region.y, region.width, region.height));

  floor.furniture.filter((item) => item.visible !== false).forEach((item) => addRect(furniture, item.x, item.y, item.width, item.height, item.rotation));

  const points = structural.length > 0 ? structural : furniture;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  points.forEach((point) => {
    if (![point.x, point.y].every(Number.isFinite)) return;
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  });
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return fallback;

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const width = Math.max(48, maxX - minX);
  const height = Math.max(48, maxY - minY);
  const paddingX = Math.max(12, width * 0.035);
  const paddingY = Math.max(12, height * 0.035);
  return {
    x: centerX - width / 2 - paddingX,
    y: centerY - height / 2 - paddingY,
    width: width + paddingX * 2,
    height: height + paddingY * 2,
  };
}

/** Return the orbit-camera offset multiplier needed to frame a floor from the
 * renderer's fixed isometric direction. The narrow viewport aspect is part of
 * the calculation so phones do not open on a tiny close-up slice of the plan. */
export function indoorFloorCameraHalfDepth(
  floorWidth: number,
  floorHeight: number,
  aspect: number,
  worldScale = 0.025,
  verticalFovDegrees = 42,
  cameraDirection: readonly [number, number, number] = INDOOR_FLOOR_CAMERA_DIRECTION,
  fitPadding = 1.08,
): number {
  const width = Math.max(1, floorWidth) * worldScale;
  const height = Math.max(1, floorHeight) * worldScale;
  const safeAspect = Math.max(0.25, aspect);
  const verticalFov = verticalFovDegrees * Math.PI / 180;
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * safeAspect);

  // The same authored direction is used for the camera offset in FloorScene.
  const length = Math.hypot(...cameraDirection);
  const direction = cameraDirection.map((value) => value / length);
  const right = [-direction[2], 0, direction[0]];
  const rightLength = Math.hypot(right[0], right[2]);
  right[0] /= rightLength;
  right[2] /= rightLength;
  const up = [-direction[0] * direction[1], 1 - direction[1] * direction[1], -direction[2] * direction[1]];
  const upLength = Math.hypot(up[0], up[1], up[2]);
  const screenUp = up.map((value) => value / upLength);
  const horizontalTangent = Math.tan(horizontalFov / 2);
  const verticalTangent = Math.tan(verticalFov / 2);
  const padding = Math.max(1, fitPadding);
  let requiredDistance = 0;

  if (safeAspect < 0.82) {
    // On portrait screens, independently maximizing the projected width,
    // height, and depth sums extents that belong to different corners. That
    // can pull compact floors much farther away than their actual perspective
    // projection requires. Solve the four floor-bound corners instead:
    // screenX = horizontal / ((distance - towardCamera) * tan(horizontalFov)).
    // This keeps the complete structural rectangle inside the padded view
    // while recovering the space lost by the independent-extents estimate.
    for (const xSign of [-1, 1]) {
      for (const zSign of [-1, 1]) {
        const x = xSign * width / 2;
        const z = zSign * height / 2;
        const horizontal = x * right[0] + z * right[2];
        const vertical = x * screenUp[0] + z * screenUp[2];
        const towardCamera = x * direction[0] + z * direction[2];
        requiredDistance = Math.max(
          requiredDistance,
          Math.abs(horizontal) * padding / horizontalTangent + towardCamera,
          Math.abs(vertical) * padding / verticalTangent + towardCamera,
        );
      }
    }
  } else {
    const horizontalHalfExtent = (Math.abs(right[0]) * width + Math.abs(right[2]) * height) / 2;
    const verticalHalfExtent = (Math.abs(screenUp[0]) * width + Math.abs(screenUp[2]) * height) / 2;
    const depthHalfExtent = (Math.abs(direction[0]) * width + Math.abs(direction[2]) * height) / 2;
    requiredDistance = Math.max(
      horizontalHalfExtent / horizontalTangent,
      verticalHalfExtent / verticalTangent,
    ) + depthHalfExtent;
    requiredDistance *= padding;
  }

  // A smaller physical floor needs a shorter minimum camera distance too;
  // the former fixed 4.5 half-depth left compact layouts visibly undersized.
  return Math.max(2.4, requiredDistance / length);
}

/** The active Floor camera may pull back to 2.7 × this fit depth. Keep its far
 * plane beyond that range, with a small margin for walls and labels, rather
 * than clipping the whole floor at the renderer's old fixed 100-unit plane. */
export function indoorFloorCameraFarPlane(halfDepth: number): number {
  return Math.max(140, Math.max(0, halfDepth) * 4.2 + 20);
}

/** Give renderer-only doors a readable human scale without changing authored
 * dimensions or route data. Wider authored openings are preserved. */
export function indoorDoorVisualWidth(
  door: Pick<FloorDoor, "width" | "doorType" | "direction" | "isEmergencyExit">,
  worldScale = 0.025,
): number {
  const isDouble = door.doorType === "double" || door.direction === "double";
  const minimumMeters = door.isEmergencyExit ? (isDouble ? 1.85 : 1.0) : (isDouble ? 1.42 : 0.82);
  return Math.max(0, door.width || 0, minimumMeters / Math.max(0.0001, worldScale));
}

/** The 2D Student Map supplies exit eligibility; this helper only decides
 * whether its quiet 3D affordance should be visible in the current context. */
export function shouldShowIndoorExitCue(
  door: Pick<FloorDoor, "id" | "visible" | "isEmergencyExit">,
  context: { eligible: ReadonlySet<string>; activeDoorId?: string | null; routeRelevant: ReadonlySet<string> },
): boolean {
  if (door.visible === false || !context.eligible.has(door.id) || context.activeDoorId === door.id) return false;
  if (door.isEmergencyExit && !context.routeRelevant.has(door.id)) return false;
  return true;
}

/** Indoor 3D is a navigation view, so keep authored architectural landmarks
 * and omit repeated small furniture that obscures corridors and route lines. */
export function shouldRenderIndoorLandmarkFurniture(
  item: Pick<FloorFurniture, "assetKey" | "type" | "name" | "category" | "width" | "height" | "visible">,
): boolean {
  if (item.visible === false) return false;
  const identity = `${item.assetKey ?? ""} ${item.type ?? ""} ${item.name ?? ""} ${item.category ?? ""}`
    .toLowerCase().replace(/[_-]+/g, " ");
  if (/\b(chair|seat|stool|student desk|classroom desk|tablet chair|writing arm|lecture row|audience seating|study carrel|toilet|urinal|sink|faucet|stall|mirror|floor drain)\b/.test(identity)) return false;
  if (/\b(reception|front desk|service counter|counter|sofa|couch|lounge|lab workbench|conference table|boardroom|library study table|communal study table|long table|cabinet|shelf|bookcase|locker|server rack|vending machine|lectern|table tennis|clinic bed|landmark)\b/.test(identity)) return true;
  if (/\bstudy table\s*(?:6|8|10|12)\b/.test(identity)) return true;
  const area = Math.abs((item.width || 0) * (item.height || 0));
  return area >= 9000 && /\b(table|desk|workbench|cabinet|shelf)\b/.test(identity);
}

/** Keep authored dining tables and seats visible in the Student 3D canteen.
 * This is a presentation-only exception; navigation geometry never reads it. */
export function shouldRenderStudentCanteenDiningFurniture(
  item: Pick<FloorFurniture, "assetKey" | "type" | "name" | "category" | "visible">,
): boolean {
  if (item.visible === false) return false;
  const identity = `${item.assetKey ?? ""} ${item.type ?? ""} ${item.name ?? ""} ${item.category ?? ""}`
    .toLowerCase().replace(/[_-]+/g, " ");
  if (/\b(table tennis|ping pong)\b/.test(identity)) return false;
  return /\b(table|chair|seat|stool)\b/.test(identity);
}

export interface StudentAuditoriumChairLayout {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  color: string;
  flipX: boolean;
  flipY: boolean;
}

/** Expand authored seating into lightweight visual chair instances. Generic
 * chair types are included only when their authored centers lie inside an
 * auditorium/lecture-hall room polygon on this floor. This uses floor geometry
 * as context instead of relying on a building name or display/floor number. */
export function deriveStudentAuditoriumChairLayouts(
  items: readonly FloorFurniture[],
  auditoriumRoomPolygons: readonly (readonly { x: number; y: number }[])[] = [],
): StudentAuditoriumChairLayout[] {
  const layouts: StudentAuditoriumChairLayout[] = [];
  for (const item of items) {
    if (item.visible === false) continue;
    const type = `${item.assetKey ?? ""} ${item.type ?? ""}`.toLowerCase().replace(/[_-]+/g, " ").trim();
    const identity = `${type} ${item.name ?? ""} ${item.category ?? ""}`.toLowerCase().replace(/[_-]+/g, " ");
    const groupedSeating = /\baudience seating 4x4\b/.test(type) || /\baudience seating 4x4\b/.test(identity);
    const explicitAuditoriumChair = /\b(audience chair|auditorium chair|auditorium arm chair|theater chair|theatre chair|lecture chair writing arm)\b/.test(type)
      || /\b(audience chair|auditorium chair|auditorium arm chair|theater chair|theatre chair|lecture chair writing arm)\b/.test(identity);
    const chairCenter = { x: item.x + item.width / 2, y: item.y + item.height / 2 };
    const contextualArmchair = auditoriumRoomPolygons.length > 0
      && /\b(arm chair|armchair|auditorium chair|audience chair|chair|seat)\b/.test(identity)
      && !/\b(desk|office|workstation|computer|stool|bench|dining|table)\b/.test(identity)
      && auditoriumRoomPolygons.some((polygon) => pointInPolygon(chairCenter, polygon));
    if (!groupedSeating && !explicitAuditoriumChair && !contextualArmchair) continue;

    const rotation = Number.isFinite(item.rotation) ? item.rotation : 0;
    const flipX = item.flipX === true;
    const flipY = item.flipY === true;
    const color = item.color || "#3d4652";
    const pushLayout = (id: string, x: number, y: number, width: number, height: number) => {
      layouts.push({ id, x, y, width, height, rotation, color, flipX, flipY });
    };

    if (groupedSeating) {
      const columns = 4;
      const rows = 4;
      const cellW = item.width / columns;
      const cellH = item.height / rows;
      const centerX = item.x + item.width / 2;
      const centerY = item.y + item.height / 2;
      const angle = rotation * Math.PI / 180;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const flipXSign = flipX ? -1 : 1;
      const flipYSign = flipY ? -1 : 1;
      const chairW = Math.max(4, Math.min(cellW * 0.6, 10));
      const chairH = Math.max(4, Math.min(cellH * 0.62, 10));
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const localX = (column + 0.5 - columns / 2) * cellW * flipXSign;
          const localY = (row + 0.5 - rows / 2) * cellH * flipYSign;
          // Match the authored SVG item's rotation in floor coordinates.
          // The 3D renderer uses positive world Z for floor Y, then applies
          // the same rotation through its existing negative Y-axis rotation.
          const x = centerX + localX * cos - localY * sin;
          const y = centerY + localX * sin + localY * cos;
          pushLayout(`${item.id}:seat-${row}-${column}`, x, y, chairW, chairH);
        }
      }
      continue;
    }

    const isLectureChair = /lecture chair writing arm/.test(type) || /lecture chair writing arm/.test(identity);
    const width = explicitAuditoriumChair
      ? Math.max(isLectureChair ? 5 : 4, item.width * (isLectureChair ? 0.62 : 0.62))
      : Math.max(6, item.width * 0.82);
    const height = explicitAuditoriumChair
      ? Math.max(isLectureChair ? 5 : 4, item.height * (isLectureChair ? 0.66 : 0.62))
      : Math.max(6, item.height * 0.78);
    pushLayout(item.id, item.x + item.width / 2, item.y + item.height / 2, width, height);
  }
  return layouts;
}

/** Build chair instances from the authoritative authored FloorPlan. The
 * display label and floor number are intentionally irrelevant: published
 * floor records can have a display label such as "Floor 5" while their
 * internal ordinal differs. */
export function deriveStudentAuditoriumChairLayoutsForFloor(
  floor: Pick<FloorPlan, "rooms" | "furniture">,
): StudentAuditoriumChairLayout[] {
  const auditoriumRoomPolygons = floor.rooms
    .filter((room) => room.visible !== false && /\b(auditorium|lecture hall|lecture theatre|lecture theater)\b/i.test(`${room.name} ${room.type}`))
    .map(roomOutlinePoints)
    .filter((polygon) => polygon.length >= 3);
  return deriveStudentAuditoriumChairLayouts(floor.furniture, auditoriumRoomPolygons);
}

/** Angles for evenly spaced seats around a table; kept pure for renderer tests. */
export function radialFurnitureSeatAngles(count: number): number[] {
  const safeCount = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
  return Array.from({ length: safeCount }, (_, index) => index * Math.PI * 2 / safeCount);
}

/** Derive visual-only wall openings where an authored exterior-stair landing
 * meets a perimeter wall. The generated FloorStairs occurrence is the
 * authored connection point; this never writes back to a FloorPlan. */
export function exteriorEmergencyStairOpenings(
  walls: readonly FloorWall[],
  doors: readonly FloorDoor[],
  stairs: readonly FloorStairs[],
  canvasW?: number,
  canvasH?: number,
): FloorDoor[] {
  const openings: FloorDoor[] = [];
  for (const stair of stairs) {
    if (stair.visible === false || !stair.exteriorEmergencyStairId) continue;
    const attachment = stair.attachment;
    const authoredOffset = Number(attachment?.offset);
    const offset = Math.max(0, Math.min(1, Number.isFinite(authoredOffset) ? authoredOffset : 0.5));
    const point = attachment && Number.isFinite(canvasW) && Number.isFinite(canvasH)
      ? attachment.edge === "left" ? { x: 0, y: offset * canvasH! }
        : attachment.edge === "right" ? { x: canvasW!, y: offset * canvasH! }
          : attachment.edge === "top" ? { x: offset * canvasW!, y: 0 }
            : { x: offset * canvasW!, y: canvasH! }
      : { x: stair.x + stair.width / 2, y: stair.y + stair.height / 2 };
    let nearest: { wall: FloorWall; x: number; y: number; distance: number; wallLength: number } | null = null;
    for (const wall of walls) {
      if (wall.visible === false) continue;
      const dx = wall.x2 - wall.x1;
      const dy = wall.y2 - wall.y1;
      const lengthSquared = dx * dx + dy * dy;
      if (lengthSquared < 1) continue;
      const t = Math.max(0, Math.min(1, ((point.x - wall.x1) * dx + (point.y - wall.y1) * dy) / lengthSquared));
      const x = wall.x1 + dx * t;
      const y = wall.y1 + dy * t;
      const distance = Math.hypot(point.x - x, point.y - y);
      if (!nearest || distance < nearest.distance) nearest = { wall, x, y, distance, wallLength: Math.sqrt(lengthSquared) };
    }
    if (!nearest || nearest.distance > Math.max(18, Math.min(stair.width, stair.height) * 0.75)) continue;
    const width = Math.min(Math.max(20, stair.width * 0.88), nearest.wallLength);
    const alreadyAuthored = doors.some((door) => {
      if (door.visible === false || (door.wallId && door.wallId !== nearest?.wall.id)) return false;
      return Math.hypot(door.x - nearest!.x, door.y - nearest!.y) <= (door.width + width) / 2;
    });
    if (alreadyAuthored) continue;
    openings.push({
      id: `visual-emergency-access-${stair.exteriorEmergencyStairId}-${stair.id}`,
      x: nearest.x,
      y: nearest.y,
      width,
      wallId: nearest.wall.id,
      direction: "double",
      color: "#c98252",
      isEmergencyExit: true,
      openingType: "open_passage",
      accessDirection: "both",
    });
  }
  return openings;
}

/** Renderer-only normalization. Nearby collinear authored segments are
 * combined and duplicate overlaps are emitted once; the saved floor stays
 * untouched. Door openings are cut from the resulting visual wall run. */
export function normalizeIndoorWallSegments(
  walls: readonly FloorWall[],
  doors: readonly FloorDoor[] = [],
  windows: readonly FloorWindow[] = [],
): IndoorWallSegment[] {
  type Run = IndoorWallSegment & { ux: number; uy: number; offset: number; lo: number; hi: number };
  const runs: Run[] = [];

  for (const wall of walls) {
    if (wall.visible === false) continue;
    const dx = wall.x2 - wall.x1;
    const dy = wall.y2 - wall.y1;
    const length = Math.hypot(dx, dy);
    if (length < 1) continue;
    let ux = dx / length;
    let uy = dy / length;
    if (ux < -1e-5 || (Math.abs(ux) <= 1e-5 && uy < 0)) { ux *= -1; uy *= -1; }
    const offset = ux * wall.y1 - uy * wall.x1;
    const a = ux * wall.x1 + uy * wall.y1;
    const b = ux * wall.x2 + uy * wall.y2;
    let run = runs.find((candidate) => Math.abs(candidate.ux * uy - candidate.uy * ux) <= ANGLE_EPSILON
      && Math.abs(candidate.offset - offset) <= DISTANCE_EPSILON
      && Math.min(Math.max(a, b), candidate.hi) >= Math.max(Math.min(a, b), candidate.lo) - DISTANCE_EPSILON);
    if (!run) {
      run = {
        x1: 0, y1: 0, x2: 0, y2: 0,
        thickness: Math.max(2, wall.thickness || 4),
        height: Math.max(2.3, wall.height || 2.9),
        baseHeight: 0,
        color: wall.color || "#cbd5e1",
        sourceIds: [wall.id], ux, uy, offset,
        lo: Math.min(a, b), hi: Math.max(a, b),
      };
      runs.push(run);
    } else {
      run.lo = Math.min(run.lo, a, b);
      run.hi = Math.max(run.hi, a, b);
      run.thickness = Math.max(run.thickness, Math.max(2, wall.thickness || 4));
      run.height = Math.max(run.height, Math.max(2.3, wall.height || 2.9));
      if (!run.sourceIds.includes(wall.id)) run.sourceIds.push(wall.id);
    }
  }

  // Resolve renderer-only junctions after collinear runs are merged. At a T,
  // the terminating wall stops at the face of the through-wall. At a corner,
  // one run is deterministically butted into the other. Crossing runs are
  // split so their top faces do not occupy the same coplanar area.
  const bounds = runs.map((run) => ({ lo: run.lo, hi: run.hi }));
  const removedIntervals = runs.map(() => [] as Array<[number, number]>);
  const junctionTolerance = 2.5;
  const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;
  const trimEndpoint = (index: number, at: number, amount: number) => {
    if (Math.abs(at - bounds[index].lo) <= junctionTolerance) bounds[index].lo = Math.min(bounds[index].hi, bounds[index].lo + amount);
    else bounds[index].hi = Math.max(bounds[index].lo, bounds[index].hi - amount);
  };
  for (let i = 0; i < runs.length; i += 1) {
    for (let j = i + 1; j < runs.length; j += 1) {
      const a = runs[i]; const b = runs[j];
      const determinant = cross(a.ux, a.uy, b.ux, b.uy);
      if (Math.abs(determinant) < 0.08) continue;
      const ax = a.ux * bounds[i].lo - a.uy * a.offset;
      const ay = a.uy * bounds[i].lo + a.ux * a.offset;
      const bx = b.ux * bounds[j].lo - b.uy * b.offset;
      const by = b.uy * bounds[j].lo + b.ux * b.offset;
      const deltaX = bx - ax; const deltaY = by - ay;
      const atA = cross(deltaX, deltaY, b.ux, b.uy) / determinant + bounds[i].lo;
      const atB = cross(deltaX, deltaY, a.ux, a.uy) / determinant + bounds[j].lo;
      if (atA < bounds[i].lo - junctionTolerance || atA > bounds[i].hi + junctionTolerance
        || atB < bounds[j].lo - junctionTolerance || atB > bounds[j].hi + junctionTolerance) continue;
      const aAtEnd = Math.min(Math.abs(atA - bounds[i].lo), Math.abs(atA - bounds[i].hi)) <= junctionTolerance;
      const bAtEnd = Math.min(Math.abs(atB - bounds[j].lo), Math.abs(atB - bounds[j].hi)) <= junctionTolerance;
      if (aAtEnd && bAtEnd) trimEndpoint(j, atB, a.thickness / 2);
      else if (aAtEnd) trimEndpoint(i, atA, b.thickness / 2);
      else if (bAtEnd) trimEndpoint(j, atB, a.thickness / 2);
      else removedIntervals[j].push([atB - a.thickness / 2, atB + a.thickness / 2]);
    }
  }
  const junctionRuns: Run[] = [];
  runs.forEach((run, index) => {
    let intervals: Array<[number, number]> = [[bounds[index].lo, bounds[index].hi]];
    for (const [cutStart, cutEnd] of removedIntervals[index].sort((a, b) => a[0] - b[0])) {
      intervals = intervals.flatMap(([start, end]) => {
        if (cutEnd <= start || cutStart >= end) return [[start, end]];
        return [[start, Math.max(start, cutStart)], [Math.min(end, cutEnd), end]] as Array<[number, number]>;
      });
    }
    for (const [lo, hi] of intervals) if (hi - lo > 1) junctionRuns.push({ ...run, lo, hi });
  });

  const output: IndoorWallSegment[] = [];
  const DOOR_HEAD = 2.08;
  const WINDOW_SILL = 0.88;
  const WINDOW_HEAD = 2.04;
  const push = (run: Run, start: number, end: number, baseHeight = 0, height = run.height) => {
    const clippedStart = Math.max(run.lo, start);
    const clippedEnd = Math.min(run.hi, end);
    if (clippedEnd - clippedStart <= 1 || height <= 0.025) return;
    output.push({
      x1: run.ux * clippedStart - run.uy * run.offset,
      y1: run.uy * clippedStart + run.ux * run.offset,
      x2: run.ux * clippedEnd - run.uy * run.offset,
      y2: run.uy * clippedEnd + run.ux * run.offset,
      thickness: run.thickness,
      height,
      baseHeight,
      color: run.color,
      sourceIds: run.sourceIds,
    });
  };
  for (const run of junctionRuns) {
    const doorOpenings = doors.filter((door) => door.visible !== false
      && (!door.wallId || run.sourceIds.includes(door.wallId))
      && Math.abs(run.ux * door.y - run.uy * door.x - run.offset) <= Math.max(DISTANCE_EPSILON * 3, door.width * 0.6))
      .map((door) => {
        const center = run.ux * door.x + run.uy * door.y;
        const width = indoorDoorVisualWidth(door);
        return { start: center - width / 2, end: center + width / 2, kind: "door" as const };
      });
    const windowOpenings = windows.filter((window) => window.visible !== false
      && (!window.wallId || run.sourceIds.includes(window.wallId))
      && Math.abs(run.ux * window.y - run.uy * window.x - run.offset) <= Math.max(DISTANCE_EPSILON * 3, window.width * 0.6))
      .map((window) => {
        const center = run.ux * window.x + run.uy * window.y;
        return { start: center - window.width / 2, end: center + window.width / 2, kind: "window" as const };
      });
    const openings = [...doorOpenings, ...windowOpenings]
      .filter((opening) => opening.end > run.lo && opening.start < run.hi)
      .sort((a, b) => a.start - b.start);
    const mergedOpenings: Array<{ start: number; end: number; kind: "door" | "window" }> = [];
    for (const opening of openings) {
      const last = mergedOpenings.at(-1);
      if (last && opening.start <= last.end + DISTANCE_EPSILON) {
        last.end = Math.max(last.end, opening.end);
        // A door/open passage takes precedence over a nearby window interval.
        if (opening.kind === "door") last.kind = "door";
      } else mergedOpenings.push({ ...opening });
    }
    let cursor = run.lo;
    for (const opening of mergedOpenings) {
      const start = Math.max(run.lo, opening.start);
      const end = Math.min(run.hi, opening.end);
      push(run, cursor, start);
      if (opening.kind === "door") {
        push(run, start, end, Math.min(DOOR_HEAD, run.height), run.height - DOOR_HEAD);
      } else {
        push(run, start, end, 0, Math.min(WINDOW_SILL, run.height));
        push(run, start, end, Math.min(WINDOW_HEAD, run.height), run.height - WINDOW_HEAD);
      }
      cursor = Math.max(cursor, end);
    }
    push(run, cursor, run.hi);
  }
  return output;
}

function pointInPolygon(point: { x: number; y: number }, polygon: readonly { x: number; y: number }[]) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[index]; const b = polygon[previous];
    if ((a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Conservative renderer-only compatibility for authored stairwell voids.
 * Explicit void semantics are honored directly. Legacy rooms are only treated
 * as openings when their name/type identifies stairs AND an authored stair
 * footprint is actually contained by that room; appearance colors are ignored. */
export function isIndoorOpenBelowRoom(
  room: Pick<FloorRoom, "name" | "type">,
  polygon: readonly { x: number; y: number }[],
  stairs: readonly Pick<FloorStairs, "x" | "y" | "width" | "height" | "exteriorEmergencyStairId">[],
) {
  const name = (room.name || "").trim().toLowerCase().replace(/[_-]+/g, " ");
  const type = (room.type || "").trim().toLowerCase().replace(/[_-]+/g, " ");
  const explicit = /^(void|open below|stairwell void)$/.test(type)
    || /\bopen\s+below\b|\bstairwell\s+(?:void|opening)\b/.test(name);
  if (explicit) return true;
  if (!/\bstairs?\b|\bstairwell\b/.test(`${type} ${name}`) || polygon.length < 3) return false;
  return stairs.some((stair) => !stair.exteriorEmergencyStairId
    && pointInPolygon({ x: stair.x + stair.width / 2, y: stair.y + stair.height / 2 }, polygon));
}

/**
 * ReadonlyFloorPlanVisuals — Presentation-only rendering of the authored
 * FloorPlan data for the student-facing CampusMapPage.
 *
 * Renders walls, doors, windows, stairs, ramps, elevators, labels, rooms,
 * and walking paths from the actual admin-created floor plan — not the
 * simplified legacy room-only format.
 */

import type {
  FloorPlan,
  FloorRoom,
  FloorWall,
  FloorDoor,
  FloorWindow,
  FloorStairs,
  FloorRamp,
  FloorElevatorItem,
  FloorLabel,
  FloorFurniture,
  FloorPath,
  FloorExteriorZone,
  FloorEntranceSteps,
  FloorEntranceRamp,
  BuildingEntranceEdge,
  CampusEntrance,
} from "./types";
import { FloorGroundSurface } from "./FloorGroundSurface";
import { getFloorShapeBounds, getFloorShapeRegions } from "../../lib/floorShape";
import { ROOM_COLORS, type RoomType } from "../../data/floorPlans";
import { EntranceDirectionBadge } from "./EntranceDirectionBadge";
import { FloorFurnitureSymbol } from "./FloorFurnitureSymbol";
import {
  exteriorZoneAccessFeatureGeometry,
  exteriorZoneGeometry,
  exteriorZoneTypeLabel,
} from "../../lib/exteriorFloorZones";

const DEFAULT_FLOOR_CANVAS_W = 440;
const DEFAULT_FLOOR_CANVAS_H = 290;
const FLOOR_VIEWPORT_PADDING = 8;

export interface ReadonlyFloorPlanViewport {
  /** Width/height used by the student SVG viewBox. */
  width: number;
  height: number;
  /** Translation that places authored floor coordinates inside that viewBox. */
  offsetX: number;
  offsetY: number;
}

/**
 * Return a viewBox that includes authored semi-outdoor floor content.
 * Exterior zones intentionally live outside the indoor canvas, so a
 * student-facing SVG using only `0 0 canvasW canvasH` would clip verandas and
 * their entrance steps/ramp even though the Admin editor shows them.
 */
export function readonlyFloorPlanViewport(floor?: FloorPlan | null): ReadonlyFloorPlanViewport {
  const canvasW = Math.max(1, floor?.canvasW || DEFAULT_FLOOR_CANVAS_W);
  const canvasH = Math.max(1, floor?.canvasH || DEFAULT_FLOOR_CANVAS_H);
  let minX = 0;
  let minY = 0;
  let maxX = canvasW;
  let maxY = canvasH;

  const includeRect = (x: number, y: number, width: number, height: number) => {
    if (![x, y, width, height].every(Number.isFinite)) return;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + Math.max(0, width));
    maxY = Math.max(maxY, y + Math.max(0, height));
  };

  const includeRotatedRect = (x: number, y: number, width: number, height: number, rotation = 0) => {
    const angle = (rotation * Math.PI) / 180;
    const cx = x + width / 2;
    const cy = y + height / 2;
    const corners = [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ].map((point) => ({
      x: cx + (point.x - cx) * Math.cos(angle) - (point.y - cy) * Math.sin(angle),
      y: cy + (point.x - cx) * Math.sin(angle) + (point.y - cy) * Math.cos(angle),
    }));
    includeRect(
      Math.min(...corners.map((point) => point.x)),
      Math.min(...corners.map((point) => point.y)),
      Math.max(...corners.map((point) => point.x)) - Math.min(...corners.map((point) => point.x)),
      Math.max(...corners.map((point) => point.y)) - Math.min(...corners.map((point) => point.y)),
    );
  };

  const zones = floor?.exteriorZones ?? [];
  const zoneById = new Map(zones.map((zone) => [zone.id, zone]));
  zones.forEach((zone) => {
    const geometry = exteriorZoneGeometry(zone, canvasW, canvasH);
    includeRect(geometry.x, geometry.y, geometry.width, geometry.height);
  });

  const includeAccessFeature = (feature: FloorEntranceSteps | FloorEntranceRamp) => {
    const parent = feature.parentZoneId ? zoneById.get(feature.parentZoneId) : undefined;
    const geometry = parent
      ? exteriorZoneAccessFeatureGeometry(parent, feature, canvasW, canvasH)
      : { x: feature.x, y: feature.y, width: feature.width, height: feature.height };
    if (!geometry) return;
    includeRect(geometry.x, geometry.y, geometry.width, geometry.height);
  };
  (floor?.entranceSteps ?? []).forEach(includeAccessFeature);
  (floor?.entranceRamps ?? []).forEach(includeAccessFeature);

  // Legacy floors can contain a free-standing item beyond the indoor canvas.
  // Include those authored bounds too, while preserving the normal viewBox for
  // the common case where every object is inside the floor.
  (floor?.furniture ?? []).forEach((item) => includeRotatedRect(item.x, item.y, item.width, item.height, item.rotation));
  (floor?.stairs ?? []).forEach((item) => includeRotatedRect(item.x, item.y, item.width, item.height, item.rotation));
  (floor?.ramps ?? []).forEach((item) => includeRotatedRect(item.x, item.y, item.width, item.height, item.rotation));
  (floor?.elevators ?? []).forEach((item) => includeRotatedRect(item.x, item.y, item.width, item.height, item.rotation));

  const viewMinX = minX < 0 ? minX - FLOOR_VIEWPORT_PADDING : 0;
  const viewMinY = minY < 0 ? minY - FLOOR_VIEWPORT_PADDING : 0;
  const viewMaxX = maxX > canvasW ? maxX + FLOOR_VIEWPORT_PADDING : canvasW;
  const viewMaxY = maxY > canvasH ? maxY + FLOOR_VIEWPORT_PADDING : canvasH;
  return {
    width: viewMaxX - viewMinX,
    height: viewMaxY - viewMinY,
    offsetX: viewMinX === 0 ? 0 : -viewMinX,
    offsetY: viewMinY === 0 ? 0 : -viewMinY,
  };
}
import { roomOutlinePoints, roomShapeBounds, roomShapeHorizontalSpan, roomShapeLabelPoint, roomShapePath } from "../../lib/roomShape";
import { layoutRoomLabel, roomLabelLineCenterY } from "../../lib/roomLabel";
import { sortFloorItemsByLocalZ } from "../../lib/floorRenderLayers";

// ── Room rendering ──────────────────────────────────────────────────────────

interface RoomVisualProps {
  room: FloorRoom;
  hovered?: boolean;
  highlighted?: boolean;
  mapMode?: "standard" | "accessible" | "emergency";
  onClick?: (roomId: string) => void;
  onMouseEnter?: (roomId: string) => void;
  onMouseLeave?: () => void;
}

export function RoomVisual({ room, hovered, highlighted, mapMode, onClick, onMouseEnter, onMouseLeave }: RoomVisualProps) {
  const typeKey = room.type as RoomType;
  const colors = ROOM_COLORS[typeKey] ?? ROOM_COLORS.classroom;
  const fill = room.color ?? colors.fill;
  const stroke = highlighted ? "#0e2a6e" : hovered ? colors.stroke : colors.stroke;
  const strokeWidth = highlighted ? 2.5 : hovered ? 2 : 1;
  const opacity = highlighted ? 0.3 : 1;
  const customPoints = Array.isArray(room.shapePoints) && room.shapePoints.length >= 3 ? roomOutlinePoints(room) : null;
  const customPath = customPoints ? roomShapePath(customPoints) : "";

  return (
    <g
      data-testid="readonly-room"
      data-room-id={room.id}
      style={{ cursor: onClick ? "pointer" : undefined }}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick(room.id); } : undefined}
      onMouseEnter={onMouseEnter ? () => onMouseEnter(room.id) : undefined}
      onMouseLeave={onMouseLeave}
    >
      {highlighted && (customPoints ? (
        <path d={roomShapePath(customPoints)} transform="translate(0 0)" fill="none" stroke="#0e2a6e" strokeWidth={2.5}
          style={{ animation: "border-glow 2s ease-in-out infinite" }} />
      ) : (
        <rect x={room.x - 3} y={room.y - 3} width={room.w + 6} height={room.h + 6} rx={2}
          fill="none" stroke="#0e2a6e" strokeWidth={2.5}
          style={{ animation: "border-glow 2s ease-in-out infinite" }} />
      ))}
      {customPoints ? (
        <path d={customPath} fill={fill} fillOpacity={opacity} stroke={stroke} strokeWidth={strokeWidth} />
      ) : (
        <rect x={room.x} y={room.y} width={room.w} height={room.h} rx={1}
          fill={fill} fillOpacity={opacity}
          stroke={stroke} strokeWidth={strokeWidth} />
      )}
      {/* Interior depth shadows */}
      {!highlighted && (
        <>
          {customPoints ? (
            <line x1={customPoints[0].x} y1={customPoints[0].y} x2={customPoints[1].x} y2={customPoints[1].y}
              stroke={colors.text} strokeWidth={1.5} opacity={0.08} />
          ) : (
            <>
              <line x1={room.x + 1} y1={room.y + 1} x2={room.x + room.w - 1} y2={room.y + 1}
                stroke={colors.text} strokeWidth={1.5} opacity={0.08} />
              <line x1={room.x + 1} y1={room.y + 1} x2={room.x + 1} y2={room.y + room.h - 1}
                stroke={colors.text} strokeWidth={1.5} opacity={0.08} />
            </>
          )}
        </>
      )}
      {/* Type label */}
      {room.w >= 60 && room.h >= 30 && (
        <text x={room.x + room.w / 2} y={room.y + room.h / 2 + 7}
          textAnchor="middle" fill={colors.text}
          fontSize={5} fontWeight="500" opacity={0.6}
          className="pointer-events-none select-none">
          {room.type}
        </text>
      )}
    </g>
  );
}

// ── Wall rendering ──────────────────────────────────────────────────────────

function WallVisual({ wall }: { wall: FloorWall }) {
  if (wall.visible === false) return null;
  const x1 = wall.x1, y1 = wall.y1, x2 = wall.x2, y2 = wall.y2;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return null;

  return (
    <g data-testid="readonly-wall" data-wall-id={wall.id}>
      {/* Wall core */}
      <line x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={wall.color || "#334155"}
        strokeWidth={wall.thickness || 3}
        strokeLinecap="round" />
      {/* Wall casing (lighter outline) */}
      <line x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={wall.color || "#334155"}
        strokeWidth={(wall.thickness || 3) + 2}
        strokeLinecap="round"
        opacity={0.2} />
    </g>
  );
}

// ── Door rendering ──────────────────────────────────────────────────────────

function wallRotation(wall?: FloorWall) {
  if (!wall) return 0;
  return Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1) * (180 / Math.PI);
}

function DoorVisual({ door, wall, entrance, onClick }: { door: FloorDoor; wall?: FloorWall; entrance?: CampusEntrance; onClick?: (doorId: string) => void }) {
  if (door.visible === false) return null;
  const { x, y, width, color, direction } = door;
  const half = width / 2;
  const leaf = width * 0.85;
  const wallThickness = (door as Record<string, unknown>).thickness as number ?? 4;
  const jamb = Math.max(wallThickness / 2 + 2, 4);

  const rot = wallRotation(wall);

  return (
    <g data-testid="readonly-door" data-door-id={door.id}
      transform={`translate(${x},${y}) rotate(${rot})`}
      style={{ cursor: onClick ? 'pointer' : undefined }}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick(door.id); } : undefined}>
      {/* Wall cut (clear opening) */}
      <line x1={-half} y1={0} x2={half} y2={0}
        stroke="var(--map-floor-bg, #f5f3ef)" strokeWidth={(door as Record<string, unknown>).thickness as number ?? 4} />
      {door.openingType === "open_passage" ? (
        <g data-testid="readonly-open-passage-symbol">
          <line data-testid="readonly-open-passage-wall-cut" x1={-half} y1={0} x2={half} y2={0}
            stroke="var(--map-floor-bg, #f5f3ef)" strokeWidth={wallThickness + 2} strokeLinecap="butt" />
          <line x1={-half} y1={-jamb} x2={-half} y2={jamb} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
          <line x1={half} y1={-jamb} x2={half} y2={jamb} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
          <line x1={-half + 2} y1={-jamb - 1} x2={half - 2} y2={-jamb - 1}
            stroke={color} strokeWidth={1.2} strokeLinecap="round" opacity={0.72} />
        </g>
      ) : direction === "double" ? (
        <>
          {/* Double door — two leaves */}
          <line data-testid="readonly-door-leaf" x1={-half} y1={-5.5} x2={half} y2={-5.5}
            stroke={color} strokeWidth={2.4} strokeLinecap="round" />
          <circle data-testid="readonly-door-hinge" cx={-half} cy={0} r={2.3} fill={color} />
          <circle data-testid="readonly-door-hinge" cx={half} cy={0} r={2.3} fill={color} />
        </>
      ) : direction === "sliding" ? (
        <line data-testid="readonly-door-leaf" x1={-half} y1={0} x2={half} y2={0}
          stroke={color} strokeWidth={2.5} strokeLinecap="round"
          strokeDasharray="3 2" />
      ) : (
        <>
          {/* Single door — hinge + leaf + swing arc */}
          <circle data-testid="readonly-door-hinge" cx={-half} cy={0} r={2.4} fill={color} />
          <line data-testid="readonly-door-leaf" x1={-half} y1={0} x2={-half} y2={-leaf}
            stroke={color} strokeWidth={2.7} strokeLinecap="round" />
          <path data-testid="readonly-door-swing-arc" d={`M ${-half} ${-leaf} A ${leaf} ${leaf} 0 0 0 ${half} 0`}
            fill="none" stroke={color} strokeWidth={1} opacity={0.4}
            strokeDasharray="2 2" />
        </>
      )}
      {entrance && <EntranceDirectionBadge
        x={0}
        y={0}
        edge={entrance.edge}
        direction={entrance.direction}
        type={entrance.type}
      />}
      {/* Emergency exit marker */}
      {door.isEmergencyExit && (
        <text x={0} y={-8} textAnchor="middle" fill="#dc2626"
          fontSize={4} fontWeight="900" className="pointer-events-none select-none">
          EXIT
        </text>
      )}
    </g>
  );
}

// ── Window rendering ────────────────────────────────────────────────────────

function WindowVisual({ window: win, wall }: { window: FloorWindow; wall?: FloorWall }) {
  if (win.visible === false) return null;
  const half = win.width / 2;
  return (
    <g data-testid="readonly-window" data-window-id={win.id}
      transform={`translate(${win.x},${win.y}) rotate(${wallRotation(wall)})`}>
      <line x1={-half} y1={0} x2={half} y2={0}
        stroke={win.color || "#93c5fd"} strokeWidth={2} strokeLinecap="round" />
      <line x1={-half} y1={-2} x2={half} y2={-2}
        stroke={win.color || "#93c5fd"} strokeWidth={0.8} opacity={0.5} />
      <line x1={-half} y1={2} x2={half} y2={2}
        stroke={win.color || "#93c5fd"} strokeWidth={0.8} opacity={0.5} />
    </g>
  );
}

// ── Stairs rendering ────────────────────────────────────────────────────────

function StairsVisual({ stairs }: { stairs: FloorStairs }) {
  const { x, y, width, height, label, direction } = stairs;
  const rotation = stairs.rotation ?? 0;
  const cx = x + width / 2;
  const cy = y + height / 2;

  // Stair step lines
  const stepCount = Math.max(3, Math.floor(height / 8));
  const steps = Array.from({ length: stepCount }, (_, i) => {
    const yPos = y + 4 + (i * (height - 8)) / (stepCount - 1);
    return yPos;
  });

  return (
    <g data-testid="readonly-stairs" data-stairs-id={stairs.id}
      transform={`translate(${cx},${cy}) rotate(${rotation}) translate(${-width / 2},${-height / 2})`}>
      {/* Background */}
      <rect x={0} y={0} width={width} height={height} rx={2}
        fill="#fce7f3" stroke="#ec4899" strokeWidth={1.5} />
      {/* Step lines */}
      {steps.map((yPos, i) => (
        <line key={i} x1={3} y1={yPos - y} x2={width - 3} y2={yPos - y}
          stroke="#ec4899" strokeWidth={1} opacity={0.6} />
      ))}
      {/* Direction arrow */}
      <text x={width / 2} y={height / 2 + 2} textAnchor="middle"
        fill="#9d174d" fontSize={6} fontWeight="900"
        className="pointer-events-none select-none">
        {direction === "up" ? "▲" : direction === "down" ? "▼" : "◆"}
      </text>
      {/* Label */}
      {label && (
        <text x={width / 2} y={height + 8} textAnchor="middle"
          fill="#64748b" fontSize={5} fontWeight="600"
          className="pointer-events-none select-none">
          {label}
        </text>
      )}
    </g>
  );
}

// ── Ramp rendering ──────────────────────────────────────────────────────────

function RampVisual({ ramp }: { ramp: FloorRamp }) {
  const { x, y, width, height, label } = ramp;
  const rotation = ramp.rotation ?? 0;
  const cx = x + width / 2;
  const cy = y + height / 2;

  return (
    <g data-testid="readonly-ramp" data-ramp-id={ramp.id}
      transform={`translate(${cx},${cy}) rotate(${rotation}) translate(${-width / 2},${-height / 2})`}>
      <rect x={0} y={0} width={width} height={height} rx={2}
        fill="#dcfce7" stroke="#16a34a" strokeWidth={1.5} />
      {/* Ramp slope indicator */}
      <line x1={3} y1={height - 3} x2={width - 3} y2={3}
        stroke="#16a34a" strokeWidth={1.5} />
      {/* Arrow head */}
      <polygon points={`${width - 3},3 ${width - 8},6 ${width - 3},9`}
        fill="#16a34a" />
      {/* Accessibility icon */}
      <text x={width / 2} y={height / 2 + 3} textAnchor="middle"
        fill="#166534" fontSize={7} fontWeight="900"
        className="pointer-events-none select-none">♿</text>
      {label && (
        <text x={width / 2} y={height + 8} textAnchor="middle"
          fill="#64748b" fontSize={5} fontWeight="600"
          className="pointer-events-none select-none">
          {label}
        </text>
      )}
    </g>
  );
}

// ── Elevator rendering ──────────────────────────────────────────────────────

function ElevatorVisual({ elevator }: { elevator: FloorElevatorItem }) {
  const { x, y, width, height, label } = elevator;
  const cx = x + width / 2;
  const cy = y + height / 2;

  return (
    <g data-testid="readonly-elevator" data-elevator-id={elevator.id}
      transform={`translate(${cx},${cy})`}>
      <rect x={-width / 2} y={-height / 2} width={width} height={height} rx={2}
        fill="#f3e8ff" stroke="#a855f7" strokeWidth={1.5} />
      {/* Elevator car */}
      <rect x={-width / 2 + 3} y={-height / 2 + 3}
        width={width - 6} height={height - 6} rx={1}
        fill="#e9d5ff" stroke="#a855f7" strokeWidth={0.8} />
      {/* Up/Down arrows */}
      <text x={0} y={-2} textAnchor="middle"
        fill="#7e22ce" fontSize={5} fontWeight="900"
        className="pointer-events-none select-none">▲</text>
      <text x={0} y={7} textAnchor="middle"
        fill="#7e22ce" fontSize={5} fontWeight="900"
        className="pointer-events-none select-none">▼</text>
      {label && (
        <text x={0} y={height / 2 + 8} textAnchor="middle"
          fill="#64748b" fontSize={5} fontWeight="600"
          className="pointer-events-none select-none">
          {label}
        </text>
      )}
    </g>
  );
}

// ── Label rendering ─────────────────────────────────────────────────────────

function LabelVisual({ label }: { label: FloorLabel }) {
  return (
    <text
      data-testid="readonly-label"
      data-label-id={label.id}
      x={label.x}
      y={label.y}
      fill={label.color || "#475569"}
      fontSize={label.fontSize || 8}
      fontWeight="600"
      textAnchor={label.align === "center" ? "middle" : label.align === "right" ? "end" : "start"}
      transform={label.rotation ? `rotate(${label.rotation},${label.x},${label.y})` : undefined}
      className="pointer-events-none select-none"
    >
      {label.text}
    </text>
  );
}

// ── Path rendering ──────────────────────────────────────────────────────────

function PathVisual({ path }: { path: FloorPath }) {
  if (!path.points || path.points.length < 2) return null;
  const points = path.points.map((p) => `${p.x},${p.y}`).join(" ");
  return (
    <polyline
      data-testid="readonly-floor-path"
      data-path-id={path.id}
      points={points}
      fill="none"
      stroke={path.color || "#94a3b8"}
      strokeWidth={path.width || 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={0.6}
    />
  );
}

// ── Semi-outdoor floor rendering ───────────────────────────────────────────

function exteriorZoneFill(type: FloorExteriorZone["type"]) {
  return type === "veranda"
    ? "#d9c5a1"
    : type === "entrance_landing"
      ? "#cbd5e1"
      : type === "covered_walkway"
        ? "#b8c8d8"
        : "#d1d5db";
}

function ExteriorZoneVisual({ zone, canvasW, canvasH }: { zone: FloorExteriorZone; canvasW: number; canvasH: number }) {
  const geometry = exteriorZoneGeometry(zone, canvasW, canvasH);
  return (
    <g
      data-testid="readonly-exterior-zone"
      data-exterior-zone-id={zone.id}
      data-floor-title={zone.label ?? exteriorZoneTypeLabel(zone.type)}
      aria-label={zone.label ?? exteriorZoneTypeLabel(zone.type)}
      opacity={zone.visible === false ? 0.35 : 1}
    >
      <rect
        x={geometry.x}
        y={geometry.y}
        width={geometry.width}
        height={geometry.height}
        rx={4}
        fill={exteriorZoneFill(zone.type)}
        fillOpacity={0.78}
        stroke="#64748b"
        strokeWidth={1.5}
        strokeDasharray={zone.type === "covered_walkway" ? "6 3" : undefined}
      />
      <line
        x1={geometry.x + 8}
        y1={geometry.y + 8}
        x2={geometry.x + geometry.width - 8}
        y2={geometry.y + 8}
        stroke="rgba(255,255,255,0.6)"
        strokeWidth={1}
      />
      {zone.labelVisible !== false && (
        <text
          x={geometry.x + geometry.width / 2 + (zone.labelOffsetX ?? 0)}
          y={geometry.y + geometry.height / 2 + 3 + (zone.labelOffsetY ?? 0)}
          textAnchor="middle"
          fontSize={9}
          fontWeight={800}
          fill="#334155"
          pointerEvents="none"
          className="pointer-events-none select-none"
        >
          {zone.label ?? exteriorZoneTypeLabel(zone.type)}
        </text>
      )}
    </g>
  );
}

type ExteriorVisualBounds = { x: number; y: number; width: number; height: number };

function ExteriorEntranceStepsVisual({
  bounds,
  side,
  direction = "forward",
  flipHorizontal = false,
  flipVertical = false,
}: {
  bounds: ExteriorVisualBounds;
  side: BuildingEntranceEdge;
  direction?: "forward" | "reverse";
  flipHorizontal?: boolean;
  flipVertical?: boolean;
}) {
  const horizontalEdge = side === "top" || side === "bottom";
  const inset = Math.max(2.5, Math.min(6, Math.min(bounds.width, bounds.height) * 0.18));
  const run = horizontalEdge ? bounds.height : bounds.width;
  const treadCount = Math.max(3, Math.min(6, Math.round(run / 8)));
  const rails = horizontalEdge
    ? [bounds.x + inset, bounds.x + bounds.width - inset].map((x) => (
        <line key={x} x1={x} y1={bounds.y + inset} x2={x} y2={bounds.y + bounds.height - inset} stroke="#8b6d47" strokeWidth={0.8} opacity={0.78} />
      ))
    : [bounds.y + inset, bounds.y + bounds.height - inset].map((y) => (
        <line key={y} x1={bounds.x + inset} y1={y} x2={bounds.x + bounds.width - inset} y2={y} stroke="#8b6d47" strokeWidth={0.8} opacity={0.78} />
      ));
  const towardParent = side === "top" ? { x: 0, y: 1 } : side === "bottom" ? { x: 0, y: -1 } : side === "left" ? { x: 1, y: 0 } : { x: -1, y: 0 };
  const cueDirection = direction === "reverse" ? { x: -towardParent.x, y: -towardParent.y } : towardParent;
  const cueLength = Math.max(5, Math.min(12, run * 0.24));
  const cueStart = { x: bounds.x + bounds.width / 2 - cueDirection.x * cueLength / 2, y: bounds.y + bounds.height / 2 - cueDirection.y * cueLength / 2 };
  const cueEnd = { x: bounds.x + bounds.width / 2 + cueDirection.x * cueLength / 2, y: bounds.y + bounds.height / 2 + cueDirection.y * cueLength / 2 };
  const cueTangent = { x: -cueDirection.y, y: cueDirection.x };
  const mirrorTransform = `translate(${bounds.x + bounds.width / 2} ${bounds.y + bounds.height / 2}) scale(${flipHorizontal ? -1 : 1} ${flipVertical ? -1 : 1}) translate(${-bounds.x - bounds.width / 2} ${-bounds.y - bounds.height / 2})`;
  return (
    <g data-testid="readonly-entrance-steps-symbol" transform={mirrorTransform}>
      <rect x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height} rx={2.5} fill="#e8d6b7" stroke="#8b6d47" strokeWidth={1.35} />
      <rect x={bounds.x + 1.5} y={bounds.y + 1.5} width={Math.max(0, bounds.width - 3)} height={Math.max(0, bounds.height - 3)} rx={1.5} fill="#f6ead6" opacity={0.68} />
      {Array.from({ length: treadCount }, (_, index) => {
        const ratio = (index + 1) / (treadCount + 1);
        return horizontalEdge
          ? <line key={index} x1={bounds.x + inset} y1={bounds.y + ratio * (bounds.height - inset * 2)} x2={bounds.x + bounds.width - inset} y2={bounds.y + ratio * (bounds.height - inset * 2)} stroke="#745b3c" strokeWidth={1.05} />
          : <line key={index} x1={bounds.x + ratio * (bounds.width - inset * 2)} y1={bounds.y + inset} x2={bounds.x + ratio * (bounds.width - inset * 2)} y2={bounds.y + bounds.height - inset} stroke="#745b3c" strokeWidth={1.05} />;
      })}
      {rails}
      <path
        data-testid="readonly-steps-direction-cue"
        d={`M ${cueStart.x} ${cueStart.y} L ${cueEnd.x} ${cueEnd.y} M ${cueEnd.x} ${cueEnd.y} L ${cueEnd.x - cueDirection.x * 3 + cueTangent.x * 2.2} ${cueEnd.y - cueDirection.y * 3 + cueTangent.y * 2.2} M ${cueEnd.x} ${cueEnd.y} L ${cueEnd.x - cueDirection.x * 3 - cueTangent.x * 2.2} ${cueEnd.y - cueDirection.y * 3 - cueTangent.y * 2.2}`}
        fill="none"
        stroke="#5f4630"
        strokeWidth={1.15}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.92}
      />
    </g>
  );
}

function ExteriorAccessibleRampVisual({
  bounds,
  side,
  direction = "forward",
  layout = "straight",
  flipHorizontal = false,
  flipVertical = false,
}: {
  bounds: ExteriorVisualBounds;
  side: BuildingEntranceEdge;
  direction?: "forward" | "reverse";
  layout?: "straight" | "l_turn_left" | "l_turn_right";
  flipHorizontal?: boolean;
  flipVertical?: boolean;
}) {
  const horizontalRun = side === "top" || side === "bottom";
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  const runLength = horizontalRun ? bounds.height : bounds.width;
  const crossLength = horizontalRun ? bounds.width : bounds.height;
  const runInset = Math.max(3, Math.min(9, runLength * 0.09));
  const crossInset = Math.max(3, Math.min(9, crossLength * 0.12));
  const runStart = side === "top" || side === "left"
    ? (horizontalRun ? bounds.y + runInset : bounds.x + runInset)
    : (horizontalRun ? bounds.y + bounds.height - runInset : bounds.x + bounds.width - runInset);
  const runEnd = side === "top" || side === "left"
    ? (horizontalRun ? bounds.y + bounds.height - runInset : bounds.x + bounds.width - runInset)
    : (horizontalRun ? bounds.y + runInset : bounds.x + runInset);
  const turnSign = layout === "l_turn_left" ? -1 : 1;
  const turnLeg = Math.max(2, Math.min(crossLength * 0.34, crossLength / 2 - crossInset));
  const railOffset = Math.max(3, Math.min(crossLength * 0.28, crossLength / 2 - crossInset));
  const showRails = layout === "straight" && runLength >= 24 && crossLength >= 24 && railOffset > 2.5;
  const baseRunPoints = layout === "straight"
    ? horizontalRun
      ? [{ x: cx, y: runStart }, { x: cx, y: runEnd }]
      : [{ x: runStart, y: cy }, { x: runEnd, y: cy }]
    : horizontalRun
      ? [{ x: cx + turnSign * turnLeg, y: runStart }, { x: cx, y: runStart }, { x: cx, y: runEnd }]
      : [{ x: runStart, y: cy + turnSign * turnLeg }, { x: runStart, y: cy }, { x: runEnd, y: cy }];
  const runPoints = direction === "reverse" ? [...baseRunPoints].reverse() : baseRunPoints;
  const toPath = (points: { x: number; y: number }[]) => points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const travelPath = toPath(runPoints);
  const arrowTip = runPoints[runPoints.length - 1];
  const arrowBase = runPoints[runPoints.length - 2] ?? arrowTip;
  const arrowVector = { x: arrowTip.x - arrowBase.x, y: arrowTip.y - arrowBase.y };
  const arrowLength = Math.max(1, Math.hypot(arrowVector.x, arrowVector.y));
  const arrowUnit = { x: arrowVector.x / arrowLength, y: arrowVector.y / arrowLength };
  const arrowNormal = { x: -arrowUnit.y, y: arrowUnit.x };
  const arrowHead = Math.max(2.2, Math.min(5, crossLength * 0.11, arrowLength * 0.22));
  const arrowCue = [
    `M ${arrowTip.x} ${arrowTip.y} L ${arrowTip.x - arrowUnit.x * arrowHead + arrowNormal.x * arrowHead} ${arrowTip.y - arrowUnit.y * arrowHead + arrowNormal.y * arrowHead}`,
    `M ${arrowTip.x} ${arrowTip.y} L ${arrowTip.x - arrowUnit.x * arrowHead - arrowNormal.x * arrowHead} ${arrowTip.y - arrowUnit.y * arrowHead - arrowNormal.y * arrowHead}`,
  ].join(" ");
  const mirrorTransform = `translate(${cx} ${cy}) scale(${flipHorizontal ? -1 : 1} ${flipVertical ? -1 : 1}) translate(${-cx} ${-cy})`;
  return (
    <g data-testid="readonly-entrance-ramp-symbol" transform={mirrorTransform}>
      <rect x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height} rx={2.5} fill="#dff2e8" stroke="#27765c" strokeWidth={1.35} />
      {showRails && (horizontalRun
        ? [cx - railOffset, cx + railOffset].map((x) => <line key={x} data-testid="readonly-ramp-rail" x1={x} y1={runStart} x2={x} y2={runEnd} fill="none" stroke="#39866a" strokeWidth={0.8} opacity={0.7} strokeLinecap="round" />)
        : [cy - railOffset, cy + railOffset].map((y) => <line key={y} data-testid="readonly-ramp-rail" x1={runStart} y1={y} x2={runEnd} y2={y} fill="none" stroke="#39866a" strokeWidth={0.8} opacity={0.7} strokeLinecap="round" />))}
      <path data-testid="readonly-ramp-layout-path" data-layout={layout} d={travelPath} fill="none" stroke="#27765c" strokeWidth={1.05} strokeLinecap="round" strokeLinejoin="round" opacity={0.82} />
      <path data-testid="readonly-ramp-direction-cue" d={arrowCue} fill="none" stroke="#27765c" strokeWidth={1.05} strokeLinecap="round" strokeLinejoin="round" opacity={0.82} />
    </g>
  );
}

// ── Furniture rendering ─────────────────────────────────────────────────────

function FurnitureVisual({ item }: { item: FloorFurniture }) {
  if (item.visible === false) return null;
  const rotation = item.rotation ?? 0;
  const centerX = item.x + item.width / 2;
  const centerY = item.y + item.height / 2;
  const mirrorTransform = item.flipX || item.flipY
    ? `translate(${centerX} ${centerY}) scale(${item.flipX ? -1 : 1} ${item.flipY ? -1 : 1}) translate(${-centerX} ${-centerY})`
    : undefined;
  return (
    <g data-testid="readonly-furniture" data-furniture-id={item.id}
      transform={`rotate(${rotation}, ${centerX}, ${centerY})`}>
      <g transform={mirrorTransform}>
        <FloorFurnitureSymbol
          type={item.type}
          assetKey={item.assetKey}
          x={item.x}
          y={item.y}
          width={item.width}
          height={item.height}
          color={item.color || "#e2e8f0"}
        />
      </g>
    </g>
  );
}

function RoomLabelVisual({ room, hovered, highlighted }: Pick<RoomVisualProps, "room" | "hovered" | "highlighted">) {
  const typeKey = room.type as RoomType;
  const colors = ROOM_COLORS[typeKey] ?? ROOM_COLORS.classroom;
  const points = roomOutlinePoints(room);
  const custom = Array.isArray(room.shapePoints) && room.shapePoints.length >= 3;
  const bounds = roomShapeBounds(points);
  const center = custom ? roomShapeLabelPoint(points) : { x: room.x + room.w / 2, y: room.y + room.h / 2 };
  const fontSize = Math.min(12.5, Math.max(7.2, Math.min(bounds.w, bounds.h * 2.4) / 29));
  const shapeSpan = roomShapeHorizontalSpan(points, center.y);
  const labelSpan = shapeSpan >= Math.max(1, bounds.w * 0.1) ? shapeSpan : bounds.w;
  const maxWidth = Math.max(1, Math.min(labelSpan * 0.86, labelSpan - 8));
  const layout = layoutRoomLabel({
    text: room.name,
    maxWidth,
    fontSize,
    minFontSize: Math.max(6, fontSize * 0.82),
    paddingX: 5,
    paddingY: 3.5,
  });
  const emphasized = hovered || highlighted;
  const labelY = center.y - layout.height / 2;
  return (
    <g
      data-testid="readonly-room-label-overlay"
      data-room-id={room.id}
      className="pointer-events-none select-none"
      pointerEvents="none"
      opacity={highlighted ? 1 : hovered ? 0.95 : 0.78}
    >
      <rect
        x={center.x - layout.width / 2}
        y={labelY}
        width={layout.width}
        height={layout.height}
        rx={3}
        fill="#ffffff"
        fillOpacity={emphasized ? 0.96 : 0.88}
        stroke={colors.stroke}
        strokeOpacity={emphasized ? 0.72 : 0.42}
        strokeWidth={0.8}
      />
      <text
        x={center.x}
        y={labelY + layout.height / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={colors.text}
        fontSize={layout.fontSize}
        fontWeight="600"
        fontFamily="var(--font-sans)"
      >
        {layout.lines.map((line, index) => (
          <tspan
            key={`${room.id}-readonly-label-${index}`}
            x={center.x}
            y={roomLabelLineCenterY(labelY + layout.height / 2, index, layout.lines.length, layout.lineHeight)}
          >
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

// ── Main scene ──────────────────────────────────────────────────────────────

export interface ReadonlyFloorPlanSceneProps {
  floor: FloorPlan;
  /** Building entrances are supplied separately because FloorPlan stores only
   * the stable buildingEntranceId on generated doors. */
  entrances?: readonly CampusEntrance[];
  mapMode?: "standard" | "accessible" | "emergency";
  highlightedRoomId?: string | null;
  hoveredRoomId?: string | null;
  onRoomClick?: (roomId: string) => void;
  onRoomHover?: (roomId: string) => void;
  onRoomHoverEnd?: () => void;
  onDoorClick?: (doorId: string) => void;
}

/**
 * Read-only scene that renders the full authored FloorPlan data.
 * This replaces the legacy room-only rendering on the student-facing CampusMapPage.
 */
export function ReadonlyFloorPlanScene({
  floor,
  entrances = [],
  mapMode = "standard",
  highlightedRoomId,
  hoveredRoomId,
  onRoomClick,
  onRoomHover,
  onRoomHoverEnd,
  onDoorClick,
}: ReadonlyFloorPlanSceneProps) {
  const canvasW = floor.canvasW || 440;
  const canvasH = floor.canvasH || 290;
  const floorShapeRegions = getFloorShapeRegions(floor);
  const floorShapeBounds = getFloorShapeBounds(floorShapeRegions);
  const floorShapeClipId = `readonly-floor-shape-${floor.id}`.replace(/[^A-Za-z0-9_-]/g, "-");

  const sortedRooms = sortFloorItemsByLocalZ(floor.rooms || []);

  // Filter visible elements
  const visibleWalls = sortFloorItemsByLocalZ((floor.walls || []).filter((w) => w.visible !== false));
  const visibleDoors = sortFloorItemsByLocalZ((floor.doors || []).filter((d) => d.visible !== false));
  const visibleWindows = sortFloorItemsByLocalZ((floor.windows || []).filter((w) => w.visible !== false));
  const visibleStairs = sortFloorItemsByLocalZ((floor.stairs || []).filter((s) => s.visible !== false));
  const visibleRamps = sortFloorItemsByLocalZ((floor.ramps || []).filter((r) => r.visible !== false));
  const visibleElevators = sortFloorItemsByLocalZ((floor.elevators || []).filter((e) => e.visible !== false));
  const visibleLabels = sortFloorItemsByLocalZ(floor.labels || []);
  const visibleFurniture = sortFloorItemsByLocalZ((floor.furniture || []).filter((f) => f.visible !== false));
  const visiblePaths = floor.paths || [];
  const exteriorZones = [...(floor.exteriorZones || [])].sort(
    (a, b) => (a.zOrder ?? 0) - (b.zOrder ?? 0),
  );
  const entranceSteps = [...(floor.entranceSteps || [])].sort(
    (a, b) => (a.zOrder ?? 0) - (b.zOrder ?? 0),
  );
  const entranceRamps = [...(floor.entranceRamps || [])].sort(
    (a, b) => (a.zOrder ?? 0) - (b.zOrder ?? 0),
  );
  const exteriorZoneById = new Map(exteriorZones.map((zone) => [zone.id, zone]));
  const entranceById = new Map(entrances.map((entrance) => [entrance.id, entrance]));
  const wallById = new Map(visibleWalls.map((wall) => [wall.id, wall]));

  return (
    <g data-testid="readonly-floor-plan-scene">
      <defs><clipPath id={floorShapeClipId}><path d={floorShapeRegions.map((region) => `M ${region.x} ${region.y} h ${region.width} v ${region.height} h ${-region.width} Z`).join(" ")} /></clipPath></defs>
      {/* Published/read-only view shows the authored surface only; the
          authoring grid intentionally never leaks into the student map. */}
      <g clipPath={`url(#${floorShapeClipId})`}>
        <FloorGroundSurface
          x={floorShapeBounds.x}
          y={floorShapeBounds.y}
          width={floorShapeBounds.width}
          height={floorShapeBounds.height}
          appearance={floor.appearance}
          legacyColor={floor.backgroundColor}
          idPrefix={`readonly-floor-${floor.id}`}
          dataTestId="readonly-floor-surface"
        />
      </g>

      {/* Mode tints */}
      {mapMode === "emergency" && (
        <rect x={floorShapeBounds.x} y={floorShapeBounds.y} width={floorShapeBounds.width} height={floorShapeBounds.height} fill="var(--map-route, #dc2626)" opacity={0.05} clipPath={`url(#${floorShapeClipId})`} />
      )}
      {mapMode === "accessible" && (
        <rect x={floorShapeBounds.x} y={floorShapeBounds.y} width={floorShapeBounds.width} height={floorShapeBounds.height} fill="var(--map-route-start, #16a34a)" opacity={0.05} clipPath={`url(#${floorShapeClipId})`} />
      )}

      {/* Semi-outdoor authored spaces are part of the published floor scene.
          They are drawn before paths/furniture so a veranda remains a surface
          beneath its chairs, tables, and walking connections. */}
      {exteriorZones.map((zone) => (
        <ExteriorZoneVisual key={zone.id} zone={zone} canvasW={canvasW} canvasH={canvasH} />
      ))}
      {entranceSteps.map((item) => {
        const parent = item.parentZoneId ? exteriorZoneById.get(item.parentZoneId) : undefined;
        const geometry = parent
          ? exteriorZoneAccessFeatureGeometry(parent, item, canvasW, canvasH)
          : { x: item.x, y: item.y, width: item.width, height: item.height };
        if (!geometry) return null;
        const featureSide: BuildingEntranceEdge = parent && "side" in geometry ? geometry.side : "bottom";
        return (
          <g
            key={item.id}
            data-testid="readonly-entrance-steps"
            data-entrance-steps-id={item.id}
            data-edge={featureSide}
            opacity={item.visible === false ? 0.35 : 1}
          >
            <ExteriorEntranceStepsVisual
              bounds={geometry}
              side={featureSide}
              direction={item.direction}
              flipHorizontal={item.flipHorizontal}
              flipVertical={item.flipVertical}
            />
          </g>
        );
      })}
      {entranceRamps.map((item) => {
        const parent = item.parentZoneId ? exteriorZoneById.get(item.parentZoneId) : undefined;
        const geometry = parent
          ? exteriorZoneAccessFeatureGeometry(parent, item, canvasW, canvasH)
          : { x: item.x, y: item.y, width: item.width, height: item.height };
        if (!geometry) return null;
        const featureSide: BuildingEntranceEdge = parent && "side" in geometry ? geometry.side : "bottom";
        return (
          <g
            key={item.id}
            data-testid="readonly-entrance-ramp"
            data-entrance-ramp-id={item.id}
            data-edge={featureSide}
            opacity={item.visible === false ? 0.35 : 1}
          >
            <ExteriorAccessibleRampVisual
              bounds={geometry}
              side={featureSide}
              direction={item.direction}
              layout={item.layout}
              flipHorizontal={item.flipHorizontal}
              flipVertical={item.flipVertical}
            />
          </g>
        );
      })}

      {/* Walking paths */}
      {visiblePaths.map((path) => (
        <PathVisual key={path.id} path={path} />
      ))}

      {/* Room fills form the back physical band. */}
      <g data-semantic-layer="room-fills">
        {sortedRooms.map((room) => (
          <RoomVisual
            key={room.id}
            room={room}
            hovered={hoveredRoomId === room.id}
            highlighted={highlightedRoomId === room.id}
            mapMode={mapMode}
            onClick={onRoomClick}
            onMouseEnter={onRoomHover}
            onMouseLeave={onRoomHoverEnd}
          />
        ))}
      </g>

      {/* Furniture remains in its own local ordering band below architecture. */}
      <g data-semantic-layer="furniture">
        {visibleFurniture.map((item) => (
          <FurnitureVisual key={item.id} item={item} />
        ))}
      </g>

      {/* Walls cover Furniture, then attached openings cover the Wall strokes. */}
      <g data-semantic-layer="walls">
        {visibleWalls.map((wall) => (
          <WallVisual key={wall.id} wall={wall} />
        ))}
      </g>

      <g data-semantic-layer="openings">
        {visibleWindows.map((win) => (
          <WindowVisual key={win.id} window={win} />
        ))}
        {visibleDoors.map((door) => (
          <DoorVisual
            key={door.id}
            door={door}
            entrance={door.buildingEntranceId ? entranceById.get(door.buildingEntranceId) : undefined}
            onClick={onDoorClick}
          />
        ))}
      </g>

      {/* Stairs */}
      {visibleStairs.map((stair) => (
        <StairsVisual key={stair.id} stairs={stair} />
      ))}

      {/* Ramps */}
      {visibleRamps.map((ramp) => (
        <RampVisual key={ramp.id} ramp={ramp} />
      ))}

      {/* Elevators */}
      {visibleElevators.map((elevator) => (
        <ElevatorVisual key={elevator.id} elevator={elevator} />
      ))}

      {/* Room names are an overlay, so physical content cannot obscure them. */}
      {sortedRooms.map((room) => (
        <RoomLabelVisual
          key={`readonly-room-label-${room.id}`}
          room={room}
          hovered={hoveredRoomId === room.id}
          highlighted={highlightedRoomId === room.id}
        />
      ))}

      {/* Labels (rendered last, on top) */}
      {visibleLabels.map((label) => (
        <LabelVisual key={label.id} label={label} />
      ))}
    </g>
  );
}

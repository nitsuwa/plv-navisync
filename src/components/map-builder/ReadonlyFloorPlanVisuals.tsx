/**
 * ReadonlyFloorPlanVisuals — Presentation-only rendering of the authored
 * FloorPlan data for the student-facing CampusMapPage.
 *
 * Renders walls, doors, windows, stairs, ramps, elevators, labels, rooms,
 * and walking paths from the actual admin-created floor plan — not the
 * simplified legacy room-only format.
 */

import type { FloorPlan, FloorRoom, FloorWall, FloorDoor, FloorWindow, FloorStairs, FloorRamp, FloorElevatorItem, FloorLabel, FloorFurniture, FloorPath } from "./types";
import type { CampusEntrance } from "./types";
import { FloorGroundSurface } from "./FloorGroundSurface";
import { getFloorShapeBounds, getFloorShapeRegions } from "../../lib/floorShape";
import { ROOM_COLORS, type RoomType } from "../../data/floorPlans";
import { EntranceDirectionBadge } from "./EntranceDirectionBadge";
import { CanvasAssetVisual } from "../canvas/CanvasAssetVisual";
import { getCanvasAsset, resolveCanvasAssetKey } from "../canvas/canvasAssetCatalog";
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

// ── Furniture rendering ─────────────────────────────────────────────────────

function FurnitureVisual({ item }: { item: FloorFurniture }) {
  if (item.visible === false) return null;
  const assetKey = resolveCanvasAssetKey(item);
  const asset = assetKey ? getCanvasAsset(assetKey) : undefined;
  const cx = item.width / 2;
  const cy = item.height / 2;
  const mirrorTransform = item.flipX || item.flipY
    ? `translate(${cx} ${cy}) scale(${item.flipX ? -1 : 1} ${item.flipY ? -1 : 1}) translate(${-cx} ${-cy})`
    : undefined;
  return (
    <g data-testid="readonly-furniture" data-furniture-id={item.id}
      transform={`translate(${item.x},${item.y}) rotate(${item.rotation || 0},${item.width / 2},${item.height / 2})`}>
      <g transform={mirrorTransform}>
        {asset?.surfaces.includes("map") ? (
          <CanvasAssetVisual assetKey={asset.key} label={item.name} x={0} y={0} width={item.width} height={item.height} style={{ color: item.color }} />
        ) : (
          <rect x={0} y={0} width={item.width} height={item.height} rx={1}
            fill={item.color || "#e2e8f0"} stroke={item.color || "#94a3b8"}
            strokeWidth={0.8} opacity={0.7} />
        )}
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

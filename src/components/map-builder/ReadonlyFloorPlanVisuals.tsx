/**
 * ReadonlyFloorPlanVisuals — Presentation-only rendering of the authored
 * FloorPlan data for the student-facing CampusMapPage.
 *
 * Renders walls, doors, windows, stairs, ramps, elevators, labels, rooms,
 * and walking paths from the actual admin-created floor plan — not the
 * simplified legacy room-only format.
 */

import type { FloorPlan, FloorRoom, FloorWall, FloorDoor, FloorWindow, FloorStairs, FloorRamp, FloorElevatorItem, FloorLabel, FloorFurniture, FloorPath } from "./types";
import { ROOM_COLORS, type RoomType } from "../../data/floorPlans";

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

  return (
    <g
      data-testid="readonly-room"
      data-room-id={room.id}
      style={{ cursor: onClick ? "pointer" : undefined }}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick(room.id); } : undefined}
      onMouseEnter={onMouseEnter ? () => onMouseEnter(room.id) : undefined}
      onMouseLeave={onMouseLeave}
    >
      {highlighted && (
        <rect x={room.x - 3} y={room.y - 3} width={room.w + 6} height={room.h + 6} rx={2}
          fill="none" stroke="#0e2a6e" strokeWidth={2.5}
          style={{ animation: "border-glow 2s ease-in-out infinite" }} />
      )}
      <rect x={room.x} y={room.y} width={room.w} height={room.h} rx={1}
        fill={fill} fillOpacity={opacity}
        stroke={stroke} strokeWidth={strokeWidth} />
      {/* Interior depth shadows */}
      {!highlighted && (
        <>
          <line x1={room.x + 1} y1={room.y + 1} x2={room.x + room.w - 1} y2={room.y + 1}
            stroke={colors.text} strokeWidth={1.5} opacity={0.08} />
          <line x1={room.x + 1} y1={room.y + 1} x2={room.x + 1} y2={room.y + room.h - 1}
            stroke={colors.text} strokeWidth={1.5} opacity={0.08} />
        </>
      )}
      {/* Room label */}
      {room.w >= 40 && room.h >= 20 && (
        <text x={room.x + room.w / 2} y={room.y + room.h / 2 - 3}
          textAnchor="middle" fill={colors.text}
          fontSize={room.w > 80 ? 7 : 5.5} fontWeight="600"
          className="pointer-events-none select-none">
          {room.name.length > 14 ? room.name.slice(0, 12) + "…" : room.name}
        </text>
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

function DoorVisual({ door, onClick }: { door: FloorDoor; onClick?: (doorId: string) => void }) {
  if (door.visible === false) return null;
  const { x, y, width, color, direction } = door;
  const half = width / 2;
  const leaf = width * 0.85;

  // Determine rotation from wall angle (default to horizontal)
  const rot = door.wallId ? 0 : 0; // simplified — walls handle orientation

  return (
    <g data-testid="readonly-door" data-door-id={door.id}
      transform={`translate(${x},${y}) rotate(${rot})`}
      style={{ cursor: onClick ? 'pointer' : undefined }}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick(door.id); } : undefined}>
      {/* Wall cut (clear opening) */}
      <line x1={-half} y1={0} x2={half} y2={0}
        stroke="var(--map-floor-bg, #f5f3ef)" strokeWidth={(door as Record<string, unknown>).thickness as number ?? 4} />
      {direction === "double" ? (
        <>
          {/* Double door — two leaves */}
          <line x1={-half} y1={-5.5} x2={half} y2={-5.5}
            stroke={color} strokeWidth={2.4} strokeLinecap="round" />
          <circle cx={-half} cy={0} r={2.3} fill={color} />
          <circle cx={half} cy={0} r={2.3} fill={color} />
        </>
      ) : direction === "sliding" ? (
        <line x1={-half} y1={0} x2={half} y2={0}
          stroke={color} strokeWidth={2.5} strokeLinecap="round"
          strokeDasharray="3 2" />
      ) : (
        <>
          {/* Single door — hinge + leaf + swing arc */}
          <circle cx={-half} cy={0} r={2.4} fill={color} />
          <line x1={-half} y1={0} x2={-half} y2={-leaf}
            stroke={color} strokeWidth={2.7} strokeLinecap="round" />
          <path d={`M ${-half} ${-leaf} A ${leaf} ${leaf} 0 0 0 ${half} 0`}
            fill="none" stroke={color} strokeWidth={1} opacity={0.4}
            strokeDasharray="2 2" />
        </>
      )}
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

function WindowVisual({ window: win }: { window: FloorWindow }) {
  if (win.visible === false) return null;
  const half = win.width / 2;
  return (
    <g data-testid="readonly-window" data-window-id={win.id}
      transform={`translate(${win.x},${win.y})`}>
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
  return (
    <g data-testid="readonly-furniture" data-furniture-id={item.id}
      transform={`translate(${item.x},${item.y}) rotate(${item.rotation || 0},${item.width / 2},${item.height / 2})`}>
      <rect x={0} y={0} width={item.width} height={item.height} rx={1}
        fill={item.color || "#e2e8f0"} stroke={item.color || "#94a3b8"}
        strokeWidth={0.8} opacity={0.7} />
    </g>
  );
}

// ── Main scene ──────────────────────────────────────────────────────────────

export interface ReadonlyFloorPlanSceneProps {
  floor: FloorPlan;
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
  const bgColor = floor.backgroundColor || "var(--map-floor-bg, #f8f6f1)";

  // Sort rooms by zOrder for proper layering
  const sortedRooms = [...(floor.rooms || [])].sort(
    (a, b) => (a.zOrder ?? 0) - (b.zOrder ?? 0),
  );

  // Filter visible elements
  const visibleWalls = (floor.walls || []).filter((w) => w.visible !== false);
  const visibleDoors = (floor.doors || []).filter((d) => d.visible !== false);
  const visibleWindows = (floor.windows || []).filter((w) => w.visible !== false);
  const visibleStairs = (floor.stairs || []).filter((s) => s.visible !== false);
  const visibleRamps = (floor.ramps || []).filter((r) => r.visible !== false);
  const visibleElevators = (floor.elevators || []).filter((e) => e.visible !== false);
  const visibleLabels = floor.labels || [];
  const visibleFurniture = (floor.furniture || []).filter((f) => f.visible !== false);
  const visiblePaths = floor.paths || [];

  return (
    <g data-testid="readonly-floor-plan-scene">
      {/* Background */}
      <rect width={canvasW} height={canvasH} fill={bgColor} />

      {/* Grid (if enabled) */}
      {floor.showGrid !== false && (
        <>
          {Array.from({ length: Math.ceil(canvasW / (floor.gridSize || 20)) + 1 }, (_, i) => (
            <line key={`gv${i}`} x1={i * (floor.gridSize || 20)} y1={0}
              x2={i * (floor.gridSize || 20)} y2={canvasH}
              stroke="var(--map-boundary, #cbd5e1)" strokeWidth={0.5} opacity={0.15} />
          ))}
          {Array.from({ length: Math.ceil(canvasH / (floor.gridSize || 20)) + 1 }, (_, i) => (
            <line key={`gh${i}`} x1={0} y1={i * (floor.gridSize || 20)}
              x2={canvasW} y2={i * (floor.gridSize || 20)}
              stroke="var(--map-boundary, #cbd5e1)" strokeWidth={0.5} opacity={0.15} />
          ))}
        </>
      )}

      {/* Mode tints */}
      {mapMode === "emergency" && (
        <rect width={canvasW} height={canvasH} fill="var(--map-route, #dc2626)" opacity={0.05} />
      )}
      {mapMode === "accessible" && (
        <rect width={canvasW} height={canvasH} fill="var(--map-route-start, #16a34a)" opacity={0.05} />
      )}

      {/* Walking paths */}
      {visiblePaths.map((path) => (
        <PathVisual key={path.id} path={path} />
      ))}

      {/* Walls (rendered below rooms for depth) */}
      {visibleWalls.map((wall) => (
        <WallVisual key={wall.id} wall={wall} />
      ))}

      {/* Rooms */}
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

      {/* Windows */}
      {visibleWindows.map((win) => (
        <WindowVisual key={win.id} window={win} />
      ))}

      {/* Doors */}
      {visibleDoors.map((door) => (
        <DoorVisual key={door.id} door={door} onClick={onDoorClick} />
      ))}

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

      {/* Furniture */}
      {visibleFurniture.map((item) => (
        <FurnitureVisual key={item.id} item={item} />
      ))}

      {/* Labels (rendered last, on top) */}
      {visibleLabels.map((label) => (
        <LabelVisual key={label.id} label={label} />
      ))}
    </g>
  );
}

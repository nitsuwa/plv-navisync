import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CheckCircle2, XCircle } from "lucide-react";
import { MARKER_STYLES } from "../../data/mapData";
import type { Campus, CampusBuilding, CampusMarker, SimpleTool, EditorLayer, CampusSelection, RubberBand, CampusDecorAsset, NavigationNode, NavigationEdge } from "./types";
import { DECOR_ASSET_MAP, BUILDING_TYPE_MAP, genId, getRotatedAABB } from "./constants";
import { computeBuildingPlacement, screenToWorld } from "../../lib/editorPlacement";
import { decorRenderScale, decorSelectionOutlineBox, decorWorldSize } from "../../lib/decorVisual";
import { mergeOutdoorStack } from "../../lib/campusStack";
import { DecorAssetArt, DecorAssetVisual } from "./DecorAssetVisual";
import { BUILDING_ENTRANCE_TYPE_COLORS, entranceDisplayName, entranceWorldPosition, normalizeEntranceType } from "../../lib/buildingEntrances";

// ── Rotation-aware resize cursor helpers (shared by buildings and decor assets) ──
function angleToCursor(deg: number): string {
  const a = ((deg % 360) + 360) % 360;
  if (a < 22.5 || a >= 337.5) return "ew-resize";
  if (a < 67.5) return "nwse-resize";
  if (a < 112.5) return "ns-resize";
  if (a < 157.5) return "nesw-resize";
  if (a < 202.5) return "ew-resize";
  if (a < 247.5) return "nwse-resize";
  if (a < 292.5) return "ns-resize";
  return "nesw-resize";
}
const CORNER_ANGLES: Record<string, number> = { ne: -45, se: 45, sw: 135, nw: 225 };
const EDGE_ANGLES: Record<string, number> = { n: 270, s: 90, e: 0, w: 180 };
const getCornerCursor = (corner: string, rot: number) => angleToCursor((CORNER_ANGLES[corner] ?? 45) + rot);
const getEdgeCursor = (edge: string, rot: number) => angleToCursor((EDGE_ANGLES[edge] ?? 0) + rot);

interface CanvasProps {
  campus: Campus;
  tool: SimpleTool;
  layer: EditorLayer;
  selected: CampusSelection | null;
  multiSelected: string[];
  rubberBand: RubberBand | null;
  drawingPath: { x: number; y: number }[];
  snapGrid: boolean;
  zoom: number;
  pan: { x: number; y: number };
  svgRef: React.RefObject<SVGSVGElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  cursor: string;
  buildingDrag?: { sx: number; sy: number; cx: number; cy: number } | null;
  guides?: { type: "h" | "v"; pos: number }[];
  cursorPos?: { x: number; y: number } | null;
  overlappingBuildings?: Set<string>;
  invalidBuildings?: Set<string>;
  onCanvasDown: (e: React.MouseEvent<SVGSVGElement>) => void;
  onCanvasMove: (e: React.MouseEvent<SVGSVGElement>) => void;
  onCanvasUp: (e: React.MouseEvent<SVGSVGElement>) => void;
  /** Fired when the cursor leaves the canvas (defaults to onCanvasUp for backward compatibility) */
  onCanvasLeave?: (e: React.MouseEvent<SVGSVGElement>) => void;
  onCanvasDblClick: (e: React.MouseEvent<SVGSVGElement>) => void;
  onItemDown: (e: React.MouseEvent, type: "building" | "marker" | "decorAsset" | "navNode", id: string, ox: number, oy: number) => void;
  onEntranceDown?: (e: React.MouseEvent, buildingId: string, entranceId: string, ox: number, oy: number) => void;
  onItemContextMenu?: (e: React.MouseEvent, type: "building" | "marker" | "path" | "decorAsset", id: string) => void;
  onResizeStart?: (e: React.MouseEvent, b: CampusBuilding, corner: string) => void;
  onRotateStart?: (e: React.MouseEvent, b: CampusBuilding) => void;
  onBuildingDoubleClick?: (id: string) => void;
  onPathClick: (id: string) => void;
  onSelect: (sel: CampusSelection | null) => void;
  /** Navigation-graph authoring (B5 Phase 1): edges/nodes render + interaction in the navigation layer. */
  navNodes?: NavigationNode[];
  navEdges?: NavigationEdge[];
  /** Node the Path tool is currently connecting FROM (dashed start ring + live preview). */
  navConnectStartId?: string | null;
  /** Live pointer position while the Path tool has an active start node. */
  navPreview?: { x: number; y: number } | null;
  /** Entrance currently targeted by Add Waypoint / Connect Path (highlighted). */
  navEntranceHover?: { buildingId: string; entranceId: string; x: number; y: number } | null;
  /** Click an edge (select mode selects it; path mode is ignored). */
  onNavEdgeSelect?: (e: React.MouseEvent, id: string) => void;
  onResetView?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onSetTool?: (t: SimpleTool) => void;
  onToggleSnap?: () => void;
  onWheel?: (e: React.WheelEvent<HTMLDivElement>) => void;
  snapGrid?: boolean;
  /** Called when an asset is dropped from the palette onto the canvas */
  onDropAsset?: (asset: CampusDecorAsset) => void;
  /** Called when a building type is dropped from the palette */
  onDropBuilding?: (type: string, x: number, y: number) => void;
  /** Canvas width/height for coordinate conversion */
  canvasW?: number;
  canvasH?: number;
  /** ID of the building currently being rotated (handle hidden during rotation, like Canva) */
  rotatingId?: string | null;
  /** Current rotation angle while actively rotating (for floating degree indicator) */
  rotatingAngle?: number;
  /** ID of the building currently being resized (shows dimension indicator) */
  resizingId?: string | null;
  /** ID of the decor asset currently being rotated (handle hidden during rotation) */
  decorRotatingId?: string | null;
  /** ID of the decor asset currently being resized (shows scale indicator) */
  decorResizingId?: string | null;
  /** Called when the decor asset rotation handle is grabbed */
  onDecorRotateStart?: (e: React.MouseEvent, da: CampusDecorAsset) => void;
  /** Called when a decor asset resize corner/edge is grabbed */
  onDecorResizeStart?: (e: React.MouseEvent, da: CampusDecorAsset, corner: string) => void;
  /** Route to highlight from the test-navigation panel (waypoints + color) */
  highlightedRoute?: { waypoints: { x: number; y: number }[]; color: string } | null;
  /** ID of a just-completed path to play the draw-in animation on */
  animatingPathId?: string | null;
}

// ── Drag-over indicator component — shows a real SVG preview of the dragged asset at the cursor ──
function DragOverlay({
  x, y, valid, label,
  type, assetType,
}: {
  x: number; y: number; valid: boolean; label: string;
  type: "decorAsset" | "buildingType";
  assetType?: string;
}) {
  const decor = type === "decorAsset" && assetType ? DECOR_ASSET_MAP[assetType] : null;
  const building = type === "buildingType" && assetType ? BUILDING_TYPE_MAP[assetType] : null;

  const previewSize = 56;
  const borderColor = valid ? "rgba(34,197,94,0.7)" : "rgba(239,68,68,0.7)";
  const bgColor = valid ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)";

  return (
    <>
      {/* Real SVG preview floating at cursor */}
      <div
        className="absolute z-20 pointer-events-none flex items-center justify-center"
        style={{
          left: x,
          top: y,
          transform: "translate(-50%, -50%)",
          width: previewSize,
          height: previewSize,
        }}
      >
        {/* Outer glow ring */}
        <div
          className="absolute inset-0 rounded-full transition-colors"
          style={{
            border: `2px solid ${borderColor}`,
            background: bgColor,
            boxShadow: valid
              ? `0 0 20px rgba(34,197,94,0.2)`
              : `0 0 20px rgba(239,68,68,0.2)`,
            transform: "scale(1.4)",
          }}
        />
        {/* Inner preview shape */}
        <div className="relative flex items-center justify-center" style={{ width: 32, height: 32 }}>
          {decor && (
            <DecorAssetVisual type={assetType ?? ""} className="w-8 h-8 drop-shadow-md" />
          )}
          {building && (
            <svg width={32} height={32} viewBox="0 0 40 40" className="drop-shadow-md">
              <rect x={4} y={8} width={32} height={28} rx={4} fill={building.color} opacity={0.9} />
              <rect x={8} y={4} width={24} height={6} rx={2} fill={building.color} opacity={0.7} />
              <text x={20} y={28} textAnchor="middle" fill="white" fontSize={7} fontWeight="900">
                {building.label.slice(0, 2).toUpperCase()}
              </text>
            </svg>
          )}
          {!decor && !building && (
            <div className="w-7 h-7 rounded-lg border-2 border-dashed" style={{ borderColor }} />
          )}
        </div>
      </div>

      {/* Compact label pill floating near the preview */}
      <div
        className="absolute z-20 pointer-events-none"
        style={{ left: x + 32, top: y - 16 }}
      >
        <div
          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold shadow-lg border transition-colors ${
            valid
              ? "bg-green-50/90 border-green-300 text-green-700 dark:bg-green-900/40 dark:border-green-600 dark:text-green-300"
              : "bg-red-50/90 border-red-300 text-red-700 dark:bg-red-900/40 dark:border-red-600 dark:text-red-300"
          }`}
          style={{ backdropFilter: "blur(8px)" }}
        >
          {valid ? (
            <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />
          ) : (
            <XCircle className="h-2.5 w-2.5 shrink-0" />
          )}
          <span className="truncate max-w-[100px]">{valid ? `Place ${label}` : "Can't place here"}</span>
        </div>
      </div>
    </>
  );
}

export function Canvas({
  campus, tool, layer, selected, multiSelected, rubberBand, drawingPath, snapGrid,
  zoom, pan, svgRef, containerRef, cursor,
  buildingDrag, guides, cursorPos, overlappingBuildings,
  onCanvasDown, onCanvasMove, onCanvasUp, onCanvasLeave, onCanvasDblClick,
  onItemDown, onEntranceDown, onItemContextMenu, onResizeStart, onBuildingDoubleClick, onPathClick, onSelect,
  onResetView, onZoomIn, onZoomOut, onSetTool, onToggleSnap,
  onWheel, invalidBuildings = new Set(),
  onDropAsset, onDropBuilding,
  onRotateStart, canvasW, canvasH,
  rotatingId, rotatingAngle,
  resizingId, highlightedRoute, animatingPathId,
  decorRotatingId, decorResizingId, onDecorRotateStart, onDecorResizeStart,
  navNodes, navEdges, navConnectStartId, navPreview, navEntranceHover, onNavEdgeSelect,
}: CanvasProps) {
  const buildings = campus.buildings;
  const markers = campus.markers;
  const paths = campus.paths;
  const decorAssets = campus.decorAssets ?? [];

  // B5 Phase 2.9: the nav props are the SCOPED collection the outdoor editor
  // derives (outdoor-only entities) — indoor floor nodes/edges never render
  // here, even when their building sits on this canvas. The campus fallback is
  // only a safety net for legacy direct usage.
  const renderNavNodes = navNodes ?? campus.navNodes ?? [];
  const renderNavEdges = navEdges ?? campus.navEdges ?? [];

  // Normalized canvas dimensions: prefer the explicit props (CampusEditor
  // passes its safe/normalized dims) so a transiently-unset campus can never
  // render a degenerate viewBox or collapse pointer conversion toward (0,0).
  const cw = (canvasW ?? campus.canvasW) || 900;
  const ch = (canvasH ?? campus.canvasH) || 680;

  // ── ONE cross-type visual stack for buildings + decorative assets ──
  // Document order == stacking order, so a bench can sit in front of part of a
  // building and a tree behind it (B2 cross-type layer ordering). Markers,
  // paths, nav/event objects stay in their own fixed layers.
  const stackedOutdoor = mergeOutdoorStack(buildings, decorAssets);

  // ── Drag-and-drop state ──
  const [dragOver, setDragOver] = useState<{
    x: number; y: number;
    canvasX: number; canvasY: number;
    valid: boolean; label: string;
    type: "decorAsset" | "buildingType";
    assetType?: string;
  } | null>(null);
  const dragCounterRef = useRef(0);
  const dragLabelRef = useRef("Item");
  const dragTypeRef = useRef<"decorAsset" | "buildingType">("decorAsset");
  // Use refs to avoid stale closures in drag handlers
  const buildingsRef = useRef(buildings);
  buildingsRef.current = buildings;

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";

    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Convert screen coords to canvas coords — the SAME shared, letterbox-aware
    // path every other editor interaction uses (no independent formula here).
    const svg = svgRef.current;
    if (!svg) return;
    const svgRect = svg.getBoundingClientRect();
    const pt = screenToWorld(e.clientX, e.clientY, svgRect, cw, ch, pan, zoom);
    const canvasX = Math.round(pt.x);
    const canvasY = Math.round(pt.y);

    // Check if position is valid (inside canvas bounds, not overlapping)
    const inBounds = canvasX >= 0 && canvasY >= 0 && canvasX <= cw && canvasY <= ch;

    // Check overlap against existing buildings (rotated-AABB collision) — using ref to avoid stale closure
    let overlapsBuilding = false;
    const dropW = 24;
    const dropH = 24;
    const dropBox = { x: canvasX, y: canvasY, w: dropW, h: dropH };
    for (const b of buildingsRef.current) {
      const ba = getRotatedAABB(b.x, b.y, b.width, b.height, b.rotation ?? 0);
      if (
        dropBox.x < ba.x + ba.width &&
        dropBox.x + dropBox.w > ba.x &&
        dropBox.y < ba.y + ba.height &&
        dropBox.y + dropBox.h > ba.y
      ) {
        overlapsBuilding = true;
        break;
      }
    }

    setDragOver({
      x, y,
      canvasX, canvasY,
      valid: inBounds && !overlapsBuilding,
      label: dragLabelRef.current,
      type: dragTypeRef.current,
    });
  }, [cw, ch, pan, zoom, svgRef, containerRef]);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragCounterRef.current += 1;

    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    try {
      const raw = e.dataTransfer.getData("text/plain");
      const data = JSON.parse(raw);
      if (data.type === "decorAsset") {
        const label = DECOR_ASSET_MAP[data.assetType]?.label || data.assetType;
        dragLabelRef.current = label;
        dragTypeRef.current = "decorAsset";
        setDragOver({
          x: cx, y: cy,
          canvasX: 0, canvasY: 0,
          valid: true,
          label,
          type: "decorAsset",
          assetType: data.assetType,
        });
      } else if (data.type === "buildingType") {
        const label = data.label || "Building";
        dragLabelRef.current = label;
        dragTypeRef.current = "buildingType";
        setDragOver({
          x: cx, y: cy,
          canvasX: 0, canvasY: 0,
          valid: true,
          label,
          type: "buildingType",
          assetType: data.assetType,
        });
      }
    } catch {
      // Not our data format — ignore
    }
  }, [containerRef]);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setDragOver(null);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(null);
    dragCounterRef.current = 0;

    // Convert screen coords to canvas coords — same shared conversion as all
    // other tools (letterbox-aware, zoom/pan-aware).
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const pt = screenToWorld(e.clientX, e.clientY, rect, cw, ch, pan, zoom);
    const canvasX = Math.round(pt.x);
    const canvasY = Math.round(pt.y);

    // Clamp to canvas bounds
    const clampedX = Math.max(0, Math.min(cw, canvasX));
    const clampedY = Math.max(0, Math.min(ch, canvasY));

    try {
      const raw = e.dataTransfer.getData("text/plain");
      const data = JSON.parse(raw);

      if (data.type === "decorAsset" && onDropAsset) {
        const asset: CampusDecorAsset = {
          id: genId("dec"),
          type: data.assetType,
          x: clampedX,
          y: clampedY,
          rotation: 0,
          scale: 1,
        };
        onDropAsset(asset);
      } else if (data.type === "buildingType" && onDropBuilding) {
        onDropBuilding(data.assetType || data.label, clampedX, clampedY);
      }
    } catch {
      // Ignore invalid data
    }
  }, [cw, ch, pan, zoom, svgRef, onDropAsset, onDropBuilding]);

  // Cleanup drag counter on unmount
  useEffect(() => {
    return () => { dragCounterRef.current = 0; };
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-hidden relative"
      style={{ background: "#e8eaf0" }}
      onWheel={onWheel}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag-over indicator — shows a real SVG preview of the dragged asset */}
      {dragOver && (
        <DragOverlay
          x={dragOver.x}
          y={dragOver.y}
          valid={dragOver.valid}
          label={dragOver.label}
          type={dragOver.type}
          assetType={dragOver.assetType}
        />
      )}

      {/* Dot grid pattern overlay — uses campus gridSize */}
      <div className="absolute inset-0 z-0 pointer-events-none" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, rgba(14,42,110,0.06) 1px, transparent 0)`,
        backgroundSize: `${campus.gridSize ?? 20}px ${campus.gridSize ?? 20}px`,
      }} />
      {/* SVG Canvas */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${cw} ${ch}`}
        className="w-full h-full"
        style={{ cursor, userSelect: "none" }}
        onMouseDown={onCanvasDown}
        onMouseMove={onCanvasMove}
        onMouseUp={onCanvasUp}
        onMouseLeave={onCanvasLeave ?? onCanvasUp}
        onDoubleClick={onCanvasDblClick}
        onContextMenu={(e) => e.preventDefault()}
      >
        <defs>
          <pattern id="dotPattern" width={campus.gridSize ?? 20} height={campus.gridSize ?? 20} patternUnits="userSpaceOnUse">
            <circle cx={(campus.gridSize ?? 20) / 2} cy={(campus.gridSize ?? 20) / 2} r={1} fill="rgba(14,42,110,0.08)" />
          </pattern>
          <filter id="dropShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx={0} dy={1} stdDeviation={2} floodColor="rgba(0,0,0,0.3)" />
          </filter>
        </defs>
        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          {/* Canvas background with subtle grid */}
          <rect data-bg="true" width={cw} height={ch} fill={(campus as unknown as { canvasColor?: string }).canvasColor ?? "#f5f3ef"} />
          <rect data-bg="true" width={cw} height={ch} fill="url(#dotPattern)" opacity={0.3} />

          {/* Empty state — compact contextual prompt, not a tutorial */}
          {layer === "campus" && buildings.length === 0 && (
            <g opacity={0.5}>
              <text x={cw / 2} y={ch / 2 - 20} textAnchor="middle" fontSize={15} fontWeight="800" fill="var(--primary)" className="pointer-events-none select-none">Start Building Your Campus</text>
              <text x={cw / 2} y={ch / 2} textAnchor="middle" fontSize={10} fill="#6b7280" className="pointer-events-none select-none">Select a building type or asset from the left panel and place it here.</text>
            </g>
          )}

          {/* All SVG content (unchanged from original) */}
          {/* Navigation empty state */}
          {layer === "navigation" && renderNavNodes.length === 0 && (
            <g opacity={0.5}>
              <text x={cw / 2} y={ch / 2 - 20} textAnchor="middle" fontSize={14} fontWeight="800" fill="#16a34a" className="pointer-events-none select-none">Build the Walking Network</text>
              <text x={cw / 2} y={ch / 2} textAnchor="middle" fontSize={10} fill="#6b7280" className="pointer-events-none select-none">Add waypoints at intersections and destinations, then connect them with Connect Path.</text>
            </g>
          )}

          {/* Major grid lines */}
          <g opacity={0.12}>
            {Array.from({ length: Math.ceil(cw / ((campus.gridSize ?? 20) * 4)) }, (_, i) => (
              <line key={`v${i}`} x1={i * (campus.gridSize ?? 20) * 4} y1={0} x2={i * (campus.gridSize ?? 20) * 4} y2={ch} stroke="rgba(14,42,110,0.2)" strokeWidth={0.5} />
            ))}
          </g>
          <g opacity={0.12}>
            {Array.from({ length: Math.ceil(ch / ((campus.gridSize ?? 20) * 4)) }, (_, i) => (
              <line key={`h${i}`} x1={0} y1={i * (campus.gridSize ?? 20) * 4} x2={cw} y2={i * (campus.gridSize ?? 20) * 4} stroke="rgba(14,42,110,0.2)" strokeWidth={0.5} />
            ))}
          </g>

          {/* Layer-specific indicators */}
          {/* B5 Phase 1.7: the old static green dashed "entrance connector" was
              removed — after completing a path to a building entrance it read as
              a leftover preview line (a ghost dashed line after completion). The
              real committed edge to the entrance-linked waypoint is the only
              connection shown; the graph stays unambiguous. */}
          {layer === "events" &&
            buildings.map((b, i) =>
              i % 2 === 0 ? (
                <g key={`evt-${b.id}`} transform={`translate(${b.x + b.width / 2},${b.y - 14})`}>
                  <circle cx={0} cy={0} r={10} fill="#d97706" opacity={0.9} />
                  <text x={0} y={4} textAnchor="middle" fontSize={10} fill="white" className="pointer-events-none select-none">★</text>
                </g>
              ) : null
            )}

          {/* Paths */}
          {paths.map((p) => {
            const pts = p.points.map((pt) => `${pt.x},${pt.y}`).join(" ");
            const isSel = selected?.type === "path" && selected.id === p.id;
            return (
              <g
                key={p.id}
                onClick={(e) => { e.stopPropagation(); if (tool === "erase") { onSelect(null); } else onPathClick(p.id); }}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onItemContextMenu?.(e, "path", p.id); }}
                style={{ cursor: tool === "erase" ? "not-allowed" : "pointer" }}
              >
                {isSel && <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth={p.width + 6} strokeLinecap="round" strokeLinejoin="round" opacity={0.35} />}
                {p.id === animatingPathId ? (
                  /* Draw-in animation for a just-completed path */
                  <motion.polyline
                    points={pts}
                    fill="none"
                    stroke={p.color}
                    strokeWidth={p.width}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0, opacity: 1 }}
                    animate={{ pathLength: 1, opacity: 0.75 }}
                    transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                  />
                ) : (
                  <polyline points={pts} fill="none" stroke={p.color} strokeWidth={p.width} strokeLinecap="round" strokeLinejoin="round" opacity={0.75} />
                )}
              </g>
            );
          })}

          {/* Test-navigation highlighted route */}
          {highlightedRoute && highlightedRoute.waypoints.length > 0 && (
            <g pointerEvents="none">
              {/* Soft glow underlay */}
              <polyline
                points={highlightedRoute.waypoints.map((w) => `${w.x},${w.y}`).join(" ")}
                fill="none"
                stroke={highlightedRoute.color}
                strokeWidth={8}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.25}
              />
              {/* Animated dashed main line */}
              <polyline
                points={highlightedRoute.waypoints.map((w) => `${w.x},${w.y}`).join(" ")}
                fill="none"
                stroke={highlightedRoute.color}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="10 6"
                opacity={0.95}
              />
              {/* Start + end markers */}
              <circle cx={highlightedRoute.waypoints[0].x} cy={highlightedRoute.waypoints[0].y} r={6} fill={highlightedRoute.color} stroke="white" strokeWidth={2} />
              <circle cx={highlightedRoute.waypoints[highlightedRoute.waypoints.length - 1].x} cy={highlightedRoute.waypoints[highlightedRoute.waypoints.length - 1].y} r={6} fill={highlightedRoute.color} stroke="white" strokeWidth={2} />
            </g>
          )}

          {/* Alignment guides */}
          {guides && guides.map((g, i) => (
            <g key={`g${i}`}>
              {g.type === "v" ? (
                <line x1={g.pos} y1={0} x2={g.pos} y2={ch} stroke="var(--accent)" strokeWidth={8} opacity={0.15} />
              ) : (
                <line x1={0} y1={g.pos} x2={cw} y2={g.pos} stroke="var(--accent)" strokeWidth={8} opacity={0.15} />
              )}
              {g.type === "v" ? (
                <line x1={g.pos} y1={0} x2={g.pos} y2={ch} stroke="var(--accent)" strokeWidth={2} strokeDasharray="5 3" opacity={0.9} />
              ) : (
                <line x1={0} y1={g.pos} x2={cw} y2={g.pos} stroke="var(--accent)" strokeWidth={2} strokeDasharray="5 3" opacity={0.9} />
              )}
              <rect x={g.type === "v" ? g.pos - 16 : cw - 36} y={g.type === "v" ? 6 : g.pos - 7} width={32} height={14} rx={3} fill="var(--accent)" fillOpacity={0.85} />
              <text x={g.type === "v" ? g.pos : cw - 20} y={g.type === "v" ? 15 : g.pos + 4} textAnchor="middle" fill="white" fontSize={8} fontWeight="800" className="pointer-events-none select-none">{g.pos}</text>
            </g>
          ))}

          {/* Rubber-band selection */}
          {rubberBand && (() => {
            const rx = Math.min(rubberBand.sx, rubberBand.cx);
            const ry = Math.min(rubberBand.sy, rubberBand.cy);
            const rw = Math.abs(rubberBand.cx - rubberBand.sx);
            const rh = Math.abs(rubberBand.cy - rubberBand.sy);
            return (
              <rect x={rx} y={ry} width={rw} height={rh} fill="rgba(14,42,110,0.06)" stroke="var(--primary)" strokeWidth={1.5} strokeDasharray="6 4" rx={2} />
            );
          })()}

          {/* Building drag preview — uses the SAME geometry function as the
              finalize step, so the preview and the created building always match
              exactly (position, size, minimums, canvas clamping). */}
          {buildingDrag && (() => {
            const r = computeBuildingPlacement(
              buildingDrag.sx, buildingDrag.sy, buildingDrag.cx, buildingDrag.cy,
              cw, ch
            );
            return (
              <g>
                <rect x={r.x} y={r.y} width={r.width} height={r.height} rx={6} fill="var(--primary)" fillOpacity={0.12} stroke="var(--primary)" strokeWidth={2} strokeDasharray="8 4" />
                <text x={r.x + r.width / 2} y={r.y + r.height / 2 + 3} textAnchor="middle" fill="var(--primary)" fontSize={10} fontWeight="700" className="pointer-events-none select-none">{r.width}×{r.height}</text>
              </g>
            );
          })()}

          {/* Drawing path */}
          {drawingPath.length > 0 && (
            <g>
              {drawingPath.length > 1 && (
                <polyline points={drawingPath.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="var(--primary)" strokeWidth={4} strokeLinecap="round" strokeDasharray="10 5" opacity={0.9} />
              )}
              {drawingPath.map((pt, i) => (
                <g key={i}>
                  <circle cx={pt.x} cy={pt.y} r={6} fill="var(--primary)" opacity={0.9} />
                  <text x={pt.x} y={pt.y - 12} textAnchor="middle" fontSize={8} fill="var(--primary)" fontWeight="700" className="select-none">{i + 1}</text>
                </g>
              ))}
            </g>
          )}

          {/* Buildings + decorative assets — ONE cross-type visual stack */}
          {stackedOutdoor.map((entry) => {
            if (entry.kind === "building") {
              const b = entry.item as CampusBuilding;
              const isSel = selected?.type === "building" && selected.id === b.id;
            const isMultiSel = multiSelected.includes(b.id);
            const isInvalid = invalidBuildings?.has(b.id) ?? false;
            const isOverlapping = overlappingBuildings?.has(b.id) ?? false;
            const cx = b.x + b.width / 2;
            const cy = b.y + b.height / 2;
            const rot = b.rotation ?? 0;
            const isVisible = b.visible ?? true;
            const isLocked = b.locked ?? false;
            const opacity = b.opacity ?? 1;
            const editorOpacity = isVisible ? opacity : Math.min(opacity, isSel || isMultiSel ? 0.35 : 0.28);
            return (
              <g key={b.id} data-hidden={isVisible ? undefined : "true"} onMouseDown={(e) => { if (isLocked) return; onItemDown(e, "building", b.id, b.x, b.y); }} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); if (isLocked) return; onItemContextMenu?.(e, "building", b.id); }} onDoubleClick={(e) => { if (isLocked) return; e.stopPropagation(); onBuildingDoubleClick?.(b.id); }} style={{ cursor: isLocked ? "default" : tool === "select" ? "move" : cursor, opacity: editorOpacity }}>
                {/* ── Rotated group: shadow, outline, handles, overlap borders, and body all rotate together ── */}
                <g transform={rot !== 0 ? `rotate(${rot}, ${cx}, ${cy})` : ''}>
                  {/* Shadow (rotated with building so it follows the visual) */}
                  <rect x={b.x + 3} y={b.y + 4} width={b.width} height={b.height} rx={8} fill="rgba(0,0,0,0.12)" />
                  {/* Multi-selection highlight */}
                  {isMultiSel && !isSel && (
                    <rect x={b.x - 4} y={b.y - 4} width={b.width + 8} height={b.height + 8} rx={8} fill="none" stroke="var(--primary)" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.6} />
                  )}
                  {/* Overlap warning border (rotated with building so it matches the actual visual) */}
                  {isOverlapping && (
                    <>
                      <rect x={b.x - 4} y={b.y - 4} width={b.width + 8} height={b.height + 8} rx={10} fill="none" stroke="#dc2626" strokeWidth={2.5} strokeDasharray="6 4" opacity={0.9} />
                      <rect x={b.x - 6} y={b.y - 6} width={b.width + 12} height={b.height + 12} rx={12} fill="none" stroke="#dc2626" strokeWidth={1} strokeDasharray="4 4" opacity={0.4} />
                    </>
                  )}
                  {/* Building body */}
                  <rect x={b.x} y={b.y} width={b.width} height={b.height} rx={8} fill={b.color} stroke={isSel ? "var(--accent)" : "rgba(255,255,255,0.5)"} strokeWidth={isSel ? 2.5 : 1.5} opacity={0.92} />
                  <rect x={b.x} y={b.y} width={b.width} height={7} rx={8} fill="rgba(0,0,0,0.12)" />
                  {!isVisible && (
                    <g className="pointer-events-none select-none" opacity={0.95}>
                      <rect x={b.x + 5} y={b.y + 5} width={18} height={14} rx={4} fill="var(--card)" stroke="var(--border)" strokeWidth={1} />
                      <path d={`M${b.x + 8} ${b.y + 12} Q${b.x + 14} ${b.y + 7} ${b.x + 20} ${b.y + 12} Q${b.x + 14} ${b.y + 17} ${b.x + 8} ${b.y + 12}Z`} fill="none" stroke="var(--muted-foreground)" strokeWidth={1.2} />
                      <circle cx={b.x + 14} cy={b.y + 12} r={2} fill="var(--muted-foreground)" />
                      <line x1={b.x + 8} y1={b.y + 17} x2={b.x + 21} y2={b.y + 6} stroke="var(--muted-foreground)" strokeWidth={1.5} strokeLinecap="round" />
                    </g>
                  )}
                  <text x={cx} y={b.y + b.height / 2 - 8} textAnchor="middle" fill="white" fontSize={11} fontWeight="800" className="pointer-events-none select-none">{b.code}</text>
                  {b.floors.length > 0 && <text x={cx} y={b.y + b.height / 2 + 4} textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize={7} className="pointer-events-none select-none">{b.floors.length}F</text>}
                  {isLocked && (
                    <g>
                      <rect x={b.x + b.width - 16} y={b.y + 4} width={12} height={10} rx={2} fill="rgba(255,255,255,0.85)" />
                      <text x={b.x + b.width - 10} y={b.y + 12} textAnchor="middle" fill="#92400e" fontSize={8} fontWeight="900" className="pointer-events-none select-none">🔒</text>
                    </g>
                  )}
                  {isInvalid && !isOverlapping && (
                    <>
                      <rect x={b.x - 5} y={b.y - 5} width={b.width + 10} height={b.height + 10} rx={10} fill="none" stroke="#dc2626" strokeWidth={2.5} strokeDasharray="8 4" opacity={0.85} className="animate-validation-pulse" />
                      <rect x={b.x - 7} y={b.y - 7} width={b.width + 14} height={b.height + 14} rx={12} fill="none" stroke="#dc2626" strokeWidth={1} strokeDasharray="4 6" opacity={0.35} />
                    </>
                  )}
                  {/* Single selection outlines + resize handles — rendered ABOVE the body so the rotation-aware resize cursors are visible on hover (rotated with building) */}
                  {isSel && (
                    <>
                      <rect x={b.x - 8} y={b.y - 8} width={b.width + 16} height={b.height + 16} rx={12} fill="none" stroke="var(--accent)" strokeWidth={5} opacity={0.15} />
                      <rect x={b.x - 6} y={b.y - 6} width={b.width + 12} height={b.height + 12} rx={10} fill="none" stroke="var(--accent)" strokeWidth={2.5} opacity={0.8} />
                      {(() => {
                        return ["nw", "ne", "sw", "se"].map((corner) => {
                          const hs = 14;
                          const hx = corner.includes("e") ? b.x + b.width - hs / 2 : b.x - hs / 2;
                          const hy = corner.includes("s") ? b.y + b.height - hs / 2 : b.y - hs / 2;
                          const cornerCursor = getCornerCursor(corner, rot);
                          return (
                            <g key={corner}>
                              <rect x={hx - 5} y={hy - 5} width={hs + 10} height={hs + 10} fill="transparent" stroke="none" style={{ cursor: cornerCursor }} onMouseDown={(e) => { e.stopPropagation(); onResizeStart?.(e, b, corner); }} />
                              <rect x={hx} y={hy} width={hs} height={hs} rx={2} fill="white" stroke="var(--accent)" strokeWidth={2} style={{ pointerEvents: "none", cursor: cornerCursor }} />
                            </g>
                          );
                        });
                      })()}
                      {["n", "s", "e", "w"].map((corner) => {
                        const HIT_EDGE = 24;
                        const edgeW = corner === "n" || corner === "s" ? b.width : HIT_EDGE;
                        const edgeH = corner === "e" || corner === "w" ? b.height : HIT_EDGE;
                        const edgeX = corner === "e" ? b.x + b.width - HIT_EDGE / 2 : corner === "w" ? b.x - HIT_EDGE / 2 : b.x;
                        const edgeY = corner === "s" ? b.y + b.height - HIT_EDGE / 2 : corner === "n" ? b.y - HIT_EDGE / 2 : b.y;
                        return <rect key={corner} x={edgeX} y={edgeY} width={edgeW} height={edgeH} fill="transparent" stroke="none" style={{ cursor: getEdgeCursor(corner, rot) }} onMouseDown={(e) => { e.stopPropagation(); onResizeStart?.(e, b, corner); }} />;
                      })}
                      {["n", "s", "e", "w"].map((corner) => {
                        const INSET = 10;
                        const innerW = corner === "n" || corner === "s" ? b.width : INSET;
                        const innerH = corner === "e" || corner === "w" ? b.height : INSET;
                        const innerX = corner === "n" || corner === "s" ? b.x : (corner === "e" ? b.x + b.width - INSET : b.x);
                        const innerY = corner === "e" || corner === "w" ? b.y : (corner === "s" ? b.y + b.height - INSET : b.y);
                        return <rect key={`i-${corner}`} x={innerX} y={innerY} width={innerW} height={innerH} fill="transparent" stroke="none" style={{ cursor: getEdgeCursor(corner, rot) }} onMouseDown={(e) => { e.stopPropagation(); onResizeStart?.(e, b, corner); }} />;
                      })}
                    </>
                  )}
                  {/* Rotation handle — INSIDE rotation group so it rotates with building */}
                  {isSel && !isLocked && rotatingId !== b.id && (
                    <g>
                      <line x1={cx} y1={b.y} x2={cx} y2={b.y - 32} stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="3 2" opacity={0.5} />
                      <circle cx={cx} cy={b.y - 32} r={6} fill="var(--accent)" stroke="white" strokeWidth={2}
                        style={{ cursor: "grab" }}
                        onMouseDown={(e) => { e.stopPropagation(); onRotateStart?.(e, b); }}
                      />
                      <path d={`M${cx - 2.5} ${b.y - 34} Q${cx} ${b.y - 37} ${cx + 2.5} ${b.y - 34}`}
                        fill="none" stroke="white" strokeWidth={1.5} strokeLinecap="round" />
                    </g>
                  )}
                  {/* Issue/warning badges — rendered AFTER the selection outline and
                      resize/rotation handles so the selection overlay never covers
                      them. This is an editor-overlay z-layer: it is NOT affected by
                      Bring Forward / Send Backward (which only stack buildings and
                      decor assets). */}
                  {isOverlapping && (
                    <g className="pointer-events-none select-none">
                      <rect x={b.x + b.width - 18} y={b.y - 14} width={32} height={16} rx={4} fill="#dc2626" opacity={0.95} />
                      <text x={b.x + b.width - 2} y={b.y - 3} textAnchor="middle" fill="white" fontSize={7} fontWeight="900">OVERLAP</text>
                    </g>
                  )}
                  {isInvalid && !isOverlapping && (
                    <g className="pointer-events-none select-none">
                      <rect x={b.x + b.width - 16} y={b.y - 14} width={30} height={16} rx={4} fill="#dc2626" opacity={0.95} />
                      <text x={b.x + b.width - 1} y={b.y - 3} textAnchor="middle" fill="white" fontSize={8} fontWeight="900">⚠</text>
                    </g>
                  )}
                </g>
                {/* Building name — OUTSIDE rotation group so text stays horizontal & readable */}
                {zoom > 0.7 && b.name !== "New Building" && (() => {
                  const rotAABB = getRotatedAABB(b.x, b.y, b.width, b.height, rot);
                  const rotCx = rotAABB.x + rotAABB.width / 2;
                  const rotCy = rotAABB.y + rotAABB.height / 2;
                  return (
                    <text x={rotCx} y={rotCy + 16} textAnchor="middle" fill="rgba(255,255,255,0.75)" fontSize={6} fontWeight="600" className="pointer-events-none select-none" stroke="rgba(0,0,0,0.2)" strokeWidth={2} paintOrder="stroke">
                      {b.name.length > 16 ? b.name.slice(0, 14) + "…" : b.name}
                    </text>
                  );
                })()}
                {/* ══ Degree indicators — OUTSIDE rotation group so text stays axis-aligned & readable ══ */}
                {/* Static degree badge (non-rotating) */}
                {isSel && !isLocked && rotatingId !== b.id && rot !== 0 && (() => {
                  const rotAABB = getRotatedAABB(b.x, b.y, b.width, b.height, rot);
                  const visCx = rotAABB.x + rotAABB.width / 2;
                  const visTop = rotAABB.y;
                  return (
                    <g className="pointer-events-none select-none">
                      <rect x={visCx - 16} y={visTop - 14} width={32} height={14} rx={3} fill="var(--accent)" opacity={0.9} />
                      <text x={visCx} y={visTop - 4} textAnchor="middle" fill="white" fontSize={8} fontWeight="800">{rot}°</text>
                    </g>
                  );
                })()}
                {/* Floating degree indicator during active rotation (axis-aligned, readable) */}
                {isSel && !isLocked && rotatingId === b.id && (() => {
                  const rotAABB = getRotatedAABB(b.x, b.y, b.width, b.height, rot);
                  const visCx = rotAABB.x + rotAABB.width / 2;
                  const visTop = rotAABB.y;
                  return (
                    <g className="pointer-events-none select-none">
                      <line x1={visCx} y1={visTop} x2={visCx} y2={visTop - 24} stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.6} />
                      <rect x={visCx - 22} y={visTop - 40} width={44} height={18} rx={5} fill="var(--accent)" opacity={0.95} filter="url(#dropShadow)" />
                      <text x={visCx} y={visTop - 27} textAnchor="middle" fill="white" fontSize={10} fontWeight="900">{rotatingAngle ?? rot}°</text>
                    </g>
                  );
                })()}
                {/* ══ Dimension indicator during resize (axis-aligned, readable) ══ */}
                {resizingId === b.id && (() => {
                  const rotAABB = getRotatedAABB(b.x, b.y, b.width, b.height, rot);
                  const visBot = rotAABB.y + rotAABB.height;
                  const visCx = rotAABB.x + rotAABB.width / 2;
                  return (
                    <g className="pointer-events-none select-none">
                      <rect x={visCx - 32} y={visBot + 6} width={64} height={18} rx={5} fill="var(--accent)" opacity={0.95} filter="url(#dropShadow)" />
                      <text x={visCx} y={visBot + 18} textAnchor="middle" fill="white" fontSize={9} fontWeight="900">{b.width}×{b.height}</text>
                    </g>
                  );
                })()}
              </g>
            );
            }
            const da = entry.item as CampusDecorAsset;
            const template = DECOR_ASSET_MAP[da.type];
            if (!template) return null;
            const s = decorRenderScale(da.scale);
            const rot = da.rotation ?? 0;
            const isVisible = da.visible ?? true;
            const isSel = selected?.type === "decorAsset" && selected.id === da.id;
            const isMultiSel = multiSelected.includes(da.id);
            const editorOpacity = isVisible ? (isSel ? 1 : 0.9) : (isSel || isMultiSel ? 0.35 : 0.28);

            // World-space half extents (asset center is at da.x, da.y)
            const { width: worldW, height: worldH } = decorWorldSize(template, da.scale);
            const outline = decorSelectionOutlineBox(template, da.scale);
            const hw = worldW / 2;
            const hh = worldH / 2;
            const rotRad = (rot * Math.PI) / 180;
            const cosR = Math.cos(rotRad);
            const sinR = Math.sin(rotRad);
            // Rotate a local offset (lx, ly) about the asset center → world coords
            const cornerPos = (lx: number, ly: number) => ({
              x: da.x + lx * cosR - ly * sinR,
              y: da.y + lx * sinR + ly * cosR,
            });
            // Axis-aligned AABB of the rotated asset (for axis-aligned badges)
            const aabb = getRotatedAABB(da.x - hw, da.y - hh, hw * 2, hh * 2, rot);
            const visCx = aabb.x + aabb.width / 2;
            const rotHandlePos = cornerPos(0, -(hh + 30));

            return (
              <g key={da.id}
                data-decor-type={da.type}
                data-hidden={isVisible ? undefined : "true"}
                opacity={editorOpacity}
                style={{ cursor: tool === "select" ? "move" : cursor }}
                onMouseDown={(e) => { if (tool === "select" || tool === "erase") onItemDown(e, "decorAsset", da.id, da.x, da.y); }}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onItemContextMenu?.(e, "decorAsset", da.id); }}
              >
                {/* Body — transform group (rotates & scales with the asset) */}
                <rect
                  data-testid="decor-hitbox"
                  x={da.x - outline.width / 2}
                  y={da.y - outline.height / 2}
                  width={outline.width}
                  height={outline.height}
                  rx={outline.rx}
                  fill="transparent"
                  stroke="none"
                  transform={`rotate(${rot}, ${da.x}, ${da.y})`}
                />
                {(isMultiSel || isSel) && (
                  <rect
                    data-testid="decor-selection-outline"
                    x={da.x - outline.width / 2}
                    y={da.y - outline.height / 2}
                    width={outline.width}
                    height={outline.height}
                    rx={outline.rx}
                    fill="none"
                    stroke={isSel ? "var(--accent)" : "var(--primary)"}
                    strokeWidth={isSel ? 2 : 1.5}
                    strokeDasharray="4 3"
                    opacity={isSel ? 0.8 : 0.65}
                    transform={`rotate(${rot}, ${da.x}, ${da.y})`}
                  />
                )}
                <g transform={`translate(${da.x},${da.y}) rotate(${rot}) scale(${s})`}>
                  <g transform={`translate(-${template.defaultWidth / 2},-${template.defaultHeight / 2})`}>
                    <DecorAssetArt descriptor={template} />
                  </g>
                </g>

                {/* Selection handles — world space, rotation-aware cursors (not scaled with asset).
                    Only shown in select tool so an erase/other tool can click the asset directly. */}
                {!isVisible && (
                  <g className="pointer-events-none select-none" opacity={0.95}>
                    <rect x={aabb.x + 4} y={aabb.y + 4} width={18} height={14} rx={4} fill="var(--card)" stroke="var(--border)" strokeWidth={1} />
                    <path d={`M${aabb.x + 7} ${aabb.y + 11} Q${aabb.x + 13} ${aabb.y + 6} ${aabb.x + 19} ${aabb.y + 11} Q${aabb.x + 13} ${aabb.y + 16} ${aabb.x + 7} ${aabb.y + 11}Z`} fill="none" stroke="var(--muted-foreground)" strokeWidth={1.2} />
                    <circle cx={aabb.x + 13} cy={aabb.y + 11} r={2} fill="var(--muted-foreground)" />
                    <line x1={aabb.x + 7} y1={aabb.y + 16} x2={aabb.x + 20} y2={aabb.y + 5} stroke="var(--muted-foreground)" strokeWidth={1.5} strokeLinecap="round" />
                  </g>
                )}
                {isSel && tool === "select" && (
                  <>
                    {/* Rotation handle — sits above the rotated asset */}
                    {decorRotatingId !== da.id && (
                      <g>
                        <line x1={da.x} y1={da.y} x2={rotHandlePos.x} y2={rotHandlePos.y} stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="3 2" opacity={0.5} />
                        <circle cx={rotHandlePos.x} cy={rotHandlePos.y} r={6} fill="var(--accent)" stroke="white" strokeWidth={2}
                          style={{ cursor: "grab" }}
                          onMouseDown={(e) => { e.stopPropagation(); onDecorRotateStart?.(e, da); }}
                        />
                        <path d={`M${rotHandlePos.x - 2.5} ${rotHandlePos.y - 2} Q${rotHandlePos.x} ${rotHandlePos.y - 5} ${rotHandlePos.x + 2.5} ${rotHandlePos.y - 2}`}
                          fill="none" stroke="white" strokeWidth={1.5} strokeLinecap="round" />
                      </g>
                    )}
                    {/* Corner resize handles — rotate with the asset via rotation-aware cursors */}
                    {["nw", "ne", "sw", "se"].map((corner) => {
                      const lx = corner.includes("e") ? hw : -hw;
                      const ly = corner.includes("s") ? hh : -hh;
                      const p = cornerPos(lx, ly);
                      const cornerCursor = getCornerCursor(corner, rot);
                      return (
                        <g key={corner}>
                          <rect x={p.x - 12} y={p.y - 12} width={24} height={24} fill="transparent" stroke="none" style={{ cursor: cornerCursor }} onMouseDown={(e) => { e.stopPropagation(); onDecorResizeStart?.(e, da, corner); }} />
                          <rect x={p.x - 7} y={p.y - 7} width={14} height={14} rx={2} fill="white" stroke="var(--accent)" strokeWidth={2} style={{ pointerEvents: "none", cursor: cornerCursor }} />
                        </g>
                      );
                    })}
                    {/* Static degree badge (axis-aligned, readable) */}
                    {rot !== 0 && decorRotatingId !== da.id && (
                      <g className="pointer-events-none select-none">
                        <rect x={visCx - 16} y={aabb.y - 14} width={32} height={14} rx={3} fill="var(--accent)" opacity={0.9} />
                        <text x={visCx} y={aabb.y - 4} textAnchor="middle" fill="white" fontSize={8} fontWeight="800">{rot}°</text>
                      </g>
                    )}
                    {/* Floating degree indicator during active rotation */}
                    {decorRotatingId === da.id && (
                      <g className="pointer-events-none select-none">
                        <rect x={visCx - 22} y={aabb.y - 40} width={44} height={18} rx={5} fill="var(--accent)" opacity={0.95} filter="url(#dropShadow)" />
                        <text x={visCx} y={aabb.y - 27} textAnchor="middle" fill="white" fontSize={10} fontWeight="900">{rotatingAngle ?? rot}°</text>
                      </g>
                    )}
                    {/* Scale indicator during resize */}
                    {decorResizingId === da.id && (
                      <g className="pointer-events-none select-none">
                        <rect x={visCx - 26} y={aabb.y + aabb.height + 6} width={52} height={18} rx={5} fill="var(--accent)" opacity={0.95} filter="url(#dropShadow)" />
                        <text x={visCx} y={aabb.y + aabb.height + 18} textAnchor="middle" fill="white" fontSize={9} fontWeight="900">{Math.round((da.scale ?? 1) * 10) / 10}×</text>
                      </g>
                    )}
                  </>
                )}

                {/* Custom name label (B2 Phase 3) — shown under the asset when named.
                    During an active resize the scale badge occupies +6..+24 below the
                    asset, so the label drops lower to avoid overlapping it. */}
                {da.name && (
                  <text x={visCx} y={aabb.y + aabb.height + (decorResizingId === da.id ? 34 : 14)} textAnchor="middle" fontSize={9} fontWeight={600} fill="var(--muted-foreground)" className="pointer-events-none select-none">{da.name}</text>
                )}
              </g>
            );
          })}

          {/* Building entrances: functional editor overlay, not part of z-order. */}
          {buildings.flatMap((b) => {
            const entrances = b.entrances ?? [];
            const isParentVisible = b.visible ?? true;
            const isParentLocked = b.locked ?? false;
            return entrances.map((entrance) => {
              const pos = entranceWorldPosition(b, entrance);
              const isSel = selected?.type === "entrance" && selected.id === entrance.id;
              const isNavTarget = navEntranceHover?.buildingId === b.id && navEntranceHover?.entranceId === entrance.id;
              const stroke = BUILDING_ENTRANCE_TYPE_COLORS[normalizeEntranceType(entrance.type)];
              const opacity = isParentVisible ? 1 : isSel ? 0.45 : 0.3;
              return (
                <g
                  key={entrance.id}
                  data-entrance-id={entrance.id}
                  data-building-id={b.id}
                  data-hidden={isParentVisible ? undefined : "true"}
                  transform={`translate(${pos.x},${pos.y}) rotate(${pos.angle})`}
                  opacity={opacity}
                  style={{ cursor: isParentLocked ? "default" : tool === "select" ? "grab" : cursor }}
                  onMouseDown={(e) => onEntranceDown?.(e, b.id, entrance.id, pos.x, pos.y)}
                >
                  <title>{entranceDisplayName(entrance, entrances.findIndex((e) => e.id === entrance.id))}</title>
                  <circle cx={0} cy={0} r={12} fill="transparent" />
                  {/* Navigation routing-target highlight (Add Waypoint / Connect Path) —
                      B5 Phase 1.9: this is the SINGLE Connect Target indicator; the
                      linked nav-node renders nothing extra while it is active. */}
                  {isNavTarget && (
                    <circle data-testid="entrance-connect-target" cx={0} cy={0} r={17} fill="none" stroke="#16a34a" strokeWidth={2} strokeDasharray="4 3" opacity={0.95} className="pointer-events-none" />
                  )}
                  <path d="M-10,-7 L10,-7 L10,7 L-10,7 Z" fill="var(--card)" stroke={isNavTarget ? "#16a34a" : isSel ? "var(--accent)" : stroke} strokeWidth={isNavTarget ? 2.5 : isSel ? 2.5 : 1.8} />
                  <path d="M-4,7 L-4,-3 L4,-3 L4,7" fill={stroke} opacity={0.92} />
                  <path d="M0,13 L-5,6 H5 Z" fill={isNavTarget ? "#16a34a" : isSel ? "var(--accent)" : stroke} />
                  {entrance.isPrimary && <circle cx={8} cy={-8} r={3} fill="#f59e0b" stroke="white" strokeWidth={1} />}
                  {entrance.accessible && <circle cx={-8} cy={-8} r={3} fill="#2563eb" stroke="white" strokeWidth={1} />}
                  {isSel && !isNavTarget && <circle cx={0} cy={0} r={15} fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="4 3" />}
                </g>
              );
            });
          })}

          {/* Markers */}
          {markers.map((m) => {
            const style = MARKER_STYLES[m.type] ?? MARKER_STYLES.custom;
            const color = m.color || style.color;
            const isSel = selected?.type === "marker" && selected.id === m.id;
            return (
              <g key={m.id} onMouseDown={(e) => onItemDown(e, "marker", m.id, m.x, m.y)} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onItemContextMenu?.(e, "marker", m.id); }} style={{ cursor: tool === "select" ? "move" : cursor }}>
                {isSel && <circle cx={m.x} cy={m.y} r={22} fill="none" stroke="var(--accent)" strokeWidth={2} opacity={0.6} />}
                <ellipse cx={m.x} cy={m.y + 1} rx={10} ry={5} fill="rgba(0,0,0,0.18)" />
                <circle cx={m.x} cy={m.y} r={13} fill={color} stroke={isSel ? "var(--accent)" : "white"} strokeWidth={isSel ? 2.5 : 2} />
                <text x={m.x} y={m.y + 4} textAnchor="middle" fill="white" fontSize={10} fontWeight="900" className="pointer-events-none select-none">{style.symbol}</text>
                {zoom > 0.6 && (
                  <text x={m.x} y={m.y + 25} textAnchor="middle" fill={color} fontSize={9} fontWeight="700" stroke="rgba(240,238,234,0.95)" strokeWidth={3} paintOrder="stroke" className="pointer-events-none select-none">{m.name}</text>
                )}
              </g>
            );
          })}

          {/* ═══ NAVIGATION GRAPH (navigation layer only) ═══ */}
          {layer === "navigation" && (
            <g data-testid="nav-graph-layer">
              {/* Edges — the walking-network connections between nodes */}
              {renderNavEdges.map((e) => {
                const a = renderNavNodes.find((n) => n.id === e.startNodeId);
                const b = renderNavNodes.find((n) => n.id === e.endNodeId);
                if (!a || !b) return null;
                const isSel = selected?.type === "navEdge" && selected.id === e.id;
                const isMultiSel = multiSelected.includes(e.id);
                const oneWay = e.bidirectional === false;
                const isClosed = e.closed === true;
                const midX = (a.x + b.x) / 2;
                const midY = (a.y + b.y) / 2;
                const angle = Math.atan2(b.y - a.y, b.x - a.x) * (180 / Math.PI);
                const edgeColor = isSel || isMultiSel ? "var(--accent)" : e.color || "#16a34a";
                return (
                  <g key={e.id} data-testid="nav-edge" className="group/nav-edge"
                    onMouseDown={(ev) => { ev.stopPropagation(); onNavEdgeSelect?.(ev, e.id); }}
                    style={{ cursor: tool === "select" ? "pointer" : "crosshair" }}
                  >
                    {/* Invisible generous hit target so thin edges are clickable */}
                    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={14} />
                    {/* Hover halo — reveals the edge is interactive without color noise */}
                    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                      stroke="var(--accent)"
                      strokeWidth={8}
                      strokeLinecap="round"
                      opacity={0}
                      className="pointer-events-none transition-opacity duration-150 group-hover/nav-edge:opacity-20"
                    />
                    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                      stroke={edgeColor}
                      strokeWidth={isSel || isMultiSel ? 4 : e.width ?? 3}
                      strokeLinecap="round"
                      strokeOpacity={isClosed ? 0.35 : e.accessible === false ? 0.35 : e.emergencySafe === false ? 0.6 : 0.85}
                      strokeDasharray={isClosed ? "6 4" : e.accessible === false ? "4 3" : undefined}
                      className="pointer-events-none"
                    />
                    {(isSel || isMultiSel) && <circle cx={midX} cy={midY} r={4} fill="var(--accent)" className="pointer-events-none" />}
                    {/* Closed indicator — small block mark so Closed reads as unavailable, not broken */}
                    {isClosed && (
                      <g transform={`translate(${midX},${midY})`} className="pointer-events-none">
                        <circle r={5} fill="var(--card)" stroke="#b45309" strokeWidth={1.5} />
                        <path d="M-2,-2 L2,2 M2,-2 L-2,2" stroke="#b45309" strokeWidth={1.5} strokeLinecap="round" />
                      </g>
                    )}
                    {/* Direction indicator — only for one-way edges */}
                    {oneWay && !isClosed && (
                      <g transform={`translate(${midX},${midY}) rotate(${angle})`} className="pointer-events-none">
                        <polygon points="10,0 -4,-5 -4,5" fill={edgeColor} stroke="rgba(255,255,255,0.9)" strokeWidth={1} />
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Nodes — compact graph waypoints (not map pins) with selected /
                  start / destination rings and subtle accessible + emergency
                  indicators only when relevant */}
              {renderNavNodes.map((n) => {
                const isSel = selected?.type === "navNode" && selected.id === n.id;
                const isMultiSel = multiSelected.includes(n.id);
                const isStart = navConnectStartId === n.id;
                const isDestHover = !!navConnectStartId && navConnectStartId !== n.id && !!navPreview && navPreview.x === n.x && navPreview.y === n.y;
                const dimmed = n.accessible === false;
                // B5 Phase 1.7: modest semantic type indicators — readable at a
                // glance without making the graph noisy. Ordinary outdoor nodes
                // stay neutral; special roles get a small glyph + ring.
                const isEmergency = n.type === "emergency_exit";
                const isAssembly = n.type === "assembly";
                const isSafeArea = n.type === "safe_area";
                const isEntrance = n.type === "entrance";
                const isDestination = n.type === "room_access";
                // B5 Phase 1.8: an entrance-linked node is DERIVED geometry of
                // the physical door — the door symbol is the primary visual, so
                // the node renders ONLY a small subtle connected badge + one
                // clean hover/selected ring (never a stacked waypoint target).
                const isEntranceLinked = !!n.entranceId;
                // B5 Phase 1.9: Connect Target is the single visual-state winner
                // for entrance-linked nodes — the physical entrance overlay's
                // dashed target ring is the ONLY indicator while it is active.
                const isConnectTarget = isEntranceLinked && !!navEntranceHover
                  && navEntranceHover.buildingId === n.buildingId
                  && navEntranceHover.entranceId === n.entranceId;
                // Display name follows the linked entrance (never a generic
                // "Waypoint" stacked on the physical entrance name).
                const entranceDisplay = (() => {
                  if (!isEntranceLinked) return undefined;
                  const parent = buildings.find((b) => b.id === n.buildingId);
                  const entrance = parent?.entrances?.find((en) => en.id === n.entranceId);
                  if (!parent || !entrance) return undefined;
                  return entranceDisplayName(entrance, (parent.entrances ?? []).findIndex((en) => en.id === entrance.id));
                })();
                return (
                  <g key={n.id} data-testid="nav-node" data-entrance-linked={isEntranceLinked ? "true" : undefined} className="group/nav-node"
                    onMouseDown={(e) => onItemDown(e, "navNode", n.id, n.x, n.y)}
                    onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onItemContextMenu?.(e, "navNode", n.id); }}
                    style={{ cursor: tool === "select" ? "move" : cursor }}
                  >
                    {!isEntranceLinked && (
                      <>
                        {/* Hover ring — reveals interactivity without dominating the graph */}
                        <circle cx={n.x} cy={n.y} r={11} fill="none" stroke="var(--accent)" strokeWidth={1.5} opacity={0}
                          className="pointer-events-none transition-opacity duration-150 group-hover/nav-node:opacity-60" />
                        {(isSel || isMultiSel) && <circle cx={n.x} cy={n.y} r={11} fill="none" stroke="var(--accent)" strokeWidth={2} opacity={0.7} className="pointer-events-none" />}
                        {isStart && <circle cx={n.x} cy={n.y} r={13} fill="none" stroke="#16a34a" strokeWidth={2} strokeDasharray="4 3" opacity={0.9} className="pointer-events-none" />}
                        {isDestHover && <circle cx={n.x} cy={n.y} r={12} fill="none" stroke="#f59e0b" strokeWidth={2} strokeDasharray="3 2" opacity={0.95} className="pointer-events-none" />}
                        {isEmergency && <circle cx={n.x} cy={n.y} r={9} fill="none" stroke="#dc2626" strokeWidth={1.5} opacity={0.85} className="pointer-events-none" />}
                        {isAssembly && <circle cx={n.x} cy={n.y} r={9} fill="none" stroke="#d97706" strokeWidth={1.5} strokeDasharray="2 2" opacity={0.85} className="pointer-events-none" />}
                        {isSafeArea && <circle cx={n.x} cy={n.y} r={10} fill="none" stroke="#0d9488" strokeWidth={1.5} opacity={0.85} className="pointer-events-none" />}
                        {isEntrance && <circle cx={n.x} cy={n.y} r={10} fill="none" stroke="#2563eb" strokeWidth={1.5} strokeDasharray="3 2" opacity={0.9} className="pointer-events-none" />}
                        {isDestination && <circle cx={n.x} cy={n.y} r={9} fill="none" stroke="#7c3aed" strokeWidth={1.5} opacity={0.8} className="pointer-events-none" />}
                      </>
                    )}
                    {isEntranceLinked ? (
                      // ── B5 Phase 1.9: ONE navigation-state decoration at a time ──
                      // Strict priority: Connect Target > Start/Dest > Selected >
                      // Connected (badge). The physical door symbol stays the
                      // primary visual; no stacked/concentric rings ever coexist.
                      isConnectTarget ? null : isStart ? (
                        <circle cx={n.x} cy={n.y} r={13} fill="none" stroke="#16a34a" strokeWidth={2} strokeDasharray="4 3" opacity={0.9} className="pointer-events-none" />
                      ) : isDestHover ? (
                        <circle cx={n.x} cy={n.y} r={12} fill="none" stroke="#f59e0b" strokeWidth={2} strokeDasharray="3 2" opacity={0.95} className="pointer-events-none" />
                      ) : (isSel || isMultiSel) ? (
                        // ONE clean selection ring, sized to the entrance icon.
                        <circle cx={n.x} cy={n.y} r={12} fill="none" stroke="var(--accent)" strokeWidth={1.6} opacity={0.9} className="pointer-events-none" />
                      ) : (
                        // Connected/normal: the tiny badge ring doubles as the
                        // single hover highlight (one subtle cue, ~150ms).
                        <g className="pointer-events-none">
                          <circle cx={n.x} cy={n.y} r={4} fill="#16a34a" stroke="white" strokeWidth={1.5} opacity={0.95} />
                          <circle cx={n.x} cy={n.y} r={6.5} fill="none" stroke="#16a34a" strokeWidth={1.1} opacity={0.55} className="transition-opacity duration-150 group-hover/nav-node:opacity-100" />
                        </g>
                      )
                    ) : (
                      <circle cx={n.x} cy={n.y} r={7} fill={n.color || "#16a34a"} stroke={isSel || isMultiSel ? "var(--accent)" : "white"} strokeWidth={2}
                        opacity={dimmed ? 0.45 : 1} strokeDasharray={dimmed ? "3 2" : undefined} />
                    )}
                    {/* Compact type glyphs — one small path each, pointer-events none */}
                    {!isEntranceLinked && isEmergency && <path d={`M${n.x - 3.5},${n.y + 3} L${n.x - 3.5},${n.y - 2} L${n.x},${n.y - 3.5} L${n.x + 3.5},${n.y - 2} L${n.x + 3.5},${n.y + 3} Z`} fill="#dc2626" className="pointer-events-none" />}
                    {!isEntranceLinked && isAssembly && <g className="pointer-events-none"><circle cx={n.x} cy={n.y - 1} r={2.2} fill="#d97706" /><path d={`M${n.x - 3},${n.y + 3.2} L${n.x + 3},${n.y + 3.2}`} stroke="#d97706" strokeWidth={1.4} strokeLinecap="round" /></g>}
                    {!isEntranceLinked && isSafeArea && <path d={`M${n.x},${n.y - 3.2} L${n.x + 2.6},${n.y - 1.6} L${n.x + 2.6},${n.y + 0.6} L${n.x},${n.y + 2.8} L${n.x - 2.6},${n.y + 0.6} L${n.x - 2.6},${n.y - 1.6} Z`} fill="#0d9488" className="pointer-events-none" />}
                    {!isEntranceLinked && isEntrance && <rect x={n.x - 2.4} y={n.y - 3.4} width={4.8} height={6.8} rx={0.8} fill="#2563eb" className="pointer-events-none" />}
                    {!isEntranceLinked && isDestination && <g className="pointer-events-none"><circle cx={n.x} cy={n.y} r={1.6} fill="#7c3aed" /><circle cx={n.x} cy={n.y} r={3.6} fill="none" stroke="#7c3aed" strokeWidth={1.1} /></g>}
                    {zoom > 0.6 && (
                      <text x={n.x} y={n.y + 20} textAnchor="middle" fill={n.color || "#16a34a"} fontSize={9} fontWeight={700}
                        stroke="rgba(240,238,234,0.95)" strokeWidth={3} paintOrder="stroke"
                        className="pointer-events-none select-none">{entranceDisplay ?? n.name}</text>
                    )}
                  </g>
                );
              })}

              {/* Connect Path preview — the dashed line from the start waypoint
                  to the pointer, plus the would-be waypoint node at the pointer
                  (also shown before the first click: hovering empty space with
                  Connect Path active previews that a click places a Waypoint). */}
              {navPreview && (() => {
                const start = renderNavNodes.find((n) => n.id === navConnectStartId);
                // B5 Phase 1.9: hovering a connect-target entrance must NOT stack
                // the ghost waypoint node on top of the entrance's single target
                // ring — keep only the dashed edge preview line.
                const overEntranceTarget = !!navEntranceHover;
                return (
                  <g data-testid="nav-path-preview" className="pointer-events-none">
                    {start && (
                      <line x1={start.x} y1={start.y} x2={navPreview.x} y2={navPreview.y}
                        stroke="#16a34a" strokeWidth={2.5} strokeDasharray="6 4" strokeLinecap="round" opacity={0.8} />
                    )}
                    {!overEntranceTarget && (
                      <>
                        <circle cx={navPreview.x} cy={navPreview.y} r={9} fill="none" stroke="#16a34a" strokeWidth={1.5} strokeDasharray="3 3" opacity={0.9} />
                        <circle cx={navPreview.x} cy={navPreview.y} r={3.5} fill="#16a34a" opacity={0.95} />
                      </>
                    )}
                  </g>
                );
              })()}
            </g>
          )}
        </g>
      </svg>

      {/* Layer overlay animation */}
      <AnimatePresence>
        <motion.div
          key={layer}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="absolute inset-0 z-10 pointer-events-none"
        >
          {layer === "navigation" && <div className="absolute inset-0" style={{ background: "rgba(22,163,74,0.03)" }} />}
          {layer === "events" && <div className="absolute inset-0" style={{ background: "rgba(217,119,6,0.03)" }} />}
        </motion.div>
      </AnimatePresence>

      {/* Status bar */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 25, delay: 0.3 }}
        className="absolute bottom-3 left-[12px] right-[140px] flex items-center justify-between z-10 pointer-events-none"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 px-3 py-1 rounded-full border border-border/60 text-[11px] font-mono" style={{ background: "color-mix(in srgb,var(--card) 85%,transparent)", backdropFilter: "blur(8px)", color: "var(--muted-foreground)" }}>
            <span className="font-bold">B:{buildings.length}</span>
            <span className="opacity-50">·</span>
            <span>M:{markers.length}</span>
            <span className="opacity-50">·</span>
            <span>P:{paths.length}</span>
          </div>
          {cursorPos && (
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-border/60 text-[10px] font-mono" style={{ background: "color-mix(in srgb,var(--card) 85%,transparent)", backdropFilter: "blur(8px)", color: "var(--muted-foreground)" }}>
              X:{cursorPos.x} Y:{cursorPos.y}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

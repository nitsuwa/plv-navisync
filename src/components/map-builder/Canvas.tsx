import { useRef, useCallback, useEffect, useState } from "react";
import {
  ZoomIn, ZoomOut, Maximize2, RotateCcw, Grid3X3,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../../lib/utils";
import { MARKER_STYLES } from "../../data/mapData";
import type { LayerToolDescriptor } from "./constants";
import type { Campus, CampusBuilding, CampusMarker, SimpleTool, EditorLayer, CampusSelection, RubberBand } from "./types";

interface CanvasProps {
  campus: Campus;
  tool: SimpleTool;
  layer: EditorLayer;
  selected: CampusSelection | null;
  multiSelected: string[];
  rubberBand: RubberBand | null;
  activeTools: LayerToolDescriptor[];
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
  onCanvasDblClick: (e: React.MouseEvent<SVGSVGElement>) => void;
  onItemDown: (e: React.MouseEvent, type: "building" | "marker", id: string, ox: number, oy: number) => void;
  onItemContextMenu?: (e: React.MouseEvent, type: "building" | "marker" | "path", id: string) => void;
  onResizeStart?: (e: React.MouseEvent, b: CampusBuilding, corner: string) => void;
  onBuildingDoubleClick?: (id: string) => void;
  onPathClick: (id: string) => void;
  onSelect: (sel: CampusSelection | null) => void;
  onResetView: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onSetTool: (t: SimpleTool) => void;
  onToggleSnap: () => void;
}

export function Canvas({
  campus, tool, layer, selected, multiSelected, rubberBand, activeTools, drawingPath, snapGrid,
  zoom, pan, svgRef, containerRef, cursor,
  buildingDrag, guides, cursorPos, overlappingBuildings,
  onCanvasDown, onCanvasMove, onCanvasUp, onCanvasDblClick,
  onItemDown, onItemContextMenu, onResizeStart, onBuildingDoubleClick, onPathClick, onSelect,
  onResetView, onZoomIn, onZoomOut, onSetTool, onToggleSnap,
  invalidBuildings = new Set(),
}: CanvasProps) {
  const buildings = campus.buildings;
  const markers = campus.markers;
  const paths = campus.paths;
  const hint = activeTools.find((t) => t.id === tool)?.hint ?? "";
  // ── Fixed-position tooltip state (avoids palette overflow clipping) ──
  const [tooltipState, setTooltipState] = useState<{ x: number; y: number; label: string; key: string } | null>(null);

  return (
    <div ref={containerRef} className="flex-1 overflow-hidden relative" style={{
      background: "#e8eaf0",
    }}>

      {/* Dot grid pattern overlay — uses campus gridSize */}
      <div className="absolute inset-0 z-0 pointer-events-none" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, rgba(14,42,110,0.06) 1px, transparent 0)`,
        backgroundSize: `${campus.gridSize ?? 20}px ${campus.gridSize ?? 20}px`,
      }} />
      {/* SVG Canvas */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${campus.canvasW} ${campus.canvasH}`}
        className="w-full h-full"
        style={{ cursor, userSelect: "none" }}
        onMouseDown={onCanvasDown}
        onMouseMove={onCanvasMove}
        onMouseUp={onCanvasUp}
        onMouseLeave={onCanvasUp}
        onDoubleClick={onCanvasDblClick}
        onContextMenu={(e) => e.preventDefault()}
      >
        <defs>
          <pattern id="dotPattern" width={campus.gridSize ?? 20} height={campus.gridSize ?? 20} patternUnits="userSpaceOnUse">
            <circle cx={(campus.gridSize ?? 20) / 2} cy={(campus.gridSize ?? 20) / 2} r={1} fill="rgba(14,42,110,0.08)" />
          </pattern>
        </defs>
        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          {/* Canvas background with subtle grid */}
          <rect data-bg="true" width={campus.canvasW} height={campus.canvasH} fill={(campus as unknown as { canvasColor?: string }).canvasColor ?? "#f5f3ef"} />
          <rect data-bg="true" width={campus.canvasW} height={campus.canvasH} fill="url(#dotPattern)" opacity={0.3} />

          {/* Major grid lines — every 4× the grid size */}
          <g opacity={0.12}>
            {Array.from({ length: Math.ceil(campus.canvasW / ((campus.gridSize ?? 20) * 4)) }, (_, i) => (
              <line key={`v${i}`} x1={i * (campus.gridSize ?? 20) * 4} y1={0} x2={i * (campus.gridSize ?? 20) * 4} y2={campus.canvasH} stroke="rgba(14,42,110,0.2)" strokeWidth={0.5} />
            ))}
          </g>
          <g opacity={0.12}>
            {Array.from({ length: Math.ceil(campus.canvasH / ((campus.gridSize ?? 20) * 4)) }, (_, i) => (
              <line key={`h${i}`} x1={0} y1={i * (campus.gridSize ?? 20) * 4} x2={campus.canvasW} y2={i * (campus.gridSize ?? 20) * 4} stroke="rgba(14,42,110,0.2)" strokeWidth={0.5} />
            ))}
          </g>

          {/* Layer-specific indicators */}
          {layer === "navigation" &&
            buildings.map((b) => (
              <g key={`nav-${b.id}`} opacity={0.65}>
                <line x1={b.x + b.width / 2} y1={b.y + b.height} x2={b.x + b.width / 2} y2={campus.canvasH * 0.9} stroke="#16a34a" strokeWidth={3} strokeDasharray="8 4" strokeLinecap="round" />
                <circle cx={b.x + b.width / 2} cy={b.y + b.height + 6} r={5} fill="#16a34a" />
              </g>
            ))}
          {layer === "accessibility" &&
            buildings.map((b) => (
              <g key={`acc-${b.id}`}>
                <circle cx={b.x + b.width - 10} cy={b.y + 10} r={9} fill="#2563eb" opacity={0.8} />
                <text x={b.x + b.width - 10} y={b.y + 14} textAnchor="middle" fontSize={9} fill="white" fontWeight="900" className="pointer-events-none select-none">A</text>
              </g>
            ))}
          {layer === "emergency" &&
            buildings.map((b) => (
              <g key={`emer-${b.id}`}>
                <rect x={b.x + b.width / 2 - 10} y={b.y + b.height - 1} width={20} height={8} rx={3} fill="#dc2626" opacity={0.85} />
                <text x={b.x + b.width / 2} y={b.y + b.height + 5} textAnchor="middle" fontSize={6} fill="white" fontWeight="900" className="pointer-events-none select-none">EXIT</text>
              </g>
            ))}
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
                <polyline points={pts} fill="none" stroke={p.color} strokeWidth={p.width} strokeLinecap="round" strokeLinejoin="round" opacity={0.75} />
              </g>
            );
          })}

          {/* Alignment guides — enhanced with glow and labels */}
          {guides && guides.map((g, i) => (
            <g key={`g${i}`}>
              {/* Glow behind guide */}
              {g.type === "v" ? (
                <line x1={g.pos} y1={0} x2={g.pos} y2={campus.canvasH}
                  stroke="var(--accent)" strokeWidth={8} opacity={0.15} />
              ) : (
                <line x1={0} y1={g.pos} x2={campus.canvasW} y2={g.pos}
                  stroke="var(--accent)" strokeWidth={8} opacity={0.15} />
              )}
              {/* Solid guide line */}
              {g.type === "v" ? (
                <line x1={g.pos} y1={0} x2={g.pos} y2={campus.canvasH}
                  stroke="var(--accent)" strokeWidth={2} strokeDasharray="5 3" opacity={0.9} />
              ) : (
                <line x1={0} y1={g.pos} x2={campus.canvasW} y2={g.pos}
                  stroke="var(--accent)" strokeWidth={2} strokeDasharray="5 3" opacity={0.9} />
              )}
              {/* Guide label */}
              <rect x={g.type === "v" ? g.pos - 16 : campus.canvasW - 36} y={g.type === "v" ? 6 : g.pos - 7} width={32} height={14} rx={3}
                fill="var(--accent)" fillOpacity={0.85} />
              <text x={g.type === "v" ? g.pos : campus.canvasW - 20} y={g.type === "v" ? 15 : g.pos + 4}
                textAnchor="middle" fill="white" fontSize={8} fontWeight="800"
                className="pointer-events-none select-none">{g.pos}</text>
            </g>
          ))}

          {/* Rubber-band selection */}
          {rubberBand && (() => {
            const rx = Math.min(rubberBand.sx, rubberBand.cx);
            const ry = Math.min(rubberBand.sy, rubberBand.cy);
            const rw = Math.abs(rubberBand.cx - rubberBand.sx);
            const rh = Math.abs(rubberBand.cy - rubberBand.sy);
            return (
              <rect
                x={rx} y={ry} width={rw} height={rh}
                fill="rgba(14,42,110,0.06)"
                stroke="var(--primary)"
                strokeWidth={1.5}
                strokeDasharray="6 4"
                rx={2}
              />
            );
          })()}

          {/* Building drag preview */}
          {buildingDrag && (() => {
            const rx = Math.min(buildingDrag.sx, buildingDrag.cx);
            const ry = Math.min(buildingDrag.sy, buildingDrag.cy);
            const rw = Math.abs(buildingDrag.cx - buildingDrag.sx);
            const rh = Math.abs(buildingDrag.cy - buildingDrag.sy);
            return (
              <g>
                <rect x={rx} y={ry} width={rw} height={rh} rx={6}
                  fill="var(--primary)" fillOpacity={0.12}
                  stroke="var(--primary)" strokeWidth={2} strokeDasharray="8 4" />
                <text x={rx + rw / 2} y={ry + rh / 2 + 3} textAnchor="middle"
                  fill="var(--primary)" fontSize={10} fontWeight="700"
                  className="pointer-events-none select-none">
                  {rw}×{rh}
                </text>
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

          {/* Buildings */}
          {buildings.map((b) => {
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
            if (!isVisible && !isSel) return null;
            return (
              <g key={b.id} onMouseDown={(e) => { if (isLocked) return; onItemDown(e, "building", b.id, b.x, b.y); }} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); if (isLocked) return; onItemContextMenu?.(e, "building", b.id); }} onDoubleClick={(e) => { if (isLocked) return; e.stopPropagation(); onBuildingDoubleClick?.(b.id); }} style={{ cursor: isLocked ? "default" : tool === "select" ? "move" : cursor, opacity }}>
                {/* Multi-selection highlight */}
                {isMultiSel && !isSel && (
                  <rect
                    x={b.x - 4} y={b.y - 4}
                    width={b.width + 8} height={b.height + 8}
                    rx={8} fill="none"
                    stroke="var(--primary)" strokeWidth={1.5}
                    strokeDasharray="4 3" opacity={0.6}
                  />
                )}                    {/* Single selection — enhanced with glow and corner indicators */}
                    {isSel && (
                      <>
                        {/* Outer glow ring */}
                        <rect x={b.x - 8} y={b.y - 8} width={b.width + 16} height={b.height + 16} rx={12} fill="none" stroke="var(--accent)" strokeWidth={5} opacity={0.15} />
                        <rect x={b.x - 6} y={b.y - 6} width={b.width + 12} height={b.height + 12} rx={10} fill="none" stroke="var(--accent)" strokeWidth={2.5} opacity={0.8} />
                        {/* Corner resize handles — larger invisible hit zones + visible indicators */}
                        {["nw", "ne", "sw", "se"].map((corner) => {
                          const hs = 10;
                          const hx = corner.includes("e") ? b.x + b.width - hs / 2 : b.x - hs / 2;
                          const hy = corner.includes("s") ? b.y + b.height - hs / 2 : b.y - hs / 2;
                          return (
                            <>
                              {/* Large invisible hit zone (20px) */}
                              <rect
                                key={`${corner}-hit`}
                                x={hx - 5} y={hy - 5} width={hs + 10} height={hs + 10}
                                fill="transparent" stroke="none"
                                style={{ cursor: corner.includes("n") && corner.includes("w") ? "nwse-resize" : corner.includes("n") ? "nesw-resize" : corner.includes("w") ? "nesw-resize" : "nwse-resize" }}
                                onMouseDown={(e) => { e.stopPropagation(); onResizeStart?.(e, b, corner); }}
                              />
                              {/* Visible handle */}
                              <rect key={corner} x={hx} y={hy} width={hs} height={hs} rx={2}
                                fill="white" stroke="var(--accent)" strokeWidth={2}
                                style={{ pointerEvents: "none", cursor: "nwse-resize" }} />
                            </>
                          );
                        })}
                        {/* Edge resize handles — much larger invisible hit targets */}
                        {["n", "s", "e", "w"].map((corner) => {
                          const HIT_EDGE = 16; // invisible hit zone extending outward from edge
                          const HIT_INNER = 8;  // invisible cursor zone extending inward from edge
                          const edgeW = corner === "n" || corner === "s" ? b.width : HIT_EDGE;
                          const edgeH = corner === "e" || corner === "w" ? b.height : HIT_EDGE;
                          const edgeX = corner === "e" ? b.x + b.width - HIT_EDGE / 2 : corner === "w" ? b.x - HIT_EDGE / 2 : b.x;
                          const edgeY = corner === "s" ? b.y + b.height - HIT_EDGE / 2 : corner === "n" ? b.y - HIT_EDGE / 2 : b.y;
                          return (
                            <rect key={corner} x={edgeX} y={edgeY} width={edgeW} height={edgeH}
                              fill="transparent" stroke="none"
                              style={{ cursor: corner === "n" || corner === "s" ? "ns-resize" : "ew-resize" }}
                              onMouseDown={(e) => { e.stopPropagation(); onResizeStart?.(e, b, corner); }} />
                          );
                        })}
                        {/* Inward cursor zones — show resize cursor when hovering just inside the building */}
                        {["n", "s", "e", "w"].map((corner) => {
                          const INSET = 6;
                          const innerW = corner === "n" || corner === "s" ? b.width : INSET;
                          const innerH = corner === "e" || corner === "w" ? b.height : INSET;
                          const innerX = corner === "n" || corner === "s" ? b.x : (corner === "e" ? b.x + b.width - INSET : b.x);
                          const innerY = corner === "e" || corner === "w" ? b.y : (corner === "s" ? b.y + b.height - INSET : b.y);
                          return (
                            <rect key={`i-${corner}`} x={innerX} y={innerY} width={innerW} height={innerH}
                              fill="transparent" stroke="none"
                              style={{ cursor: corner === "n" || corner === "s" ? "ns-resize" : "ew-resize" }}
                              onMouseDown={(e) => { e.stopPropagation(); onResizeStart?.(e, b, corner); }} />
                          );
                        })}
                        {/* Rotation indicator */}
                    {rot !== 0 && (
                      <g>
                        <circle cx={cx} cy={b.y - 12} r={4} fill="var(--accent)" stroke="white" strokeWidth={1.5} />
                        <line x1={cx} y1={b.y - 8} x2={cx} y2={b.y - 2} stroke="var(--accent)" strokeWidth={1.5} />
                      </g>
                    )}
                  </>
                )}
                {/* Overlap warning — red glowing outline */}
                {isOverlapping && (
                  <>
                    <rect x={b.x - 4} y={b.y - 4} width={b.width + 8} height={b.height + 8}
                      rx={10} fill="none" stroke="#dc2626" strokeWidth={2.5}
                      strokeDasharray="6 4" opacity={0.9} />
                    <rect x={b.x - 6} y={b.y - 6} width={b.width + 12} height={b.height + 12}
                      rx={12} fill="none" stroke="#dc2626" strokeWidth={1}
                      strokeDasharray="4 4" opacity={0.4} />
                  </>
                )}
                {/* Shadow */}
                <rect x={b.x + 3} y={b.y + 4} width={b.width} height={b.height} rx={8} fill="rgba(0,0,0,0.12)" />
                {/* Building body with rotation */}
                <g transform={rot !== 0 ? `rotate(${rot}, ${cx}, ${cy})` : ''}>
                  <rect x={b.x} y={b.y} width={b.width} height={b.height} rx={8} fill={b.color} stroke={isSel ? "var(--accent)" : "rgba(255,255,255,0.5)"} strokeWidth={isSel ? 2.5 : 1.5} opacity={0.92} />
                  <rect x={b.x} y={b.y} width={b.width} height={7} rx={8} fill="rgba(0,0,0,0.12)" />
                  <text x={cx - b.x + b.x} y={b.y + b.height / 2 - 3} textAnchor="middle" fill="white" fontSize={11} fontWeight="800" className="pointer-events-none select-none">{b.code}</text>
                  {b.floors.length > 0 && <text x={cx - b.x + b.x} y={b.y + b.height / 2 + 10} textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize={7} className="pointer-events-none select-none">{b.floors.length}F</text>}
                  {/* Lock indicator for locked buildings */}
                  {isLocked && (
                    <g>
                      <rect x={b.x + b.width - 16} y={b.y + 4} width={12} height={10} rx={2} fill="rgba(255,255,255,0.85)" />
                      <text x={b.x + b.width - 10} y={b.y + 12} textAnchor="middle" fill="#92400e" fontSize={8} fontWeight="900" className="pointer-events-none select-none">🔒</text>
                    </g>
                  )}
                  {/* Overlap warning badge */}
                  {isOverlapping && (
                    <g>
                      <rect x={b.x + b.width - 18} y={b.y - 14} width={32} height={16} rx={4}
                        fill="#dc2626" opacity={0.9} />
                      <text x={b.x + b.width - 2} y={b.y - 3} textAnchor="middle"
                        fill="white" fontSize={7} fontWeight="900"
                        className="pointer-events-none select-none">
                        OVERLAP
                      </text>
                    </g>
                  )}
                  {/* Validation error highlight — red pulsing outline & badge */}
                  {isInvalid && !isOverlapping && (
                    <>
                      {/* Red pulsing glow outline */}
                      <rect
                        x={b.x - 5} y={b.y - 5}
                        width={b.width + 10} height={b.height + 10}
                        rx={10} fill="none"
                        stroke="#dc2626" strokeWidth={2.5}
                        strokeDasharray="8 4" opacity={0.85}
                        className="animate-validation-pulse"
                      />
                      <rect
                        x={b.x - 7} y={b.y - 7}
                        width={b.width + 14} height={b.height + 14}
                        rx={12} fill="none"
                        stroke="#dc2626" strokeWidth={1}
                        strokeDasharray="4 6" opacity={0.35}
                      />
                      {/* ⚠ badge */}
                      <g>
                        <rect
                          x={b.x + b.width - 16} y={b.y - 14}
                          width={30} height={16} rx={4}
                          fill="#dc2626" opacity={0.9}
                        />
                        <text
                          x={b.x + b.width - 1} y={b.y - 3}
                          textAnchor="middle" fill="white"
                          fontSize={8} fontWeight="900"
                          className="pointer-events-none select-none"
                        >
                          ⚠
                        </text>
                      </g>
                    </>
                  )}
                </g>
                {zoom > 0.7 && b.name !== "New Building" && (
                  <text x={cx} y={b.y + b.height + 14} textAnchor="middle" fill="rgba(0,0,0,0.6)" fontSize={8} fontWeight="600" stroke="rgba(240,238,234,0.9)" strokeWidth={3} paintOrder="stroke" className="pointer-events-none select-none">
                    {b.name.length > 20 ? b.name.slice(0, 18) + "…" : b.name}
                  </text>
                )}
              </g>
            );
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
        </g>
      </svg>

      {/* Tool palette — vertical sidebar on the left */}
      <motion.div
        initial={{ opacity: 0, x: -20, scale: 0.95 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 25, delay: 0.15 }}
        className="absolute left-3 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-1 p-1.5 rounded-2xl border border-border shadow-lg max-h-[calc(100%-80px)] overflow-y-auto"
        style={{ background: "var(--card)" }}
        onMouseLeave={() => setTooltipState(null)}
      >
        {activeTools.map((t, i) => (
          <motion.div key={t.id} className="relative group">
            {i === activeTools.length - 1 && t.id === "erase" && <div className="my-0.5 border-t border-border" />}
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => { onSetTool(t.id as SimpleTool); }}
              onMouseEnter={(e) => {
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setTooltipState({ x: rect.right + 10, y: rect.top + rect.height / 2, label: t.label, key: t.key });
              }}
              onMouseLeave={() => setTooltipState(null)}
              data-tutorial={t.id === "building" ? "building-tool" : undefined}
              className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                tool === t.id && t.id === "erase"
                  ? "bg-destructive text-destructive-foreground shadow-md"
                  : tool === t.id
                    ? "bg-primary text-primary-foreground shadow-md"
                    : t.id === "erase"
                      ? "text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <t.icon className="h-4 w-4" />
            </motion.button>
          </motion.div>
        ))}
        <div className="my-0.5 border-t border-border" />
        <div className="relative group">
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.95 }}
            onClick={onResetView}
            onMouseEnter={(e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setTooltipState({ x: rect.right + 10, y: rect.top + rect.height / 2, label: "Reset View", key: "0" });
            }}
            onMouseLeave={() => setTooltipState(null)}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
          >
            <RotateCcw className="h-4 w-4" />
          </motion.button>
        </div>
        <div className="my-0.5 border-t border-border" />
        <div className="relative group">
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.95 }}
            onClick={onToggleSnap}
            onMouseEnter={(e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setTooltipState({ x: rect.right + 10, y: rect.top + rect.height / 2, label: `Snap${snapGrid ? '' : ' (OFF)'}`, key: "Ctrl+G" });
            }}
            onMouseLeave={() => setTooltipState(null)}
            data-tutorial="snap-tool"
            className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
              snapGrid ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Grid3X3 className="h-4 w-4" />
          </motion.button>
        </div>
      </motion.div>

      {/* Fixed-position instant tooltip — rendered outside palette to avoid overflow clipping */}
      {tooltipState && (
        <div
          className="fixed z-50 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg whitespace-nowrap border shadow-lg pointer-events-none"
          style={{
            left: tooltipState.x,
            top: tooltipState.y,
            transform: "translateY(-50%)",
            background: "var(--popover)",
            borderColor: "var(--border)",
            color: "var(--popover-foreground)",
          }}
        >
          <span className="text-[11px] font-bold">{tooltipState.label}</span>
          <span
            className="text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded"
            style={{ background: "color-mix(in srgb, var(--muted) 50%, transparent)", color: "var(--muted-foreground)" }}
          >
            {tooltipState.key}
          </span>
        </div>
      )}

      {/* Zoom controls with spring entrance */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 25, delay: 0.25 }}
        className="absolute bottom-10 right-3 z-20 flex items-center gap-1 p-1 rounded-xl border border-border shadow-md"
        style={{ background: "var(--card)" }}
      >
        <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.95 }} onClick={onZoomOut} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-all">
          <ZoomOut className="h-4 w-4" />
        </motion.button>
        <span className="w-12 text-center text-xs font-mono font-bold text-foreground">{Math.round(zoom * 100)}%</span>
        <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.95 }} onClick={onZoomIn} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-all">
          <ZoomIn className="h-4 w-4" />
        </motion.button>
        <div className="w-px h-5 mx-0.5" style={{ background: "var(--border)" }} />
        <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.95 }} onClick={onResetView} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-all">
          <Maximize2 className="h-4 w-4" />
        </motion.button>
      </motion.div>

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
          {layer === "accessibility" && <div className="absolute inset-0" style={{ background: "rgba(37,99,235,0.03)" }} />}
          {layer === "emergency" && <div className="absolute inset-0" style={{ background: "rgba(220,38,38,0.04)" }} />}
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
        <div className="flex-1 text-center px-4">
          <span className="text-[11px] px-3 py-1 rounded-full border border-border/60 font-medium" style={{ background: "color-mix(in srgb,var(--card) 85%,transparent)", backdropFilter: "blur(8px)", color: "var(--muted-foreground)", fontFamily: "var(--font-body)" }}>
            {drawingPath.length > 0 ? `${drawingPath.length} points - double-click to finish` : hint}
          </span>
        </div>
      </motion.div>
    </div>
  );
}

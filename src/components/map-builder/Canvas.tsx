import { useRef, useCallback, useEffect } from "react";
import {
  ZoomIn, ZoomOut, Maximize2, RotateCcw, Grid3X3,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../../lib/utils";
import { TOOLS } from "./constants";
import { MARKER_STYLES } from "../../data/mapData";
import type { Campus, CampusBuilding, CampusMarker, CampusPath, SimpleTool, EditorLayer, CampusSelection } from "./types";

interface CanvasProps {
  campus: Campus;
  tool: SimpleTool;
  layer: EditorLayer;
  selected: CampusSelection | null;
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
  onCanvasDown: (e: React.MouseEvent<SVGSVGElement>) => void;
  onCanvasMove: (e: React.MouseEvent<SVGSVGElement>) => void;
  onCanvasUp: (e: React.MouseEvent<SVGSVGElement>) => void;
  onCanvasDblClick: (e: React.MouseEvent<SVGSVGElement>) => void;
  onItemDown: (e: React.MouseEvent, type: "building" | "marker", id: string, ox: number, oy: number) => void;
  onItemContextMenu?: (e: React.MouseEvent, type: "building" | "marker" | "path", id: string) => void;
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
  campus, tool, layer, selected, drawingPath, snapGrid,
  zoom, pan, svgRef, containerRef, cursor,
  buildingDrag, guides, cursorPos,
  onCanvasDown, onCanvasMove, onCanvasUp, onCanvasDblClick,
  onItemDown, onItemContextMenu, onBuildingDoubleClick, onPathClick, onSelect,
  onResetView, onZoomIn, onZoomOut, onSetTool, onToggleSnap,
}: CanvasProps) {
  const buildings = campus.buildings;
  const markers = campus.markers;
  const paths = campus.paths;
  const hint = TOOLS.find((t) => t.id === tool)?.hint ?? "";

  return (
    <div ref={containerRef} className="flex-1 overflow-hidden relative" style={{
      background: "#e8eaf0",
      backgroundImage: `radial-gradient(circle at 1px 1px, rgba(14,42,110,0.06) 1px, transparent 0)`,
      backgroundSize: "20px 20px",
    }}>
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
      >
        <defs>
          <pattern id="dotPattern" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="rgba(14,42,110,0.08)" />
          </pattern>
        </defs>
        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          {/* Canvas background with subtle grid */}
          <rect data-bg="true" width={campus.canvasW} height={campus.canvasH} fill="#f5f3ef" />
          <rect width={campus.canvasW} height={campus.canvasH} fill="url(#dotPattern)" opacity={0.3} />

          {/* Major grid lines (every 80px) */}
          <g opacity={0.12}>
            {Array.from({ length: Math.ceil(campus.canvasW / 80) }, (_, i) => (
              <line key={`v${i}`} x1={i * 80} y1={0} x2={i * 80} y2={campus.canvasH} stroke="rgba(14,42,110,0.2)" strokeWidth={0.5} />
            ))}
          </g>
          <g opacity={0.12}>
            {Array.from({ length: Math.ceil(campus.canvasH / 80) }, (_, i) => (
              <line key={`h${i}`} x1={0} y1={i * 80} x2={campus.canvasW} y2={i * 80} stroke="rgba(14,42,110,0.2)" strokeWidth={0.5} />
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
                onContextMenu={(e) => { e.stopPropagation(); onItemContextMenu?.(e, "path", p.id); }}
                style={{ cursor: tool === "erase" ? "not-allowed" : "pointer" }}
              >
                {isSel && <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth={p.width + 6} strokeLinecap="round" strokeLinejoin="round" opacity={0.35} />}
                <polyline points={pts} fill="none" stroke={p.color} strokeWidth={p.width} strokeLinecap="round" strokeLinejoin="round" opacity={0.75} />
              </g>
            );
          })}

          {/* Alignment guides */}
          {guides && guides.map((g, i) => (
            g.type === "v" ? (
              <line key={`g${i}`} x1={g.pos} y1={0} x2={g.pos} y2={campus.canvasH}
                stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="6 4" opacity={0.8} />
            ) : (
              <line key={`g${i}`} x1={0} y1={g.pos} x2={campus.canvasW} y2={g.pos}
                stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="6 4" opacity={0.8} />
            )
          ))}

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
            const cx = b.x + b.width / 2;
            const cy = b.y + b.height / 2;
            const rot = b.rotation ?? 0;
            const isVisible = b.visible ?? true;
            const isLocked = b.locked ?? false;
            const opacity = b.opacity ?? 1;
            if (!isVisible && !isSel) return null;
            return (
              <g key={b.id} onMouseDown={(e) => { if (isLocked) return; onItemDown(e, "building", b.id, b.x, b.y); }} onContextMenu={(e) => { if (isLocked) return; onItemContextMenu?.(e, "building", b.id); }} onDoubleClick={(e) => { if (isLocked) return; e.stopPropagation(); onBuildingDoubleClick?.(b.id); }} style={{ cursor: isLocked ? "default" : tool === "select" ? "move" : cursor, opacity }}>
                {isSel && (
                  <>
                    <rect x={b.x - 6} y={b.y - 6} width={b.width + 12} height={b.height + 12} rx={10} fill="none" stroke="var(--accent)" strokeWidth={2.5} opacity={0.8} />
                    {["nw", "ne", "sw", "se"].map((corner) => {
                      const hs = 8;
                      const hx = corner.includes("e") ? b.x + b.width - hs / 2 : b.x - hs / 2;
                      const hy = corner.includes("s") ? b.y + b.height - hs / 2 : b.y - hs / 2;
                      return (
                        <rect key={corner} x={hx} y={hy} width={hs} height={hs} rx={2} fill="white" stroke="var(--accent)" strokeWidth={2} style={{ cursor: "nwse-resize" }} />
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
              <g key={m.id} onMouseDown={(e) => onItemDown(e, "marker", m.id, m.x, m.y)} onContextMenu={(e) => onItemContextMenu?.(e, "marker", m.id)} style={{ cursor: tool === "select" ? "move" : cursor }}>
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

      {/* Tool palette with spring entrance */}
      <motion.div
        initial={{ opacity: 0, x: -20, scale: 0.95 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 25, delay: 0.15 }}
        className="absolute left-3 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-1 p-1.5 rounded-2xl border border-border shadow-xl"
        style={{ background: "var(--card)" }}
      >
        {TOOLS.map((t, i) => (
          <motion.div key={t.id}>
            {i === 4 && <div className="my-0.5 border-t border-border" />}
            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              onClick={() => { onSetTool(t.id); }}
              title={`${t.label} (${t.key})`}
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
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          onClick={onResetView}
          title="Reset view (0)"
          className="w-10 h-10 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
        >
          <RotateCcw className="h-4 w-4" />
        </motion.button>
        <div className="my-0.5 border-t border-border" />
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          onClick={onToggleSnap}
          data-tutorial="snap-tool"
          title={`Snap to grid (${snapGrid ? "ON" : "OFF"}) - Ctrl+G`}
          className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
            snapGrid ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <Grid3X3 className="h-4 w-4" />
        </motion.button>
      </motion.div>

      {/* Zoom controls with spring entrance */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 25, delay: 0.25 }}
        className="absolute bottom-10 right-3 z-20 flex items-center gap-1 p-1 rounded-xl border border-border shadow-lg"
        style={{ background: "var(--card)" }}
      >
        <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={onZoomOut} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-all">
          <ZoomOut className="h-4 w-4" />
        </motion.button>
        <span className="w-12 text-center text-xs font-mono font-bold text-foreground">{Math.round(zoom * 100)}%</span>
        <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={onZoomIn} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-all">
          <ZoomIn className="h-4 w-4" />
        </motion.button>
        <div className="w-px h-5 mx-0.5" style={{ background: "var(--border)" }} />
        <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={onResetView} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-all">
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

import type { Pt, RouteMode } from "../../lib/routePlanner";
import { cn } from "../../lib/utils";
import { useReducedMotion } from "../../hooks";
import { pointAlongPolyline } from "../../lib/geo";

interface RouteMapOverlayProps {
  points: Pt[];
  mode: RouteMode;
  fading?: boolean;
  /** 0..1 walk progress — when provided, renders the moving "you" avatar */
  walkProgress?: number;
}

/**
 * SVG route overlay — the animated route line, direction arrows, junction
 * waypoints, start/destination markers and the moving walk avatar. Rendered
 * inside the campus map <svg> (the parent applies the viewBox transform).
 */
export function RouteMapOverlay({ points, mode, fading = false, walkProgress }: RouteMapOverlayProps) {
  const reducedMotion = useReducedMotion();
  if (points.length < 2) return null;

  const pathStr = points.map((p) => `${p.x},${p.y}`).join(" ");
  const pathD = `M ${points.map((p) => `${p.x} ${p.y}`).join(" L ")}`;
  const color = mode === "accessible" ? "#16a34a" : mode === "emergency" ? "#dc2626" : "#1e40af";
  const glowFilter = mode === "standard" ? "url(#route-glow)" : undefined;
  const pathId = "plv-route-path";
  // When the user prefers reduced motion: skip the draw/dash/scale animations
  // and the SVG <animate> pulse rings (CSS alone cannot stop <animate>).
  const drawAnim = reducedMotion ? undefined : { animation: "draw-route 1.4s cubic-bezier(0.4,0,0.2,1) forwards" };
  const antsAnim = reducedMotion ? undefined : { animation: "draw-route 1.4s 0.4s ease forwards, dash-flow 1.2s 1.8s linear infinite" };

  return (
    <g data-route-group className={cn("transition-opacity duration-300", fading && "opacity-0")}>
      <defs>
        <path id={pathId} d={pathD} />
      </defs>
      {/* Outer shadow trail */}
      <polyline points={pathStr} fill="none" stroke="rgba(0,0,0,0.12)" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" />
      {/* White backing */}
      <polyline points={pathStr} fill="none" stroke="white" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
      {/* Glow layer */}
      <polyline
        points={pathStr} fill="none" stroke={color} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round"
        opacity={0.25} filter={glowFilter}
        strokeDasharray="900" strokeDashoffset={reducedMotion ? 0 : 900}
        style={drawAnim}
      />
      {/* Main animated route line */}
      <polyline
        points={pathStr} fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray="900" strokeDashoffset={reducedMotion ? 0 : 900}
        style={drawAnim}
      />
      {/* Marching ants overlay */}
      {!reducedMotion && (
        <polyline
          points={pathStr} fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth={2}
          strokeLinecap="round" strokeLinejoin="round" strokeDasharray="8 14"
          style={antsAnim}
        />
      )}

      {/* Directional arrows along the route */}
      {points.slice(0, -1).map((p, i) => {
        const next = points[i + 1];
        const mx = (p.x + next.x) / 2;
        const my = (p.y + next.y) / 2;
        if (i % 2 !== 0) return null; // show on alternating segments
        return (
          <polygon
            key={i}
            points={`${mx - 4},${my - 6} ${mx + 4},${my} ${mx - 4},${my + 6}`}
            fill={color} opacity={0.5}
            style={{ animation: `fade-in 1.4s ${0.6 + i * 0.1}s ease both` }}
          />
        );
      })}

      {/* Waypoint checkpoints at each junction */}
      {points.slice(1, -1).map((p, i) => (
        <g key={`wp${i}`} style={{ animation: `scale-in 0.3s ${0.8 + i * 0.12}s ease both` }}>
          <circle cx={p.x} cy={p.y} r={5} fill="white" stroke={color} strokeWidth={2} opacity={0.85} />
          <circle cx={p.x} cy={p.y} r={2} fill={color} />
        </g>
      ))}

      {/* Walk avatar — the moving "you" dot (kiosk-style) */}
      {typeof walkProgress === "number" && walkProgress >= 0 && !reducedMotion && (() => {
        const pos = pointAlongPolyline(points, Math.min(1, Math.max(0, walkProgress)));
        return (
          <g key="walk-avatar" style={{ pointerEvents: "none" }}>
            <circle cx={pos.x} cy={pos.y} r={13} fill="rgba(37,99,235,0.18)" />
            <circle cx={pos.x} cy={pos.y} r={8.5} fill="#2563eb" stroke="white" strokeWidth={2.5}
              style={{ filter: "drop-shadow(0 1px 5px rgba(37,99,235,0.55))" }} />
            {/* Little walking person glyph */}
            <g transform={`translate(${pos.x},${pos.y}) scale(0.55)`}>
              <circle cy={-4.5} r={3.4} fill="white" />
              <path d="M -3.4 7 L 0 0 L 3.4 7 M 0 0 L 0 -4.5" fill="none" stroke="white" strokeWidth={2.4} strokeLinecap="round" />
            </g>
          </g>
        );
      })()}

      {/* Start marker — green with flag */}
      <g style={reducedMotion ? undefined : { animation: "scale-in 0.4s 0.3s ease both" }}>
        <circle cx={points[0].x} cy={points[0].y} r={14} fill="#16a34a" stroke="white" strokeWidth={3}
          style={{ filter: "drop-shadow(0 2px 6px rgba(22,163,74,0.4))" }} />
        <circle cx={points[0].x} cy={points[0].y} r={10} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth={1.5} />
        <text x={points[0].x} y={points[0].y + 4} textAnchor="middle" fill="white" fontSize={11} fontWeight="900" className="select-none">A</text>
        {/* Pulse ring — disabled when reduced motion */}
        {!reducedMotion && (
          <circle cx={points[0].x} cy={points[0].y} r={14} fill="none" stroke="#16a34a" strokeWidth={2} opacity={0.4}>
            <animate attributeName="r" from="14" to="24" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" from="0.4" to="0" dur="2s" repeatCount="indefinite" />
          </circle>
        )}
      </g>

      {/* Destination marker — red pin with expanded pulse */}
      <g style={reducedMotion ? undefined : { animation: "scale-in 0.4s 0.5s ease both" }}>
        <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={14} fill="#dc2626" stroke="white" strokeWidth={3}
          style={{ filter: "drop-shadow(0 2px 8px rgba(220,38,38,0.5))" }} />
        <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={10} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth={1.5} />
        <text x={points[points.length - 1].x} y={points[points.length - 1].y + 4} textAnchor="middle" fill="white" fontSize={11} fontWeight="900" className="select-none">B</text>
        {/* Outer pulse ring — disabled when reduced motion */}
        {!reducedMotion && (
          <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={14} fill="none" stroke="#dc2626" strokeWidth={2.5} opacity={0.5}>
            <animate attributeName="r" from="14" to="32" dur="2.2s" repeatCount="indefinite" />
            <animate attributeName="opacity" from="0.5" to="0" dur="2.2s" repeatCount="indefinite" />
          </circle>
        )}
      </g>
    </g>
  );
}

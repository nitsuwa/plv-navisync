import type { TestRouteTransitionMarker } from "./TestNavigationPanel";
import { ArrowDown, ArrowUp, ArrowUpDown, MapPin, PersonStanding } from "lucide-react";

export type RouteMarkerKind = "start" | "destination" | TestRouteTransitionMarker["kind"];

type MarkerGlyphProps = {
  kind: RouteMarkerKind;
  color?: string;
};

function MarkerGlyph({ kind, color = "white" }: MarkerGlyphProps) {
  const common = { fill: "none", stroke: color, strokeWidth: 1.35, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (kind === "start") {
    return <path d="M-3.5 3.5V-3.5L4-0.1z" fill={color} stroke={color} strokeLinejoin="round" />;
  }
  if (kind === "destination") {
    return <path d="M0-5.2L3.8-1.3C6 1 3.8 5.2 0 6.2-3.8 5.2-6 1-3.8-1.3z" {...common} />;
  }
  if (kind === "entrance") {
    return <g {...common}><path d="M-3.8 5V-3.8h7.6V5" /><path d="M-1.5 5V-1.2h3V5M-5 5h10" /><circle cx="1" cy="1" r="0.45" fill={color} stroke="none" /></g>;
  }
  if (kind === "stair") {
    return <path d="M-5 4h2V1h2v-3h2v-3h2" {...common} />;
  }
  if (kind === "elevator") {
    return <g {...common}><rect x="-4" y="-4.5" width="8" height="9" rx="1" /><path d="M-1.7-1.2L0-3l1.7 1.8M-1.7 1.2L0 3l1.7-1.8" /></g>;
  }
  return <g {...common}><path d="M-4 4L3-3" /><path d="M0-3h3v3" /><path d="M-4 4h3" /></g>;
}

export interface TransitionLabelLayout {
  /** Wrapped lines preserve the complete instruction without SVG text clipping. */
  lines: string[];
  width: number;
  height: number;
  x: number;
  iconX: number;
  textX: number;
  textY: number;
}

export interface TransitionLabelOptions {
  /** Keep a start-conflict pill on the open side of the endpoint marker. */
  align?: "left" | "right";
  /** Center the pill over the transition cue (the normal presentation). */
  anchor?: "center";
  /** Slightly tighter vertical treatment for a cue beside a Start marker. */
  compact?: boolean;
}

export interface TransitionMarkerViewport {
  /** SVG viewBox dimensions and the current map pan, in viewBox units. */
  width: number;
  height: number;
  pan?: { x: number; y: number };
}

/**
 * Resolve a compact, readable SVG pill for a transition instruction.  SVG has
 * no intrinsic text auto-sizing, so the layout is kept as a pure helper: it
 * wraps long floor names and gives the icon/text comfortable padding.  Callers
 * can center the pill over its cue while preserving the right-aligned variant
 * used by a Start Stair marker.
 */
export function transitionLabelLayout(instruction: string, options: TransitionLabelOptions = {}): TransitionLabelLayout {
  const normalized = instruction.trim() || "Continue to the next floor";
  const maxCharsPerLine = 32;
  const words = normalized.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    // Keep even an unusually long single token readable rather than letting
    // it overflow the rounded box.
    if (word.length > maxCharsPerLine) {
      if (line) { lines.push(line); line = ""; }
      for (let start = 0; start < word.length; start += maxCharsPerLine) {
        const chunk = word.slice(start, start + maxCharsPerLine);
        if (chunk.length === maxCharsPerLine || start + maxCharsPerLine < word.length) lines.push(chunk);
        else line = chunk;
      }
      continue;
    }
    const next = line ? `${line} ${word}` : word;
    if (line && next.length > maxCharsPerLine) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  if (lines.length === 0) lines.push(normalized);

  const longestLine = Math.max(...lines.map((value) => value.length));
  // SVG has no intrinsic text measurement.  Use a font-size-matched estimate
  // with a modest minimum instead of the old 112px floor, which made short
  // Outdoor instructions look tiny inside a disproportionately wide pill.
  // The same compact metrics are used by Canvas and FloorEditor.
  const fontSize = options.compact ? 9 : 9.5;
  const lineHeight = options.compact ? 11 : 11.5;
  // Keep the pill content-sized.  The previous 96px floor left short Outdoor
  // instructions with a visibly empty right side, while the smaller text made
  // the same pill harder to read than its Floor Editor counterpart.
  const width = Math.max(90, Math.min(220, longestLine * (fontSize * 0.53) + 34));
  const height = Math.max(options.compact ? 19 : 20, lines.length * lineHeight + (options.compact ? 7 : 8));
  // Normal transition labels sit centered over the cue.  The previous
  // left-growing placement could overlap the marker/route line and made the
  // entrance label appear to drift to one side.  Keep the special start-Stair
  // alignment intact, but use a stable cue-centered anchor everywhere else.
  const x = options.align === "right" ? 18 : options.anchor === "center" ? -width / 2 : 36 - width;
  return {
    lines,
    width,
    height,
    x,
    iconX: x + 8,
    textX: x + 25,
    textY: lines.length === 1 ? (options.compact ? 13 : 13.5) : (options.compact ? 11 : 11.5),
  };
}

export function RouteEndpointMarker({ x, y, kind, color }: { x: number; y: number; kind: "start" | "destination"; color: string }) {
  const fill = kind === "start" ? "#16a34a" : "#dc2626";
  const offsetX = kind === "start" ? -12 : 12;
  const offsetY = -14;
  return (
    <g data-testid={`test-route-${kind}-marker`} transform={`translate(${x} ${y})`} pointerEvents="none">
      <line x1={0} y1={0} x2={offsetX} y2={offsetY} stroke="white" strokeWidth={2.5} opacity={0.9} />
      <line x1={0} y1={0} x2={offsetX} y2={offsetY} stroke={color} strokeWidth={1} opacity={0.75} />
      <g transform={`translate(${offsetX} ${offsetY})`}>
        <circle r={kind === "start" ? 9 : 10} fill={fill} stroke="white" strokeWidth={2} />
        {kind === "start" ? (
          <PersonStanding x={-5} y={-5} width={10} height={10} color="white" strokeWidth={2.4} />
        ) : (
          <MapPin x={-6} y={-6} width={12} height={12} color="white" strokeWidth={2.2} />
        )}
        <circle r={kind === "start" ? 12 : 13} fill="none" stroke={color} strokeWidth={1.1} opacity={0.45} />
      </g>
    </g>
  );
}

export function RouteTransitionMarker({ marker, onClick, zoom = 1, viewport }: { marker: TestRouteTransitionMarker; onClick?: (marker: TestRouteTransitionMarker) => void; zoom?: number; viewport?: TransitionMarkerViewport }) {
  const destination = marker.targetLabel ?? "the next map context";
  const directionLabel = marker.direction === "up" ? "Going up to" : marker.direction === "down" ? "Going down to" : "Continue to";
  const instruction = marker.instruction ?? `${directionLabel} ${destination}`;
  const startStairTransition = marker.kind === "stair" && marker.endpointRole === "start";
  const labelLayout = marker.kind === "stair" || marker.kind === "elevator" || marker.kind === "entrance"
    ? transitionLabelLayout(instruction, startStairTransition ? { align: "right", compact: true } : { anchor: "center", compact: true })
    : null;
  const cueX = startStairTransition ? 16 : 12;
  const cueY = startStairTransition ? -17 : -14;
  const pulseRadius = startStairTransition ? 13 : 15;
  const glyphRadius = startStairTransition ? 8 : 9;
  const glyphRingRadius = startStairTransition ? 10.5 : 12;
  // Both circulation cues stay compact at rest and reveal their instruction
  // beside the marker on hover/focus. This keeps Elevator transitions aligned
  // with the polished Stair presentation without a blocking overlay card.
  const onDemandLabel = marker.kind === "stair" || marker.kind === "elevator" || marker.kind === "entrance";
  // The label is positioned from the rendered cue glyph (the actual
  // transition marker), not the Building/Entrance bounds.  Keep a small,
  // stable screen-space gap so Outdoor labels do not float far above the cue.
  const labelOffsetY = startStairTransition ? 0 : labelLayout ? -(labelLayout.height + 12) : 0;
  const labelZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  let labelX = labelLayout?.x ?? 0;
  let resolvedLabelOffsetY = labelOffsetY;
  if (labelLayout && viewport) {
    const pan = viewport.pan ?? { x: 0, y: 0 };
    const markerScreenX = pan.x + (marker.x + cueX) * labelZoom;
    const markerScreenY = pan.y + (marker.y + cueY) * labelZoom;
    const margin = 8;
    const left = markerScreenX + labelX;
    const right = left + labelLayout.width;
    if (left < margin) labelX += margin - left;
    else if (right > viewport.width - margin) labelX -= right - (viewport.width - margin);
    // The normal placement is above the cue.  Near the top edge, flip it
    // below the cue so the hover/focus instruction remains fully readable.
    const top = markerScreenY + resolvedLabelOffsetY + 1;
    if (top < margin) resolvedLabelOffsetY = glyphRadius + 5;
    const bottom = markerScreenY + resolvedLabelOffsetY + 1 + labelLayout.height;
    if (bottom > viewport.height - margin) resolvedLabelOffsetY = -(labelLayout.height + glyphRadius + 5);
  }
  const DirectionIcon = marker.direction === "up" ? ArrowUp : marker.direction === "down" ? ArrowDown : ArrowUpDown;
  const labelShiftX = labelLayout ? labelX - labelLayout.x : 0;
  const handleKeyDown = (event: React.KeyboardEvent<SVGGElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    onClick?.(marker);
  };
  return (
    <g
      data-testid="test-route-transition-marker"
      data-transition-kind={marker.kind}
      data-transition-endpoint-role={marker.endpointRole ?? undefined}
      data-transition-start-conflict={startStairTransition ? "true" : "false"}
      data-transition-label-mode={onDemandLabel ? "hover-focus" : "always"}
      transform={`translate(${marker.x} ${marker.y})`}
      className="group"
      role="button"
      tabIndex={0}
      aria-label={marker.kind === "elevator" ? `Elevator ${instruction}` : marker.kind === "stair" ? `Stair ${instruction}` : instruction}
      title={instruction}
      style={{ cursor: onClick ? "pointer" : "default" }}
      onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
      onClick={(event) => { event.preventDefault(); event.stopPropagation(); onClick?.(marker); }}
      onKeyDown={handleKeyDown}
    >
      <circle r={20} fill="transparent" />
      {(marker.kind === "stair" || marker.kind === "elevator") && (
        <circle r={pulseRadius} fill="none" stroke="#8b5cf6" strokeWidth={startStairTransition ? 1.2 : 1.5} opacity={startStairTransition ? 0.32 : 0.45} className="animate-pulse motion-reduce:animate-none" pointerEvents="none" />
      )}
      <line x1={0} y1={0} x2={cueX} y2={cueY} stroke="white" strokeWidth={startStairTransition ? 2 : 2.5} opacity={0.9} pointerEvents="none" />
      <line x1={0} y1={0} x2={cueX} y2={cueY} stroke="#8b5cf6" strokeWidth={startStairTransition ? 0.9 : 1} opacity={0.8} pointerEvents="none" />
      <g transform={`translate(${cueX} ${cueY})`} pointerEvents="none">
        <circle r={glyphRadius} fill="#111827" fillOpacity={0.88} stroke="white" strokeWidth={startStairTransition ? 1.7 : 2} />
        <circle r={glyphRingRadius} fill="none" stroke="#8b5cf6" strokeWidth={startStairTransition ? 1.1 : 1.3} strokeDasharray="3 2" opacity={0.9} />
        <MarkerGlyph kind={marker.kind} />
        {labelLayout && (
          <g
            // Labels are kept in screen-sized units while the surrounding map
            // is zoomed.  The offset is applied in the same inverse scale so
            // the cue-to-pill gap remains stable instead of drifting into the
            // Entrance/route geometry at different zoom levels.
            transform={`translate(${labelShiftX / labelZoom} ${resolvedLabelOffsetY / labelZoom}) scale(${1 / labelZoom})`}
            opacity={onDemandLabel ? undefined : (startStairTransition ? 0.92 : 0.95)}
            className={onDemandLabel ? "opacity-0 transition-all duration-200 ease-out translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 group-focus:opacity-100 group-focus:translate-x-0 motion-reduce:transition-none" : undefined}
            data-testid="transition-label-pill"
          >
            <rect x={labelLayout.x} y={1} width={labelLayout.width} height={labelLayout.height} rx={Math.min(8, labelLayout.height / 2)} fill="#111827" fillOpacity={0.9} stroke="#8b5cf6" strokeWidth={0.6} />
            <DirectionIcon x={labelLayout.iconX} y={labelLayout.height / 2 - 5} width={10} height={10} color="#c4b5fd" strokeWidth={2.1} />
            <text x={labelLayout.textX} y={labelLayout.textY} fill="white" fontSize={9} fontWeight={600}>
              {labelLayout.lines.map((line, index) => (
                <tspan key={`${line}-${index}`} x={labelLayout.textX} dy={index === 0 ? 0 : 11}>{line}</tspan>
              ))}
            </text>
          </g>
        )}
      </g>
    </g>
  );
}

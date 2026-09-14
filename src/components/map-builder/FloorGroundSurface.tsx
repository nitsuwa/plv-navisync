import type { FloorAppearance } from "./types";
import { floorPatternId, floorPatternSpec, normalizeFloorAppearance } from "../../lib/floorAppearance";

export interface FloorGroundSurfaceProps {
  x?: number;
  y?: number;
  width: number;
  height: number;
  appearance?: Partial<FloorAppearance>;
  legacyColor?: string;
  /** Must be unique when more than one surface is rendered in one SVG. */
  idPrefix?: string;
  className?: string;
  dataTestId?: string;
}

/**
 * Canonical indoor floor surface. Keep this component deliberately small:
 * the same SVG pattern definitions are used by the editor, settings preview,
 * and the read-only student floor renderer.
 */
export function FloorGroundSurface({
  x = 0,
  y = 0,
  width,
  height,
  appearance,
  legacyColor,
  idPrefix = "floor-surface",
  className,
  dataTestId = "floor-ground-surface",
}: FloorGroundSurfaceProps) {
  const resolved = normalizeFloorAppearance(appearance, legacyColor);
  const spec = floorPatternSpec(resolved.material, resolved.texture);
  const patternId = floorPatternId(idPrefix, resolved);

  return (
    <g className={className} data-testid={dataTestId} data-floor-material={resolved.material} data-floor-texture={resolved.texture}>
      {spec && (
        <defs>
          <pattern id={patternId} patternUnits="userSpaceOnUse" width={spec.size} height={spec.size}>
            <FloorPattern kind={spec.kind} size={spec.size} color={resolved.color} opacity={spec.opacity} />
          </pattern>
        </defs>
      )}
      <rect x={x} y={y} width={width} height={height} fill={resolved.color} />
      {spec && <rect x={x} y={y} width={width} height={height} fill={`url(#${patternId})`} />}
    </g>
  );
}

function FloorPattern({ kind, size, color, opacity }: { kind: FloorPatternKind; size: number; color: string; opacity: number }) {
  const light = "#ffffff";
  const dark = "#334155";
  const common = { fill: "none", strokeLinecap: "round" as const };
  switch (kind) {
    case "tile":
      return <g opacity={opacity}>
        <path d={`M0 0H${size}M0 0V${size}`} stroke={dark} strokeWidth={0.55} {...common} />
        <path d={`M0 1H${size}M1 0V${size}`} stroke={light} strokeWidth={0.45} {...common} />
      </g>;
    case "terrazzo":
      return <g opacity={opacity}>
        <circle cx={5} cy={7} r={0.9} fill={dark} /><circle cx={17} cy={4} r={0.55} fill={light} />
        <circle cx={25} cy={13} r={0.75} fill={dark} /><circle cx={9} cy={22} r={0.55} fill={light} />
        <circle cx={20} cy={27} r={0.95} fill={dark} /><circle cx={29} cy={24} r={0.45} fill={light} />
      </g>;
    case "concrete":
      return <g opacity={opacity}>
        <circle cx={4} cy={6} r={0.45} fill={dark} /><circle cx={13} cy={3} r={0.32} fill={dark} />
        <circle cx={20} cy={9} r={0.38} fill={light} /><circle cx={28} cy={5} r={0.32} fill={dark} />
        <circle cx={8} cy={17} r={0.34} fill={light} /><circle cx={17} cy={20} r={0.3} fill={dark} />
        <circle cx={25} cy={18} r={0.44} fill={dark} /><path d="M1 27l3-1m12 2l2-1m8 3l3-1" stroke={dark} strokeWidth={0.32} {...common} />
      </g>;
    case "vinyl":
      return <g opacity={opacity}>
        <path d={`M0 0V${size}M${size / 2} 0V${size}`} stroke={dark} strokeWidth={0.55} {...common} />
        <path d={`M${size / 2 + 1} 0V${size}M0 ${size - 1}H${size}`} stroke={light} strokeWidth={0.4} {...common} />
      </g>;
    case "wood":
      return <g opacity={opacity}>
        <path d={`M0 0H${size}M0 ${size / 2}H${size}`} stroke={dark} strokeWidth={0.65} {...common} />
        <path d={`M${size * 0.3} 0v${size / 2}M${size * 0.78} ${size / 2}v${size / 2}`} stroke={dark} strokeWidth={0.45} {...common} />
        <path d={`M5 8q5-3 10 0M${size / 2 + 4} ${size / 2 + 8}q5-3 11 0`} stroke={color} strokeWidth={0.55} opacity={0.55} {...common} />
      </g>;
    case "neutral":
    default:
      return <g opacity={opacity}>
        <path d={`M-4 ${size - 4}L${size - 4} -4M8 ${size + 4}L${size + 4} 8`} stroke={dark} strokeWidth={0.42} {...common} />
        <path d={`M0 ${size - 1}L${size - 1} 0`} stroke={light} strokeWidth={0.36} {...common} />
      </g>;
  }
}

type FloorPatternKind = "neutral" | "tile" | "terrazzo" | "concrete" | "vinyl" | "wood";

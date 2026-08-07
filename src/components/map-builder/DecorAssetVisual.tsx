import type { CSSProperties } from "react";
import type { DecorAssetDescriptor } from "./constants";
import { DECOR_ASSET_MAP } from "./constants";
import { getDecorParts } from "../../lib/decorVisual";

/**
 * Renders the artwork of one decorative asset in its local
 * 0..defaultWidth × 0..defaultHeight coordinate space (no transforms applied).
 * The caller wraps it in whatever transform/viewBox it needs, so the canvas,
 * the property-panel preview and the hierarchy palette always show the exact
 * same artwork.
 */
export function DecorAssetArt({ descriptor }: { descriptor: DecorAssetDescriptor }) {
  return (
    <>
      {getDecorParts(descriptor).map((p, i) => (
        <path
          key={i}
          d={p.d}
          fill={p.fill}
          stroke={p.stroke}
          strokeWidth={p.strokeWidth}
          fillOpacity={p.fillOpacity}
          strokeLinecap={p.strokeLinecap}
          strokeLinejoin={p.strokeLinejoin}
        />
      ))}
    </>
  );
}

/** Convenience <svg> wrapper sized to the asset's native aspect ratio. */
export function DecorAssetVisual({
  type,
  className,
  style,
}: {
  type: string;
  className?: string;
  style?: CSSProperties;
}) {
  const descriptor = DECOR_ASSET_MAP[type];
  if (!descriptor) return null;
  return (
    <svg
      viewBox={`0 0 ${descriptor.defaultWidth} ${descriptor.defaultHeight}`}
      className={className}
      style={style}
      preserveAspectRatio="xMidYMid meet"
    >
      <DecorAssetArt descriptor={descriptor} />
    </svg>
  );
}

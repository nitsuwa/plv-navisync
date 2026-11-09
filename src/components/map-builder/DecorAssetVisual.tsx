import { memo, type CSSProperties } from "react";
import type { DecorAssetDescriptor } from "./constants";
import { DECOR_ASSET_MAP } from "./constants";
import { getDecorParts } from "../../lib/decorVisual";
import { SUHAY_HUSAY_V11_SHAPES, suhayHusayV11SymbolPoint, type SuhayV11ShapeName } from "../../lib/suhayHusayLandmark";

const SUHAY_HUSAY_PREVIEW_LAYERS: ReadonlyArray<{ name: SuhayV11ShapeName; fill: string; stroke?: string; strokeWidth?: number }> = [
  { name: "pedestal", fill: "#545d57", stroke: "#353d38", strokeWidth: 0.25 },
  { name: "rockMass", fill: "#626b64", stroke: "#414943", strokeWidth: 0.16 },
  { name: "standingLeftLeg", fill: "#444d47" },
  { name: "standingRightLeg", fill: "#505a53" },
  { name: "standingCore", fill: "#687269" },
  { name: "standingFreeArm", fill: "#70786f", stroke: "#485148", strokeWidth: 0.12 },
  { name: "lowerFoldedLeg", fill: "#71776e", stroke: "#3a433d", strokeWidth: 0.13 },
  { name: "lowerCore", fill: "#918e82", stroke: "#444a43", strokeWidth: 0.15 },
  { name: "lowerRestingArm", fill: "#7c8278", stroke: "#454e48", strokeWidth: 0.12 },
  { name: "standingLinkedArm", fill: "#59635b", stroke: "#3a433d", strokeWidth: 0.13 },
  { name: "lowerLinkedArm", fill: "#a09a8b", stroke: "#4d5148", strokeWidth: 0.13 },
  { name: "clasp", fill: "#b7aa90", stroke: "#56584f", strokeWidth: 0.11 },
];

function SuhayHusayPreviewArt() {
  return <g data-testid="suhay-husay-asset-art" aria-label="Suhay Husay monument preview">
    {SUHAY_HUSAY_PREVIEW_LAYERS.map(({ name, fill, stroke = "#3d4540", strokeWidth = 0.14 }) => {
      const points = SUHAY_HUSAY_V11_SHAPES[name];
      const d = points.map((point, index) => {
        const [baseX, baseY] = suhayHusayV11SymbolPoint(point);
        const x = 16 + (baseX - 16) * 0.96;
        const y = 17 + (baseY - 17) * 1.03;
        return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
      }).join(" ") + " Z";
      return <path key={name} data-suhay-layer={name} d={d} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" />;
    })}
  </g>;
}

/**
 * Renders the artwork of one decorative asset in its local
 * 0..defaultWidth × 0..defaultHeight coordinate space (no transforms applied).
 * The caller wraps it in whatever transform/viewBox it needs, so the canvas,
 * the property-panel preview and the hierarchy palette always show the exact
 * same artwork.
 */
function DecorAssetArtView({ descriptor, primaryFillOverride }: { descriptor: DecorAssetDescriptor; primaryFillOverride?: string }) {
  return (
    <>
      {getDecorParts(descriptor).map((p, i) => (
        <path
          key={i}
          d={p.d}
          fill={i === 0 && primaryFillOverride !== undefined ? primaryFillOverride : p.fill}
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

export const DecorAssetArt = memo(DecorAssetArtView);

/** Convenience <svg> wrapper sized to the asset's native aspect ratio. */
function DecorAssetVisualView({
  type,
  variant,
  className,
  style,
}: {
  type: string;
  variant?: "suhay-husay";
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
      {type === "monument" && variant === "suhay-husay" ? <SuhayHusayPreviewArt /> : <DecorAssetArt descriptor={descriptor} />}
    </svg>
  );
}

export const DecorAssetVisual = memo(DecorAssetVisualView);

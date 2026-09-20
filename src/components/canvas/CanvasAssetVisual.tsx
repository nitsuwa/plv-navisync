import type { CSSProperties, ReactNode } from "react";
import { getCanvasAsset } from "./canvasAssetCatalog";

export interface CanvasAssetVisualProps {
  assetKey: string;
  label?: string;
  className?: string;
  style?: CSSProperties;
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
}

const common = {
  fill: "currentColor",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function AssetArt({ artKind }: { artKind: string }): ReactNode {
  switch (artKind) {
    case "chair":
      return (
        <>
          <rect x="20" y="5" width="20" height="16" rx="4" />
          <path d="M20 21v26M40 21v26M20 30h20M25 47h-5M35 47h5" />
        </>
      );
    case "table":
      return (
        <>
          <rect x="8" y="10" width="44" height="22" rx="6" />
          <path d="M14 32v15M46 32v15M14 39h32" />
          <ellipse cx="30" cy="21" rx="12" ry="5" fill="none" />
        </>
      );
    case "booth":
      return (
        <>
          <path d="M9 19h42M13 19v28M47 19v28" />
          <path d="M8 15h44l-5-9H13z" />
          <path d="M13 33h34v14H13z" opacity=".35" />
          <path d="M18 38h24" />
        </>
      );
    case "stage":
      return (
        <>
          <rect x="7" y="12" width="46" height="29" rx="4" />
          <path d="M11 19h38M11 34h38M16 41v7M44 41v7M20 48h20" />
          <path d="M17 25h26" opacity=".55" />
        </>
      );
    case "speaker":
      return (
        <>
          <rect x="15" y="4" width="30" height="45" rx="5" />
          <circle cx="30" cy="18" r="5" />
          <circle cx="30" cy="35" r="9" />
          <path d="M22 10h16" />
        </>
      );
    case "projector":
      return (
        <>
          <rect x="7" y="14" width="40" height="23" rx="5" />
          <circle cx="18" cy="25.5" r="4" />
          <path d="M47 19l10-5v23l-10-5M23 43h16" />
        </>
      );
    case "monitor":
      return (
        <>
          <rect x="7" y="7" width="46" height="30" rx="4" />
          <path d="M30 37v9M19 49h22" />
          <path d="M13 14h34" opacity=".45" />
        </>
      );
    case "tent":
      return (
        <>
          <path d="M5 49L30 6l25 43z" />
          <path d="M30 6v43M18 49l12-20 12 20M12 37h36" />
        </>
      );
    case "barrier":
      return (
        <>
          <path d="M8 14h44M8 30h44M14 8v35M46 8v35" />
          <path d="M10 14l10 16M26 14l10 16M42 14l10 16" opacity=".7" />
        </>
      );
    case "signage":
      return (
        <>
          <path d="M10 8h40v25H10zM30 33v15M21 48h18" />
          <path d="M17 16h23M17 23h14" />
          <path d="M42 17l5 4-5 4" fill="none" />
        </>
      );
    case "registration-desk":
      return (
        <>
          <rect x="7" y="15" width="46" height="24" rx="3" />
          <path d="M12 39v8M48 39v8M16 23h28M22 29h16" />
          <path d="M24 9h12v6H24z" />
        </>
      );
    case "podium":
      return (
        <>
          <path d="M17 12h26l-4 35H21z" />
          <path d="M13 12h34M23 7h14v5H23z" />
          <path d="M23 22h14" opacity=".55" />
        </>
      );
    case "microphone":
      return (
        <>
          <rect x="24" y="6" width="12" height="23" rx="6" />
          <path d="M19 20a11 11 0 0 0 22 0M30 31v12M22 47h16" />
        </>
      );
    case "queue-post":
      return (
        <>
          <circle cx="30" cy="15" r="7" />
          <path d="M30 22v24M22 47h16M23 15h-9M37 15h9" />
        </>
      );
    case "whiteboard":
      return (
        <>
          <rect x="7" y="9" width="46" height="28" rx="2" />
          <path d="M14 44l5-7M46 44l-5-7M17 17h26M17 24h20" />
        </>
      );
    default:
      return (
        <>
          <rect x="10" y="8" width="40" height="35" rx="4" />
          <path d="M17 17h26M17 25h19M17 33h12M30 43v7" />
        </>
      );
  }
}

export function CanvasAssetVisual({
  assetKey,
  label,
  className,
  style,
  x,
  y,
  width,
  height,
}: CanvasAssetVisualProps) {
  const descriptor = getCanvasAsset(assetKey);
  const accessibleLabel = label || descriptor?.name || assetKey;

  return (
    <svg
      role="img"
      aria-label={accessibleLabel}
      viewBox="0 0 60 56"
      x={x}
      y={y}
      width={width}
      height={height}
      className={className}
      style={{ color: descriptor?.color || "#64748b", ...style }}
      preserveAspectRatio="xMidYMid meet"
    >
      <g {...common}>
        <AssetArt artKind={descriptor?.artKind || "fallback"} />
      </g>
    </svg>
  );
}

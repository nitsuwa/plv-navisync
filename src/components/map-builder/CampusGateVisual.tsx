import type { SVGAttributes } from "react";

/** Small, reusable front-facing campus gate mark for the palette and canvas. */
export function CampusGateVisual({
  color = "#2563eb",
  x,
  y,
  width = 36,
  height = 30,
  className,
  ...props
}: SVGAttributes<SVGSVGElement> & { color?: string; x?: number; y?: number; width?: number; height?: number }) {
  return (
    <svg
      viewBox="0 0 36 30"
      width={width}
      height={height}
      x={x}
      y={y}
      className={className}
      aria-hidden="true"
      {...props}
    >
      <rect x="2" y="3" width="5" height="24" rx="1.5" fill={color} opacity="0.9" />
      <rect x="29" y="3" width="5" height="24" rx="1.5" fill={color} opacity="0.9" />
      <rect x="7" y="8" width="10" height="19" rx="1.5" fill={color} opacity="0.14" stroke={color} strokeWidth="1.6" />
      <rect x="19" y="8" width="10" height="19" rx="1.5" fill={color} opacity="0.14" stroke={color} strokeWidth="1.6" />
      <path d="M9.5 11v13M14.5 11v13M21.5 11v13M26.5 11v13" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <path d="M7 6h22" stroke={color} strokeWidth="1.8" strokeLinecap="round" opacity="0.8" />
      <path d="M13.5 5.5h9" stroke={color} strokeWidth="1.4" strokeLinecap="round" opacity="0.65" />
    </svg>
  );
}

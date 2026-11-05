import { useId } from "react";

/** Iskolar, the student route guide, as the 2D current-position marker.
 * Local units match the previous marker (outer halo r=13) so screen scaling
 * via `.student-map-screen-marker` is unchanged. Only the notch rotates with
 * the route bearing; the face always stays upright. */
export function IskolarMarkerArt({ bearing, walking = false }: { bearing: number; walking?: boolean }) {
  return <g data-testid="route-iskolar-marker">
    <circle r={13} fill="rgba(200,150,12,0.28)" />
    <g data-route-heading transform={`rotate(${bearing})`}>
      <path d="M14 0 L9.4 -4.2 L9.4 4.2 Z" fill="#0e2a6e" />
    </g>
    <circle r={10.2} fill="#0e2a6e" />
    <circle r={8.6} fill="#ffffff" />
    <IskolarBust radius={8.6} walking={walking} />
  </g>;
}

/** Iskolar's head and shoulders clipped to a circle of `radius`, centered on
 * the local origin. Shared by the student route marker and admin route Start. */
export function IskolarBust({ radius, walking = false }: { radius: number; walking?: boolean }) {
  const clipId = `iskolar-bust-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return <g data-testid="iskolar-bust">
    <clipPath id={clipId}><circle r={radius} /></clipPath>
    <g clipPath={`url(#${clipId})`}>
      <g className={walking ? "student-route-walker-bob" : undefined}>
        {/* Bust drawn in the 200-unit mascot artboard space, centered on the face. */}
        <g transform={`scale(${(0.17 * radius) / 8.6}) translate(-100 -92)`}>
          <path d="M60 140 Q100 126 140 140 L140 170 L60 170 Z" fill="#0e2a6e" />
          <path d="M74 140 L76 170 M126 140 L124 170" stroke="#c8960c" strokeWidth={7} strokeLinecap="round" />
          <circle cx={57} cy={92} r={8} fill="#e8b88c" />
          <circle cx={143} cy={92} r={8} fill="#e8b88c" />
          <circle cx={100} cy={88} r={44} fill="#f2c9a0" />
          <path d="M56 88 C54 50 82 38 104 40 C130 42 148 62 144 90 C138 74 124 64 106 66 C112 74 104 78 96 72 C84 70 66 76 56 88 Z" fill="#1e1b2e" />
          <ellipse cx={84} cy={98} rx={7} ry={9} fill="#1e1b2e" />
          <ellipse cx={116} cy={98} rx={7} ry={9} fill="#1e1b2e" />
          <circle cx={86.5} cy={94.5} r={2.4} fill="#ffffff" />
          <circle cx={118.5} cy={94.5} r={2.4} fill="#ffffff" />
          <path d="M90 113 Q100 122 110 113" fill="none" stroke="#1e1b2e" strokeWidth={4.5} strokeLinecap="round" />
        </g>
      </g>
    </g>
  </g>;
}

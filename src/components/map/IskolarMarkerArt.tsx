import { useId } from "react";
import { useNaviBuddyAppearance } from "../../contexts/NaviBuddyStore";
import { NAVIBUDDY_OUTFIT_DETAILS } from "../../lib/naviBuddy";

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
  const appearance = useNaviBuddyAppearance();
  const outfit = NAVIBUDDY_OUTFIT_DETAILS[appearance.outfit];
  const clipId = `iskolar-bust-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return <g data-testid="iskolar-bust">
    <clipPath id={clipId}><circle r={radius} /></clipPath>
    <g clipPath={`url(#${clipId})`}>
      <g className={walking ? "student-route-walker-bob" : undefined}>
        {/* Bust drawn in the 200-unit mascot artboard space, centered on the face. */}
        {/* Keep the hair/hat inside the circle while giving the outfit readable shoulder color at map scale. */}
        <g transform={`scale(${(0.15 * radius) / 8.6} ${(0.13 * radius) / 8.6}) translate(-100 -94)`}>
          {appearance.backpack !== "none" && <path d={appearance.backpack === "compact" ? "M128 139 Q142 136 145 151 L143 164 L128 163 Z" : "M126 137 Q146 134 150 153 L148 169 L126 167 Z"} fill={appearance.backpack === "classic" ? "#c8960c" : "#8b5e3c"} stroke="#0e2a6e" strokeWidth={3} />}
          <path d="M38 136 Q49 122 72 122 L128 122 Q151 124 162 136 L164 170 L36 170 Z" fill={outfit.jacket} />
          {appearance.outfit === "classic" && <path d="M74 140 L76 170 M126 140 L124 170" stroke={outfit.accent} strokeWidth={7} strokeLinecap="round" />}
          {appearance.outfit === "casual" && <><rect x={88} y={149} width={24} height={14} rx={3} fill={outfit.accent} /><path d="M94 150v3 M106 150v3" stroke={outfit.jacket} strokeWidth={2}/></>}
          {appearance.outfit === "sporty" && <><path d="M68 148h64 M70 156h60" stroke={outfit.accent} strokeWidth={4}/><circle cx={100} cy={165} r={4} fill={outfit.accent}/></>}
          {appearance.outfit === "plv_uniform" && <><path d="M87 138l13 9-6 6-10-12z M113 138l-13 9 6 6 10-12z" fill="#d7edf8" stroke="#779fb6" strokeWidth={1.5}/><path d="M98 150h4v20h-4z" fill="#83b4d0"/><circle cx={100} cy={153} r={1.4} fill="#31566e"/><circle cx={100} cy={160} r={1.4} fill="#31566e"/><circle cx={100} cy={167} r={1.4} fill="#31566e"/><path d="M108 151h12v10h-12z" fill="#a9d2e6" stroke="#83b4d0" strokeWidth={1.5}/></>}
          <circle cx={57} cy={92} r={8} fill="#e8b88c" />
          <circle cx={143} cy={92} r={8} fill="#e8b88c" />
          <circle cx={100} cy={88} r={44} fill="#f2c9a0" />
          <path d="M55 89 C53 55 78 38 101 41 C126 42 147 62 145 91 C138 75 124 66 106 68 C111 75 104 78 96 73 C83 71 65 78 55 89 Z" fill="#1e1b2e" />
          <ellipse cx={75} cy={54} rx={16} ry={13} fill="#1e1b2e"/><ellipse cx={100} cy={46} rx={18} ry={14} fill="#1e1b2e"/><ellipse cx={124} cy={57} rx={15} ry={13} fill="#1e1b2e"/>
          <path d="M59 74Q70 64 82 67Q87 70 86 80Q78 73 69 84Q63 87 59 89Z M78 67Q90 62 100 68Q104 72 101 82Q94 75 84 82Q80 84 76 83Z M97 68Q109 63 120 70L122 86Q114 77 105 83Q100 83 96 80Z" fill="#1e1b2e"/>
          <ellipse cx={84} cy={98} rx={5.4} ry={7} fill="#1e1b2e" />
          <ellipse cx={116} cy={98} rx={5.4} ry={7} fill="#1e1b2e" />
          <circle cx={85.8} cy={95} r={1.8} fill="#ffffff" />
          <circle cx={117.8} cy={95} r={1.8} fill="#ffffff" />
          <path d="M90 113 Q100 121 110 113" fill="none" stroke="#1e1b2e" strokeWidth={3.8} strokeLinecap="round" />
          {appearance.outfit === "adventurer" && <>
            {/* Keep the map icon brim broad enough to match the 3D explorer hat. */}
            <path d="M48 51q6-7 19-7h66q13 0 19 7-3 6-16 6H64q-13 0-16-6z" fill="#a77a43" stroke="#684d35" strokeWidth={3}/>
            <path d="M65 47q2-19 35-19t35 19z" fill="#b58a52" stroke="#684d35" strokeWidth={3}/>
            <path d="M64 44h72v7H64z" fill="#6f543a"/>
          </>}
        </g>
      </g>
    </g>
  </g>;
}

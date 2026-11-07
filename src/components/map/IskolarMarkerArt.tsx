import { useId } from "react";
import { useNaviBuddyAppearance } from "../../contexts/NaviBuddyStore";
import { NAVIBUDDY_OUTFIT_DETAILS, type NaviBuddyAppearance } from "../../lib/naviBuddy";

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

/** Full standalone character illustration for the customization fallback and map UI.
 * It shares the same face, hair, outfit and hat drawing as the map bust while
 * owning a roomier artboard for legs and shoes. The map marker keeps its own
 * circular crop and route-heading wrapper above. */
export function IskolarCharacterArt({ appearance, walking = false, wardrobeFit = false }: { appearance: NaviBuddyAppearance; walking?: boolean; wardrobeFit?: boolean }) {
  const outfit = NAVIBUDDY_OUTFIT_DETAILS[appearance.outfit];
  const pack = appearance.backpack;
  return <g data-testid="iskolar-character" data-outfit={appearance.outfit}>
    {/* Backpack sits close to the silhouette, with rounded body, flap and pocket. */}
    {pack !== "none" && <>
      <path d={pack === "compact" ? "M143 164 Q151 158 159 165 Q164 170 164 180 L162 211 Q160 217 143 217 Z" : "M140 158 Q151 151 161 159 Q169 166 169 179 L167 217 Q165 223 141 223 Z"} fill={pack === "classic" ? "#d6a72b" : "#9a6948"} stroke="#0e2a6e" strokeWidth="3" />
      <path d="M89 169 Q78 174 81 198 M132 169 Q144 174 143 198" fill="none" stroke={outfit.accent} strokeWidth="5" strokeLinecap="round" />
      <path d={pack === "compact" ? "M145 185 Q154 181 161 187 L161 202 Q159 205 145 205 Z" : "M143 184 Q155 179 165 187 L164 207 Q162 210 143 209 Z"} fill={pack === "classic" ? "#edc75b" : "#b27b52"} stroke="#684d35" strokeWidth="2" />
      <path d="M148 164 Q154 161 159 165 M151 201h5" fill="none" stroke="#f7e3a0" strokeWidth="2" strokeLinecap="round" />
    </>}
    {/* legs, torso and arms */}
    <path d="M72 204 Q110 190 148 204 L145 226 L135 235 L131 284 L113 286 L110 240 L105 286 L87 284 L83 235 L73 226 Z" fill={outfit.pants} stroke="#0e2a6e" strokeWidth="3" strokeLinejoin="round" />
    <path d="M91 231 L88 279 M128 231 L130 279" fill="none" stroke="#ffffff" strokeOpacity=".16" strokeWidth="2" />
    <path d="M86 280 Q99 277 108 282 L108 297 Q104 303 79 300 Q75 295 86 280 Z M116 282 Q127 277 136 280 L145 296 Q143 302 116 300 Z" fill="#17233b" stroke="#0e2a6e" strokeWidth="3" strokeLinejoin="round" />
    <path d="M80 296 Q93 299 106 295 M118 295 Q131 299 144 295" fill="none" stroke="#ffffff" strokeOpacity=".72" strokeWidth="2" strokeLinecap="round" />
    <path d={wardrobeFit ? "M84 165 Q75 166 71 176 L75 187 Q80 190 86 181 L91 171 Z" : "M84 165 Q73 166 67 178 L68 197 Q71 203 78 199 L88 178 Z"} fill={outfit.jacket} stroke="#0e2a6e" strokeWidth="3" strokeLinejoin="round" />
    <g>
      <path d={wardrobeFit ? "M136 165 Q145 166 149 176 L145 187 Q140 190 134 181 L129 171 Z" : "M136 165 Q147 166 153 178 L152 197 Q149 203 142 199 L132 178 Z"} fill={outfit.jacket} stroke="#0e2a6e" strokeWidth="3" strokeLinejoin="round" />
      {wardrobeFit && <path d="M145 184 Q151 183 155 188 L153 201 Q150 205 144 201 Z" fill="#f2c9a0" stroke="#0e2a6e" strokeWidth="2" />}
      <path d={wardrobeFit ? "M143 198 Q149 195 154 199 L154 209 Q150 214 144 211 Z" : "M142 198 Q149 194 155 198 L155 209 Q150 215 143 211 Z"} fill="#f2c9a0" stroke="#0e2a6e" strokeWidth="2" />
    </g>
    <path d={wardrobeFit ? "M69 184 Q75 183 79 188 L77 201 Q73 205 68 201 Z" : "M68 196 Q73 193 79 198 L78 209 Q73 214 68 209 Z"} fill="#f2c9a0" stroke="#0e2a6e" strokeWidth="2" />
    <path d={wardrobeFit ? "M86 170 Q110 159 134 170 L137 213 Q110 224 83 213 Z" : "M84 170 Q110 155 136 170 L141 215 Q110 228 79 215 Z"} fill={outfit.jacket} stroke="#0e2a6e" strokeWidth="3" strokeLinejoin="round" />
    <path d="M88 176 Q110 164 132 176" fill="none" stroke="#ffffff" strokeOpacity=".2" strokeWidth="3" strokeLinecap="round" />
    {appearance.outfit === "plv_uniform" && <path d="M91 169l19 15 19-15 M108 183v39 M108 192v3 M108 202v3 M108 212v3" fill="none" stroke="#d9edf8" strokeWidth="3" strokeLinecap="round" />}
    {appearance.outfit === "sporty" && <path d="M83 194h54 M83 203h54" stroke={outfit.accent} strokeWidth="4" />}
    {appearance.outfit === "classic" && <path d="M88 193v27 M132 193v27" stroke={outfit.accent} strokeWidth="5" strokeLinecap="round" />}
    {appearance.outfit === "casual" && <path d="M99 191h20v18H99z" fill={outfit.accent} stroke="#0e2a6e" strokeWidth="2" />}
    {appearance.outfit === "adventurer" && <><path d="M82 195h56" stroke="#3d4b2c" strokeWidth="5"/><circle cx="110" cy="195" r="4" fill="#d5a84c"/></>}
    {/* Same map-marker face, hairstyle and outfit-specific hat, framed at full scale. */}
    <g className={walking ? "student-route-walker-bob" : undefined} transform="translate(110 104) scale(1.05)">
      <IskolarBust radius={80} appearance={appearance} clip={false} includeBackpack={false} wardrobeFit={wardrobeFit} />
    </g>
  </g>;
}

/** Iskolar's head and shoulders clipped to a circle of `radius`, centered on
 * the local origin. Shared by the student route marker and admin route Start. */
export function IskolarBust({ radius, walking = false, appearance: appearanceOverride, clip = true, includeBackpack = true, wardrobeFit = false }: { radius: number; walking?: boolean; appearance?: NaviBuddyAppearance; clip?: boolean; includeBackpack?: boolean; wardrobeFit?: boolean }) {
  const storedAppearance = useNaviBuddyAppearance();
  const appearance = appearanceOverride ?? storedAppearance;
  const outfit = NAVIBUDDY_OUTFIT_DETAILS[appearance.outfit];
  const clipId = `iskolar-bust-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return <g data-testid="iskolar-bust" data-outfit={appearance.outfit}>
    {clip && <clipPath id={clipId}><circle r={radius} /></clipPath>}
    <g clipPath={clip ? `url(#${clipId})` : undefined}>
      <g className={walking ? "student-route-walker-bob" : undefined}>
        {/* Bust drawn in the 200-unit mascot artboard space, centered on the face. */}
        {/* Keep the hair/hat inside the circle while giving the outfit readable shoulder color at map scale. */}
        <g transform={`scale(${(0.15 * radius) / 8.6} ${(0.13 * radius) / 8.6}) translate(-100 -94)`}>
          {includeBackpack && appearance.backpack !== "none" && <path d={appearance.backpack === "compact" ? "M128 139 Q142 136 145 151 L143 164 L128 163 Z" : "M126 137 Q146 134 150 153 L148 169 L126 167 Z"} fill={appearance.backpack === "classic" ? "#c8960c" : "#8b5e3c"} stroke="#0e2a6e" strokeWidth={3} />}
    <path d={wardrobeFit ? "M50 136 Q56 122 74 122 L126 122 Q144 124 150 136 L152 170 L48 170 Z" : "M38 136 Q49 122 72 122 L128 122 Q151 124 162 136 L164 170 L36 170 Z"} fill={outfit.jacket} />
          {appearance.outfit === "classic" && <path d="M74 140 L76 170 M126 140 L124 170" stroke={outfit.accent} strokeWidth={7} strokeLinecap="round" />}
          {appearance.outfit === "casual" && <><rect x={88} y={149} width={24} height={14} rx={3} fill={outfit.accent} /><path d="M94 150v3 M106 150v3" stroke={outfit.jacket} strokeWidth={2}/></>}
          {appearance.outfit === "sporty" && <><path d="M68 148h64 M70 156h60" stroke={outfit.accent} strokeWidth={4}/><circle cx={100} cy={165} r={4} fill={outfit.accent}/></>}
          {appearance.outfit === "plv_uniform" && <><path d="M87 138l13 9-6 6-10-12z M113 138l-13 9 6 6 10-12z" fill="#d7edf8" stroke="#779fb6" strokeWidth={1.5}/><path d="M98 150h4v20h-4z" fill="#83b4d0"/><circle cx={100} cy={153} r={1.4} fill="#31566e"/><circle cx={100} cy={160} r={1.4} fill="#31566e"/><circle cx={100} cy={167} r={1.4} fill="#31566e"/></>}
          <circle cx={57} cy={94} r={9} fill="#dfa77f" />
          <circle cx={143} cy={94} r={9} fill="#dfa77f" />
          <circle cx={57} cy={94} r={4.5} fill="#f2c9a0" />
          <circle cx={143} cy={94} r={4.5} fill="#f2c9a0" />
          <ellipse cx={100} cy={90} rx={45} ry={47} fill="#f5d1ae" stroke="#d79e79" strokeWidth={2} />
          <path d="M55 91 C51 57 75 37 100 39 C128 39 149 61 145 92 Q139 78 127 73 Q118 66 105 68 Q108 77 99 78 Q90 77 87 70 Q68 74 55 91Z" fill="#211c31" />
          <ellipse cx={76} cy={54} rx={17} ry={14} fill="#211c31"/><ellipse cx={101} cy={47} rx={19} ry={15} fill="#211c31"/><ellipse cx={125} cy={57} rx={16} ry={14} fill="#211c31"/>
          <path d="M57 80Q68 66 83 67Q90 70 86 84Q79 75 68 88Q62 91 57 91Z M78 69Q91 63 101 69Q106 74 100 85Q94 77 84 86Q80 87 76 85Z M98 69Q111 64 122 71L125 89Q115 79 105 86Q100 86 96 82Z M123 74Q136 75 144 91Q137 87 131 84Z" fill="#211c31"/>
          <path d="M67 58Q77 44 91 45 M95 49Q108 42 119 52 M130 63Q139 72 140 81 M62 79Q66 72 73 69 M91 71Q96 68 101 71 M112 72Q117 70 121 74" fill="none" stroke="#51455e" strokeOpacity=".62" strokeWidth={2.4} strokeLinecap="round" />
          <path d="M71 92 Q81 88 88 92 M112 92 Q120 88 129 92" fill="none" stroke="#573744" strokeWidth={2.4} strokeLinecap="round" />
          <ellipse cx={84} cy={99} rx={5.2} ry={7.2} fill="#211c31" />
          <ellipse cx={116} cy={99} rx={5.2} ry={7.2} fill="#211c31" />
          <circle cx={85.7} cy={96} r={1.8} fill="#ffffff" />
          <circle cx={117.7} cy={96} r={1.8} fill="#ffffff" />
          <ellipse cx={69} cy={108} rx={7} ry={3.5} fill="#e99b91" opacity=".45" />
          <ellipse cx={131} cy={108} rx={7} ry={3.5} fill="#e99b91" opacity=".45" />
          <path d="M99 105q-2 3 1 4" fill="none" stroke="#d49b7d" strokeWidth={1.8} strokeLinecap="round" />
          <path d="M90 114 Q100 122 110 114" fill="none" stroke="#7d4350" strokeWidth={3.5} strokeLinecap="round" />
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

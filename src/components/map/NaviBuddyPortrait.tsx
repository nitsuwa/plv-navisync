import { AnimatePresence, motion } from "motion/react";
import { NAVIBUDDY_OUTFIT_DETAILS, type NaviBuddyAppearance } from "../../lib/naviBuddy";
import { useNaviBuddy } from "../../contexts/NaviBuddyStore";

/** Lightweight SVG portrait scaled to the same compact head/body proportions as the 3D mascot. */
export function NaviBuddyPortrait({ appearance, className = "", waving = false, excited = false, curious = false }: { appearance: NaviBuddyAppearance; className?: string; waving?: boolean; excited?: boolean; curious?: boolean }) {
  const style = NAVIBUDDY_OUTFIT_DETAILS[appearance.outfit];
  const uniform = appearance.outfit === "plv_uniform";
  const adventurer = appearance.outfit === "adventurer";
  const sporty = appearance.outfit === "sporty";
  const casual = appearance.outfit === "casual";
  return <svg viewBox="0 0 180 210" role="img" aria-label={`${style.label} NaviBuddy`} className={`navibuddy-portrait ${className}`}>
    <ellipse cx="90" cy="196" rx="34" ry="4.5" fill="currentColor" opacity=".08" />
    {/* Backpack sits behind the shoulders, as it does on the procedural model. */}
    {appearance.backpack !== "none" && <g aria-hidden="true">
      <path d={appearance.backpack === "compact" ? "M112 116Q112 106 121 105Q130 105 132 115L132 140Q130 147 121 145L114 141Z" : "M110 115Q111 103 124 102Q137 103 140 115L138 145Q136 153 124 151L113 147Z"} fill={appearance.backpack === "classic" ? "#c8960c" : "#8b5e3c"} stroke="#0e2a6e" strokeWidth="2" />
      <path d={appearance.backpack === "compact" ? "M117 121Q117 118 121 118H128Q130 119 130 122V132H117Z" : "M116 121Q116 118 121 118H132Q134 119 134 122V134H116Z"} fill={appearance.backpack === "classic" ? "#f1d36f" : "#aa7953"} stroke={appearance.backpack === "classic" ? "#947006" : "#69442e"} strokeWidth="1.2" />
      <path d="M115 111Q116 106 120 105M132 106Q136 109 137 114" fill="none" stroke={appearance.backpack === "classic" ? "#947006" : "#69442e"} strokeWidth="2" strokeLinecap="round" />
    </g>}
    <g className={`${waving ? "navibuddy-wave" : ""} ${excited ? "navibuddy-excited" : ""} ${curious ? "navibuddy-curious" : ""}`}>
      {/* Short, sturdy legs echo the 3D capsule limbs and keep the head from dominating. */}
      <path d="M75 151h13v28q0 4-4 4H72q-4-2-1-6z M94 151h13v27q0 4-4 5H91q-3-2 0-6z" fill={style.pants} />
      <path d={adventurer ? "M72 177h17v10H68q-4-4 4-10z M93 177h17v10H90q-3-4 3-10z" : "M72 178h17v8H68q-4-4 4-8z M93 178h17v8H90q-3-4 3-8z"} fill={uniform ? "#111318" : adventurer ? "#5a402e" : "#1f2937"} />
      {/* Compact torso with clear outfit-specific construction. */}
      <path d="M68 107Q74 102 82 101H98Q107 102 112 108L117 149Q91 155 63 149Z" fill={style.jacket} stroke="#0e2a6e" strokeWidth="1.8" strokeLinejoin="round" />
      {appearance.outfit === "classic" && <path d="M77 105v43 M103 105v43" stroke={style.accent} strokeWidth="4" />}
      {casual && <>
        <path d="M78 104Q90 115 102 104" fill="none" stroke="#d8eee6" strokeWidth="2.5" />
        <path d="M78 135q12-5 24 0v12H78z" fill="#245b59" />
        <path d="M88 137v6 M94 137v6" stroke={style.accent} strokeWidth="1.4" />
      </>}
      {sporty && <>
        <path d="M68 118h45 M67 125h47" stroke={style.accent} strokeWidth="2.5" />
        <circle cx="90" cy="140" r="3.4" fill={style.accent} />
      </>}
      {uniform && <>
        <path d="M82 103L90 110L86 115L78 108Z M98 103L90 110L94 115L102 108Z" fill="#d7edf8" stroke="#779fb6" strokeWidth="1" />
        <path d="M89 111h2v26h-2z" fill="#83b4d0" />
        <circle cx="90" cy="117" r="1.2" fill="#31566e" /><circle cx="90" cy="124" r="1.2" fill="#31566e" /><circle cx="90" cy="131" r="1.2" fill="#31566e" />
        <path d="M99 117h9v10h-9z" fill="#a9d2e6" stroke="#83b4d0" strokeWidth=".8" />
      </>}
      {adventurer && <>
        <path d="M90 103v42" stroke="#d1ae70" strokeWidth="1.6" />
        <path d="M66 142h48" stroke="#65472d" strokeWidth="4" />
        <rect x="87" y="139.5" width="7" height="6" rx="1" fill="#d5a84c" />
        <path d="M68 112l8 3 M112 112l-8 3" stroke="#687644" strokeWidth="2.2" strokeLinecap="round" />
      </>}
      {/* Arms follow the small rounded sleeves of the 3D model. */}
      <path d={uniform ? "M67 108Q61 111 61 121l7 4 8-12z M113 108q6 3 6 13l-7 4-8-12z" : "M68 108Q60 111 58 125l7 5 10-16z M112 108q8 3 10 17l-7 5-10-16z"} fill={style.jacket} stroke="#0e2a6e" strokeWidth="1.5" strokeLinejoin="round" />
      {uniform && <path d="M63 121l-2 13q1 5 5 4l5-13z M117 121l2 13q-1 5-5 4l-5-13z" fill="#f2c9a0" />}
      <circle cx="64" cy="138" r="5" fill="#f2c9a0" /><circle cx="116" cy="138" r="5" fill="#f2c9a0" />
      {/* Rounded head, small friendly eyes, and soft ears match the 3D face. */}
      <ellipse cx="90" cy="74" rx="29" ry="31" fill="#f2c9a0" />
      <ellipse cx="61.5" cy="78" rx="5" ry="7" fill="#e8b88c" /><ellipse cx="118.5" cy="78" rx="5" ry="7" fill="#e8b88c" />
      {/* Low crown and overlapping swept locks: full, but no taller than the actual 3D cut. */}
      <path d="M61 76Q59 54 72 44Q80 37 89 41Q100 34 110 44Q122 54 119 77Q113 66 104 63Q98 70 90 65Q76 63 61 76Z" fill="#1e1b2e" />
      <ellipse cx="73" cy="52" rx="11" ry="10" fill="#1e1b2e" /><ellipse cx="89" cy="44" rx="13" ry="10" fill="#1e1b2e" /><ellipse cx="106" cy="51" rx="11" ry="10" fill="#1e1b2e" />
      <path d="M62 68Q70 58 80 62Q84 64 83 73Q77 68 70 77Q66 80 62 81Z M78 63Q88 58 96 63Q100 67 98 75Q92 69 85 76Q81 78 77 77Z M94 63Q104 59 114 66L118 80Q111 72 103 77Q98 78 94 74Z" fill="#1e1b2e" />
      <path d="M62 72Q61 87 68 92 M118 72Q119 87 112 92" fill="none" stroke="#1e1b2e" strokeWidth="5" strokeLinecap="round" />
      <ellipse cx="81" cy="79" rx="3.4" ry="4.6" fill="#1e1b2e" /><ellipse cx="99" cy="79" rx="3.4" ry="4.6" fill="#1e1b2e" />
      <circle cx="82" cy="77.5" r="1" fill="#fff" /><circle cx="100" cy="77.5" r="1" fill="#fff" />
      <path d="M84 91Q90 97 96 91" fill="none" stroke="#703c34" strokeWidth="2.2" strokeLinecap="round" />
      {/* Brim overlaps the crown and upper hair, leaving the face and lower fringe visible. */}
      {adventurer && <g aria-label="Explorer hat">
        <path d="M54 47Q59 42 70 42H110Q121 42 126 48Q123 52 112 53H68Q57 52 54 47Z" fill="#a77a43" stroke="#684d35" strokeWidth="1.6" />
        <path d="M64 45Q66 30 90 29Q114 30 116 45Z" fill="#b58a52" stroke="#684d35" strokeWidth="1.6" />
        <path d="M65 42H115V47H65Z" fill="#6f543a" />
      </g>}
    </g>
  </svg>;
}

export function NaviBuddyReactionBubble() {
  const { appearance, reaction } = useNaviBuddy();
  return <AnimatePresence>
    {appearance.companionEnabled && reaction && <motion.aside initial={{ opacity: 0, y: 7, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 5 }} transition={{ duration: 0.18 }} role="status" className="pointer-events-none absolute bottom-[calc(var(--student-mobile-bottom-navigation-height)+1rem)] left-3 z-[65] flex max-w-[220px] items-center gap-2 rounded-2xl border border-border/70 bg-card/95 px-2.5 py-2 shadow-lg backdrop-blur-sm sm:bottom-4">
      <NaviBuddyPortrait appearance={appearance} className="h-10 w-9 shrink-0" excited={reaction.toLowerCase().includes("made it")} curious={reaction.toLowerCase().includes("found a path")} />
      <span className="text-[11px] font-bold leading-snug text-foreground">{reaction}</span>
    </motion.aside>}
  </AnimatePresence>;
}

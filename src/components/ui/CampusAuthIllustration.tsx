type CampusBuildingLayout = {
  key: string;
  label: string;
  x: number;
  width: number;
  height: number;
  roofWidth: number;
  roofHeight: number;
  windowRows: number;
  windowColumns: number;
  fill: string;
  marker?: boolean;
  focal?: boolean;
};

const CAMPUS_BASELINE_Y = 252;
const CAMPUS_BUILDINGS: CampusBuildingLayout[] = [
  { key: "ceit", label: "CEIT", x: 26, width: 68, height: 76, roofWidth: 42, roofHeight: 19, windowRows: 2, windowColumns: 3, fill: "rgba(37,99,235,0.46)", marker: true },
  { key: "main", label: "MAIN", x: 136, width: 88, height: 116, roofWidth: 56, roofHeight: 30, windowRows: 4, windowColumns: 3, fill: "rgba(59,130,246,0.56)", marker: true, focal: true },
  { key: "caba", label: "CABA", x: 266, width: 68, height: 84, roofWidth: 44, roofHeight: 21, windowRows: 3, windowColumns: 3, fill: "rgba(37,99,235,0.46)", marker: true },
];

/** Shared skyline artwork used by the desktop sign-in panel and mobile auth backdrop. */
export function CampusAuthIllustration({ idPrefix = "auth-campus", animated = true }: { idPrefix?: string; animated?: boolean }) {
  const glowId = `${idPrefix}-glow`;
  const routeId = `${idPrefix}-route`;
  return (
    <div className="flex w-full flex-1 items-center justify-center py-4">
      <svg viewBox="0 0 360 280" className="w-full max-w-md" aria-hidden="true">
        <defs>
          <linearGradient id={`${idPrefix}-sky`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1e3a8a" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#0d2470" stopOpacity="0.1" />
          </linearGradient>
          <linearGradient id={`${idPrefix}-building`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#93c5fd" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
          <linearGradient id={`${idPrefix}-building-2`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#bfdbfe" />
            <stop offset="100%" stopColor="#60a5fa" />
          </linearGradient>
          <filter id={glowId}>
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        <path d="M 16 252 H 344 Q 350 252 350 258 V 276 H 10 V 258 Q 10 252 16 252 Z" fill="rgba(30,58,138,0.4)" />
        {[24, 64, 104, 144, 184, 224, 264, 304, 324].map((x) => (
          <rect key={x} x={x} y="255" width="16" height="4" rx="2" fill="rgba(255,255,255,0.3)" />
        ))}

        {CAMPUS_BUILDINGS.map((building) => {
          const windowWidth = Math.max(7, (building.width - 18 - (building.windowColumns - 1) * 6) / building.windowColumns);
          const outline = building.focal ? "rgba(191,219,254,0.78)" : "rgba(147,197,253,0.66)";
          return (
            <g key={building.key} transform={`translate(${building.x} ${CAMPUS_BASELINE_Y})`}>
              <rect x="0" y={-building.height} width={building.width} height={building.height} rx="4" fill={building.fill} stroke={outline} strokeWidth={building.focal ? 1.5 : 1} />
              <rect x={(building.width - building.roofWidth) / 2} y={-(building.height + building.roofHeight)} width={building.roofWidth} height={building.roofHeight} rx="3" fill={building.fill} stroke={outline} strokeWidth={building.focal ? 1.5 : 1} />
              <rect x="3" y={-building.height + 4} width="4" height={building.height - 26} rx="2" fill="rgba(255,255,255,0.16)" />
              <rect x={building.width - 7} y={-building.height + 4} width="4" height={building.height - 26} rx="2" fill="rgba(14,42,110,0.18)" />
              {Array.from({ length: building.windowRows }, (_, row) =>
                Array.from({ length: building.windowColumns }, (_, column) => (
                  <rect key={`${row}-${column}`} x={9 + column * (windowWidth + 6)} y={-building.height + 14 + row * 16} width={windowWidth} height="8" rx="1.5" fill={(row + column) % 3 === 0 ? "rgba(255,255,255,0.78)" : "rgba(255,255,255,0.42)"} stroke="rgba(30,64,175,0.24)" strokeWidth="0.7" />
                )),
              )}
              <rect x={building.width / 2 - 19} y="-29" width="38" height="10" rx="2" fill="rgba(14,42,110,0.56)" stroke="rgba(255,255,255,0.24)" strokeWidth="0.7" />
              <text x={building.width / 2} y="-21" textAnchor="middle" fill="white" fontSize="7.5" fontWeight="700" letterSpacing="0.35" opacity="0.95">{building.label}</text>
              <rect x={building.width / 2 - 8} y="-17" width="16" height="17" rx="2" fill="rgba(14,42,110,0.5)" stroke="rgba(14,42,110,0.32)" strokeWidth="0.7" />
              <rect x={building.width / 2 - 5} y="-14" width="10" height="1.5" rx="0.75" fill="rgba(255,255,255,0.42)" />
              <rect x="-2" y="-5" width={building.width + 4} height="5" rx="2" fill="rgba(14,42,110,0.36)" />
            </g>
          );
        })}

        <line x1="180" y1="66" x2="180" y2={CAMPUS_BASELINE_Y - 116 - 30} stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" />
        <rect x="180" y="66" width="20" height="13" rx="1" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1" />
        <rect x="180" y="66" width="20" height="6" rx="1" fill="rgba(14,42,110,0.8)" />
        <rect x="180" y="72" width="20" height="7" rx="1" fill="rgba(200,150,12,0.9)" />

        {[[12, 248], [112, 248], [248, 248], [348, 248]].map(([cx, cy]) => (
          <g key={`${cx}-${cy}`}>
            <ellipse cx={cx} cy={cy - 14} rx="7" ry="11" fill="rgba(52,211,153,0.7)" />
            <rect x={cx - 2} y={cy} width="4" height="8" rx="1" fill="rgba(52,211,153,0.5)" />
          </g>
        ))}

        {animated && (
          <circle r="4" fill="#c8960c" stroke="white" strokeWidth="1.5" filter={`url(#${glowId})`}>
            <animateMotion dur="5s" repeatCount="indefinite"><mpath href={`#${routeId}`} /></animateMotion>
          </circle>
        )}
        <path id={routeId} d="M 16 253 L 60 253 L 180 253 L 300 253 L 344 253" fill="none" />
        {animated && CAMPUS_BUILDINGS.filter((building) => building.marker).map((building, index) => (
          <g key={`${building.key}-pulse`}>
            <circle cx={building.x + building.width / 2} cy={CAMPUS_BASELINE_Y - building.height} r="5" fill="rgba(200,150,12,0.9)" stroke="white" strokeWidth="1.5" />
            <circle cx={building.x + building.width / 2} cy={CAMPUS_BASELINE_Y - building.height} r="5" fill="none" stroke="rgba(200,150,12,0.6)" strokeWidth="2" style={{ animation: `pulse-ring 2s ease-out ${index * 0.6}s infinite` }} />
          </g>
        ))}
      </svg>
    </div>
  );
}

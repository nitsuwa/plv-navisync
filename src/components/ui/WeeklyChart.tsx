// ── Weekly activity data ─────────────────────────────────────────────────

export const WEEKLY_DATA = [
  { day: "Mon", updates: 4, reports: 2 },
  { day: "Tue", updates: 7, reports: 3 },
  { day: "Wed", updates: 5, reports: 1 },
  { day: "Thu", updates: 9, reports: 4 },
  { day: "Fri", updates: 6, reports: 2 },
  { day: "Sat", updates: 8, reports: 1 },
  { day: "Sun", updates: 5, reports: 0 },
];

export const maxVal = Math.max(...WEEKLY_DATA.map((d) => d.updates + d.reports));

// ── Chart dimensions ──────────────────────────────────────────────────────

export const CHART_CONFIG = {
  W: 480,
  H: 140,
  barW: 46,
  barGap: 0.42, // fraction of barW per individual bar
  barOffset: 0.5, // fraction of barW to offset the second bar
  bottomPad: 10, // pixels from bottom for labels
  topPad: 10, // extra padding
} as const;

// ── Layout calculations (exported for testing) ────────────────────────────

/** Compute the gap between bar groups */
export function computeGap(W: number, barW: number, numGroups: number): number {
  return (W - numGroups * barW) / (numGroups + 1);
}

/** Compute a bar's x position */
export function barX(gap: number, barW: number, index: number): number {
  return gap + index * (barW + gap);
}

/** Compute bar height from value */
export function barHeight(value: number, max: number, availableHeight: number): number {
  return (value / max) * availableHeight;
}

// ── Component ─────────────────────────────────────────────────────────────

export function WeeklyChart({
  data = WEEKLY_DATA,
  chartMax = maxVal,
  width = CHART_CONFIG.W,
  height = CHART_CONFIG.H,
  barWidth = CHART_CONFIG.barW,
}: {
  data?: typeof WEEKLY_DATA;
  chartMax?: number;
  width?: number;
  height?: number;
  barWidth?: number;
} = {}) {
  const gap = computeGap(width, barWidth, data.length);
  const availableH = height - CHART_CONFIG.bottomPad - CHART_CONFIG.topPad;
  const effectiveMax = chartMax || 1; // avoid division by zero

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-28" preserveAspectRatio="xMidYMid meet" data-testid="weekly-chart">
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((frac, i) => (
        <line
          key={i}
          x1={0}
          y1={height * (1 - frac)}
          x2={width}
          y2={height * (1 - frac)}
          stroke="var(--border)"
          strokeWidth={0.5}
          opacity={0.5}
        />
      ))}
      {data.map((d, i) => {
        const x = barX(gap, barWidth, i);
        const upH = barHeight(d.updates, effectiveMax, availableH);
        const rpH = barHeight(d.reports, effectiveMax, availableH);
        return (
          <g key={d.day}>
            {/* Updates bar */}
            <rect
              x={x}
              y={height - CHART_CONFIG.bottomPad - upH}
              width={barWidth * CHART_CONFIG.barGap}
              height={upH}
              rx={3}
              className="fill-primary/80"
              data-testid={`bar-updates-${d.day}`}
            />
            {/* Reports bar */}
            <rect
              x={x + barWidth * CHART_CONFIG.barOffset}
              y={height - CHART_CONFIG.bottomPad - rpH}
              width={barWidth * CHART_CONFIG.barGap}
              height={rpH}
              rx={3}
              className="fill-amber-500/70"
              data-testid={`bar-reports-${d.day}`}
            />
            {/* Day label */}
            <text
              x={x + barWidth / 2}
              y={height - 2}
              textAnchor="middle"
              className="fill-muted-foreground"
              fontSize={8}
              fontWeight="600"
              data-testid={`label-${d.day}`}
            >
              {d.day}
            </text>
            {/* Value labels */}
            {d.updates > 0 && (
              <text
                x={x + barWidth * 0.21}
                y={height - CHART_CONFIG.bottomPad - 4 - upH}
                textAnchor="middle"
                className="fill-primary"
                fontSize={7}
                fontWeight="700"
                data-testid={`val-updates-${d.day}`}
              >
                {d.updates}
              </text>
            )}
            {d.reports > 0 && (
              <text
                x={x + barWidth * CHART_CONFIG.barOffset + barWidth * CHART_CONFIG.barGap / 2}
                y={height - CHART_CONFIG.bottomPad - 4 - rpH}
                textAnchor="middle"
                className="fill-amber-600"
                fontSize={7}
                fontWeight="700"
                data-testid={`val-reports-${d.day}`}
              >
                {d.reports}
              </text>
            )}
          </g>
        );
      })}
      {/* Legend */}
      <rect x={8} y={4} width={8} height={8} rx={2} className="fill-primary/80" />
      <text x={20} y={11} className="fill-muted-foreground" fontSize={7} fontWeight="600">
        Updates
      </text>
      <rect x={68} y={4} width={8} height={8} rx={2} className="fill-amber-500/70" />
      <text x={80} y={11} className="fill-muted-foreground" fontSize={7} fontWeight="600">
        Reports
      </text>
    </svg>
  );
}

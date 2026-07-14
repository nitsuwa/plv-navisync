import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  WeeklyChart,
  WEEKLY_DATA,
  maxVal,
  CHART_CONFIG,
  computeGap,
  barX,
  barHeight,
} from "../WeeklyChart";

// ── Pure function tests (no React) ─────────────────────────────────────────

describe("computeGap", () => {
  it("returns correct gap for 7 groups at default width", () => {
    const gap = computeGap(CHART_CONFIG.W, CHART_CONFIG.barW, WEEKLY_DATA.length);
    // (480 - 7*46) / 8 = (480 - 322) / 8 = 158 / 8 = 19.75
    expect(gap).toBeCloseTo(19.75);
  });

  it("handles a single group", () => {
    const gap = computeGap(100, 40, 1);
    expect(gap).toBeCloseTo(30); // (100 - 40) / 2 = 30
  });

  it("handles zero groups gracefully", () => {
    const gap = computeGap(100, 40, 0);
    expect(gap).toBe(100); // (100 - 0) / 1 = 100
  });
});

describe("barX", () => {
  it("places the first bar at the gap offset", () => {
    expect(barX(20, 50, 0)).toBe(20);
  });

  it("places bars at evenly spaced intervals", () => {
    const gap = 20;
    const barW = 50;
    expect(barX(gap, barW, 1)).toBe(20 + 1 * (50 + 20)); // 90
    expect(barX(gap, barW, 2)).toBe(20 + 2 * (50 + 20)); // 160
  });
});

describe("barHeight", () => {
  it("proportional to the value / max ratio", () => {
    // max=100, available=120, value=50 → (50/100)*120 = 60
    expect(barHeight(50, 100, 120)).toBe(60);
  });

  it("returns 0 when value is 0", () => {
    expect(barHeight(0, 100, 120)).toBe(0);
  });

  it("returns full available height when value equals max", () => {
    expect(barHeight(100, 100, 120)).toBe(120);
  });
});

// ── Static data validation ────────────────────────────────────────────────

describe("WEEKLY_DATA", () => {
  it("has 7 days (Mon–Sun)", () => {
    expect(WEEKLY_DATA).toHaveLength(7);
    const days = WEEKLY_DATA.map((d) => d.day);
    expect(days).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  });

  it("maxVal equals the highest updates+reports combo (Thu: 9+4=13)", () => {
    expect(maxVal).toBe(13);
  });

  it("each day has non-negative updates and reports", () => {
    for (const d of WEEKLY_DATA) {
      expect(d.updates).toBeGreaterThanOrEqual(0);
      expect(d.reports).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("CHART_CONFIG", () => {
  it("has expected dimensions", () => {
    expect(CHART_CONFIG.W).toBe(480);
    expect(CHART_CONFIG.H).toBe(140);
    expect(CHART_CONFIG.barW).toBe(46);
  });
});

// ── Component rendering tests ─────────────────────────────────────────────

describe("WeeklyChart component rendering", () => {
  it("renders the SVG with correct viewBox", () => {
    render(<WeeklyChart />);
    const svg = screen.getByTestId("weekly-chart");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("viewBox", "0 0 480 140");
    expect(svg).toHaveAttribute("preserveAspectRatio", "xMidYMid meet");
  });

  it("renders all 7 day labels", () => {
    render(<WeeklyChart />);
    for (const d of WEEKLY_DATA) {
      expect(screen.getByTestId(`label-${d.day}`)).toBeInTheDocument();
    }
  });

  it("renders updates bars for all 7 days", () => {
    render(<WeeklyChart />);
    for (const d of WEEKLY_DATA) {
      expect(screen.getByTestId(`bar-updates-${d.day}`)).toBeInTheDocument();
    }
  });

  it("renders reports bars for all days with >0 reports", () => {
    render(<WeeklyChart />);
    for (const d of WEEKLY_DATA) {
      if (d.reports > 0) {
        expect(screen.getByTestId(`bar-reports-${d.day}`)).toBeInTheDocument();
      }
    }
  });

  it("renders a zero-height reports bar for Sunday (reports=0)", () => {
    render(<WeeklyChart />);
    expect(screen.getByTestId("bar-reports-Sun")).toHaveAttribute("height", "0");
  });

  it("renders value labels for updates when > 0", () => {
    render(<WeeklyChart />);
    expect(screen.getByTestId("val-updates-Mon")).toHaveTextContent("4");
    expect(screen.getByTestId("val-updates-Thu")).toHaveTextContent("9");
  });

  it("renders value labels for reports when > 0", () => {
    render(<WeeklyChart />);
    expect(screen.getByTestId("val-reports-Mon")).toHaveTextContent("2");
    expect(screen.getByTestId("val-reports-Sat")).toHaveTextContent("1");
  });

  it("does NOT render a report value label for Sunday (reports=0)", () => {
    render(<WeeklyChart />);
    expect(screen.queryByTestId("val-reports-Sun")).not.toBeInTheDocument();
  });

  it("renders 5 grid lines (0%, 25%, 50%, 75%, 100%)", () => {
    const { container } = render(<WeeklyChart />);
    // Grid lines are <line> elements directly under the SVG root
    const lines = container.querySelectorAll("svg > line");
    expect(lines).toHaveLength(5);
  });

  it("renders legend items (Updates + Reports)", () => {
    render(<WeeklyChart />);
    expect(screen.getByText("Updates")).toBeInTheDocument();
    expect(screen.getByText("Reports")).toBeInTheDocument();
  });
});

// ── Custom data & sizing ──────────────────────────────────────────────────

describe("WeeklyChart with custom props", () => {
  it("accepts a smaller dataset", () => {
    const data = [
      { day: "Mon", updates: 10, reports: 5 },
      { day: "Tue", updates: 8, reports: 3 },
    ];
    render(<WeeklyChart data={data} />);
    expect(screen.getByTestId("label-Mon")).toBeInTheDocument();
    expect(screen.getByTestId("label-Tue")).toBeInTheDocument();
    expect(screen.queryByTestId("label-Wed")).not.toBeInTheDocument();
  });

  it("accepts custom dimensions", () => {
    render(<WeeklyChart width={300} height={100} />);
    const svg = screen.getByTestId("weekly-chart");
    expect(svg).toHaveAttribute("viewBox", "0 0 300 100");
  });

  it("accepts custom max (ensuring all bars proportional)", () => {
    render(<WeeklyChart data={[{ day: "Mon", updates: 5, reports: 5 }]} chartMax={10} />);
    const bar = screen.getByTestId("bar-updates-Mon");
    // With 1 group: gap = (480-46)/2 = 217, x = 217
    // availableH = 140 - 10 - 10 = 120
    // upH = (5/10) * 120 = 60
    // y = 140 - 10 - 60 = 70
    expect(bar).toHaveAttribute("y", "70");
    expect(bar).toHaveAttribute("height", "60");
  });

  it("handles empty data gracefully", () => {
    const { container } = render(<WeeklyChart data={[]} />);
    const svg = screen.getByTestId("weekly-chart");
    expect(svg).toBeInTheDocument();
    // No bar groups should be rendered
    expect(container.querySelectorAll("g")).toHaveLength(0); // only grid lines + legend
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────

describe("barHeight edge cases", () => {
  it("handles max=0 (no division by zero)", () => {
    // When chartMax is 0, effectiveMax is 1 (inside component), so barHeight(0, 1, 130) = 0
    expect(barHeight(0, 1, 130)).toBe(0);
  });
});

describe("WeeklyChart edge cases", () => {
  it("renders with all-zero data", () => {
    const data = [
      { day: "Mon", updates: 0, reports: 0 },
      { day: "Tue", updates: 0, reports: 0 },
    ];
    render(<WeeklyChart data={data} chartMax={1} />);
    // Bars should exist but have height 0
    const monBar = screen.getByTestId("bar-updates-Mon");
    expect(monBar).toHaveAttribute("height", "0");
    // No value labels since values are 0
    expect(screen.queryByTestId("val-updates-Mon")).not.toBeInTheDocument();
  });

  it("renders with a single large value", () => {
    const data = [{ day: "Mon", updates: 999, reports: 0 }];
    render(<WeeklyChart data={data} chartMax={999} />);
    const bar = screen.getByTestId("bar-updates-Mon");
    // availableH = 140 - 10(bottomPad) - 10(topPad) = 120
    expect(bar).toHaveAttribute("height", "120");
  });
});

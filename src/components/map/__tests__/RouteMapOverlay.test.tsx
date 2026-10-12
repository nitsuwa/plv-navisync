import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RouteMapOverlay, routeChevronCount, routeChevronPath, routePolylineLength, routeProgressGeometry, segmentBearing } from "../RouteMapOverlay";

const points = [{ x: 10, y: 20 }, { x: 80, y: 20 }, { x: 80, y: 100 }, { x: 180, y: 100 }];

describe("RouteMapOverlay", () => {
  it("uses SVG coordinates where right is zero degrees and down is positive", () => {
    expect(segmentBearing({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(0);
    expect(segmentBearing({ x: 0, y: 0 }, { x: 0, y: 10 })).toBe(90);
  });

  it.each([
    { mode: "standard" as const, preference: "Best", color: "#1e40af" },
    { mode: "standard" as const, preference: "Prefer stairs", color: "#1e40af" },
    { mode: "standard" as const, preference: "Prefer elevator", color: "#1e40af" },
    { mode: "accessible" as const, preference: "Best", color: "#16a34a" },
    { mode: "emergency" as const, preference: "Default", color: "#dc2626" },
  ])("keeps a visible continuous path for $mode / $preference", ({ mode, color }) => {
    const { container } = render(<svg><RouteMapOverlay points={points} mode={mode} animated={false} layer="line" /></svg>);
    const strokes = container.querySelectorAll("[data-route-strokes] polyline");
    expect(strokes).toHaveLength(3);
    expect(container.querySelector('[data-testid="route-outer-casing"]')).toHaveAttribute("stroke", "#60a5fa");
    expect(container.querySelector(`polyline[stroke="${color}"][stroke-width="6"]`)).toHaveAttribute("points", "10,20 80,20 80,100 180,100");
    expect(container.querySelector('[data-testid="route-direction-chevrons"]')).toHaveAttribute("data-travel-direction", "start-to-destination");
    expect([...strokes].every((stroke) => Number(stroke.getAttribute("opacity") ?? 1) > 0)).toBe(true);
    expect([...strokes].every((stroke) => stroke.getAttribute("vector-effect") === "non-scaling-stroke")).toBe(true);
  });

  it("keeps route geometry and stroke visible through camera zoom changes", () => {
    const { container, rerender } = render(<svg>
      <g data-testid="camera" transform="translate(0,0) scale(.12)">
        <RouteMapOverlay points={points} mode="standard" animated={false} layer="line" />
      </g>
    </svg>);
    const casing = container.querySelector('[data-testid="route-outer-casing"]');
    expect(casing).toHaveAttribute("points", "10,20 80,20 80,100 180,100");

    rerender(<svg>
      <g data-testid="camera" transform="translate(-120,80) scale(4.5)">
        <RouteMapOverlay points={points} mode="standard" animated={false} layer="line" />
      </g>
    </svg>);
    expect(container.querySelector('[data-testid="route-outer-casing"]')).toBe(casing);
    expect(casing).toHaveAttribute("vector-effect", "non-scaling-stroke");
    expect(casing).toHaveAttribute("opacity", "0.88");
  });

  it("shows only meaningful route markers, not every authored graph point", () => {
    const { container } = render(<svg><RouteMapOverlay points={points} mode="standard" animated={false} /></svg>);
    expect(container.querySelector('[data-route-marker="start"]')).toBeInTheDocument();
    expect(container.querySelector('[data-route-marker="destination"]')).toBeInTheDocument();
    expect(container.querySelector("[data-route-junction]")).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid="route-direction-arrow"]')).not.toBeInTheDocument();
  });

  it("uses a restrained active-route flow without changing path geometry", () => {
    const { container, rerender } = render(<svg><RouteMapOverlay points={points} mode="standard" walkProgress={0.2} animated /></svg>);
    const baseRoute = container.querySelector('[data-testid="route-outer-casing"]');
    const flow = container.querySelector('[data-testid="route-direction-flow"]');
    expect(flow).toHaveAttribute("data-motion-path", "M60,20 L80,20 L80,100 L180,100");
    expect(flow?.querySelector("animateMotion")).toHaveAttribute("rotate", "auto");

    rerender(<svg><RouteMapOverlay points={points} mode="standard" walkProgress={0.55} animated /></svg>);
    expect(container.querySelector('[data-testid="route-outer-casing"]')).toBe(baseRoute);
    // Sparse: 2–4 chevrons, never the old busy triple/full-path arrow sets.
    const chevrons = [...container.querySelectorAll('[data-testid="route-direction-chevron"]')];
    expect(chevrons.length).toBeGreaterThanOrEqual(2);
    expect(chevrons.length).toBeLessThanOrEqual(4);
    expect(container.querySelector('[data-testid="route-direction-flow"]')).toHaveAttribute("data-chevron-count", String(chevrons.length));
    // Static and animated chevron sets never overlap on the same stroke.
    expect(container.querySelector('[data-testid="route-direction-chevrons"]')).not.toBeInTheDocument();
    // ONE shared phase: identical duration and constant fractional spacing,
    // so no chevron can ever overtake another.
    const motions = chevrons.map((chevron) => chevron.querySelector("animateMotion"));
    expect(new Set(motions.map((motion) => motion?.getAttribute("dur"))).size).toBe(1);
    const offsets = chevrons.map((chevron) => Number(chevron.getAttribute("data-chevron-offset")));
    const gaps = offsets.map((offset, index) =>
      (index === 0 ? offset + 1 - offsets[offsets.length - 1]! : offset - offsets[index - 1]!));
    expect(new Set(gaps.map((gap) => Number(gap.toFixed(4)))).size).toBe(1);
    // Every chevron follows the SAME canonical route path.
    expect(new Set(motions.map((motion) => motion?.getAttribute("path"))).size).toBe(1);
    motions.forEach((motion, index) => {
      expect(motion).toHaveAttribute("rotate", "auto");
      expect(motion).toHaveAttribute("begin", `-${(offsets[index]! * Number((motion!.getAttribute("dur") ?? "18s").replace("s", ""))).toFixed(3)}s`);
    });
    const completed = container.querySelector('[data-testid="completed-route-line"]');
    const current = container.querySelector("[data-route-current-position]");
    expect(completed).toHaveAttribute("points", "10,20 80,20 80,87.5");
    expect(current).toHaveAttribute("transform", "translate(80,87.5)");
    expect(completed?.getAttribute("points")?.split(" ").at(-1)).toBe("80,87.5");

    rerender(<svg><RouteMapOverlay points={points} mode="standard" walkProgress={0.55} animated={false} /></svg>);
    expect(container.querySelector('[data-testid="route-direction-flow"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid="route-direction-chevrons"]')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="route-outer-casing"]')).toBeInTheDocument();
  });

  it("writes high-frequency Follow progress into stable SVG nodes", () => {
    const lineWriter: { current: ((progress: number) => void) | null } = { current: null };
    const markerWriter: { current: ((progress: number) => void) | null } = { current: null };
    const { container } = render(<svg>
      <RouteMapOverlay points={points} mode="standard" walkProgress={0.2} animated layer="line" progressFrameWriterRef={lineWriter} />
      <RouteMapOverlay points={points} mode="standard" walkProgress={0.2} animated layer="markers" progressFrameWriterRef={markerWriter} />
    </svg>);
    const routeBase = container.querySelector('[data-testid="route-outer-casing"]');
    const completed = container.querySelector('[data-testid="completed-route-line"]');
    const remaining = container.querySelector('[data-testid="remaining-route-line"]');
    const current = container.querySelector("[data-route-current-position]");

    lineWriter.current?.(0.55);
    markerWriter.current?.(0.55);

    expect(container.querySelector('[data-testid="route-outer-casing"]')).toBe(routeBase);
    expect(completed).toHaveAttribute("data-progress", "0.55");
    expect(completed).toHaveAttribute("stroke-dasharray", "137.5 250");
    expect(remaining).toHaveAttribute("stroke-dasharray", "112.5 250");
    expect(remaining).toHaveAttribute("stroke-dashoffset", "-137.5");
    expect(current).toHaveAttribute("transform", "translate(80,87.5)");
  });

  it("keeps directional flow moving through route Preview without showing a player", () => {
    const { container } = render(<svg><RouteMapOverlay points={points} mode="standard" animated layer="line" /></svg>);
    expect(container.querySelector('[data-testid="route-direction-flow"]')).toBeInTheDocument();
    expect(container.querySelector('[data-route-current-position]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid="route-direction-chevron"] animateMotion')).toHaveAttribute("dur", "18s");
  });

  it("orients static chevrons along the path toward its destination", () => {
    const east = routeChevronPath([{ x: 0, y: 0 }, { x: 100, y: 0 }], 40, 8);
    const west = routeChevronPath([{ x: 100, y: 0 }, { x: 0, y: 0 }], 40, 8);
    expect(east).not.toBe(west);
    expect(east).toContain("M");
    expect(west).toContain("M");
  });

  it("derives a sparse 2–4 chevron count from route geometry alone", () => {
    expect(routeChevronCount([{ x: 0, y: 0 }, { x: 40, y: 0 }])).toBe(2);
    expect(routeChevronCount([{ x: 0, y: 0 }, { x: 320, y: 0 }])).toBe(2);
    expect(routeChevronCount([{ x: 0, y: 0 }, { x: 480, y: 0 }])).toBe(3);
    expect(routeChevronCount([{ x: 0, y: 0 }, { x: 2000, y: 0 }])).toBe(4);
    expect(routePolylineLength(points)).toBe(250);
  });

  it("only draws A/B markers on true endpoint layers", () => {
    const { container, rerender } = render(<svg><RouteMapOverlay points={points} mode="standard" layer="markers" animated={false} showEndMarker={false} /></svg>);
    expect(container.querySelector('[data-route-marker="start"]')).toBeInTheDocument();
    expect(container.querySelector('[data-route-marker="destination"]')).not.toBeInTheDocument();
    rerender(<svg><RouteMapOverlay points={points} mode="standard" layer="markers" animated={false} showStartMarker={false} /></svg>);
    expect(container.querySelector('[data-route-marker="start"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-route-marker="destination"]')).toBeInTheDocument();
  });

  it("derives current position and completed route endpoint from the same polyline split", () => {
    const geometry = routeProgressGeometry(points, 0.55);
    expect(geometry.position).toEqual({ x: 80, y: 87.5 });
    expect(geometry.completedPoints.at(-1)).toEqual(geometry.position);
    expect(geometry.remainingPoints[0]).toEqual(geometry.position);
    expect(routeProgressGeometry(points, 0).position).toEqual(points[0]);
    expect(routeProgressGeometry(points, 1).position).toEqual(points.at(-1));
  });

  it("keeps endpoint and progress markers screen-scaled with the camera", () => {
    const { container } = render(<svg>
      <g style={{ "--student-map-inverse-zoom": "4" } as React.CSSProperties}>
        <RouteMapOverlay points={points} mode="standard" walkProgress={0.55} layer="markers" />
      </g>
    </svg>);
    expect(container.querySelector('[data-route-marker="start"] .student-map-screen-marker')).toBeInTheDocument();
    expect(container.querySelector('[data-route-marker="destination"] .student-map-screen-marker')).toBeInTheDocument();
    expect(container.querySelector("[data-route-current-position] .student-map-screen-marker")).toBeInTheDocument();
  });

  it("gives Start a short green reveal and renders a destination pin at the final route point", () => {
    const { container, rerender } = render(<svg><RouteMapOverlay points={points} mode="standard" layer="markers" animated={false} /></svg>);
    const start = container.querySelector('[data-route-marker="start"]');
    const destination = container.querySelector('[data-route-marker="destination"]');
    expect(start?.querySelector('circle[fill="#16a34a"]')).toHaveAttribute("r", "16");
    expect(destination?.querySelector('[data-testid="destination-pin"]')).toBeInTheDocument();
    expect(destination?.querySelector("text")).not.toBeInTheDocument();
    expect(destination?.querySelector('[data-testid="destination-pin"]')?.getAttribute("d")).toContain("M0 0");
    expect(start?.querySelector('[data-testid="route-start-reveal"]')).toHaveClass("student-route-start-reveal");
    rerender(<svg><RouteMapOverlay points={points} mode="standard" layer="markers" walkProgress={0.4} animated={false} /></svg>);
    expect(start?.querySelector('[data-testid="route-start-reveal"]')).not.toHaveClass("student-route-start-reveal");
  });

  it("disables route motion when reduced motion is requested", () => {
    const original = window.matchMedia;
    const matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    Object.defineProperty(window, "matchMedia", { configurable: true, value: matchMedia });
    try {
      const { container } = render(<svg><RouteMapOverlay points={points} mode="standard" walkProgress={0.4} animated layer="line" /></svg>);
      expect(container.querySelector('[data-testid="route-direction-flow"]')).not.toBeInTheDocument();
      expect(container.querySelector('[data-testid="route-outer-casing"]')).toBeInTheDocument();
    } finally {
      Object.defineProperty(window, "matchMedia", { configurable: true, value: original });
    }
  });

  it("places route strokes in a separate layer from start/destination markers", () => {
    const { container, rerender } = render(<svg><RouteMapOverlay points={points} mode="standard" layer="line" animated={false} /></svg>);
    expect(container.querySelector("[data-route-strokes] polyline")).toBeInTheDocument();
    expect(container.querySelector('[data-route-marker="start"]')).not.toBeInTheDocument();

    rerender(<svg><RouteMapOverlay points={points} mode="standard" layer="markers" animated={false} /></svg>);
    expect(container.querySelector("[data-route-strokes] polyline")).not.toBeInTheDocument();
    expect(container.querySelector('[data-route-marker="start"]')).toBeInTheDocument();
    expect(container.querySelector('[data-route-marker="destination"]')).toBeInTheDocument();
  });
});

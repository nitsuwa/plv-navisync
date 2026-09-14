import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RouteMapOverlay, segmentBearing } from "../RouteMapOverlay";

describe("RouteMapOverlay direction arrows", () => {
  it("rotates each alternating arrow to its segment bearing", () => {
    render(
      <svg>
        <RouteMapOverlay
          points={[{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 0 }]}
          mode="standard"
        />
      </svg>,
    );

    const arrows = screen.getAllByTestId("route-direction-arrow");
    expect(arrows).toHaveLength(2);
    expect(arrows[0]).toHaveAttribute("transform", "rotate(90 0 5)");
    expect(arrows[1]).toHaveAttribute("transform", "rotate(-90 10 5)");
  });

  it("uses SVG coordinates where right is zero degrees and down is positive", () => {
    expect(segmentBearing({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(0);
    expect(segmentBearing({ x: 0, y: 0 }, { x: 0, y: 10 })).toBe(90);
  });

  it("skips repeated waypoints instead of rendering a NaN bearing", () => {
    render(
      <svg>
        <RouteMapOverlay
          points={[{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }]}
          mode="standard"
        />
      </svg>,
    );

    const arrows = screen.getAllByTestId("route-direction-arrow");
    expect(arrows).toHaveLength(1);
    expect(arrows[0]).not.toHaveAttribute("transform", expect.stringContaining("NaN"));
  });
});

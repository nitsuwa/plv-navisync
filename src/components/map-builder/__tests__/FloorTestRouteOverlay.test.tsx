import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { FloorTestRouteOverlay, buildFloorTestRouteGeometry } from "../FloorTestRouteOverlay";
import type { TestRouteHighlight } from "../TestNavigationPanel";

const route: TestRouteHighlight = {
  waypoints: [],
  waypointFragments: [
    [{ x: 0, y: 0 }, { x: 144, y: 0 }],
    [{ x: 144, y: 0 }, { x: 144, y: 144 }],
  ],
  routeNodeIds: ["a", "b", "c"],
  color: "#2563eb",
};

describe("FloorTestRouteOverlay", () => {
  it("caches route presentation as compound stroke and arrow geometry", () => {
    const geometry = buildFloorTestRouteGeometry(route);

    expect(geometry.routePath).toBe("M 0 0 L 144 0 M 144 0 L 144 144");
    expect(geometry.arrowCount).toBe(4);
    expect(geometry.arrowPath.match(/ Z/g)).toHaveLength(4);
    expect(buildFloorTestRouteGeometry(route)).toEqual(geometry);
  });

  it("renders a single native animated stroke and one arrow path regardless of arrow count", () => {
    const { getByTestId } = render(<svg><FloorTestRouteOverlay route={route} /></svg>);

    expect(getByTestId("floor-test-route-active-overlay").querySelectorAll("path")).toHaveLength(3);
    expect(getByTestId("floor-test-route-animated-stroke").querySelector("animate")).toBeTruthy();
    expect(getByTestId("floor-test-route-direction-arrows").getAttribute("data-arrow-count")).toBe("4");
  });
});

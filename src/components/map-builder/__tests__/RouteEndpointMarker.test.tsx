import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RouteEndpointMarker } from "../RouteTransitionMarker";

describe("RouteEndpointMarker", () => {
  it("shows the Iskolar mascot on the Test Navigation Start marker", () => {
    const { container } = render(<svg><RouteEndpointMarker x={10} y={20} kind="start" color="#2563eb" /></svg>);
    const start = container.querySelector('[data-testid="test-route-start-marker"]');
    expect(start?.querySelector('[data-testid="iskolar-bust"]')).toBeInTheDocument();
  });

  it("keeps the map pin on the destination marker", () => {
    const { container } = render(<svg><RouteEndpointMarker x={10} y={20} kind="destination" color="#2563eb" /></svg>);
    const destination = container.querySelector('[data-testid="test-route-destination-marker"]');
    expect(destination?.querySelector('[data-testid="iskolar-bust"]')).not.toBeInTheDocument();
    expect(destination?.querySelector("svg")).toBeInTheDocument();
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RouteMapOverlay } from "../RouteMapOverlay";
import { StudentRouteTransitionMarker } from "../StudentRouteTransitionMarker";

describe("StudentRouteTransitionMarker", () => {
  it.each([
    ["enter_building", "entrance"],
    ["exit_building", "entrance"],
    ["elevator", "elevator"],
    ["stairs", "stair"],
  ] as const)("uses the Admin Test Route renderer for %s cues", (studentKind, adminKind) => {
    render(
      <svg>
        <StudentRouteTransitionMarker x={12} y={34} kind={studentKind} label="Use the route transition." markerId="cue-1" active={false} />
      </svg>,
    );
    const wrapper = screen.getByTestId("student-route-preview-transition-marker");
    const adminMarker = screen.getByTestId("test-route-transition-marker");
    expect(wrapper).toHaveAttribute("data-student-transition-kind", studentKind);
    expect(adminMarker).toHaveAttribute("data-transition-kind", adminKind);
    expect(adminMarker).toHaveAttribute("transform", "translate(12 34)");
    expect(adminMarker).toHaveAttribute("data-transition-label-mode", "hover-focus");
    if (studentKind === "elevator" || studentKind === "stairs") {
      expect(wrapper.querySelector('[data-testid="student-transition-micro-label"]')).toBeInTheDocument();
    }
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders above route geometry and keeps the Admin transition connector beside the authored point", () => {
    const { container } = render(
      <svg>
        <RouteMapOverlay points={[{ x: 0, y: 0 }, { x: 40, y: 40 }]} mode="standard" layer="line" />
        <RouteMapOverlay points={[{ x: 0, y: 0 }, { x: 40, y: 40 }]} mode="standard" layer="markers" />
        <StudentRouteTransitionMarker x={40} y={40} kind="enter_building" label="Enter Science Hall." active={false} />
      </svg>,
    );
    const marker = screen.getByTestId("test-route-transition-marker");
    const routeMarkers = container.querySelector('[data-route-layer="markers"]')!;
    expect(routeMarkers.compareDocumentPosition(marker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(marker.querySelector('[data-testid="transition-label-pill"]')).toBeInTheDocument();
    expect(marker.querySelector('[data-testid="transition-label-pill"]')).toHaveClass("opacity-0");
  });

  it("keeps the active Admin-style control clickable and keyboard accessible", () => {
    const onActivate = vi.fn();
    const { container, rerender } = render(
      <svg>
        <StudentRouteTransitionMarker x={44} y={60} kind="elevator" label="Take Elevator to Floor 4" onActivate={onActivate} zoom={1} />
      </svg>,
    );
    const marker = screen.getByTestId("test-route-transition-marker");
    expect(marker).toHaveAttribute("role", "button");
    expect(marker).toHaveAttribute("pointer-events", "all");
    expect(screen.getByTestId("student-active-transition-marker")).toBeInTheDocument();
    const hitTarget = marker.querySelector('[data-testid="test-route-transition-hit-target"]');
    expect(hitTarget).toHaveAttribute("r", "22");
    expect(hitTarget).toHaveAttribute("pointer-events", "all");
    expect(hitTarget).toHaveAttribute("cx", "12");
    expect(hitTarget).toHaveAttribute("cy", "-14");
    fireEvent.click(hitTarget!);
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(marker.querySelectorAll("line")).toHaveLength(2);
    fireEvent.click(marker);
    expect(onActivate).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(marker, { key: "Enter" });
    expect(onActivate).toHaveBeenCalledTimes(3);

    rerender(
      <svg>
        <StudentRouteTransitionMarker x={44} y={60} kind="elevator" label="Take Elevator to Floor 4" onActivate={onActivate} zoom={0.5} />
      </svg>,
    );
    expect(container.querySelector('[data-testid="test-route-transition-hit-target"]')).toHaveAttribute("r", "22");
    expect(container.querySelector('[data-testid="student-active-transition-marker"] .student-map-screen-marker')).toBeInTheDocument();
  });
});

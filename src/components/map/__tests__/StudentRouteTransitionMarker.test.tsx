import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RouteMapOverlay } from "../RouteMapOverlay";
import { StudentRouteTransitionMarker, studentRouteTransitionViewportFromCamera } from "../StudentRouteTransitionMarker";

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

  it("keeps a vertical-run transition marker passive while Resume owns playback", () => {
    const onActivate = vi.fn();
    render(
      <svg>
        <StudentRouteTransitionMarker
          x={44}
          y={60}
          kind="stairs"
          label="Take the Right Stair down to Floor 4."
          onActivate={onActivate}
          active={false}
        />
      </svg>,
    );

    const marker = screen.getByTestId("test-route-transition-marker");
    expect(screen.getByTestId("student-route-preview-transition-marker")).toBeInTheDocument();
    expect(marker).not.toHaveAttribute("role", "button");
    expect(screen.queryByRole("button", { name: /Continue/ })).not.toBeInTheDocument();
    fireEvent.click(marker);
    fireEvent.keyDown(marker, { key: "Enter" });
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("keeps a single Explore choice directly actionable without changing playback controls", () => {
    const onInspectOnly = vi.fn();
    render(
      <svg>
        <StudentRouteTransitionMarker
          x={44}
          y={60}
          kind="stairs"
          label="Take the Left Stair up to Floor 2."
          choices={[{
            id: "left-stair-up-2",
            kind: "stairs",
            groupId: "left-stair",
            label: "Take the Left Stair up to Floor 2.",
            displayLabel: "Continue Upstairs — Floor 2",
            point: { x: 44, y: 60 },
            onActivate: onInspectOnly,
          }]}
        />
      </svg>,
    );

    const marker = screen.getByTestId("test-route-transition-marker");
    expect(screen.queryByTestId("student-explore-transition-choice-control")).not.toBeInTheDocument();
    fireEvent.click(marker);
    expect(onInspectOnly).toHaveBeenCalledTimes(1);
  });

  it("keeps screen-sized transition labels inside a narrow viewport after pan, zoom, and floor offsets", () => {
    const viewport = studentRouteTransitionViewportFromCamera({
      // A 1020-unit authored floor rendered into a 320px mobile map uses
      // about 3.2 viewBox units per CSS pixel. This is the scale the previous
      // viewBox-only clamp missed when compensating for camera zoom.
      width: 1020,
      height: 460,
      zoom: 1.25,
      center: { x: 510, y: 230 },
      pan: { x: -500, y: -20 },
      contentOffset: { x: -10, y: 0 },
      screenSpaceScale: 3.2,
    });
    const { container } = render(
      <svg>
        <StudentRouteTransitionMarker
          x={100}
          y={80}
          kind="stairs"
          label="Take the Left Stair down to Floor 3."
          displayLabel="Go down to Floor 3"
          zoom={1.25}
          viewport={viewport}
        />
      </svg>,
    );

    const label = screen.getByTestId("transition-label-pill");
    const [labelShiftX, labelShiftY] = (label.getAttribute("transform")?.match(/translate\(([-\d.]+)\s+([-\d.]+)/) ?? []).slice(1).map(Number);
    const labelRect = label.querySelector("rect")!;
    const labelRectX = Number(labelRect.getAttribute("x"));
    const labelRectY = Number(labelRect.getAttribute("y"));
    const labelRectWidth = Number(labelRect.getAttribute("width"));
    const labelRectHeight = Number(labelRect.getAttribute("height"));
    const screenScale = viewport.screenSpaceScale!;
    const renderedLeft = viewport.pan!.x + 100 * 1.25 + (labelShiftX + labelRectX) * screenScale;
    const renderedRight = renderedLeft + labelRectWidth * screenScale;
    const renderedTop = viewport.pan!.y + 80 * 1.25 + (labelShiftY + labelRectY) * screenScale;
    const renderedBottom = renderedTop + labelRectHeight * screenScale;
    expect(renderedLeft).toBeCloseTo(8 * screenScale);
    expect(renderedRight).toBeLessThanOrEqual(viewport.width - 8 * screenScale);
    expect(renderedTop).toBeGreaterThanOrEqual(8 * screenScale);
    expect(renderedBottom).toBeLessThanOrEqual(viewport.height - 8 * screenScale);
    expect(container.querySelector("[data-testid='transition-label-pill']")).toBeInTheDocument();
  });

  it("shows the authored next landing and direction on a stair cue", () => {
    render(
      <svg>
        <StudentRouteTransitionMarker
          x={40}
          y={50}
          kind="stairs"
          label="Take the Main Stair to Floor 3."
          displayLabel="Continue Upstairs — Floor 3"
          onActivate={() => {}}
        />
      </svg>,
    );
    expect(screen.getByTestId("transition-label-pill")).toHaveTextContent("Continue Upstairs — Floor 3");
  });
});

import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EntranceDirectionBadge, entranceDirectionBadgePlacement, studentDoorwayActionLabelPlacement, studentDoorwayActionLabelSize } from "../EntranceDirectionBadge";
import { screenSpaceMarkerScale, studentTransitionMarkerLodScale } from "../../../lib/studentRouteFlow";

describe("EntranceDirectionBadge", () => {
  it("renders the three direction meanings as one blue circular badge", () => {
    render(createElement("svg", null,
      createElement(EntranceDirectionBadge, { x: 20, y: 20, edge: "top", direction: "entrance_only" }),
      createElement(EntranceDirectionBadge, { x: 60, y: 20, edge: "right", direction: "exit_only", testId: "exit-badge" }),
      createElement(EntranceDirectionBadge, { x: 100, y: 20, edge: "bottom", direction: "both", testId: "both-badge" }),
    ));

    expect(screen.getAllByTestId("entrance-direction-badge")).toHaveLength(1);
    expect(screen.getByTestId("entrance-direction-badge").getAttribute("data-entrance-direction")).toBe("entrance_only");
    expect(screen.getByTestId("exit-badge").getAttribute("data-entrance-direction")).toBe("exit_only");
    expect(screen.getByTestId("both-badge").querySelectorAll("path")).toHaveLength(2);
    expect(screen.getByTestId("both-badge").querySelector("circle")?.getAttribute("fill")).toBe("#2563eb");
  });

  it("places and rotates the badge on the outside wall edge", () => {
    expect(entranceDirectionBadgePlacement(100, 100, "top")).toMatchObject({ x: 100, y: 83, angle: 0 });
    expect(entranceDirectionBadgePlacement(100, 100, "right")).toMatchObject({ x: 117, y: 100, angle: 90 });
    expect(entranceDirectionBadgePlacement(100, 100, "bottom")).toMatchObject({ x: 100, y: 117, angle: 180 });
    expect(entranceDirectionBadgePlacement(100, 100, "left")).toMatchObject({ x: 83, y: 100, angle: -90 });
    expect(entranceDirectionBadgePlacement(100, 100, "top", 20).angle).toBe(20);
  });

  it("points Entrance-only inward and Exit-only outward relative to every wall", () => {
    render(createElement("svg", null,
      createElement(EntranceDirectionBadge, { x: 20, y: 20, edge: "top", direction: "entrance_only", testId: "north-in" }),
      createElement(EntranceDirectionBadge, { x: 40, y: 20, edge: "bottom", direction: "entrance_only", testId: "south-in" }),
      createElement(EntranceDirectionBadge, { x: 60, y: 20, edge: "left", direction: "exit_only", testId: "west-out" }),
      createElement(EntranceDirectionBadge, { x: 80, y: 20, edge: "right", direction: "exit_only", testId: "east-out" }),
    ));

    expect(screen.getByTestId("north-in").querySelector("[data-testid=entrance-direction-arrows]")?.getAttribute("data-arrow-relative-rotation")).toBe("180");
    expect(screen.getByTestId("south-in").querySelector("[data-testid=entrance-direction-arrows]")?.getAttribute("data-arrow-relative-rotation")).toBe("180");
    expect(screen.getByTestId("west-out").querySelector("[data-testid=entrance-direction-arrows]")?.getAttribute("data-arrow-relative-rotation")).toBe("0");
    expect(screen.getByTestId("east-out").querySelector("[data-testid=entrance-direction-arrows]")?.getAttribute("data-arrow-relative-rotation")).toBe("0");
  });

  it("uses the outside-normal glyph for Exit-only on every wall", () => {
    render(createElement("svg", null,
      createElement(EntranceDirectionBadge, { x: 20, y: 20, edge: "top", direction: "exit_only", testId: "north-out" }),
      createElement(EntranceDirectionBadge, { x: 40, y: 20, edge: "bottom", direction: "exit_only", testId: "south-out" }),
      createElement(EntranceDirectionBadge, { x: 60, y: 20, edge: "left", direction: "exit_only", testId: "west-outward" }),
      createElement(EntranceDirectionBadge, { x: 80, y: 20, edge: "right", direction: "exit_only", testId: "east-outward" }),
    ));

    for (const id of ["north-out", "south-out", "west-outward", "east-outward"]) {
      expect(screen.getByTestId(id).querySelector("path")?.getAttribute("d")).toContain("M0,3 V-2.5");
    }
  });

  it("leaves Emergency Exit styling to the existing emergency renderer", () => {
    render(createElement("svg", null,
      createElement(EntranceDirectionBadge, { x: 20, y: 20, edge: "top", type: "emergency_exit" }),
    ));
    expect(screen.queryByTestId("entrance-direction-badge")).toBeNull();
  });

  it("places readable horizontal action labels along each authored outward normal", () => {
    const { width, height } = studentDoorwayActionLabelSize("Enter SC");
    expect(width).toBeGreaterThanOrEqual(11.5 * 3.5);
    expect(studentDoorwayActionLabelPlacement(0, width, height).screenY).toBeLessThan(0);
    expect(studentDoorwayActionLabelPlacement(180, width, height).screenY).toBeGreaterThan(0);
    expect(studentDoorwayActionLabelPlacement(90, width, height).screenX).toBeGreaterThan(0);
    expect(studentDoorwayActionLabelPlacement(-90, width, height).screenX).toBeLessThan(0);
  });

  it("keeps both authored directions visible while emphasizing only the outside-to-inside action", () => {
    render(createElement("svg", null,
    createElement(EntranceDirectionBadge, {
        x: 20, y: 20, edge: "top", direction: "both", testId: "student-two-way",
        pressableDirection: "entrance", emphasized: true,
      }),
    ));
    const badge = screen.getByTestId("student-two-way");
    expect(badge.querySelectorAll("[data-transition-arrow]")).toHaveLength(2);
    expect(badge.querySelector('[data-transition-arrow="entrance"]')).toHaveAttribute("data-transition-emphasis", "pressable");
    expect(badge.querySelector('[data-transition-arrow="exit"]')).not.toHaveAttribute("data-transition-emphasis");
    expect(badge.querySelector('[data-testid="entrance-direction-entrance-emphasis"] animate')).toBeInTheDocument();
    expect(badge.querySelector('[data-testid="entrance-direction-exit-emphasis"]')).toBeNull();
  });

  it("uses screen-space student sizing and a directional pressable pulse without changing the Admin badge", () => {
    render(createElement("svg", null,
      createElement(EntranceDirectionBadge, { x: 20, y: 20, edge: "top", direction: "both", testId: "screen-student", screenConsistent: true, pressableDirection: "entrance", emphasized: true }),
      createElement(EntranceDirectionBadge, { x: 60, y: 20, edge: "top", direction: "both", testId: "admin-default" }),
    ));
    const student = screen.getByTestId("screen-student");
    expect(student).toHaveAttribute("data-screen-space", "true");
    expect(student.querySelector('[data-testid="entrance-direction-disc"]')).toHaveAttribute("r", "7.5");
    expect(student.querySelector('[data-testid="entrance-direction-pressable-pulse"] animate')).toHaveAttribute("to", "23");
    expect(student.querySelectorAll("[data-transition-arrow]")).toHaveLength(2);
    expect(screen.getByTestId("admin-default")).not.toHaveAttribute("data-screen-space");
    expect(screen.getByTestId("admin-default").querySelector('[data-testid="entrance-direction-disc"]')).toHaveAttribute("r", "7.5");
  });

  it.each([
    ["top", 0], ["right", 90], ["bottom", 180], ["left", -90],
  ] as const)("keeps the %s student arrow tied to its world doorway through zoom and pan", (edge, angle) => {
    const doorway = { x: 137, y: 204 };
    render(createElement("svg", null,
      createElement(EntranceDirectionBadge, {
        ...doorway, edge, direction: "both", screenConsistent: true,
        active: true, activeDirection: "entrance", interactiveHitTarget: true,
      }),
    ));
    const badge = screen.getByTestId("entrance-direction-badge");
    const glyph = screen.getByTestId("student-direction-glyph");
    const placement = entranceDirectionBadgePlacement(doorway.x, doorway.y, edge);
    expect(badge).toHaveAttribute("transform", `translate(${placement.x},${placement.y}) rotate(${angle})`);
    expect(badge).toHaveAttribute("data-world-anchor-x", String(doorway.x));
    expect(badge).toHaveAttribute("data-world-anchor-y", String(doorway.y));
    expect(glyph).not.toHaveAttribute("transform");
    expect(screen.getByTestId("entrance-direction-active-ring").closest("[data-testid=student-direction-glyph]")).toBe(glyph);
    expect(screen.queryByTestId("entrance-direction-pressable-pulse")).not.toBeInTheDocument();
    expect(badge.querySelectorAll("[data-transition-arrow]")).toHaveLength(2);

    for (const { zoom, fit, pan } of [
      { zoom: 0.18, fit: 0.31, pan: { x: 75, y: -32 } }, // narrow mobile overview
      { zoom: 0.52, fit: 0.31, pan: { x: -18, y: 42 } },
      { zoom: 1, fit: 1.1, pan: { x: 0, y: 0 } },
      { zoom: 3.5, fit: 1.1, pan: { x: -140, y: 94 } },
    ]) {
      const lod = studentTransitionMarkerLodScale(fit * zoom);
      const inverse = screenSpaceMarkerScale(1 / fit, zoom);
      const doorScreen = { x: fit * (pan.x + doorway.x * zoom), y: fit * (pan.y + doorway.y * zoom) };
      const glyphScreen = {
        x: fit * (pan.x + placement.x * zoom),
        y: fit * (pan.y + placement.y * zoom),
      };
      expect(Math.hypot(glyphScreen.x - doorScreen.x, glyphScreen.y - doorScreen.y)).toBeCloseTo(17 * fit * zoom, 5);
      expect(glyph.querySelector(".student-transition-marker-lod")).toBeInTheDocument();
      expect(lod).toBeGreaterThan(0);
    }
  });

  it("keeps the visible arrow Admin-sized while providing a separate screen-space touch target", () => {
    render(createElement("svg", null,
      createElement(EntranceDirectionBadge, { x: 20, y: 20, edge: "top", direction: "both", screenConsistent: true, interactiveHitTarget: true, testId: "touchable-student" }),
    ));
    const marker = screen.getByTestId("touchable-student");
    expect(marker.querySelector('[data-testid="entrance-direction-disc"]')).toHaveAttribute("r", "7.5");
    expect(marker.querySelector('[data-testid="entrance-direction-hit-target"]')).toHaveAttribute("r", "22");
    expect(marker.querySelector('[data-testid="entrance-direction-disc"]')?.closest(".student-transition-marker-lod")).toBeTruthy();
    expect(marker.querySelector('[data-testid="entrance-direction-hit-target"]')?.closest(".student-transition-marker-lod")).toBeNull();
    expect(marker.querySelector(".student-transition-normal-pulse")).toBeNull();
  });

  it("lets the active route direction override context and keeps the opposite arrow quiet", () => {
    render(createElement("svg", null,
      createElement(EntranceDirectionBadge, {
        x: 20, y: 20, edge: "left", direction: "both", testId: "active-two-way",
        pressableDirection: "entrance", activeDirection: "exit", active: true,
      }),
    ));
    const badge = screen.getByTestId("active-two-way");
    expect(badge).toHaveAttribute("data-emphasized-direction", "exit");
    expect(badge.querySelector('[data-transition-arrow="exit"]')).toHaveAttribute("data-transition-emphasis", "active");
    expect(badge.querySelector('[data-transition-arrow="entrance"]')).not.toHaveAttribute("data-transition-emphasis");
    expect(badge.querySelector('[data-testid="entrance-direction-exit-emphasis"] animate')).toBeInTheDocument();
    expect(badge.querySelector('[data-testid="entrance-direction-entrance-emphasis"]')).toBeNull();
  });

  it("uses static directional emphasis for reduced motion and leaves default Admin badges unchanged", () => {
    const { container } = render(createElement("svg", null,
      createElement(EntranceDirectionBadge, { x: 20, y: 20, edge: "top", direction: "both", testId: "reduced-two-way", pressableDirection: "entrance", emphasized: true, reducedMotion: true }),
      createElement(EntranceDirectionBadge, { x: 60, y: 20, edge: "top", direction: "both", testId: "default-admin" }),
    ));
    const reduced = screen.getByTestId("reduced-two-way");
    expect(reduced.querySelector('[data-testid="entrance-direction-entrance-emphasis"]')).toBeInTheDocument();
    expect(reduced.querySelector('[data-testid="entrance-direction-entrance-emphasis"] animate')).toBeNull();
    expect(reduced.querySelector('[data-transition-arrow="exit"]')).not.toHaveAttribute("data-transition-emphasis");
    const unchanged = screen.getByTestId("default-admin");
    expect(unchanged.querySelector('[data-testid$="-emphasis"]')).toBeNull();
    expect(unchanged.querySelector('[data-testid$="-pulse"]')).toBeNull();
    expect(unchanged.querySelector('[data-testid="entrance-direction-disc"]')).not.toHaveAttribute("vector-effect", "non-scaling-stroke");
    expect(container.querySelectorAll("[data-transition-arrow]")).toHaveLength(4);
  });

  it("never invents the opposite arrow for a one-way authored transition", () => {
    render(createElement("svg", null,
      createElement(EntranceDirectionBadge, { x: 20, y: 20, edge: "right", direction: "entrance_only", testId: "one-way", pressableDirection: "entrance", emphasized: true }),
    ));
    const badge = screen.getByTestId("one-way");
    expect(badge.querySelectorAll("[data-transition-arrow]")).toHaveLength(1);
    expect(badge.querySelector('[data-transition-arrow="entrance"]')).toHaveAttribute("data-transition-emphasis", "pressable");
    expect(badge.querySelector('[data-transition-arrow="exit"]')).toBeNull();
  });
});

import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EntranceDirectionBadge, entranceDirectionBadgePlacement } from "../EntranceDirectionBadge";

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
});

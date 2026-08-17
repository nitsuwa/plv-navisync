/**
 * Tests for FloorOverviewSidebar — Part D: Perimeter Wall exposure.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FloorOverviewSidebar } from "../FloorOverviewSidebar";
import type { FloorPlan } from "../types";

function makeFloor(overrides: Partial<FloorPlan> = {}): FloorPlan {
  return {
    id: "f1",
    buildingId: "b1",
    number: 1,
    label: "Ground Floor",
    rooms: [],
    walls: [],
    doors: [],
    windows: [],
    furniture: [],
    stairs: [],
    ramps: [],
    elevators: [],
    labels: [],
    paths: [],
    canvasW: 600,
    canvasH: 400,
    ...overrides,
  };
}

const baseProps = {
  canvasW: 600,
  canvasH: 400,
  isFirst: false,
  isLast: false,
  isOnly: false,
  onClose: () => {},
  onRename: () => {},
  onCanvasSize: () => {},
  onShowGrid: () => {},
  onGridSize: () => {},
  onOpenSettings: () => {},
  onDuplicate: () => {},
  onMoveUp: () => {},
  onMoveDown: () => {},
  onDelete: () => {},
};

describe("Part D — FloorOverviewSidebar Perimeter Wall section", () => {
  it("renders the Perimeter Wall section", () => {
    render(<FloorOverviewSidebar floor={makeFloor()} {...baseProps} />);
    expect(screen.getByText("Perimeter Wall")).toBeTruthy();
  });

  it("shows 'Off' status when perimeter is not enabled", () => {
    render(<FloorOverviewSidebar floor={makeFloor()} {...baseProps} perimeterEnabled={false} />);
    expect(screen.getByText("Off")).toBeTruthy();
    expect(screen.getByText("No outer boundary wall. Enable in Floor Settings.")).toBeTruthy();
  });

  it("shows 'On' status when perimeter is enabled", () => {
    render(<FloorOverviewSidebar floor={makeFloor()} {...baseProps} perimeterEnabled={true} />);
    expect(screen.getByText("On")).toBeTruthy();
    expect(screen.getByText("The outer boundary wall is enabled and follows the floor canvas size.")).toBeTruthy();
  });

  it("shows 'Outer Boundary' label", () => {
    render(<FloorOverviewSidebar floor={makeFloor()} {...baseProps} />);
    expect(screen.getByText("Outer Boundary")).toBeTruthy();
  });

  it("defaults to perimeterEnabled=false when prop is omitted", () => {
    render(<FloorOverviewSidebar floor={makeFloor()} {...baseProps} />);
    expect(screen.getByText("Off")).toBeTruthy();
  });
});

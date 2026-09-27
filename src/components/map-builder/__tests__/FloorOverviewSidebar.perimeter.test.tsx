/**
 * Tests for FloorOverviewSidebar — Part D: Perimeter Wall exposure.
 */

import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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

  it("disables authoring-grid size controls for textured floors", () => {
    render(<FloorOverviewSidebar floor={makeFloor({ appearance: { material: "ceramic_tile", texture: "subtle", color: "#e5e7eb" } })} {...baseProps} />);
    expect(screen.getByRole("button", { name: "Show Grid" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Floor grid 10" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Floor grid 20" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Floor grid 40" })).toBeDisabled();
    expect(screen.getByTestId("floor-grid-disabled-help")).toBeInTheDocument();
  });

  it("enables authoring-grid size controls for Neutral with Texture None", () => {
    render(<FloorOverviewSidebar floor={makeFloor({ appearance: { material: "neutral", texture: "none", color: "#e8e1d7" } })} {...baseProps} />);
    expect(screen.getByRole("button", { name: "Show Grid" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Floor grid 10" })).not.toBeDisabled();
  });

  it("exposes the visual wall-junction toggle without changing wall geometry", () => {
    const onShowWallJunctions = vi.fn();
    render(<FloorOverviewSidebar floor={makeFloor()} {...baseProps} onShowWallJunctions={onShowWallJunctions} />);

    const toggle = screen.getByRole("button", { name: "Show wall junction blocks" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(toggle);
    expect(onShowWallJunctions).toHaveBeenCalledWith(false);
  });

  it("exposes Edit Floor Shape from the Floor Overview", () => {
    const onEditFloorShape = vi.fn();
    render(<FloorOverviewSidebar floor={makeFloor()} {...baseProps} onEditFloorShape={onEditFloorShape} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Floor Shape" }));
    expect(onEditFloorShape).toHaveBeenCalledOnce();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { FloorPlan } from "../types";
import { ReadonlyFloorPlanScene, readonlyFloorPlanViewport } from "../ReadonlyFloorPlanVisuals";

const floor = {
  id: "floor-1",
  buildingId: "building-1",
  number: 1,
  label: "Ground Floor",
  canvasW: 440,
  canvasH: 290,
  rooms: [],
  paths: [],
  walls: [],
  doors: [],
  windows: [],
  furniture: [
    {
      id: "chair-1",
      type: "chair",
      assetKey: "chair",
      name: "Chair",
      category: "seating",
      x: 60,
      y: 70,
      width: 24,
      height: 24,
      rotation: 15,
      color: "#8b6f4e",
    },
    {
      id: "table-1",
      type: "table",
      assetKey: "table",
      name: "Table",
      category: "essentials",
      x: 110,
      y: 70,
      width: 50,
      height: 30,
      rotation: 0,
      color: "#8b6f4e",
    },
  ],
  stairs: [],
  ramps: [],
  elevators: [],
  labels: [],
  exteriorZones: [
    {
      id: "veranda-1",
      type: "veranda",
      side: "bottom",
      offset: 0.5,
      width: 160,
      depth: 48,
      label: "Veranda",
    },
  ],
  entranceSteps: [
    {
      id: "steps-1",
      x: 0,
      y: 0,
      width: 28,
      height: 18,
      label: "Entrance Steps",
      parentZoneId: "veranda-1",
      attachmentEdge: "outer",
      attachmentOffset: 0.5,
    },
  ],
  entranceRamps: [
    {
      id: "ramp-1",
      x: 0,
      y: 0,
      width: 32,
      height: 20,
      label: "Entrance Ramp",
      parentZoneId: "veranda-1",
      attachmentEdge: "outer",
      attachmentOffset: 0.78,
      layout: "straight",
    },
  ],
} as FloorPlan;

const compositeFurnitureFloor = {
  ...floor,
  furniture: [
    ...floor.furniture,
    {
      id: "study-table-1",
      type: "study-table-4",
      assetKey: "study-table-4",
      name: "Study Table",
      category: "essentials",
      x: 180,
      y: 70,
      width: 64,
      height: 34,
      rotation: 0,
      color: "#8b6f4e",
    },
    {
      id: "student-desk-chair-1",
      type: "student-desk-chair",
      assetKey: "student-desk-chair",
      name: "Student Desk Chair",
      category: "seating",
      x: 270,
      y: 70,
      width: 34,
      height: 34,
      rotation: 0,
      color: "#8b6f4e",
    },
  ],
} as FloorPlan;

describe("ReadonlyFloorPlanScene", () => {
  it("preserves Admin-authored chair and table dimensions and rotation", () => {
    render(<svg><ReadonlyFloorPlanScene floor={floor} /></svg>);

    const furniture = screen.getAllByTestId("readonly-furniture");
    const chair = furniture[0];
    expect(chair).toHaveAttribute("transform", "rotate(15, 72, 82)");
    const chairArtwork = chair.querySelector("svg");
    expect(chairArtwork).toHaveAttribute("width", "24");
    expect(chairArtwork).toHaveAttribute("height", "24");

    const tableArtwork = furniture[1].querySelector("svg");
    expect(tableArtwork).toHaveAttribute("width", "50");
    expect(tableArtwork).toHaveAttribute("height", "30");
  });

  it("uses the Admin composite symbols for published tables and desk chairs", () => {
    render(<svg><ReadonlyFloorPlanScene floor={compositeFurnitureFloor} /></svg>);

    expect(screen.getByTestId("study-table")).toBeInTheDocument();
    expect(screen.getByTestId("student-desk-surface")).toBeInTheDocument();
    expect(screen.getAllByTestId("furniture-seat").length).toBeGreaterThan(0);
  });

  it("renders the published veranda and its authored entrance features", () => {
    render(<svg><ReadonlyFloorPlanScene floor={floor} /></svg>);

    const veranda = screen.getByTestId("readonly-exterior-zone");
    expect(veranda).toHaveAttribute("data-exterior-zone-id", "veranda-1");
    expect(veranda.querySelector("rect")).toHaveAttribute("x", "140");
    expect(veranda.querySelector("rect")).toHaveAttribute("y", "290");
    expect(screen.getByTestId("readonly-entrance-steps")).toHaveAttribute("data-edge", "bottom");
    expect(screen.getByTestId("readonly-entrance-ramp")).toHaveAttribute("data-edge", "bottom");
    expect(screen.getByTestId("readonly-entrance-steps-symbol")).toBeInTheDocument();
    expect(screen.getByTestId("readonly-entrance-ramp-symbol")).toBeInTheDocument();
  });

  it("expands the floor viewBox only enough to keep exterior content visible", () => {
    const viewport = readonlyFloorPlanViewport(floor);
    expect(viewport.offsetX).toBe(0);
    expect(viewport.offsetY).toBe(0);
    expect(viewport.width).toBe(440);
    expect(viewport.height).toBe(366);

    const indoorOnly = readonlyFloorPlanViewport({ ...floor, exteriorZones: [], entranceSteps: [], entranceRamps: [] });
    expect(indoorOnly).toEqual({ width: 440, height: 290, offsetX: 0, offsetY: 0 });
  });
});

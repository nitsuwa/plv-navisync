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

const sharedVisualFloor = {
  ...floor,
  rooms: [{
    id: "lab-room", floorId: "floor-1", buildingId: "building-1", name: "Fluid Mechanics Laboratory",
    type: "lab", x: 30, y: 120, w: 180, h: 100, color: "#d9e7f5", rotation: 0,
    shapePoints: [{ x: 30, y: 120 }, { x: 210, y: 120 }, { x: 195, y: 220 }, { x: 30, y: 220 }],
  }],
  walls: [{ id: "wall-1", x1: 30, y1: 120, x2: 210, y2: 120, thickness: 6, color: "#334155", material: "brick" }],
  doors: [{ id: "door-1", x: 100, y: 120, width: 36, wallId: "wall-1", offset: 0.4, direction: "double", doorType: "double", hinge: "right", swingSide: "b", color: "#8b4513" }],
  windows: [{ id: "window-1", x: 170, y: 120, width: 42, height: 8, wallId: "wall-1", offset: 0.8, color: "#0284c7" }],
  stairs: [{ id: "stairs-1", x: 230, y: 120, width: 54, height: 76, direction: "both", label: "North Stair", rotation: 90 }],
  ramps: [{ id: "ramp-1", x: 300, y: 120, width: 50, height: 34, direction: "up", label: "Ramp", rotation: 15 }],
  elevators: [{ id: "elevator-1", x: 360, y: 120, width: 48, height: 48, doorWidth: 24, label: "Elevator" }],
  labels: [{ id: "label-1", x: 32, y: 260, text: "North Wing", color: "#334155", fontSize: 10, align: "left", rotation: 12 }],
  paths: [{ id: "floor-path-1", points: [{ x: 220, y: 240 }, { x: 300, y: 240 }], color: "#c2410c", width: 5 }],
} as unknown as FloorPlan;

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

  it("uses the same shared Admin geometry for rooms, walls, openings, circulation, labels, and Floor Paths", () => {
    render(<svg><ReadonlyFloorPlanScene floor={sharedVisualFloor} floorIndex={1} floorCount={3} /></svg>);

    expect(screen.getByTestId("room-custom-shape")).toHaveAttribute("fill", "#d9e7f5");
    expect(screen.getByTestId("room-label-overlay").textContent).toContain("Fluid Mechanics Laboratory");
    expect(screen.getByTestId("readonly-wall").querySelectorAll("line")).toHaveLength(2);
    expect(screen.getAllByTestId("readonly-door-leaf")).toHaveLength(2);
    expect(screen.getByTestId("readonly-window").querySelector("[data-testid='readonly-window-glazing']")).toBeInTheDocument();
    expect(screen.getByTestId("stairs-travel-path")).toBeInTheDocument();
    expect(screen.getByTestId("readonly-ramp")).toHaveAttribute("transform", "rotate(15,325,137)");
    expect(screen.getByTestId("elevator-shaft")).toBeInTheDocument();
    expect(screen.getByTestId("floor-label-artwork")).toHaveAttribute("fill", "#334155");
    expect(screen.getByTestId("readonly-floor-path").querySelector("polyline")).toHaveAttribute("stroke", "#c2410c");
  });

  it("hides informational labels while retaining an active route destination label", () => {
    const { rerender } = render(<svg><ReadonlyFloorPlanScene floor={sharedVisualFloor} showLabels={false} /></svg>);
    expect(screen.queryByTestId("room-label-overlay")).not.toBeInTheDocument();
    expect(screen.queryByTestId("floor-label-artwork")).not.toBeInTheDocument();

    rerender(<svg><ReadonlyFloorPlanScene floor={sharedVisualFloor} showLabels={false} highlightedRoomId="lab-room" /></svg>);
    expect(screen.getByTestId("room-label-overlay").textContent).toContain("Fluid Mechanics Laboratory");
    expect(screen.queryByTestId("floor-label-artwork")).not.toBeInTheDocument();
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

  it("places generated emergency stairs outside the floor like the Admin module and includes them in the viewBox", () => {
    const exteriorStair = {
      id: "stair-landing-1",
      x: 412,
      y: 124,
      width: 28,
      height: 42,
      direction: "both" as const,
      label: "Exterior Stair",
      attachment: { edge: "right" as const, offset: 0.5 },
      exteriorEmergencyStairId: "stair-owner-1",
    };
    const owner = {
      id: "stair-owner-1",
      visualSize: "medium" as const,
      width: 28,
      height: 42,
      attachment: { edge: "right" as const, offset: 0.5 },
    };
    const exteriorFloor = { ...floor, stairs: [exteriorStair] } as FloorPlan;
    const viewport = readonlyFloorPlanViewport(exteriorFloor, [owner] as never);
    expect(viewport.width).toBeGreaterThan(440);

    render(<svg><ReadonlyFloorPlanScene floor={exteriorFloor} exteriorEmergencyStairs={[owner] as never} /></svg>);
    const module = screen.getByTestId("floor-exterior-emergency-module");
    const stairBody = module.querySelector('[data-testid="exterior-emergency-stair-floor-symbol"] rect:nth-of-type(2)');
    expect(module).toHaveAttribute("data-edge", "right");
    expect(Number(stairBody?.getAttribute("x"))).toBeGreaterThan(440);
    expect(screen.getByTestId("exterior-emergency-exit-badge")).toBeInTheDocument();
    expect(module.textContent).toContain("STAIR EXIT");
    expect(screen.queryByTestId("floor-exterior-emergency-hit-target")).not.toBeInTheDocument();
  });
});

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FloorEditor } from "../FloorEditor";
import type { Campus } from "../types";

function makeCampus(): Campus {
  return {
    id: "campus",
    name: "Test Campus",
    code: "TC",
    description: "",
    address: "",
    city: "",
    province: "",
    postalCode: "",
    status: "active",
    publishStatus: "draft",
    visibleToStudents: false,
    features: { indoorNavigation: true, accessibilityNavigation: true, emergencyRoutes: true, issueReporting: true },
    canvasW: 580,
    canvasH: 380,
    settings: { accessibility: true, emergency: true, eventLayer: true, gps: true },
    buildings: [{
      id: "building",
      name: "Main Building",
      code: "MB",
      category: "Academic",
      description: "",
      x: 0,
      y: 0,
      width: 220,
      height: 160,
      color: "#0e2a6e",
      floors: [{
        id: "floor",
        buildingId: "building",
        number: 1,
        label: "Ground Floor",
        canvasW: 220,
        canvasH: 160,
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
      }],
    }],
    markers: [],
    paths: [],
    navNodes: [],
    navEdges: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
}

function Harness({ initialCampus = makeCampus(), onCampusChange }: {
  initialCampus?: Campus;
  onCampusChange: (campus: Campus) => void;
}) {
  const [campus, setCampus] = useState(initialCampus);
  return <FloorEditor
    campus={campus}
    buildingId="building"
    floorId="floor"
    onBack={() => {}}
    onSwitchFloor={() => {}}
    onUpdate={(next) => { onCampusChange(next); setCampus(next); }}
    onSave={async () => campus}
  />;
}

function floorSvg(container: HTMLElement, viewBox = "0 0 220 160"): SVGSVGElement {
  const svg = Array.from(container.querySelectorAll("svg")).find((candidate) => candidate.getAttribute("viewBox") === viewBox);
  expect(svg).toBeTruthy();
  const [viewX, viewY, width, height] = viewBox.split(/\s+/).map(Number);
  Object.defineProperty(svg!, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ left: 0, top: 0, right: width, bottom: height, width, height, x: 0, y: 0, toJSON: () => ({}) }),
  });
  Object.defineProperty(svg!.viewBox, "baseVal", { configurable: true, value: { x: viewX, y: viewY, width, height } });
  Object.defineProperty(svg!.parentElement, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ left: 0, top: 0, right: width, bottom: height, width, height, x: 0, y: 0, toJSON: () => ({}) }),
  });
  return svg as SVGSVGElement;
}

function clickCanvas(container: HTMLElement, x: number, y: number) {
  const svg = floorSvg(container);
  fireEvent.mouseDown(svg, { clientX: x, clientY: y, bubbles: true });
  fireEvent.mouseUp(svg, { clientX: x, clientY: y, bubbles: true });
}

function navNodes(container: HTMLElement): SVGGElement[] {
  return Array.from(container.querySelectorAll('[data-testid="nav-node"]')) as SVGGElement[];
}

function nodeAt(container: HTMLElement, x: number, y: number): SVGGElement {
  const result = navNodes(container).find((group) => {
    const hit = group.querySelector('[data-testid="nav-node-hit"]') as SVGCircleElement | null;
    return hit && Number(hit.getAttribute("cx")) === x && Number(hit.getAttribute("cy")) === y;
  });
  expect(result, `waypoint at ${x},${y}`).toBeTruthy();
  return result!;
}

function linkedNodeAt(container: HTMLElement, x: number, y: number): SVGGElement {
  const result = Array.from(container.querySelectorAll('[data-testid="nav-linked-node"]')).find((group) => {
    const hit = group.querySelector('[data-testid="nav-node-hit"]') as SVGCircleElement | null;
    return hit && Number(hit.getAttribute("cx")) === x && Number(hit.getAttribute("cy")) === y;
  });
  expect(result, `linked node at ${x},${y}`).toBeTruthy();
  return result as SVGGElement;
}

function activate(buttonName: "Walking Point" | "Connect") {
  fireEvent.click(within(screen.getByTestId("floor-nav-toolbar")).getByRole("button", { name: buttonName }));
}

function latestCampus(onCampusChange: ReturnType<typeof vi.fn>): Campus {
  const calls = onCampusChange.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][0] as Campus;
}

afterEach(() => cleanup());

describe("Floor Editor walking networks inside Rooms", () => {
  it("places Walking Points in an Extension and connects across the base seam", () => {
    const campus = makeCampus();
    campus.buildings[0].floors[0].extensions = [{ id: "right", side: "right", offset: 40, width: 80, depth: 80 }];
    const onCampusChange = vi.fn();
    const { container } = render(<Harness initialCampus={campus} onCampusChange={onCampusChange} />);
    const svg = floorSvg(container, "0 0 300 160");

    activate("Walking Point");
    fireEvent.mouseDown(svg, { clientX: 180, clientY: 80, bubbles: true });
    fireEvent.mouseUp(svg, { clientX: 180, clientY: 80, bubbles: true });
    activate("Walking Point");
    fireEvent.mouseDown(svg, { clientX: 260, clientY: 80, bubbles: true });
    fireEvent.mouseUp(svg, { clientX: 260, clientY: 80, bubbles: true });
    expect(nodeAt(container, 260, 80)).toBeTruthy();
    expect(latestCampus(onCampusChange).navNodes.filter((node) => node.floorId === "floor")).toHaveLength(2);

    activate("Connect");
    fireEvent.mouseDown(nodeAt(container, 180, 80), { clientX: 180, clientY: 80, bubbles: true });
    fireEvent.mouseUp(svg, { clientX: 180, clientY: 80, bubbles: true });
    fireEvent.mouseDown(nodeAt(container, 260, 80), { clientX: 260, clientY: 80, bubbles: true });
    fireEvent.mouseUp(svg, { clientX: 260, clientY: 80, bubbles: true });

    expect(latestCampus(onCampusChange).navEdges).toHaveLength(1);
  });

  it("places an ordinary Walking Point at the exact cursor coordinate, including the Room center", () => {
    const campus = makeCampus();
    campus.buildings[0].floors[0].rooms = [{
      id: "library", name: "CABA Library", type: "library", x: 20, y: 20, w: 180, h: 120, buildingId: "building", floorId: "floor",
    }];
    const onCampusChange = vi.fn();
    const { container } = render(<Harness initialCampus={campus} onCampusChange={onCampusChange} />);
    activate("Walking Point");
    clickCanvas(container, 110, 80);

    const created = latestCampus(onCampusChange).navNodes.find((node) => node.floorId === "floor");
    expect(created).toMatchObject({ x: 110, y: 80, type: "hallway" });
    expect(created?.roomId).toBeUndefined();
    expect(navNodes(container)).toHaveLength(1);
  });

  it("an empty first Connect click inside a Room does not create a Room navigation target", () => {
    const campus = makeCampus();
    campus.buildings[0].floors[0].rooms = [{
      id: "library", name: "CABA Library", type: "library", x: 20, y: 20, w: 180, h: 120, buildingId: "building", floorId: "floor",
    }];
    const onCampusChange = vi.fn();
    const { container } = render(<Harness initialCampus={campus} onCampusChange={onCampusChange} />);
    activate("Connect");
    clickCanvas(container, 110, 80);

    expect(onCampusChange).not.toHaveBeenCalled();
    expect(navNodes(container)).toHaveLength(0);
    expect(container.querySelectorAll('[data-testid="nav-linked-node"]')).toHaveLength(0);
  });

  it("keeps the Connect preview under the cursor in a Room with a linked Room node", () => {
    const campus = makeCampus();
    campus.buildings[0].floors[0].rooms = [{
      id: "library", name: "CABA Library", type: "library", x: 20, y: 20, w: 180, h: 120, buildingId: "building", floorId: "floor",
    }];
    campus.navNodes = [
      { id: "start", name: "Hallway Point", type: "hallway", x: 30, y: 30, buildingId: "building", floorId: "floor", accessible: true, color: "#16a34a" },
      { id: "room-node", name: "CABA Library", type: "room_access", x: 110, y: 50, roomId: "library", buildingId: "building", floorId: "floor", accessible: true, color: "#7c3aed" },
    ];
    const onCampusChange = vi.fn();
    const { container } = render(<Harness initialCampus={campus} onCampusChange={onCampusChange} />);
    const svg = floorSvg(container);
    activate("Connect");
    fireEvent.mouseDown(nodeAt(container, 30, 30), { clientX: 30, clientY: 30, bubbles: true });
    fireEvent.mouseUp(svg, { clientX: 30, clientY: 30, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 150, clientY: 80, bubbles: true });

    const line = container.querySelector('[data-testid="floor-nav-connect-preview"] polyline');
    const points = (line?.getAttribute("points") ?? "").trim().split(/\s+/).map((value) => value.split(",").map(Number));
    expect(points[points.length - 1]).toEqual([150, 80]);
    expect(points[points.length - 1]).not.toEqual([110, 50]);
  });

  it("keeps each linked Library Door as one node between its hallway and internal networks", () => {
    const campus = makeCampus();
    campus.buildings[0].floors[0].rooms = [{
      id: "library", name: "CABA Library", type: "library", x: 20, y: 70, w: 180, h: 70, buildingId: "building", floorId: "floor", accessDoorIds: ["door-a", "door-b"],
    }];
    campus.buildings[0].floors[0].doors = [
      { id: "door-a", x: 60, y: 70, width: 20, direction: "left", color: "#b45309", wallId: "library-wall", offset: 2 / 9 },
      { id: "door-b", x: 160, y: 70, width: 20, direction: "left", color: "#b45309", wallId: "library-wall", offset: 7 / 9 },
    ];
    campus.buildings[0].floors[0].walls = [{
      id: "library-wall", x1: 20, y1: 70, x2: 200, y2: 70, thickness: 6, color: "#64748b", material: "concrete",
    }];
    campus.navNodes = [
      { id: "hall-a", name: "Hall A", type: "hallway", x: 60, y: 30, buildingId: "building", floorId: "floor", accessible: true, color: "#16a34a" },
      { id: "door-a-node", name: "Library Door A", type: "hallway", x: 60, y: 70, doorId: "door-a", buildingId: "building", floorId: "floor", accessible: true, color: "#16a34a" },
      { id: "inside-a", name: "Aisle A", type: "hallway", x: 60, y: 110, buildingId: "building", floorId: "floor", accessible: true, color: "#16a34a" },
      { id: "hall-b", name: "Hall B", type: "hallway", x: 160, y: 30, buildingId: "building", floorId: "floor", accessible: true, color: "#16a34a" },
      { id: "door-b-node", name: "Library Door B", type: "hallway", x: 160, y: 70, doorId: "door-b", buildingId: "building", floorId: "floor", accessible: true, color: "#16a34a" },
      { id: "inside-b", name: "Aisle B", type: "hallway", x: 160, y: 110, buildingId: "building", floorId: "floor", accessible: true, color: "#16a34a" },
    ];
    campus.navEdges = [
      { id: "hall-edge-a", startNodeId: "hall-a", endNodeId: "door-a-node", distance: 40, bidirectional: true, accessible: true, emergencySafe: true, type: "hallway", color: "#16a34a", width: 4 },
      { id: "hall-edge-b", startNodeId: "hall-b", endNodeId: "door-b-node", distance: 40, bidirectional: true, accessible: true, emergencySafe: true, type: "hallway", color: "#16a34a", width: 4 },
    ];
    const onCampusChange = vi.fn();
    const { container } = render(<Harness initialCampus={campus} onCampusChange={onCampusChange} />);
    const svg = floorSvg(container);
    const connect = () => activate("Connect");

    connect();
    fireEvent.mouseDown(linkedNodeAt(container, 60, 70), { clientX: 60, clientY: 70, bubbles: true });
    fireEvent.mouseUp(svg, { clientX: 60, clientY: 70, bubbles: true });
    fireEvent.mouseDown(nodeAt(container, 60, 110), { clientX: 60, clientY: 110, bubbles: true });
    fireEvent.mouseUp(svg, { clientX: 60, clientY: 110, bubbles: true });

    connect();
    fireEvent.mouseDown(linkedNodeAt(container, 160, 70), { clientX: 160, clientY: 70, bubbles: true });
    fireEvent.mouseUp(svg, { clientX: 160, clientY: 70, bubbles: true });
    fireEvent.mouseDown(nodeAt(container, 160, 110), { clientX: 160, clientY: 110, bubbles: true });
    fireEvent.mouseUp(svg, { clientX: 160, clientY: 110, bubbles: true });

    const after = latestCampus(onCampusChange);
    expect(after.navNodes).toHaveLength(6);
    expect(after.navEdges).toHaveLength(4);
    expect(after.navEdges.some((edge) => edge.id === "hall-edge-a")).toBe(true);
    expect(after.navEdges.some((edge) => edge.id === "hall-edge-b")).toBe(true);
    expect(after.navEdges.some((edge) => new Set([edge.startNodeId, edge.endNodeId]).has("door-a-node") && new Set([edge.startNodeId, edge.endNodeId]).has("inside-a"))).toBe(true);
    expect(after.navEdges.some((edge) => new Set([edge.startNodeId, edge.endNodeId]).has("door-b-node") && new Set([edge.startNodeId, edge.endNodeId]).has("inside-b"))).toBe(true);
    expect(after.navNodes.filter((node) => node.doorId).map((node) => node.id).sort()).toEqual(["door-a-node", "door-b-node"]);

    // Remounting with the saved campus snapshot exercises the normal
    // navNodes/navEdges persistence boundary used by FloorEditor.
    cleanup();
    const reloaded = render(<Harness initialCampus={structuredClone(after)} onCampusChange={vi.fn()} />);
    activate("Connect");
    expect(navNodes(reloaded.container)).toHaveLength(4);
    expect(reloaded.container.querySelectorAll('[data-testid="nav-linked-node"]')).toHaveLength(2);
    expect(reloaded.container.querySelectorAll('[data-testid="nav-edge-hit"]')).toHaveLength(4);
  });

  it("still blocks a Walking Path that crosses an authored Wall", () => {
    const campus = makeCampus();
    campus.buildings[0].floors[0].rooms = [{
      id: "library", name: "CABA Library", type: "library", x: 20, y: 10, w: 180, h: 140, buildingId: "building", floorId: "floor",
    }];
    campus.buildings[0].floors[0].walls = [{ id: "divider", x1: 30, y1: 80, x2: 190, y2: 80, thickness: 6, color: "#64748b", material: "concrete" }];
    const onCampusChange = vi.fn();
    const { container } = render(<Harness initialCampus={campus} onCampusChange={onCampusChange} />);
    const svg = floorSvg(container);
    activate("Walking Point");
    clickCanvas(container, 60, 50);
    activate("Walking Point");
    clickCanvas(container, 60, 110);
    expect(navNodes(container)).toHaveLength(2);

    activate("Connect");
    fireEvent.mouseDown(nodeAt(container, 60, 50), { clientX: 60, clientY: 50, bubbles: true });
    fireEvent.mouseUp(svg, { clientX: 60, clientY: 50, bubbles: true });
    fireEvent.mouseDown(nodeAt(container, 60, 110), { clientX: 60, clientY: 110, bubbles: true });
    fireEvent.mouseUp(svg, { clientX: 60, clientY: 110, bubbles: true });
    expect(latestCampus(onCampusChange).navEdges).toHaveLength(0);
  });
});

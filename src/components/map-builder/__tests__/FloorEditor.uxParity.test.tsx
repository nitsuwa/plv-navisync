import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { FloorEditor } from "../FloorEditor";
import type { Campus } from "../types";

function makeCampus(): Campus {
  return {
    id: "c1",
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
    buildings: [
      {
        id: "b1",
        name: "Main Building",
        code: "MB",
        category: "Academic",
        description: "",
        x: 100,
        y: 100,
        width: 120,
        height: 80,
        color: "#0e2a6e",
        floors: [
          {
            id: "f1",
            buildingId: "b1",
            number: 1,
            label: "Ground Floor",
            canvasW: 220,
            canvasH: 160,
            rooms: [{ id: "r1", name: "Room", type: "classroom", x: 20, y: 20, w: 50, h: 40, floorId: "f1", buildingId: "b1" }],
            paths: [],
            walls: [],
            doors: [],
            windows: [],
            furniture: [{ id: "fur1", type: "student-chair", name: "Student Chair", category: "seating", x: 120, y: 90, width: 12, height: 12, rotation: 0, color: "#2563eb" }],
            stairs: [],
            ramps: [],
            elevators: [],
            labels: [],
          },
        ],
      },
    ],
    markers: [],
    paths: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
}

function makeEmptyCampus(): Campus {
  const campus = makeCampus();
  campus.buildings[0].floors[0] = {
    ...campus.buildings[0].floors[0],
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
  };
  return campus;
}

function Harness({ onCampusChange, initialCampus = makeCampus() }: { onCampusChange?: (c: Campus) => void; initialCampus?: Campus }) {
  const [campus, setCampus] = useState<Campus>(initialCampus);
  return (
    <FloorEditor
      campus={campus}
      buildingId="b1"
      floorId="f1"
      onBack={() => {}}
      onSwitchFloor={() => {}}
      onUpdate={(c) => { onCampusChange?.(c); setCampus(c); }}
    />
  );
}

function canvasSvg(container: HTMLElement): SVGSVGElement {
  const svg = Array.from(container.querySelectorAll("svg")).find((s) => s.getAttribute("viewBox") === "0 0 220 160");
  expect(svg).toBeTruthy();
  return svg as SVGSVGElement;
}

function stubSvgRect(container: HTMLElement) {
  const svg = canvasSvg(container);
  Object.defineProperty(svg, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ left: 0, top: 0, right: 220, bottom: 160, width: 220, height: 160, x: 0, y: 0, toJSON: () => ({}) }),
  });
  Object.defineProperty(svg.viewBox, "baseVal", {
    configurable: true,
    value: { width: 220, height: 160, x: 0, y: 0 },
  });
  Object.defineProperty(svg.parentElement, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ left: 0, top: 0, right: 220, bottom: 160, width: 220, height: 160, x: 0, y: 0, toJSON: () => ({}) }),
  });
  return svg;
}

let latestCampus: Campus | null = null;

beforeEach(() => {
  latestCampus = null;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => window.setTimeout(() => cb(performance.now()), 0));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("FloorEditor UX parity controls", () => {
  it("uses explicit Select/Pan controls and a More tools menu without a collapsed count label", () => {
    render(<Harness />);

    expect(screen.getByTitle("Select (V)")).toBeInTheDocument();
    expect(screen.getByTitle("Pan (Space)")).toBeInTheDocument();
    expect(screen.queryByText("+10")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /More tools/i }));
    expect(screen.getAllByRole("button", { name: /Wall/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /Room/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /Erase/i }).length).toBeGreaterThan(0);
    expect(screen.queryByText("Measure")).toBeNull();
  });

  it("uses canonical floor bounds and a world-space empty state without a compass", () => {
    const { container } = render(<Harness initialCampus={makeEmptyCampus()} />);

    const boundary = screen.getByTestId("floor-canvas-boundary");
    expect(boundary).toHaveAttribute("x", "0");
    expect(boundary).toHaveAttribute("y", "0");
    expect(boundary).toHaveAttribute("width", "220");
    expect(boundary).toHaveAttribute("height", "160");

    const emptyState = screen.getByTestId("floor-empty-state");
    expect(emptyState).toHaveAttribute("transform", "translate(110, 80)");
    expect(container.querySelector('rect[fill="#cdc9c3"]')).toBeNull();
    expect(container.querySelector('[data-testid="floor-compass"]')).toBeNull();
  });

  it("marquee-selects objects while Select-drag leaves the view transform unchanged", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);
    const viewport = svg.querySelector("g[transform]")!;
    const before = viewport.getAttribute("transform");

    fireEvent.mouseDown(svg, { clientX: 0, clientY: 0, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 150, clientY: 120, bubbles: true });

    expect(screen.getByTestId("floor-marquee-selection")).toBeInTheDocument();
    expect(viewport.getAttribute("transform")).toBe(before);

    fireEvent.mouseUp(svg, { bubbles: true });

    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(latestCampus).toBeNull();
  });

  it("keeps grouped drag constrained inside the floor canvas", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    fireEvent.mouseDown(svg, { clientX: 0, clientY: 0, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 150, clientY: 120, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const roomGroup = Array.from(container.querySelectorAll("g")).find((g) => !g.hasAttribute("transform") && g.querySelector('rect[width="50"][height="40"]'))!;
    fireEvent.mouseDown(roomGroup, { clientX: 45, clientY: 40, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 300, clientY: 260, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const floor = latestCampus!.buildings[0].floors[0];
    expect(floor.rooms[0]).toMatchObject({ x: 108, y: 78 });
    expect(floor.furniture[0]).toMatchObject({ x: 208, y: 148 });
  });

  it("expands canvas size but blocks shrinking through existing objects", async () => {
    render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);

    fireEvent.click(screen.getByTitle("Toggle Properties Panel"));
    fireEvent.click(screen.getByRole("button", { name: /Open Floor Settings/i }));
    const widthInput = screen.getByLabelText("Floor canvas width");
    const heightInput = screen.getByLabelText("Floor canvas height");

    fireEvent.change(widthInput, { target: { value: "300" } });
    fireEvent.change(heightInput, { target: { value: "220" } });
    fireEvent.click(screen.getByRole("button", { name: /Save Changes/i }));

    expect(latestCampus!.buildings[0].floors[0]).toMatchObject({ canvasW: 300, canvasH: 220 });

    // Reopen the dialog and try shrinking through existing objects — it must be
    // blocked and the dialog stays open.
    fireEvent.click(screen.getByRole("button", { name: /Open Floor Settings/i }));
    const width2 = screen.getByLabelText("Floor canvas width");
    const height2 = screen.getByLabelText("Floor canvas height");
    fireEvent.change(width2, { target: { value: "120" } });
    fireEvent.change(height2, { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: /Save Changes/i }));

    await waitFor(() => expect(screen.getByText("Floor Issues")).toBeInTheDocument());
    expect(latestCampus!.buildings[0].floors[0]).toMatchObject({ canvasW: 300, canvasH: 220 });
  });

  it("supports Ctrl+wheel zoom and floor-specific shortcut help", async () => {
    const { container } = render(<Harness />);
    const svg = stubSvgRect(container);

    fireEvent.wheel(svg.parentElement!, { ctrlKey: true, deltaY: -100, clientX: 110, clientY: 80 });
    await waitFor(() => expect(screen.getAllByText("110%").length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole("button", { name: /Keyboard shortcuts/i }));
    expect(screen.getByText("Floor Editor Shortcuts")).toBeInTheDocument();
    expect(screen.getByText("Marquee select on empty floor")).toBeInTheDocument();
  });

  it("renders furniture as shapes with titles rather than visible text labels", () => {
    const { container } = render(<Harness />);

    const visibleText = Array.from(container.querySelectorAll("text")).map((node) => node.textContent).join(" ");
    expect(visibleText).not.toContain("Student Chair");
    expect(container.querySelector("title")?.textContent).toBe("Student Chair");
  });

  it("auto-opens a docked properties panel when selecting an object", () => {
    const { container } = render(<Harness />);

    const roomGroup = Array.from(container.querySelectorAll("g")).find((g) => !g.hasAttribute("transform") && g.querySelector('rect[width="50"][height="40"]'))!;
    fireEvent.mouseDown(roomGroup, { clientX: 45, clientY: 40, bubbles: true });

    const panel = screen.getByTestId("floor-properties-panel");
    expect(panel).toBeInTheDocument();
    expect(panel.className).toContain("w-64");
    expect(panel.className).not.toContain("absolute");
    expect(panel).toHaveTextContent("Room");
  });

  it("duplicates and deletes safe floor objects from the right-click menu", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    const roomGroup = Array.from(container.querySelectorAll("g")).find((g) => !g.hasAttribute("transform") && g.querySelector('rect[width="50"][height="40"]'))!;

    fireEvent.contextMenu(roomGroup, { clientX: 80, clientY: 70, bubbles: true });
    fireEvent.click(screen.getByRole("button", { name: /Duplicate/i }));
    expect(latestCampus!.buildings[0].floors[0].rooms).toHaveLength(2);

    const duplicated = latestCampus!.buildings[0].floors[0].rooms[1];
    expect(duplicated).toMatchObject({ x: 32, y: 32 });

    const selectedGroup = Array.from(container.querySelectorAll("g")).find((g) => !g.hasAttribute("transform") && g.querySelector('rect[x="32"][y="32"]'))!;
    fireEvent.contextMenu(selectedGroup, { clientX: 100, clientY: 90, bubbles: true });
    fireEvent.click(screen.getByRole("button", { name: /Delete/i }));
    expect(latestCampus!.buildings[0].floors[0].rooms).toHaveLength(1);
  });

  it("shows bounded resize handles for selected furniture", () => {
    const campus = makeCampus();
    campus.buildings[0].floors[0].furniture[0] = { ...campus.buildings[0].floors[0].furniture[0], type: "sofa", width: 12, height: 12 };
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);
    const furnitureGroup = Array.from(container.querySelectorAll("g")).find((g) => !g.hasAttribute("transform") && g.querySelector("title")?.textContent === "Student Chair")!;

    fireEvent.mouseDown(furnitureGroup, { clientX: 126, clientY: 96, bubbles: true });
    const handle = screen.getAllByTestId("furniture-resize-handle").at(-1)!;
    fireEvent.mouseDown(handle, { clientX: 132, clientY: 102, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 360, clientY: 260, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const item = latestCampus!.buildings[0].floors[0].furniture[0];
    // Sofa ceiling is 86×44 (min 8) and the canvas is 220×160 — the handle
    // must stop at the type ceiling and never escape the floor.
    expect(item.width).toBe(86);
    expect(item.height).toBe(44);
    expect(item.x + item.width).toBeLessThanOrEqual(220);
    expect(item.y + item.height).toBeLessThanOrEqual(160);
  });
});

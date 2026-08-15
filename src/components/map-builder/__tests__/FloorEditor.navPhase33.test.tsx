import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { toast } from "sonner";
import { useState } from "react";
import { FloorEditor } from "../FloorEditor";
import type { Campus } from "../types";

// ── B5 Phase 3.1 — floor numbering, Save-before-Add flow, stair direction guards ──

function makeBaseCampus(): Campus {
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
    canvasW: 220,
    canvasH: 160,
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
          { id: "f1", buildingId: "b1", number: 1, label: "Ground Floor", canvasW: 220, canvasH: 160, rooms: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [], paths: [] },
        ],
      },
    ],
    markers: [],
    paths: [],
    navNodes: [],
    navEdges: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
}

function Harness({ onCampusChange, onSave, initialCampus = makeBaseCampus(), floorId = "f1" }: {
  onCampusChange?: (c: Campus) => void;
  onSave?: (c: Campus) => Promise<Campus>;
  initialCampus?: Campus;
  floorId?: string;
}) {
  const [campus, setCampus] = useState<Campus>(initialCampus);
  return (
    <FloorEditor
      campus={campus}
      buildingId="b1"
      floorId={floorId}
      onBack={() => {}}
      onSwitchFloor={() => {}}
      onUpdate={(c) => { onCampusChange?.(c); setCampus(c); }}
      onSave={onSave ?? (async (c) => c)}
    />
  );
}

function canvasSvg(container: HTMLElement, w = 220, h = 160): SVGSVGElement {
  const svg = Array.from(container.querySelectorAll("svg")).find(
    (s) => s.getAttribute("viewBox") === `0 0 ${w} ${h}`
  );
  expect(svg).toBeTruthy();
  return svg as SVGSVGElement;
}

function stubSvgRect(container: HTMLElement, w = 220, h = 160): SVGSVGElement {
  const svg = canvasSvg(container, w, h);
  Object.defineProperty(svg, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ left: 0, top: 0, right: w, bottom: h, width: w, height: h, x: 0, y: 0, toJSON: () => ({}) }),
  });
  Object.defineProperty(svg.viewBox, "baseVal", {
    configurable: true,
    value: { width: w, height: h, x: 0, y: 0 },
  });
  Object.defineProperty(svg.parentElement, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ left: 0, top: 0, right: w, bottom: h, width: w, height: h, x: 0, y: 0, toJSON: () => ({}) }),
  });
  return svg;
}

function latestCampus(onCampusChange: ReturnType<typeof vi.fn>): Campus {
  const calls = onCampusChange.mock.calls;
  return calls[calls.length - 1][0] as Campus;
}

const STAIR = { id: "s1", x: 40, y: 30, width: 20, height: 16, rotation: 0, direction: "both", label: "Stairs" };
const STAIR_CX = STAIR.x + STAIR.width / 2; // 50
const STAIR_CY = STAIR.y + STAIR.height / 2; // 38

/** Building with `count` floors. A stair is placed on `stairFloor` (1-based). */
function withFloors(campus: Campus, count: number, { stairFloor = 1 }: { stairFloor?: number } = {}): Campus {
  const next = structuredClone(campus);
  const floors = [];
  for (let i = 1; i <= count; i++) {
    floors.push({
      id: `f${i}`, buildingId: "b1", number: i, label: i === 1 ? "Ground Floor" : `Floor ${i}`,
      canvasW: 220, canvasH: 160, rooms: [], walls: [], doors: [], windows: [], furniture: [],
      stairs: i === stairFloor ? [STAIR] : [],
      ramps: [], elevators: [], labels: [], paths: [],
    });
  }
  next.buildings[0].floors = floors;
  return next;
}

/** Selects the "Stairs" floor object on the canvas so its properties panel opens. */
function selectStair(container: HTMLElement) {
  const stair = Array.from(container.querySelectorAll("g[data-floor-title]")).find(
    (el) => el.getAttribute("data-floor-title") === "Stairs"
  ) as SVGGElement | undefined;
  expect(stair).toBeTruthy();
  fireEvent.mouseDown(stair!, { clientX: STAIR_CX, clientY: STAIR_CY, bubbles: true });
}

/** Selects the stair AND drags it — makes the floor dirty (one committed gesture). */
function dragStair(container: HTMLElement) {
  const svg = canvasSvg(container);
  selectStair(container);
  fireEvent.mouseMove(svg, { clientX: STAIR_CX + 20, clientY: STAIR_CY + 20, bubbles: true });
  fireEvent.mouseUp(svg, { bubbles: true });
}

function stairDirectionButtons(panel: HTMLElement) {
  const control = within(panel).getByTestId("stair-direction-control");
  return {
    up: within(control).getByRole("button", { name: "Up" }),
    down: within(control).getByRole("button", { name: "Down" }),
    both: within(control).getByRole("button", { name: "Both" }),
  };
}

describe("B5 Phase 3.1 — unique floor numbering", () => {
  it("Add Floor with an existing floor 1 creates the next unique number", () => {
    const onCampusChange = vi.fn();
    const { container } = render(<Harness initialCampus={makeBaseCampus()} onCampusChange={onCampusChange} />);
    stubSvgRect(container);
    fireEvent.click(screen.getByRole("button", { name: "Add Floor" }));
    const floors = latestCampus(onCampusChange).buildings[0].floors;
    expect(floors).toHaveLength(2);
    expect(floors.map((f) => f.number)).toEqual([1, 2]);
  });

  it("adding to a non-contiguous [1, 3] building uses max+1 (4), never a duplicate", () => {
    const campus = makeBaseCampus();
    campus.buildings[0].floors.push({ id: "f3", buildingId: "b1", number: 3, label: "Floor 3", canvasW: 220, canvasH: 160, rooms: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [], paths: [] });
    const onCampusChange = vi.fn();
    const { container } = render(<Harness initialCampus={campus} onCampusChange={onCampusChange} />);
    stubSvgRect(container);
    fireEvent.click(screen.getByRole("button", { name: "Add Floor" }));
    const floors = latestCampus(onCampusChange).buildings[0].floors;
    expect(floors.map((f) => f.number)).toEqual([1, 3, 4]);
    expect(new Set(floors.map((f) => f.number)).size).toBe(floors.length);
  });

  it("Save-before-Add-Floor creates the floor exactly once after saving the dirty floor", async () => {
    const campus = withFloors(makeBaseCampus(), 1, { stairFloor: 1 });
    const onCampusChange = vi.fn();
    const onSave = vi.fn(async (c: Campus) => c);
    const { container } = render(<Harness initialCampus={campus} onCampusChange={onCampusChange} onSave={onSave} />);
    stubSvgRect(container);

    // Make the floor dirty by dragging the stair.
    dragStair(container);
    expect(onCampusChange).toHaveBeenCalled();

    // Add Floor while dirty → Save/Discard dialog appears.
    fireEvent.click(screen.getByRole("button", { name: "Add Floor" }));
    expect(screen.getByText("Unsaved Floor Changes")).toBeInTheDocument();
    expect(screen.getByText(/before adding a new floor/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    // The save is async: wait for the dialog to close and the floor to land.
    await waitFor(() => {
      expect(latestCampus(onCampusChange).buildings[0].floors).toHaveLength(2);
    });
    const floors = latestCampus(onCampusChange).buildings[0].floors;
    expect(new Set(floors.map((f) => f.number)).size).toBe(2);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Unsaved Floor Changes")).toBeNull();
  });

  it("a failed save keeps the dialog open and does NOT create a duplicate floor", async () => {
    const campus = withFloors(makeBaseCampus(), 1, { stairFloor: 1 });
    const onCampusChange = vi.fn();
    const onSave = vi.fn(async () => { throw new Error("DB rejected"); });
    const { container } = render(<Harness initialCampus={campus} onCampusChange={onCampusChange} onSave={onSave} />);
    stubSvgRect(container);

    dragStair(container);
    fireEvent.click(screen.getByRole("button", { name: "Add Floor" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    // Save failed → dialog stays, no floor was added, no duplicate local state.
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Unsaved Floor Changes")).toBeInTheDocument();
    expect(latestCampus(onCampusChange).buildings[0].floors).toHaveLength(1);
  });
});

describe("B5 Phase 3.1 — stair direction guards", () => {
  it("lowest floor disables Down and Both (only Up is available)", () => {
    const campus = withFloors(makeBaseCampus(), 2, { stairFloor: 1 });
    const { container } = render(<Harness initialCampus={campus} />);
    stubSvgRect(container);
    selectStair(container);
    const panel = screen.getByTestId("floor-properties-panel");
    const { up, down, both } = stairDirectionButtons(panel);
    expect(up).not.toBeDisabled();
    expect(down).toBeDisabled();
    expect(both).toBeDisabled();
  });

  it("highest floor disables Up and Both (only Down is available)", () => {
    const campus = withFloors(makeBaseCampus(), 2, { stairFloor: 2 });
    const { container } = render(<Harness initialCampus={campus} floorId="f2" />);
    stubSvgRect(container);
    selectStair(container);
    const panel = screen.getByTestId("floor-properties-panel");
    const { up, down, both } = stairDirectionButtons(panel);
    expect(up).toBeDisabled();
    expect(down).not.toBeDisabled();
    expect(both).toBeDisabled();
  });

  it("middle floor allows Up, Down and Both", () => {
    const campus = withFloors(makeBaseCampus(), 3, { stairFloor: 2 });
    const { container } = render(<Harness initialCampus={campus} floorId="f2" />);
    stubSvgRect(container);
    selectStair(container);
    const panel = screen.getByTestId("floor-properties-panel");
    const { up, down, both } = stairDirectionButtons(panel);
    expect(up).not.toBeDisabled();
    expect(down).not.toBeDisabled();
    expect(both).not.toBeDisabled();
  });

  it("single-floor building offers no cross-floor direction (all disabled + info note)", () => {
    const campus = withFloors(makeBaseCampus(), 1, { stairFloor: 1 });
    const { container } = render(<Harness initialCampus={campus} />);
    stubSvgRect(container);
    selectStair(container);
    const panel = screen.getByTestId("floor-properties-panel");
    const { up, down, both } = stairDirectionButtons(panel);
    expect(up).toBeDisabled();
    expect(down).toBeDisabled();
    expect(both).toBeDisabled();
    expect(within(panel).getByText(/only one floor/i)).toBeInTheDocument();
  });

  it("an existing impossible direction shows an invalid/warning state in the panel", () => {
    const campus = withFloors(makeBaseCampus(), 2, { stairFloor: 1 });
    campus.buildings[0].floors[0].stairs[0].direction = "down"; // impossible on lowest floor
    const { container } = render(<Harness initialCampus={campus} />);
    stubSvgRect(container);
    selectStair(container);
    const panel = screen.getByTestId("floor-properties-panel");
    const warning = within(panel).getByTestId("stair-direction-invalid");
    expect(warning).toBeInTheDocument();
    expect(warning).toHaveTextContent(/no floor below/i);
  });

  it("impossible stair directions count as a local floor issue", () => {
    const campus = withFloors(makeBaseCampus(), 2, { stairFloor: 1 });
    campus.buildings[0].floors[0].stairs[0].direction = "down";
    render(<Harness initialCampus={campus} />);
    fireEvent.click(screen.getByRole("button", { name: /^Issues/ }));
    expect(screen.getByText(/Stair direction is invalid for this floor/i)).toBeInTheDocument();
  });
});

describe("B5 Phase 3.1 — Issues toolbar badge", () => {
  it("stays on one line (whitespace-nowrap) with a compact count chip", () => {
    render(<Harness />);
    const btn = screen.getByTestId("issues-toolbar");
    expect(btn.className).toContain("whitespace-nowrap");
    expect(btn).toHaveTextContent("Issues");
    expect(btn).toHaveTextContent("0");
  });
});

beforeEach(() => {
  vi.spyOn(toast, "error").mockImplementation(() => undefined);
  vi.spyOn(toast, "success").mockImplementation(() => undefined);
  vi.spyOn(toast, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

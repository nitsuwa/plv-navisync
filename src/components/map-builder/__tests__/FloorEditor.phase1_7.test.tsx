import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { FloorEditor } from "../FloorEditor";
import { FURNITURE_CATEGORIES } from "../constants";
import type { Campus } from "../types";

// ── Shared fixtures ─────────────────────────────────────────────────────────

/**
 * A floor on a 220×160 canvas containing one of EVERY supported floor object
 * type (rooms, walls, doors, windows, furniture, stairs, ramps, elevators,
 * labels) plus one floor path. Floor paths must stay OUT of marquee/multi-select
 * because their geometry is polyline-point based and group movement is unsafe.
 */
function makeRichCampus(): Campus {
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
            walls: [{ id: "w1", x1: 80, y1: 70, x2: 130, y2: 70, thickness: 4, color: "#64748b", material: "concrete" }],
            doors: [{ id: "d1", x: 60, y: 90, width: 8, direction: "left", color: "#d97706" }],
            windows: [{ id: "wn1", x: 30, y: 120, width: 12, height: 4, color: "#7dd3fc" }],
            furniture: [{ id: "fur1", type: "desk", name: "Desk", category: "tables", x: 90, y: 90, width: 18, height: 12, rotation: 0, color: "#7a5c3a" }],
            stairs: [{ id: "st1", x: 140, y: 90, width: 20, height: 16, direction: "both", label: "Stairs" }],
            ramps: [{ id: "rm1", x: 150, y: 120, width: 20, height: 12, label: "Ramp" }],
            elevators: [{ id: "el1", x: 180, y: 60, width: 14, height: 14, doorWidth: 6, label: "Elevator" }],
            labels: [{ id: "lb1", x: 40, y: 150, text: "Lobby", fontSize: 12, color: "#374151", rotation: 0 }],
            paths: [{ id: "p1", points: [{ x: 100, y: 150 }, { x: 150, y: 150 }], type: "footpath", color: "#94a3b8", width: 3 }],
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

/** 580×380 canvas with two walls whose endpoints are NOT grid aligned (53/57). */
function makeSnapCampus(): Campus {
  const campus = makeRichCampus();
  const floor = campus.buildings[0].floors[0];
  floor.canvasW = 580;
  floor.canvasH = 380;
  floor.rooms = [];
  floor.walls = [
    { id: "w1", x1: 53, y1: 57, x2: 153, y2: 57, thickness: 4, color: "#64748b", material: "concrete" },
    { id: "w2", x1: 253, y1: 57, x2: 353, y2: 57, thickness: 4, color: "#64748b", material: "concrete" },
  ];
  floor.doors = [];
  floor.windows = [];
  floor.furniture = [];
  floor.stairs = [];
  floor.ramps = [];
  floor.elevators = [];
  floor.labels = [];
  floor.paths = [];
  return campus;
}

function Harness({
  onCampusChange,
  initialCampus = makeRichCampus(),
  onSave,
  onPublish,
  publishingEnabled = false,
}: {
  onCampusChange?: (c: Campus) => void;
  initialCampus?: Campus;
  onSave?: (c: Campus) => Promise<Campus>;
  onPublish?: (c: Campus) => void;
  publishingEnabled?: boolean;
}) {
  const [campus, setCampus] = useState<Campus>(initialCampus);
  return (
    <FloorEditor
      campus={campus}
      buildingId="b1"
      floorId="f1"
      onBack={() => {}}
      onSwitchFloor={() => {}}
      onUpdate={(c) => { onCampusChange?.(c); setCampus(c); }}
      onSave={onSave}
      onPublish={onPublish}
      publishingEnabled={publishingEnabled}
    />
  );
}

function canvasSvg(container: HTMLElement, w: number, h: number): SVGSVGElement {
  const svg = Array.from(container.querySelectorAll("svg")).find((s) => s.getAttribute("viewBox") === `0 0 ${w} ${h}`);
  expect(svg).toBeTruthy();
  return svg as SVGSVGElement;
}

function stubSvgRect(container: HTMLElement, w: number, h: number) {
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

function roomGroup(container: HTMLElement): SVGGElement {
  const g = Array.from(container.querySelectorAll("g")).find(
    (el) => !el.hasAttribute("transform") && el.querySelector('rect[width="50"][height="40"]')
  ) as SVGGElement | undefined;
  expect(g).toBeTruthy();
  return g;
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

function marqueeSelect(container: HTMLElement, w: number, h: number) {
  const svg = stubSvgRect(container, w, h);
  fireEvent.mouseDown(svg, { clientX: 0, clientY: 0, bubbles: true });
  fireEvent.mouseMove(svg, { clientX: w, clientY: h, bubbles: true });
  fireEvent.mouseUp(svg, { bubbles: true });
  return svg;
}

describe("Phase 1.7 — expanded multi-selection", () => {
  it("marquee-selects every supported object type and intentionally excludes floor paths", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    marqueeSelect(container, 220, 160);

    // 9 supported object types are captured (rooms, walls, doors, windows,
    // furniture, stairs, ramps, elevators, labels) — the floor path (the 10th
    // object) is intentionally NOT part of multi-selection.
    expect(screen.getByText("9 selected")).toBeInTheDocument();
    // Selection is UI state only — the marquee never mutated campus data
    expect(latestCampus).toBeNull();
    // The floor path still renders untouched on the canvas
    expect(container.querySelectorAll('polyline[stroke="#94a3b8"]')).toHaveLength(1);
  });

  it("modifier-click adds and removes objects from the multi-selection", () => {
    const { container } = render(<Harness />);
    const svg = stubSvgRect(container, 220, 160);

    fireEvent.mouseDown(roomGroup(container), { clientX: 45, clientY: 40, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const furnitureGroup = Array.from(container.querySelectorAll("g")).find(
      (el) => !el.hasAttribute("transform") && el.querySelector("title")?.textContent === "Desk"
    ) as SVGGElement;
    fireEvent.mouseDown(furnitureGroup, { clientX: 99, clientY: 96, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(screen.getByText("2 selected")).toBeInTheDocument();

    // Shift+clicking a member again removes it from the group
    fireEvent.mouseDown(furnitureGroup, { clientX: 99, clientY: 96, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.queryByText("2 selected")).toBeNull();
  });

  it("drags a mixed multi-selection as one rigid group inside floor bounds", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    marqueeSelect(container, 220, 160);

    const svg = canvasSvg(container, 220, 160);
    fireEvent.mouseDown(roomGroup(container), { clientX: 45, clientY: 40, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 200, clientY: 150, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const floor = latestCampus!.buildings[0].floors[0];
    // Rightmost item (elevator: x 180 + 14 = 194) caps dx at 220-194=26;
    // bottommost item (label: y 138 + 16 = 154) caps dy at 160-154=6.
    expect(floor.rooms[0]).toMatchObject({ x: 46, y: 26 });
    expect(floor.walls[0]).toMatchObject({ x1: 106, y1: 76, x2: 156, y2: 76 });
    expect(floor.elevators[0]).toMatchObject({ x: 206, y: 66 });
    expect(floor.furniture[0]).toMatchObject({ x: 116, y: 96 });
    // Relative layout is rigid: every moved object shares the exact same delta
    expect(floor.rooms[0].x - 20).toBe(26);
    expect(floor.furniture[0].x - 90).toBe(26);
    expect(floor.elevators[0].x - 180).toBe(26);
    // Paths were not part of the group
    expect(floor.paths[0].points).toEqual([{ x: 100, y: 150 }, { x: 150, y: 150 }]);
  });

  it("group delete removes every selected object in one history step", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    marqueeSelect(container, 220, 160);

    fireEvent.keyDown(window, { key: "Delete" });

    const floor = latestCampus!.buildings[0].floors[0];
    expect(floor.rooms).toHaveLength(0);
    expect(floor.walls).toHaveLength(0);
    expect(floor.doors).toHaveLength(0);
    expect(floor.windows).toHaveLength(0);
    expect(floor.furniture).toHaveLength(0);
    expect(floor.stairs).toHaveLength(0);
    expect(floor.ramps).toHaveLength(0);
    expect(floor.elevators).toHaveLength(0);
    expect(floor.labels).toHaveLength(0);
    // Floor paths were never selected and survive group delete
    expect(floor.paths).toHaveLength(1);

    // ONE undo restores the entire group
    fireEvent.click(screen.getByTitle("Undo (Ctrl+Z)"));
    const restored = latestCampus!.buildings[0].floors[0];
    expect(restored.rooms).toHaveLength(1);
    expect(restored.walls).toHaveLength(1);
    expect(restored.labels).toHaveLength(1);
    expect(restored.rooms[0].id).toBe("r1");
  });

  it("group duplicate creates new IDs, keeps rigid layout, stays in bounds and selects the copies", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    marqueeSelect(container, 220, 160);

    // Right-click a member of the group → group-aware menu. (The Selected
    // Objects inspector also exposes the same action, so target the LAST match
    // — the context-menu item rendered on top.)
    fireEvent.contextMenu(roomGroup(container), { clientX: 45, clientY: 40, bubbles: true });
    fireEvent.click(screen.getAllByRole("button", { name: /Duplicate Selected/i }).at(-1)!);

    const floor = latestCampus!.buildings[0].floors[0];
    expect(floor.rooms).toHaveLength(2);
    expect(floor.walls).toHaveLength(2);
    expect(floor.doors).toHaveLength(2);
    expect(floor.windows).toHaveLength(2);
    expect(floor.furniture).toHaveLength(2);
    expect(floor.stairs).toHaveLength(2);
    expect(floor.ramps).toHaveLength(2);
    expect(floor.elevators).toHaveLength(2);
    expect(floor.labels).toHaveLength(2);
    // Paths were not selected → not duplicated
    expect(floor.paths).toHaveLength(1);

    // Originals untouched, copies offset as one rigid group (dx=12, dy=6 — the
    // label is the bottom-most item so dy clamps at 160-154=6)
    const copy = floor.rooms[1];
    expect(copy.id).not.toBe("r1");
    expect(copy).toMatchObject({ x: 32, y: 26 });
    expect(floor.rooms[0]).toMatchObject({ x: 20, y: 20 });
    expect(floor.labels[1]).toMatchObject({ x: 52, y: 156 });
    expect(floor.walls[1]).toMatchObject({ x1: 92, y1: 76 });
    expect(floor.elevators[1].x).toBe(192);

    // The duplicated set becomes the selection
    expect(screen.getByText("9 selected")).toBeInTheDocument();

    // ONE undo removes the whole duplicate group
    fireEvent.click(screen.getByTitle("Undo (Ctrl+Z)"));
    const restored = latestCampus!.buildings[0].floors[0];
    expect(restored.rooms).toHaveLength(1);
    expect(restored.walls).toHaveLength(1);
    expect(restored.labels).toHaveLength(1);
  });
});

describe("Phase 1.7 — wall connection snapping", () => {
  it("snaps a new wall start to an existing wall endpoint and shows feedback", () => {
    const { container } = render(<Harness initialCampus={makeSnapCampus()} />);
    const svg = stubSvgRect(container, 580, 380);

    fireEvent.keyDown(window, { key: "w" }); // wall tool
    // Grid snap moves (55,59) → (60,60); endpoint (53,57) is 7.6 units away → snap
    fireEvent.mouseDown(svg, { clientX: 55, clientY: 59, bubbles: true });

    const indicator = screen.getByTestId("wall-snap-indicator");
    expect(Number(indicator.querySelectorAll("circle")[0].getAttribute("cx"))).toBe(53);
    expect(Number(indicator.querySelectorAll("circle")[0].getAttribute("cy"))).toBe(57);

    // The indicator survives the mid-gesture mouseup (the draw is still active)
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.getByTestId("wall-snap-indicator")).toBeInTheDocument();

    // Switching tools abandons the draw and clears the transient indicator
    fireEvent.keyDown(window, { key: "v" });
    expect(screen.queryByTestId("wall-snap-indicator")).toBeNull();

    // Completing a finished wall also clears it
    fireEvent.keyDown(window, { key: "w" });
    fireEvent.mouseDown(svg, { clientX: 55, clientY: 59, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 300, clientY: 200, bubbles: true });
    fireEvent.mouseDown(svg, { clientX: 300, clientY: 200, bubbles: true });
    expect(screen.queryByTestId("wall-snap-indicator")).toBeNull();
  });

  it("completes a wall endpoint-to-endpoint on an existing wall endpoint", () => {
    const { container } = render(<Harness initialCampus={makeSnapCampus()} onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container, 580, 380);

    fireEvent.keyDown(window, { key: "w" });
    fireEvent.mouseDown(svg, { clientX: 55, clientY: 59, bubbles: true }); // start → (53,57)
    fireEvent.mouseMove(svg, { clientX: 255, clientY: 59, bubbles: true }); // → snaps to w2 endpoint (253,57)
    fireEvent.mouseDown(svg, { clientX: 255, clientY: 59, bubbles: true }); // complete

    const walls = latestCampus!.buildings[0].floors[0].walls;
    expect(walls).toHaveLength(3);
    expect(walls[2]).toMatchObject({ x1: 53, y1: 57, x2: 253, y2: 57 });
  });

  it("snaps an endpoint to a nearby wall segment (Shift held disables angle snap)", () => {
    const { container } = render(<Harness initialCampus={makeSnapCampus()} onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container, 580, 380);

    fireEvent.keyDown(window, { key: "w" });
    fireEvent.mouseDown(svg, { clientX: 30, clientY: 90, bubbles: true }); // start (30,90)
    fireEvent.mouseMove(svg, { clientX: 100, clientY: 60, shiftKey: true, bubbles: true }); // → segment point (100,57)
    fireEvent.mouseDown(svg, { clientX: 100, clientY: 60, shiftKey: true, bubbles: true });

    const walls = latestCampus!.buildings[0].floors[0].walls;
    expect(walls[2]).toMatchObject({ x1: 30, y1: 90, x2: 100, y2: 57 });
  });

  it("snaps a wall endpoint to the floor boundary", () => {
    const { container } = render(<Harness initialCampus={makeSnapCampus()} onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container, 580, 380);

    fireEvent.keyDown(window, { key: "w" });
    fireEvent.mouseDown(svg, { clientX: 30, clientY: 90, bubbles: true }); // start (30,90)
    fireEvent.mouseMove(svg, { clientX: 577, clientY: 100, shiftKey: true, bubbles: true }); // → (580,100)
    fireEvent.mouseDown(svg, { clientX: 577, clientY: 100, shiftKey: true, bubbles: true });

    const walls = latestCampus!.buildings[0].floors[0].walls;
    expect(walls[2]).toMatchObject({ x1: 30, y1: 90, x2: 580, y2: 100 });
  });

  it("snaps while editing an existing wall endpoint (Shift holds angle assistance)", () => {
    const { container } = render(<Harness initialCampus={makeSnapCampus()} onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container, 580, 380);

    // Select w2 by clicking its body
    const w2Group = Array.from(container.querySelectorAll("g")).find(
      (el) => !el.hasAttribute("transform") && el.querySelector('line[stroke="#64748b"][x1="253"]')
    ) as SVGGElement;
    fireEvent.mouseDown(w2Group, { clientX: 300, clientY: 57, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    // Drag the x2 endpoint handle (353,57) toward the right boundary with Shift
    // held — the 15° angle assistance keeps the wall horizontal, then the
    // boundary snap pulls the endpoint to the exact floor edge (580,57).
    const handles = screen.queryAllByTestId("wall-endpoint-handle");
    const x2Handle = Array.from(handles).find((h) => Number(h.getAttribute("cx")) === 353)!;
    fireEvent.mouseDown(x2Handle, { clientX: 353, clientY: 57, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 576, clientY: 60, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const walls = latestCampus!.buildings[0].floors[0].walls;
    expect(walls.find((w) => w.id === "w2")).toMatchObject({ x1: 253, y1: 57, x2: 580, y2: 57 });
  });
});

describe("Phase 1.7 — Save control", () => {
  it("Save is disabled when clean and enabled once the floor is dirty", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container, 220, 160);

    const saveBtn = screen.getByRole("button", { name: "Save" });
    expect((saveBtn as HTMLButtonElement).disabled).toBe(true);

    fireEvent.mouseDown(roomGroup(container), { clientX: 45, clientY: 40, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 60, clientY: 50, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows a real loading state, prevents duplicate submission, and clears dirty on success", async () => {
    let resolveSave!: (c: Campus) => void;
    const savePromise = new Promise<Campus>((res) => { resolveSave = res; });
    const onSave = vi.fn((c: Campus) => savePromise);

    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} onSave={onSave} />);
    const svg = stubSvgRect(container, 220, 160);

    fireEvent.mouseDown(roomGroup(container), { clientX: 45, clientY: 40, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 60, clientY: 50, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    // Real loading state while the promise is pending; button locked
    const loadingBtn = screen.getByRole("button", { name: "Saving..." }) as HTMLButtonElement;
    expect(loadingBtn.disabled).toBe(true);
    fireEvent.click(loadingBtn); // duplicate submission is blocked
    expect(onSave).toHaveBeenCalledTimes(1);

    // Resolve → success clears dirty state (the saved button is disabled
    // because there is nothing left to save)
    resolveSave(latestCampus!);
    await waitFor(() => {
      const savedBtn = screen.getByRole("button", { name: "Saved" }) as HTMLButtonElement;
      expect(savedBtn.disabled).toBe(true);
    });
  });

  it("keeps edits and dirty state when the save fails", async () => {
    const onSave = vi.fn(() => Promise.reject(new Error("DB offline")));

    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} onSave={onSave} />);
    const svg = stubSvgRect(container, 220, 160);

    fireEvent.mouseDown(roomGroup(container), { clientX: 45, clientY: 40, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 60, clientY: 50, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument());
    // Failed save keeps the edit (room moved +15/+10 from 20,20) AND keeps the
    // floor dirty so Save stays enabled
    expect(latestCampus!.buildings[0].floors[0].rooms[0]).toMatchObject({ x: 35, y: 30 });
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("Phase 1.7 — Publish control", () => {
  it("shows Publish gated/disabled when campus publishing is unavailable, with no independent floor state", () => {
    const { container } = render(<Harness />);
    stubSvgRect(container, 220, 160);

    const publishBtn = screen.getByRole("button", { name: "Publish" }) as HTMLButtonElement;
    expect(publishBtn.disabled).toBe(true);
    expect(publishBtn.title).toContain("A6");
  });

  it("delegates to the campus publish callback only after floor validation passes", () => {
    const onPublish = vi.fn();
    const { container } = render(<Harness onPublish={onPublish} publishingEnabled />);
    stubSvgRect(container, 220, 160);

    // Valid floor → publish delegates through the existing campus flow
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(onPublish).toHaveBeenCalledTimes(1);

    // A floor with geometry issues blocks publishing before delegation
    cleanup();
    document.body.innerHTML = "";
    const broken = makeRichCampus();
    broken.buildings[0].floors[0].rooms[0] = { ...broken.buildings[0].floors[0].rooms[0], x: 300 };
    const onPublish2 = vi.fn();
    const { container: c2 } = render(<Harness initialCampus={broken} onPublish={onPublish2} publishingEnabled />);
    stubSvgRect(c2, 220, 160);
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(onPublish2).not.toHaveBeenCalled();
    expect(screen.getByText("Floor Issues")).toBeInTheDocument();
  });
});

describe("Phase 1.7 — Floor Settings draft UX", () => {
  it("keeps draft edits local, applies on Save Changes, and reverts on Cancel", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    stubSvgRect(container, 220, 160);

    fireEvent.click(screen.getByTitle("Toggle Properties Panel"));
    fireEvent.click(screen.getByRole("button", { name: /Open Floor Settings/i }));
    const widthInput = screen.getByLabelText("Floor canvas width") as HTMLInputElement;
    const heightInput = screen.getByLabelText("Floor canvas height") as HTMLInputElement;

    fireEvent.change(widthInput, { target: { value: "300" } });
    fireEvent.change(heightInput, { target: { value: "200" } });
    expect(widthInput.value).toBe("300"); // draft changed locally

    // Cancel discards the dialog draft without touching the campus
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(latestCampus).toBeNull();

    // Reopening re-seeds the draft from the floor (220×160)
    fireEvent.click(screen.getByRole("button", { name: /Open Floor Settings/i }));
    expect((screen.getByLabelText("Floor canvas width") as HTMLInputElement).value).toBe("220");

    // Save Changes applies the canonical canvas size
    const w2 = screen.getByLabelText("Floor canvas width") as HTMLInputElement;
    const h2 = screen.getByLabelText("Floor canvas height") as HTMLInputElement;
    fireEvent.change(w2, { target: { value: "300" } });
    fireEvent.change(h2, { target: { value: "200" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(latestCampus!.buildings[0].floors[0]).toMatchObject({ canvasW: 300, canvasH: 200 });
  });
});

describe("Phase 1.7 — curated furniture library and shared renderer", () => {
  it("exposes the curated campus-relevant core library", () => {
    const allTypes = FURNITURE_CATEGORIES.flatMap((c) => c.items.map((i) => i.type));
    expect(allTypes).toContain("chair");
    expect(allTypes).toContain("bench");
    expect(allTypes).toContain("sofa");
    expect(allTypes).toContain("table");
    expect(allTypes).toContain("desk");
    expect(allTypes).toContain("cabinet");
    expect(allTypes).toContain("bookshelf");
    expect(allTypes).toContain("computer-workstation");
    expect(allTypes).toContain("plant");
    // Less-useful legacy types are hidden from the default library…
    expect(allTypes).not.toContain("microscope");
    expect(allTypes).not.toContain("fume-hood");
  });

  it("renders placed furniture as structured top-down symbols, not text boxes", () => {
    const campus = makeRichCampus();
    campus.buildings[0].floors[0].furniture = [
      { id: "chair1", type: "chair", name: "Chair", category: "seating", x: 100, y: 100, width: 14, height: 14, rotation: 0, color: "#4b5563" },
      { id: "desk1", type: "desk", name: "Desk", category: "tables", x: 120, y: 120, width: 20, height: 12, rotation: 0, color: "#7a5c3a" },
    ];
    const { container } = render(<Harness initialCampus={campus} />);
    stubSvgRect(container, 220, 160);

    const furnitureGs = Array.from(container.querySelectorAll("g")).filter(
      (el) => !el.hasAttribute("transform") && el.querySelector("title")
    );
    expect(furnitureGs.length).toBe(2);

    // A chair renders a seat + backrest silhouette (≥2 rects), and no visible
    // text label inside the object
    const chairG = furnitureGs.find((g) => g.querySelector("title")?.textContent === "Chair")!;
    expect(chairG.querySelectorAll("rect").length).toBeGreaterThanOrEqual(2);
    expect(Array.from(chairG.querySelectorAll("text")).map((t) => t.textContent)).not.toContain("Chair");

    // A desk renders a tabletop + surface cues
    const deskG = furnitureGs.find((g) => g.querySelector("title")?.textContent === "Desk")!;
    expect(deskG.querySelectorAll("rect").length).toBeGreaterThanOrEqual(2);
  });

  it("uses the same structured renderer in the palette preview and on the canvas", () => {
    const { container } = render(<Harness initialCampus={makeRichCampus()} />);
    const svg = stubSvgRect(container, 220, 160);

    // Open the Seating category so its palette previews render
    const seatingHeader = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("Seating"));
    fireEvent.click(seatingHeader!);
    const paletteChair = Array.from(container.querySelectorAll("svg")).find(
      (s) => s.getAttribute("viewBox") === "0 0 28 20" && s.closest("button")?.textContent?.includes("Chair")
    );
    expect(paletteChair).toBeTruthy();

    // Choose the Chair template and place it on the canvas
    const chairButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Chair") && !b.textContent?.includes("Student")
    );
    fireEvent.click(chairButton!);
    fireEvent.mouseDown(svg, { clientX: 100, clientY: 100, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const placedChairG = Array.from(container.querySelectorAll("g")).find(
      (el) => !el.hasAttribute("transform") && el.querySelector("title")?.textContent === "Chair"
    );
    expect(placedChairG).toBeTruthy();
    // The palette preview and the placed object both use the same vector shapes
    expect(paletteChair!.querySelectorAll("rect").length).toBeGreaterThanOrEqual(2);
    expect(placedChairG!.querySelectorAll("rect").length).toBeGreaterThanOrEqual(2);
  });

  it("keeps a safe structured fallback for legacy/unknown furniture types", () => {
    const campus = makeRichCampus();
    campus.buildings[0].floors[0].furniture = [
      { id: "legacy1", type: "fume-hood", name: "Legacy Hood", category: "lab", x: 100, y: 100, width: 16, height: 12, rotation: 0, color: "#d4d4d8" },
    ];
    const { container } = render(<Harness initialCampus={campus} />);
    stubSvgRect(container, 220, 160);

    const legacyG = Array.from(container.querySelectorAll("g")).find(
      (el) => !el.hasAttribute("transform") && el.querySelector("title")?.textContent === "Legacy Hood"
    )!;
    // Fallback renders a readable generic storage shape (never a plain colored
    // rect alone and never a text box)
    expect(legacyG.querySelector("rect")).toBeTruthy();
    expect(legacyG.querySelectorAll("line").length).toBeGreaterThanOrEqual(1);
    expect(Array.from(legacyG.querySelectorAll("text")).length).toBe(0);
  });
});

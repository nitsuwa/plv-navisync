import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { useState } from "react";
import { CampusEditor } from "../CampusEditor";
import type { Campus } from "../types";

/**
 * Fixture: a 900x680 campus with three buildings, two decorative assets
 * (tree + bench) and one marker. Colors are distinct so tests can target <g>s.
 */
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
    canvasW: 900,
    canvasH: 680,
    settings: { accessibility: true, emergency: true, eventLayer: true, gps: true },
    buildings: [
      {
        id: "b1", name: "Building One", code: "B1", category: "Academic", description: "",
        x: 100, y: 100, width: 120, height: 80, color: "#1e40af", expanded: false,
        floors: [{ id: "f1", buildingId: "b1", number: 1, label: "Ground Floor", rooms: [], paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [] }],
      },
      {
        id: "b2", name: "Building Two", code: "B2", category: "Academic", description: "",
        x: 260, y: 100, width: 120, height: 80, color: "#7c3aed", expanded: false,
        floors: [{ id: "f2", buildingId: "b2", number: 1, label: "Ground Floor", rooms: [], paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [] }],
      },
      {
        id: "b3", name: "Building Three", code: "B3", category: "Academic", description: "",
        x: 700, y: 300, width: 120, height: 80, color: "#059669", expanded: false,
        floors: [{ id: "f3", buildingId: "b3", number: 1, label: "Ground Floor", rooms: [], paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [] }],
      },
    ],
    decorAssets: [
      { id: "da1", type: "tree", x: 450, y: 120, rotation: 0, scale: 1 },
      { id: "da2", type: "bench", x: 550, y: 200, rotation: 0, scale: 1 },
    ],
    markers: [
      { id: "m1", name: "Info Booth", type: "landmark", x: 200, y: 400, color: "#ef4444" },
    ],
    paths: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
}

/** Harness that keeps the campus in React state so onUpdate round-trips. */
function Harness({ onCampusChange }: { onCampusChange?: (c: Campus) => void }) {
  const [campus, setCampus] = useState<Campus>(makeCampus);
  return (
    <CampusEditor
      campus={campus}
      onBack={() => {}}
      onUpdate={(c) => { onCampusChange?.(c); setCampus(c); }}
      onPublish={() => {}}
      onOpenFloor={() => {}}
      onAddBuilding={() => {}}
    />
  );
}

let latestCampus: Campus | null = null;

function canvasSvg(container: HTMLElement): SVGSVGElement {
  const svg = Array.from(container.querySelectorAll("svg")).find((s) => s.getAttribute("viewBox") === "0 0 900 680");
  expect(svg).toBeTruthy();
  return svg as SVGSVGElement;
}

function stubSvgRect(container: HTMLElement): SVGSVGElement {
  const svg = canvasSvg(container);
  Object.defineProperty(svg, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ left: 0, top: 0, right: 900, bottom: 680, width: 900, height: 680, x: 0, y: 0, toJSON: () => ({}) }),
  });
  return svg;
}

function buildingG(container: HTMLElement, color: string): SVGGElement {
  const g = Array.from(container.querySelectorAll("g")).find(
    (el) => !el.hasAttribute("transform") && el.querySelector(`rect[fill="${color}"]`)
  );
  expect(g, `building g with fill ${color}`).toBeTruthy();
  return g as SVGGElement;
}

function decorG(container: HTMLElement, type = "tree"): SVGGElement {
  const g = Array.from(container.querySelectorAll("g")).find(
    (el) => !el.hasAttribute("transform") && el.getAttribute("data-decor-type") === type
  );
  expect(g, `decor asset g (${type})`).toBeTruthy();
  return g as SVGGElement;
}

function markerG(container: HTMLElement): SVGGElement {
  const g = Array.from(container.querySelectorAll("g")).find(
    (el) => !el.hasAttribute("transform") && el.querySelector('circle[fill="#ef4444"]')
  );
  expect(g, "marker g").toBeTruthy();
  return g as SVGGElement;
}

function undoButton(container: HTMLElement): HTMLButtonElement | null {
  return container.querySelector('button[title^="Undo"]');
}
function redoButton(container: HTMLElement): HTMLButtonElement | null {
  return container.querySelector('button[title^="Redo"]');
}

function buildingPos(c: Campus, id: string): { x: number; y: number } {
  const b = c.buildings.find((x) => x.id === id);
  if (!b) throw new Error(`missing building ${id}`);
  return { x: b.x, y: b.y };
}
function decorPos(c: Campus, id: string): { x: number; y: number } {
  const d = (c.decorAssets ?? []).find((x) => x.id === id);
  if (!d) throw new Error(`missing decor ${id}`);
  return { x: d.x, y: d.y };
}
function buildingOrder(c: Campus): string[] {
  return c.buildings.map((b) => b.id);
}
function decorOrder(c: Campus): string[] {
  return (c.decorAssets ?? []).map((d) => d.id);
}
function decorById(c: Campus, id: string) {
  const d = (c.decorAssets ?? []).find((x) => x.id === id);
  if (!d) throw new Error(`missing decor ${id}`);
  return d;
}

function selectItem(g: SVGGElement, clientX: number, clientY: number) {
  fireEvent.mouseDown(g, { clientX, clientY });
  fireEvent.mouseUp(g);
}

function shiftClick(g: SVGGElement, clientX: number, clientY: number) {
  fireEvent.mouseDown(g, { clientX, clientY, shiftKey: true });
  fireEvent.mouseUp(g);
}

function clickLayer(container: HTMLElement, title: string) {
  const btn = container.querySelector(`button[title="${title}"]`);
  expect(btn, `layer-order button ${title}`).toBeTruthy();
  fireEvent.click(btn!);
}

/** Set a panel input's value then commit it by blurring. */
function setInput(container: HTMLElement, id: string, value: string) {
  const input = container.querySelector(`#${id}`) as HTMLInputElement | null;
  expect(input, `panel input #${id}`).toBeTruthy();
  fireEvent.change(input!, { target: { value } });
  fireEvent.blur(input!);
}

/** Set a panel range slider's value then commit it by blurring. */
function setSlider(container: HTMLElement, id: string, value: string) {
  const input = container.querySelector(`#${id}`) as HTMLInputElement | null;
  expect(input, `panel slider #${id}`).toBeTruthy();
  fireEvent.change(input!, { target: { value } });
  fireEvent.blur(input!);
}

beforeEach(() => {
  localStorage.setItem("plv-mb-tutorial-done", "true");
  latestCampus = null;
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.body.innerHTML = "";
});

describe("CampusEditor decorative asset properties", () => {
  it("shows a decorative asset section when a single asset is selected", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    selectItem(decorG(container, "tree"), 450, 120);

    expect(container.querySelector("#decor-name")).toBeTruthy();
    expect(container.querySelector("#decor-rotation")).toBeTruthy();
    expect(container.querySelector("#decor-scale")).toBeTruthy();
    expect(container.querySelector("#decor-x")).toBeTruthy();
    expect(container.querySelector("#decor-y")).toBeTruthy();
    // Type label is shown for the administrator (not the raw id).
    expect(container.textContent).toContain("Tree");
    expect(container.textContent).toContain("Asset Info");
  });

  it("renames a decor asset on blur with exactly one undo entry", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    selectItem(decorG(container, "tree"), 450, 120);
    setInput(container, "decor-name", "Old Oak");

    expect(latestCampus).toBeTruthy();
    expect(decorById(latestCampus!, "da1").name).toBe("Old Oak");
    // Unrelated objects untouched.
    expect(decorById(latestCampus!, "da2").name).toBeUndefined();
    expect(buildingPos(latestCampus!, "b1")).toEqual({ x: 100, y: 100 });

    // Exactly one history entry: one undo restores, nothing further to undo.
    expect(undoButton(container)).toBeTruthy();
    fireEvent.click(undoButton(container)!);
    expect(decorById(latestCampus!, "da1").name).toBeUndefined();
    expect(undoButton(container)).toBeNull();
  });

  it("rotation commits from the slider and normalizes typed values", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    selectItem(decorG(container, "tree"), 450, 120);
    setSlider(container, "decor-rotation", "90");
    expect(decorById(latestCampus!, "da1").rotation).toBe(90);

    // Typed values normalize into [0, 360): 400 → 40.
    setInput(container, "decor-rotation-input", "400");
    expect(decorById(latestCampus!, "da1").rotation).toBe(40);

    // Two committed actions → two undo steps back to 0.
    fireEvent.click(undoButton(container)!);
    expect(decorById(latestCampus!, "da1").rotation).toBe(90);
    fireEvent.click(undoButton(container)!);
    expect(decorById(latestCampus!, "da1").rotation).toBe(0);
    expect(undoButton(container)).toBeNull();
  });

  it("scale clamps to the canvas resize-handle bounds and updates the asset", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    selectItem(decorG(container, "tree"), 450, 120);
    setSlider(container, "decor-scale", "2");
    expect(decorById(latestCampus!, "da1").scale).toBe(2);

    // Values above the editor's max (12) clamp, never explode.
    setSlider(container, "decor-scale", "50");
    expect(decorById(latestCampus!, "da1").scale).toBe(12);

    fireEvent.click(undoButton(container)!);
    expect(decorById(latestCampus!, "da1").scale).toBe(2);
  });

  it("visibility hides the asset on the canvas and is undoable", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    selectItem(decorG(container, "tree"), 450, 120);
    const visBtn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Visible");
    expect(visBtn).toBeTruthy();
    fireEvent.click(visBtn!);

    expect(latestCampus).toBeTruthy();
    expect(decorById(latestCampus!, "da1").visible).toBe(false);
    // Hidden-but-selected assets stay visible for editing (existing semantics);
    // deselect to confirm the hidden asset is no longer rendered on the canvas.
    fireEvent.mouseDown(svg, { clientX: 20, clientY: 20 });
    fireEvent.mouseUp(svg);
    expect(Array.from(container.querySelectorAll('path[fill="#22c55e"]'))).toHaveLength(0);

    fireEvent.click(undoButton(container)!);
    // Undo restores the original state (visible was undefined in the fixture).
    expect(decorById(latestCampus!, "da1").visible).not.toBe(false);
  });

  it("duplicate creates a unique-id copy offset nearby, selects it, and is one undo step", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    selectItem(decorG(container, "tree"), 450, 120);
    setSlider(container, "decor-scale", "1.5"); // exercise visual-property preservation
    const dupBtn = container.querySelector('button[title="Duplicate Asset"]');
    expect(dupBtn).toBeTruthy();
    fireEvent.click(dupBtn!);

    expect(latestCampus).toBeTruthy();
    const decors = latestCampus!.decorAssets ?? [];
    expect(decors).toHaveLength(3);
    const copy = decors.find((d) => d.id !== "da1" && d.id !== "da2");
    expect(copy).toBeTruthy();
    // Unique id + preserved visuals + visible offset.
    expect(copy!.type).toBe("tree");
    expect(copy!.scale).toBe(1.5);
    expect(copy!.x).toBe(470);
    expect(copy!.y).toBe(140);
    // Selection moved to the copy: a second duplicate acts on the copy.
    fireEvent.click(dupBtn!);
    expect((latestCampus!.decorAssets ?? []).map((d) => d.id)).toHaveLength(4);
    expect((latestCampus!.decorAssets ?? []).filter((d) => d.x === 490 && d.y === 160)).toHaveLength(1);

    // One undo restores pre-duplicate state; redo re-applies the copy.
    fireEvent.click(undoButton(container)!);
    expect((latestCampus!.decorAssets ?? []).map((d) => d.id)).toHaveLength(3);
    fireEvent.click(undoButton(container)!);
    expect((latestCampus!.decorAssets ?? []).map((d) => d.id)).toEqual(["da1", "da2"]);
    fireEvent.click(redoButton(container)!);
    expect((latestCampus!.decorAssets ?? []).map((d) => d.id)).toHaveLength(3);
  });

  it("delete confirms, removes only the intended asset, and is undoable", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    selectItem(decorG(container, "tree"), 450, 120);
    const delBtn = container.querySelector('button[title="Delete Asset"]');
    expect(delBtn).toBeTruthy();
    fireEvent.click(delBtn!);

    // Confirmation dialog opens; confirm deletes only da1.
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    const confirm = Array.from(dialog!.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Delete Asset");
    expect(confirm).toBeTruthy();
    fireEvent.click(confirm!);

    expect(latestCampus).toBeTruthy();
    expect((latestCampus!.decorAssets ?? []).map((d) => d.id)).toEqual(["da2"]);
    expect(buildingPos(latestCampus!, "b1")).toEqual({ x: 100, y: 100 });

    // Undo restores the deleted asset.
    expect(undoButton(container)).toBeTruthy();
    fireEvent.click(undoButton(container)!);
    expect((latestCampus!.decorAssets ?? []).map((d) => d.id)).toEqual(["da1", "da2"]);
  });

  it("property changes never modify unrelated decor assets or buildings", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    selectItem(decorG(container, "tree"), 450, 120);
    setInput(container, "decor-name", "Old Oak");
    setSlider(container, "decor-rotation", "90");
    setSlider(container, "decor-scale", "2");
    setInput(container, "decor-x", "500");

    const c = latestCampus!;
    expect(decorById(c, "da1").name).toBe("Old Oak");
    expect(decorById(c, "da1").rotation).toBe(90);
    expect(decorById(c, "da1").scale).toBe(2);
    expect(decorById(c, "da1").x).toBe(500);
    // da2 fully untouched.
    expect(decorById(c, "da2")).toMatchObject({ type: "bench", x: 550, y: 200, rotation: 0, scale: 1 });
    expect(decorById(c, "da2").name).toBeUndefined();
    expect(decorById(c, "da2").visible).toBeUndefined();
    // Buildings untouched.
    expect(buildingOrder(c)).toEqual(["b1", "b2", "b3"]);
    expect(buildingPos(c, "b2")).toEqual({ x: 260, y: 100 });
  });

  it("Layer Order still works for a selected decor asset", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    selectItem(decorG(container, "tree"), 450, 120);
    clickLayer(container, "Bring to Front");
    expect(latestCampus).toBeTruthy();
    // Cross-type stacking: da1 becomes the TOP of the merged building+decor
    // stack (zOrder = last position), while the arrays themselves keep their
    // order — the optional zOrder field carries the stacking.
    const all = [...latestCampus!.buildings, ...(latestCampus!.decorAssets ?? [])];
    const sorted = all.sort((a, b) => (a.zOrder ?? 0) - (b.zOrder ?? 0));
    expect(sorted[sorted.length - 1].id).toBe("da1");
    expect(decorOrder(latestCampus!)).toEqual(["da1", "da2"]);
    expect(buildingOrder(latestCampus!)).toEqual(["b1", "b2", "b3"]);
  });

  it("group drag still works after changing scale and rotation", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    selectItem(decorG(container, "tree"), 450, 120);
    setSlider(container, "decor-scale", "2");
    setSlider(container, "decor-rotation", "90");

    // Multi-select b1 while the edited tree remains the active selected item,
    // then drag the group rigidly (+10, 0).
    shiftClick(buildingG(container, "#1e40af"), 100, 100);
    fireEvent.mouseDown(decorG(container, "tree"), { clientX: 450, clientY: 120 });
    fireEvent.mouseMove(svg, { clientX: 460, clientY: 120 });
    fireEvent.mouseUp(svg);

    expect(latestCampus).toBeTruthy();
    expect(decorPos(latestCampus!, "da1")).toEqual({ x: 460, y: 120 });
    expect(buildingPos(latestCampus!, "b1")).toEqual({ x: 110, y: 100 });
    expect(decorById(latestCampus!, "da1").scale).toBe(2);
    expect(decorById(latestCampus!, "da1").rotation).toBe(90);
  });

  it("marker-only multi-selection does not show useless Layer Order controls", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    // Single marker selection: no layer controls.
    selectItem(markerG(container), 200, 400);
    expect(container.querySelector('button[title="Bring to Front"]')).toBeNull();
    expect(container.querySelector('button[title="Send to Back"]')).toBeNull();

    // Marker-only multi-selection: still no layer controls.
    shiftClick(markerG(container), 200, 400);
    expect(container.querySelector('button[title="Bring to Front"]')).toBeNull();
    expect(container.querySelector('button[title="Send to Back"]')).toBeNull();

    // Sanity: a building multi-selection still shows them.
    shiftClick(buildingG(container, "#1e40af"), 100, 100);
    shiftClick(buildingG(container, "#7c3aed"), 260, 100);
    expect(container.querySelector('button[title="Bring to Front"]')).toBeTruthy();
  });
});

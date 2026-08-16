import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { useState } from "react";
import { CampusEditor } from "../CampusEditor";
import type { Campus } from "../types";

/**
 * Fixture: a 900x680 campus with three buildings and two decorative assets
 * (a tree and a bench). Colors are distinct so tests can target <g> elements.
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
        floors: [{ id: "f1", buildingId: "b1", number: 1, label: "Ground Floor", rooms: [], paths: [] }],
      },
      {
        id: "b2", name: "Building Two", code: "B2", category: "Academic", description: "",
        x: 260, y: 100, width: 120, height: 80, color: "#7c3aed", expanded: false,
        floors: [{ id: "f2", buildingId: "b2", number: 1, label: "Ground Floor", rooms: [], paths: [] }],
      },
      {
        id: "b3", name: "Building Three", code: "B3", category: "Academic", description: "",
        x: 700, y: 300, width: 120, height: 80, color: "#059669", expanded: false,
        floors: [{ id: "f3", buildingId: "b3", number: 1, label: "Ground Floor", rooms: [], paths: [] }],
      },
    ],
    decorAssets: [
      { id: "da1", type: "tree", x: 450, y: 120, rotation: 0, scale: 1 },
      { id: "da2", type: "bench", x: 550, y: 200, rotation: 0, scale: 1 },
    ],
    markers: [],
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

/** The canvas SVG is the one with the editor viewBox (lucide icons are svg too). */
function canvasSvg(container: HTMLElement): SVGSVGElement {
  const svg = Array.from(container.querySelectorAll("svg")).find((s) => s.getAttribute("viewBox") === "0 0 900 680");
  expect(svg).toBeTruthy();
  return svg as SVGSVGElement;
}

/** Stub the SVG rect so screenToWorld maps client coords 1:1 to world coords (zoom 1, pan 0). */
function stubSvgRect(container: HTMLElement): SVGSVGElement {
  const svg = canvasSvg(container);
  Object.defineProperty(svg, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ left: 0, top: 0, right: 900, bottom: 680, width: 900, height: 680, x: 0, y: 0, toJSON: () => ({}) }),
  });
  return svg;
}

const COLOR_TO_ID: Record<string, string> = { "#1e40af": "b1", "#7c3aed": "b2", "#059669": "b3" };
const TYPE_TO_ID: Record<string, string> = { tree: "da1", bench: "da2" };

/**
 * RENDER order of buildings + decor assets on the canvas (document order of the
 * merged cross-type stack). Buildings are identified by their body fill color,
 * decor assets by their data-decor-type attribute.
 */
function renderOrder(container: HTMLElement): string[] {
  const svg = canvasSvg(container);
  const root = Array.from(svg.querySelectorAll("g")).find((g) => g.getAttribute("transform") === "translate(0,0) scale(1)");
  expect(root, "canvas transform root").toBeTruthy();
  const order: string[] = [];
  for (const child of Array.from(root!.children)) {
    if (child.tagName !== "g" || (child as SVGElement).hasAttribute("transform")) continue;
    const bodyFill = (child as SVGGElement).querySelector('rect[fill^="#"]')?.getAttribute("fill");
    if (bodyFill && COLOR_TO_ID[bodyFill]) { order.push(COLOR_TO_ID[bodyFill]); continue; }
    const dt = (child as SVGGElement).getAttribute("data-decor-type");
    if (dt && TYPE_TO_ID[dt]) order.push(TYPE_TO_ID[dt]);
  }
  return order;
}

/** Find a building <g> by its body fill color (outer g has no transform attr). */
function buildingG(container: HTMLElement, color: string): SVGGElement {
  const g = Array.from(container.querySelectorAll("g")).find(
    (el) => !el.hasAttribute("transform") && el.querySelector(`rect[fill="${color}"]`)
  );
  expect(g, `building g with fill ${color}`).toBeTruthy();
  return g as SVGGElement;
}

/** Find a decorative asset <g> by its type. */
function decorG(container: HTMLElement, type = "tree"): SVGGElement {
  const g = Array.from(container.querySelectorAll("g")).find(
    (el) => !el.hasAttribute("transform") && el.getAttribute("data-decor-type") === type
  );
  expect(g, `decor asset g (${type})`).toBeTruthy();
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

/** Plain click on a canvas item — selects it (and starts/ends a no-op drag). */
function selectItem(g: SVGGElement, clientX: number, clientY: number) {
  fireEvent.mouseDown(g, { clientX, clientY });
  fireEvent.mouseUp(g);
}

/** Shift+click an item to add it to the multi-selection. */
function shiftClick(g: SVGGElement, clientX: number, clientY: number) {
  fireEvent.mouseDown(g, { clientX, clientY, shiftKey: true });
  fireEvent.mouseUp(g);
}

/** Click one of the four Layer Order buttons in the Properties panel. */
function clickLayer(container: HTMLElement, title: string) {
  const btn = container.querySelector(`button[title="${title}"]`);
  expect(btn, `layer-order button ${title}`).toBeTruthy();
  fireEvent.click(btn!);
}

/** Open the context menu on an item and click a menu item by its label. */
function clickContextItem(container: HTMLElement, g: SVGGElement, clientX: number, clientY: number, label: string) {
  fireEvent.contextMenu(g, { clientX, clientY });
  const btn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.trim() === label);
  expect(btn, `context menu item ${label}`).toBeTruthy();
  fireEvent.click(btn!);
}

beforeEach(() => {
  latestCampus = null;
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("CampusEditor cross-type layer ordering", () => {
  it("bring forward moves the selected building up one layer in the shared stack, keeps selection, ONE history entry", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    stubSvgRect(container);
    const g1 = buildingG(container, "#1e40af");

    selectItem(g1, 100, 100);
    expect(renderOrder(container)).toEqual(["b1", "b2", "b3", "da1", "da2"]);

    clickLayer(container, "Bring Forward");
    expect(latestCampus).toBeTruthy();
    // b1 steps up one position in the merged stack; array order is untouched
    // (stacking lives in the optional zOrder field).
    expect(renderOrder(container)).toEqual(["b2", "b1", "b3", "da1", "da2"]);
    expect(buildingPos(latestCampus!, "b1")).toEqual({ x: 100, y: 100 });

    // Selection remained on b1: a second bring-forward still targets it.
    clickLayer(container, "Bring Forward");
    expect(renderOrder(container)).toEqual(["b2", "b3", "b1", "da1", "da2"]);

    // Exactly one undo entry per action: two actions → two steps.
    fireEvent.click(undoButton(container)!);
    expect(renderOrder(container)).toEqual(["b2", "b1", "b3", "da1", "da2"]);
    fireEvent.click(undoButton(container)!);
    expect(renderOrder(container)).toEqual(["b1", "b2", "b3", "da1", "da2"]);
    expect(undoButton(container)).toBeNull();

    fireEvent.click(redoButton(container)!);
    expect(renderOrder(container)).toEqual(["b2", "b1", "b3", "da1", "da2"]);
    fireEvent.click(redoButton(container)!);
    expect(renderOrder(container)).toEqual(["b2", "b3", "b1", "da1", "da2"]);
    expect(redoButton(container)).toBeNull();
  });

  it("bring to front, send to back and send backward work across the whole stack without moving objects", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    stubSvgRect(container);

    selectItem(buildingG(container, "#1e40af"), 100, 100);
    clickLayer(container, "Bring to Front");
    expect(renderOrder(container)).toEqual(["b2", "b3", "da1", "da2", "b1"]);

    selectItem(buildingG(container, "#059669"), 700, 300);
    clickLayer(container, "Send to Back");
    expect(renderOrder(container)).toEqual(["b3", "b2", "da1", "da2", "b1"]);

    selectItem(buildingG(container, "#7c3aed"), 260, 100);
    clickLayer(container, "Send Backward");
    expect(renderOrder(container)).toEqual(["b2", "b3", "da1", "da2", "b1"]);

    expect(buildingPos(latestCampus!, "b1")).toEqual({ x: 100, y: 100 });
    expect(buildingPos(latestCampus!, "b2")).toEqual({ x: 260, y: 100 });
    expect(buildingPos(latestCampus!, "b3")).toEqual({ x: 700, y: 300 });
    expect(decorPos(latestCampus!, "da1")).toEqual({ x: 450, y: 120 });
  });

  it("no-op at the top boundary creates NO history entry", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    stubSvgRect(container);

    // da2 (bench) is already the top of the merged stack.
    selectItem(decorG(container, "bench"), 550, 200);
    expect(undoButton(container)).toBeNull();
    clickLayer(container, "Bring to Front"); // no-op
    expect(undoButton(container)).toBeNull();

    // A subsequent real action is undoable in exactly one step.
    clickLayer(container, "Send Backward");
    expect(renderOrder(container)).toEqual(["b1", "b2", "b3", "da2", "da1"]);
    expect(undoButton(container)).toBeTruthy();
    fireEvent.click(undoButton(container)!);
    expect(renderOrder(container)).toEqual(["b1", "b2", "b3", "da1", "da2"]);
    expect(undoButton(container)).toBeNull();
  });

  it("multi-selection reorder preserves internal relative order for mixed buildings and decor assets", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    stubSvgRect(container);

    shiftClick(buildingG(container, "#1e40af"), 100, 100);
    shiftClick(buildingG(container, "#7c3aed"), 260, 100);
    shiftClick(decorG(container, "tree"), 450, 120);

    clickLayer(container, "Bring to Front");
    expect(latestCampus).toBeTruthy();
    // Block [b1, b2, da1] moves above [b3, da2], internal order preserved.
    expect(renderOrder(container)).toEqual(["b3", "da2", "b1", "b2", "da1"]);
    expect(buildingPos(latestCampus!, "b1")).toEqual({ x: 100, y: 100 });
    expect(decorPos(latestCampus!, "da1")).toEqual({ x: 450, y: 120 });

    // One history entry: undo restores, redo re-applies.
    fireEvent.click(undoButton(container)!);
    expect(renderOrder(container)).toEqual(["b1", "b2", "b3", "da1", "da2"]);
    fireEvent.click(redoButton(container)!);
    expect(renderOrder(container)).toEqual(["b3", "da2", "b1", "b2", "da1"]);
  });

  it("a decorative asset reorders above buildings and below them via the panel", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    stubSvgRect(container);

    selectItem(decorG(container, "tree"), 450, 120); // da1 (bottom of decor, above buildings)
    clickLayer(container, "Bring to Front");
    expect(latestCampus).toBeTruthy();
    // da1 moves above da2 AND all buildings.
    expect(renderOrder(container)).toEqual(["b1", "b2", "b3", "da2", "da1"]);
    expect(decorPos(latestCampus!, "da1")).toEqual({ x: 450, y: 120 });

    clickLayer(container, "Send to Back");
    expect(renderOrder(container)).toEqual(["da1", "b1", "b2", "b3", "da2"]);
    expect(decorPos(latestCampus!, "da1")).toEqual({ x: 450, y: 120 });
    // Both actions are undoable.
    expect(undoButton(container)).toBeTruthy();
    fireEvent.click(undoButton(container)!);
    expect(renderOrder(container)).toEqual(["b1", "b2", "b3", "da2", "da1"]);
    fireEvent.click(undoButton(container)!);
    expect(renderOrder(container)).toEqual(["b1", "b2", "b3", "da1", "da2"]);
  });

  it("context menu reorders the right-clicked building AND decor via the same implementation", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    stubSvgRect(container);

    clickContextItem(container, buildingG(container, "#1e40af"), 100, 100, "Bring Forward");
    expect(renderOrder(container)).toEqual(["b2", "b1", "b3", "da1", "da2"]);

    clickContextItem(container, buildingG(container, "#1e40af"), 100, 100, "Bring to Front");
    expect(renderOrder(container)).toEqual(["b2", "b3", "da1", "da2", "b1"]);

    clickContextItem(container, buildingG(container, "#059669"), 700, 300, "Send to Back");
    expect(renderOrder(container)).toEqual(["b3", "b2", "da1", "da2", "b1"]);

    // Decor assets expose the same right-click ordering (cross-type).
    clickContextItem(container, decorG(container, "tree"), 450, 120, "Bring to Front");
    expect(renderOrder(container)).toEqual(["b3", "b2", "da2", "b1", "da1"]);

    clickContextItem(container, decorG(container, "tree"), 450, 120, "Send to Back");
    expect(renderOrder(container)).toEqual(["da1", "b3", "b2", "da2", "b1"]);
  });

  it("group drag still works after cross-type reordering (regression)", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    selectItem(buildingG(container, "#1e40af"), 100, 100);
    clickLayer(container, "Bring to Front");
    expect(renderOrder(container)).toEqual(["b2", "b3", "da1", "da2", "b1"]);

    // Multi-select b1 + b2 and drag as a group (anchor b1, +10 → grid snap +20).
    // b1 is already the active selected item after Bring to Front; Shift-click
    // b2 adds it to that selection.
    shiftClick(buildingG(container, "#7c3aed"), 260, 100);
    fireEvent.mouseDown(buildingG(container, "#1e40af"), { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(svg, { clientX: 110, clientY: 110 });
    fireEvent.mouseUp(svg);

    expect(buildingPos(latestCampus!, "b1")).toEqual({ x: 120, y: 120 });
    expect(buildingPos(latestCampus!, "b2")).toEqual({ x: 280, y: 120 });
    expect(buildingPos(latestCampus!, "b3")).toEqual({ x: 700, y: 300 });
    expect(decorPos(latestCampus!, "da1")).toEqual({ x: 450, y: 120 });
  });
});

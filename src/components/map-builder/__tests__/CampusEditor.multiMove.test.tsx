import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { useState } from "react";
import { CampusEditor } from "../CampusEditor";
import type { Campus } from "../types";

/**
 * Fixture: a 900x680 campus with three buildings and one decorative tree.
 * Building colors are distinct so tests can target specific <g> elements.
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
        // Placed well away from the selection so its edges never trigger an
        // unintended edge-snap of a dragged group (edge snap is 12px).
        id: "b3", name: "Building Three", code: "B3", category: "Academic", description: "",
        x: 700, y: 300, width: 120, height: 80, color: "#059669", expanded: false,
        floors: [{ id: "f3", buildingId: "b3", number: 1, label: "Ground Floor", rooms: [], paths: [] }],
      },
    ],
    decorAssets: [
      { id: "da1", type: "tree", x: 450, y: 120, rotation: 0, scale: 1 },
    ],
    markers: [],
    paths: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
}

/** Harness that keeps the campus in React state so onUpdate round-trips. */
function Harness({ campus: initialCampus, onCampusChange }: { campus?: Campus; onCampusChange?: (c: Campus) => void }) {
  const [campus, setCampus] = useState<Campus>(initialCampus ?? makeCampus);
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

/** Find a building <g> by its body fill color (outer g has no transform attr). */
function buildingG(container: HTMLElement, color: string): SVGGElement {
  const g = Array.from(container.querySelectorAll("g")).find(
    (el) => !el.hasAttribute("transform") && el.querySelector(`rect[fill="${color}"]`)
  );
  expect(g, `building g with fill ${color}`).toBeTruthy();
  return g as SVGGElement;
}

/** Find a decorative asset <g> by its stable data-decor-type attribute. */
function decorG(container: HTMLElement, type = "tree"): SVGGElement {
  const g = Array.from(container.querySelectorAll("g")).find(
    (el) => !el.hasAttribute("transform") && el.getAttribute("data-decor-type") === type
  );
  expect(g, `decor asset g (${type})`).toBeTruthy();
  return g as SVGGElement;
}

/** Toolbar undo/redo buttons are identified by their dynamic title. */
function undoButton(container: HTMLElement): HTMLButtonElement | null {
  return container.querySelector('button[title^="Undo"]');
}
function redoButton(container: HTMLElement): HTMLButtonElement | null {
  return container.querySelector('button[title^="Redo"]');
}
function toolbarCount(container: HTMLElement, count: number): HTMLElement | null {
  return container.querySelector(`[aria-label="${count} selected outdoor objects"]`);
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

/** Shift+click an item to add it to the multi-selection. */
function shiftClick(g: SVGGElement, clientX: number, clientY: number) {
  fireEvent.mouseDown(g, { clientX, clientY, shiftKey: true });
  fireEvent.mouseUp(g);
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

describe("CampusEditor multi-object movement", () => {
  it("moves a multi-selected group of buildings rigidly with one undo step and working redo", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);
    const g1 = buildingG(container, "#1e40af");
    const g2 = buildingG(container, "#7c3aed");

    // Select b1 + b2 via shift+click.
    shiftClick(g1, 100, 100);
    shiftClick(g2, 260, 100);

    // Plain-click a member of the selection: group is preserved, drag starts.
    fireEvent.mouseDown(g1, { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(svg, { clientX: 110, clientY: 110 });
    fireEvent.mouseUp(svg);

    expect(latestCampus).toBeTruthy();
    const moved = latestCampus!;
    // anchor 100+10=110 → snap 120 → both moved by (20,20); spacing preserved.
    expect(buildingPos(moved, "b1")).toEqual({ x: 120, y: 120 });
    expect(buildingPos(moved, "b2")).toEqual({ x: 280, y: 120 });
    // b3 (unselected) untouched.
    expect(buildingPos(moved, "b3")).toEqual({ x: 700, y: 300 });

    // Exactly one undo entry: one undo restores the group; the undo button
    // then reports nothing left to undo (it becomes untitled "Nothing to undo").
    expect(undoButton(container)).toBeTruthy();
    fireEvent.click(undoButton(container)!);
    expect(buildingPos(latestCampus!, "b1")).toEqual({ x: 100, y: 100 });
    expect(buildingPos(latestCampus!, "b2")).toEqual({ x: 260, y: 100 });
    expect(undoButton(container)).toBeNull(); // nothing further to undo

    // Redo re-applies the complete group movement.
    expect(redoButton(container)).toBeTruthy();
    fireEvent.click(redoButton(container)!);
    expect(buildingPos(latestCampus!, "b1")).toEqual({ x: 120, y: 120 });
    expect(buildingPos(latestCampus!, "b2")).toEqual({ x: 280, y: 120 });
  });

  it("normal click then Shift-click creates one real building group, not a partial visual selection", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);
    const g1 = buildingG(container, "#1e40af");
    const g2 = buildingG(container, "#7c3aed");

    // Select b1 normally, then add b2 with Shift. Previously b1 still looked
    // selected, but only b2 was in multiSelected, so dragging b1 moved it alone.
    fireEvent.mouseDown(g1, { clientX: 100, clientY: 100 });
    fireEvent.mouseUp(g1);
    shiftClick(g2, 260, 100);

    fireEvent.mouseDown(g1, { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(svg, { clientX: 110, clientY: 110 });
    fireEvent.mouseUp(svg);

    expect(latestCampus).toBeTruthy();
    expect(buildingPos(latestCampus!, "b1")).toEqual({ x: 120, y: 120 });
    expect(buildingPos(latestCampus!, "b2")).toEqual({ x: 280, y: 120 });
  });

  it("Shift-clicking a selected item toggles it out of the selection", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);
    const g1 = buildingG(container, "#1e40af");
    const g2 = buildingG(container, "#7c3aed");

    shiftClick(g1, 100, 100);
    shiftClick(g2, 260, 100);
    shiftClick(g2, 260, 100);

    fireEvent.mouseDown(g1, { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(svg, { clientX: 110, clientY: 110 });
    fireEvent.mouseUp(svg);

    expect(latestCampus).toBeTruthy();
    expect(buildingPos(latestCampus!, "b1")).toEqual({ x: 120, y: 120 });
    expect(buildingPos(latestCampus!, "b2")).toEqual({ x: 260, y: 100 });
  });

  it("does not compound group movement across multiple mousemove events in one gesture", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);
    const g1 = buildingG(container, "#1e40af");
    const g2 = buildingG(container, "#7c3aed");

    shiftClick(g1, 100, 100);
    shiftClick(g2, 260, 100);

    fireEvent.mouseDown(g1, { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(svg, { clientX: 110, clientY: 110 });
    fireEvent.mouseMove(svg, { clientX: 120, clientY: 120 });
    fireEvent.mouseUp(svg);

    expect(latestCampus).toBeTruthy();
    // Single-drag reference: start 100 + raw 20 => snap 120. The second move
    // must be recomputed from the gesture start, not added on top of the first.
    expect(buildingPos(latestCampus!, "b1")).toEqual({ x: 120, y: 120 });
    expect(buildingPos(latestCampus!, "b2")).toEqual({ x: 280, y: 120 });
  });

  it("moves a mixed selection of a building and a decorative asset together", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);
    const g1 = buildingG(container, "#1e40af");
    const da = decorG(container);

    shiftClick(g1, 100, 100);
    shiftClick(da, 450, 120);

    // Grab the DECOR asset (center 450,120) — group drag still moves the building.
    fireEvent.mouseDown(da, { clientX: 450, clientY: 120 });
    fireEvent.mouseMove(svg, { clientX: 460, clientY: 120 });
    fireEvent.mouseUp(svg);

    expect(latestCampus).toBeTruthy();
    const moved = latestCampus!;
    // decor center 450+10=460 (snap 460) → dx=10; building moves by the same delta.
    expect(decorPos(moved, "da1")).toEqual({ x: 460, y: 120 });
    expect(buildingPos(moved, "b1")).toEqual({ x: 110, y: 100 });
    // Relative distance preserved.
    expect(decorPos(moved, "da1").x - (buildingPos(moved, "b1").x + 60)).toBe(290);

    fireEvent.click(undoButton(container)!);
    expect(buildingPos(latestCampus!, "b1")).toEqual({ x: 100, y: 100 });
    expect(decorPos(latestCampus!, "da1")).toEqual({ x: 450, y: 120 });
  });

  it("multi-selection toolbar count includes decor and updates when decor is removed", () => {
    const { container } = render(<Harness />);
    stubSvgRect(container);
    const g1 = buildingG(container, "#1e40af");
    const g2 = buildingG(container, "#7c3aed");
    const da = decorG(container);

    shiftClick(g1, 100, 100);
    shiftClick(g2, 260, 100);
    shiftClick(da, 450, 120);
    expect(toolbarCount(container, 3)).toBeTruthy();
    expect(container.textContent).toContain("Multi-Select (3)");
    expect(container.textContent).toContain("Selected Objects");
    expect(container.textContent).not.toContain("Selected Buildings");
    expect(container.textContent).not.toContain("Building Batch Actions");

    shiftClick(da, 450, 120);
    expect(toolbarCount(container, 2)).toBeTruthy();
    expect(toolbarCount(container, 3)).toBeNull();
    expect(container.textContent).toContain("Multi-Select (2)");
    expect(container.textContent).toContain("Building Batch Actions");
  });

  it("aligns a mixed building/decor selection by bounds with one undo/redo step", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    stubSvgRect(container);
    const g1 = buildingG(container, "#1e40af");
    const da = decorG(container);

    shiftClick(g1, 100, 100);
    shiftClick(da, 450, 120);
    fireEvent.click(container.querySelector('button[aria-label="Align Left"]')!);

    expect(latestCampus).toBeTruthy();
    const alignedX = decorPos(latestCampus!, "da1").x;
    expect(alignedX).toBeLessThan(450);
    expect(buildingPos(latestCampus!, "b1")).toEqual({ x: 100, y: 100 });

    fireEvent.click(undoButton(container)!);
    expect(decorPos(latestCampus!, "da1")).toEqual({ x: 450, y: 120 });
    fireEvent.click(redoButton(container)!);
    expect(decorPos(latestCampus!, "da1").x).toBe(alignedX);
  });

  it("shows distribute controls for three or more selected outdoor objects", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    stubSvgRect(container);

    shiftClick(buildingG(container, "#1e40af"), 100, 100);
    shiftClick(buildingG(container, "#7c3aed"), 260, 100);
    shiftClick(decorG(container), 450, 120);

    const distribute = container.querySelector('button[aria-label="Distribute Horizontally"]');
    expect(distribute).toBeTruthy();
    fireEvent.click(distribute!);

    expect(latestCampus).toBeTruthy();
    expect(buildingPos(latestCampus!, "b1")).toEqual({ x: 100, y: 100 });
    expect(decorPos(latestCampus!, "da1")).toEqual({ x: 450, y: 120 });
    expect(buildingPos(latestCampus!, "b2").x).not.toBe(260);
  });

  it("PropertiesPanel batch delete removes selected decor and clears the toolbar count", async () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    stubSvgRect(container);

    shiftClick(buildingG(container, "#1e40af"), 100, 100);
    shiftClick(decorG(container), 450, 120);
    expect(toolbarCount(container, 2)).toBeTruthy();

    const panelDelete = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.trim() === "Delete All (2)");
    expect(panelDelete).toBeTruthy();
    fireEvent.click(panelDelete!);
    expect(container.textContent).toContain("2 objects");
    fireEvent.click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Delete All")!);

    expect(latestCampus).toBeTruthy();
    expect(latestCampus!.buildings.some((b) => b.id === "b1")).toBe(false);
    expect((latestCampus!.decorAssets ?? []).some((d) => d.id === "da1")).toBe(false);
    await waitFor(() => expect(toolbarCount(container, 2)).toBeNull());
  });

  it("rubber-band selection captures buildings AND decor assets and drags them together", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);
    const g1 = buildingG(container, "#1e40af");

    // Rubber-band over b1, b2 and the tree (band 50,50 → 600,300).
    fireEvent.mouseDown(svg, { clientX: 50, clientY: 50 });
    fireEvent.mouseMove(svg, { clientX: 600, clientY: 300 });
    fireEvent.mouseUp(svg);

    // Click-through on a captured member then drag: the whole mixed group moves.
    fireEvent.mouseDown(g1, { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(svg, { clientX: 110, clientY: 110 });
    fireEvent.mouseUp(svg);

    expect(latestCampus).toBeTruthy();
    const moved = latestCampus!;
    // anchor b1 100+10=110 → snap 120 → +20 for every captured member.
    expect(buildingPos(moved, "b1")).toEqual({ x: 120, y: 120 });
    expect(buildingPos(moved, "b2")).toEqual({ x: 280, y: 120 });
    expect(decorPos(moved, "da1")).toEqual({ x: 470, y: 140 });
    // b3 was outside the band and stays untouched.
    expect(buildingPos(moved, "b3")).toEqual({ x: 700, y: 300 });

    fireEvent.click(undoButton(container)!);
    expect(buildingPos(latestCampus!, "b1")).toEqual({ x: 100, y: 100 });
    expect(decorPos(latestCampus!, "da1")).toEqual({ x: 450, y: 120 });
  });

  it("rubber-band selection works in reverse direction and includes hidden editor ghosts", () => {
    const hiddenDecorCampus = makeCampus();
    hiddenDecorCampus.decorAssets = [{ ...hiddenDecorCampus.decorAssets![0], visible: false }];
    const { container } = render(<Harness campus={hiddenDecorCampus} onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);
    const g1 = buildingG(container, "#1e40af");

    // Bottom-right -> top-left over b1/b2 and the hidden tree. Hidden objects
    // are ghost-visible in the editor, so rubber-band may include them.
    fireEvent.mouseDown(svg, { clientX: 600, clientY: 300 });
    fireEvent.mouseMove(svg, { clientX: 50, clientY: 50 });
    fireEvent.mouseUp(svg);

    fireEvent.mouseDown(g1, { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(svg, { clientX: 110, clientY: 110 });
    fireEvent.mouseUp(svg);

    expect(latestCampus).toBeTruthy();
    expect(buildingPos(latestCampus!, "b1")).toEqual({ x: 120, y: 120 });
    expect(buildingPos(latestCampus!, "b2")).toEqual({ x: 280, y: 120 });
    expect(decorPos(latestCampus!, "da1")).toEqual({ x: 470, y: 140 });
    expect((latestCampus!.decorAssets ?? []).find((d) => d.id === "da1")!.visible).toBe(false);
  });

  it("dragging an unselected object does not move the previous selection", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);
    const g1 = buildingG(container, "#1e40af");
    const g2 = buildingG(container, "#7c3aed");
    const da = decorG(container);

    // Select b1 + b2, then drag the UNselected tree.
    shiftClick(g1, 100, 100);
    shiftClick(g2, 260, 100);
    fireEvent.mouseDown(da, { clientX: 450, clientY: 120 });
    fireEvent.mouseMove(svg, { clientX: 460, clientY: 120 });
    fireEvent.mouseUp(svg);

    expect(latestCampus).toBeTruthy();
    const moved = latestCampus!;
    // Only the tree moved; the previous selection is untouched.
    expect(decorPos(moved, "da1")).toEqual({ x: 460, y: 120 });
    expect(buildingPos(moved, "b1")).toEqual({ x: 100, y: 100 });
    expect(buildingPos(moved, "b2")).toEqual({ x: 260, y: 100 });
  });

  it("existing single-object movement still works", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);
    const g3 = buildingG(container, "#059669");

    fireEvent.mouseDown(g3, { clientX: 700, clientY: 300 });
    fireEvent.mouseMove(svg, { clientX: 715, clientY: 315 });
    fireEvent.mouseUp(svg);

    expect(latestCampus).toBeTruthy();
    const moved = latestCampus!;
    // 700+15=715 → snap 720; 300+15=315 → snap 320.
    expect(buildingPos(moved, "b3")).toEqual({ x: 720, y: 320 });
    expect(buildingPos(moved, "b1")).toEqual({ x: 100, y: 100 });
    expect(decorPos(moved, "da1")).toEqual({ x: 450, y: 120 });

    fireEvent.click(undoButton(container)!);
    expect(buildingPos(latestCampus!, "b3")).toEqual({ x: 700, y: 300 });
  });

  it("moves an asset-only selection left as one rigid group", () => {
    const initial = makeCampus();
    initial.buildings = [];
    initial.decorAssets = [
      { id: "tree-a", type: "tree", x: 520, y: 220, rotation: 0, scale: 1 },
      { id: "bench-a", type: "bench", x: 620, y: 220, rotation: 0, scale: 1 },
    ];
    const { container } = render(<Harness campus={initial} onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);
    const tree = decorG(container, "tree");
    const bench = decorG(container, "bench");
    shiftClick(tree, 520, 220);
    shiftClick(bench, 620, 220);
    fireEvent.mouseDown(tree, { clientX: 520, clientY: 220 });
    fireEvent.mouseMove(svg, { clientX: 460, clientY: 220 });
    fireEvent.mouseUp(svg);
    expect(latestCampus).toBeTruthy();
    expect(decorPos(latestCampus!, "tree-a").x).toBe(460);
    expect(decorPos(latestCampus!, "bench-a").x).toBe(560);
  });

  it("moves an asset-only selection left from the group surface without snapping to the center", () => {
    const initial = makeCampus();
    initial.buildings = [];
    initial.decorAssets = [
      { id: "tree-s", type: "tree", x: 520, y: 220, rotation: 0, scale: 1 },
      { id: "bench-s", type: "bench", x: 620, y: 220, rotation: 0, scale: 1 },
    ];
    const { container } = render(<Harness campus={initial} onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);
    shiftClick(decorG(container, "tree"), 520, 220);
    shiftClick(decorG(container, "bench"), 620, 220);
    const surface = container.querySelector("[data-testid='campus-group-drag-surface']") as SVGRectElement | null;
    expect(surface).toBeTruthy();
    fireEvent.mouseDown(surface!, { clientX: 570, clientY: 220 });
    fireEvent.mouseMove(svg, { clientX: 450, clientY: 220 });
    fireEvent.mouseUp(svg);
    expect(latestCampus).toBeTruthy();
    expect(decorPos(latestCampus!, "tree-s").x).toBe(400);
    expect(decorPos(latestCampus!, "bench-s").x).toBe(500);
  });

  it("edge-snaps a decor-only group to a nearby building as one rigid unit", () => {
    const initial = makeCampus();
    initial.buildings = [{ ...initial.buildings[0], x: 320, y: 160, width: 200, height: 120 }];
    initial.decorAssets = [
      { id: "tree-edge", type: "tree", x: 600, y: 260, rotation: 0, scale: 1 },
      { id: "bench-edge", type: "bench", x: 700, y: 260, rotation: 0, scale: 1 },
    ];
    const { container } = render(<Harness campus={initial} onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);
    shiftClick(decorG(container, "tree"), 600, 260);
    shiftClick(decorG(container, "bench"), 700, 260);
    fireEvent.mouseDown(decorG(container, "tree"), { clientX: 600, clientY: 260 });
    fireEvent.mouseMove(svg, { clientX: 560, clientY: 260 });
    fireEvent.mouseUp(svg);
    expect(latestCampus).toBeTruthy();
    // The group visible left edge (tree at x=600, width=72) would land at
    // 524 after the raw drag. It is within the shared 12-unit tolerance of
    // the building's right edge (520), so the whole group snaps by -44.
    expect(decorPos(latestCampus!, "tree-edge").x).toBe(556);
    expect(decorPos(latestCampus!, "bench-edge").x).toBe(656);
  });

});

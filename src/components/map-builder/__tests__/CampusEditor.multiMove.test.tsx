import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, cleanup, waitFor, screen, act, within } from "@testing-library/react";
import { useState } from "react";
import { CampusEditor } from "../CampusEditor";
import * as canvasComponents from "../Canvas";
import { isSpacePressed } from "../useCanvasControls";
import * as decorVisuals from "../DecorAssetVisual";
import * as outdoorVisuals from "../ReadonlyOutdoorVisuals";
import * as pathNetworkVisuals from "../OutdoorPathNetworkVisuals";
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
        floors: [{ id: "f1", buildingId: "b1", number: 1, label: "Ground Floor", rooms: [], paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [] }],
      },
      {
        id: "b2", name: "Building Two", code: "B2", category: "Academic", description: "",
        x: 260, y: 100, width: 120, height: 80, color: "#7c3aed", expanded: false,
        floors: [{ id: "f2", buildingId: "b2", number: 1, label: "Ground Floor", rooms: [], paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [] }],
      },
      {
        // Placed well away from the selection so its edges never trigger an
        // unintended edge-snap of a dragged group (edge snap is 12px).
        id: "b3", name: "Building Three", code: "B3", category: "Academic", description: "",
        x: 700, y: 300, width: 120, height: 80, color: "#059669", expanded: false,
        floors: [{ id: "f3", buildingId: "b3", number: 1, label: "Ground Floor", rooms: [], paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [] }],
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

  it("publishes one canonical Campus update for a multi-sample Building drag", () => {
    const updates: Campus[] = [];
    const { container } = render(<Harness onCampusChange={(campus) => updates.push(campus)} />);
    const svg = stubSvgRect(container);
    const building = buildingG(container, "#1e40af");
    fireEvent.mouseDown(building, { clientX: 100, clientY: 100 });
    for (let sample = 1; sample <= 50; sample += 1) {
      fireEvent.mouseMove(svg, { clientX: 100 + sample, clientY: 100 + sample, bubbles: true });
    }
    expect(updates).toHaveLength(0);
    fireEvent.mouseUp(svg);
    expect(updates).toHaveLength(1);
    expect(buildingPos(updates[0], "b1").x).toBeGreaterThan(100);
    expect(buildingPos(updates[0], "b1").y).toBeGreaterThan(100);
  });

  it("does not move the Campus camera when Space is pressed without a fresh pointer drag", async () => {
    const { container } = render(<Harness onCampusChange={() => {}} />);
    const svg = stubSvgRect(container);
    fireEvent.mouseMove(svg, { clientX: 310, clientY: 260, bubbles: true });
    const cameraGroups = Array.from(svg.querySelectorAll<SVGGElement>('g[transform*="scale("]'));
    const before = cameraGroups.map((group) => group.getAttribute("transform"));
    fireEvent.keyDown(window, { code: "Space", key: " " });
    fireEvent.mouseMove(svg, { clientX: 510, clientY: 420, bubbles: true });
    await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
    expect(cameraGroups.map((group) => group.getAttribute("transform"))).toEqual(before);
    fireEvent.keyUp(window, { code: "Space", key: " " });
    expect(cameraGroups.map((group) => group.getAttribute("transform"))).toEqual(before);
  });

  it.each([2, 6, 20])("keeps a %i-object selection compact and scrollable", (count) => {
    const campus = makeCampus();
    campus.buildings = Array.from({ length: count }, (_, index) => ({
      id: `multi-${index}`, name: `Building ${index + 1}`, code: `B${index + 1}`, category: "Academic", description: "",
      x: 18 + index * 42, y: 40, width: 30, height: 24, color: "#1e40af", expanded: false,
      floors: [{ id: `floor-${index}`, buildingId: `multi-${index}`, number: 1, label: "Ground Floor", rooms: [], paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [] }],
    }));
    const { container } = render(<Harness campus={campus} />);
    stubSvgRect(container);
    for (let index = 0; index < count; index += 1) {
      const building = container.querySelector(`[data-campus-building-id="multi-${index}"]`)!;
      shiftClick(building as SVGGElement, 33 + index * 42, 52);
    }

    const panel = container.querySelector('[data-testid="properties-panel"]')!;
    const list = container.querySelector('[data-testid="multi-select-object-list"]')!;
    expect(panel.className).toContain("h-fit");
    expect(panel.className).toContain("max-h-[calc(100%-24px)]");
    expect(panel.className).toContain("w-[min(340px,34vw)]");
    expect(list.className).toContain("max-h-[120px]");
    expect(list.className).toContain("overflow-y-auto");
    expect(container.querySelectorAll("[data-multi-select-object-row]")).toHaveLength(count);
    expect(container.querySelector('button[aria-label="Bring to Front"]')).toBeTruthy();
    expect(screen.getByRole("button", { name: `Delete All (${count})` })).toBeVisible();
  });

  it("gives Space-pan priority over a selected Pathway without changing its geometry", async () => {
    const campus = makeCampus();
    campus.paths = [{ id: "selected-path", points: [{ x: 440, y: 420 }, { x: 560, y: 420 }], type: "walkway", color: "#94a3b8", width: 10 }];
    const updates: Campus[] = [];
    const { container } = render(<Harness campus={campus} onCampusChange={(next) => updates.push(next)} />);
    const svg = stubSvgRect(container);
    const path = container.querySelector('[data-testid="campus-path"][data-path-id="selected-path"]') as SVGGElement;
    expect(path).toBeTruthy();
    fireEvent.keyDown(window, { code: "Space", key: " " });
    expect(isSpacePressed()).toBe(true);
    fireEvent.mouseDown(path, { button: 0, clientX: 440, clientY: 420, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 480, clientY: 455, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 520, clientY: 490, bubbles: true });
    await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });

    expect(svg.style.cursor).toBe("grabbing");
    expect(updates).toHaveLength(0);
    expect(campus.paths[0].points).toEqual([{ x: 440, y: 420 }, { x: 560, y: 420 }]);
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.keyUp(window, { code: "Space", key: " " });
    expect(updates).toHaveLength(0);
  });

  it("finishes an active Pathway gesture once when Space takes over, then pans only", async () => {
    const campus = makeCampus();
    campus.paths = [{ id: "dragged-path", points: [{ x: 440, y: 420 }, { x: 560, y: 420 }], type: "walkway", color: "#94a3b8", width: 10 }];
    const updates: Campus[] = [];
    const { container } = render(<Harness campus={campus} onCampusChange={(next) => updates.push(next)} />);
    const svg = stubSvgRect(container);
    const path = container.querySelector('[data-testid="campus-path"][data-path-id="dragged-path"]') as SVGGElement;

    fireEvent.mouseDown(path, { button: 0, clientX: 440, clientY: 420, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 460, clientY: 440, bubbles: true });
    await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
    expect(updates).toHaveLength(0);

    fireEvent.keyDown(window, { code: "Space", key: " " });
    expect(updates).toHaveLength(1);
    const committedWhileTakingPan = structuredClone(updates[0].paths[0].points);
    fireEvent.mouseMove(svg, { clientX: 520, clientY: 500, bubbles: true });
    await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.keyUp(window, { code: "Space", key: " " });

    expect(updates).toHaveLength(1);
    expect(updates[0].paths[0].points).toEqual(committedWhileTakingPan);
  });

  it("keeps a Building visibly under the pointer with Navigation Mode enabled, then commits once", async () => {
    const campus = makeCampus();
    campus.buildings[0].entrances = [{ id: "entrance-1", edge: "left", offset: 0.5, type: "main" } as never];
    campus.navNodes = [{ id: "entrance-node", type: "entrance", x: 100, y: 140, buildingId: "b1", entranceId: "entrance-1" } as never];
    const updates: Campus[] = [];
    const { container } = render(<Harness campus={campus} onCampusChange={(next) => updates.push(next)} />);
    const svg = stubSvgRect(container);
    fireEvent.click(screen.getByRole("button", { name: "Show and edit the walking network" }));
    // Navigation visibility/layer synchronization may reconcile existing
    // fixture state; measure only the subsequent user drag transaction.
    updates.length = 0;

    const building = buildingG(container, "#1e40af");
    fireEvent.mouseDown(building, { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(svg, { clientX: 130, clientY: 125, bubbles: true });
    await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
    const originalBuilding = container.querySelector('[data-campus-building-transform="b1"]') as SVGGElement;
    const previewBuilding = container.querySelector('[data-testid="campus-interaction-items"] [data-campus-building-transform="b1"]');
    expect(originalBuilding.getAttribute("visibility")).toBe("hidden");
    expect(previewBuilding?.getAttribute("transform")).toContain("translate(200 160)");
    const originalEntranceBadge = container.querySelector('[data-campus-entrance-badge="b1:entrance-1"]');
    const previewEntranceBadge = container.querySelector('[data-testid="campus-interaction-items"] [data-campus-entrance-badge="b1:entrance-1"]');
    expect(originalEntranceBadge?.getAttribute("visibility")).toBe("hidden");
    expect(previewEntranceBadge?.querySelector('[data-testid="entrance-direction-badge"]')?.getAttribute("transform"))
      .not.toBe(originalEntranceBadge?.querySelector('[data-testid="entrance-direction-badge"]')?.getAttribute("transform"));
    expect(updates).toHaveLength(0);
    fireEvent.mouseUp(svg);
    expect(updates).toHaveLength(1);
    expect(buildingPos(updates[0], "b1")).toEqual({ x: 140, y: 120 });
  });

  it("keeps a newly duplicated Building visibly following the pointer before release", async () => {
    const updates: Campus[] = [];
    const { container } = render(<Harness onCampusChange={(next) => updates.push(next)} />);
    const svg = stubSvgRect(container);
    const originalIds = new Set(["b1", "b2", "b3"]);
    const original = buildingG(container, "#1e40af");
    fireEvent.mouseDown(original, { button: 0, clientX: 160, clientY: 140, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.keyDown(window, { key: "d", ctrlKey: true });
    const copy = updates[updates.length - 1].buildings.find((building) => !originalIds.has(building.id))!;
    const copyElement = container.querySelector(`[data-campus-building-id="${copy.id}"]`) as SVGGElement;
    expect(copyElement).toBeTruthy();
    updates.length = 0;

    fireEvent.mouseDown(copyElement, { button: 0, clientX: copy.x + copy.width / 2, clientY: copy.y + copy.height / 2, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: copy.x + copy.width / 2 + 35, clientY: copy.y + copy.height / 2 + 25, bubbles: true });
    await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });

    const source = container.querySelector(`[data-campus-building-transform="${copy.id}"]`) as SVGGElement;
    const preview = container.querySelector(`[data-testid="campus-interaction-items"] [data-campus-building-transform="${copy.id}"]`) as SVGGElement;
    expect(source.getAttribute("visibility")).toBe("hidden");
    expect(preview).toBeTruthy();
    const previewTransform = preview.getAttribute("transform") ?? "";
    expect(previewTransform).not.toContain(`translate(${copy.x + copy.width / 2} ${copy.y + copy.height / 2})`);
    expect(updates).toHaveLength(0);

    fireEvent.mouseUp(svg, { bubbles: true });
    expect(updates).toHaveLength(1);
    const committed = updates[0].buildings.find((building) => building.id === copy.id)!;
    expect(previewTransform).toContain(`translate(${committed.x + copy.width / 2} ${committed.y + copy.height / 2})`);
    expect(container.querySelector(`[data-testid="campus-interaction-items"] [data-campus-building-transform="${copy.id}"]`)).toBeNull();
  });

  it("previews Exterior Emergency Stair movement on the imperative layer and commits once with undo/redo", async () => {
    const campus = makeCampus();
    campus.buildings[0].exteriorEmergencyStairs = [{
      id: "exterior-stair-1", buildingId: "b1", label: "Emergency Stair", state: "open",
      width: 28, height: 42, attachment: { edge: "right", offset: 0.5 }, servedFloorIds: ["f1"], sharedId: "shared-stair",
    } as never];
    const updates: Campus[] = [];
    const visualRender = vi.spyOn(outdoorVisuals.OutdoorEmergencyStairVisual, "type");
    const { container } = render(<Harness campus={campus} onCampusChange={(next) => { updates.push(next); latestCampus = next; }} />);
    const svg = stubSvgRect(container);
    // The initial mount may repair the fixture's derived stair graph once.
    // This assertion window measures only the user gesture transaction.
    updates.length = 0;
    const source = container.querySelector('[data-campus-stair-id="exterior-stair-1"]') as SVGGElement;
    expect(source).toBeTruthy();

    fireEvent.mouseDown(source, { button: 0, clientX: 244, clientY: 140, bubbles: true });
    const afterPointerDownRenders = visualRender.mock.calls.length;
    fireEvent.mouseMove(svg, { clientX: 160, clientY: 218, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 160, clientY: 218, bubbles: true });
    await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });

    const preview = container.querySelector('[data-testid="campus-interaction-items"] [data-campus-stair-id="exterior-stair-1"]') as SVGGElement;
    expect(source.getAttribute("visibility")).toBe("hidden");
    expect(preview?.getAttribute("transform")).toContain("translate(160,211)");
    expect(visualRender).toHaveBeenCalledTimes(afterPointerDownRenders);
    expect(updates).toHaveLength(0);

    fireEvent.mouseUp(svg);
    expect(updates).toHaveLength(1);
    expect(updates[0].buildings[0].exteriorEmergencyStairs?.[0].attachment).toEqual({ edge: "bottom", offset: 0.5 });
    expect(container.querySelector('[data-testid="campus-interaction-items"] [data-campus-stair-id="exterior-stair-1"]')).toBeNull();

    fireEvent.click(undoButton(container)!);
    expect(latestCampus?.buildings[0].exteriorEmergencyStairs?.[0].attachment).toEqual({ edge: "right", offset: 0.5 });
    fireEvent.click(redoButton(container)!);
    expect(latestCampus?.buildings[0].exteriorEmergencyStairs?.[0].attachment).toEqual({ edge: "bottom", offset: 0.5 });
    visualRender.mockRestore();
  });

  it("moves Navigation waypoint and issue visuals together before one release commit", async () => {
    const campus = makeCampus();
    campus.navNodes = [{ id: "free-waypoint", type: "outdoor", name: "Free Point", x: 450, y: 120 } as never];
    const updates: Campus[] = [];
    const { container } = render(<Harness campus={campus} onCampusChange={(next) => updates.push(next)} />);
    const svg = stubSvgRect(container);
    fireEvent.click(screen.getByRole("button", { name: "Show and edit the walking network" }));
    const node = container.querySelector('[data-campus-nav-node-id="free-waypoint"]') as SVGGElement;
    expect(node).toBeTruthy();
    fireEvent.mouseDown(node, { clientX: 450, clientY: 120 });
    fireEvent.mouseMove(svg, { clientX: 470, clientY: 140, bubbles: true });
    await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });

    const previewNode = container.querySelector('[data-testid="campus-interaction-items"] [data-campus-nav-node-id="free-waypoint"]');
    expect(node.getAttribute("visibility")).toBe("hidden");
    expect(previewNode?.getAttribute("transform")).toBe("translate(20 20)");
    const originalIssue = container.querySelector('[data-issue-object="navNode:free-waypoint"]');
    const previewIssue = container.querySelector('[data-testid="campus-interaction-items"] [data-issue-object="navNode:free-waypoint"]');
    if (originalIssue) {
      expect(originalIssue.getAttribute("visibility")).toBe("hidden");
      expect(previewIssue?.getAttribute("transform")).toBe("translate(20 20)");
    }
    expect(updates).toHaveLength(0);
    fireEvent.mouseUp(svg);
    expect(updates).toHaveLength(1);
    expect(updates[0].navNodes?.[0]).toMatchObject({ x: 470, y: 140 });
  });

  it("keeps a decorative asset drag transient until release and commits it once", () => {
    const updates: Campus[] = [];
    const { container } = render(<Harness onCampusChange={(campus) => updates.push(campus)} />);
    const svg = stubSvgRect(container);
    const tree = decorG(container);
    fireEvent.mouseDown(tree, { clientX: 450, clientY: 120 });
    for (let sample = 1; sample <= 50; sample += 1) {
      fireEvent.mouseMove(svg, { clientX: 450 + sample, clientY: 120 + sample, bubbles: true });
    }
    expect(updates).toHaveLength(0);
    fireEvent.mouseUp(svg);
    expect(updates).toHaveLength(1);
    expect(decorPos(updates[0], "da1")).not.toEqual({ x: 450, y: 120 });
  });

  it("commits a decorative rotation once after transient pointer samples", () => {
    const updates: Campus[] = [];
    const { container } = render(<Harness onCampusChange={(campus) => updates.push(campus)} />);
    const svg = stubSvgRect(container);
    fireEvent.mouseDown(decorG(container), { clientX: 450, clientY: 120 });
    fireEvent.mouseUp(svg);
    const handle = container.querySelector('[data-testid="decor-rotation-handle-hit"]') as SVGCircleElement;
    const startX = Number(handle.getAttribute("cx"));
    const startY = Number(handle.getAttribute("cy"));
    fireEvent.mouseDown(handle, { clientX: startX, clientY: startY });
    for (let sample = 1; sample <= 20; sample += 1) {
      fireEvent.mouseMove(svg, { clientX: startX + sample, clientY: startY - sample, bubbles: true });
    }
    expect(updates).toHaveLength(0);
    fireEvent.mouseUp(svg);
    expect(updates).toHaveLength(1);
    expect(updates[0].decorAssets?.[0].rotation).not.toBe(0);
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
    const dialog = screen.getByRole("dialog", { name: "Delete Selected Objects?" });
    expect(within(dialog).getByText(/2 objects/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete All" }));

    expect(latestCampus).toBeTruthy();
    expect(latestCampus!.buildings.some((b) => b.id === "b1")).toBe(false);
    expect((latestCampus!.decorAssets ?? []).some((d) => d.id === "da1")).toBe(false);
    await waitFor(() => expect(toolbarCount(container, 2)).toBeNull());
  });

  it("opens the compact Properties inspector for an ordinary decorative asset", () => {
    const { container } = render(<Harness />);
    stubSvgRect(container);
    fireEvent.mouseDown(decorG(container), { clientX: 450, clientY: 120 });
    expect(container.querySelector('[data-compact-decor-inspector="true"]')).toBeTruthy();
  });

  it("keeps unrelated authored Campus artwork stable while Building Properties updates", () => {
    const memoInner = (component: unknown) => vi.spyOn(component as { type: (...args: any[]) => unknown }, "type");
    const buildingArtwork = memoInner(outdoorVisuals.OutdoorBuildingVisual);
    const decorArtwork = memoInner(decorVisuals.DecorAssetArt);
    const { container } = render(<Harness />);
    stubSvgRect(container);
    const initialBuildingRenders = buildingArtwork.mock.calls.length;
    const initialDecorRenders = decorArtwork.mock.calls.length;

    fireEvent.mouseDown(buildingG(container, "#1e40af"), { button: 0, clientX: 150, clientY: 140 });
    expect(container.querySelector('[data-testid="properties-panel"]')).toBeTruthy();
    expect(buildingArtwork).toHaveBeenCalledTimes(initialBuildingRenders);
    expect(decorArtwork).toHaveBeenCalledTimes(initialDecorRenders);

    fireEvent.click(screen.getByRole("button", { name: /Style/ }));
    expect(buildingArtwork).toHaveBeenCalledTimes(initialBuildingRenders);
    expect(decorArtwork).toHaveBeenCalledTimes(initialDecorRenders);

    buildingArtwork.mockRestore();
    decorArtwork.mockRestore();
  });

  it("keeps cursor-only coordinate updates below the Campus scene render boundary", async () => {
    const canvasRender = vi.spyOn(canvasComponents, "Canvas");
    const { container } = render(<Harness />);
    const svg = stubSvgRect(container);
    const initialCanvasRenders = canvasRender.mock.calls.length;

    for (let sample = 0; sample < 20; sample += 1) {
      fireEvent.mouseMove(svg, { clientX: 300 + sample, clientY: 250 + sample, bubbles: true });
    }
    await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });

    expect(canvasRender).toHaveBeenCalledTimes(initialCanvasRenders);
    expect(container.querySelector('[data-testid="campus-canvas-cursor-position"]')?.textContent).toBe("X:319 Y:269");
    expect(container.querySelector('[data-testid="campus-cursor-preview-overlay"]')).toBeNull();
    canvasRender.mockRestore();
  });

  it("keeps authored Campus artwork stable across Connect preview frames", async () => {
    const campus = makeCampus();
    campus.paths = [{ id: "connect-preview-path", points: [{ x: 420, y: 390 }, { x: 560, y: 390 }], type: "walkway", color: "#94a3b8", width: 10 }];
    campus.navNodes = [
      { id: "connect-start", type: "outdoor", x: 500, y: 430 } as never,
      { id: "connect-target", type: "outdoor", x: 620, y: 500 } as never,
    ];
    const updates: Campus[] = [];
    const canvasRender = vi.spyOn(canvasComponents, "Canvas");
    const buildingArtwork = vi.spyOn(outdoorVisuals.OutdoorBuildingVisual, "type");
    const decorArtwork = vi.spyOn(decorVisuals.DecorAssetArt, "type");
    const pathGeometry = vi.spyOn(pathNetworkVisuals, "buildPathNetworkGeometry");
    const chainPath = vi.spyOn(pathNetworkVisuals, "buildChainPathD");
    const { container } = render(<Harness campus={campus} onCampusChange={(next) => updates.push(next)} />);
    const svg = stubSvgRect(container);
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    fireEvent.mouseDown(svg, { clientX: 500, clientY: 430, bubbles: true });
    const canvasAfterArming = canvasRender.mock.calls.length;
    const buildingAfterArming = buildingArtwork.mock.calls.length;
    const decorAfterArming = decorArtwork.mock.calls.length;
    const geometryAfterArming = pathGeometry.mock.calls.length;
    const chainAfterArming = chainPath.mock.calls.length;

    for (let sample = 0; sample < 8; sample += 1) {
      fireEvent.mouseMove(svg, { clientX: 660 + sample * 4, clientY: 520 + sample * 3, bubbles: true });
      await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
    }

    expect(canvasRender.mock.calls.length).toBeGreaterThan(canvasAfterArming);
    expect(buildingArtwork).toHaveBeenCalledTimes(buildingAfterArming);
    expect(decorArtwork).toHaveBeenCalledTimes(decorAfterArming);
    expect(pathGeometry).toHaveBeenCalledTimes(geometryAfterArming);
    expect(chainPath).toHaveBeenCalledTimes(chainAfterArming);
    expect(container.querySelector('[data-testid="nav-path-preview"] polyline')).toBeTruthy();
    expect(updates).toHaveLength(0);

    canvasRender.mockRestore();
    buildingArtwork.mockRestore();
    decorArtwork.mockRestore();
    pathGeometry.mockRestore();
    chainPath.mockRestore();
  });

  it("keeps authored Campus artwork stable through canvas resize preview frames", async () => {
    const campus = makeCampus();
    campus.paths = [{ id: "resize-preview-path", points: [{ x: 420, y: 390 }, { x: 560, y: 390 }], type: "walkway", color: "#94a3b8", width: 10 }];
    const updates: Campus[] = [];
    const canvasRender = vi.spyOn(canvasComponents, "Canvas");
    const buildingArtwork = vi.spyOn(outdoorVisuals.OutdoorBuildingVisual, "type");
    const decorArtwork = vi.spyOn(decorVisuals.DecorAssetArt, "type");
    const pathGeometry = vi.spyOn(pathNetworkVisuals, "buildPathNetworkGeometry");
    const chainPath = vi.spyOn(pathNetworkVisuals, "buildChainPathD");
    const { container } = render(<Harness campus={campus} onCampusChange={(next) => updates.push(next)} />);
    const svg = stubSvgRect(container);
    fireEvent.click(screen.getByTestId("canvas-settings-trigger"));
    fireEvent.click(screen.getByRole("button", { name: "Resize on canvas" }));
    const canvasAfterMode = canvasRender.mock.calls.length;
    const buildingAfterMode = buildingArtwork.mock.calls.length;
    const decorAfterMode = decorArtwork.mock.calls.length;
    const geometryAfterMode = pathGeometry.mock.calls.length;
    const chainAfterMode = chainPath.mock.calls.length;
    fireEvent.mouseDown(screen.getByTestId("canvas-resize-handle-e"), { clientX: 900, clientY: 340, bubbles: true });

    for (let sample = 0; sample < 8; sample += 1) {
      fireEvent.mouseMove(svg, { clientX: 910 + sample * 5, clientY: 340, bubbles: true });
      await act(async () => { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); });
    }

    expect(canvasRender.mock.calls.length).toBeGreaterThan(canvasAfterMode);
    expect(buildingArtwork).toHaveBeenCalledTimes(buildingAfterMode);
    expect(decorArtwork).toHaveBeenCalledTimes(decorAfterMode);
    expect(pathGeometry).toHaveBeenCalledTimes(geometryAfterMode);
    expect(chainPath).toHaveBeenCalledTimes(chainAfterMode);
    expect(updates).toHaveLength(0);
    fireEvent.keyDown(document, { key: "Escape" });

    canvasRender.mockRestore();
    buildingArtwork.mockRestore();
    decorArtwork.mockRestore();
    pathGeometry.mockRestore();
    chainPath.mockRestore();
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

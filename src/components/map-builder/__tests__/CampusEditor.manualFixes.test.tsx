import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { useState } from "react";
import { CampusEditor } from "../CampusEditor";
import type { Campus } from "../types";

/**
 * Regression tests for the B2 manual-test fix pass:
 *  - fresh-campus first placement uses the real pointer position (no top-left stick)
 *  - decor assets show a visible multi-selection highlight
 *  - mixed building + decor group drag
 *  - issue/overlap badge renders ABOVE the selection overlay
 *  - "Building Type" is gone from the properties sidebar
 *  - the guided tutorial is replaced by a compact Keyboard-shortcuts help control
 *  - the bottom instruction pill is gone
 */

function makeCampus(overrides: Partial<Campus> = {}): Campus {
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
    ],
    decorAssets: [
      { id: "da1", type: "tree", x: 450, y: 120, rotation: 0, scale: 1 },
      { id: "da2", type: "bench", x: 550, y: 200, rotation: 0, scale: 1 },
    ],
    markers: [],
    paths: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    ...overrides,
  };
}

function Harness({ campus, onCampusChange }: { campus?: Campus; onCampusChange?: (c: Campus) => void }) {
  const [c, setC] = useState<Campus>(campus ?? makeCampus);
  return (
    <CampusEditor
      campus={c}
      onBack={() => {}}
      onUpdate={(next) => { onCampusChange?.(next); setC(next); }}
      onPublish={() => {}}
      onOpenFloor={() => {}}
      onAddBuilding={() => {}}
    />
  );
}

let latestCampus: Campus | null = null;

function canvasSvg(container: HTMLElement, viewBox = "0 0 900 680"): SVGSVGElement {
  const svg = Array.from(container.querySelectorAll("svg")).find((s) => s.getAttribute("viewBox") === viewBox);
  expect(svg, `canvas svg with viewBox ${viewBox}`).toBeTruthy();
  return svg as SVGSVGElement;
}

function stubSvgRect(container: HTMLElement, viewBox = "0 0 900 680"): SVGSVGElement {
  const svg = canvasSvg(container, viewBox);
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

function selectItem(g: SVGGElement, clientX: number, clientY: number) {
  fireEvent.mouseDown(g, { clientX, clientY });
  fireEvent.mouseUp(g);
}

function shiftClick(g: SVGGElement, clientX: number, clientY: number) {
  fireEvent.mouseDown(g, { clientX, clientY, shiftKey: true });
  fireEvent.mouseUp(g);
}

beforeEach(() => {
  latestCampus = null;
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("fresh-campus placement", () => {
  it("places a building exactly where the admin clicks when the campus dims are transiently unset (0×0 → normalized 900×680)", () => {
    // Simulates a just-created campus whose canvas dims have not been hydrated
    // yet — the exact manual failure where objects stuck near the top-left.
    const { container } = render(
      <Harness campus={makeCampus({ canvasW: 0, canvasH: 0 })} onCampusChange={(c) => { latestCampus = c; }} />
    );
    const svg = stubSvgRect(container); // editor normalized the viewBox to 900×680
    fireEvent.keyDown(window, { key: "b" }); // switch to the Building tool

    fireEvent.mouseDown(svg, { clientX: 450, clientY: 340 });
    fireEvent.mouseUp(svg, { clientX: 450, clientY: 340 });

    expect(latestCampus).toBeTruthy();
    expect(latestCampus!.buildings).toHaveLength(3); // fixture (2) + placed (1)
    const nb = latestCampus!.buildings[2];
    // Center click → centered building (never 0,0).
    expect(nb.x).toBe(450);
    expect(nb.y).toBe(340);
    expect(nb.width).toBe(40);
    expect(nb.height).toBe(30);
  });
});

describe("multi-selection", () => {
  it("shows a visible selection highlight on a multi-selected decor asset", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    stubSvgRect(container);

    selectItem(buildingG(container, "#1e40af"), 100, 100);
    shiftClick(decorG(container, "tree"), 450, 120);

    // The clicked decor member is the active selection, so it shows the accent
    // selection ring while the whole building+decor group is selected.
    const treeG = decorG(container, "tree");
    const ring = treeG.querySelector('[data-testid="decor-selection-outline"]');
    expect(ring).toBeTruthy();
  });

  it("dragging any selected member (a decor asset) moves the whole mixed group rigidly", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    const svg = stubSvgRect(container);

    shiftClick(buildingG(container, "#1e40af"), 100, 100);
    shiftClick(decorG(container, "tree"), 450, 120);

    // Drag the TREE (a decor member) by (+40,+40); grid snapping applies the
    // same rigid translation to every member.
    fireEvent.mouseDown(decorG(container, "tree"), { clientX: 450, clientY: 120 });
    fireEvent.mouseMove(svg, { clientX: 490, clientY: 160 });
    fireEvent.mouseUp(svg);

    expect(latestCampus).toBeTruthy();
    const b1 = latestCampus!.buildings.find((b) => b.id === "b1")!;
    const da1 = (latestCampus!.decorAssets ?? []).find((d) => d.id === "da1")!;
    // Rigid: identical translation on both members.
    expect(b1.x - 100).toBe(da1.x - 450);
    expect(b1.y - 100).toBe(da1.y - 120);
    // Non-selected objects untouched.
    expect(latestCampus!.buildings.find((b) => b.id === "b2")!.x).toBe(260);
    expect((latestCampus!.decorAssets ?? []).find((d) => d.id === "da2")!.x).toBe(550);
  });
});

describe("hidden object editor ghosting", () => {
  it("ghost-renders hidden buildings and keeps them selectable in the admin editor", () => {
    const campus = makeCampus();
    campus.buildings = [{ ...campus.buildings[0], visible: false }, campus.buildings[1]];
    const { container } = render(<Harness campus={campus} onCampusChange={(c) => { latestCampus = c; }} />);
    stubSvgRect(container);

    const hiddenBuilding = buildingG(container, "#1e40af");
    expect(hiddenBuilding.getAttribute("data-hidden")).toBe("true");

    selectItem(hiddenBuilding, 100, 100);
    expect(hiddenBuilding.querySelector('rect[stroke="var(--accent)"]')).toBeTruthy();
    expect(latestCampus).toBeNull();
  });

  it("ghost-renders hidden decor, keeps visible false, and uses the tightened outline", () => {
    const campus = makeCampus();
    campus.decorAssets = [{ ...campus.decorAssets![0], visible: false }, campus.decorAssets![1]];
    const { container } = render(<Harness campus={campus} onCampusChange={(c) => { latestCampus = c; }} />);
    stubSvgRect(container);

    const hiddenDecor = decorG(container, "tree");
    expect(hiddenDecor.getAttribute("data-hidden")).toBe("true");

    selectItem(hiddenDecor, 450, 120);
    const outline = hiddenDecor.querySelector('[data-testid="decor-selection-outline"]');
    expect(outline).toBeTruthy();
    expect(Number(outline!.getAttribute("width"))).toBeLessThan(220);
    expect(Number(outline!.getAttribute("height"))).toBeLessThan(220);
    expect((campus.decorAssets ?? []).find((d) => d.id === "da1")!.visible).toBe(false);
    expect(latestCampus).toBeNull();
  });
});

describe("issue indicator z-order", () => {
  it("the OVERLAP badge renders AFTER the selection outline (never covered by it)", () => {
    const { container } = render(
      <Harness
        campus={makeCampus({
          // Overlapping buildings trigger the overlap issue badge.
          buildings: [
            {
              id: "b1", name: "Building One", code: "B1", category: "Academic", description: "",
              x: 100, y: 100, width: 120, height: 80, color: "#1e40af", expanded: false,
              floors: [],
            },
            {
              id: "b2", name: "Building Two", code: "B2", category: "Academic", description: "",
              x: 150, y: 120, width: 120, height: 80, color: "#7c3aed", expanded: false,
              floors: [],
            },
          ],
          decorAssets: [],
        })}
      />
    );
    stubSvgRect(container);

    selectItem(buildingG(container, "#1e40af"), 100, 100);

    const g1 = buildingG(container, "#1e40af");
    const badge = g1.querySelector('rect[fill="#dc2626"]');
    const selOutline = g1.querySelector('rect[stroke="var(--accent)"]');
    expect(badge, "overlap badge present").toBeTruthy();
    expect(selOutline, "selection outline present").toBeTruthy();
    // The badge must come AFTER the selection outline in document order
    // (later siblings paint on top in SVG).
    const rel = badge!.compareDocumentPosition(selOutline!);
    expect(rel & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });
});

describe("properties panel cleanup", () => {
  it("does not show a Building Type selector for a selected building", () => {
    const { container } = render(<Harness />);
    stubSvgRect(container);
    selectItem(buildingG(container, "#1e40af"), 100, 100);

    expect(Array.from(container.querySelectorAll("label")).some((l) => l.textContent?.trim() === "Building Type")).toBe(false);
    // Useful basic info remains.
    expect(Array.from(container.querySelectorAll("label")).some((l) => l.textContent?.trim() === "Name")).toBe(true);
  });
});

describe("tutorial / help UI", () => {
  it("the guided tutorial is gone and a compact Keyboard-shortcuts help button exists in the toolbar", () => {
    localStorage.removeItem("plv-mb-tutorial-done"); // must not matter anymore
    const { container } = render(<Harness />);
    stubSvgRect(container);

    expect(container.textContent).not.toContain("Welcome to the Map Builder");
    expect(container.textContent).not.toContain("walk through creating your first building");

    const helpBtn = container.querySelector('button[aria-label="Keyboard shortcuts"]');
    expect(helpBtn).toBeTruthy();
    // Clicking it opens the shortcut cheat sheet.
    fireEvent.click(helpBtn!);
    expect(container.textContent?.toLowerCase()).toContain("keyboard shortcuts");
  });

  it("the bottom instruction pill is gone", () => {
    const { container } = render(<Harness />);
    stubSvgRect(container);
    expect(container.textContent).not.toContain("Click a building to edit its name, floors, and properties");
    expect(container.textContent).not.toContain("Shift+click to select multiple");
  });
});

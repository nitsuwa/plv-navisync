import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { toast } from "sonner";
import { CampusEditor } from "../CampusEditor";
import type { Campus, NavigationNode } from "../types";

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
    publishStatus: "published",
    visibleToStudents: false,
    features: { indoorNavigation: true, accessibilityNavigation: true, emergencyRoutes: true, issueReporting: true },
    canvasW: 900,
    canvasH: 680,
    settings: { accessibility: true, emergency: true, eventLayer: true, gps: true },
    buildings: [{
      id: "b1",
      name: "Building One",
      code: "B1",
      category: "Academic",
      description: "",
      x: 100,
      y: 100,
      width: 120,
      height: 80,
      color: "#1e40af",
      expanded: false,
      floors: [{ id: "f1", buildingId: "b1", number: 1, label: "Ground Floor", rooms: [], paths: [] }],
    }],
    markers: [],
    paths: [],
    navNodes: [],
    navEdges: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
}

function Harness({ onCampusChange, initialCampus }: { onCampusChange?: (c: Campus) => void; initialCampus?: Campus }) {
  const [campus, setCampus] = useState<Campus>(() => initialCampus ?? makeCampus());
  return (
    <CampusEditor
      campus={campus}
      onBack={() => {}}
      onUpdate={(c) => { onCampusChange?.(c); setCampus(c); }}
      onPublish={() => {}}
      onOpenFloor={() => {}}
      onAddBuilding={() => {}}
      savedSnapshot={JSON.stringify(initialCampus ?? makeCampus())}
    />
  );
}

let infoSpy: ReturnType<typeof vi.spyOn>;
let successSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  infoSpy = vi.spyOn(toast, "info").mockImplementation(() => "" as never);
  successSpy = vi.spyOn(toast, "success").mockImplementation(() => "" as never);
});

function canvasSvg(container: HTMLElement): SVGSVGElement {
  const svgs = Array.from(container.querySelectorAll("svg")).filter((s) => s.getAttribute("viewBox") === "0 0 900 680");
  const svg = svgs[svgs.length - 1];
  expect(svg).toBeTruthy();
  Object.defineProperty(svg, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ left: 0, top: 0, right: 900, bottom: 680, width: 900, height: 680, x: 0, y: 0, toJSON: () => ({}) }),
  });
  return svg as SVGSVGElement;
}

function openNavigationLayer(container: HTMLElement): SVGSVGElement {
  fireEvent.click(screen.getByText("Navigation"));
  return canvasSvg(container);
}

function navNodeAt(container: HTMLElement, x: number, y: number): SVGGElement {
  const g = Array.from(container.querySelectorAll<SVGGElement>("[data-testid='nav-node']")).find((el) => {
    const c = el.querySelector("circle");
    return c && Math.abs(Number(c.getAttribute("cx")) - x) < 2 && Math.abs(Number(c.getAttribute("cy")) - y) < 2;
  });
  expect(g, `nav node at (${x}, ${y})`).toBeTruthy();
  return g!;
}

function seededCampus(): Campus {
  const campus = makeCampus();
  const nodes: NavigationNode[] = [
    { id: "nnA", name: "Gate A", type: "outdoor", x: 200, y: 200, campusId: "c1", accessible: true, color: "#16a34a" },
    { id: "nnB", name: "Gate B", type: "outdoor", x: 300, y: 200, campusId: "c1", accessible: true, color: "#16a34a" },
  ];
  campus.navNodes = nodes;
  campus.navEdges = [{ id: "ne1", startNodeId: "nnA", endNodeId: "nnB", direction: "bidirectional", accessible: true, emergencySafe: true, closed: false }];
  return campus;
}

function buildingGroup(container: HTMLElement): SVGGElement {
  const rect = Array.from(container.querySelectorAll<SVGRectElement>("rect")).find(
    (r) => r.getAttribute("fill") === "#1e40af"
  );
  expect(rect, "building body rect").toBeTruthy();
  return rect!.parentElement as SVGGElement;
}

function markerGroup(container: HTMLElement, x: number, y: number): SVGGElement {
  const g = Array.from(container.querySelectorAll<SVGGElement>("g")).find((el) => {
    const c = Array.from(el.children).find(
      (child) => child.tagName === "circle" && Math.abs(Number(child.getAttribute("cx")) - x) < 2 && Math.abs(Number(child.getAttribute("cy")) - y) < 2 && child.getAttribute("r") === "13"
    );
    return !!c;
  });
  expect(g, `marker at (${x}, ${y})`).toBeTruthy();
  return g!;
}

afterEach(cleanup);

describe("B5 Phase 2.1 — outdoor Campus copy / paste / duplicate", () => {
  it("Ctrl+C / Ctrl+V duplicates a selected building with fresh IDs, entrance remap, and one history undo", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness onCampusChange={(c) => { latest = c; }} />);
    const svg = canvasSvg(container);
    // Select the building.
    fireEvent.mouseDown(buildingGroup(container), { clientX: 160, clientY: 140, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.keyDown(window, { key: "c", ctrlKey: true });
    fireEvent.keyDown(window, { key: "v", ctrlKey: true });

    expect(latest!.buildings).toHaveLength(2);
    const copy = latest!.buildings.find((b) => b.id !== "b1")!;
    expect(copy.name).toBe("Building One (copy)");
    expect(copy.id).not.toBe("b1");
    expect(copy.x).toBe(125);
    expect(copy.y).toBe(125);
    expect(copy.entrances).toEqual([]);
    // Undo restores the original single building (one history action for paste).
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(latest!.buildings).toHaveLength(1);
  });

  it("Ctrl+D duplicates a selected building immediately with a fresh id", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness onCampusChange={(c) => { latest = c; }} />);
    const svg = canvasSvg(container);
    fireEvent.mouseDown(buildingGroup(container), { clientX: 160, clientY: 140, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.keyDown(window, { key: "d", ctrlKey: true });

    expect(latest!.buildings).toHaveLength(2);
    expect(latest!.buildings.find((b) => b.id !== "b1")!.name).toBe("Building One (copy)");
  });

  it("Ctrl+C copies a marker and Ctrl+V pastes it offset with a fresh id", () => {
    let latest: Campus | undefined;
    const campus = makeCampus();
    campus.markers = [{ id: "mk1", name: "Info Booth", x: 420, y: 300, color: "#dc2626" }];
    const { container } = render(<Harness onCampusChange={(c) => { latest = c; }} initialCampus={campus} />);
    // Click the marker element directly to select it.
    fireEvent.mouseDown(markerGroup(container, 420, 300), { bubbles: true });
    fireEvent.keyDown(window, { key: "c", ctrlKey: true });
    fireEvent.keyDown(window, { key: "v", ctrlKey: true });

    expect(latest!.markers).toHaveLength(2);
    const copy = latest!.markers.find((m) => m.id !== "mk1")!;
    expect(copy.name).toBe("Info Booth");
    expect(copy.id).not.toBe("mk1");
    expect(copy.x).toBe(445);
    expect(copy.y).toBe(325);
  });

  it("copy/paste/duplicate shortcuts never hijack native text behavior inside inputs", () => {
    const { container } = render(<Harness />);
    const svg = canvasSvg(container);
    // Select the building so a selection exists, then focus a text input.
    fireEvent.mouseDown(buildingGroup(container), { clientX: 160, clientY: 140, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(window, { key: "c", ctrlKey: true });
    fireEvent.keyDown(window, { key: "v", ctrlKey: true });
    fireEvent.keyDown(window, { key: "d", ctrlKey: true });
    document.body.removeChild(input);
    // No canvas mutation happened while the input had focus — the original
    // building body rect is still the only one rendered.
    expect(container.querySelectorAll('rect[fill="#1e40af"]')).toHaveLength(1);
  });

  it("pasting with an empty clipboard informs instead of mutating", () => {
    const { container } = render(<Harness />);
    fireEvent.keyDown(window, { key: "v", ctrlKey: true });
    expect(container.querySelectorAll('rect[fill="#1e40af"]')).toHaveLength(1);
    expect(infoSpy).toHaveBeenCalled();
  });
});

describe("B5 Phase 2.1 — outdoor Navigation copy / paste / duplicate", () => {
  it("Ctrl+C / Ctrl+V duplicates free waypoints with fresh ids and remaps edge endpoints", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness onCampusChange={(c) => { latest = c; }} initialCampus={seededCampus()} />);
    const svg = openNavigationLayer(container);
    // Select both free waypoints via Shift-click.
    fireEvent.keyDown(window, { key: "v" }); // select tool
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(navNodeAt(container, 300, 200), { shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.keyDown(window, { key: "c", ctrlKey: true });
    fireEvent.keyDown(window, { key: "v", ctrlKey: true });

    expect(latest!.navNodes).toHaveLength(4);
    expect(latest!.navEdges).toHaveLength(2);
    const newNodes = latest!.navNodes.filter((n) => n.id !== "nnA" && n.id !== "nnB");
    expect(newNodes).toHaveLength(2);
    const newEdge = latest!.navEdges.find((e) => e.id !== "ne1")!;
    // The pasted edge must connect the two NEW nodes, never the originals.
    expect(newEdge.startNodeId).not.toBe("nnA");
    expect(newEdge.endNodeId).not.toBe("nnB");
    const ids = new Set(newNodes.map((n) => n.id));
    expect(ids.has(newEdge.startNodeId)).toBe(true);
    expect(ids.has(newEdge.endNodeId)).toBe(true);
    // Pasted nodes sit at a +25 world offset.
    const nA = newNodes.find((n) => Math.abs(n.x - 225) < 2)!;
    expect(nA).toBeTruthy();
  });

  it("Ctrl+D duplicates selected free waypoints with remapped edges in one action", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness onCampusChange={(c) => { latest = c; }} initialCampus={seededCampus()} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "v" });
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(navNodeAt(container, 300, 200), { shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.keyDown(window, { key: "d", ctrlKey: true });

    expect(latest!.navNodes).toHaveLength(4);
    expect(latest!.navEdges).toHaveLength(2);
  });

  // ── B5 Phase 2.2: cross-editor Remove/Erase cursor parity ──

  it("Campus Erase tool uses the not-allowed cursor (distinct from Select)", () => {
    const { container } = render(<Harness />);
    const svg = canvasSvg(container);
    fireEvent.click(screen.getByRole("button", { name: /Erase/ }));
    expect(svg.style.cursor).toBe("not-allowed");
    // Switch back to Select.
    fireEvent.click(screen.getByRole("button", { name: /Select/ }));
    expect(svg.style.cursor).toBe("default");
  });

  it("Outdoor Navigation Remove keeps the not-allowed cursor on the canvas", () => {
    const { container } = render(<Harness />);
    const svg = openNavigationLayer(container);
    fireEvent.click(screen.getByRole("button", { name: /Remove/ }));
    expect(svg.style.cursor).toBe("not-allowed");
  });

  it("copying an entrance-linked waypoint is excluded from the copied free set", () => {
    const campus = seededCampus();
    // Turn Gate A into an entrance-linked node (derived geometry, not copyable).
    campus.navNodes = campus.navNodes.map((n) => (n.id === "nnA" ? { ...n, entranceId: "ent1", buildingId: "b1" } : n));
    const { container } = render(<Harness initialCampus={campus} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "v" });
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.keyDown(window, { key: "c", ctrlKey: true });
    // Nothing free is selected — copy must not create anything.
    fireEvent.keyDown(window, { key: "v", ctrlKey: true });
    // Still exactly the two seeded nodes on the canvas.
    expect(container.querySelectorAll("[data-testid='nav-node']")).toHaveLength(2);
    expect(infoSpy).toHaveBeenCalled();
  });
});

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { toast } from "sonner";
import { CampusEditor } from "../CampusEditor";
import { BUILDING_TYPES, DECOR_ASSET_MAP, LAYERS } from "../constants";
import type { Campus, NavigationNode, NavigationEdge, CampusDecorAsset } from "../types";

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

// Sonner's <Toaster /> does not mount its portal in jsdom, so toasts are
// asserted by spying on the sonner toast API the app calls through useToast.
let warningSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warningSpy = vi.spyOn(toast, "warning").mockImplementation(() => "" as never);
});

function canvasSvg(container: HTMLElement): SVGSVGElement {
  // The editor stays mounted across layer switches (single canvas svg), but
  // picking the LAST svg matching the canvas viewBox stays robust either way.
  const svgs = Array.from(container.querySelectorAll("svg")).filter((s) => s.getAttribute("viewBox") === "0 0 900 680");
  const svg = svgs[svgs.length - 1];
  expect(svg).toBeTruthy();
  Object.defineProperty(svg, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ left: 0, top: 0, right: 900, bottom: 680, width: 900, height: 680, x: 0, y: 0, toJSON: () => ({}) }),
  });
  return svg as SVGSVGElement;
}

/** Switch to the Navigation layer via its tab, then return the ACTIVE editor svg. */
function openNavigationLayer(container: HTMLElement): SVGSVGElement {
  fireEvent.click(screen.getByText("Navigation"));
  return canvasSvg(container);
}

/** Find the rendered nav-node group at (x, y). */
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
  return campus;
}

/** The rendered building group (its body rect uses the seeded color #1e40af). */
function buildingGroup(container: HTMLElement): SVGGElement {
  const rect = Array.from(container.querySelectorAll<SVGRectElement>("rect")).find(
    (r) => r.getAttribute("fill") === "#1e40af"
  );
  expect(rect, "building body rect").toBeTruthy();
  return rect!.parentElement as SVGGElement;
}

function buildingGroupByFill(container: HTMLElement, fill: string): SVGGElement {
  const rect = Array.from(container.querySelectorAll<SVGRectElement>("rect")).find(
    (r) => r.getAttribute("fill") === fill
  );
  expect(rect, `building body rect ${fill}`).toBeTruthy();
  return rect!.parentElement as SVGGElement;
}

function decorGroup(container: HTMLElement, type = "tree"): SVGGElement {
  const group = container.querySelector<SVGGElement>(`[data-decor-type='${type}']`);
  expect(group, `${type} decor group`).toBeTruthy();
  return group!;
}

function groupOutline(container: HTMLElement): SVGRectElement {
  const outline = container.querySelector<SVGRectElement>("[data-testid='campus-group-outline']");
  expect(outline, "campus group outline").toBeTruthy();
  return outline!;
}

function groupDragSurface(container: HTMLElement): SVGRectElement {
  const surface = container.querySelector<SVGRectElement>("[data-testid='campus-group-drag-surface']");
  expect(surface, "campus group drag surface").toBeTruthy();
  return surface!;
}

function rectNumber(rect: SVGRectElement, attr: "x" | "y" | "width" | "height"): number {
  return Number(rect.getAttribute(attr));
}

function campusWithOutdoorSelectionObjects(): Campus {
  const campus = makeCampus();
  campus.buildings = [
    campus.buildings[0],
    {
      ...campus.buildings[0],
      id: "b2",
      name: "Building Two",
      code: "B2",
      x: 360,
      y: 170,
      width: 90,
      height: 70,
      color: "#0f766e",
      floors: [],
    },
  ];
  campus.decorAssets = [
    { id: "tree1", type: "tree", x: 280, y: 160, rotation: 0, scale: 1 },
    { id: "rot1", type: "bench", x: 520, y: 220, rotation: 45, scale: 1.4 },
    { id: "ground1", type: "ground-area", x: 500, y: 390, rotation: 0, width: 220, height: 120, groundType: "grass", zOrder: -1000 },
  ];
  campus.navNodes = [
    { id: "nnA", name: "Gate A", type: "outdoor", x: 200, y: 200, campusId: "c1", accessible: true, color: "#16a34a" },
    { id: "nnB", name: "Gate B", type: "outdoor", x: 300, y: 200, campusId: "c1", accessible: true, color: "#16a34a" },
  ];
  return campus;
}

afterEach(cleanup);

describe("B5 Phase 1 — navigation graph authoring", () => {
  it("creates a selectable waypoint node with the Waypoint (marker) tool in the Navigation layer", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "m" }); // marker → waypoint tool
    fireEvent.mouseDown(svg, { clientX: 350, clientY: 250, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(latest!.navNodes).toHaveLength(1);
    expect(latest!.navNodes![0]).toMatchObject({ name: "Waypoint", type: "outdoor", x: 350, y: 250, campusId: "c1", accessible: true });
    // Visible node + waypoint properties panel
    expect(navNodeAt(container, 350, 250)).toBeTruthy();
    expect(screen.getByTestId("nav-node-props")).toBeTruthy();
  });

  it("moves a waypoint node with the Select tool (one gesture)", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={seededCampus()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "v" }); // select
    const g = navNodeAt(container, 200, 200);
    fireEvent.mouseDown(g, { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 240, clientY: 220, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const moved = latest!.navNodes!.find((n) => n.id === "nnA")!;
    expect(moved).toMatchObject({ x: 240, y: 220 });
  });

  it("connects two existing waypoints with the Path tool (edge created + selected)", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={seededCampus()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "p" }); // path tool
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(navNodeAt(container, 300, 200), { clientX: 300, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(latest!.navEdges).toHaveLength(1);
    expect(latest!.navEdges![0]).toMatchObject({ startNodeId: "nnA", endNodeId: "nnB", bidirectional: true, distance: 100 });
    expect(screen.getByTestId("nav-edge")).toBeTruthy();
  });

  it("Connect empty-space clicks do nothing before a source; after a source they pin bends", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={seededCampus()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "p" });
    fireEvent.mouseDown(svg, { clientX: 260, clientY: 260, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(latest).toBeUndefined();

    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(svg, { clientX: 260, clientY: 260, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(navNodeAt(container, 300, 200), { clientX: 300, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(latest!.navNodes).toHaveLength(2);
    expect(latest!.navEdges).toHaveLength(1);
    // B5 Phase 6.9 (Floor Editor parity): ONE diagonal empty-space click at
    // (260,260) pins the FULL preview shape — the auto-L corner (260,200) AND
    // the click point (260,260) (the click point is never dropped). The commit
    // to (300,200) appends the tail auto-L corner (300,260). Same number/type
    // of bends as Floor Editor produces for this exact gesture — all distinct
    // corners, never near-duplicate/stacked handles.
    const bends = latest!.navEdges![0].bendPoints;
    expect(bends).toEqual([
      { x: 260, y: 200 },
      { x: 260, y: 260 },
      { x: 300, y: 260 },
    ]);
    expect(latest!.navEdges![0].distance).toBe(220);

    // ONE undo removes the connection and its bend without deleting existing waypoints.
    fireEvent.click(screen.getByTitle(/Undo/));
    expect(latest!.navNodes).toHaveLength(2);
    expect(latest!.navEdges).toHaveLength(0);
  });

  it("rejects a self-edge with clear feedback and no graph change", () => {
    const { container } = render(<Harness initialCampus={seededCampus()} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "p" });
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    // No edge is ever created (self-edges are rejected with clear feedback).
    expect(container.querySelectorAll("[data-testid='nav-edge']")).toHaveLength(0);
    expect(warningSpy).toHaveBeenCalledWith(
      "Cannot connect a waypoint to itself",
      expect.objectContaining({ description: "Pick a different destination waypoint." })
    );
  });

  it("rejects a duplicate edge in either direction", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={seededCampus()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "p" });
    // A → B
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(navNodeAt(container, 300, 200), { clientX: 300, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(latest!.navEdges).toHaveLength(1);
    // B5 Phase 6.9 (Floor parity): Connect returns to Select after a successful
    // commit — re-arm the Path tool before attempting the reversed duplicate.
    fireEvent.keyDown(window, { key: "p" });
    // B → A (duplicate, reversed)
    fireEvent.mouseDown(navNodeAt(container, 300, 200), { clientX: 300, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(latest!.navEdges).toHaveLength(1);
    expect(warningSpy).toHaveBeenCalledWith(
      "Those points are already connected",
      expect.objectContaining({ description: "Select the existing connection to edit it." })
    );
  });

  it("deleting a waypoint deterministically removes its connected edges", () => {
    let latest: Campus | undefined;
    const campus = seededCampus();
    campus.navEdges = [{
      id: "ne1", startNodeId: "nnA", endNodeId: "nnB", distance: 100, bidirectional: true,
      accessible: true, type: "walkway", color: "#16a34a", width: 4,
    }];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "e" }); // erase
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(latest!.navNodes!.map((n) => n.id)).toEqual(["nnB"]);
    expect(latest!.navEdges).toEqual([]);
  });

  it("Escape cancels an incomplete edge without leaving an orphan", () => {
    const { container } = render(<Harness initialCampus={seededCampus()} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "p" });
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.getByText(/Click destination/)).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });

    // No orphan edge, both seeded nodes intact, incomplete state fully cleared.
    expect(container.querySelectorAll("[data-testid='nav-edge']")).toHaveLength(0);
    expect(container.querySelectorAll("[data-testid='nav-node']")).toHaveLength(2);
    expect(screen.queryByTestId("nav-path-status")).toBeNull();
  });

  it("switching tools cancels an incomplete edge safely", () => {
    const { container } = render(<Harness initialCampus={seededCampus()} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "p" });
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    fireEvent.keyDown(window, { key: "v" }); // switch to select
    expect(container.querySelectorAll("[data-testid='nav-edge']")).toHaveLength(0);
    expect(screen.queryByTestId("nav-path-status")).toBeNull();
  });

  it("right-click cancels an in-progress edge without leaving an orphan", () => {
    const { container } = render(<Harness initialCampus={seededCampus()} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "p" });
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.getByText(/Click destination/)).toBeTruthy();

    // Right-clicking a waypoint cancels the dangling connect state: no orphan
    // edge, and the status chip returns to the idle "start point" prompt.
    fireEvent.contextMenu(navNodeAt(container, 300, 200), { clientX: 300, clientY: 200, bubbles: true });

    expect(container.querySelectorAll("[data-testid='nav-edge']")).toHaveLength(0);
    expect(screen.getByText("Select or place start point")).toBeTruthy();
  });

  it("live preview does NOT mutate the graph", () => {
    const { container } = render(<Harness initialCampus={seededCampus()} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "p" });
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    fireEvent.mouseMove(svg, { clientX: 420, clientY: 260, bubbles: true });
    expect(screen.getByTestId("nav-path-preview")).toBeTruthy();
    // Preview is transient: no new node or edge committed.
    expect(container.querySelectorAll("[data-testid='nav-node']")).toHaveLength(2);
    expect(container.querySelectorAll("[data-testid='nav-edge']")).toHaveLength(0);
  });

  it("marks the campus dirty only on real graph edits (Live → Changes), and undo restores Live", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={seededCampus()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);

    // Selection alone must NOT dirty the draft.
    fireEvent.keyDown(window, { key: "v" });
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.getByText("Live")).toBeTruthy();

    // Waypoint placement IS a real graph edit.
    fireEvent.keyDown(window, { key: "m" });
    fireEvent.mouseDown(svg, { clientX: 500, clientY: 400, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.getByText("Changes")).toBeTruthy();
    expect(latest!.navNodes).toHaveLength(3);

    // Undo back to the saved baseline restores "Live".
    fireEvent.click(screen.getByTitle(/Undo/));
    expect(screen.getByText("Live")).toBeTruthy();
    expect(latest!.navNodes).toHaveLength(2);
  });

  it("undo/redo restores node+edge graph edits exactly", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={seededCampus()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "p" });
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(navNodeAt(container, 300, 200), { clientX: 300, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(latest!.navEdges).toHaveLength(1);

    fireEvent.click(screen.getByTitle(/Undo/));
    expect(latest!.navEdges).toHaveLength(0);

    fireEvent.click(screen.getByTitle(/Redo/));
    expect(latest!.navEdges).toHaveLength(1);
    expect(latest!.navEdges![0]).toMatchObject({ startNodeId: "nnA", endNodeId: "nnB", distance: 100 });
  });
});

describe("B5 Phase 1.5 — navigation authoring UX / tool architecture correction", () => {
  it("consolidates editor layers to Campus / Navigation / Events — accessibility & emergency are graph properties, not tabs", () => {
    expect(LAYERS.map((l) => l.id)).toEqual(["campus", "navigation", "events"]);
  });

  it("Campus layer does NOT expose navigation Waypoint/Connect tools", () => {
    render(<Harness />);
    const toolbar = within(screen.getByTestId("editor-toolbar"));
    // B5 Phase 1.7: Campus is focused on physical campus authoring — the generic
    // Add POI and Draw Walkway tools are hidden from the toolbar (their data
    // model + persistence stay intact for legacy content and future features).
    expect(toolbar.getByRole("button", { name: "Select" })).toBeTruthy();
    expect(toolbar.getByRole("button", { name: "Pan" })).toBeTruthy();
    expect(toolbar.getByRole("button", { name: "Add Building" })).toBeTruthy();
    expect(toolbar.getByRole("button", { name: "Erase" })).toBeTruthy();
    expect(toolbar.queryByRole("button", { name: "Add POI" })).toBeNull();
    expect(toolbar.queryByRole("button", { name: "Draw Walkway" })).toBeNull();
    // …and no navigation authoring tools leak into Campus mode
    expect(toolbar.queryByRole("button", { name: "Add Waypoint" })).toBeNull();
    expect(toolbar.queryByRole("button", { name: "Connect" })).toBeNull();
    expect(toolbar.queryByRole("button", { name: "Remove" })).toBeNull();
    // No ambiguous legacy naming either — Marker/Walkway are now explicit
    expect(toolbar.queryByRole("button", { name: "Marker" })).toBeNull();
    expect(toolbar.queryByRole("button", { name: "Walkway" })).toBeNull();
  });

  it("Navigation layer exposes Add Waypoint + Connect instead of generic Marker/Path", () => {
    const { container } = render(<Harness />);
    openNavigationLayer(container);
    const toolbar = within(screen.getByTestId("editor-toolbar"));
    expect(toolbar.getByRole("button", { name: "Add Waypoint" })).toBeTruthy();
    expect(toolbar.getByRole("button", { name: "Connect" })).toBeTruthy();
    expect(toolbar.getByRole("button", { name: "Remove" })).toBeTruthy();
    // No campus building tool and no generic "Marker" naming in Navigation mode
    expect(toolbar.queryByRole("button", { name: "Add Building" })).toBeNull();
    expect(toolbar.queryByRole("button", { name: "Add POI" })).toBeNull();
    expect(toolbar.queryByRole("button", { name: "Draw Walkway" })).toBeNull();
  });

  it("placing a waypoint creates a real NavigationNode — never a legacy Campus Marker", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "m" });
    fireEvent.mouseDown(svg, { clientX: 350, clientY: 250, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(latest!.markers).toHaveLength(0); // NOT a CampusMarker
    expect(latest!.navNodes).toHaveLength(1);
    expect(latest!.navNodes![0]).toMatchObject({ name: "Waypoint", type: "outdoor", x: 350, y: 250, campusId: "c1" });
    expect(navNodeAt(container, 350, 250)).toBeTruthy();
  });

  it("the Waypoint inspector heading says Waypoint, never Marker", () => {
    const { container } = render(<Harness />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "m" });
    fireEvent.mouseDown(svg, { clientX: 350, clientY: 250, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const panel = screen.getByTestId("nav-node-props");
    expect(within(panel).getByText("Waypoint")).toBeTruthy();
    expect(within(panel).queryByText(/Marker/i)).toBeNull();
    expect(screen.queryByText("Marker Info")).toBeNull();
  });

  it("Navigation Select interacts with graph elements only — campus geometry is never selected or moved", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={seededCampus()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);

    // Press-drag-release on the campus building (Select tool in Navigation mode):
    // the building must NOT be selected or dragged (no campus edit at all).
    const building = Array.from(container.querySelectorAll<SVGRectElement>("svg rect")).find((r) =>
      Math.abs(Number(r.getAttribute("x")) - 100) < 2 &&
      Math.abs(Number(r.getAttribute("y")) - 100) < 2 &&
      r.getAttribute("width") === "120"
    )?.closest("g") ?? null;
    expect(building, "building body group").toBeTruthy();
    fireEvent.mouseDown(building, { clientX: 130, clientY: 130, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 220, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(latest).toBeUndefined();
    expect(screen.queryByText("Marker Info")).toBeNull();

    // …while clicking a waypoint still selects it and opens the Waypoint inspector.
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.getByTestId("nav-node-props")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Select" })).toBeTruthy();
  });

  it("panned camera places the waypoint at the exact clicked screen position (0,0 regression)", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);

    // Hold Space + drag to pan the camera by (+100, +40).
    fireEvent.keyDown(window, { code: "Space" });
    fireEvent.mouseDown(svg, { clientX: 500, clientY: 340, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 600, clientY: 380, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.keyUp(window, { code: "Space" });

    // The camera transform on the svg content group reflects the pan.
    const cam = cameraOf(container);
    expect(cam.pan.x).toBe(100);
    expect(cam.pan.y).toBe(40);

    fireEvent.keyDown(window, { key: "m" });
    fireEvent.mouseDown(svg, { clientX: 350, clientY: 250, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    // World coordinate must be pan-adjusted — and the node must NOT be stuck at 0,0.
    expect(latest!.navNodes![0]).toMatchObject({ x: 250, y: 210 });
    expect(latest!.navNodes![0].x).toBeGreaterThan(0);
    // …and re-projecting world → screen returns to the clicked point.
    const n = latest!.navNodes![0];
    expect(n.x * cam.zoom + cam.pan.x).toBeCloseTo(350, 0);
    expect(n.y * cam.zoom + cam.pan.y).toBeCloseTo(250, 0);
  });

  it("zoomed camera places the waypoint at the exact clicked screen position", async () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);

    // Zoom in — the zoom button jumps the rendered zoom toward the target, and
    // the rAF animation then eases the internal zoom/pan refs (read by
    // getPoint) and the rendered camera to the same target. Under a loaded
    // parallel suite the ~16ms rAF timer (vitest jsdom shim) can be delayed
    // well past a fixed wait, so poll until the rendered camera is STABLE —
    // the final animation tick snaps both refs and DOM to the exact target,
    // so a settled camera guarantees placement and screen agree.
    fireEvent.click(screen.getByTitle("Zoom in"));
    fireEvent.click(screen.getByTitle("Zoom in"));
    let cam = cameraOf(container);
    let stableReads = 0;
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 60));
      const next = cameraOf(container);
      const same =
        Math.abs(next.zoom - cam.zoom) < 0.0001 &&
        Math.abs(next.pan.x - cam.pan.x) < 0.01 &&
        Math.abs(next.pan.y - cam.pan.y) < 0.01;
      stableReads = same ? stableReads + 1 : 0;
      cam = next;
      if (stableReads >= 3 && cam.zoom > 1.04) break;
    }
    expect(cam.zoom).toBeGreaterThan(1.04);

    fireEvent.keyDown(window, { key: "m" });
    fireEvent.mouseDown(svg, { clientX: 420, clientY: 300, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const n = latest!.navNodes![0];
    expect(n.x).toBeGreaterThan(0);
    // Clicked screen point ↔ node world point must agree under the zoomed
    // camera. Node coordinates are Math.round()ed, so allow the ±0.5*zoom
    // rounding envelope (≤ 1 unit) instead of a razor 0.5 tolerance that
    // flakes on a 1.1× camera.
    expect(Math.abs(n.x * cam.zoom + cam.pan.x - 420)).toBeLessThanOrEqual(1);
    expect(Math.abs(n.y * cam.zoom + cam.pan.y - 300)).toBeLessThanOrEqual(1);
  });

  it("hovering empty space with Connect Path previews the would-be waypoint BEFORE the first click", () => {
    const { container } = render(<Harness initialCampus={seededCampus()} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "p" });

    // Pointer moves over empty space before any click: preview node appears.
    fireEvent.mouseMove(svg, { clientX: 420, clientY: 260, bubbles: true });
    expect(screen.getByTestId("nav-path-preview")).toBeTruthy();
    // …and the graph is untouched.
    expect(container.querySelectorAll("[data-testid='nav-node']")).toHaveLength(2);
    expect(container.querySelectorAll("[data-testid='nav-edge']")).toHaveLength(0);
  });

  it("keyboard shortcuts are layer-aware — B (building) is inert in Navigation mode", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "b" }); // building tool — NOT in the Navigation toolbar
    fireEvent.mouseDown(svg, { clientX: 350, clientY: 250, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // No CampusBuilding is ever placed — the shortcut simply did nothing.
    expect(latest).toBeUndefined();
    expect(container.querySelectorAll("[data-testid='nav-node']")).toHaveLength(0);
  });

  it("Navigation Remove protects campus objects — no delete confirmation for a building", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={seededCampus()} onCampusChange={(c) => { latest = c; }} />);
    fireEvent.click(screen.getByText("Navigation"));
    fireEvent.keyDown(window, { key: "e" }); // Remove tool
    const building = Array.from(container.querySelectorAll<SVGRectElement>("svg rect")).find((r) =>
      Math.abs(Number(r.getAttribute("x")) - 100) < 2 &&
      Math.abs(Number(r.getAttribute("y")) - 100) < 2 &&
      r.getAttribute("width") === "120"
    )?.closest("g") ?? null;
    expect(building, "building body group").toBeTruthy();
    fireEvent.mouseDown(building!, { clientX: 130, clientY: 130, bubbles: true });
    fireEvent.mouseUp(container.querySelector("svg")!, { bubbles: true });
    // No delete confirmation, no campus mutation.
    expect(latest).toBeUndefined();
    expect(container.querySelectorAll("[data-testid='nav-node']")).toHaveLength(2);
  });

  it("edge properties expose accessibility/emergency/closed as ONE graph's routing semantics", () => {
    const campus = seededCampus();
    campus.navEdges = [{
      id: "ne1", startNodeId: "nnA", endNodeId: "nnB", distance: 100, bidirectional: true,
      accessible: true, type: "walkway", color: "#16a34a", width: 4,
    }];
    const { container } = render(<Harness initialCampus={campus} />);
    const svg = openNavigationLayer(container);
    fireEvent.mouseDown(container.querySelector("[data-testid='nav-edge']")!, { clientX: 250, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(screen.getAllByText("Navigation Connection").length).toBeGreaterThan(0);
    // Segmented Direction control
    expect(screen.getByText("⇄ Two-way")).toBeTruthy();
    expect(screen.getByText("→ One-way")).toBeTruthy();
    // Route Availability — one graph, routing flags (not separate stores)
    expect(screen.getByText("Route Availability")).toBeTruthy();
    // B5 Phase 1.7: segmented Yes/No + Open/Closed controls (multiple matches
    // for "Closed" — the label and the segmented option — so use getAllByText).
    expect(screen.getAllByText("Accessible").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Emergency Safe").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Closed").length).toBeGreaterThan(0);
    // Custom reason menus are custom dropdowns — never native selects.
    expect(screen.queryByRole("combobox")).toBeNull();
    // Distance is shown in graph/world units — NOT pretended to be meters.
    expect(screen.getByText("100 units")).toBeTruthy();
    // No raw developer IDs as primary controls
    expect(screen.queryByText("nnA")).toBeNull();
  });
});

describe("B5 Phase 1.6 — navigation foundation UX finalization", () => {
  function campusWithEntrance(): Campus {
    const campus = seededCampus();
    campus.buildings[0].entrances = [{
      id: "ent1", buildingId: "b1", edge: "bottom", offset: 0.5,
      type: "general", isPrimary: true, accessible: true,
    }];
    return campus;
  }

  it("Shift-click multi-selects waypoints; dragging one moves the whole group rigidly", () => {
    let latest: Campus | undefined;
    const campus = seededCampus();
    campus.navEdges = [{
      id: "ne1", startNodeId: "nnA", endNodeId: "nnB", distance: 100, bidirectional: true,
      accessible: true, type: "walkway", color: "#16a34a", width: 4,
    }];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "v" });

    // Shift-click both waypoints.
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(navNodeAt(container, 300, 200), { clientX: 300, clientY: 200, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.getByTestId("nav-multi-props")).toBeTruthy();

    // Drag nnA right by +40/+20 — the group (nnA + nnB) moves rigidly.
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 240, clientY: 220, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const nodes = latest!.navNodes!;
    expect(nodes.find((n) => n.id === "nnA")).toMatchObject({ x: 240, y: 220 });
    expect(nodes.find((n) => n.id === "nnB")).toMatchObject({ x: 340, y: 220 });
    // ONE history action for the group gesture: a single undo restores both.
    fireEvent.click(screen.getByTitle(/Undo/));
    const undone = latest!.navNodes!;
    expect(undone.find((n) => n.id === "nnA")).toMatchObject({ x: 200, y: 200 });
    expect(undone.find((n) => n.id === "nnB")).toMatchObject({ x: 300, y: 200 });
  });

  it("marquee (rubber-band) in Navigation Select captures graph elements — nodes and crossing edges", () => {
    let latest: Campus | undefined;
    const campus = seededCampus();
    campus.navEdges = [{
      id: "ne1", startNodeId: "nnA", endNodeId: "nnB", distance: 100, bidirectional: true,
      accessible: true, type: "walkway", color: "#16a34a", width: 4,
    }];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "v" });

    // Drag a marquee that covers both nodes and the edge between them.
    fireEvent.mouseDown(svg, { clientX: 150, clientY: 150, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 350, clientY: 250, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(screen.getByTestId("nav-multi-props")).toBeTruthy();
    // Marquee is selection-only — no campus mutation.
    expect(latest).toBeUndefined();
    expect(screen.getByText(/Waypoints/)).toBeTruthy();
  });

  it("edges are selectable but never draggable away from their nodes", () => {
    let latest: Campus | undefined;
    const campus = seededCampus();
    campus.navEdges = [{
      id: "ne1", startNodeId: "nnA", endNodeId: "nnB", distance: 100, bidirectional: true,
      accessible: true, type: "walkway", color: "#16a34a", width: 4,
    }];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);

    // Click-drag on the edge itself: selects the edge, never drags nodes.
    fireEvent.mouseDown(container.querySelector("[data-testid='nav-edge']")!, { clientX: 250, clientY: 200, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 350, clientY: 250, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(latest).toBeUndefined();
    const nodes = latest?.navNodes ?? campus.navNodes!;
    expect(nodes.find((n) => n.id === "nnA")).toMatchObject({ x: 200, y: 200 });
    expect(nodes.find((n) => n.id === "nnB")).toMatchObject({ x: 300, y: 200 });
  });

  it("rejects an outdoor waypoint placed on a building body with 'Connect through a building entrance'", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={seededCampus()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "m" });
    // Building b1 occupies (100,100)-(220,180); click its interior.
    fireEvent.mouseDown(svg, { clientX: 150, clientY: 140, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(latest).toBeUndefined();
    expect(container.querySelectorAll("[data-testid='nav-node']")).toHaveLength(2);
    expect(warningSpy).toHaveBeenCalledWith(
      "Connect through a building entrance",
      expect.objectContaining({ description: "Outdoor waypoints belong outside buildings — click the building's entrance instead." })
    );
  });

  it("rejects a Connect Path endpoint on a building body with entrance guidance", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={seededCampus()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "p" });
    // Start from an existing waypoint.
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // Finish inside the building body — rejected, no node+edge.
    fireEvent.mouseDown(svg, { clientX: 150, clientY: 140, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(latest).toBeUndefined();
    expect(container.querySelectorAll("[data-testid='nav-edge']")).toHaveLength(0);
    expect(warningSpy).toHaveBeenCalledWith(
      "Connect through a building entrance",
      expect.objectContaining({ description: "Outdoor paths run outside buildings — connect to the building's entrance instead." })
    );
  });

  it("Add Waypoint on a building entrance creates an entrance-linked node at the resolved entrance position", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={campusWithEntrance()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "m" });
    // Entrance ent1 is on the bottom edge of b1 at offset 0.5 → world (160,180).
    fireEvent.mouseDown(svg, { clientX: 160, clientY: 180, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const created = latest!.navNodes!.find((n) => n.type === "entrance");
    expect(created).toMatchObject({ buildingId: "b1", entranceId: "ent1", type: "entrance", x: 160, y: 180 });
    // No generic point was created underneath.
    expect(latest!.navNodes!.filter((n) => n.type === "outdoor")).toHaveLength(2);
  });

  it("hovering a building entrance with Connect Path shows the single entrance target ring (no stacked ghost node)", () => {
    const { container } = render(<Harness initialCampus={campusWithEntrance()} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "p" });

    // Hover the entrance position (world 160,180) before any click.
    fireEvent.mouseMove(svg, { clientX: 160, clientY: 180, bubbles: true });
    // The single Connect Target indicator is the entrance's own dashed ring.
    const target = container.querySelector("[data-entrance-id='ent1'] [data-testid='entrance-connect-target']");
    expect(target).toBeTruthy();
    // The ghost nav-node preview does NOT stack on top of it.
    const preview = screen.getByTestId("nav-path-preview");
    expect(preview.querySelectorAll("circle").length).toBe(0);
  });

  it("the Waypoint Properties panel exposes a human-readable custom Type selector (no native select)", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={seededCampus()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const panel = screen.getByTestId("nav-node-props");
    expect(within(panel).getByText("General")).toBeTruthy();
    // Custom selector shows the human-readable current type and opens a menu.
    const typeButton = within(panel).getByRole("button", { name: /Outdoor Waypoint/ });
    fireEvent.click(typeButton);
    fireEvent.click(within(panel).getByRole("option", { name: "Emergency Exit" }));

    expect(latest!.navNodes!.find((n) => n.id === "nnA")!.type).toBe("emergency_exit");
    // No raw legacy Marker fields.
    expect(within(panel).queryByText(/Marker Color/i)).toBeNull();
    expect(within(panel).queryByText(/Marker/i)).toBeNull();
  });

  it("Edge Properties use a segmented Direction control + Route Availability flags on ONE graph", () => {
    let latest: Campus | undefined;
    const campus = seededCampus();
    campus.navEdges = [{
      id: "ne1", startNodeId: "nnA", endNodeId: "nnB", distance: 100, bidirectional: true,
      accessible: true, type: "walkway", color: "#16a34a", width: 4,
    }];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.mouseDown(container.querySelector("[data-testid='nav-edge']")!, { clientX: 250, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    // Switch to One Way via the segmented control.
    fireEvent.click(screen.getByRole("button", { name: "→ One-way" }));
    expect(latest!.navEdges![0].bidirectional).toBe(false);
    // Closed — segmented Open/Closed control with explanation.
    fireEvent.click(screen.getByRole("button", { name: "Closed" }));
    expect(latest!.navEdges![0].closed).toBe(true);
    expect(screen.getByText(/excluded from routing/i)).toBeTruthy();
  });

  it("graph multi-selection bulk flags + delete work as one action", () => {
    let latest: Campus | undefined;
    const campus = seededCampus();
    campus.navEdges = [
      { id: "ne1", startNodeId: "nnA", endNodeId: "nnB", distance: 100, bidirectional: true, accessible: true, type: "walkway", color: "#16a34a", width: 4 },
      { id: "ne2", startNodeId: "nnB", endNodeId: "nnA", distance: 100, bidirectional: true, accessible: true, type: "walkway", color: "#16a34a", width: 4 },
    ];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "v" });
    // Marquee over both nodes + edges.
    fireEvent.mouseDown(svg, { clientX: 150, clientY: 150, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 350, clientY: 250, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.getByTestId("nav-multi-props")).toBeTruthy();

    // Bulk: mark all selected edges closed (one history action).
    fireEvent.click(screen.getByRole("button", { name: "Mark closed" }));
    expect(latest!.navEdges!.every((e) => e.closed === true)).toBe(true);

    // Delete the whole graph selection in one action.
    fireEvent.click(screen.getByRole("button", { name: /Delete Selected/ }));
    expect(latest!.navNodes).toEqual([]);
    expect(latest!.navEdges).toEqual([]);
  });
});

describe("B5 Phase 1.7 — outdoor navigation manual-QA corrections", () => {
  function campusWithEntrance(): Campus {
    const campus = seededCampus();
    campus.buildings[0].entrances = [{
      id: "ent1", buildingId: "b1", edge: "bottom", offset: 0.5,
      type: "general", isPrimary: true, accessible: true,
    }];
    return campus;
  }

  // ── MODE ISOLATION ────────────────────────────────────────────────────────

  it("after Add Waypoint completes, Navigation Select cannot select a Building", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={seededCampus()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    // Place a waypoint (tool auto-returns to Select).
    fireEvent.keyDown(window, { key: "m" });
    fireEvent.mouseDown(svg, { clientX: 500, clientY: 400, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.getByText("Changes")).toBeTruthy();

    // Now in Select mode, click directly on the building body rect (bubbles to
    // the building <g> onMouseDown → onItemDown). Navigation Select must refuse.
    fireEvent.keyDown(window, { key: "v" });
    fireEvent.mouseDown(buildingGroup(container), { clientX: 160, clientY: 140, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // Building is context-only: no building inspector, geometry untouched.
    // (The name "Building One" legitimately renders in the Hierarchy sidebar
    // and the SVG label, so assert on the inspector itself, not the text.)
    expect(document.getElementById("bldg-name")).toBeNull();
    expect(latest!.buildings[0]).toMatchObject({ x: 100, y: 100, width: 120, height: 80 });
  });

  it("after connecting to an entrance, Navigation Select cannot move a Building", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={campusWithEntrance()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    // Connect Path: click node nnA (200,200) then entrance ent1 (160,180).
    fireEvent.keyDown(window, { key: "p" });
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(container.querySelector("[data-entrance-id='ent1']")!, { clientX: 160, clientY: 180, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(latest!.navEdges).toHaveLength(1);

    // Drag on the building body — must NOT move the building.
    fireEvent.keyDown(window, { key: "v" });
    fireEvent.mouseDown(buildingGroup(container), { clientX: 180, clientY: 140, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 230, clientY: 190, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(latest!.buildings[0]).toMatchObject({ x: 100, y: 100 });
  });

  it("Navigation mode cannot delete/edit a B3 entrance (context-only)", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={campusWithEntrance()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    // Establish a baseline change so `latest` is populated.
    fireEvent.keyDown(window, { key: "m" });
    fireEvent.mouseDown(svg, { clientX: 500, clientY: 400, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const entranceCount = latest!.buildings[0].entrances!.length;

    // Erase tool on the entrance — must NOT delete it in Navigation mode.
    fireEvent.keyDown(window, { key: "e" });
    const entranceEl = container.querySelector("[data-entrance-id='ent1']");
    expect(entranceEl).toBeTruthy();
    fireEvent.mouseDown(entranceEl!, { clientX: 160, clientY: 180, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(latest!.buildings[0].entrances).toHaveLength(entranceCount);

    // B5 Phase 6.4: Select tool on the entrance NOW selects it in Navigation mode
    // (read-only inspection). The entrance-name input appears.
    fireEvent.keyDown(window, { key: "v" });
    fireEvent.mouseDown(entranceEl!, { clientX: 160, clientY: 180, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // B5 Phase 6.4: entrance IS selectable in Navigation mode for inspection
    expect(document.getElementById("entrance-name")).not.toBeNull();
    expect(screen.queryByTestId("entrance-purpose-control")).not.toBeNull();
    // But entrance is immutable — dragging it should not work
    const prevEntranceCount = latest!.buildings[0].entrances!.length;
    fireEvent.keyDown(window, { key: "e" });
    fireEvent.mouseDown(entranceEl!, { clientX: 160, clientY: 180, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(latest!.buildings[0].entrances).toHaveLength(prevEntranceCount);
  });

  it("Campus mode still edits Buildings/Entrances normally", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={campusWithEntrance()} onCampusChange={(c) => { latest = c; }} />);
    const svg = canvasSvg(container);
    // Select the entrance in Campus mode.
    fireEvent.mouseDown(container.querySelector("[data-entrance-id='ent1']")!, { clientX: 160, clientY: 180, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // The entrance inspector opens (its Name input + Purpose controls render).
    expect(document.getElementById("entrance-name")).toBeTruthy();
    expect(screen.getByTestId("entrance-purpose-control")).toBeTruthy();
    // Move the building in Campus mode with the Select tool.
    fireEvent.keyDown(window, { key: "v" });
    fireEvent.mouseDown(buildingGroup(container), { clientX: 180, clientY: 140, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 230, clientY: 190, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // Campus Select still moves buildings normally (drag +50/+50, snapped to
    // the 20-unit grid → 150 → 160).
    expect(latest!.buildings[0]).toMatchObject({ x: 160, y: 160 });
  });

  // ── ENTRANCE TRANSIENT STATE ─────────────────────────────────────────────

  it("a completed entrance edge clears the dashed preview (no ghost line)", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={campusWithEntrance()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "p" });
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // Preview visible while in progress.
    expect(screen.getByTestId("nav-path-preview")).toBeTruthy();
    fireEvent.mouseDown(svg, { clientX: 160, clientY: 180, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // Edge committed; dashed preview gone; no static green connector block.
    expect(latest!.navEdges).toHaveLength(1);
    expect(screen.queryByTestId("nav-path-preview")).toBeNull();
    // The old static green dashed entrance-connector is removed entirely.
    const connectorLines = Array.from(container.querySelectorAll("line")).filter(
      (l) => l.getAttribute("stroke-dasharray") === "8 4" && l.getAttribute("stroke") === "#16a34a"
    );
    expect(connectorLines).toHaveLength(0);
  });

  it("re-attempting the same entrance connection is rejected with no duplicate node/edge", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={campusWithEntrance()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "p" });
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(svg, { clientX: 160, clientY: 180, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(latest!.navEdges).toHaveLength(1);
    const entranceNodes = latest!.navNodes!.filter((n) => n.type === "entrance");
    expect(entranceNodes).toHaveLength(1);

    // Try the same A → Entrance again.
    fireEvent.keyDown(window, { key: "p" });
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(svg, { clientX: 160, clientY: 180, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(warningSpy).toHaveBeenCalledWith("Those points are already connected", expect.anything());
    expect(latest!.navEdges).toHaveLength(1);
    expect(latest!.navNodes!.filter((n) => n.type === "entrance")).toHaveLength(1);
  });

  // ── DELETE SHORTCUT ───────────────────────────────────────────────────────

  it("Delete key removes a selected waypoint and its connected edges (one history)", () => {
    let latest: Campus | undefined;
    const campus = seededCampus();
    campus.navEdges = [
      { id: "ne1", startNodeId: "nnA", endNodeId: "nnB", distance: 100, bidirectional: true, accessible: true, type: "walkway", color: "#16a34a", width: 4 },
    ];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "v" });
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.keyDown(window, { key: "Delete" });
    expect(latest!.navNodes!.find((n) => n.id === "nnA")).toBeUndefined();
    expect(latest!.navEdges).toEqual([]); // connected edge cleaned up
    expect(latest!.navNodes!.find((n) => n.id === "nnB")).toBeTruthy();
  });

  it("Delete key removes a selected edge only", () => {
    let latest: Campus | undefined;
    const campus = seededCampus();
    campus.navEdges = [
      { id: "ne1", startNodeId: "nnA", endNodeId: "nnB", distance: 100, bidirectional: true, accessible: true, type: "walkway", color: "#16a34a", width: 4 },
    ];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "v" });
    fireEvent.mouseDown(container.querySelector("[data-testid='nav-edge']")!, { clientX: 250, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.keyDown(window, { key: "Backspace" });
    expect(latest!.navEdges).toEqual([]);
    expect(latest!.navNodes).toHaveLength(2); // both nodes survive
  });

  it("Delete key removes a multi-selection of nodes+edges as one history action", () => {
    let latest: Campus | undefined;
    const campus = seededCampus();
    campus.navNodes = [...campus.navNodes!, { id: "nnC", name: "Gate C", type: "outdoor", x: 400, y: 200, campusId: "c1", accessible: true, color: "#16a34a" }];
    campus.navEdges = [
      { id: "ne1", startNodeId: "nnA", endNodeId: "nnB", distance: 100, bidirectional: true, accessible: true, type: "walkway", color: "#16a34a", width: 4 },
      { id: "ne2", startNodeId: "nnB", endNodeId: "nnC", distance: 100, bidirectional: true, accessible: true, type: "walkway", color: "#16a34a", width: 4 },
    ];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "v" });
    // Marquee over all three nodes + both edges.
    fireEvent.mouseDown(svg, { clientX: 150, clientY: 150, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 450, clientY: 250, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.getByTestId("nav-multi-props")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Delete" });
    expect(latest!.navNodes).toEqual([]);
    expect(latest!.navEdges).toEqual([]);
  });

  it("Delete/Backspace in a text input does NOT delete the graph", () => {
    let latest: Campus | undefined;
    const campus = seededCampus();
    campus.navEdges = [
      { id: "ne1", startNodeId: "nnA", endNodeId: "nnB", distance: 100, bidirectional: true, accessible: true, type: "walkway", color: "#16a34a", width: 4 },
    ];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "v" });
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const nameInput = document.getElementById("nav-name");
    expect(nameInput).toBeTruthy();
    nameInput!.focus();
    fireEvent.keyDown(window, { key: "Delete" });
    // Input guard: selection itself never mutates the draft (latest stays
    // undefined), and Delete in the text field must NOT remove the graph —
    // both nodes and the edge remain rendered.
    expect(latest).toBeUndefined();
    expect(container.querySelectorAll("[data-testid='nav-node']")).toHaveLength(2);
    expect(container.querySelectorAll("[data-testid='nav-edge']")).toHaveLength(1);
  });

  // ── PROPERTIES — CUSTOM CONTROLS ──────────────────────────────────────────

  it("locks the Type for entrance-linked waypoints (Building Entrance only)", () => {
    const campus = campusWithEntrance();
    campus.navNodes = [
      { id: "nnX", name: "Entrance Node", type: "entrance", x: 160, y: 180, campusId: "c1", buildingId: "b1", entranceId: "ent1", accessible: true, color: "#16a34a" },
    ];
    const { container } = render(<Harness initialCampus={campus} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "v" });
    fireEvent.mouseDown(navNodeAt(container, 160, 180), { clientX: 160, clientY: 180, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // Entrance-linked node: type is locked to Building Entrance (no menu button).
    expect(screen.getByText("Building Entrance")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Outdoor Waypoint/ })).toBeNull();
    expect(screen.getByText("Linked")).toBeTruthy();
  });

  it("Waypoint Type menu offers safe_area (custom menu, no native select)", () => {
    const { container } = render(<Harness initialCampus={seededCampus()} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "v" });
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.click(screen.getByRole("button", { name: /Outdoor Waypoint/ }));
    expect(screen.getByRole("option", { name: "Safe Area" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Hallway" })).toBeNull();
  });

  it("no native select for Accessible/Emergency reasons — custom dropdowns only", () => {
    const campus = seededCampus();
    campus.navEdges = [{
      id: "ne1", startNodeId: "nnA", endNodeId: "nnB", distance: 100, bidirectional: true,
      accessible: false, inaccessibleReason: "stairs", type: "walkway", color: "#16a34a", width: 4,
    }];
    const { container } = render(<Harness initialCampus={campus} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "v" });
    fireEvent.mouseDown(container.querySelector("[data-testid='nav-edge']")!, { clientX: 250, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // Native selects are gone entirely.
    expect(screen.queryByRole("combobox")).toBeNull();
    // Segmented Yes/No + Open/Closed controls are present.
    expect(screen.getByRole("radiogroup", { name: "Accessible" })).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "Emergency Safe" })).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "Availability" })).toBeTruthy();
    // Custom reason dropdown (role listbox) appears because Accessible = No.
    expect(screen.getByText("Stairs")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Why is this not accessible/ }));
    expect(screen.getByRole("option", { name: "Narrow Path" })).toBeTruthy();
  });

  it("semantic waypoint type visuals render distinct indicators", () => {
    const campus = seededCampus();
    campus.navNodes = [
      { id: "nnE", name: "Exit", type: "emergency_exit", x: 200, y: 200, campusId: "c1", accessible: true, color: "#16a34a" },
      { id: "nnS", name: "Safe", type: "safe_area", x: 300, y: 200, campusId: "c1", accessible: true, color: "#16a34a" },
      { id: "nnD", name: "Dest", type: "room_access", x: 400, y: 200, campusId: "c1", accessible: true, color: "#16a34a" },
      { id: "nnEn", name: "Ent", type: "entrance", x: 500, y: 200, campusId: "c1", accessible: true, color: "#16a34a" },
    ];
    render(<Harness initialCampus={campus} />);
    openNavigationLayer(document.body);
    const svg = canvasSvg(document.body);
    // Each node group still renders; the type glyphs are inside the node groups.
    expect(svg.querySelectorAll("[data-testid='nav-node']").length).toBe(4);
    // Safe area glyph (shield path) + emergency glyph are drawn.
    const shieldPaths = Array.from(svg.querySelectorAll("path")).filter((p) => (p.getAttribute("d") || "").includes("Z") && p.getAttribute("fill") === "#0d9488");
    expect(shieldPaths.length).toBe(1);
  });

  // ── MODE SWITCH — dirty draft survives; switch itself is not a mutation ────

  it("a dirty Navigation draft survives Navigation→Campus→Navigation with Save enabled and no dialog", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={seededCampus()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);

    // Real graph edit → dirty.
    fireEvent.keyDown(window, { key: "m" });
    fireEvent.mouseDown(svg, { clientX: 500, clientY: 400, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.getByText("Changes")).toBeTruthy();
    const draftNodes = latest!.navNodes!.length;

    // Switch to Campus — no dialog, draft stays, Save stays enabled.
    fireEvent.click(screen.getByText("Campus"));
    expect(screen.queryByText(/Unsaved changes/)).toBeNull();
    expect(screen.getByText("Changes")).toBeTruthy();
    expect(latest!.navNodes).toHaveLength(draftNodes);

    // Switch back to Navigation — graph remains.
    fireEvent.click(screen.getByText("Navigation"));
    expect(screen.getByText("Changes")).toBeTruthy();
    expect(latest!.navNodes).toHaveLength(draftNodes);
  });

  it("switching modes alone does NOT mark the draft dirty", () => {
    const { container } = render(<Harness initialCampus={seededCampus()} />);
    openNavigationLayer(container);
    expect(screen.getByText("Live")).toBeTruthy();
    fireEvent.click(screen.getByText("Campus"));
    fireEvent.click(screen.getByText("Navigation"));
    fireEvent.click(screen.getByText("Events"));
    expect(screen.getByText("Live")).toBeTruthy();
  });
});

describe("B5 Phase 1.8 — entrance-linked navigation final corrections", () => {
  /** Seeded campus: b1 (100,100,120,80) with a bottom/0.5 entrance (world
   * (160,180)) already linked to an entrance nav node, plus a plain outdoor
   * node nnA and one connecting edge. */
  function campusWithLinkedEntrance(): Campus {
    const campus = seededCampus();
    campus.buildings[0].entrances = [{
      id: "ent1", buildingId: "b1", edge: "bottom", offset: 0.5,
      type: "general", isPrimary: true, accessible: true,
    }];
    campus.navNodes = [
      { id: "nnEnt", name: "Primary Entrance", type: "entrance", x: 160, y: 180, campusId: "c1", buildingId: "b1", entranceId: "ent1", accessible: true, color: "#16a34a" },
      { id: "nnA", name: "Gate A", type: "outdoor", x: 200, y: 200, campusId: "c1", accessible: true, color: "#16a34a" },
    ];
    campus.navEdges = [{
      id: "ne1", startNodeId: "nnEnt", endNodeId: "nnA", distance: 50, bidirectional: true,
      accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 4,
    }];
    return campus;
  }

  // ── ATTACHMENT — node position is DERIVED from the linked entrance ────────

  it("moving a Building in Campus mode moves its entrance-linked node (and the edge follows)", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={campusWithLinkedEntrance()} onCampusChange={(c) => { latest = c; }} />);
    const svg = canvasSvg(container);

    // Drag b1 by (+60,+50) → grid-snapped to (160,160).
    fireEvent.keyDown(window, { key: "v" });
    fireEvent.mouseDown(buildingGroup(container), { clientX: 180, clientY: 140, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 230, clientY: 190, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(latest!.buildings[0]).toMatchObject({ x: 160, y: 160 });
    // bottom/0.5 entrance on the moved building → world (220,240).
    const entranceNode = latest!.navNodes!.find((n) => n.id === "nnEnt")!;
    expect(entranceNode).toMatchObject({ x: 220, y: 240, buildingId: "b1", entranceId: "ent1" });
    // The edge still references the same node pair (geometry derives from nodes).
    expect(latest!.navEdges![0]).toMatchObject({ startNodeId: "nnEnt", endNodeId: "nnA" });
  });

  it("repositioning an Entrance along the perimeter moves its linked node in the same gesture", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={campusWithLinkedEntrance()} onCampusChange={(c) => { latest = c; }} />);
    const svg = canvasSvg(container);

    // Campus mode: drag the entrance from bottom/0.5 (160,180) to bottom/0.75 (190,180).
    fireEvent.keyDown(window, { key: "v" });
    const entranceEl = container.querySelector("[data-entrance-id='ent1']");
    expect(entranceEl).toBeTruthy();
    fireEvent.mouseDown(entranceEl!, { clientX: 160, clientY: 180, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 190, clientY: 180, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(latest!.buildings[0].entrances![0]).toMatchObject({ edge: "bottom", offset: 0.75 });
    const entranceNode = latest!.navNodes!.find((n) => n.id === "nnEnt")!;
    expect(entranceNode).toMatchObject({ x: 190, y: 180 });
  });

  it("undoing the building move restores building + entrance node + edges together (one gesture, one undo)", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={campusWithLinkedEntrance()} onCampusChange={(c) => { latest = c; }} />);
    const svg = canvasSvg(container);

    fireEvent.keyDown(window, { key: "v" });
    fireEvent.mouseDown(buildingGroup(container), { clientX: 180, clientY: 140, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 230, clientY: 190, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(latest!.buildings[0].x).toBe(160);

    fireEvent.click(screen.getByTitle(/Undo/));
    expect(latest!.buildings[0]).toMatchObject({ x: 100, y: 100 });
    expect(latest!.navNodes!.find((n) => n.id === "nnEnt")).toMatchObject({ x: 160, y: 180 });
    expect(latest!.navEdges).toHaveLength(1);
  });

  // ── DRAG SAFETY ───────────────────────────────────────────────────────────

  it("an entrance-linked node cannot be dragged independently (no mutation, toast, no dirty)", () => {
    let latest: Campus | undefined;
    const infoSpy = vi.spyOn(toast, "info").mockImplementation(() => "" as never);
    const { container } = render(<Harness initialCampus={campusWithLinkedEntrance()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);

    fireEvent.keyDown(window, { key: "v" });
    const g = navNodeAt(container, 160, 180);
    fireEvent.mouseDown(g, { clientX: 160, clientY: 180, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 260, clientY: 280, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(latest).toBeUndefined(); // no campus mutation
    expect(latest ?? campusWithLinkedEntrance().navNodes!).not.toBeNull();
    expect(infoSpy).toHaveBeenCalledWith("Entrance waypoints follow their building entrance", expect.anything());
    // No dirty state was introduced by the blocked drag.
    expect(screen.getByText("Live")).toBeTruthy();
    // Still selectable (selection is allowed — only dragging is blocked).
    expect(screen.getByTestId("nav-node-props")).toBeTruthy();
  });

  it("a normal waypoint still moves, and an entrance node in the same multi-selection stays fixed", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={campusWithLinkedEntrance()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);

    fireEvent.keyDown(window, { key: "v" });
    // Shift-select both the entrance node and the plain node nnA.
    fireEvent.mouseDown(navNodeAt(container, 160, 180), { clientX: 160, clientY: 180, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    // Drag the PLAIN node — the entrance-linked node must NOT translate with it.
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 240, clientY: 240, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(latest!.navNodes!.find((n) => n.id === "nnA")).toMatchObject({ x: 240, y: 240 });
    // Entrance-linked node stays at its entrance position (160,180).
    expect(latest!.navNodes!.find((n) => n.id === "nnEnt")).toMatchObject({ x: 160, y: 180 });
  });

  // ── DEDUP ─────────────────────────────────────────────────────────────────

  it("Add Waypoint on an already-linked entrance selects the existing node with feedback, never a duplicate", () => {
    let latest: Campus | undefined;
    const infoSpy = vi.spyOn(toast, "info").mockImplementation(() => "" as never);
    const { container } = render(<Harness initialCampus={campusWithLinkedEntrance()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);

    fireEvent.keyDown(window, { key: "m" });
    fireEvent.mouseDown(svg, { clientX: 160, clientY: 180, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(latest).toBeUndefined(); // no mutation
    expect(infoSpy).toHaveBeenCalledWith("Entrance already connected to the navigation network", expect.anything());
    expect(screen.getByTestId("nav-node-props")).toBeTruthy();
    expect(screen.getByText("Building Entrance")).toBeTruthy();
    expect(screen.getByText("Live")).toBeTruthy();
  });

  it("Connect Path reuses the existing entrance node (no duplicate) and rejects the duplicate edge", () => {
    let latest: Campus | undefined;
    const warningSpy2 = vi.spyOn(toast, "warning").mockImplementation(() => "" as never);
    const campus = campusWithLinkedEntrance();
    campus.navEdges = []; // start unconnected
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);

    // Path: click plain node nnA then the entrance (svg-click path).
    fireEvent.keyDown(window, { key: "p" });
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(svg, { clientX: 160, clientY: 180, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(latest!.navEdges).toHaveLength(1);
    expect(latest!.navEdges![0]).toMatchObject({ startNodeId: "nnA", endNodeId: "nnEnt" });
    expect(latest!.navNodes!.filter((n) => n.entranceId)).toHaveLength(1); // reused, not duplicated

    // Same connection again → rejected with the shared toast, no change.
    fireEvent.keyDown(window, { key: "p" });
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(svg, { clientX: 160, clientY: 180, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(warningSpy2).toHaveBeenCalledWith("Those points are already connected", expect.anything());
    expect(latest!.navEdges).toHaveLength(1);
  });

  // ── DELETE CLEANUP ────────────────────────────────────────────────────────

  it("deleting a B3 Entrance removes its entrance-linked node + connected edges in the same mutation", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={campusWithLinkedEntrance()} onCampusChange={(c) => { latest = c; }} />);
    const svg = canvasSvg(container);

    // Campus mode: select the entrance, then Delete.
    fireEvent.keyDown(window, { key: "v" });
    const entranceEl = container.querySelector("[data-entrance-id='ent1']");
    fireEvent.mouseDown(entranceEl!, { clientX: 160, clientY: 180, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.keyDown(window, { key: "Delete" });

    expect(latest!.buildings[0].entrances).toHaveLength(0);
    expect(latest!.navNodes!.some((n) => n.entranceId === "ent1")).toBe(false); // no stale node
    expect(latest!.navEdges).toEqual([]); // connected edge cleaned up
    expect(latest!.navNodes!.some((n) => n.id === "nnA")).toBe(true); // unrelated node survives

    // Undo restores the entrance, its node, and the edge.
    fireEvent.click(screen.getByTitle(/Undo/));
    expect(latest!.buildings[0].entrances).toHaveLength(1);
    expect(latest!.navNodes!.find((n) => n.id === "nnEnt")).toBeTruthy();
    expect(latest!.navEdges).toHaveLength(1);
  });

  it("deleting the Building also removes its entrance-linked nodes and edges", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={campusWithLinkedEntrance()} onCampusChange={(c) => { latest = c; }} />);
    const svg = canvasSvg(container);

    fireEvent.keyDown(window, { key: "v" });
    fireEvent.mouseDown(buildingGroup(container), { clientX: 130, clientY: 130, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.keyDown(window, { key: "Delete" });

    expect(latest!.buildings).toHaveLength(0);
    expect(latest!.navNodes!.some((n) => n.buildingId === "b1")).toBe(false);
    expect(latest!.navEdges).toEqual([]);
  });

  // ── VISUAL ────────────────────────────────────────────────────────────────

  it("an entrance-linked node renders a subtle connected badge, not the stacked waypoint target", () => {
    const { container } = render(<Harness initialCampus={campusWithLinkedEntrance()} />);
    openNavigationLayer(container);
    const svg = canvasSvg(container);

    const linkedG = svg.querySelector("[data-testid='nav-node'][data-entrance-linked='true']");
    expect(linkedG).toBeTruthy();
    // Subtle connected badge (r=4 dot) present…
    expect(linkedG!.querySelectorAll("circle[r='4']").length).toBe(1);
    // …and the big waypoint circle (r=7 fill) is NOT rendered for it.
    expect(linkedG!.querySelectorAll("circle[r='7']").length).toBe(0);
    // A plain outdoor node still renders the normal waypoint circle.
    const plainG = svg.querySelector("[data-testid='nav-node']:not([data-entrance-linked])") as SVGGElement;
    expect(plainG.querySelectorAll("circle[r='7']").length).toBe(1);
    // Label uses the entrance name, not a generic "Waypoint".
    expect(svg.textContent).toContain("Primary Entrance");
  });

  // ── UI — comfortable segmented Yes/No controls ────────────────────────────

  it("Accessible/Emergency Safe/Closed use the comfortable custom segmented control (h-9 targets)", () => {
    const campus = seededCampus();
    campus.navEdges = [{
      id: "ne1", startNodeId: "nnA", endNodeId: "nnB", distance: 100, bidirectional: true,
      accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 4,
    }];
    const { container } = render(<Harness initialCampus={campus} />);
    const svg = openNavigationLayer(container);
    fireEvent.mouseDown(container.querySelector("[data-testid='nav-edge']")!, { clientX: 250, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const accessible = screen.getByRole("radiogroup", { name: "Accessible" });
    const buttons = accessible.querySelectorAll("button");
    expect(buttons.length).toBe(2);
    expect(buttons[0].className).toContain("h-10"); // comfortable hit target, not h-6 chips
    expect(screen.getByRole("radiogroup", { name: "Emergency Safe" })).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "Availability" })).toBeTruthy();
    // Still no native selects anywhere.
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("entrance-linked waypoint properties show a read-only derived position", () => {
    const { container } = render(<Harness initialCampus={campusWithLinkedEntrance()} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "v" });
    fireEvent.mouseDown(navNodeAt(container, 160, 180), { clientX: 160, clientY: 180, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const panel = screen.getByTestId("nav-node-props");
    const xInput = panel.querySelector<HTMLInputElement>('input[type="number"]');
    expect(xInput!.disabled).toBe(true);
    expect(within(panel).getByText(/Derived from the linked building entrance/)).toBeTruthy();
    expect(within(panel).getByText(/Linked to building entrance/)).toBeTruthy();
  });
});

describe("B5 Phase 1.9 — entrance navigation visual cleanup", () => {
  /** Reuse the Phase 1.8 linked-entrance fixture (ent1 at world (160,180), node nnEnt). */
  function linkedCampus(): Campus {
    const campus = seededCampus();
    campus.buildings[0].entrances = [{
      id: "ent1", buildingId: "b1", edge: "bottom", offset: 0.5,
      type: "general", isPrimary: true, accessible: true,
    }];
    campus.navNodes = [
      { id: "nnEnt", name: "Primary Entrance", type: "entrance", x: 160, y: 180, campusId: "c1", buildingId: "b1", entranceId: "ent1", accessible: true, color: "#16a34a" },
      { id: "nnA", name: "Gate A", type: "outdoor", x: 200, y: 200, campusId: "c1", accessible: true, color: "#16a34a" },
    ];
    return campus;
  }

  /** The entrance-linked nav-node <g>. */
  function linkedNodeG(container: HTMLElement): SVGGElement {
    const g = container.querySelector("[data-testid='nav-node'][data-entrance-linked='true']") as SVGGElement;
    expect(g).toBeTruthy();
    return g;
  }

  it("normal entrance-linked node shows exactly ONE navigation cue (tiny badge, no stacked rings)", () => {
    const { container } = render(<Harness initialCampus={linkedCampus()} />);
    openNavigationLayer(container);
    const g = linkedNodeG(container);
    // Connected badge only: the r=4 dot + one subtle r=6.5 ring.
    const circles = g.querySelectorAll("circle");
    expect(circles.length).toBe(2);
    expect(Array.from(circles).some((c) => c.getAttribute("r") === "4")).toBe(true);
    expect(Array.from(circles).some((c) => c.getAttribute("r") === "6.5")).toBe(true);
    // No separate hover ring (r=11) / waypoint target (r=7) stacked underneath.
    expect(Array.from(circles).some((c) => c.getAttribute("r") === "11")).toBe(false);
    expect(Array.from(circles).some((c) => c.getAttribute("r") === "7")).toBe(false);
  });

  it("selected entrance-linked node shows ONE clean selection ring (badge suppressed, no stacking)", () => {
    const { container } = render(<Harness initialCampus={linkedCampus()} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "v" });
    fireEvent.mouseDown(navNodeAt(container, 160, 180), { clientX: 160, clientY: 180, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const g = linkedNodeG(container);
    const circles = g.querySelectorAll("circle");
    // Exactly ONE decoration: the r=12 accent selection ring.
    expect(circles.length).toBe(1);
    expect(circles[0].getAttribute("r")).toBe("12");
    expect(circles[0].getAttribute("stroke")).toBe("var(--accent)");
    // No badge dot / subtle ring underneath.
    expect(Array.from(circles).some((c) => c.getAttribute("r") === "4")).toBe(false);
    expect(Array.from(circles).some((c) => c.getAttribute("r") === "6.5")).toBe(false);
    // No generic "Waypoint" label — the entrance name is used.
    expect(g.querySelector("text")?.textContent).toBe("Primary Entrance");
    expect(g.querySelector("text")?.textContent).not.toBe("Waypoint");
  });

  it("Connect Target has the highest visual priority and clears immediately when the pointer leaves", () => {
    const { container } = render(<Harness initialCampus={linkedCampus()} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "p" });
    // Hover the entrance position → single entrance target ring, node badge hidden.
    fireEvent.mouseMove(svg, { clientX: 160, clientY: 180, bubbles: true });
    expect(container.querySelector("[data-entrance-id='ent1'] [data-testid='entrance-connect-target']")).toBeTruthy();
    expect(linkedNodeG(container).querySelectorAll("circle").length).toBe(0);
    // Move away → target ring clears, badge returns (no lingering decoration).
    fireEvent.mouseMove(svg, { clientX: 420, clientY: 260, bubbles: true });
    expect(container.querySelector("[data-entrance-id='ent1'] [data-testid='entrance-connect-target']")).toBeNull();
    expect(linkedNodeG(container).querySelectorAll("circle").length).toBe(2);
  });

  it("normal free Waypoint visuals are unchanged (waypoint circle + hover ring intact)", () => {
    const { container } = render(<Harness initialCampus={linkedCampus()} />);
    openNavigationLayer(container);
    const g = navNodeAt(container, 200, 200); // plain outdoor node nnA
    const circles = g.querySelectorAll("circle");
    expect(Array.from(circles).some((c) => c.getAttribute("r") === "7")).toBe(true);
    expect(Array.from(circles).some((c) => c.getAttribute("r") === "11")).toBe(true);
  });

  it("connecting to an entrance keeps the edge endpoint centered on the entrance (no target circle in the way)", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={linkedCampus()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "p" });
    // Start at the plain node nnA (200,200).
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // Finish at the entrance-linked node nnEnt (160,180).
    fireEvent.mouseDown(navNodeAt(container, 160, 180), { clientX: 160, clientY: 180, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(latest!.navEdges).toHaveLength(1);
    expect(latest!.navEdges![0]).toMatchObject({ startNodeId: "nnA", endNodeId: "nnEnt" });
    // Transient connect state fully cleared after completion.
    expect(screen.queryByTestId("nav-path-preview")).toBeNull();
    expect(container.querySelector("[data-entrance-id='ent1'] [data-testid='entrance-connect-target']")).toBeNull();
  });

  it("Phase 5.1 asset palette exposes simplified campus object presets only", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Assets" }));

    expect(BUILDING_TYPES.map((type) => type.label)).toEqual([
      "Academic",
      "Laboratory",
      "Library",
      "Gymnasium",
      "Administration",
      "Other",
    ]);
    for (const label of ["Dormitory", "Canteen", "Medical", "Security"]) {
      expect(screen.queryByRole("button", { name: new RegExp(label) })).toBeNull();
    }
  });

  it("legacy building categories still render safely even when removed from new presets", () => {
    const campus = makeCampus();
    campus.buildings[0] = { ...campus.buildings[0], name: "Legacy Dorm", category: "Dormitory" };
    render(<Harness initialCampus={campus} />);
    expect(screen.getAllByText("Legacy Dorm").length).toBeGreaterThan(0);
  });



  it("direct pathway width drag changes only stroke width, not path points", () => {
    let latest: Campus | undefined;
    const campus = makeCampus();
    campus.paths = [{ id: "p1", name: "Main Walk", type: "walkway", color: "#94a3b8", width: 10, points: [{ x: 100, y: 100 }, { x: 200, y: 100 }] }];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    const svg = canvasSvg(container);
    const path = container.querySelector("[data-testid='campus-path']") as SVGGElement;
    fireEvent.mouseDown(path, { clientX: 150, clientY: 100, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(container.querySelector("[data-testid='path-width-handle']")).toBeTruthy();
    const handle = container.querySelector("[data-testid='path-width-handle']")!;
    fireEvent.mouseDown(handle, { clientX: 150, clientY: 123, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 150, clientY: 133, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(latest!.paths[0].width).toBeGreaterThan(10);
    expect(latest!.paths[0].points).toEqual(campus.paths[0].points);
  });

  it("pathway type visuals remain distinct for walkway, road, and accessible paths", () => {
    const campus = makeCampus();
    campus.paths = [
      { id: "pw", type: "walkway", color: "#94a3b8", width: 10, points: [{ x: 80, y: 80 }, { x: 160, y: 80 }] },
      { id: "pr", type: "road", color: "#cbd5e1", width: 18, points: [{ x: 80, y: 120 }, { x: 160, y: 120 }] },
      { id: "pa", type: "accessible", color: "#a7f3d0", width: 10, points: [{ x: 80, y: 160 }, { x: 160, y: 160 }] },
    ];
    const { container } = render(<Harness initialCampus={campus} />);
    const kinds = Array.from(container.querySelectorAll("[data-testid='campus-path']")).map((el) => el.getAttribute("data-path-kind"));
    expect(kinds).toEqual(["walkway", "road", "accessible"]);
    // B5 Phase 5.12: centerline is now rendered in the chain layer, not the hit-test group
    const roadChain = Array.from(container.querySelectorAll("[data-testid='path-chain']")).find((c) => c.getAttribute("data-chain-kind") === "road");
    expect(roadChain).toBeTruthy();
    expect(roadChain!.querySelector("path[stroke-dasharray='10 10']")).toBeTruthy();
  });

  it("Phase 5.2 shows one outdoor group boundary for two selected objects", () => {
    const { container } = render(<Harness initialCampus={campusWithOutdoorSelectionObjects()} />);
    const svg = canvasSvg(container);
    fireEvent.mouseDown(buildingGroup(container), { clientX: 160, clientY: 140, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(container.querySelector("[data-testid='campus-group-outline']")).toBeNull();
    fireEvent.mouseDown(decorGroup(container), { clientX: 280, clientY: 160, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(container.querySelectorAll("[data-testid='campus-group-outline']")).toHaveLength(1);
  });

  it("Phase 5.2 keeps single selection free of the group boundary", () => {
    const { container } = render(<Harness initialCampus={campusWithOutdoorSelectionObjects()} />);
    const svg = canvasSvg(container);
    fireEvent.mouseDown(buildingGroup(container), { clientX: 160, clientY: 140, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(container.querySelector("[data-testid='campus-group-outline']")).toBeNull();
  });

  it("Phase 5.2 Shift-click toggles the outdoor group boundary from 1 to 2 to 1", () => {
    const { container } = render(<Harness initialCampus={campusWithOutdoorSelectionObjects()} />);
    const svg = canvasSvg(container);
    const tree = decorGroup(container);

    fireEvent.mouseDown(buildingGroup(container), { clientX: 160, clientY: 140, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(tree, { clientX: 280, clientY: 160, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(groupOutline(container)).toBeTruthy();

    fireEvent.mouseDown(tree, { clientX: 280, clientY: 160, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(container.querySelector("[data-testid='campus-group-outline']")).toBeNull();
  });

  it("Phase 5.2 group outline toolbar toggle hides and restores only the large boundary", () => {
    const { container } = render(<Harness initialCampus={campusWithOutdoorSelectionObjects()} />);
    const svg = canvasSvg(container);
    fireEvent.mouseDown(buildingGroup(container), { clientX: 160, clientY: 140, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(decorGroup(container), { clientX: 280, clientY: 160, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(groupOutline(container)).toBeTruthy();
    const hide = screen.getByRole("button", { name: "Hide group outline" });
    fireEvent.click(hide);
    expect(container.querySelector("[data-testid='campus-group-outline']")).toBeNull();
    expect(screen.getByLabelText("2 selected outdoor objects")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Show group outline" }));
    expect(groupOutline(container)).toBeTruthy();
  });

  it("Phase 5.2 rubber-band multi-selection renders the group boundary in either drag direction", () => {
    const { container, unmount } = render(<Harness initialCampus={campusWithOutdoorSelectionObjects()} />);
    let svg = canvasSvg(container);
    fireEvent.mouseDown(svg, { clientX: 70, clientY: 70, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 340, clientY: 245, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(groupOutline(container)).toBeTruthy();

    unmount();
    const second = render(<Harness initialCampus={campusWithOutdoorSelectionObjects()} />);
    svg = canvasSvg(second.container);
    fireEvent.mouseDown(svg, { clientX: 340, clientY: 245, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 70, clientY: 70, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(groupOutline(second.container)).toBeTruthy();
  });

  it("Phase 5.2 mixed Building + Decor union bounds use rendered decor extents", () => {
    const { container } = render(<Harness initialCampus={campusWithOutdoorSelectionObjects()} />);
    const svg = canvasSvg(container);
    fireEvent.mouseDown(buildingGroup(container), { clientX: 160, clientY: 140, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(decorGroup(container), { clientX: 280, clientY: 160, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const outline = groupOutline(container);
    const tree = DECOR_ASSET_MAP.tree;
    const treeW = tree.defaultWidth * 3;
    const treeH = tree.defaultHeight * 3;
    expect(rectNumber(outline, "x")).toBeCloseTo(96, 0);
    expect(rectNumber(outline, "y")).toBeCloseTo(96, 0);
    expect(rectNumber(outline, "width")).toBeCloseTo((280 + treeW / 2) - 100 + 8, 0);
    expect(rectNumber(outline, "height")).toBeCloseTo(Math.max(180, 160 + treeH / 2) - 100 + 8, 0);
  });

  it("Phase 5.2 Ground Area resized bounds are included in the outdoor group boundary", () => {
    const { container } = render(<Harness initialCampus={campusWithOutdoorSelectionObjects()} />);
    const svg = canvasSvg(container);
    fireEvent.mouseDown(buildingGroup(container), { clientX: 160, clientY: 140, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(container.querySelector("[data-testid='ground-area']")!, { clientX: 500, clientY: 390, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const outline = groupOutline(container);
    expect(rectNumber(outline, "x")).toBeCloseTo(96, 0);
    expect(rectNumber(outline, "y")).toBeCloseTo(96, 0);
    expect(rectNumber(outline, "width")).toBeCloseTo(518, 0);
    expect(rectNumber(outline, "height")).toBeCloseTo(358, 0);
  });

  it("Phase 5.2 scaled and rotated decor contributes rotation-aware bounds", () => {
    const { container } = render(<Harness initialCampus={campusWithOutdoorSelectionObjects()} />);
    const svg = canvasSvg(container);
    fireEvent.mouseDown(buildingGroup(container), { clientX: 160, clientY: 140, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(decorGroup(container, "bench"), { clientX: 520, clientY: 220, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const outline = groupOutline(container);
    const unrotatedRight = 520 + (DECOR_ASSET_MAP.bench.defaultWidth * 3 * 1.4) / 2;
    expect(rectNumber(outline, "width")).toBeGreaterThan(unrotatedRight - 100 + 8);
  });

  it("Phase 5.2 group drag moves the outdoor boundary with selected objects", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={campusWithOutdoorSelectionObjects()} onCampusChange={(c) => { latest = c; }} />);
    const svg = canvasSvg(container);
    const building = buildingGroup(container);
    fireEvent.mouseDown(building, { clientX: 160, clientY: 140, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(decorGroup(container), { clientX: 280, clientY: 160, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const beforeX = rectNumber(groupOutline(container), "x");
    const beforeY = rectNumber(groupOutline(container), "y");

    fireEvent.mouseDown(building, { clientX: 160, clientY: 140, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 200, clientY: 160, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const after = groupOutline(container);
    expect(rectNumber(after, "x")).toBeGreaterThan(beforeX);
    expect(rectNumber(after, "y")).toBeGreaterThan(beforeY);
    expect(latest!.buildings.find((building) => building.id === "b1")!.x).toBeGreaterThan(100);
    expect(latest!.decorAssets!.find((asset) => asset.id === "tree1")!.x).toBeGreaterThan(280);
  });

  it("Phase 5.3 creates an interactive group drag surface for two selected Buildings", () => {
    const { container } = render(<Harness initialCampus={campusWithOutdoorSelectionObjects()} />);
    const svg = canvasSvg(container);
    fireEvent.mouseDown(buildingGroup(container), { clientX: 160, clientY: 140, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(buildingGroupByFill(container, "#0f766e"), { clientX: 405, clientY: 205, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(groupOutline(container)).toBeTruthy();
    expect(groupDragSurface(container)).toBeTruthy();
  });

  it("Phase 5.3 dragging empty space inside a two-Building group moves both rigidly", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={campusWithOutdoorSelectionObjects()} onCampusChange={(c) => { latest = c; }} />);
    const svg = canvasSvg(container);
    fireEvent.mouseDown(buildingGroup(container), { clientX: 160, clientY: 140, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(buildingGroupByFill(container, "#0f766e"), { clientX: 405, clientY: 205, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    fireEvent.mouseDown(groupDragSurface(container), { clientX: 280, clientY: 140, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 320, clientY: 160, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(latest!.buildings.find((building) => building.id === "b1")).toMatchObject({ x: 140, y: 120 });
    expect(latest!.buildings.find((building) => building.id === "b2")).toMatchObject({ x: 400, y: 190 });
    expect(rectNumber(groupOutline(container), "x")).toBeGreaterThan(96);
  });

  it("Phase 5.3 clicking group interior without movement preserves the multi-selection", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={campusWithOutdoorSelectionObjects()} onCampusChange={(c) => { latest = c; }} />);
    const svg = canvasSvg(container);
    fireEvent.mouseDown(buildingGroup(container), { clientX: 160, clientY: 140, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(buildingGroupByFill(container, "#0f766e"), { clientX: 405, clientY: 205, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    fireEvent.mouseDown(groupDragSurface(container), { clientX: 280, clientY: 140, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(groupOutline(container)).toBeTruthy();
    expect(screen.getByLabelText("2 selected outdoor objects")).toBeTruthy();
    expect(latest).toBeUndefined();
  });

  it("Phase 5.3 dragging outside the group keeps normal rubber-band canvas behavior", () => {
    const { container } = render(<Harness initialCampus={campusWithOutdoorSelectionObjects()} />);
    const svg = canvasSvg(container);
    fireEvent.mouseDown(buildingGroup(container), { clientX: 160, clientY: 140, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(buildingGroupByFill(container, "#0f766e"), { clientX: 405, clientY: 205, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(groupOutline(container)).toBeTruthy();

    fireEvent.mouseDown(svg, { clientX: 20, clientY: 20, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 45, clientY: 45, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(container.querySelector("[data-testid='campus-group-outline']")).toBeNull();
  });

  it("Phase 5.3 Shift on the group surface does not initiate group movement", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={campusWithOutdoorSelectionObjects()} onCampusChange={(c) => { latest = c; }} />);
    const svg = canvasSvg(container);
    fireEvent.mouseDown(buildingGroup(container), { clientX: 160, clientY: 140, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(buildingGroupByFill(container, "#0f766e"), { clientX: 405, clientY: 205, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    fireEvent.mouseDown(groupDragSurface(container), { clientX: 280, clientY: 140, shiftKey: true, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 320, clientY: 160, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(latest).toBeUndefined();
  });

  it("Phase 5.3 mixed Building + Decor + Ground Area moves from empty group space", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={campusWithOutdoorSelectionObjects()} onCampusChange={(c) => { latest = c; }} />);
    const svg = canvasSvg(container);
    fireEvent.mouseDown(buildingGroup(container), { clientX: 160, clientY: 140, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(decorGroup(container), { clientX: 280, clientY: 160, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(container.querySelector("[data-testid='ground-area']")!, { clientX: 500, clientY: 390, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    fireEvent.mouseDown(groupDragSurface(container), { clientX: 320, clientY: 300, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 360, clientY: 320, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(latest!.buildings.find((building) => building.id === "b1")!.x).toBeGreaterThan(100);
    expect(latest!.decorAssets!.find((asset) => asset.id === "tree1")!.x).toBeGreaterThan(280);
    expect(latest!.decorAssets!.find((asset) => asset.id === "ground1")!.x).toBeGreaterThan(500);
  });

  it("Phase 5.3 pointer offset causes no initial jump before movement", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={campusWithOutdoorSelectionObjects()} onCampusChange={(c) => { latest = c; }} />);
    const svg = canvasSvg(container);
    fireEvent.mouseDown(buildingGroup(container), { clientX: 160, clientY: 140, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(buildingGroupByFill(container, "#0f766e"), { clientX: 405, clientY: 205, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    fireEvent.mouseDown(groupDragSurface(container), { clientX: 280, clientY: 140, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 280, clientY: 140, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(latest).toBeUndefined();
    expect(groupOutline(container)).toBeTruthy();
  });

  it("Phase 5.3 one empty-space group drag creates one undo history operation", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={campusWithOutdoorSelectionObjects()} onCampusChange={(c) => { latest = c; }} />);
    const svg = canvasSvg(container);
    fireEvent.mouseDown(buildingGroup(container), { clientX: 160, clientY: 140, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(buildingGroupByFill(container, "#0f766e"), { clientX: 405, clientY: 205, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    fireEvent.mouseDown(groupDragSurface(container), { clientX: 280, clientY: 140, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 320, clientY: 160, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(latest!.buildings.find((building) => building.id === "b1")!.x).toBe(140);

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(latest!.buildings.find((building) => building.id === "b1")!.x).toBe(100);
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(latest!.buildings.find((building) => building.id === "b1")!.x).toBe(100);
  });







  it("Phase 5.4 Pathway hover shows width preview", () => {
    const { container } = render(<Harness />);
    const svg = canvasSvg(container);
    fireEvent.click(screen.getByRole("button", { name: "Pathway" }));
    fireEvent.mouseMove(svg, { clientX: 220, clientY: 220, bubbles: true });

    const preview = container.querySelector("[data-testid='path-paint-preview'] circle") as SVGCircleElement;
    expect(preview).toBeTruthy();
    expect(preview.getAttribute("r")).toBe("6");
  });

  it("Phase 5.4 Pathway drag creates one editable simplified CampusPath with persisted width", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness onCampusChange={(c) => { latest = c; }} />);
    const svg = canvasSvg(container);
    fireEvent.click(screen.getByRole("button", { name: "Pathway" }));
    fireEvent.click(screen.getByRole("button", { name: "Road / Driveway" }));
    for (const value of ["24", "26"]) {
      fireEvent.change(screen.getByLabelText("Pathway width"), { target: { value } });
    }
    fireEvent.mouseDown(svg, { clientX: 100, clientY: 100, bubbles: true });
    for (let i = 0; i < 14; i += 1) {
      fireEvent.mouseMove(svg, { clientX: 100 + i * 12, clientY: 100 + (i % 2 === 0 ? 0 : 8), bubbles: true });
    }
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(latest!.paths).toHaveLength(1);
    expect(latest!.paths[0]).toMatchObject({ type: "road", width: 26 });
    expect(latest!.paths[0].points.length).toBeGreaterThanOrEqual(2);
    expect(latest!.paths[0].points.length).toBeLessThan(14);
    expect(container.querySelector("[data-testid='path-width-handle']")).toBeTruthy();
  });

  it("Phase 5.4 existing old Campus.paths still load as editable pathways", () => {
    const campus = makeCampus();
    campus.paths = [{ id: "old-path", type: "walkway", color: "#94a3b8", width: 10, points: [{ x: 80, y: 80 }, { x: 150, y: 120 }, { x: 220, y: 120 }] }];
    const { container } = render(<Harness initialCampus={campus} />);
    const svg = canvasSvg(container);

    expect(container.querySelector("[data-testid='campus-path']")).toBeTruthy();
    fireEvent.mouseDown(container.querySelector("[data-testid='campus-path']")!, { clientX: 150, clientY: 120, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(container.querySelector("[data-testid='path-width-handle']")).toBeTruthy();
  });

















  it("Phase 5.5 simple Pathway strokes produce low point counts and clean axes", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness onCampusChange={(c) => { latest = c; }} />);
    const svg = canvasSvg(container);
    fireEvent.click(screen.getByRole("button", { name: "Pathway" }));
    fireEvent.mouseDown(svg, { clientX: 100, clientY: 200, bubbles: true });
    for (let i = 0; i < 18; i += 1) {
      fireEvent.mouseMove(svg, { clientX: 100 + i * 10, clientY: 200 + (i % 2 === 0 ? 4 : -5), bubbles: true });
    }
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(latest!.paths).toHaveLength(1);
    expect(latest!.paths[0].points).toHaveLength(2);
    expect(latest!.paths[0].points[0].y).toBe(latest!.paths[0].points[1].y);
  });

  it("Phase 5.5 Pathway editing remains functional after cleaned stroke creation", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness onCampusChange={(c) => { latest = c; }} />);
    const svg = canvasSvg(container);
    fireEvent.click(screen.getByRole("button", { name: "Pathway" }));
    fireEvent.mouseDown(svg, { clientX: 180, clientY: 240, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 260, clientY: 280, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(latest!.paths[0].points.length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector("[data-testid='path-width-handle']")).toBeTruthy();
    expect(container.querySelector("[data-testid='path-width-control']")).toBeTruthy();
  });

  it("Phase 5.5 outdoor Waypoint alignment guides appear within threshold", () => {
    const { container } = render(<Harness initialCampus={seededCampus()} />);
    const svg = openNavigationLayer(container);
    fireEvent.click(screen.getByRole("button", { name: "Add Waypoint" }));
    fireEvent.mouseMove(svg, { clientX: 210, clientY: 260, bubbles: true });

    expect(container.querySelector("[data-testid='alignment-guide']")).toBeTruthy();
  });







  it("Phase 5.6 removes Ground Paint, Ground Eraser, and Ground Area from active authoring", () => {
    render(<Harness />);
    expect(screen.queryByRole("button", { name: "Ground Paint" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Ground Eraser" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Assets" }));
    expect(screen.queryByRole("button", { name: /Ground Area/ })).toBeNull();
  });

  it("Phase 5.6 creates horizontal, vertical, and free diagonal Pathways with exactly two points", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness onCampusChange={(c) => { latest = c; }} />);
    const svg = canvasSvg(container);
    fireEvent.click(screen.getByRole("button", { name: "Pathway" }));

    fireEvent.mouseDown(svg, { clientX: 80, clientY: 100, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 180, clientY: 104, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(latest!.paths[0].points).toEqual([{ x: 80, y: 100 }, { x: 180, y: 100 }]);

    fireEvent.click(screen.getByRole("button", { name: "Pathway" }));
    fireEvent.mouseDown(svg, { clientX: 220, clientY: 100, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 224, clientY: 180, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(latest!.paths[1].points).toEqual([{ x: 220, y: 100 }, { x: 220, y: 180 }]);

    fireEvent.click(screen.getByRole("button", { name: "Pathway" }));
    fireEvent.mouseDown(svg, { clientX: 260, clientY: 100, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 330, clientY: 135, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(latest!.paths[2].points).toEqual([{ x: 260, y: 100 }, { x: 330, y: 135 }]);
  });

  it("Phase 5.6 near-45 Pathway placement snaps with guides, while off-angle diagonals remain free", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness onCampusChange={(c) => { latest = c; }} />);
    const svg = canvasSvg(container);
    fireEvent.click(screen.getByRole("button", { name: "Pathway" }));
    fireEvent.mouseDown(svg, { clientX: 100, clientY: 100, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 150, clientY: 154, bubbles: true });
    expect(container.querySelector("[data-testid='alignment-guide']")).toBeTruthy();
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(latest!.paths[0].points[1]).toEqual({ x: 152, y: 152 });

    fireEvent.click(screen.getByRole("button", { name: "Pathway" }));
    fireEvent.mouseDown(svg, { clientX: 100, clientY: 200, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 170, clientY: 232, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(latest!.paths[1].points[1]).toEqual({ x: 170, y: 232 });
  });

  it("Phase 5.6 endpoint extension adds one diagonal control point", () => {
    let latest: Campus | undefined;
    const campus = makeCampus();
    campus.paths = [{ id: "p1", type: "walkway", color: "#94a3b8", width: 12, points: [{ x: 100, y: 100 }, { x: 180, y: 100 }] }];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    const svg = canvasSvg(container);
    fireEvent.mouseDown(container.querySelector("[data-testid='campus-path']")!, { clientX: 140, clientY: 100, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const endHandle = Array.from(container.querySelectorAll("[data-testid='path-extension-handle']")).find((node) => node.getAttribute("data-point-index") === "1")!;
    fireEvent.mouseDown(endHandle.querySelector("circle")!, { clientX: 200, clientY: 100, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 230, clientY: 150, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(latest!.paths[0].points).toEqual([{ x: 100, y: 100 }, { x: 180, y: 100 }, { x: 230, y: 150 }]);
  });

  it("Phase 5.6 endpoint and diagonal T-junction snaps share exact coordinates without nav edges", () => {
    let latest: Campus | undefined;
    const campus = makeCampus();
    campus.paths = [{ id: "main", type: "walkway", color: "#94a3b8", width: 12, points: [{ x: 100, y: 100 }, { x: 220, y: 220 }] }];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    const svg = canvasSvg(container);
    fireEvent.click(screen.getByRole("button", { name: "Pathway" }));
    fireEvent.mouseDown(svg, { clientX: 260, clientY: 100, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 222, clientY: 218, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(latest!.paths[1].points[1]).toEqual({ x: 220, y: 220 });

    fireEvent.click(screen.getByRole("button", { name: "Pathway" }));
    fireEvent.mouseDown(svg, { clientX: 250, clientY: 140, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 160, clientY: 158, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(latest!.paths.find((path) => path.id === "main")!.points).toContainEqual({ x: 159, y: 159 });
    expect(latest!.paths[2].points[1]).toEqual({ x: 159, y: 159 });
    expect(latest!.navEdges ?? []).toHaveLength(0);
  });

  it("Phase 5.6 Waypoint snaps to diagonal Pathway centerline and Pathway junctions", () => {
    let latest: Campus | undefined;
    const campus = makeCampus();
    campus.paths = [
      { id: "main", type: "walkway", color: "#94a3b8", width: 12, points: [{ x: 300, y: 300 }, { x: 350, y: 350 }, { x: 420, y: 420 }] },
      { id: "branch", type: "road", color: "#cbd5e1", width: 22, points: [{ x: 350, y: 350 }, { x: 430, y: 310 }] },
    ];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.click(screen.getByRole("button", { name: "Add Waypoint" }));
    fireEvent.mouseDown(svg, { clientX: 376, clientY: 374, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(latest!.navNodes![0]).toMatchObject({ x: 375, y: 375 });

    fireEvent.click(screen.getByRole("button", { name: "Add Waypoint" }));
    fireEvent.mouseDown(svg, { clientX: 353, clientY: 349, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(latest!.navNodes![1]).toMatchObject({ x: 350, y: 350 });
  });

  it("Phase 5.6 Navigation sidebar is Hierarchy only and Design restores Assets", () => {
    const { container } = render(<Harness initialCampus={seededCampus()} />);
    fireEvent.click(screen.getByRole("button", { name: "Assets" }));
    expect(screen.getByText("Campus Objects")).toBeTruthy();
    openNavigationLayer(container);
    expect(screen.getByTestId("navigation-hierarchy-sidebar")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Assets" })).toBeNull();
    expect(screen.queryByText("Workflow")).toBeNull();
    fireEvent.click(screen.getByText("Campus"));
    expect(screen.getByRole("button", { name: "Assets" })).toBeTruthy();
  });

  it("Phase 5.6 save/reload preserves diagonal and joined Pathways", () => {
    let latest: Campus | undefined;
    const first = render(<Harness onCampusChange={(c) => { latest = c; }} />);
    const svg = canvasSvg(first.container);
    fireEvent.click(screen.getByRole("button", { name: "Pathway" }));
    fireEvent.mouseDown(svg, { clientX: 100, clientY: 100, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 180, clientY: 160, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.click(screen.getByRole("button", { name: "Pathway" }));
    fireEvent.mouseDown(svg, { clientX: 240, clientY: 100, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 181, clientY: 159, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(latest!.paths[1].points[1]).toEqual(latest!.paths[0].points[1]);

    first.unmount();
    const second = render(<Harness initialCampus={latest!} />);
    const loadedPaths = second.container.querySelectorAll("[data-testid='campus-path']");
    expect(loadedPaths).toHaveLength(2);
  });

  it("Phase 5.7 endpoint extension can close a pathway back onto its own start point", () => {
    let latest: Campus | undefined;
    const campus = makeCampus();
    campus.paths = [{ id: "loop", type: "walkway", color: "#94a3b8", width: 12, points: [{ x: 100, y: 100 }, { x: 180, y: 100 }] }];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    const svg = canvasSvg(container);
    fireEvent.mouseDown(container.querySelector("[data-path-id='loop']")!, { clientX: 140, clientY: 100, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const endHandle = Array.from(container.querySelectorAll("[data-testid='path-extension-handle']")).find((node) => node.getAttribute("data-point-index") === "1")!;
    fireEvent.mouseDown(endHandle.querySelector("circle")!, { clientX: 200, clientY: 100, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 101, clientY: 100, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(latest!.paths[0].points.at(-1)).toEqual({ x: 100, y: 100 });
    expect(container.querySelectorAll("[data-testid='path-junction-handle']").length).toBeGreaterThanOrEqual(2);
  });

  it("Phase 5.7 endpoint extension can self T-junction onto an existing same-path segment", () => {
    let latest: Campus | undefined;
    const campus = makeCampus();
    campus.paths = [{
      id: "self-t",
      type: "road",
      color: "#cbd5e1",
      width: 20,
      points: [{ x: 100, y: 100 }, { x: 240, y: 100 }, { x: 240, y: 200 }],
    }];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    const svg = canvasSvg(container);
    fireEvent.mouseDown(container.querySelector("[data-path-id='self-t']")!, { clientX: 240, clientY: 150, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const endHandle = Array.from(container.querySelectorAll("[data-testid='path-extension-handle']")).find((node) => node.getAttribute("data-point-index") === "2")!;
    fireEvent.mouseDown(endHandle.querySelector("circle")!, { clientX: 240, clientY: 220, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 160, clientY: 100, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(latest!.paths[0].points).toContainEqual({ x: 160, y: 100 });
    expect(latest!.paths[0].points.at(-1)).toEqual({ x: 160, y: 100 });
  });

  it("Phase 5.7 pathway bend controls add and remove a diagonal midpoint", () => {
    let latest: Campus | undefined;
    const campus = makeCampus();
    campus.paths = [{ id: "diag", type: "walkway", color: "#94a3b8", width: 12, points: [{ x: 100, y: 100 }, { x: 200, y: 200 }] }];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    const svg = canvasSvg(container);
    fireEvent.mouseDown(container.querySelector("[data-path-id='diag']")!, { clientX: 150, clientY: 150, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    fireEvent.click(screen.getByRole("button", { name: /Add Bend/ }));
    expect(latest!.paths[0].points).toEqual([{ x: 100, y: 100 }, { x: 150, y: 150 }, { x: 200, y: 200 }]);
    fireEvent.click(screen.getByRole("button", { name: /Remove Bend/ }));
    expect(latest!.paths[0].points).toEqual([{ x: 100, y: 100 }, { x: 200, y: 200 }]);
  });

  it("Phase 5.7 moving a shared pathway junction preserves exact coordinate links", () => {
    let latest: Campus | undefined;
    const campus = makeCampus();
    campus.paths = [
      { id: "main", type: "walkway", color: "#94a3b8", width: 12, points: [{ x: 100, y: 200 }, { x: 200, y: 200 }] },
      { id: "branch", type: "accessible", color: "#a7f3d0", width: 10, points: [{ x: 200, y: 200 }, { x: 260, y: 260 }] },
    ];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    const svg = canvasSvg(container);
    fireEvent.mouseDown(container.querySelector("[data-path-id='main']")!, { clientX: 150, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const handle = container.querySelector("[data-testid='path-junction-handle'][data-path-id='main'][data-point-index='1']")!;
    fireEvent.mouseDown(handle, { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 240, clientY: 240, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(latest!.paths.find((path) => path.id === "main")!.points[1]).toEqual({ x: 240, y: 240 });
    expect(latest!.paths.find((path) => path.id === "branch")!.points[0]).toEqual({ x: 240, y: 240 });
  });

  it("Phase 5.7 Disconnect breaks a coordinate-linked pathway junction without changing the other path", () => {
    let latest: Campus | undefined;
    const campus = makeCampus();
    campus.paths = [
      { id: "main", type: "walkway", color: "#94a3b8", width: 12, points: [{ x: 100, y: 200 }, { x: 200, y: 200 }] },
      { id: "branch", type: "road", color: "#cbd5e1", width: 22, points: [{ x: 200, y: 200 }, { x: 260, y: 200 }] },
    ];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    const svg = canvasSvg(container);
    fireEvent.mouseDown(container.querySelector("[data-path-id='main']")!, { clientX: 150, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const handle = container.querySelector("[data-testid='path-junction-handle'][data-path-id='main'][data-point-index='1']")!;
    fireEvent.mouseDown(handle, { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.click(screen.getByRole("button", { name: /Disconnect/ }));

    // B5 Phase 5.12: disconnect uses disconnectedJunctionKeys instead of point offset
    expect(latest!.paths.find((path) => path.id === "main")!.points[1]).toEqual({ x: 200, y: 200 });
    expect(latest!.paths.find((path) => path.id === "main")!.disconnectedJunctionKeys).toContain("200:200");
    expect(latest!.paths.find((path) => path.id === "branch")!.points[0]).toEqual({ x: 200, y: 200 });
  });

  it("Phase 5.7 Add Path to Navigation is idempotent for a closed pathway loop", () => {
    let latest: Campus | undefined;
    const campus = makeCampus();
    campus.paths = [{
      id: "loop",
      type: "walkway",
      color: "#94a3b8",
      width: 12,
      points: [{ x: 100, y: 100 }, { x: 180, y: 100 }, { x: 180, y: 180 }, { x: 100, y: 100 }],
    }];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    const svg = canvasSvg(container);
    fireEvent.mouseDown(container.querySelector("[data-path-id='loop']")!, { clientX: 140, clientY: 100, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.click(screen.getByRole("button", { name: /Add Path to Navigation/ }));
    expect(latest!.navNodes).toHaveLength(3);
    expect(latest!.navEdges).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: /Add Path to Navigation/ }));
    expect(latest!.navNodes).toHaveLength(3);
    expect(latest!.navEdges).toHaveLength(3);
  });

  it("Phase 5.7 Add Path to Navigation reuses junction nodes across T-junction pathways", () => {
    let latest: Campus | undefined;
    const campus = makeCampus();
    campus.paths = [
      { id: "main", type: "road", color: "#cbd5e1", width: 22, points: [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 300, y: 100 }] },
      { id: "branch", type: "walkway", color: "#94a3b8", width: 12, points: [{ x: 200, y: 100 }, { x: 200, y: 200 }] },
    ];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    const svg = canvasSvg(container);
    fireEvent.mouseDown(container.querySelector("[data-path-id='main']")!, { clientX: 180, clientY: 100, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.click(screen.getByRole("button", { name: /Add Path to Navigation/ }));
    fireEvent.mouseDown(container.querySelector("[data-path-id='branch']")!, { clientX: 200, clientY: 150, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.click(screen.getByRole("button", { name: /Add Path to Navigation/ }));

    expect(latest!.navNodes!.filter((node) => node.x === 200 && node.y === 100)).toHaveLength(1);
    expect(latest!.navNodes).toHaveLength(4);
    expect(latest!.navEdges).toHaveLength(3);
  });

  it("Phase 5.2 Navigation mode multi-selection renders the NAV graph group outline (bounds include bend geometry)", () => {
    const { container } = render(<Harness initialCampus={campusWithOutdoorSelectionObjects()} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "v" });
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(navNodeAt(container, 300, 200), { clientX: 300, clientY: 200, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(screen.getByTestId("nav-multi-props")).toBeTruthy();
    // B5 correction: the nav multi-select now shows its OWN graph group
    // outline (bounds from the selected node + bend geometry).
    expect(container.querySelector("[data-testid='campus-group-outline']")).toBeTruthy();
  });

  it("Phase 5.3 Navigation mode group outline provides a real empty-space drag surface (rigid move, no rubber-band)", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={campusWithOutdoorSelectionObjects()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "v" });
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(navNodeAt(container, 300, 200), { clientX: 300, clientY: 200, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(screen.getByTestId("nav-multi-props")).toBeTruthy();
    // B5 correction: the nav graph group outline now includes a real drag
    // surface — pointerdown on empty interior starts the SAME rigid group drag.
    const surface = container.querySelector("[data-testid='campus-group-drag-surface']") as SVGRectElement | null;
    expect(surface).toBeTruthy();
    // Grab EMPTY interior space between the two nodes (bounds ≈ 182..318 x
    // 182..218 with padding; (250,190) is clear of both node hit circles) and
    // drag by (+50, +20): both nodes translate by the SAME vector — rigid
    // move, selection kept, no rubber-band.
    fireEvent.mouseDown(surface!, { clientX: 250, clientY: 190, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 300, clientY: 210, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(latest).toBeDefined();
    const nodes = latest!.navNodes!;
    expect(nodes.find((n) => n.id === "nnA")).toMatchObject({ x: 250, y: 220 });
    expect(nodes.find((n) => n.id === "nnB")).toMatchObject({ x: 350, y: 220 });
    // Multi-select is retained (no selection clear / rubber-band).
    expect(screen.getByTestId("nav-multi-props")).toBeTruthy();
  });
});

describe("B5 Final — bulk routing state semantics (multi-selection)", () => {
  function seededEdgesCampus(edges: Partial<NavigationEdge>[]): Campus {
    const campus = seededCampus();
    campus.navEdges = edges.map((e, i) => ({
      id: `ne${i + 1}`,
      startNodeId: "nnA",
      endNodeId: "nnB",
      distance: 100,
      bidirectional: true,
      accessible: true,
      emergencySafe: true,
      closed: false,
      type: "walkway",
      color: "#16a34a",
      width: 4,
      bendPoints: [{ x: 250, y: 180 }],
      ...e,
    }));
    return campus;
  }

  /** Marquee-select the whole graph (both nodes + edges) in the Navigation layer. */
  function selectAllGraph(container: HTMLElement): SVGSVGElement {
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "v" });
    fireEvent.mouseDown(svg, { clientX: 150, clientY: 150, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 350, clientY: 250, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.getByTestId("nav-multi-props")).toBeTruthy();
    return svg;
  }

  function edgeState(latest: Campus | undefined, id: string): Partial<NavigationEdge> {
    const e = latest!.navEdges!.find((ed) => ed.id === id)!;
    return {
      accessible: e.accessible,
      inaccessibleReason: e.inaccessibleReason,
      emergencySafe: e.emergencySafe,
      emergencyReason: e.emergencyReason,
      closed: e.closed,
      bendPoints: e.bendPoints,
      bidirectional: e.bidirectional,
    };
  }

  it("graph multi-select shows ONLY the Graph Multi-Select panel — no stray single-edge Name/Type/Route Availability", () => {
    let latest: Campus | undefined;
    const campus = seededEdgesCampus([{}, {}]);
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "v" });

    // Shift-click both edges — the flow that used to leave `selected` set while
    // multi-selecting, so the single-edge inspector rendered BELOW the summary.
    const edges = Array.from(container.querySelectorAll("[data-testid='nav-edge']"));
    expect(edges.length).toBe(2);
    fireEvent.mouseDown(edges[0], { clientX: 250, clientY: 200, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(edges[1], { clientX: 250, clientY: 200, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    // Multi-select summary is shown…
    expect(screen.getByTestId("nav-multi-props")).toBeTruthy();
    // …and the single-edge inspector (Connection/Route Availability/Reverse) is NOT.
    expect(screen.queryByText("Navigation Connection")).toBeNull();
    expect(screen.queryByText("Route Availability")).toBeNull();
    expect(container.querySelector("[data-testid='nav-edge-reverse-direction']")).toBeNull();

    // Bulk routing functions still work from the multi panel.
    fireEvent.click(screen.getByRole("button", { name: "Mark closed" }));
    expect(latest!.navEdges!.every((e) => e.closed === true)).toBe(true);
    expect(screen.getByTestId("nav-multi-props")).toBeTruthy();
  });

  it("node multi-selection hides the single Waypoint Name/Type inspector", () => {
    const { container } = render(<Harness initialCampus={seededCampus()} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "v" });
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(navNodeAt(container, 300, 200), { clientX: 300, clientY: 200, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(screen.getByTestId("nav-multi-props")).toBeTruthy();
    expect(screen.queryByTestId("nav-node-props")).toBeNull();
  });

  it("canvas closed ✕ marker appears on Mark closed and DISAPPEARS after Mark accessible", () => {
    let latest: Campus | undefined;
    const campus = seededEdgesCampus([{}, {}]);
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    selectAllGraph(container);
    const closedMarkers = () => container.querySelectorAll("[data-testid='nav-edge-closed-marker']").length;
    expect(closedMarkers()).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: "Mark closed" }));
    expect(latest!.navEdges!.every((e) => e.closed === true)).toBe(true);
    expect(closedMarkers()).toBe(2);

    // Reopening via Mark accessible must clear the closed flag AND the visual
    // closed marker on the canvas immediately — no reselect, no reload.
    fireEvent.click(screen.getByRole("button", { name: "Mark accessible" }));
    expect(latest!.navEdges!.every((e) => e.accessible === true && e.closed === false)).toBe(true);
    expect(closedMarkers()).toBe(0);
    expect(screen.getByTestId("nav-multi-props")).toBeTruthy();
  });

  it("Mark closed sets closed=true on every selected edge and preserves metadata", () => {
    let latest: Campus | undefined;
    const campus = seededEdgesCampus([
      { accessible: false, inaccessibleReason: "stairs", emergencySafe: false, emergencyReason: "hazard" },
      {},
    ]);
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    selectAllGraph(container);

    fireEvent.click(screen.getByRole("button", { name: "Mark closed" }));
    expect(latest!.navEdges!.every((e) => e.closed === true)).toBe(true);
    // Unrelated metadata preserved
    expect(edgeState(latest, "ne1")).toMatchObject({
      accessible: false, inaccessibleReason: "stairs", emergencySafe: false, emergencyReason: "hazard",
      bidirectional: true, bendPoints: [{ x: 250, y: 180 }],
    });
    expect(edgeState(latest, "ne2")).toMatchObject({ accessible: true, emergencySafe: true, bendPoints: [{ x: 250, y: 180 }] });
    // Selection stays put — the panel is still open for the next action.
    expect(screen.getByTestId("nav-multi-props")).toBeTruthy();
  });

  it("Mark closed then Mark accessible reopens and clears the inaccessible reason", () => {
    let latest: Campus | undefined;
    const campus = seededEdgesCampus([{ inaccessibleReason: "narrow_path" }, {}]);
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    selectAllGraph(container);

    fireEvent.click(screen.getByRole("button", { name: "Mark closed" }));
    expect(latest!.navEdges!.every((e) => e.closed === true)).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Mark accessible" }));
    expect(latest!.navEdges!.every((e) => e.accessible === true && e.closed === false)).toBe(true);
    expect(latest!.navEdges!.every((e) => e.inaccessibleReason === undefined)).toBe(true);
    // Geometry untouched by the whole closed→accessible cycle.
    expect(latest!.navEdges!.every((e) => JSON.stringify(e.bendPoints) === JSON.stringify([{ x: 250, y: 180 }]))).toBe(true);
    expect(screen.getByTestId("nav-multi-props")).toBeTruthy();
  });

  it("Mark closed then Mark not accessible reopens with accessible=false and a reason", () => {
    let latest: Campus | undefined;
    const campus = seededEdgesCampus([{ inaccessibleReason: "stairs" }, {}]);
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    selectAllGraph(container);

    fireEvent.click(screen.getByRole("button", { name: "Mark closed" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark not accessible" }));
    expect(latest!.navEdges!.every((e) => e.accessible === false && e.closed === false)).toBe(true);
    // Existing reason preserved on ne1; default "other" on ne2.
    expect(latest!.navEdges!.find((e) => e.id === "ne1")!.inaccessibleReason).toBe("stairs");
    expect(latest!.navEdges!.find((e) => e.id === "ne2")!.inaccessibleReason).toBe("other");
    expect(screen.getByTestId("nav-multi-props")).toBeTruthy();
  });

  it("Mark closed then Mark emergency safe reopens with emergencySafe=true and clears the reason", () => {
    let latest: Campus | undefined;
    const campus = seededEdgesCampus([{ emergencySafe: false, emergencyReason: "construction" }, {}]);
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    selectAllGraph(container);

    fireEvent.click(screen.getByRole("button", { name: "Mark closed" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark emergency safe" }));
    expect(latest!.navEdges!.every((e) => e.emergencySafe === true && e.closed === false)).toBe(true);
    expect(latest!.navEdges!.every((e) => e.emergencyReason === undefined)).toBe(true);
    expect(screen.getByTestId("nav-multi-props")).toBeTruthy();
  });

  it("Mark open reopens while preserving accessible/emergency/direction metadata", () => {
    let latest: Campus | undefined;
    const campus = seededEdgesCampus([
      { accessible: false, inaccessibleReason: "narrow_path", emergencySafe: false, emergencyReason: "hazard", closed: true },
    ]);
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    selectAllGraph(container);

    fireEvent.click(screen.getByRole("button", { name: "Mark open" }));
    expect(edgeState(latest, "ne1")).toMatchObject({
      closed: false,
      accessible: false,
      inaccessibleReason: "narrow_path",
      emergencySafe: false,
      emergencyReason: "hazard",
      bidirectional: true,
      bendPoints: [{ x: 250, y: 180 }],
    });
  });

  it("mixed open/closed selection: bulk action updates ALL selected edges and shows mixed hint", () => {
    let latest: Campus | undefined;
    const campus = seededEdgesCampus([{ closed: true }, {}]);
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    selectAllGraph(container);

    // Mixed closed states → neither Mark open nor Mark closed is fully active.
    expect(screen.getByText(/mixed open\/closed states/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Mark accessible" }));
    // The action applies to the WHOLE selection, not only the open edge.
    expect(latest!.navEdges!.every((e) => e.accessible === true && e.closed === false)).toBe(true);
    expect(screen.queryByText(/mixed open\/closed states/i)).toBeNull();
  });

  it("one button press = one history entry; undo restores the previous bulk state", () => {
    let latest: Campus | undefined;
    const campus = seededEdgesCampus([{ inaccessibleReason: "other" }, {}]);
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    selectAllGraph(container);

    // State 1: closed
    fireEvent.click(screen.getByRole("button", { name: "Mark closed" }));
    expect(latest!.navEdges!.every((e) => e.closed === true)).toBe(true);

    // State 2: accessible + reopened
    fireEvent.click(screen.getByRole("button", { name: "Mark accessible" }));
    expect(latest!.navEdges!.every((e) => e.accessible === true && e.closed === false)).toBe(true);

    // ONE Ctrl+Z restores the whole Mark closed state in one step.
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(latest!.navEdges!.every((e) => e.closed === true)).toBe(true);
    expect(latest!.navEdges!.every((e) => e.accessible === true)).toBe(true);

    // A second Ctrl+Z returns to the original seeded state (ne1 keeps its reason).
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(latest!.navEdges!.every((e) => e.closed === false)).toBe(true);
    expect(latest!.navEdges!.find((e) => e.id === "ne1")!.inaccessibleReason).toBe("other");
    expect(latest!.navEdges!.find((e) => e.id === "ne1")!.accessible).toBe(true);
  });
});

describe("B5 Final — placed objects turn touching nav edges red", () => {
  function campusWithEdgeAnd(decor: Partial<CampusDecorAsset>[]): Campus {
    const campus = seededCampus();
    campus.navEdges = [{
      id: "ne1", startNodeId: "nnA", endNodeId: "nnB", distance: 100, bidirectional: true,
      accessible: true, type: "walkway", color: "#16a34a", width: 4,
    }];
    campus.decorAssets = decor.map((d, i) => ({
      id: `d${i + 1}`, type: "fountain", name: "Fountain", x: 236, y: 186,
      width: 28, height: 28, rotation: 0, scale: 1, color: "#38bdf8", ...d,
    }));
    return campus;
  }

  function edgeStrokes(container: HTMLElement): string[] {
    const edgeG = container.querySelector("[data-testid='nav-edge']");
    if (!edgeG) return [];
    return Array.from(edgeG.querySelectorAll("polyline")).map((p) => p.getAttribute("stroke") ?? "");
  }

  it("placing a decor asset ON a nav edge turns the edge red in the Navigation layer", () => {
    const campus = campusWithEdgeAnd([{}]);
    const { container } = render(<Harness initialCampus={campus} />);
    openNavigationLayer(container);
    expect(edgeStrokes(container)).toContain("#dc2626");
  });

  it("the SAME red indicator shows in the Campus layer navigation overlay (especially in campus tab)", () => {
    const campus = campusWithEdgeAnd([{}]);
    const { container } = render(<Harness initialCampus={campus} />);
    // Stay on the Campus layer and toggle the read-only navigation overlay on.
    fireEvent.click(screen.getByRole("button", { name: /show navigation overlay/i }));
    expect(edgeStrokes(container)).toContain("#dc2626");
  });

  it("a Ground Area under the edge does NOT red-line it (background terrain)", () => {
    const campus = campusWithEdgeAnd([{ type: "ground-area", x: 230, y: 190, width: 80, height: 20 }]);
    const { container } = render(<Harness initialCampus={campus} />);
    openNavigationLayer(container);
    expect(edgeStrokes(container)).not.toContain("#dc2626");
  });

  it("moving the decor OFF the edge clears the red state live (no reload)", () => {
    let latest: Campus | undefined;
    const campus = campusWithEdgeAnd([{}]);
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    expect(edgeStrokes(container)).toContain("#dc2626");

    // Back to the Campus layer, drag the fountain far from the edge — the
    // live memo must re-derive and clear the red state immediately.
    fireEvent.click(screen.getByText("Campus"));
    fireEvent.mouseDown(decorGroup(container, "fountain"), { clientX: 236, clientY: 186, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 600, clientY: 500, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(latest!.decorAssets!.find((d) => d.id === "d1")!.x).toBeGreaterThan(500);

    fireEvent.click(screen.getByText("Navigation"));
    expect(edgeStrokes(container)).not.toContain("#dc2626");
  });
});

describe("B6 manual-QA: compact asset labels", () => {
  it("long labels use the compact line-clamped styling without character-level breaking", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Assets" }));

    // Campus Objects label — the longest preset ("Administration") must keep the
    // compact 2-line-clamped styling and NOT use [overflow-wrap:anywhere], which
    // allowed ugly character-level mid-word breaks ("Administra / tion").
    const adminButton = screen.getByRole("button", { name: /Administration/i });
    const adminLabel = within(adminButton).getByText("Administration");
    expect(adminLabel.className).toContain("line-clamp-2");
    expect(adminLabel.className).toContain("break-words");
    expect(adminLabel.className).not.toContain("overflow-wrap");

    // Outdoor Decor labels share the same compact size ("Recycle Bin" wraps at
    // the space, never mid-word).
    const recycleButton = screen.getByRole("button", { name: /Recycle Bin/i });
    const recycleLabel = within(recycleButton).getByText("Recycle Bin");
    expect(recycleLabel.className).toContain("line-clamp-2");
    expect(recycleLabel.className).toContain("break-words");
    expect(recycleLabel.className).not.toContain("overflow-wrap");
    expect(recycleLabel.className).toContain("text-[8px]");
  });

  it("asset controls remain usable (labels still render as draggable buttons)", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Assets" }));

    for (const label of ["Academic", "Laboratory", "Library", "Gymnasium", "Administration", "Other"]) {
      expect(screen.getByRole("button", { name: new RegExp(label) })).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: /Large Tree/i })).toBeTruthy();
  });
});

/** Read the camera (pan/zoom) from the svg content-group transform. */
function cameraOf(container: HTMLElement): { pan: { x: number; y: number }; zoom: number } {
  const g = container.querySelector("svg > g[transform]");
  expect(g).toBeTruthy();
  const t = g!.getAttribute("transform")!;
  const m = t.match(/translate\(([-\d.]+),([-\d.]+)\) scale\(([-\d.]+)\)/);
  expect(m, `camera transform: ${t}`).toBeTruthy();
  return { pan: { x: Number(m![1]), y: Number(m![2]) }, zoom: Number(m![3]) };
}

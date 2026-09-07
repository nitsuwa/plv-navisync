import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { toast } from "sonner";
import { CampusEditor } from "../CampusEditor";
import type { Campus } from "../types";

// ── B5 Phase 6.12 — Outdoor Connect interaction REPLACED with the Floor Editor
// model: empty-space clicks pin the FULL preview shape (orthogonal corner +
// click point), the click point becomes the next continuation anchor, the
// preview renders the same geometry the click commits, Ctrl+Z removes the
// whole click GROUP (Ctrl+Y restores it), Shift constrains H/V, and
// obstacle-crossing pins are rejected at click time.

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
      floors: [{ id: "f1", buildingId: "b1", number: 1, label: "Ground Floor", rooms: [], paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [] }],
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

function seededCampus(): Campus {
  const campus = makeCampus();
  campus.navNodes = [
    { id: "nnA", name: "Gate A", type: "outdoor", x: 200, y: 200, campusId: "c1", accessible: true, color: "#16a34a" },
    { id: "nnB", name: "Gate B", type: "outdoor", x: 300, y: 300, campusId: "c1", accessible: true, color: "#16a34a" },
  ];
  return campus;
}

function seededEntranceCampus(): Campus {
  const campus = seededCampus();
  campus.buildings = campus.buildings.map((building) => ({
    ...building,
    entrances: [{
      id: "entrance-b1",
      buildingId: building.id,
      edge: "bottom" as const,
      offset: 0.5,
      type: "general" as const,
      isPrimary: true,
      accessible: true,
    }],
  }));
  campus.navNodes = [
    { id: "entrance-node", name: "Main Entrance", type: "entrance", x: 160, y: 180, campusId: "c1", buildingId: "b1", entranceId: "entrance-b1", accessible: true, color: "#0f766e" },
    ...(campus.navNodes ?? []),
  ];
  return campus;
}

let warningSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warningSpy = vi.spyOn(toast, "warning").mockImplementation(() => "" as never);
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
  // The unified campus toolbar exposes navigation as a visibility/editing
  // control rather than the retired text tab.  Keep these interaction tests
  // focused on the Connect behavior they exercise.
  fireEvent.click(screen.getByRole("button", { name: "Show and edit the walking network" }));
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

function armConnect(container: HTMLElement, svg: SVGSVGElement) {
  fireEvent.keyDown(window, { key: "p" });
  fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
  fireEvent.mouseUp(svg, { bubbles: true });
}

afterEach(cleanup);

describe("B5 Phase 6.12 — Floor-parity Outdoor Connect interaction", () => {
  it("one diagonal empty-space click pins corner + click point (click point is never dropped)", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={seededCampus()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    armConnect(container, svg);
    fireEvent.mouseDown(svg, { clientX: 260, clientY: 260, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    // The preview now renders the FULL proposed shape starting from the start
    // node: A(200,200) → corner (260,200) → click point (260,260).
    const preview = container.querySelector("[data-testid='nav-path-preview'] polyline");
    expect(preview?.getAttribute("points")).toBe("200,200 260,200 260,260");
  });

  it("the next preview continues from the LAST pinned click point, not the corner (no stuck geometry)", async () => {
    const { container } = render(<Harness initialCampus={seededCampus()} />);
    const svg = openNavigationLayer(container);
    armConnect(container, svg);
    fireEvent.mouseDown(svg, { clientX: 260, clientY: 260, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // Move the pointer ABOVE the click point — the preview must start from the
    // pinned click point (260,260), never snap back to the corner or the source.
    fireEvent.mouseMove(svg, { clientX: 260, clientY: 180, bubbles: true });
    const preview = await waitFor(() => {
      const nextPreview = container.querySelector("[data-testid='nav-path-preview'] polyline");
      expect(nextPreview?.getAttribute("points")).toBe("200,200 260,200 260,260 260,180");
      return nextPreview;
    });
    expect(preview?.getAttribute("points")).toBe("200,200 260,200 260,260 260,180");
  });

  it("preview == commit: the proposed pins the preview shows are what the commit stores", async () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={seededCampus()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    armConnect(container, svg);
    fireEvent.mouseMove(svg, { clientX: 260, clientY: 260, bubbles: true });
    let beforeClick: string | undefined;
    await waitFor(() => {
      beforeClick = container.querySelector("[data-testid='nav-path-preview'] polyline")?.getAttribute("points");
      expect(beforeClick).toBe("200,200 260,200 260,260");
    });
    expect(beforeClick).toBe("200,200 260,200 260,260");
    // Click EXACTLY what the preview showed, then commit to B.
    fireEvent.mouseDown(svg, { clientX: 260, clientY: 260, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(svg, { clientX: 300, clientY: 300, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    const edge = latest!.navEdges![0];
    // Same shape the preview promised: A → (260,200) → (260,260) → tail (300,260).
    expect(edge.bendPoints).toEqual([
      { x: 260, y: 200 },
      { x: 260, y: 260 },
      { x: 300, y: 260 },
    ]);
  });

  it("Ctrl+Z removes the WHOLE click group (both pins of one click); second Ctrl+Z cancels the connection", () => {
    const { container } = render(<Harness initialCampus={seededCampus()} />);
    const svg = openNavigationLayer(container);
    armConnect(container, svg);
    fireEvent.mouseDown(svg, { clientX: 260, clientY: 260, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(container.querySelectorAll("[data-testid='nav-connect-pin']").length).toBe(2);

    // ONE Ctrl+Z removes both pins of that single click (never a stray half-bend).
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(container.querySelectorAll("[data-testid='nav-connect-pin']").length).toBe(0);
    // Connect is still active — the status chip remains.
    expect(screen.getAllByTestId("nav-path-status").length).toBeGreaterThan(0);

    // Second Ctrl+Z with no bends left cancels the whole unfinished connection
    // (the tool stays armed; the status chip returns to the idle start prompt).
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(screen.getByText("Select or place a start point.")).toBeTruthy();
  });

  it("Ctrl+Y restores the removed click group; a new bend after undo clears the redo stack", () => {
    const { container } = render(<Harness initialCampus={seededCampus()} />);
    const svg = openNavigationLayer(container);
    armConnect(container, svg);
    fireEvent.mouseDown(svg, { clientX: 260, clientY: 260, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(container.querySelectorAll("[data-testid='nav-connect-pin']").length).toBe(2);

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(container.querySelectorAll("[data-testid='nav-connect-pin']").length).toBe(0);
    // Ctrl+Y restores the entire click group.
    fireEvent.keyDown(window, { key: "y", ctrlKey: true });
    expect(container.querySelectorAll("[data-testid='nav-connect-pin']").length).toBe(2);

    // Undo again, then pin a NEW click — the redo stack must be cleared.
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(container.querySelectorAll("[data-testid='nav-connect-pin']").length).toBe(0);
    fireEvent.mouseDown(svg, { clientX: 280, clientY: 240, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.keyDown(window, { key: "y", ctrlKey: true });
    // Nothing restored — the new pin invalidated the redo stack, so the pins
    // stay exactly as the new click left them (2 pins for that one click).
    expect(container.querySelectorAll("[data-testid='nav-connect-pin']").length).toBe(2);
  });

  it("ten cancelled Connect drafts never accumulate persistent waypoints or edges", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={seededCampus()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      fireEvent.keyDown(window, { key: "p" });
      fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
      fireEvent.mouseUp(svg, { bubbles: true });
      fireEvent.mouseDown(svg, { clientX: 250 + attempt * 2, clientY: 250, bubbles: true });
      fireEvent.mouseUp(svg, { bubbles: true });
      fireEvent.keyDown(window, { key: "Escape" });

      expect(container.querySelectorAll("[data-testid='nav-node']")).toHaveLength(2);
      expect(container.querySelectorAll("[data-testid='nav-edge']")).toHaveLength(0);
      expect(container.querySelectorAll("[data-testid='nav-connect-pin']")).toHaveLength(0);
    }

    expect(latest).toBeUndefined();
    expect(screen.queryByTestId("nav-path-preview")).toBeNull();
  });

  it("owns the real canvas click sequence: empty clicks are draft bends, not Walking Points", async () => {
    let updates = 0;
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={seededCampus()} onCampusChange={(c) => { updates += 1; latest = c; }} />);
    const svg = openNavigationLayer(container);
    armConnect(container, svg);

    // Model the browser's actual down/up/click sequence.  Connect must consume
    // the down event before any child/legacy waypoint authoring path can see it.
    fireEvent.mouseDown(svg, { clientX: 260, clientY: 260, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.click(svg, { clientX: 260, clientY: 260, bubbles: true });
    await waitFor(() => expect(container.querySelectorAll("[data-testid='nav-connect-pin']")).toHaveLength(2));

    expect(updates).toBe(0);
    expect(latest).toBeUndefined();
    expect(container.querySelectorAll("[data-testid='nav-node']")).toHaveLength(2);
    expect(container.querySelector("[data-testid='nav-path-preview'] polyline")?.getAttribute("points"))
      .toBe("200,200 260,200 260,260");
  });

  it("uses the same exclusive Connect owner when armed from the toolbar", async () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={seededCampus()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    fireEvent.mouseDown(navNodeAt(container, 200, 200), { clientX: 200, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(svg, { clientX: 260, clientY: 260, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    await waitFor(() => expect(container.querySelectorAll("[data-testid='nav-connect-pin']")).toHaveLength(2));
    expect(latest).toBeUndefined();
    expect(container.querySelector("[data-testid='nav-path-preview'] polyline")?.getAttribute("points"))
      .toBe("200,200 260,200 260,260");
  });

  it("reuses an existing target node when the target's own hit surface is clicked", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={seededCampus()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    armConnect(container, svg);
    fireEvent.mouseDown(svg, { clientX: 260, clientY: 260, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const target = navNodeAt(container, 300, 300);
    fireEvent.mouseDown(target, { clientX: 300, clientY: 300, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(latest?.navNodes).toHaveLength(2);
    expect(latest?.navEdges).toHaveLength(1);
    expect(latest?.navEdges?.[0].startNodeId).toBe("nnA");
    expect(latest?.navEdges?.[0].endNodeId).toBe("nnB");
    expect(latest?.navEdges?.[0].bendPoints).toEqual([
      { x: 260, y: 200 },
      { x: 260, y: 260 },
      { x: 300, y: 260 },
    ]);
  });

  it("commits a direct source-to-target connection without an intermediate waypoint", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={seededCampus()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    armConnect(container, svg);
    const target = navNodeAt(container, 300, 300);
    fireEvent.mouseDown(target, { clientX: 300, clientY: 300, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(latest?.navNodes).toHaveLength(2);
    expect(latest?.navEdges).toHaveLength(1);
    expect(latest?.navEdges?.[0].startNodeId).toBe("nnA");
    expect(latest?.navEdges?.[0].endNodeId).toBe("nnB");
    // The direct edge uses the existing deterministic orthogonal geometry
    // (one bend in this diagonal fixture), but it does not create a graph
    // waypoint between the two reused endpoint IDs.
    expect(latest?.navEdges?.[0].bendPoints).toEqual([{ x: 300, y: 200 }]);
  });

  it("keeps the explicit Walking Point tool able to create a real waypoint", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={seededCampus()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "m" });
    fireEvent.mouseDown(svg, { clientX: 420, clientY: 180, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(latest?.navNodes).toHaveLength(3);
    expect(latest?.navNodes?.some((node) => node.x === 420 && node.y === 180)).toBe(true);
  });

  it("Shift-click constrains the pin to the dominant H/V axis (Floor parity)", () => {
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={seededCampus()} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    armConnect(container, svg);
    // (260,260) is equally 60px in both axes from (200,200) — Shift keeps Y at
    // the anchor (dx >= dy → horizontal), so the pin is a single point (260,200).
    fireEvent.mouseDown(svg, { clientX: 260, clientY: 260, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const preview = container.querySelector("[data-testid='nav-path-preview'] polyline");
    expect(preview?.getAttribute("points")).toBe("200,200 260,200");
  });

  it("an obstacle-crossing pin click is rejected (warning toast, no bend, Connect stays active)", () => {
    let latest: Campus | undefined;
    const campus = makeCampus();
    // Building spans (200,150)-(300,250). A(100,200) is to its LEFT at the same
    // y — a horizontal pin click through the building is rejected outright.
    campus.buildings = [{ ...campus.buildings[0], x: 200, y: 150, width: 100, height: 100 }];
    campus.navNodes = [
      { id: "nnA", name: "Gate A", type: "outdoor", x: 100, y: 200, campusId: "c1", accessible: true, color: "#16a34a" },
      { id: "nnB", name: "Gate B", type: "outdoor", x: 300, y: 400, campusId: "c1", accessible: true, color: "#16a34a" },
    ];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "p" });
    fireEvent.mouseDown(navNodeAt(container, 100, 200), { clientX: 100, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(svg, { clientX: 400, clientY: 200, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(warningSpy).toHaveBeenCalledWith(
      "Connection blocked",
      expect.objectContaining({ description: "The connection crosses a building or obstacle." })
    );
    // No bend was pinned (no pin markers), no edge committed, Connect stays active.
    expect(container.querySelectorAll("[data-testid='nav-connect-pin']").length).toBe(0);
    expect(latest).toBeUndefined();
    expect(screen.getAllByTestId("nav-path-status").length).toBeGreaterThan(0);
  });

  it("a rejected pin keeps the connection active — a later valid destination still commits", () => {
    let latest: Campus | undefined;
    const campus = makeCampus();
    // Building spans (200,150)-(300,250). A sits ABOVE it at y=50. A pin click
    // at (300,300) routes the vertical leg down the building's right edge
    // (x=300 is inclusive) → rejected. B(400,350) stays reachable via the
    // default horizontal-first tail corner (400,50).
    campus.buildings = [{ ...campus.buildings[0], x: 200, y: 150, width: 100, height: 100 }];
    campus.navNodes = [
      { id: "nnA", name: "Gate A", type: "outdoor", x: 100, y: 50, campusId: "c1", accessible: true, color: "#16a34a" },
      { id: "nnB", name: "Gate B", type: "outdoor", x: 400, y: 350, campusId: "c1", accessible: true, color: "#16a34a" },
    ];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "p" });
    fireEvent.mouseDown(navNodeAt(container, 100, 50), { clientX: 100, clientY: 50, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // Rejected pin: corner (300,50) + click (300,300) — the vertical leg at
    // x=300 hugs the building's right edge (inclusive) → blocked.
    fireEvent.mouseDown(svg, { clientX: 300, clientY: 300, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(warningSpy).toHaveBeenCalledWith(
      "Connection blocked",
      expect.objectContaining({ description: "The connection crosses a building or obstacle." })
    );
    // The connection is still armed — committing to B succeeds with the tail
    // L corner (400,50) above the building.
    fireEvent.mouseDown(svg, { clientX: 400, clientY: 350, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(latest!.navEdges).toHaveLength(1);
    expect(latest!.navEdges![0].bendPoints).toEqual([{ x: 400, y: 50 }]);
  });

  it("keeps an entrance-source bend attached to the same draft after a stale entrance hover", async () => {
    let updates = 0;
    let latest: Campus | undefined;
    const { container } = render(<Harness initialCampus={seededEntranceCampus()} onCampusChange={(c) => { updates += 1; latest = c; }} />);
    const svg = openNavigationLayer(container);
    // Entrance reconciliation is allowed to hydrate its generated indoor
    // bridge once on mount. Establish that authoritative baseline before
    // asserting the Connect gesture itself remains draft-only.
    await waitFor(() => expect(container.querySelectorAll("[data-testid='nav-node']")).toHaveLength(3));
    updates = 0;
    latest = undefined;
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    // Hovering the physical entrance before selecting its canonical graph node
    // used to leave navEntranceHover set. The stale flag made Canvas suppress
    // navConnectBends, rendering a detached green dot instead of a draft.
    fireEvent.mouseMove(svg, { clientX: 160, clientY: 180, bubbles: true });
    const source = container.querySelector("[data-testid='nav-node'][data-node-id='entrance-node']");
    expect(source).toBeTruthy();
    fireEvent.mouseDown(source!, { clientX: 160, clientY: 180, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const background = container.querySelector("[data-bg='true']");
    expect(background).toBeTruthy();
    fireEvent.mouseDown(background!, { clientX: 260, clientY: 260, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    await waitFor(() => expect(container.querySelector("[data-testid='nav-path-preview'] polyline")?.getAttribute("points"))
      .toBe("160,180 160,260 260,260"));
    expect(container.querySelectorAll("[data-testid='nav-connect-pin']")).toHaveLength(2);
    expect(container.querySelectorAll("[data-testid='nav-node']")).toHaveLength(3);
    expect(latest).toBeUndefined();
    expect(updates).toBe(0);
  });

  it("allows a Connect draft to leave its source building through the entrance boundary", async () => {
    const { container } = render(<Harness initialCampus={seededEntranceCampus()} />);
    const svg = openNavigationLayer(container);
    await waitFor(() => expect(container.querySelectorAll("[data-testid='nav-node']")).toHaveLength(3));
    warningSpy.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    const source = container.querySelector("[data-testid='nav-node'][data-node-id='entrance-node']");
    expect(source).toBeTruthy();
    fireEvent.mouseDown(source!, { clientX: 160, clientY: 180, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const background = container.querySelector("[data-bg='true']");
    expect(background).toBeTruthy();
    fireEvent.mouseDown(background!, { clientX: 260, clientY: 260, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(warningSpy).not.toHaveBeenCalledWith(
      "Connection blocked",
      expect.anything(),
    );
    expect(container.querySelector("[data-testid='nav-path-preview'] polyline")?.getAttribute("points"))
      .toContain("160,180");
  });
});

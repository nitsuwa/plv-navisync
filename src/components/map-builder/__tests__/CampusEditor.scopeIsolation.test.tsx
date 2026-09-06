import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { toast } from "sonner";
import { CampusEditor } from "../CampusEditor";
import type { Campus, NavigationNode, NavigationEdge } from "../types";

// ── B5 Phase 2.9 — navigation scope isolation ───────────────────────────────
// Indoor floor navigation shares the campus nav arrays (scoped by buildingId +
// floorId) but belongs ONLY to its floor's editor. The outdoor Campus Builder
// must render ONLY outdoor/campus-scope entities — indoor floor nodes/edges
// never leak onto the outdoor canvas, even when their building is visible.

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

function outdoorNode(id: string, x: number, y: number): NavigationNode {
  return { id, name: "Gate", type: "outdoor", x, y, campusId: "c1", accessible: true, color: "#16a34a" };
}

function indoorNode(id: string, x: number, y: number, floorId = "f1"): NavigationNode {
  return {
    id, name: "Floor Waypoint", type: "hallway", x, y, campusId: "c1",
    buildingId: "b1", floorId, accessible: true, color: "#16a34a",
  };
}

function edge(id: string, a: string, b: string): NavigationEdge {
  return { id, startNodeId: a, endNodeId: b, distance: 100, bidirectional: true, accessible: true, type: "walkway", color: "#16a34a", width: 4 };
}

beforeEach(() => {
  vi.spyOn(toast, "warning").mockImplementation(() => "" as never);
});
afterEach(cleanup);

describe("B5 Phase 2.9 — indoor floor navigation never leaks into the outdoor Campus Builder", () => {
  it("excludes indoor floor NavigationNodes from the outdoor canvas", () => {
    const campus = makeCampus();
    campus.navNodes = [
      outdoorNode("o1", 200, 200),
      outdoorNode("o2", 400, 200),
      indoorNode("i1", 150, 130),  // floor f1 of the visible building b1
      indoorNode("i2", 160, 140),  // another floor node
    ];
    const { container } = render(<Harness initialCampus={campus} />);
    openNavigationLayer(container);
    const rendered = Array.from(container.querySelectorAll('[data-testid="nav-node"]'));
    // Only the two outdoor gates render — both indoor floor nodes stay out.
    expect(rendered).toHaveLength(2);
    const coords = rendered.map((g) => {
      const c = g.querySelector("circle");
      return c ? `${c.getAttribute("cx")},${c.getAttribute("cy")}` : "";
    });
    expect(coords).not.toContain("150,130");
    expect(coords).not.toContain("160,140");
  });

  it("excludes indoor NavigationEdges whose endpoints are floor nodes", () => {
    const campus = makeCampus();
    campus.navNodes = [
      outdoorNode("o1", 200, 200),
      outdoorNode("o2", 400, 200),
      indoorNode("i1", 150, 130),
      indoorNode("i2", 160, 140),
    ];
    campus.navEdges = [
      edge("eo", "o1", "o2"),
      edge("ei", "i1", "i2"), // indoor edge — must not render
    ];
    const { container } = render(<Harness initialCampus={campus} />);
    openNavigationLayer(container);
    expect(container.querySelectorAll('[data-testid="nav-edge"], [data-testid="nav-edge-selected"]')).toHaveLength(1);
  });

  it("keeps the indoor graph intact on the campus when the outdoor editor mutates the nav graph", () => {
    let latest: Campus | undefined;
    const campus = makeCampus();
    campus.navNodes = [
      outdoorNode("o1", 200, 200),
      indoorNode("i1", 150, 130),
    ];
    campus.navEdges = [edge("ei", "i1", "i1")];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(c) => { latest = c; }} />);
    // Outdoor editor: place a NEW outdoor waypoint (an ordinary outdoor mutation).
    const svg = openNavigationLayer(container);
    fireEvent.keyDown(window, { key: "m" }); // Waypoint tool
    fireEvent.mouseDown(svg, { clientX: 500, clientY: 400, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const after = latest!;
    // The outdoor append happened, but the indoor floor node survives unchanged.
    expect(after.navNodes!.find((n) => n.id === "o1")).toBeTruthy();
    expect(after.navNodes!.find((n) => n.id === "i1")).toMatchObject({ x: 150, y: 130, floorId: "f1", buildingId: "b1" });
    expect(after.navEdges).toHaveLength(1);
    // …and the new outdoor node renders while the indoor node still does NOT.
    expect(Array.from(container.querySelectorAll('[data-testid="nav-node"]'))).toHaveLength(2);
  });
});

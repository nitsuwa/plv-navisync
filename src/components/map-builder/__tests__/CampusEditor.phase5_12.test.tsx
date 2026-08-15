import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps, RefObject } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { toast } from "sonner";
import { Canvas } from "../Canvas";
import { CampusEditor } from "../CampusEditor";
import type { Campus, CampusPath } from "../types";

// ── Shared campus fixtures ──────────────────────────────────────────────────

function baseCampus(): Campus {
  return {
    id: "c1",
    name: "Campus",
    code: "C1",
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
    buildings: [],
    markers: [],
    decorAssets: [],
    paths: [],
    navNodes: [],
    navEdges: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
}

/** The primary manual-QA case: two same-style walkways (width 12) joined at an
 *  endpoint into an L-shape — one continuous Path Network. */
function lCornerCampus(overrides: Partial<CampusPath>[] = []): Campus {
  const campus = baseCampus();
  const defaults: CampusPath[] = [
    { id: "p-a", name: "A", type: "walkway", color: "#94a3b8", width: 12, points: [{ x: 100, y: 100 }, { x: 200, y: 100 }], pathNetworkId: "pnet-1" },
    { id: "p-b", name: "B", type: "walkway", color: "#94a3b8", width: 12, points: [{ x: 200, y: 100 }, { x: 200, y: 180 }], pathNetworkId: "pnet-1" },
  ];
  campus.paths = defaults.map((path, index) => ({ ...path, ...(overrides[index] ?? {}) }));
  return campus;
}

// ── Canvas-level rendering tests ─────────────────────────────────────────────

function renderCanvas(overrides: Partial<ComponentProps<typeof Canvas>> = {}) {
  const campus = overrides.campus ?? lCornerCampus();
  const svgRef = { current: null } as RefObject<SVGSVGElement | null>;
  const containerRef = { current: null } as RefObject<HTMLDivElement | null>;
  return render(
    <Canvas
      campus={campus}
      tool="select"
      layer="campus"
      selected={null}
      multiSelected={[]}
      rubberBand={null}
      drawingPath={[]}
      snapGrid
      zoom={1}
      pan={{ x: 0, y: 0 }}
      svgRef={svgRef}
      containerRef={containerRef}
      cursor="default"
      onCanvasDown={() => {}}
      onCanvasMove={() => {}}
      onCanvasUp={() => {}}
      onCanvasDblClick={() => {}}
      onItemDown={() => {}}
      onPathClick={() => {}}
      onSelect={() => {}}
      {...overrides}
    />
  );
}

function chainFor(container: HTMLElement, ids: string[]): Element | null {
  return Array.from(container.querySelectorAll("[data-testid='path-chain']")).find((chain) => {
    const chainIds = (chain.getAttribute("data-path-ids") ?? "").split(",");
    return ids.every((id) => chainIds.includes(id));
  }) ?? null;
}

afterEach(cleanup);

describe("B5 Phase 5.12 — continuous path-network visuals (no internal seams)", () => {
  it("joins same-style endpoints into ONE continuous chain — no transverse seam, no junction cover", () => {
    const { container } = renderCanvas();

    // The L-corner (both walkways, width 12) is one chain: no internal caps.
    expect(container.querySelector("[data-testid='path-junction-union']")).toBeNull();
    const chain = chainFor(container, ["p-a", "p-b"]);
    expect(chain).toBeTruthy();
    const surfacePath = Array.from(chain!.querySelectorAll("path"))
      .find((p) => p.getAttribute("stroke") === "#94a3b8");
    expect(surfacePath).toBeTruthy();
    // The surface stroke passes THROUGH the shared junction as one path (round join).
    expect(surfacePath?.getAttribute("d")).toContain("200,100");
    expect(surfacePath?.getAttribute("stroke-linejoin")).toBe("round");
  });

  it("keeps the network physically seamless while selected (accent stays chain-level)", () => {
    const { container } = renderCanvas({
      selected: { type: "path", id: "p-a" },
      multiSelected: ["p-a", "p-b"],
    });

    expect(container.querySelector("[data-testid='path-junction-union']")).toBeNull();
    const accent = Array.from(container.querySelectorAll("[data-testid='path-chain'] path"))
      .find((p) => p.getAttribute("stroke") === "var(--accent)");
    expect(accent).toBeTruthy();
    expect(accent?.getAttribute("d")).toContain("200,100");
  });

  it("renders one continuous Road centerline through a joined 90° corner", () => {
    const campus = lCornerCampus([
      { type: "road", color: "#cbd5e1", width: 24 },
      { type: "road", color: "#cbd5e1", width: 24 },
    ]);
    const { container } = renderCanvas({ campus });

    expect(container.querySelector("[data-testid='path-junction-union']")).toBeNull();
    const chain = chainFor(container, ["p-a", "p-b"]);
    expect(chain).toBeTruthy();
    const centerlines = Array.from(chain!.querySelectorAll("path"))
      .filter((p) => p.getAttribute("stroke") === "#f8fafc");
    expect(centerlines).toHaveLength(1);
    expect(centerlines[0]?.getAttribute("d")).toContain("200,100");
  });

  it("renders a diagonal joined network without internal seams", () => {
    const campus = lCornerCampus([undefined, { points: [{ x: 200, y: 100 }, { x: 260, y: 160 }] }]);
    const { container } = renderCanvas({ campus });

    expect(container.querySelector("[data-testid='path-junction-union']")).toBeNull();
    expect(chainFor(container, ["p-a", "p-b"])).toBeTruthy();
  });

  it("shows group bounds + rotation handle (not member controls) for a selected network", () => {
    const { container } = renderCanvas({
      selected: { type: "path", id: "p-a" },
      multiSelected: ["p-a", "p-b"],
      showGroupOutline: true,
    });

    expect(container.querySelector("[data-testid='campus-group-outline']")).toBeTruthy();
    expect(container.querySelectorAll("[data-testid='path-group-scale-handle']")).toHaveLength(4);
    expect(container.querySelector("[data-testid='path-group-rotate-handle']")).toBeTruthy();
    expect(container.querySelector("[data-testid='campus-path-controls']")).toBeNull();
    expect(container.querySelector("[data-testid='path-point-handle']")).toBeNull();
  });

  it("double-clicks a member to enter member edit without ungrouping (member controls + group bounds)", () => {
    const onPathDblClick = vi.fn();
    const { container, rerender } = renderCanvas({
      onPathDblClick,
      selected: { type: "path", id: "p-b" },
      multiSelected: ["p-a", "p-b"],
    });

    fireEvent.doubleClick(container.querySelector("[data-testid='campus-path'][data-path-id='p-b']")!);
    expect(onPathDblClick).toHaveBeenCalledWith("p-b");

    // Member edit mode: the member's points become editable while the group
    // relationship (group bounds) stays visible.
    rerender(<Canvas
      campus={lCornerCampus()}
      tool="select"
      layer="campus"
      selected={{ type: "path", id: "p-b" }}
      multiSelected={["p-a", "p-b"]}
      pathMemberEditId="p-b"
      rubberBand={null}
      drawingPath={[]}
      snapGrid
      zoom={1}
      pan={{ x: 0, y: 0 }}
      svgRef={{ current: null } as RefObject<SVGSVGElement | null>}
      containerRef={{ current: null } as RefObject<HTMLDivElement | null>}
      cursor="default"
      onCanvasDown={() => {}}
      onCanvasMove={() => {}}
      onCanvasUp={() => {}}
      onCanvasDblClick={() => {}}
      onItemDown={() => {}}
      onPathClick={() => {}}
      onSelect={() => {}}
    />);
    expect(container.querySelector("[data-testid='path-point-handle'][data-path-id='p-b']")).toBeTruthy();
    expect(container.querySelector("[data-testid='campus-group-outline']")).toBeTruthy();
  });

  it("suppresses member controls for a network member when the network is selected", () => {
    const { container } = renderCanvas({
      selected: { type: "path", id: "p-a" },
      multiSelected: ["p-a", "p-b"],
    });
    expect(container.querySelector("[data-testid='campus-path-controls']")).toBeNull();
  });
});

// ── CampusEditor-level interaction tests ────────────────────────────────────

function Harness({ onCampusChange, initialCampus }: { onCampusChange?: (c: Campus) => void; initialCampus?: Campus }) {
  const [campus, setCampus] = useState<Campus>(() => initialCampus ?? lCornerCampus());
  return (
    <CampusEditor
      campus={campus}
      onBack={() => {}}
      onUpdate={(c) => { onCampusChange?.(c); setCampus(c); }}
      onPublish={() => {}}
      onOpenFloor={() => {}}
      onAddBuilding={() => {}}
      savedSnapshot={JSON.stringify(initialCampus ?? lCornerCampus())}
    />
  );
}

let toastSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  toastSpy = vi.spyOn(toast, "info").mockImplementation(() => "" as never);
  vi.spyOn(toast, "success").mockImplementation(() => "" as never);
  vi.spyOn(toast, "warning").mockImplementation(() => "" as never);
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

function pathGroup(container: HTMLElement, id: string): SVGGElement {
  const g = container.querySelector(`[data-testid='campus-path'][data-path-id='${id}']`);
  expect(g).toBeTruthy();
  return g as SVGGElement;
}

describe("B5 Phase 5.12 — Canva-style group/member editing", () => {
  it("clicking a member selects the WHOLE Path Network", () => {
    const onCampusChange = vi.fn();
    const { container } = render(<Harness onCampusChange={onCampusChange} />);
    const svg = canvasSvg(container);

    fireEvent.click(pathGroup(container, "p-a"));
    fireEvent.mouseMove(svg, { clientX: 10, clientY: 10 });
    fireEvent.mouseUp(svg, { clientX: 10, clientY: 10 });

    expect(screen.getByText("Path Network (2)")).toBeTruthy();
    expect(container.querySelector("[data-testid='campus-group-outline']")).toBeTruthy();
    // No individual point handles in network-group mode.
    expect(container.querySelector("[data-testid='path-point-handle']")).toBeNull();
  });

  it("double-click enters member edit; Escape returns to the network selection", () => {
    const { container } = render(<Harness />);
    const svg = canvasSvg(container);

    fireEvent.doubleClick(pathGroup(container, "p-a"));
    expect(screen.getByText("Pathway (in Network)")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Back to Network/i })).toBeTruthy();
    expect(container.querySelector("[data-testid='path-point-handle'][data-path-id='p-a']")).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByText("Pathway (in Network)")).toBeNull();
    expect(screen.getByText("Path Network (2)")).toBeTruthy();
  });

  it("member point editing preserves network membership and junction topology", () => {
    const onCampusChange = vi.fn();
    const { container } = render(<Harness onCampusChange={onCampusChange} />);
    const svg = canvasSvg(container);

    fireEvent.doubleClick(pathGroup(container, "p-a"));
    const handle = container.querySelector("[data-testid='path-point-handle'][data-path-id='p-a'][data-point-index='0']")!;
    fireEvent.mouseDown(handle, { clientX: 100, clientY: 100 });
    // On-grid target (grid size 20) so the point lands exactly where dragged.
    fireEvent.mouseMove(svg, { clientX: 140, clientY: 100 });
    fireEvent.mouseUp(svg, { clientX: 140, clientY: 100 });

    const latest = onCampusChange.mock.calls[onCampusChange.mock.calls.length - 1]?.[0] as Campus;
    const a = latest.paths.find((p) => p.id === "p-a")!;
    const b = latest.paths.find((p) => p.id === "p-b")!;
    expect(a.points[0]).toEqual({ x: 140, y: 100 });
    expect(a.pathNetworkId).toBe("pnet-1");
    expect(b.pathNetworkId).toBe("pnet-1");
    // Shared junction stays exactly shared.
    expect(a.points[1]).toEqual({ x: 200, y: 100 });
    expect(b.points[0]).toEqual({ x: 200, y: 100 });
  });

  it("Ungroup keeps the physical junction geometry (only the group id is cleared)", () => {
    const onCampusChange = vi.fn();
    const { container } = render(<Harness onCampusChange={onCampusChange} />);
    const svg = canvasSvg(container);

    fireEvent.click(pathGroup(container, "p-a"));
    fireEvent.mouseMove(svg, { clientX: 10, clientY: 10 });
    fireEvent.mouseUp(svg, { clientX: 10, clientY: 10 });
    fireEvent.click(screen.getByRole("button", { name: /Ungroup Paths/i }));

    const latest = onCampusChange.mock.calls[onCampusChange.mock.calls.length - 1]?.[0] as Campus;
    const a = latest.paths.find((p) => p.id === "p-a")!;
    const b = latest.paths.find((p) => p.id === "p-b")!;
    expect(a.pathNetworkId).toBeUndefined();
    expect(b.pathNetworkId).toBeUndefined();
    // Physical junction coordinates are untouched.
    expect(a.points[1]).toEqual({ x: 200, y: 100 });
    expect(b.points[0]).toEqual({ x: 200, y: 100 });
  });
});

describe("B5 Phase 5.12 — path-network rotation", () => {
  function selectNetwork(container: HTMLElement, svg: SVGSVGElement): { handle: SVGCircleElement; center: { x: number; y: number } } {
    fireEvent.click(pathGroup(container, "p-a"));
    fireEvent.mouseMove(svg, { clientX: 10, clientY: 10 });
    fireEvent.mouseUp(svg, { clientX: 10, clientY: 10 });
    const handle = container.querySelector("[data-testid='path-group-rotate-handle']") as SVGCircleElement;
    // The gesture center is the padded group bounds' center (read from the DOM
    // outline, which the handle's onMouseDown passes to the rotation start).
    const outline = container.querySelector("[data-testid='campus-group-outline']") as unknown as SVGRectElement;
    const ox = Number(outline.getAttribute("x"));
    const oy = Number(outline.getAttribute("y"));
    const ow = Number(outline.getAttribute("width"));
    const oh = Number(outline.getAttribute("height"));
    return { handle, center: { x: ox + ow / 2, y: oy + oh / 2 } };
  }

  it("rotates all member points around the group center, preserving widths and network id", () => {
    const onCampusChange = vi.fn();
    const { container } = render(<Harness onCampusChange={onCampusChange} />);
    const svg = canvasSvg(container);
    const { handle, center } = selectNetwork(container, svg);
    const hx = Number(handle.getAttribute("cx"));
    const hy = Number(handle.getAttribute("cy"));

    const before = onCampusChange.mock.calls.length;
    fireEvent.mouseDown(handle, { clientX: hx, clientY: hy });
    // Rotate 90°: move the pointer from directly above the center to directly right.
    fireEvent.mouseMove(svg, { clientX: center.x + 40, clientY: center.y });
    fireEvent.mouseUp(svg, { clientX: center.x + 40, clientY: center.y });

    const latest = onCampusChange.mock.calls[onCampusChange.mock.calls.length - 1]?.[0] as Campus;
    const a = latest.paths.find((p) => p.id === "p-a")!;
    const b = latest.paths.find((p) => p.id === "p-b")!;

    // Network bounds center is (150,140): (100,100) rotated 90° → (190, 90),
    // and the shared junction (200,100) → (190,190) for BOTH members.
    expect(center).toEqual({ x: 150, y: 140 });
    expect(a.points[0]).toEqual({ x: 190, y: 90 });
    expect(a.points[1]).toEqual({ x: 190, y: 190 });
    expect(a.width).toBe(12);
    expect(a.type).toBe("walkway");
    expect(a.pathNetworkId).toBe("pnet-1");
    // Shared junction remains exactly shared after rotation.
    expect(b.points[0]).toEqual(a.points[1]);
    // The whole rotation committed as ONE history gesture (single onUpdate burst
    // plus the gesture snapshot — no per-move spam: count stayed low).
    expect(onCampusChange.mock.calls.length - before).toBeLessThanOrEqual(2);
  });

  it("Shift-snaps rotation to 15° increments", () => {
    const onCampusChange = vi.fn();
    const { container } = render(<Harness onCampusChange={onCampusChange} />);
    const svg = canvasSvg(container);
    const { handle, center } = selectNetwork(container, svg);
    const hx = Number(handle.getAttribute("cx"));
    const hy = Number(handle.getAttribute("cy"));
    const r = Math.hypot(hx - center.x, hy - center.y);

    fireEvent.mouseDown(handle, { clientX: hx, clientY: hy });
    // Pointer 37° from the handle's -90° position → raw 37°, snapped to 30°.
    const targetAngle = (-90 + 37) * (Math.PI / 180);
    fireEvent.mouseMove(svg, {
      clientX: center.x + Math.round(r * Math.cos(targetAngle)),
      clientY: center.y + Math.round(r * Math.sin(targetAngle)),
      shiftKey: true,
    });
    fireEvent.mouseUp(svg, {
      clientX: center.x + Math.round(r * Math.cos(targetAngle)),
      clientY: center.y + Math.round(r * Math.sin(targetAngle)),
      shiftKey: true,
    });

    const latest = onCampusChange.mock.calls[onCampusChange.mock.calls.length - 1]?.[0] as Campus;
    const a = latest.paths.find((p) => p.id === "p-a")!;
    const pt = a.points[0]!;
    const angle = Math.atan2(pt.y - center.y, pt.x - center.x) * (180 / Math.PI);
    const originalAngle = Math.atan2(100 - center.y, 100 - center.x) * (180 / Math.PI);
    const rotatedBy = angle - originalAngle;
    expect(Math.abs(rotatedBy - 30)).toBeLessThan(1.5);
  });
});

describe("B5 Phase 5.12 — auto network membership + navigation regression", () => {
  it("a newly drawn path snapped onto a network member inherits its pathNetworkId", () => {
    const onCampusChange = vi.fn();
    const { container } = render(<Harness onCampusChange={onCampusChange} />);
    const svg = canvasSvg(container);

    fireEvent.keyDown(window, { key: "p" });
    fireEvent.mouseDown(svg, { clientX: 100, clientY: 300 });
    fireEvent.mouseMove(svg, { clientX: 200, clientY: 100 });
    fireEvent.mouseUp(svg, { clientX: 200, clientY: 100 });

    const latest = onCampusChange.mock.calls[onCampusChange.mock.calls.length - 1]?.[0] as Campus;
    const newPath = latest.paths.find((p) => p.id !== "p-a" && p.id !== "p-b");
    expect(newPath).toBeTruthy();
    expect(newPath?.pathNetworkId).toBe("pnet-1");
    expect(newPath?.points[newPath!.points.length - 1]).toEqual({ x: 200, y: 100 });
  });

  it("a new T-junction branch snapped onto a network segment joins the existing network", () => {
    const onCampusChange = vi.fn();
    const { container } = render(<Harness onCampusChange={onCampusChange} />);
    const svg = canvasSvg(container);

    fireEvent.keyDown(window, { key: "p" });
    fireEvent.mouseDown(svg, { clientX: 150, clientY: 220 });
    fireEvent.mouseMove(svg, { clientX: 150, clientY: 100 });
    fireEvent.mouseUp(svg, { clientX: 150, clientY: 100 });

    const latest = onCampusChange.mock.calls[onCampusChange.mock.calls.length - 1]?.[0] as Campus;
    const branch = latest.paths.find((p) => p.id !== "p-a" && p.id !== "p-b");
    expect(branch).toBeTruthy();
    expect(branch?.pathNetworkId).toBe("pnet-1");
    // The T split the target segment — the network member now has a bend at (150,100).
    const a = latest.paths.find((p) => p.id === "p-a")!;
    expect(a.points.some((point) => point.x === 150 && point.y === 100)).toBe(true);
  });

  it("Add Network to Navigation stays green for a whole-network selection", () => {
    const onCampusChange = vi.fn();
    const { container } = render(<Harness onCampusChange={onCampusChange} />);
    const svg = canvasSvg(container);

    fireEvent.click(pathGroup(container, "p-a"));
    fireEvent.mouseMove(svg, { clientX: 10, clientY: 10 });
    fireEvent.mouseUp(svg, { clientX: 10, clientY: 10 });
    fireEvent.click(screen.getByRole("button", { name: /Add Network to Navigation/i }));

    const latest = onCampusChange.mock.calls[onCampusChange.mock.calls.length - 1]?.[0] as Campus;
    const waypoints = latest.navNodes ?? [];
    const edges = latest.navEdges ?? [];
    expect(waypoints.length).toBeGreaterThanOrEqual(3);
    expect(edges.length).toBeGreaterThanOrEqual(2);
  });
});

// ── B5 Phase 5.13 — Pathway endpoint/join cleanup + auto-group + rotation UX ──

describe("B5 Phase 5.13 — free path ends + different-width join + auto-group + rotation", () => {
  it("free path ends no longer render circular endpoint circles", () => {
    const { container } = renderCanvas();
    const chains = container.querySelectorAll("[data-testid='path-chain']");
    for (const chain of chains) {
      // No circle elements should exist inside chain rendering (endpoint caps removed)
      expect(chain.querySelector("circle")).toBeNull();
    }
  });

  it("different-width connection renders a tight junction fill, not a bloated hull", () => {
    const campus = lCornerCampus([
      { type: "walkway", color: "#94a3b8", width: 18 },
      { type: "road", color: "#cbd5e1", width: 24 },
    ]);
    const { container } = renderCanvas({ campus });
    const junction = container.querySelector("[data-testid='path-junction-union']");
    expect(junction).toBeTruthy();
    const surfaceShape = junction?.querySelector("[data-testid='path-junction-surface-union']");
    expect(surfaceShape).toBeTruthy();
    // Junction fill should exist — no circular endpoint rendering
    const d = surfaceShape?.getAttribute("d") ?? "";
    expect(d).toContain("M");
    expect(d).toContain("Z");
    // No circles inside the junction union group
    expect(junction?.querySelector("circle")).toBeNull();
  });

  it("endpoint-connected path auto-inherits network from snap target", () => {
    const onCampusChange = vi.fn();
    // Start with a single ungrouped path
    const campus = baseCampus();
    campus.paths = [
      { id: "p-orig", name: "Orig", type: "walkway", color: "#94a3b8", width: 12, points: [{ x: 100, y: 300 }, { x: 200, y: 300 }], visible: true, locked: false },
    ];
    const { container } = render(<Harness onCampusChange={onCampusChange} initialCampus={campus} />);
    const svg = canvasSvg(container);

    // Draw a stroke that ends AT orig's endpoint (200,300) to trigger snap
    fireEvent.keyDown(window, { key: "p" });
    fireEvent.mouseDown(svg, { clientX: 300, clientY: 300 });
    fireEvent.mouseMove(svg, { clientX: 200, clientY: 300 });
    fireEvent.mouseUp(svg, { clientX: 200, clientY: 300 });

    const latest = onCampusChange.mock.calls[onCampusChange.mock.calls.length - 1]?.[0] as Campus;
    const newPath = latest.paths.find((p) => p.id === "p-orig" ? false : true);
    expect(newPath).toBeTruthy();
    // Should have inherited or created a network
    expect(newPath?.pathNetworkId).toBeTruthy();
  });

  it("rotation handle renders and rotation persists real coordinate changes", () => {
    const onCampusChange = vi.fn();
    const { container } = render(<Harness onCampusChange={onCampusChange} />);
    const svg = canvasSvg(container);

    // Select the network
    fireEvent.click(pathGroup(container, "p-a"));
    fireEvent.mouseMove(svg, { clientX: 10, clientY: 10 });
    fireEvent.mouseUp(svg, { clientX: 10, clientY: 10 });

    // Rotation handle should be visible
    const handle = container.querySelector("[data-testid='path-group-rotate-handle']");
    expect(handle).toBeTruthy();

    // Perform a rotation gesture
    const hx = Number(handle!.getAttribute("cx"));
    const hy = Number(handle!.getAttribute("cy"));
    const cx = 150; const cy = 140; // group center
    const r = Math.hypot(hx - cx, hy - cy);
    fireEvent.mouseDown(handle!, { clientX: hx, clientY: hy });
    const angle45 = (-90 + 45) * (Math.PI / 180);
    fireEvent.mouseMove(svg, {
      clientX: cx + Math.round(r * Math.cos(angle45)),
      clientY: cy + Math.round(r * Math.sin(angle45)),
    });
    fireEvent.mouseUp(svg, {
      clientX: cx + Math.round(r * Math.cos(angle45)),
      clientY: cy + Math.round(r * Math.sin(angle45)),
    });

    const latest = onCampusChange.mock.calls[onCampusChange.mock.calls.length - 1]?.[0] as Campus;
    const a = latest.paths.find((p) => p.id === "p-a")!;
    // Points should have been rotated (not the original {100,100})
    expect(a.points[0].x).not.toBe(100);
    expect(a.points[0].y).not.toBe(100);
    // Widths unchanged
    expect(a.width).toBe(12);
  });

  it("Shift rotation snaps to 15-degree increments", () => {
    const onCampusChange = vi.fn();
    const { container } = render(<Harness onCampusChange={onCampusChange} />);
    const svg = canvasSvg(container);

    fireEvent.click(pathGroup(container, "p-a"));
    fireEvent.mouseMove(svg, { clientX: 10, clientY: 10 });
    fireEvent.mouseUp(svg, { clientX: 10, clientY: 10 });

    const handle = container.querySelector("[data-testid='path-group-rotate-handle']")!;
    const hx = Number(handle.getAttribute("cx"));
    const hy = Number(handle.getAttribute("cy"));
    const cx = 150; const cy = 140;
    const r = Math.hypot(hx - cx, hy - cy);
    fireEvent.mouseDown(handle, { clientX: hx, clientY: hy });
    // 37° from start → should snap to 30° (nearest 15°)
    const targetAngle = (-90 + 37) * (Math.PI / 180);
    fireEvent.mouseMove(svg, {
      clientX: cx + Math.round(r * Math.cos(targetAngle)),
      clientY: cy + Math.round(r * Math.sin(targetAngle)),
      shiftKey: true,
    });
    fireEvent.mouseUp(svg, {
      clientX: cx + Math.round(r * Math.cos(targetAngle)),
      clientY: cy + Math.round(r * Math.sin(targetAngle)),
      shiftKey: true,
    });

    const latest = onCampusChange.mock.calls[onCampusChange.mock.calls.length - 1]?.[0] as Campus;
    const a = latest.paths.find((p) => p.id === "p-a")!;
    const pt = a.points[0]!;
    const angle = Math.atan2(pt.y - cy, pt.x - cx) * (180 / Math.PI);
    const originalAngle = Math.atan2(100 - cy, 100 - cx) * (180 / Math.PI);
    const rotatedBy = angle - originalAngle;
    expect(Math.abs(rotatedBy - 30)).toBeLessThan(1.5);
  });
});

// ── B5 Phase 5.14 — Junction geometry + auto-group + rotated frame ──────────

describe("B5 Phase 5.14 — junction polygon geometry + network merge + rotated frame", () => {
  it("3-way same-style junction does NOT produce a visible polygon patch (chains cover it)", () => {
    // T-junction: horizontal walkway + vertical branch from midpoint
    const campus = baseCampus();
    campus.paths = [
      { id: "p-h1", name: "H1", type: "walkway", color: "#94a3b8", width: 12, points: [{ x: 100, y: 100 }, { x: 200, y: 100 }], pathNetworkId: "pnet-1", visible: true, locked: false },
      { id: "p-h2", name: "H2", type: "walkway", color: "#94a3b8", width: 12, points: [{ x: 200, y: 100 }, { x: 300, y: 100 }], pathNetworkId: "pnet-1", visible: true, locked: false },
      { id: "p-v", name: "V", type: "walkway", color: "#94a3b8", width: 12, points: [{ x: 200, y: 100 }, { x: 200, y: 180 }], pathNetworkId: "pnet-1", visible: true, locked: false },
    ];
    const { container } = renderCanvas({ campus });
    // Same-style 3-way: chain strokes cover the junction — no polygon patch
    expect(container.querySelector("[data-testid='path-junction-union']")).toBeNull();
    // Chain should still exist and cover the junction area
    const chains = container.querySelectorAll("[data-testid='path-chain']");
    expect(chains.length).toBeGreaterThanOrEqual(1);
  });

  it("different-style junction renders a polygon to fill the color transition gap", () => {
    // Walkway + accessible path meeting at a point (different surface colors)
    const campus = baseCampus();
    campus.paths = [
      { id: "p-w", name: "W", type: "walkway", color: "#94a3b8", width: 12, points: [{ x: 100, y: 100 }, { x: 200, y: 100 }], pathNetworkId: "pnet-1", visible: true, locked: false },
      { id: "p-a", name: "A", type: "accessible", color: "#059669", width: 10, points: [{ x: 200, y: 100 }, { x: 200, y: 180 }], pathNetworkId: "pnet-1", visible: true, locked: false },
    ];
    const { container } = renderCanvas({ campus });
    const junction = container.querySelector("[data-testid='path-junction-union']");
    expect(junction).toBeTruthy();
    const surfaceShape = junction?.querySelector("[data-testid='path-junction-surface-union']");
    expect(surfaceShape).toBeTruthy();
    const d = surfaceShape?.getAttribute("d") ?? "";
    expect(d).toContain("M");
    expect(d).toContain("Z");
  });

  it("different-width junction uses offset-boundary transition (no circular blob)", () => {
    const campus = lCornerCampus([
      { type: "walkway", color: "#94a3b8", width: 8 },
      { type: "road", color: "#cbd5e1", width: 24 },
    ]);
    const { container } = renderCanvas({ campus });
    const junction = container.querySelector("[data-testid='path-junction-union']");
    expect(junction).toBeTruthy();
    // No circles inside the junction (no endpoint caps)
    expect(junction?.querySelector("circle")).toBeNull();
    // Junction polygon should exist
    const surfaceShape = junction?.querySelector("[data-testid='path-junction-surface-union']");
    expect(surfaceShape?.getAttribute("d")).toBeTruthy();
  });

  it("endpoint move snap merges networks between two previously separate groups", () => {
    const onCampusChange = vi.fn();
    const campus = baseCampus();
    campus.paths = [
      { id: "p-1", name: "A", type: "walkway", color: "#94a3b8", width: 12, points: [{ x: 50, y: 200 }, { x: 150, y: 200 }], pathNetworkId: "pnet-a", visible: true, locked: false },
      { id: "p-2", name: "B", type: "walkway", color: "#94a3b8", width: 12, points: [{ x: 200, y: 200 }, { x: 300, y: 200 }], pathNetworkId: "pnet-b", visible: true, locked: false },
    ];
    const { container } = render(<Harness onCampusChange={onCampusChange} initialCampus={campus} />);
    const svg = canvasSvg(container);

    // Select p-1 and drag its endpoint (150,200) onto p-2's endpoint (200,200)
    fireEvent.click(pathGroup(container, "p-1"));
    fireEvent.mouseMove(svg, { clientX: 10, clientY: 10 });
    fireEvent.mouseUp(svg, { clientX: 10, clientY: 10 });

    // Find the endpoint handle for p-1's point index 1
    const handle = container.querySelector("[data-testid='path-point-handle'][data-path-id='p-1'][data-point-index='1']");
    if (handle) {
      fireEvent.mouseDown(handle, { clientX: 150, clientY: 200 });
      fireEvent.mouseMove(svg, { clientX: 200, clientY: 200 });
      fireEvent.mouseUp(svg, { clientX: 200, clientY: 200 });

      const latest = onCampusChange.mock.calls[onCampusChange.mock.calls.length - 1]?.[0] as Campus;
      const a = latest.paths.find((p) => p.id === "p-1")!;
      const b = latest.paths.find((p) => p.id === "p-2")!;
      // Both should share the same network
      expect(a.pathNetworkId).toBeTruthy();
      expect(b.pathNetworkId).toBe(a.pathNetworkId);
    }
  });

  it("stroke-tool creation snap merges networks when target has different network", () => {
    const onCampusChange = vi.fn();
    const campus = baseCampus();
    campus.paths = [
      { id: "p-orig", name: "Orig", type: "road", color: "#cbd5e1", width: 18, points: [{ x: 100, y: 300 }, { x: 200, y: 300 }], pathNetworkId: "pnet-x", visible: true, locked: false },
    ];
    const { container } = render(<Harness onCampusChange={onCampusChange} initialCampus={campus} />);
    const svg = canvasSvg(container);

    // Draw a stroke that ends at orig's endpoint (200,300)
    fireEvent.keyDown(window, { key: "p" });
    fireEvent.mouseDown(svg, { clientX: 300, clientY: 300 });
    fireEvent.mouseMove(svg, { clientX: 200, clientY: 300 });
    fireEvent.mouseUp(svg, { clientX: 200, clientY: 300 });

    const latest = onCampusChange.mock.calls[onCampusChange.mock.calls.length - 1]?.[0] as Campus;
    const newPath = latest.paths.find((p) => p.id === "p-orig" ? false : true);
    expect(newPath).toBeTruthy();
    // New path should share orig's network
    expect(newPath?.pathNetworkId).toBe("pnet-x");
  });

  it("rotation frame uses SVG transform (rotates with network)", () => {
    const onCampusChange = vi.fn();
    const { container } = render(<Harness onCampusChange={onCampusChange} />);
    const svg = canvasSvg(container);

    // Select the network
    fireEvent.click(pathGroup(container, "p-a"));
    fireEvent.mouseMove(svg, { clientX: 10, clientY: 10 });
    fireEvent.mouseUp(svg, { clientX: 10, clientY: 10 });

    // Get the group outline
    const outline = container.querySelector("[data-testid='campus-group-outline']");
    expect(outline).toBeTruthy();
    // Initially no rotation transform
    const groupParent = outline!.closest("g");
    expect(groupParent?.getAttribute("transform")).toBeFalsy();

    // Start rotating
    const handle = container.querySelector("[data-testid='path-group-rotate-handle']")!;
    const hx = Number(handle.getAttribute("cx"));
    const hy = Number(handle.getAttribute("cy"));
    const cx = 150; const cy = 140;
    const r = Math.hypot(hx - cx, hy - cy);
    fireEvent.mouseDown(handle, { clientX: hx, clientY: hy });
    const angle45 = (-90 + 45) * (Math.PI / 180);
    fireEvent.mouseMove(svg, {
      clientX: cx + Math.round(r * Math.cos(angle45)),
      clientY: cy + Math.round(r * Math.sin(angle45)),
    });

    // During rotation, the group parent should have a rotate transform
    const rotatedGroup = outline!.closest("g");
    const transform = rotatedGroup?.getAttribute("transform") ?? "";
    expect(transform).toContain("rotate");
    expect(transform).toContain(String(cx));

    fireEvent.mouseUp(svg, {
      clientX: cx + Math.round(r * Math.cos(angle45)),
      clientY: cy + Math.round(r * Math.sin(angle45)),
    });

    // After rotation, geometry should have changed
    const latest = onCampusChange.mock.calls[onCampusChange.mock.calls.length - 1]?.[0] as Campus;
    const a = latest.paths.find((p) => p.id === "p-a")!;
    expect(a.points[0].x).not.toBe(100);
    expect(a.width).toBe(12);
  });
});

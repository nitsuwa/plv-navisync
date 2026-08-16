import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps, RefObject } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Canvas } from "../Canvas";
import { PropertiesPanel } from "../PropertiesPanel";
import type { Campus, NavigationEdge, NavigationNode } from "../types";

function campusWithPaths(): Campus {
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
    paths: [
      { id: "p-road", name: "Road", type: "road", color: "#cbd5e1", width: 24, points: [{ x: 100, y: 100 }, { x: 200, y: 100 }] },
      { id: "p-walk", name: "Walkway", type: "walkway", color: "#94a3b8", width: 10, points: [{ x: 200, y: 100 }, { x: 260, y: 160 }] },
      { id: "p-cross-a", name: "Cross A", type: "walkway", color: "#94a3b8", width: 10, points: [{ x: 340, y: 90 }, { x: 420, y: 170 }] },
      { id: "p-cross-b", name: "Cross B", type: "walkway", color: "#94a3b8", width: 10, points: [{ x: 340, y: 170 }, { x: 420, y: 90 }] },
    ],
    navNodes: [],
    navEdges: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
}

function renderCanvas(overrides: Partial<ComponentProps<typeof Canvas>> = {}) {
  const campus = overrides.campus ?? campusWithPaths();
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

afterEach(cleanup);

describe("B5 Phase 5.8 — pathway network editing UX", () => {
  it("renders one seamless junction union for explicitly joined different-width pathways", () => {
    const { container } = renderCanvas();

    const unions = container.querySelectorAll("[data-testid='path-junction-union']");
    expect(unions).toHaveLength(1);
    expect(unions[0].getAttribute("data-connected-paths")).toBe("2");
    expect(unions[0].getAttribute("data-junction-shape")).toBe("directional");
    expect(unions[0].querySelector("circle")).toBeNull();
  });

  it("renders joined pathways as opaque continuous chains without normal junction handles when deselected", () => {
    const { container } = renderCanvas();

    expect(container.querySelector("[data-testid='path-junction-handle']")).toBeNull();
    expect(container.querySelector("[data-testid='path-junction-surface-union']")?.getAttribute("opacity")).toBe("1");
    expect(container.querySelector("[data-testid='path-junction-surface-union']")?.tagName.toLowerCase()).toBe("path");
    const chainStrokes = Array.from(container.querySelectorAll("[data-testid='path-chain'] path"))
      .filter((node) => node.getAttribute("stroke") !== "var(--accent)" && node.getAttribute("stroke") !== "var(--primary)");
    expect(chainStrokes.length).toBeGreaterThan(0);
    expect(chainStrokes.every((node) => node.getAttribute("opacity") === "1" || node.getAttribute("opacity") === "0.72")).toBe(true);
  });

  it("keeps separate visual crossings independent when no endpoint is shared", () => {
    const { container } = renderCanvas();

    const unions = Array.from(container.querySelectorAll("[data-testid='path-junction-union']"));
    expect(unions).toHaveLength(1);
    expect(unions[0].querySelector("[data-testid='path-junction-surface-union']")?.getAttribute("d")).toContain("200");
  });

  it("shows path-only group scale handles for multi-selected pathways", () => {
    const { container } = renderCanvas({ multiSelected: ["p-road", "p-walk"], showGroupOutline: true });

    expect(container.querySelector("[data-testid='campus-group-outline']")).toBeTruthy();
    expect(container.querySelectorAll("[data-testid='path-group-scale-handle']")).toHaveLength(4);
  });

  it("starts path group scaling from a corner handle", () => {
    const onPathGroupScaleStart = vi.fn();
    const { container } = renderCanvas({
      multiSelected: ["p-road", "p-walk"],
      showGroupOutline: true,
      onPathGroupScaleStart,
    });

    fireEvent.mouseDown(container.querySelector("[data-testid='path-group-scale-handle']")!);
    expect(onPathGroupScaleStart).toHaveBeenCalledTimes(1);
  });

  it("does not expose physical pathway edit handles in Navigation mode", () => {
    const { container } = renderCanvas({
      layer: "navigation",
      selected: { type: "path", id: "p-road" },
      selectedPathPoint: { pathId: "p-road", pointIndex: 0 },
    });

    expect(container.querySelector("[data-testid='path-point-handle']")).toBeNull();
    expect(container.querySelector("[data-testid='path-width-handle']")).toBeNull();
  });
});

describe("B5 Phase 5.9 — pathway cleanup and campus graph overlay", () => {
  it("draws seamless junction patches above path strokes and selected controls above patches", () => {
    const { container } = renderCanvas({
      selected: { type: "path", id: "p-road" },
      selectedPathPoint: { pathId: "p-road", pointIndex: 1 },
    });

    const path = container.querySelector("[data-testid='campus-path']")!;
    const junctionLayer = container.querySelector("[data-testid='path-junction-layer']")!;
    const controls = container.querySelector("[data-testid='campus-path-controls']")!;

    expect(path.compareDocumentPosition(junctionLayer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(junctionLayer.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelector("[data-testid='path-junction-handle'][data-path-id='p-road'][data-point-index='1']")).toBeTruthy();
  });

  it("renders the outdoor navigation graph as a read-only Campus overlay only when toggled", () => {
    const navNodes: NavigationNode[] = [
      { id: "n1", campusId: "c1", name: "A", type: "outdoor", x: 120, y: 120, color: "#16a34a" },
      { id: "n2", campusId: "c1", name: "B", type: "outdoor", x: 180, y: 120, color: "#16a34a" },
    ];
    const navEdges: NavigationEdge[] = [{ id: "e1", startNodeId: "n1", endNodeId: "n2", bidirectional: true }];

    const hidden = renderCanvas({ layer: "campus", navNodes, navEdges, showNavigationOverlay: false });
    expect(hidden.container.querySelector("[data-testid='nav-graph-layer']")).toBeNull();
    hidden.unmount();

    const shown = renderCanvas({ layer: "campus", navNodes, navEdges, showNavigationOverlay: true });
    const layer = shown.container.querySelector("[data-testid='nav-graph-layer']")!;
    expect(layer.getAttribute("data-overlay")).toBe("true");
    expect(layer.getAttribute("class")).toContain("pointer-events-none");
    expect(shown.container.querySelectorAll("[data-testid='nav-node']")).toHaveLength(2);
    expect(shown.container.querySelectorAll("[data-testid='nav-edge']")).toHaveLength(1);
  });

  it("commits multi-selected pathway width from the Enter key once", () => {
    const onBatchUpdatePaths = vi.fn();
    const paths = campusWithPaths().paths.slice(0, 2);
    const { container } = render(
      <PropertiesPanel
        selected={null}
        selBldg={undefined}
        selMkr={undefined}
        selPath={undefined}
        allPaths={paths}
        selRoute={undefined}
        selDecorAsset={undefined}
        allDecorAssets={[]}
        allBuildings={[]}
        layer="campus"
        multiSelected={paths.map((path) => path.id)}
        multiSelectedBuildings={[]}
        selectedOutdoorCount={paths.length}
        onBatchUpdateBuildings={() => {}}
        onBatchDeleteBuildings={() => {}}
        onBatchUpdatePaths={onBatchUpdatePaths}
        onBatchDeletePaths={() => {}}
        onClearMultiSelect={() => {}}
        onUpdateBuilding={() => {}}
        onAddEntrance={() => {}}
        onSelectEntrance={() => {}}
        onUpdateEntrance={() => {}}
        onDeleteEntrance={() => {}}
        onUpdateMarker={() => {}}
        onDeleteBuilding={() => {}}
        onDeleteMarker={() => {}}
        onUpdateDecorAsset={() => {}}
        onDeleteDecorAsset={() => {}}
        onDuplicateDecorAsset={() => {}}
        onClose={() => {}}
      />
    );

    const input = container.querySelector("#path-batch-width") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "18" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);

    expect(onBatchUpdatePaths).toHaveBeenCalledTimes(1);
    expect(onBatchUpdatePaths).toHaveBeenCalledWith(["p-road", "p-walk"], { width: 18 });
  });

  it("exposes Group Paths and Ungroup Paths for path-only selections", () => {
    const onGroupPaths = vi.fn();
    const onUngroupPaths = vi.fn();
    const paths = campusWithPaths().paths.slice(0, 2);
    const props = {
      selected: null,
      selBldg: undefined,
      selMkr: undefined,
      selPath: undefined,
      allPaths: paths,
      selRoute: undefined,
      selDecorAsset: undefined,
      allDecorAssets: [],
      allBuildings: [],
      layer: "campus" as const,
      multiSelected: paths.map((path) => path.id),
      multiSelectedBuildings: [],
      selectedOutdoorCount: paths.length,
      onBatchUpdateBuildings: () => {},
      onBatchDeleteBuildings: () => {},
      onBatchUpdatePaths: () => {},
      onBatchDeletePaths: () => {},
      onGroupPaths,
      onUngroupPaths,
      onClearMultiSelect: () => {},
      onUpdateBuilding: () => {},
      onAddEntrance: () => {},
      onSelectEntrance: () => {},
      onUpdateEntrance: () => {},
      onDeleteEntrance: () => {},
      onUpdateMarker: () => {},
      onDeleteBuilding: () => {},
      onDeleteMarker: () => {},
      onUpdateDecorAsset: () => {},
      onDeleteDecorAsset: () => {},
      onDuplicateDecorAsset: () => {},
      onClose: () => {},
    };
    const { rerender } = render(<PropertiesPanel {...props} />);

    fireEvent.click(screen.getByRole("button", { name: /Group Paths/i }));
    expect(onGroupPaths).toHaveBeenCalledWith(["p-road", "p-walk"]);

    rerender(<PropertiesPanel {...props} allPaths={paths.map((path) => ({ ...path, pathNetworkId: "pnet-1" }))} />);
    fireEvent.click(screen.getByRole("button", { name: /Ungroup Paths/i }));
    expect(onUngroupPaths).toHaveBeenCalledWith(["p-road", "p-walk"]);
  });
});

describe("B5 Phase 5.11 — continuous directional path junction rendering", () => {
  it("renders T and diagonal network junctions as directional paths with no circular bulbs", () => {
    const campus = campusWithPaths();
    campus.paths = [
      { id: "wide", name: "Wide Road", type: "road", color: "#cbd5e1", width: 24, points: [{ x: 100, y: 120 }, { x: 220, y: 120 }, { x: 340, y: 120 }], pathNetworkId: "pnet-a" },
      { id: "stem", name: "Connector", type: "walkway", color: "#94a3b8", width: 10, points: [{ x: 220, y: 120 }, { x: 220, y: 210 }], pathNetworkId: "pnet-a" },
      { id: "diag", name: "Diagonal", type: "walkway", color: "#94a3b8", width: 10, points: [{ x: 220, y: 210 }, { x: 280, y: 270 }], pathNetworkId: "pnet-a" },
    ];

    const { container } = renderCanvas({ campus });
    const unions = Array.from(container.querySelectorAll("[data-testid='path-junction-union']"));

    // Only the mixed-style T (road + walkway) needs a cover patch: the
    // same-style stem→diagonal corner is ONE continuous chain (round join).
    expect(unions).toHaveLength(1);
    expect(unions[0]?.getAttribute("data-junction-shape")).toBe("directional");
    expect(unions[0]?.querySelector("circle")).toBeNull();
    expect(Number(unions[0]?.getAttribute("data-branch-count"))).toBeGreaterThanOrEqual(2);
    expect(unions[0]?.querySelector("[data-testid='path-junction-surface-union']")?.tagName.toLowerCase()).toBe("path");

    // The stem→diagonal corner is now rendered as ONE continuous walkway chain.
    const diagonalChain = Array.from(container.querySelectorAll("[data-testid='path-chain']"))
      .find((chain) => {
        const ids = chain.getAttribute("data-path-ids") ?? "";
        return ids.includes("stem") && ids.includes("diag");
      });
    expect(diagonalChain).toBeTruthy();
  });

  it("does not union unjoined visual crossings", () => {
    const campus = campusWithPaths();
    campus.paths = [
      { id: "a", type: "walkway", color: "#94a3b8", width: 10, points: [{ x: 100, y: 100 }, { x: 200, y: 200 }] },
      { id: "b", type: "walkway", color: "#94a3b8", width: 10, points: [{ x: 100, y: 200 }, { x: 200, y: 100 }] },
    ];

    const { container } = renderCanvas({ campus });

    expect(container.querySelector("[data-testid='path-junction-union']")).toBeNull();
  });

  it("renders closed-loop closure as one continuous closed chain (no patch needed)", () => {
    const campus = campusWithPaths();
    campus.paths = [
      { id: "loop", type: "walkway", color: "#94a3b8", width: 12, points: [{ x: 120, y: 120 }, { x: 190, y: 120 }, { x: 190, y: 190 }, { x: 120, y: 120 }] },
    ];

    const { container } = renderCanvas({ campus });
    const union = container.querySelector("[data-testid='path-junction-union']");
    const loopChain = container.querySelector("[data-testid='path-chain'][data-path-ids='loop']");

    // A closed loop is one continuous chain closed with Z — its own round
    // linejoin handles the closure, so no junction patch is required.
    expect(union).toBeNull();
    expect(loopChain).toBeTruthy();
    const loopEdge = loopChain?.querySelector("path");
    expect(loopEdge?.getAttribute("d")?.trim().endsWith("Z")).toBe(true);
  });
});

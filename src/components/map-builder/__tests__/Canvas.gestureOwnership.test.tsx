import { cleanup, render } from "@testing-library/react";
import { createRef, type ComponentProps } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Canvas } from "../Canvas";
import type { Campus } from "../types";

const campus: Campus = {
  id: "canvas-test", name: "Canvas Test", code: "CT", description: "", address: "", city: "", province: "", postalCode: "",
  status: "active", publishStatus: "draft", visibleToStudents: false,
  features: { indoorNavigation: true, accessibilityNavigation: true, emergencyRoutes: true, issueReporting: true },
  settings: { accessibility: true, emergency: true, eventLayer: true, gps: true },
  canvasW: 300, canvasH: 200, buildings: [], markers: [], paths: [], navNodes: [], navEdges: [],
  createdAt: "2026-01-01", updatedAt: "2026-01-01",
};

function canvasProps(guides: ComponentProps<typeof Canvas>["guides"]): ComponentProps<typeof Canvas> {
  return {
    campus,
    tool: "select",
    layer: "campus",
    selected: null,
    multiSelected: [],
    rubberBand: null,
    drawingPath: [],
    snapGrid: true,
    zoom: 1,
    pan: { x: 0, y: 0 },
    svgRef: createRef<SVGSVGElement>(),
    containerRef: createRef<HTMLDivElement>(),
    cursor: "default",
    guides,
    onCanvasDown: () => {},
    onCanvasMove: () => {},
    onCanvasUp: () => {},
    onCanvasDblClick: () => {},
    onItemDown: () => {},
    onPathClick: () => {},
    onSelect: () => {},
  };
}

afterEach(cleanup);

describe("Canvas imperative guide ownership", () => {
  it("replaces and clears guide nodes without React removing imperative children", () => {
    const rendered = render(<Canvas {...canvasProps([])} />);
    const layer = rendered.container.querySelector('[data-testid="alignment-guides-layer"]')!;

    expect(() => rendered.rerender(<Canvas {...canvasProps([{ type: "h", pos: 80 }])} />)).not.toThrow();
    expect(layer.querySelectorAll('[data-testid="alignment-guide"]')).toHaveLength(1);

    expect(() => rendered.rerender(<Canvas {...canvasProps([{ type: "v", pos: 120 }, { type: "h", pos: 40 }])} />)).not.toThrow();
    expect(layer.querySelectorAll('[data-testid="alignment-guide"]')).toHaveLength(2);

    expect(() => rendered.rerender(<Canvas {...canvasProps([])} />)).not.toThrow();
    expect(layer.children).toHaveLength(0);
  });
});

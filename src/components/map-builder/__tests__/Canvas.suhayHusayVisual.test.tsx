import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef, type ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveSuhayHusayDecorAssetId } from "../../../lib/studentCampus3dPresentation";
import { decorSelectionOutlineBox, decorWorldSize } from "../../../lib/decorVisual";
import { Canvas } from "../Canvas";
import { DECOR_ASSET_MAP } from "../constants";
import type { Campus, CampusDecorAsset } from "../types";

const suhay: CampusDecorAsset = {
  id: "suhay-authored",
  type: "monument",
  name: "Suhay Husay",
  x: 137,
  y: 92,
  scale: 1.4,
  rotation: 18,
};

const genericMonument: CampusDecorAsset = {
  id: "other-monument",
  type: "monument",
  name: "Memorial",
  x: 238,
  y: 104,
  scale: 0.8,
  rotation: 0,
};

const baseCampus: Campus = {
  id: "canvas-test",
  name: "Canvas Test",
  code: "CT",
  description: "",
  address: "",
  city: "",
  province: "",
  postalCode: "",
  status: "active",
  publishStatus: "draft",
  visibleToStudents: false,
  features: { indoorNavigation: true, accessibilityNavigation: true, emergencyRoutes: true, issueReporting: true },
  settings: { accessibility: true, emergency: true, eventLayer: true, gps: true },
  canvasW: 300,
  canvasH: 200,
  buildings: [],
  markers: [],
  paths: [],
  navNodes: [],
  navEdges: [],
  decorAssets: [genericMonument, suhay],
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
};

function canvasProps(campus = baseCampus, selected: ComponentProps<typeof Canvas>["selected"] = { type: "decorAsset", id: suhay.id }): ComponentProps<typeof Canvas> {
  return {
    campus,
    tool: "select",
    layer: "campus",
    selected,
    multiSelected: [],
    rubberBand: null,
    drawingPath: [],
    snapGrid: true,
    zoom: 1,
    pan: { x: 0, y: 0 },
    svgRef: createRef<SVGSVGElement>(),
    containerRef: createRef<HTMLDivElement>(),
    cursor: "default",
    guides: [],
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

describe("Admin Campus Canvas Suhay Husay presentation", () => {
  it("uses the current Student 2D symbol for the shared resolved asset and leaves other monuments generic", () => {
    const { container } = render(<Canvas {...canvasProps()} />);
    const resolvedId = resolveSuhayHusayDecorAssetId(baseCampus.decorAssets ?? []);
    const suhayGroup = container.querySelector(`[data-campus-decor-id="${resolvedId}"]`)!;
    const symbol = screen.getByTestId("student-suhay-husay-2d-symbol");
    const authoredSize = decorWorldSize(DECOR_ASSET_MAP.monument, suhay.scale);

    expect(resolvedId).toBe(suhay.id);
    expect(symbol).toHaveAttribute("data-asset-id", suhay.id);
    expect(symbol).toHaveAttribute("data-version", "v13");
    expect(symbol).toHaveAttribute(
      "transform",
      `translate(${suhay.x - authoredSize.width / 2},${suhay.y - authoredSize.height / 2}) rotate(${suhay.rotation},${authoredSize.width / 2},${authoredSize.height / 2})`,
    );
    expect(screen.getByTestId("admin-suhay-husay-artwork")).toHaveAttribute("pointer-events", "none");

    const suhayOutline = suhayGroup.querySelector('[data-testid="decor-selection-outline"]')!;
    const selectionBounds = decorSelectionOutlineBox(DECOR_ASSET_MAP.monument, suhay.scale);
    expect(suhayOutline).toHaveAttribute("x", String(suhay.x - selectionBounds.width / 2));
    expect(suhayOutline).toHaveAttribute("y", String(suhay.y - selectionBounds.height / 2));
    expect(suhayOutline).toHaveAttribute("transform", `rotate(${suhay.rotation}, ${suhay.x}, ${suhay.y})`);
    expect(suhayGroup.querySelector('[data-testid="decor-rotation-handle-hit"]')).toBeInTheDocument();
    expect(suhayGroup.querySelectorAll('[data-testid="decor-resize-handle"]')).toHaveLength(4);

    const genericGroup = container.querySelector('[data-campus-decor-id="other-monument"]')!;
    expect(genericGroup.querySelector('[data-testid="student-suhay-husay-2d-symbol"]')).toBeNull();
    expect(genericGroup.querySelectorAll("path")).toHaveLength(DECOR_ASSET_MAP.monument.parts?.length ?? 1);
  });

  it("keeps the legacy single-monument fallback on the same shared Student resolver", () => {
    const legacyAsset: CampusDecorAsset = { id: "legacy-statue", type: "monument", x: 80, y: 70 };
    const legacyCampus = { ...baseCampus, decorAssets: [legacyAsset] };
    const resolvedId = resolveSuhayHusayDecorAssetId(legacyCampus.decorAssets);

    render(<Canvas {...canvasProps(legacyCampus, null)} />);

    expect(resolvedId).toBe(legacyAsset.id);
    expect(screen.getByTestId("student-suhay-husay-2d-symbol")).toHaveAttribute("data-asset-id", resolvedId);
    expect(screen.getByTestId("student-suhay-husay-2d-symbol")).toHaveAttribute("data-version", "v13");
  });

  it("keeps the Admin selection hitbox as the interaction owner for the landmark artwork", () => {
    const onItemDown = vi.fn();
    const { container } = render(<Canvas {...canvasProps()} onItemDown={onItemDown} />);
    const suhayGroup = container.querySelector(`[data-campus-decor-id="${suhay.id}"]`)!;

    fireEvent.mouseDown(suhayGroup.querySelector('[data-testid="decor-hitbox"]')!, { button: 0 });

    expect(onItemDown).toHaveBeenCalledWith(expect.anything(), "decorAsset", suhay.id, suhay.x, suhay.y);
  });
});

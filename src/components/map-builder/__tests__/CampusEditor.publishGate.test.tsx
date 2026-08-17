import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { useState } from "react";
import { CampusEditor } from "../CampusEditor";
import type { Campus, NavigationNode, NavigationEdge, FloorSelection } from "../types";

// ── B7 Phase 2 — Publish severity gating ─────────────────────────────────
// Publishing uses the canonical live validation list:
//   - errors   → Publish blocked (dialog shows the count + Fix actions)
//   - warnings → Publish allowed but requires explicit confirmation
//   - info     → does not block
//   - clean    → normal publication flow

function makeCampus(overrides?: Partial<Campus>): Campus {
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
    buildings: [],
    markers: [],
    paths: [],
    navNodes: [],
    navEdges: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-02", // newer than publishedAt → publishable draft changes
    publishedAt: "2026-01-01",
    ...overrides,
  };
}

function node(overrides: Partial<NavigationNode> & { id: string; type: NavigationNode["type"] }): NavigationNode {
  return {
    name: overrides.id,
    x: 200,
    y: 200,
    accessible: true,
    color: "#16a34a",
    ...overrides,
  };
}

function edge(overrides: Partial<NavigationEdge> & { id: string; startNodeId: string; endNodeId: string }): NavigationEdge {
  return {
    distance: 100,
    bidirectional: true,
    accessible: true,
    type: "walkway",
    color: "#16a34a",
    width: 3,
    ...overrides,
  };
}

function withBuilding(campus: Campus, overrides: Partial<Campus["buildings"][number]> = {}): Campus {
  return {
    ...campus,
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
      entrances: [{ id: "e1", buildingId: "b1", edge: "bottom", offset: 0.5, type: "general" }],
      ...overrides,
    }],
  };
}

function Harness({ initialCampus, onPublish }: { initialCampus: Campus; onPublish: () => void }) {
  const [campus, setCampus] = useState<Campus>(initialCampus);
  return (
    <CampusEditor
      campus={campus}
      onBack={() => {}}
      onUpdate={setCampus}
      onPublish={onPublish}
      onOpenFloor={(_buildingId: string, _floorId: string, _selection?: FloorSelection) => {}}
      onAddBuilding={() => {}}
      savedSnapshot={JSON.stringify(initialCampus)}
    />
  );
}

let toastSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  toastSpy = vi.spyOn(toast, "info").mockImplementation(() => "" as never);
});
afterEach(() => {
  cleanup();
  toastSpy.mockRestore();
});

function clickPublish() {
  fireEvent.click(screen.getByRole("button", { name: "Publish" }));
}

describe("B7 Phase 2 — Publish severity gating", () => {
  it("ERRORS block publishing: dialog opens with the error count and a disabled publish action", () => {
    const onPublish = vi.fn();
    const campus = withBuilding(makeCampus(), { x: 850 }); // boundary error
    render(<Harness initialCampus={campus} onPublish={onPublish} />);

    clickPublish();

    expect(screen.getByText("Not Ready to Publish")).toBeInTheDocument();
    expect(screen.getByText(/1 error/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Fix Errors to Publish/ })).toBeDisabled();
    expect(onPublish).not.toHaveBeenCalled();
  });

  it("WARNINGS only reach the explicit confirmation step before publishing", () => {
    const onPublish = vi.fn();
    const campus = makeCampus({ navNodes: [node({ id: "n1", type: "outdoor" })] }); // orphan warning
    render(<Harness initialCampus={campus} onPublish={onPublish} />);

    clickPublish();
    // Dialog header shows "Needs Attention" — use the h2 role for specificity
    expect(screen.getByRole("heading", { name: "Needs Attention" })).toBeInTheDocument();

    // First click arms the confirmation; publishing only happens on the second.
    fireEvent.click(screen.getByRole("button", { name: /Review Warnings & Publish/ }));
    expect(onPublish).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Publish with Warnings/ }));
    expect(onPublish).toHaveBeenCalledTimes(1);
  });

  it("INFO-only issues do not block publication", () => {
    const onPublish = vi.fn();
    // Two disconnected INDOOR components (no outdoor/entrance nodes) → only the
    // info-severity nav_disconnected_component issue.
    const campus = makeCampus({
      navNodes: [
        node({ id: "in-1", type: "hallway", buildingId: "b1", floorId: "f1" }),
        node({ id: "in-2", type: "hallway", buildingId: "b1", floorId: "f1" }),
        node({ id: "in-3", type: "hallway", buildingId: "b1", floorId: "f1" }),
        node({ id: "in-4", type: "hallway", buildingId: "b1", floorId: "f1" }),
      ],
      navEdges: [
        edge({ id: "e1", startNodeId: "in-1", endNodeId: "in-2" }),
        edge({ id: "e2", startNodeId: "in-3", endNodeId: "in-4" }),
      ],
    });
    render(<Harness initialCampus={campus} onPublish={onPublish} />);

    // Sanity: the ONLY live issue is the info-level disconnected component.
    expect(screen.getByTestId("issues-popover").getAttribute("data-count")).toBe("1");

    clickPublish();
    expect(screen.getByRole("heading", { name: "Ready to Publish" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Publish Now" }));
    fireEvent.click(screen.getByRole("button", { name: /Confirm Publish/ }));
    expect(onPublish).toHaveBeenCalledTimes(1);
  });

  it("a clean campus proceeds through the normal publication flow", () => {
    const onPublish = vi.fn();
    const campus = makeCampus(); // no buildings / nodes → zero issues
    render(<Harness initialCampus={campus} onPublish={onPublish} />);

    clickPublish();
    expect(screen.getByRole("heading", { name: "Ready to Publish" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Publish Now" }));
    fireEvent.click(screen.getByRole("button", { name: /Confirm Publish/ }));
    expect(onPublish).toHaveBeenCalledTimes(1);
  });
});

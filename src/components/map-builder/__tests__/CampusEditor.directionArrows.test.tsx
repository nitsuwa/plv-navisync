import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { toast } from "sonner";
import { CampusEditor } from "../CampusEditor";
import type { Campus } from "../types";

// ── B5 Final — bent-path direction arrows ─────────────────────────────────
// A one-way arrow on a bent edge must point along the polyline segment that
// contains the midpoint (not along the straight A→B diagonal), so travel
// direction stays understandable on bent routes.

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
    buildings: [],
    markers: [],
    paths: [],
    navNodes: [],
    navEdges: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
}

function Harness({ initialCampus }: { initialCampus: Campus }) {
  const [campus, setCampus] = useState<Campus>(() => initialCampus);
  return (
    <CampusEditor
      campus={campus}
      onBack={() => {}}
      onUpdate={setCampus}
      onPublish={() => {}}
      onOpenFloor={() => {}}
      onAddBuilding={() => {}}
      savedSnapshot={JSON.stringify(initialCampus)}
    />
  );
}

let warningSpy: ReturnType<typeof vi.spyOn>;
let infoSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warningSpy = vi.spyOn(toast, "warning").mockImplementation(() => "" as never);
  infoSpy = vi.spyOn(toast, "info").mockImplementation(() => "" as never);
});

afterEach(() => {
  cleanup();
  warningSpy.mockRestore();
  infoSpy.mockRestore();
});

describe("bent-path direction arrows", () => {
  it("one-way arrow on a bent edge points along the middle segment, not the A→B diagonal", () => {
    const campus = makeCampus();
    // Bent edge: A (200,200) → bend (400,200) → B (400,300). The middle
    // segment is the vertical bend→B run, so the arrow must point DOWN.
    campus.navNodes = [
      { id: "nnA", name: "Gate A", type: "outdoor", x: 200, y: 200, campusId: "c1", accessible: true, color: "#16a34a" },
      { id: "nnB", name: "Gate B", type: "outdoor", x: 400, y: 300, campusId: "c1", accessible: true, color: "#16a34a" },
    ];
    campus.navEdges = [
      { id: "ne1", startNodeId: "nnA", endNodeId: "nnB", distance: 300, bidirectional: false, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 3, bendPoints: [{ x: 400, y: 200 }] },
    ];
    const { container } = render(<Harness initialCampus={campus} />);
    fireEvent.click(screen.getByText("2. Navigation"));

    const arrow = container.querySelector("[data-testid='nav-edge-direction']");
    expect(arrow).toBeTruthy();
    const points = (arrow!.getAttribute("points") ?? "").trim().split(/\s+/).map((p) => p.split(",").map(Number));
    const tip = points[0];
    const midX = 400;
    const midY = 250;
    // Arrow tip should sit BELOW the midpoint (pointing down the vertical
    // segment). The straight A→B diagonal would point mostly right/down at
    // ~26.6°, so its tip y-offset would be much smaller.
    expect(tip[0]).toBeCloseTo(midX, 0);
    expect(tip[1]).toBeGreaterThan(midY + 5);
  });

  it("two-way edges render no direction arrow", () => {
    const campus = makeCampus();
    campus.navNodes = [
      { id: "nnA", name: "Gate A", type: "outdoor", x: 200, y: 200, campusId: "c1", accessible: true, color: "#16a34a" },
      { id: "nnB", name: "Gate B", type: "outdoor", x: 300, y: 200, campusId: "c1", accessible: true, color: "#16a34a" },
    ];
    campus.navEdges = [
      { id: "ne1", startNodeId: "nnA", endNodeId: "nnB", distance: 100, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 3 },
    ];
    const { container } = render(<Harness initialCampus={campus} />);
    fireEvent.click(screen.getByText("2. Navigation"));
    expect(container.querySelector("[data-testid='nav-edge-direction']")).toBeNull();
  });
});

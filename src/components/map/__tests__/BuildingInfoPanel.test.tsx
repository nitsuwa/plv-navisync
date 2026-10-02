import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Building } from "../../../types";
import type { StudentAuthState } from "../../../hooks/useStudentAuth";
import { BuildingInfoPanel } from "../BuildingInfoPanel";

const building: Building = {
  id: "caba", name: "College of Accountancy and Business Administration", code: "CABA",
  description: "A student-facing description.", category: "academic", floor_count: 6,
  created_at: "2026-01-01T00:00:00Z",
};

describe("desktop building details panel", () => {
  it("renders a complete selected-building place page with primary actions", () => {
    const onDirections = vi.fn();
    const onEnterBuilding = vi.fn();
    render(
      <BuildingInfoPanel
        selected={building} campusId="campus-1" onClose={vi.fn()}
        onDirections={onDirections} onEnterBuilding={onEnterBuilding}
        saved={new Set()} studentAuth={{ isStudent: true } as StudentAuthState}
        onToggleSave={vi.fn()} onReport={vi.fn()} onSignInPrompt={vi.fn()}
        showQR={false} onToggleQR={vi.fn()} hasFloorPlans floorPlanCount={6}
        facilities={["Elevator"]} accessibility={["Accessible entrance"]}
      />,
    );

    expect(screen.getByTestId("building-details-desktop")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: building.name })).toBeInTheDocument();
    expect(screen.getByTestId("building-cover-fallback")).toBeInTheDocument();
    expect(screen.getByTestId("building-description")).toHaveTextContent("A student-facing description.");
    expect(screen.queryByText(/view floor plan|floor plan/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("building-directions"));
    fireEvent.click(screen.getByTestId("building-enter"));
    expect(onDirections).toHaveBeenCalledWith(building);
    expect(onEnterBuilding).toHaveBeenCalledWith(building);
  });
});

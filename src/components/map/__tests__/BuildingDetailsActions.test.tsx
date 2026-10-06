import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Building } from "../../../types";
import type { StudentAuthState } from "../../../hooks/useStudentAuth";
import { BuildingDetailsActions } from "../BuildingDetailsActions";

const building: Building = {
  id: "b1", name: "CABA", code: "CABA", description: "", category: "academic", floor_count: 6,
  created_at: "2026-01-01T00:00:00Z",
};
const studentAuth = { isStudent: true } as StudentAuthState;

function renderActions(overrides: Partial<React.ComponentProps<typeof BuildingDetailsActions>> = {}) {
  const props = {
    building, campusId: "campus-1", hasFloorPlans: true, saved: new Set<string>(), studentAuth,
    showQR: false, onDirections: vi.fn(), onEnterBuilding: vi.fn(), onSave: vi.fn(),
    onReport: vi.fn(), onSignInPrompt: vi.fn(), onToggleQR: vi.fn(), ...overrides,
  };
  return { props, ...render(<BuildingDetailsActions {...props} />) };
}

describe("building details actions", () => {
  it("offers Directions and Enter Building without duplicate floor-plan actions", () => {
    const { props } = renderActions();
    fireEvent.click(screen.getByTestId("building-directions"));
    fireEvent.click(screen.getByTestId("building-enter"));
    expect(props.onDirections).toHaveBeenCalledWith(building);
    expect(props.onEnterBuilding).toHaveBeenCalledWith(building);
    expect(screen.queryByText(/view floor plan|floor plan/i)).not.toBeInTheDocument();
  });

  it("keeps QR visible and puts Share and Copy Link in More", () => {
    const { props } = renderActions();
    const report = screen.getByRole("button", { name: "Report map issue" });
    expect(report).toHaveClass("text-destructive", "border-destructive/30");
    fireEvent.click(report);
    expect(props.onReport).toHaveBeenCalledWith(building);

    fireEvent.click(screen.getByRole("button", { name: "Show building QR code" }));
    expect(props.onToggleQR).toHaveBeenCalledTimes(1);

    fireEvent.pointerDown(screen.getByRole("button", { name: "More building actions" }), { button: 0, ctrlKey: false });
    expect(screen.getByRole("menuitem", { name: "Share" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Copy Link" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /qr code/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /report/i })).not.toBeInTheDocument();
  });

  it("keeps Enter Building present but unavailable when a building has no published floors", () => {
    renderActions({ hasFloorPlans: false });
    expect(screen.getByTestId("building-enter")).toBeDisabled();
  });
});

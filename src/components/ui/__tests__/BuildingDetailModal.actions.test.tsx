import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { Building } from "../../../types";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("../../../hooks/useToast", () => ({ useToast: () => toast }));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

const building = {
  id: "b1",
  code: "B1",
  name: "Student Center",
  description: "A campus building",
  category: "academic",
  floor_count: 3,
  departments: [],
  image_url: null,
} as unknown as Building;

import { BuildingDetailModal } from "../BuildingDetailModal";

describe("BuildingDetailModal actions", () => {
  it("opens the canonical map building deep link", () => {
    render(
      <MemoryRouter initialEntries={["/map"]}>
        <BuildingDetailModal building={building} onClose={vi.fn()} />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Navigate" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/map?buildingId=b1");
  });

  it("passes the campus scope when saving and gives share feedback", async () => {
    const onToggleSave = vi.fn();
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    render(
      <MemoryRouter>
        <BuildingDetailModal
          building={building}
          onClose={vi.fn()}
          isSaved={false}
          onToggleSave={onToggleSave}
          campusId="campus-1"
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save Student Center" }));
    expect(onToggleSave).toHaveBeenCalledWith("b1", "campus-1");
    fireEvent.click(screen.getByRole("button", { name: "Share Student Center" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });
});

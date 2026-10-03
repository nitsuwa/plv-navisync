import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const campus = vi.hoisted(() => ({
  id: "campus-1",
  markers: [{ id: "gate-main", name: "Campus Gate", type: "gate", x: 10, y: 12, color: "#2563eb" }],
}));
const accountService = vi.hoisted(() => ({
  getSavedBuildings: vi.fn().mockResolvedValue([]),
  getSavedCampusPlaceIdsAsync: vi.fn().mockResolvedValue(["gate-main"]),
  toggleSaveCampusPlace: vi.fn().mockResolvedValue(false),
}));

vi.mock("../../hooks/useStudentAuth", () => ({ useStudentAuth: () => ({ loading: false, isStudent: true }) }));
vi.mock("../../hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../hooks")>()),
  usePublishedCampus: () => ({ activeCampus: campus, loading: false }),
}));
vi.mock("../../lib/mapDataAdapter", () => ({ buildingsFromCampus: () => [] }));
vi.mock("../../services/studentAccountService", () => ({ studentAccountService: accountService }));
vi.mock("../../hooks/useToast", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock("../../hooks/useScrollReveal", () => ({ useScrollReveal: () => ({ ref: vi.fn(), visible: true }) }));
vi.mock("../../components/ui/BuildingDetailModal", () => ({ BuildingDetailModal: () => null }));

import { StudentFavoritesPage } from "../StudentFavoritesPage";

describe("StudentFavoritesPage campus places", () => {
  beforeEach(() => {
    Object.defineProperty(window, "scrollTo", { configurable: true, value: vi.fn() });
  });

  it("shows a saved gate and links back to that campus place on the map", async () => {
    render(<MemoryRouter initialEntries={["/student/favorites"]}><StudentFavoritesPage /></MemoryRouter>);

    const navigateLink = await screen.findByRole("link", { name: /Navigate/i });
    expect(screen.getByText("Campus Gate")).toBeInTheDocument();
    expect(navigateLink).toHaveAttribute("href", "/map?campusId=campus-1&placeId=gate-main");
    expect(screen.getByRole("button", { name: "Remove Campus Gate from favorites" })).toBeInTheDocument();
  });
});

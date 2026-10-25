import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const campus = vi.hoisted(() => ({
  id: "campus-1",
  markers: [{ id: "gate-main", name: "Campus Gate", type: "gate", x: 10, y: 12, color: "#2563eb" }],
}));
const auth = vi.hoisted(() => ({ userId: "student-a" }));
const accountService = vi.hoisted(() => ({
  getSavedBuildings: vi.fn().mockResolvedValue([]),
  getSavedCampusPlaceIdsAsync: vi.fn().mockResolvedValue(["gate-main"]),
  toggleSaveCampusPlace: vi.fn().mockResolvedValue(false),
}));

vi.mock("../../hooks/useStudentAuth", () => ({ useStudentAuth: () => ({ loading: false, isStudent: true }) }));
vi.mock("../../contexts/StudentAuthContext", () => ({ useAuthUserId: () => auth.userId }));
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
    auth.userId = "student-a";
    campus.id = "campus-1";
    accountService.getSavedBuildings.mockReset().mockResolvedValue([]);
    accountService.getSavedCampusPlaceIdsAsync.mockReset().mockImplementation(async () =>
      campus.id === "campus-1" ? ["gate-main"] : [],
    );
    accountService.toggleSaveCampusPlace.mockReset().mockResolvedValue(false);
    accountService.toggleSaveCampusPlace.mockClear();
  });

  it("shows a saved gate and links back to that campus place on the map", async () => {
    render(<MemoryRouter initialEntries={["/student/favorites"]}><StudentFavoritesPage /></MemoryRouter>);

    const navigateLink = await screen.findByRole("link", { name: /Navigate/i });
    expect(screen.getByText("Campus Gate")).toBeInTheDocument();
    expect(navigateLink).toHaveAttribute("href", "/map?campusId=campus-1&destinationPlaceId=gate-main");
    expect(navigateLink).toHaveClass("min-h-11");
    expect(screen.getByRole("button", { name: "Remove Campus Gate from favorites" })).toHaveClass("h-11", "w-11", "focus-visible:ring-2");
  });

  it("prevents repeated campus-place removal while the saved-place request is pending", async () => {
    let finishRemoval: ((removed: boolean) => void) | undefined;
    accountService.toggleSaveCampusPlace.mockReturnValueOnce(new Promise((resolve) => {
      finishRemoval = resolve;
    }));
    render(<MemoryRouter initialEntries={["/student/favorites"]}><StudentFavoritesPage /></MemoryRouter>);

    const removeButton = await screen.findByRole("button", { name: "Remove Campus Gate from favorites" });
    fireEvent.click(removeButton);
    fireEvent.click(removeButton);
    expect(accountService.toggleSaveCampusPlace).toHaveBeenCalledTimes(1);
    expect(removeButton).toBeDisabled();

    await act(async () => {
      finishRemoval?.(false);
      await Promise.resolve();
    });
  });

  it("hides the previous account's favorites immediately when the signed-in student changes", async () => {
    accountService.getSavedCampusPlaceIdsAsync.mockImplementation(async () =>
      auth.userId === "student-a" ? ["gate-main"] : [],
    );
    const view = render(<MemoryRouter initialEntries={["/student/favorites"]}><StudentFavoritesPage /></MemoryRouter>);

    expect(await screen.findByText("Campus Gate")).toBeInTheDocument();
    const callsBeforeAccountChange = accountService.getSavedCampusPlaceIdsAsync.mock.calls.length;

    auth.userId = "student-b";
    view.rerender(<MemoryRouter initialEntries={["/student/favorites"]}><StudentFavoritesPage /></MemoryRouter>);

    expect(screen.queryByText("Campus Gate")).not.toBeInTheDocument();
    expect(await screen.findByText("No favorite locations yet")).toBeInTheDocument();
    expect(accountService.getSavedCampusPlaceIdsAsync.mock.calls.length).toBeGreaterThan(callsBeforeAccountChange);
  });

  it("does not let a pending removal from the previous account change the new account's favorites", async () => {
    let finishRemoval: ((removed: boolean) => void) | undefined;
    accountService.toggleSaveCampusPlace.mockImplementationOnce(() => new Promise((resolve) => {
      finishRemoval = resolve;
    }));
    const view = render(<MemoryRouter initialEntries={["/student/favorites"]}><StudentFavoritesPage /></MemoryRouter>);

    const removeButton = await screen.findByRole("button", { name: "Remove Campus Gate from favorites" });
    fireEvent.click(removeButton);
    expect(removeButton).toBeDisabled();

    auth.userId = "student-b";
    view.rerender(<MemoryRouter initialEntries={["/student/favorites"]}><StudentFavoritesPage /></MemoryRouter>);
    expect(await screen.findByRole("button", { name: "Remove Campus Gate from favorites" })).toBeInTheDocument();

    await act(async () => {
      finishRemoval?.(false);
      await Promise.resolve();
    });

    expect(screen.getByText("Campus Gate")).toBeInTheDocument();
  });

  it("does not keep the previous campus's favorites visible after switching campuses", async () => {
    const view = render(<MemoryRouter initialEntries={["/student/favorites"]}><StudentFavoritesPage /></MemoryRouter>);

    expect(await screen.findByText("Campus Gate")).toBeInTheDocument();
    const callsBeforeCampusChange = accountService.getSavedCampusPlaceIdsAsync.mock.calls.length;
    campus.id = "campus-2";
    view.rerender(<MemoryRouter initialEntries={["/student/favorites"]}><StudentFavoritesPage /></MemoryRouter>);

    expect(screen.queryByText("Campus Gate")).not.toBeInTheDocument();
    expect(await screen.findByText("No favorite locations yet")).toBeInTheDocument();
    expect(accountService.getSavedCampusPlaceIdsAsync.mock.calls.length).toBeGreaterThan(callsBeforeCampusChange);
  });
});

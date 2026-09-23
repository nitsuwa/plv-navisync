import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const publishedBuildings = vi.hoisted(() => [
  { id: "b1", name: "Library", code: "LIB", description: "", category: "academic", floor_count: 2 },
  { id: "b2", name: "Student Center", code: "SC", description: "", category: "facility", floor_count: 3 },
  { id: "b3", name: "Engineering Hall", code: "ENG", description: "", category: "academic", floor_count: 4 },
  { id: "b4", name: "Administration Building", code: "ADM", description: "", category: "admin", floor_count: 2 },
  { id: "b5", name: "Sports Complex", code: "SPC", description: "", category: "sports", floor_count: 1 },
]);

const publishedCampusState = vi.hoisted(() => ({
  activeCampus: { id: "campus-1", buildings: publishedBuildings },
  loading: false,
}));

vi.mock("../../hooks/useStudentAuth", () => ({
  useStudentAuth: () => ({ username: "Test Student", isStudentOrg: false }),
}));

vi.mock("../../hooks/usePublishedCampus", () => ({
  usePublishedCampus: () => publishedCampusState,
}));

vi.mock("../../contexts/CampusDataContext", () => ({
  useCampusData: () => ({ campuses: [] }),
}));

vi.mock("../../lib/mapDataAdapter", () => ({
  buildingsFromCampus: () => publishedBuildings,
}));

vi.mock("../../services/studentAccountService", () => ({
  studentAccountService: {
    getSavedBuildings: vi.fn().mockResolvedValue([]),
    toggleSaveBuilding: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

vi.mock("../../components/ui/BuildingDetailModal", () => ({
  BuildingDetailModal: () => null,
}));

import { StudentHomePage } from "../StudentHomePage";

describe("StudentHomePage published building preview", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("shows a limited preview of buildings from the published campus", async () => {
    render(
      <MemoryRouter initialEntries={["/home"]}>
        <StudentHomePage />
      </MemoryRouter>,
    );

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    expect(screen.getByRole("button", { name: /Library LIB/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Administration Building ADM/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sports Complex SPC/i })).not.toBeInTheDocument();
  });
});

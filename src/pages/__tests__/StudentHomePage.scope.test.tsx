import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  username: "Test Student",
  isStudent: true,
  isStudentOrg: false,
  loading: false,
}));

vi.mock("../../hooks/useStudentAuth", () => ({
  useStudentAuth: () => authState,
}));

vi.mock("../../contexts/CampusDataContext", () => ({
  useCampusData: () => ({ campuses: [] }),
}));

vi.mock("../../hooks/usePublishedCampus", () => ({
  usePublishedCampus: () => ({ activeCampus: null, loading: false }),
}));

vi.mock("../../components/ui/BuildingDetailModal", () => ({
  BuildingDetailModal: () => null,
}));

import { StudentHomePage } from "../StudentHomePage";

describe("StudentHomePage in-scope content", () => {
  beforeEach(() => {
    authState.isStudent = true;
    authState.loading = false;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("keeps campus navigation content without schedule or announcements", async () => {
    render(
      <MemoryRouter initialEntries={["/home"]}>
        <StudentHomePage />
      </MemoryRouter>,
    );

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    expect(screen.getByRole("heading", { name: "Buildings" })).toBeInTheDocument();
    expect(screen.getByText("Find campus buildings, locate rooms, and plan your next route.")).toBeInTheDocument();
    // The map stays one tap away in the bottom navigation; Home no longer repeats it as a card.
    expect(screen.queryByText("Find your next stop")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Buildings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Saved" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Report" })).toBeInTheDocument();
    expect(screen.queryByText("Today's Schedule")).not.toBeInTheDocument();
    expect(screen.queryByText("NEXT CLASS")).not.toBeInTheDocument();
    expect(screen.queryByText("All classes done!")).not.toBeInTheDocument();
    expect(screen.queryByText("Announcements")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Schedule" })).not.toBeInTheDocument();
  });

  it("returns a confirmed guest to the existing public Home", () => {
    authState.isStudent = false;
    render(
      <MemoryRouter initialEntries={["/home"]}>
        <Routes>
          <Route path="/home" element={<StudentHomePage />} />
          <Route path="/" element={<div>Existing guest Home</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Existing guest Home")).toBeInTheDocument();
    expect(screen.queryByText(/Good morning/)).not.toBeInTheDocument();
  });
});

import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  username: "Test Student",
  isStudentOrg: false,
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
    expect(screen.queryByText("Today's Schedule")).not.toBeInTheDocument();
    expect(screen.queryByText("NEXT CLASS")).not.toBeInTheDocument();
    expect(screen.queryByText("All classes done!")).not.toBeInTheDocument();
    expect(screen.queryByText("Announcements")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Schedule" })).not.toBeInTheDocument();
  });
});

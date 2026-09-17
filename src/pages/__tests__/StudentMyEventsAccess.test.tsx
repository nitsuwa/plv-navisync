import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { StudentEventEditPage } from "../StudentEventEditPage";
import { StudentMyEventsPage } from "../StudentMyEventsPage";

const authState = vi.hoisted(() => ({
  isStudent: true,
  isStudentOrg: false,
  loading: false,
  username: "Test Student",
  role: "student" as const,
  profile: null,
  signOut: vi.fn(),
}));

vi.mock("../../hooks/useStudentAuth", () => ({
  useStudentAuth: () => authState,
}));

vi.mock("../../hooks/usePublishedCampus", () => ({
  usePublishedCampus: () => ({ activeCampus: null, loading: false }),
}));

vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
    promise: vi.fn(),
  }),
}));

vi.mock("../../services/eventOverlayService", () => ({
  eventOverlayService: {
    listEventOverlays: vi.fn().mockResolvedValue([]),
    getEventOverlay: vi.fn().mockResolvedValue(null),
    createEventOverlay: vi.fn(),
    updateEventOverlayDetails: vi.fn(),
    deleteEventOverlay: vi.fn(),
  },
}));

describe("StudentMyEventsPage access", () => {
  it("redirects regular students to Home without showing a restricted-feature message", async () => {
    authState.isStudent = true;
    authState.isStudentOrg = false;
    render(
      <MemoryRouter initialEntries={["/student/events"]}>
        <Routes>
          <Route path="/student/events" element={<StudentMyEventsPage />} />
          <Route path="/home" element={<div>Student Home</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText("Student Home")).toBeInTheDocument());
    expect(screen.queryByText("Student Org Access Only")).not.toBeInTheDocument();
  });

  it("redirects regular students away from a direct event-map URL", async () => {
    authState.isStudent = true;
    authState.isStudentOrg = false;
    render(
      <MemoryRouter initialEntries={["/student/events/event-1/edit"]}>
        <Routes>
          <Route path="/student/events/:id/edit" element={<StudentEventEditPage />} />
          <Route path="/home" element={<div>Student Home</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText("Student Home")).toBeInTheDocument());
    expect(screen.queryByText("Event map unavailable")).not.toBeInTheDocument();
  });

  it("keeps one centered create action for an empty Student Org event list", async () => {
    authState.isStudent = true;
    authState.isStudentOrg = true;
    render(
      <MemoryRouter initialEntries={["/student/events"]}>
        <Routes>
          <Route path="/student/events" element={<StudentMyEventsPage />} />
          <Route path="/home" element={<div>Student Home</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText("No event proposals yet")).toBeInTheDocument());
    expect(screen.getAllByRole("button", { name: "Create event" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "New event" })).not.toBeInTheDocument();
  });
});

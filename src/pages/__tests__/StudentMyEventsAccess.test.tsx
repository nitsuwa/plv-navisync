import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { StudentEventEditPage } from "../StudentEventEditPage";
import { StudentMyEventsPage } from "../StudentMyEventsPage";
import { eventOverlayService } from "../../services/eventOverlayService";

const authState = vi.hoisted(() => ({
  isStudent: true,
  isStudentOrg: false,
  loading: false,
  username: "Test Student",
  role: "student" as const,
  profile: null as { id: string } | null,
  signOut: vi.fn(),
}));

const publishedCampusState = vi.hoisted(() => ({
  activeCampus: null as Record<string, unknown> | null,
  campuses: [] as Record<string, unknown>[],
  loading: false,
  error: null as string | null,
  isCached: false,
  refetch: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../hooks/useStudentAuth", () => ({
  useStudentAuth: () => authState,
}));

vi.mock("../../hooks/usePublishedCampus", () => ({
  usePublishedCampus: () => publishedCampusState,
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
    publishedCampusState.activeCampus = null;
    publishedCampusState.campuses = [];
    publishedCampusState.loading = false;
    publishedCampusState.error = null;
    publishedCampusState.isCached = false;
    render(
      <MemoryRouter initialEntries={["/student/events"]}>
        <Routes>
          <Route path="/student/events" element={<StudentMyEventsPage />} />
          <Route path="/home" element={<div>Student Home</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText("No event proposals yet")).toBeInTheDocument());
    expect(screen.getByText(/published campus map is unavailable/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create event" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New event" })).not.toBeInTheDocument();
  });

  it("does not offer demo event locations while published campuses are loading", async () => {
    authState.isStudent = true;
    authState.isStudentOrg = true;
    publishedCampusState.activeCampus = null;
    publishedCampusState.campuses = [];
    publishedCampusState.loading = true;
    publishedCampusState.error = null;
    publishedCampusState.isCached = false;

    render(
      <MemoryRouter initialEntries={["/student/events"]}>
        <Routes>
          <Route path="/student/events" element={<StudentMyEventsPage />} />
          <Route path="/home" element={<div>Student Home</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText("Loading published campus locations"))
      .toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Create event" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Building" })).not.toBeInTheDocument();
  });

  it("offers only visible published buildings with resolvable floors", async () => {
    authState.isStudent = true;
    authState.isStudentOrg = true;
    authState.profile = { id: "org-1" };
    publishedCampusState.activeCampus = {
      id: "campus-published",
      name: "Published Campus",
      buildings: [
        { id: "visible", name: "Visible Building", visible: true, floors: [{ id: "visible-f1", buildingId: "visible", number: 1, label: "Ground Floor", rooms: [] }] },
        { id: "hidden", name: "Hidden Building", visible: false, floors: [{ id: "hidden-f1", buildingId: "hidden", number: 1, label: "Ground Floor", rooms: [] }] },
        { id: "empty", name: "No Floor Map", visible: true, floors: [] },
      ],
    };
    publishedCampusState.campuses = [publishedCampusState.activeCampus];
    publishedCampusState.loading = false;
    publishedCampusState.error = null;
    publishedCampusState.isCached = false;

    render(
      <MemoryRouter initialEntries={["/student/events"]}>
        <Routes>
          <Route path="/student/events" element={<StudentMyEventsPage />} />
          <Route path="/home" element={<div>Student Home</div>} />
        </Routes>
      </MemoryRouter>,
    );

    const createButton = await screen.findByRole("button", { name: "Create event" });
    expect(eventOverlayService.listEventOverlays).toHaveBeenCalledWith({
      campusId: "campus-published",
      createdByUserId: "org-1",
    });
    fireEvent.click(createButton);
    fireEvent.change(await screen.findByLabelText("Event title *"), { target: { value: "Student Fair" } });
    fireEvent.click(await screen.findByRole("button", { name: /continue/i }));
    const buildingSelect = await screen.findByRole("combobox", { name: "Building" });
    expect(buildingSelect).toBeInTheDocument();
    fireEvent.click(buildingSelect);
    expect(screen.getByRole("option", { name: "Visible Building" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Hidden Building" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "No Floor Map" })).not.toBeInTheDocument();
  });

  it("labels cached campus data and keeps proposal creation unavailable until refreshed", async () => {
    authState.isStudent = true;
    authState.isStudentOrg = true;
    authState.profile = { id: "org-1" };
    publishedCampusState.activeCampus = {
      id: "cached-campus",
      name: "Cached Campus",
      buildings: [{ id: "b1", name: "Building 1", visible: true, floors: [{ id: "f1", buildingId: "b1", number: 1, label: "Ground Floor", rooms: [] }] }],
    };
    publishedCampusState.campuses = [publishedCampusState.activeCampus];
    publishedCampusState.loading = false;
    publishedCampusState.error = "Network unavailable";
    publishedCampusState.isCached = true;

    render(
      <MemoryRouter initialEntries={["/student/events"]}>
        <Routes>
          <Route path="/student/events" element={<StudentMyEventsPage />} />
          <Route path="/home" element={<div>Student Home</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/showing a cached published map/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry campus map/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create event" })).not.toBeInTheDocument();
  });
});

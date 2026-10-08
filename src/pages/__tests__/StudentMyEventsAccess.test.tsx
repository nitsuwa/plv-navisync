import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StudentEventEditPage } from "../StudentEventEditPage";
import { StudentMyEventsPage } from "../StudentMyEventsPage";
import { eventOverlayService } from "../../services/eventOverlayService";
import { isEventReviewUnread } from "../../lib/studentEventUpdates";
import { eventNotificationService } from '../../services/eventNotificationService';
vi.mock('../../services/eventNotificationService',async(importOriginal)=>{const actual=await importOriginal<typeof import('../../services/eventNotificationService')>();return {...actual,eventNotificationService:{getStates:vi.fn().mockRejectedValue(new actual.EventNotificationSyncUnavailable('Browser only')),acknowledge:vi.fn().mockRejectedValue(new actual.EventNotificationSyncUnavailable('Browser only'))}};});

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
    withdrawEventSubmission: vi.fn(),
  },
}));

describe("StudentMyEventsPage access", () => {
  beforeEach(() => localStorage.clear());
  it('does not force an old editor navigation after the user leaves during acknowledgement',async()=>{
    authState.isStudentOrg=true;authState.profile={id:'org-late-route'};
    let finish!:(value:void)=>void;
    vi.mocked(eventNotificationService.acknowledge).mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=resolve;}));
    vi.mocked(eventOverlayService.listEventOverlays).mockResolvedValueOnce([{id:'delayed',createdByUserId:'org-late-route',title:'Delayed',organizer:'Org',status:'approved',locations:[]}] as never);
    render(<MemoryRouter initialEntries={['/student/events']}><Routes><Route path='/student/events' element={<StudentMyEventsPage/>}/><Route path='/home' element={<div>Home destination</div>}/><Route path='/student/events/:id/edit' element={<div>Old editor destination</div>}/></Routes></MemoryRouter>);
    fireEvent.click(await screen.findByRole('link',{name:'View maps'}));
    fireEvent.click(screen.getByRole('link',{name:'Back to Home'}));
    expect(await screen.findByText('Home destination')).toBeInTheDocument();
    await act(async()=>{finish();});
    expect(screen.getByText('Home destination')).toBeInTheDocument();
    expect(screen.queryByText('Old editor destination')).not.toBeInTheDocument();
  });
  it("acknowledges only the layout whose maps are opened", async () => {
    authState.isStudentOrg = true; authState.profile = { id: "org-1" };
    const events = ["First", "Second"].map((title, index) => ({ id: `view-${index}`, createdByUserId: "org-1", title, organizer: "Org", status: "approved", locations: [] }));
    vi.mocked(eventOverlayService.listEventOverlays).mockResolvedValueOnce(events as never);
    render(<MemoryRouter initialEntries={["/student/events"]}><Routes><Route path="/student/events" element={<StudentMyEventsPage />} /><Route path="/student/events/:id/edit" element={<div>Opened event maps</div>} /></Routes></MemoryRouter>);
    const first = await screen.findByTestId("org-event-card-view-0");
    fireEvent.click(first.querySelector<HTMLAnchorElement>('a[href="/student/events/view-0/edit"]')!);
    expect(await screen.findByText("Opened event maps")).toBeInTheDocument();
    expect(isEventReviewUnread("org-1", events[0] as never)).toBe(false);
    expect(isEventReviewUnread("org-1", events[1] as never)).toBe(true);
  });
  it("marks only the chosen reviewed layout read and keeps the other layout unread", async () => {
    authState.isStudentOrg = true; authState.profile = { id: "org-1" };
    const events = ["First", "Second"].map((title, index) => ({ id: `review-${index}`, createdByUserId: "org-1", title, organizer: "Org", status: "approved", locations: [] }));
    vi.mocked(eventOverlayService.listEventOverlays).mockResolvedValueOnce(events as never);
    render(<MemoryRouter><StudentMyEventsPage /></MemoryRouter>);
    expect(await screen.findByTestId("org-event-card-review-0")).toHaveAttribute("data-unread", "true");
    fireEvent.click(screen.getByRole("button", { name: "Mark GSO update for First as read" }));
    await waitFor(()=>expect(screen.getByTestId("org-event-card-review-0")).toHaveAttribute("data-unread", "false"));
    expect(screen.getByTestId("org-event-card-review-1")).toHaveAttribute("data-unread", "true");
  });
  it('shows a retryable error instead of an empty event list on fetch failure', async () => {
    authState.isStudentOrg = true;
    authState.profile = { id: 'org-1' };
    publishedCampusState.loading = false;
    vi.mocked(eventOverlayService.listEventOverlays).mockRejectedValueOnce(new Error('Network unavailable'));
    render(<MemoryRouter><StudentMyEventsPage /></MemoryRouter>);
    expect(await screen.findByText('Could not load your events')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry events' })).toBeInTheDocument();
    expect(screen.queryByText('No events yet')).not.toBeInTheDocument();
  });
  it.each([
    ["draft", "Continue designing your maps, then review and submit the proposal to GSO."],
    ["pending", "GSO is reviewing your proposal. You can edit the submitted maps or withdraw to Draft."],
    ["disapproved", "Read GSO feedback, revise the existing maps, then resubmit from the editor."],
    ["approved", "GSO approved this proposal. The administrator controls its schedule and student publication."],
  ])("explains the next step for a %s proposal", async (status, instruction) => {
    authState.isStudentOrg = true;
    authState.profile = { id: "org-1" };
    publishedCampusState.loading = false;
    vi.mocked(eventOverlayService.listEventOverlays).mockResolvedValueOnce([{ id: "event", createdByUserId: "org-1", title: "Fair", organizer: "Org", status, locations: [] }] as never);
    render(<MemoryRouter><StudentMyEventsPage /></MemoryRouter>);
    expect(await screen.findByText(instruction)).toBeInTheDocument();
  });
  it("confirms withdrawal and preserves the layout as a draft", async () => {
    authState.isStudentOrg = true;
    authState.profile = { id: "org-1" };
    publishedCampusState.loading = false;
    const event = { id: "pending", createdByUserId: "org-1", title: "Submitted Fair", organizer: "Org", status: "pending", updatedAt: "2026-10-03T00:00:00Z", locations: [{ id: "loc", locationRef: { type: "campus", label: "Campus Grounds" }, eventFurniture: [], eventLabels: [] }] };
    vi.mocked(eventOverlayService.listEventOverlays).mockResolvedValueOnce([event] as never).mockResolvedValueOnce([{ ...event, status: "draft" }] as never);
    vi.mocked(eventOverlayService.withdrawEventSubmission).mockResolvedValue({ ...event, status: "draft" } as never);
    render(<MemoryRouter><StudentMyEventsPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Withdraw submission" }));
    expect(screen.getByRole("alertdialog", { name: "Withdraw submission?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Withdraw to draft" }));
    await waitFor(() => expect(eventOverlayService.withdrawEventSubmission).toHaveBeenCalledWith(event.id, event.updatedAt));
    expect(await screen.findByRole("link", { name: "Continue draft" })).toBeInTheDocument();
    expect(eventOverlayService.deleteEventOverlay).not.toHaveBeenCalled();
  });
  it("offers copying an existing event layout into a new draft", async () => {
    authState.isStudentOrg = true;
    authState.profile = { id: "org-1" };
    publishedCampusState.activeCampus = { id: "campus", name: "Campus", publishStatus: "published", buildings: [] };
    publishedCampusState.campuses = [publishedCampusState.activeCampus];
    publishedCampusState.loading = false;
    publishedCampusState.error = null;
    publishedCampusState.isCached = false;
    vi.mocked(eventOverlayService.listEventOverlays).mockResolvedValueOnce([{ id: "event", createdByUserId: "org-1", campusId: "campus", title: "Fair", organizer: "Org", status: "draft", locations: [{ id: "loc", locationRef: { type: "campus", label: "Campus Grounds" }, eventFurniture: [], eventLabels: [] }] }] as never);
    render(<MemoryRouter><StudentMyEventsPage /></MemoryRouter>);
    expect(await screen.findByRole("button", { name: /duplicate layout/i })).toBeInTheDocument();
  });
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
    const router = createMemoryRouter([
      { path: "/student/events/:id/edit", element: <StudentEventEditPage /> },
      { path: "/home", element: <div>Student Home</div> },
    ], { initialEntries: ["/student/events/event-1/edit"] });
    render(<RouterProvider router={router} />);

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
      publishStatus: "published",
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
      allCampuses: true,
      createdByUserId: "org-1",
      strict: true,
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

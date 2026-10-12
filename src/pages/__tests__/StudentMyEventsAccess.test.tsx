import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StudentEventEditPage } from "../StudentEventEditPage";
import { StudentMyEventsPage } from "../StudentMyEventsPage";
import { eventOverlayService } from "../../services/eventOverlayService";
import { eventNotificationService } from '../../services/eventNotificationService';
const notificationMock = vi.hoisted(() => ({ getStates: vi.fn(), acknowledge: vi.fn() }));
vi.mock('../../services/eventNotificationService',async(importOriginal)=>{const actual=await importOriginal<typeof import('../../services/eventNotificationService')>();return {...actual,eventNotificationService:{...actual.eventNotificationService,getStates:notificationMock.getStates,acknowledge:notificationMock.acknowledge}};});

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
const assignedOrganization = vi.hoisted(() => ({
  enabled: true,
  organization: { organizationId: "org-1", organizationName: "Test Organization", grantId: "grant-1", academicYear: "2026–2027", expiresAt: "2027-06-30T15:59:59.000Z" },
}));
const organizationServiceMock = vi.hoisted(() => ({
  listMyEventOrganizations: vi.fn(),
  getHandoverSummary: vi.fn(),
  acknowledgeHandover: vi.fn(),
}));
const overlayService = vi.hoisted(() => {
  const service = {
    listEventOverlays: vi.fn().mockResolvedValue([]),
    listOrganizationEvents: vi.fn(),
    getEventOverlay: vi.fn().mockResolvedValue(null),
    getEventEditAccess: vi.fn().mockResolvedValue({ organizationId: null, grantId: null, isArchived: false, canEditContent: true, canAddressFeedback: true }),
    createEventOverlay: vi.fn(),
    updateEventOverlayDetails: vi.fn(),
    deleteEventOverlay: vi.fn(),
    withdrawEventSubmission: vi.fn(),
  };
  service.listOrganizationEvents.mockImplementation(async () => {
    const events = await service.listEventOverlays();
    return { events, total: events.length };
  });
  return service;
});

vi.mock("../../hooks/useStudentAuth", () => ({
  useStudentAuth: () => authState,
}));

vi.mock("../../hooks/usePublishedCampus", () => ({
  usePublishedCampus: () => publishedCampusState,
}));
vi.mock("../../hooks/useEventOrganizationAccess", () => ({
  useEventOrganizationAccess: () => {
    const organizations = authState.isStudentOrg && assignedOrganization.enabled ? [assignedOrganization.organization] : [];
    return { organizations, organization: organizations[0] ?? null, loading: false, refreshing: false, error: null, selectOrganization: vi.fn(), refresh: vi.fn().mockResolvedValue(undefined) };
  },
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

vi.mock("../../services/eventOverlayService", () => ({ eventOverlayService: overlayService }));
vi.mock("../../services/eventOrganizationService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/eventOrganizationService")>();
  return { ...actual, eventOrganizationService: { ...actual.eventOrganizationService, ...organizationServiceMock } };
});

describe("StudentMyEventsPage access", () => {
  beforeEach(() => {
    localStorage.clear();
    authState.isStudent = true; authState.isStudentOrg = false; authState.profile = null; authState.loading = false;
    publishedCampusState.activeCampus = null; publishedCampusState.campuses = []; publishedCampusState.loading = false; publishedCampusState.error = null; publishedCampusState.isCached = false;
    assignedOrganization.enabled = true;
    vi.clearAllMocks();
    organizationServiceMock.listMyEventOrganizations.mockImplementation(async () => authState.isStudentOrg && assignedOrganization.enabled ? [assignedOrganization.organization] : []);
    organizationServiceMock.getHandoverSummary.mockImplementation(async (grantId: string) => ({
      ...assignedOrganization.organization,
      grantId,
      startsAt: "2026-10-01T00:00:00.000Z",
      pendingCount: 0,
      unfinishedCount: 0,
      openFeedbackCount: 0,
      isRead: true,
    }));
    organizationServiceMock.acknowledgeHandover.mockResolvedValue(undefined);
    notificationMock.getStates.mockImplementation(async (_actor: string, _stream: string, candidates: Array<{ id: string }>) => new Map(candidates.map(event => [event.id, { isCurrent: true, isRead: false }])));
    notificationMock.acknowledge.mockResolvedValue(undefined);
    overlayService.listEventOverlays.mockResolvedValue([]);
    overlayService.listOrganizationEvents.mockImplementation(async () => {
      const events = await overlayService.listEventOverlays();
      return { events, total: events.length };
    });
    overlayService.getEventOverlay.mockResolvedValue(null);
    overlayService.getEventEditAccess.mockResolvedValue({ organizationId: null, grantId: null, isArchived: false, canEditContent: true, canAddressFeedback: true });
  });
  it('does not force an old editor navigation after the user leaves during acknowledgement',async()=>{
    authState.isStudentOrg=true;authState.profile={id:'org-late-route'};
    let finish!:(value:void)=>void;
    vi.mocked(eventNotificationService.acknowledge).mockImplementationOnce(()=>new Promise<void>(resolve=>{finish=resolve;}));
    organizationServiceMock.listMyEventOrganizations.mockResolvedValue([assignedOrganization.organization]);
    vi.mocked(eventOverlayService.listOrganizationEvents).mockResolvedValue({events:[{id:'delayed',organizationId:'org-1',createdByUserId:'org-late-route',title:'Delayed',organizer:'Org',status:'approved',isActive:true,publicationAt:'2026-10-08T00:00:00.000Z',dateStart:'2026-10-11T01:00:00.000Z',dateEnd:'2026-10-11T09:00:00.000Z',locations:[]}] as never,total:1});
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
    const events = ["First", "Second"].map((title, index) => ({ id: `view-${index}`, organizationId: "org-1", createdByUserId: "org-1", title, organizer: "Org", status: "approved", isActive: true, publicationAt: "2026-10-08T00:00:00.000Z", dateStart: "2026-10-11T01:00:00.000Z", dateEnd: "2026-10-11T09:00:00.000Z", locations: [] }));
    vi.mocked(eventOverlayService.listOrganizationEvents).mockResolvedValue({ events: events as never, total: events.length });
    render(<MemoryRouter initialEntries={["/student/events"]}><Routes><Route path="/student/events" element={<StudentMyEventsPage />} /><Route path="/student/events/:id/edit" element={<div>Opened event maps</div>} /></Routes></MemoryRouter>);
    const first = await screen.findByTestId("org-event-card-view-0");
    fireEvent.click(first.querySelector<HTMLAnchorElement>('a[href="/student/events/view-0/edit"]')!);
    expect(await screen.findByText("Opened event maps")).toBeInTheDocument();
    await waitFor(() => expect(notificationMock.acknowledge).toHaveBeenCalledWith("org-1", "org_review", expect.objectContaining({ id: "view-0", organizationId: "org-1" })));
    expect(notificationMock.acknowledge).not.toHaveBeenCalledWith("org-1", "org_review", expect.objectContaining({ id: "view-1" }));
  });
  it("marks only the chosen reviewed layout read and keeps the other layout unread", async () => {
    authState.isStudentOrg = true; authState.profile = { id: "org-1" };
    const events = ["First", "Second"].map((title, index) => ({ id: `review-${index}`, organizationId: "org-1", createdByUserId: "org-1", title, organizer: "Org", status: "approved", isActive: true, publicationAt: "2026-10-08T00:00:00.000Z", dateStart: "2026-10-11T01:00:00.000Z", dateEnd: "2026-10-11T09:00:00.000Z", locations: [] }));
    vi.mocked(eventOverlayService.listOrganizationEvents).mockResolvedValue({ events: events as never, total: events.length });
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
    vi.mocked(eventOverlayService.listOrganizationEvents).mockRejectedValue(new Error('Network unavailable'));
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
    const events = [{ id: "event", organizationId: "org-1", createdByUserId: "org-1", title: "Fair", organizer: "Org", status, ...(status === "approved" ? { isActive: true, publicationAt: "2026-10-08T00:00:00.000Z", dateStart: "2026-10-11T01:00:00.000Z", dateEnd: "2026-10-11T09:00:00.000Z" } : {}), locations: [] }];
    vi.mocked(eventOverlayService.listOrganizationEvents).mockResolvedValue({ events: events as never, total: events.length });
    render(<MemoryRouter><StudentMyEventsPage /></MemoryRouter>);
    await waitFor(() => expect(eventOverlayService.listOrganizationEvents).toHaveBeenCalledWith("org-1", { limit: 100, offset: 0, includeArchived: false }));
    expect(await screen.findByText(instruction)).toBeInTheDocument();
  });
  it("confirms withdrawal and preserves the layout as a draft", async () => {
    authState.isStudentOrg = true;
    authState.profile = { id: "org-1" };
    publishedCampusState.loading = false;
    const event = { id: "pending", organizationId: "org-1", createdByUserId: "org-1", title: "Submitted Fair", organizer: "Org", status: "pending", updatedAt: "2026-10-03T00:00:00Z", locations: [{ id: "loc", locationRef: { type: "campus", label: "Campus Grounds" }, eventFurniture: [], eventLabels: [] }] };
    vi.mocked(eventOverlayService.listOrganizationEvents).mockImplementation(async () => ({
      events: [vi.mocked(eventOverlayService.withdrawEventSubmission).mock.calls.length ? { ...event, status: "draft" } : event] as never,
      total: 1,
    }));
    vi.mocked(eventOverlayService.withdrawEventSubmission).mockResolvedValue({ ...event, status: "draft" } as never);
    render(<MemoryRouter><StudentMyEventsPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Withdraw submission" }));
    expect(screen.getByRole("alertdialog", { name: "Withdraw submission?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Withdraw to draft" }));
    await waitFor(() => expect(eventOverlayService.withdrawEventSubmission).toHaveBeenCalledWith(event.id, event.updatedAt, "grant-1"));
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
    vi.mocked(eventOverlayService.listOrganizationEvents).mockResolvedValue({ events: [{ id: "event", organizationId: "org-1", createdByUserId: "org-1", campusId: "campus", title: "Fair", organizer: "Org", status: "draft", locations: [{ id: "loc", locationRef: { type: "campus", label: "Campus Grounds" }, eventFurniture: [], eventLabels: [] }] }] as never, total: 1 });
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

    await waitFor(() => expect(screen.getByText("No current event work")).toBeInTheDocument());
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
    expect(eventOverlayService.listOrganizationEvents).toHaveBeenCalledWith("org-1", { limit: 100, offset: 0, includeArchived: false });
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

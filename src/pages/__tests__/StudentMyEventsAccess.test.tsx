import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, createMemoryRouter, RouterProvider, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
const eventAccessMock = vi.hoisted(() => ({ refreshing: false, error: null as string | null }));
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
    return { organizations, organization: organizations[0] ?? null, loading: false, refreshing: eventAccessMock.refreshing, error: eventAccessMock.error, selectOrganization: vi.fn(), refresh: vi.fn().mockResolvedValue(undefined) };
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
    eventAccessMock.refreshing = false; eventAccessMock.error = null;
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
  afterEach(() => vi.restoreAllMocks());
  const setEventFixtureClock = () => vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-11T03:00:00.000Z"));
  it("shows Current work and Event history as top-level workspace tabs", async () => {
    authState.isStudentOrg = true;
    authState.profile = { id: "org-1" };
    vi.mocked(eventOverlayService.listOrganizationEvents).mockResolvedValue({ events: [] as never, total: 0 });
    render(<MemoryRouter initialEntries={["/student/events"]}><StudentMyEventsPage /></MemoryRouter>);

    expect(await screen.findByRole("tablist", { name: "Organization event views" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Current work" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Event history" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tabpanel", { name: "Current work" })).toBeInTheDocument();
    expect(screen.queryByRole("searchbox", { name: "Search event history" })).not.toBeInTheDocument();
  });
  it("opens history immediately and retains its search when switching tabs", async () => {
    authState.isStudentOrg = true;
    authState.profile = { id: "org-1" };
    vi.mocked(eventOverlayService.listOrganizationEvents).mockResolvedValue({ events: [] as never, total: 0 });
    render(<MemoryRouter initialEntries={["/student/events"]}><StudentMyEventsPage /></MemoryRouter>);
    await screen.findByRole("tab", { name: "Current work" });

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Event history" }), { button: 0 });
    const search = await screen.findByRole("searchbox", { name: "Search event history" });
    fireEvent.change(search, { target: { value: "College Week" } });
    await waitFor(() => expect(eventOverlayService.listOrganizationEvents).toHaveBeenLastCalledWith("org-1", expect.objectContaining({ includeArchived: true, search: "College Week", offset: 0 })));

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Current work" }), { button: 0 });
    expect(document.querySelector<HTMLInputElement>('input[aria-label="Search event history"]')).not.toBeVisible();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Event history" }), { button: 0 });
    expect(screen.getByRole("searchbox", { name: "Search event history" })).toHaveValue("College Week");
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
  });
  it("keeps organization and unrelated query parameters while Back and Forward restore the tab", async () => {
    authState.isStudentOrg = true;
    authState.profile = { id: "org-1" };
    vi.mocked(eventOverlayService.listOrganizationEvents).mockResolvedValue({ events: [] as never, total: 0 });
    function LocationProbe() {
      const location = useLocation();
      return <output data-testid="router-search">{location.search}</output>;
    }
    const router = createMemoryRouter([{
      path: "/student/events",
      element: <><StudentMyEventsPage /><LocationProbe /></>,
    }], { initialEntries: ["/student/events?organizationId=org-1&keep=1"] });
    render(<RouterProvider router={router} />);

    await screen.findByRole("tab", { name: "Current work" });
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Event history" }), { button: 0 });
    await waitFor(() => expect(screen.getByTestId("router-search")).toHaveTextContent("organizationId=org-1&keep=1&view=history"));
    await act(async () => { await router.navigate(-1); });
    expect(screen.getByRole("tab", { name: "Current work" })).toHaveAttribute("aria-selected", "true");
    await act(async () => { await router.navigate(1); });
    expect(screen.getByRole("tab", { name: "Event history" })).toHaveAttribute("aria-selected", "true");
  });
  it("opens Delete from More actions as a confirmation and returns focus without deleting", async () => {
    authState.isStudentOrg = true;
    authState.profile = { id: "org-1" };
    const event = { id: "draft-actions", organizationId: "org-1", createdByUserId: "org-1", campusId: "campus", updatedAt: "2026-10-10T00:00:00Z", title: "Draft with actions", organizer: "Org", status: "draft", locations: [{ id: "loc", locationRef: { type: "campus", label: "Campus Grounds" }, eventFurniture: [], eventLabels: [] }] };
    vi.mocked(eventOverlayService.listOrganizationEvents).mockResolvedValue({ events: [event] as never, total: 1 });
    render(<MemoryRouter><StudentMyEventsPage /></MemoryRouter>);

    const card = await screen.findByTestId("org-event-card-draft-actions");
    expect(within(card).getByRole("link", { name: "Continue draft" })).toHaveAttribute("href", "/student/events/draft-actions/edit");
    expect(within(card).queryByRole("button", { name: /^delete$/i })).not.toBeInTheDocument();
    const menuTrigger = within(card).getByRole("button", { name: "More actions for Draft with actions" });
    fireEvent.pointerDown(menuTrigger, { button: 0, pointerType: "mouse" });
    fireEvent.pointerUp(menuTrigger, { button: 0, pointerType: "mouse" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));

    const confirmation = await screen.findByRole("alertdialog", { name: "Delete event proposal?" });
    expect(confirmation).toBeInTheDocument();
    expect(eventOverlayService.deleteEventOverlay).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(menuTrigger).toHaveFocus());
    expect(eventOverlayService.deleteEventOverlay).not.toHaveBeenCalled();
  });
  it('does not force an old editor navigation after the user leaves during acknowledgement',async()=>{
    setEventFixtureClock();
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
  it.each(["history", "organization", "grant"])("does not navigate after %s changes during acknowledgement", async (change) => {
    setEventFixtureClock();
    authState.isStudentOrg = true;
    authState.profile = { id: "org-delayed" };
    let finish!: () => void;
    notificationMock.acknowledge.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    overlayService.listOrganizationEvents.mockResolvedValue({ events: [{ id: "delayed", organizationId: "org-1", title: "Delayed", organizer: "Org", status: "approved", isActive: true, publicationAt: "2026-10-08T00:00:00Z", dateStart: "2026-10-11T01:00:00Z", dateEnd: "2026-10-11T09:00:00Z", locations: [] }], total: 1 });
    const router = createMemoryRouter([
      { path: "/student/events", element: <StudentMyEventsPage /> },
      { path: "/student/events/:id/edit", element: <div>Old editor destination</div> },
    ], { initialEntries: ["/student/events"] });
    const originalGrant = assignedOrganization.organization.grantId;
    const rendered = render(<RouterProvider router={router} />);
    try {
      fireEvent.click(await screen.findByRole("link", { name: "View maps" }));
      await waitFor(() => expect(finish).toBeTypeOf("function"));
      if (change === "history") fireEvent.mouseDown(screen.getByRole("tab", { name: "Event history" }), { button: 0 });
      else if (change === "organization") await act(async () => { await router.navigate("/student/events?organizationId=another-org"); });
      else {
        assignedOrganization.organization = { ...assignedOrganization.organization, grantId: "replacement-grant" };
        rendered.rerender(<RouterProvider router={router} />);
      }
      await act(async () => { finish(); });
      expect(router.state.location.pathname).toBe("/student/events");
      expect(screen.queryByText("Old editor destination")).not.toBeInTheDocument();
    } finally {
      assignedOrganization.organization = { ...assignedOrganization.organization, grantId: originalGrant };
    }
  });

  it("acknowledges only the layout whose maps are opened", async () => {
    setEventFixtureClock();
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
    setEventFixtureClock();
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
    if (status === "approved") setEventFixtureClock();
    authState.isStudentOrg = true;
    authState.profile = { id: "org-1" };
    publishedCampusState.loading = false;
    const events = [{ id: "event", organizationId: "org-1", createdByUserId: "org-1", title: "Fair", organizer: "Org", status, ...(status === "approved" ? { isActive: true, publicationAt: "2026-10-08T00:00:00.000Z", dateStart: "2026-10-11T01:00:00.000Z", dateEnd: "2026-10-11T09:00:00.000Z" } : {}), locations: [] }];
    vi.mocked(eventOverlayService.listOrganizationEvents).mockResolvedValue({ events: events as never, total: events.length });
    render(<MemoryRouter><StudentMyEventsPage /></MemoryRouter>);
    await waitFor(() => expect(eventOverlayService.listOrganizationEvents).toHaveBeenCalledWith("org-1", { limit: 100, offset: 0, includeArchived: false }));
    expect(await screen.findByText(instruction)).toBeInTheDocument();
  });
  it("shows an unknown status without mislabeling it or offering draft-only destructive actions", async () => {
    authState.isStudentOrg = true;
    authState.profile = { id: "org-1" };
    vi.mocked(eventOverlayService.listOrganizationEvents).mockResolvedValue({ events: [{ id: "unknown", organizationId: "org-1", createdByUserId: "org-1", campusId: "campus", title: "Unknown state", organizer: "Org", status: "unexpected", locations: [] }] as never, total: 1 });
    render(<MemoryRouter><StudentMyEventsPage /></MemoryRouter>);

    const card = await screen.findByTestId("org-event-card-unknown");
    expect(within(card).getByText("Status unavailable")).toBeInTheDocument();
    expect(within(card).getByText(/unrecognized status/i)).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Review event" })).toHaveAttribute("href", "/student/events/unknown/edit");
    const moreActions = within(card).getByRole("button", { name: "More actions for Unknown state" });
    fireEvent.pointerDown(moreActions, { button: 0, pointerType: "mouse" });
    fireEvent.pointerUp(moreActions, { button: 0, pointerType: "mouse" });
    expect(screen.queryByRole("menuitem", { name: "Delete" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Edit details" })).not.toBeInTheDocument();
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
    const card = await screen.findByTestId("org-event-card-pending");
    const menuTrigger = within(card).getByRole("button", { name: "More actions for Submitted Fair" });
    fireEvent.pointerDown(menuTrigger, { button: 0, pointerType: "mouse" });
    fireEvent.pointerUp(menuTrigger, { button: 0, pointerType: "mouse" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Withdraw submission" }));
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
    const card = await screen.findByTestId("org-event-card-event");
    const menuTrigger = within(card).getByRole("button", { name: "More actions for Fair" });
    fireEvent.pointerDown(menuTrigger, { button: 0, pointerType: "mouse" });
    fireEvent.pointerUp(menuTrigger, { button: 0, pointerType: "mouse" });
    expect(await screen.findByRole("menuitem", { name: /duplicate layout/i })).toBeInTheDocument();
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
    expect(screen.getAllByRole("button", { name: "Create event" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Create event" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "New event" })).not.toBeInTheDocument();
  });

  it("keeps creation available during a background organization access refresh", async () => {
    authState.isStudent = true;
    authState.isStudentOrg = true;
    authState.profile = { id: "org-1" };
    eventAccessMock.refreshing = true;
    publishedCampusState.activeCampus = { id: "campus", name: "Campus", publishStatus: "published", buildings: [] };
    publishedCampusState.campuses = [publishedCampusState.activeCampus];
    publishedCampusState.loading = false;
    publishedCampusState.error = null;
    publishedCampusState.isCached = false;

    render(<MemoryRouter initialEntries={["/student/events"]}><StudentMyEventsPage /></MemoryRouter>);

    const createButton = await screen.findByRole("button", { name: "Create event" });
    expect(createButton).toBeEnabled();
    expect(screen.queryByText("Available after access and a current published campus map are verified.")).not.toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "Create event" })).toBeDisabled();
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
    expect(await screen.findByRole("group", { name: "Available floors in Visible Building" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Visible Building — Ground Floor" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Available floors in Hidden Building" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Available floors in No Floor Map" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Building" })).not.toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "Create event" })).toBeDisabled();
  });
});

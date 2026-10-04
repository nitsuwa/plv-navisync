import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudentEventEditPage } from "../StudentEventEditPage";
import { eventLayoutDraftStorageKey, readEventLayoutDraft } from "../../lib/eventDraftPersistence";
import type { CampusEventOverlay, FloorPlan } from "../../components/map-builder/types";

const fixture = vi.hoisted(() => ({
  service: {
    getEventOverlay: vi.fn(),
    updateEventOverlayLayout: vi.fn(),
    submitEventOverlayLayout: vi.fn(),
    setEventFeedbackPinAddressed: vi.fn(),
  },
  toast: { success: vi.fn(), error: vi.fn() },
  floorResolver: vi.fn((_buildingId?: string, _floorNumber?: number, _campus?: unknown) => fixture.floorPlan),
  floorPlan: {
    id: "fixture-floor",
    buildingId: "b1",
    number: 1,
    label: "Ground Floor",
    canvasW: 440,
    canvasH: 290,
    backgroundColor: "#f8f9fa",
    showGrid: true,
    gridSize: 20,
    rooms: [],
    paths: [],
    walls: [],
    doors: [],
    windows: [],
    furniture: [],
    stairs: [],
    ramps: [],
    elevators: [],
    labels: [],
  },
}));

const publishedCampusState = vi.hoisted(() => ({
  listeners: new Set<() => void>(),
  activeCampus: null as { id: string } | null,
  campuses: [] as Array<{ id: string }>,
  loading: false,
  error: null as string | null,
}));

const authState = vi.hoisted(() => ({
  isStudent: true,
  isStudentOrg: true,
  loading: false,
  username: "Demo Org",
  role: "student_org" as const,
  profile: null,
  signOut: vi.fn(),
}));

vi.mock("../../hooks/useStudentAuth", () => ({ useStudentAuth: () => authState }));
vi.mock("../../hooks/usePublishedCampus", () => ({ usePublishedCampus: () => {
  useSyncExternalStore((listener) => {
    publishedCampusState.listeners.add(listener);
    return () => publishedCampusState.listeners.delete(listener);
  }, () => publishedCampusState.loading);
  return publishedCampusState;
} }));
vi.mock("../../hooks/useToast", () => ({ useToast: () => fixture.toast }));
vi.mock("../../services/eventOverlayService", () => ({ eventOverlayService: fixture.service }));
vi.mock("../../lib/eventLocationData", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/eventLocationData")>();
  return { ...actual, resolveFloorPlanForEvent: fixture.floorResolver };
});

const floorPlan = fixture.floorPlan as FloorPlan;
const overlay: CampusEventOverlay = {
  id: "event-1",
  title: "College Week",
  description: "",
  organizer: "Demo Org",
  markers: [],
  restrictedAreas: [],
  isActive: true,
  status: "pending",
  locationRef: { type: "building", buildingId: "b1", floorId: "b1-f1", label: "Main Academic Building — Floor 1" },
  eventFurniture: [{
    id: "a-chair",
    type: "chair",
    name: "Chair",
    category: "event",
    x: 24,
    y: 24,
    width: 24,
    height: 24,
    rotation: 0,
    color: "#0ea5e9",
    layer: "events",
  }],
  eventLabels: [],
  locations: [
    {
      id: "location-a",
      locationRef: { type: "building", buildingId: "b1", floorId: "b1-f1", label: "Main Academic Building — Floor 1" },
      eventFurniture: [{
        id: "a-chair",
        type: "chair",
        name: "Chair",
        category: "event",
        x: 24,
        y: 24,
        width: 24,
        height: 24,
        rotation: 0,
        color: "#0ea5e9",
        layer: "events",
      }],
      eventLabels: [],
    },
    {
      id: "location-b",
      locationRef: { type: "building", buildingId: "b2", floorId: "b2-f1", label: "Administration Building — Floor 1" },
      eventFurniture: [{
        id: "b-table",
        type: "table",
        name: "Table",
        category: "event",
        x: 12,
        y: 16,
        width: 20,
        height: 20,
        rotation: 0,
        color: "#0ea5e9",
        layer: "events",
      }],
      eventLabels: [],
    },
  ],
};

function renderPage() {
  const router = createMemoryRouter([
    { path: "/student/events/:id/edit", element: <StudentEventEditPage /> },
    { path: "/student/events", element: <div>My Events landing</div> },
  ], { initialEntries: ["/student/events/event-1/edit"] });
  return { ...render(<RouterProvider router={router} />), router };
}

function startPendingChairMove() {
  fireEvent.click(screen.getByRole("button", { name: "Toggle snapping" }));
  const item = screen.getByTestId("event-furniture-a-chair");
  fireEvent.pointerDown(item, { pointerId: 801, pointerType: "mouse", button: 0, clientX: 36, clientY: 36 });
  fireEvent.pointerMove(window, { pointerId: 801, pointerType: "mouse", clientX: 56, clientY: 36 });
  fireEvent.pointerMove(window, { pointerId: 801, pointerType: "mouse", clientX: 96, clientY: 36 });
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  fixture.floorResolver.mockImplementation(() => fixture.floorPlan);
  publishedCampusState.activeCampus = null;
  publishedCampusState.campuses = [];
  publishedCampusState.loading = false;
  publishedCampusState.error = null;
  fixture.service.getEventOverlay.mockResolvedValue(overlay);
  fixture.service.updateEventOverlayLayout.mockResolvedValue(undefined);
  fixture.service.submitEventOverlayLayout.mockResolvedValue(undefined);
});

afterEach(() => vi.restoreAllMocks());

describe("StudentEventEditPage pending interaction boundaries", () => {
  it('keeps edits and blocks a competing save while acknowledgement is in flight', async () => {
    const feedback = '@event-feedback/v1:' + JSON.stringify({text:'',pins:[{id:'pin',x:24,y:24,comment:'Move this chair'}]});
    const source = { ...overlay, locationFeedback: { 'location-a': feedback } };
    fixture.service.getEventOverlay.mockResolvedValue(source);
    let finish!: (value: CampusEventOverlay) => void;
    fixture.service.setEventFeedbackPinAddressed.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    renderPage();
    const item = await screen.findByTestId('event-furniture-a-chair');
    fireEvent.click(screen.getByText(/Feedback checklist/));
    fireEvent.click(screen.getByRole('button', { name: 'Mark as addressed' }));
    expect(screen.getByRole('button', { name: 'Save Draft' })).toBeDisabled();
    fireEvent.pointerDown(item, { button: 0, clientX: 24, clientY: 24 });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    const editedPosition = item.style.left;
    await act(async () => finish({ ...source, feedbackResolutions: { 'location-a': { pin: {feedback,addressedBy:'owner',addressedAt:'2026-10-03T12:00:00Z',note:'Moved'} } } }));
    expect(screen.getByTestId('event-furniture-a-chair').style.left).toBe(editedPosition);
    expect(fixture.service.setEventFeedbackPinAddressed).toHaveBeenCalledOnce();
    expect(fixture.service.updateEventOverlayLayout).not.toHaveBeenCalled();
  });
  it('opens approved maps for inspection without save or submit controls', async () => {
    fixture.service.getEventOverlay.mockResolvedValue({ ...overlay, status: 'approved' });
    renderPage();
    await screen.findByTestId('event-furniture-a-chair');
    expect(screen.queryByRole('button', { name: 'Save Draft' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Review & submit/ })).not.toBeInTheDocument();
  });
  it("confirms Back even with a saved draft and lets the user keep editing", async () => {
    renderPage();
    await screen.findByTestId("event-furniture-a-chair");
    fireEvent.click(screen.getByRole("button", { name: "Back to My Events" }));
    const dialog = await screen.findByRole("dialog", { name: "Leave event editor?" });
    expect(within(dialog).getByText(/Your draft is saved/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Continue Editing" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Leave event editor?" })).not.toBeInTheDocument());
    expect(screen.queryByText("My Events landing")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to My Events" }));
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Leave event editor?" })).getByRole("button", { name: "Back to My Events" }));
    expect(await screen.findByText("My Events landing")).toBeInTheDocument();
    expect(fixture.service.updateEventOverlayLayout).not.toHaveBeenCalled();
  });
  it("preserves edits made while a manual save is in flight", async () => {
    let resolveSave!: () => void;
    fixture.service.updateEventOverlayLayout.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveSave = resolve; }));
    renderPage();
    await screen.findByTestId("event-furniture-a-chair");
    startPendingChairMove();
    fireEvent.click(screen.getByRole("button", { name: "Save Draft" }));
    await waitFor(() => expect(fixture.service.updateEventOverlayLayout).toHaveBeenCalledOnce());
    const savedX = fixture.service.updateEventOverlayLayout.mock.calls[0][1][0].eventFurniture[0].x;
    fireEvent.keyDown(window, { key: "ArrowRight" });
    const editedLeft = screen.getByTestId("event-furniture-a-chair").style.left;
    expect(Number.parseFloat(editedLeft)).toBeGreaterThan(savedX);
    await act(async () => resolveSave());
    expect(screen.getByTestId("event-furniture-a-chair").style.left).toBe(editedLeft);
    expect(screen.getByText(/Unsaved changes/)).toBeInTheDocument();
  });
  it("keeps the event canvas mounted during a background campus refresh", async () => {
    renderPage();
    const item = await screen.findByTestId("event-furniture-a-chair");
    act(() => {
      publishedCampusState.loading = true;
      publishedCampusState.listeners.forEach((listener) => listener());
    });
    expect(screen.queryByText("Loading event map...")).not.toBeInTheDocument();
    expect(screen.getByTestId("event-furniture-a-chair")).toBeInTheDocument();
    expect(screen.getByTestId("event-furniture-a-chair")).toBe(item);
    publishedCampusState.loading = false;
  });
  it("resolves a stored event against its own published campus instead of the hook default", async () => {
    const campusA = { id: "campus-a" };
    const campusB = { id: "campus-b" };
    publishedCampusState.activeCampus = campusA;
    publishedCampusState.campuses = [campusA, campusB];
    fixture.service.getEventOverlay.mockResolvedValue({
      ...overlay,
      campusId: "campus-b",
      locations: [overlay.locations![1]],
    });

    renderPage();
    await waitFor(() => expect(screen.getByTestId("event-furniture-b-table")).toBeInTheDocument());

    expect(fixture.floorResolver).toHaveBeenCalledWith("b2", 1, campusB);
  });

  it("shows unavailable when an event campus is no longer in published snapshots", async () => {
    const campusA = { id: "campus-a" };
    publishedCampusState.activeCampus = campusA;
    publishedCampusState.campuses = [campusA];
    fixture.service.getEventOverlay.mockResolvedValue({ ...overlay, campusId: "campus-removed" });

    renderPage();

    expect(await screen.findByText(/published campus for this event is no longer available/i)).toBeInTheDocument();
    expect(screen.queryByTestId("event-furniture-a-chair")).not.toBeInTheDocument();
    expect(fixture.floorResolver).not.toHaveBeenCalled();
  });

  it("shows an unavailable state when the saved floor was removed from its published campus", async () => {
    const campusB = { id: "campus-b" };
    publishedCampusState.activeCampus = { id: "campus-a" };
    publishedCampusState.campuses = [publishedCampusState.activeCampus, campusB];
    fixture.service.getEventOverlay.mockResolvedValue({
      ...overlay,
      campusId: "campus-b",
      locations: [overlay.locations![1]],
    });
    fixture.floorResolver.mockImplementation(() => null as never);

    renderPage();

    expect(await screen.findByText(/there is no published map for/i)).toBeInTheDocument();
    expect(screen.queryByTestId("event-furniture-b-table")).not.toBeInTheDocument();
  });

  it('treats the database JSON key order as the same saved layout', async () => {
    fixture.service.updateEventOverlayLayout.mockImplementation(async (_id, locations) => ({...overlay, locations:JSON.parse(JSON.stringify(locations, (_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))):value))}));
    renderPage();
    await screen.findByTestId('event-furniture-a-chair');
    startPendingChairMove();
    fireEvent.click(screen.getByRole('button',{name:'Save Draft'}));
    await waitFor(()=>expect(fixture.toast.success).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button',{name:/administration building/i}));
    await waitFor(()=>expect(screen.getByTestId('event-furniture-b-table')).toBeInTheDocument());
    expect(screen.queryByRole('dialog',{name:'Unsaved Changes'})).not.toBeInTheDocument();
  });

  it('keeps location identity when a save finishes after switching the active map', async () => {
    let finish!: (saved: CampusEventOverlay) => void;
    fixture.service.updateEventOverlayLayout.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    renderPage();
    await screen.findByTestId('event-furniture-a-chair');
    fireEvent.click(screen.getByRole('button',{name:'Save Draft'}));
    fireEvent.click(screen.getByRole('button',{name:/administration building/i}));
    await screen.findByTestId('event-furniture-b-table');
    await act(async()=>finish(overlay));
    fireEvent.click(screen.getByRole('button',{name:/main academic building/i}));
    await waitFor(()=>expect(screen.getByTestId('event-furniture-a-chair')).toBeInTheDocument());
    expect(screen.queryByRole('dialog',{name:'Unsaved Changes'})).not.toBeInTheDocument();
  });

  it("commits the outgoing pending preview before switching and saves all locations", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("event-furniture-a-chair")).toBeInTheDocument());

    startPendingChairMove();
    fireEvent.click(screen.getByRole("button", { name: /administration building/i }));
    expect(await screen.findByRole("dialog", { name: "Unsaved Changes" })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("dialog", { name: "Unsaved Changes" })).getByRole("button", { name: "Save Draft" }));
    await waitFor(() => expect(screen.getByTestId("event-furniture-b-table")).toBeInTheDocument());
    expect(screen.getByTestId("event-furniture-b-table")).toHaveStyle({ left: "12px", top: "16px" });

    fireEvent.click(screen.getByRole("button", { name: /main academic building/i }));
    await waitFor(() => expect(screen.getByTestId("event-furniture-a-chair")).toHaveStyle({ left: "84px", top: "24px" }));
    await waitFor(() => expect(fixture.service.updateEventOverlayLayout).toHaveBeenCalledTimes(1));
    const [, savedLocations] = fixture.service.updateEventOverlayLayout.mock.calls[0];
    expect(savedLocations).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "location-a", eventFurniture: [expect.objectContaining({ id: "a-chair", x: 84, y: 24 })] }),
      expect.objectContaining({ id: "location-b", eventFurniture: [expect.objectContaining({ id: "b-table", x: 12, y: 16 })] }),
    ]));
  });

  it("keeps the outgoing in-memory draft when localStorage writes are unavailable", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("storage unavailable"); });
    renderPage();
    await waitFor(() => expect(screen.getByTestId("event-furniture-a-chair")).toBeInTheDocument());

    startPendingChairMove();
    fireEvent.click(screen.getByRole("button", { name: /administration building/i }));
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Unsaved Changes" })).getByRole("button", { name: "Save Draft" }));
    await waitFor(() => expect(screen.getByTestId("event-furniture-b-table")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /main academic building/i }));

    await waitFor(() => expect(screen.getByTestId("event-furniture-a-chair")).toHaveStyle({ left: "84px", top: "24px" }));
    fireEvent.click(screen.getByRole("button", { name: /administration building/i }));
    await waitFor(() => expect(screen.getByTestId("event-furniture-b-table")).toHaveStyle({ left: "12px", top: "16px" }));
  });

  it("retains the recoverable draft when the save service rejects", async () => {
    fixture.service.updateEventOverlayLayout.mockRejectedValue(new Error("save denied"));
    renderPage();
    await waitFor(() => expect(screen.getByTestId("event-furniture-a-chair")).toBeInTheDocument());

    startPendingChairMove();
    fireEvent.click(screen.getByRole("button", { name: "Save Draft" }));
    await waitFor(() => expect(fixture.service.updateEventOverlayLayout).toHaveBeenCalledTimes(1));

    const key = eventLayoutDraftStorageKey("event-1", overlay.locations![0].locationRef);
    await waitFor(() => expect(readEventLayoutDraft("event-1", overlay.locations![0].locationRef)?.eventFurniture[0]).toMatchObject({ id: "a-chair", x: 84, y: 24 }));
    expect(localStorage.getItem(key)).not.toBeNull();
    expect(fixture.toast.error).toHaveBeenCalledWith("Save failed", "save denied");
    expect(screen.getByRole("button", { name: "Save Draft" })).toBeEnabled();
  });

  it("asks before leaving, lets the student keep editing, then discards on explicit choice", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("event-furniture-a-chair")).toBeInTheDocument());
    startPendingChairMove();
    fireEvent.click(screen.getByRole("button", { name: "Back to My Events" }));
    expect(await screen.findByRole("dialog", { name: "Unsaved Changes" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue Editing" }));
    expect(screen.queryByText("My Events landing")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to My Events" }));
    fireEvent.click(await screen.findByRole("button", { name: "Leave without saving" }));
    expect(await screen.findByText("My Events landing")).toBeInTheDocument();
    expect(fixture.service.updateEventOverlayLayout).not.toHaveBeenCalled();
    expect(readEventLayoutDraft("event-1", overlay.locations![0].locationRef)).toBeNull();
  });

  it("uses the browser confirmation when a tab closes with unsaved changes", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("event-furniture-a-chair")).toBeInTheDocument());
    startPendingChairMove();
    const unload = new Event("beforeunload", { cancelable: true });
    fireEvent(window, unload);
    expect(unload.defaultPrevented).toBe(true);
  });

  it("keeps the leave prompt open when Save Draft fails", async () => {
    fixture.service.updateEventOverlayLayout.mockRejectedValue(new Error("save denied"));
    renderPage();
    await waitFor(() => expect(screen.getByTestId("event-furniture-a-chair")).toBeInTheDocument());
    startPendingChairMove();
    fireEvent.click(screen.getByRole("button", { name: "Back to My Events" }));
    const dialog = await screen.findByRole("dialog", { name: "Unsaved Changes" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save draft & leave" }));
    await waitFor(() => expect(within(dialog).getByText(/save failed/i)).toBeInTheDocument());
    expect(screen.queryByText("My Events landing")).not.toBeInTheDocument();
  });

  it("saves the active map before continuing back to My Events", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("event-furniture-a-chair")).toBeInTheDocument());
    startPendingChairMove();
    fireEvent.click(screen.getByRole("button", { name: "Back to My Events" }));
    const dialog = await screen.findByRole("dialog", { name: "Unsaved Changes" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save draft & leave" }));
    await waitFor(() => expect(fixture.service.updateEventOverlayLayout).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("My Events landing")).toBeInTheDocument();
  });
});

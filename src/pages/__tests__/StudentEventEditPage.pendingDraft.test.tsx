import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudentEventEditPage } from "../StudentEventEditPage";
import { eventLayoutDraftStorageKey, readEventLayoutDraft } from "../../lib/eventDraftPersistence";
import type { CampusEventOverlay, FloorPlan } from "../../components/map-builder/types";

const fixture = vi.hoisted(() => ({
  service: {
    getEventOverlay: vi.fn(),
    updateEventOverlayLayout: vi.fn(),
    submitEventOverlayLayout: vi.fn(),
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
vi.mock("../../hooks/usePublishedCampus", () => ({ usePublishedCampus: () => publishedCampusState }));
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
  return render(
    <MemoryRouter initialEntries={["/student/events/event-1/edit"]}>
      <Routes>
        <Route path="/student/events/:id/edit" element={<StudentEventEditPage />} />
      </Routes>
    </MemoryRouter>,
  );
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

  it("commits the outgoing pending preview before switching and saves all locations", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId("event-furniture-a-chair")).toBeInTheDocument());

    startPendingChairMove();
    fireEvent.click(screen.getByRole("button", { name: /administration building/i }));
    await waitFor(() => expect(screen.getByTestId("event-furniture-b-table")).toBeInTheDocument());
    expect(screen.getByTestId("event-furniture-b-table")).toHaveStyle({ left: "12px", top: "16px" });

    fireEvent.click(screen.getByRole("button", { name: /main academic building/i }));
    await waitFor(() => expect(screen.getByTestId("event-furniture-a-chair")).toHaveStyle({ left: "84px", top: "24px" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Draft" }));

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
});

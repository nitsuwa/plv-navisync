import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { AdminEventLayoutPreviewPage } from "../AdminEventLayoutPreviewPage";

const previewState = vi.hoisted(() => ({
  overlay: {
    id: "event-1",
    campusId: "campus-b",
    title: "Student Fair",
    description: "",
    organizer: "Council",
    status: "pending",
    isActive: true,
    markers: [],
    restrictedAreas: [],
    locations: [
      { id: "campus", locationRef: { type: "campus", label: "Campus Grounds" }, eventFurniture: [], eventLabels: [] },
      { id: "science-f2", locationRef: { type: "building", buildingId: "science", floorId: "science-f2", label: "Science Building — Floor 2" }, eventFurniture: [], eventLabels: [] },
    ],
  },
  getEventOverlay: vi.fn(),
}));

vi.mock("../../hooks/useAdminAuth", () => ({ useAdminAuth: () => ({ loading: false, isAdmin: true, profile: null }) }));
vi.mock("../../hooks/usePublishedCampus", () => ({
  usePublishedCampus: () => ({
    activeCampus: campusA,
    campuses: [campusA, campusB],
    loading: false,
    error: null,
  }),
}));
vi.mock("../../services/eventOverlayService", () => ({ eventOverlayService: { getEventOverlay: previewState.getEventOverlay } }));
vi.mock("../../components/events/EventFloorEditor", () => ({
  EventFloorEditor: ({ readOnly, floorPlan, activeCampus }: { readOnly?: boolean; floorPlan: { id: string }; activeCampus?: { id: string } }) => (
    <div data-testid="readonly-editor" data-floor-id={floorPlan.id} data-campus-id={activeCampus?.id ?? "legacy"}>
      {readOnly ? "read-only" : "editable"}
    </div>
  ),
}));

const campusA = {
  id: "campus-a",
  name: "Campus A",
  canvasW: 1200,
  canvasH: 900,
  buildings: [{ id: "other", name: "Other Building", visible: true, floors: [{ id: "other-floor", buildingId: "other", number: 1, label: "Floor 1", rooms: [] }] }],
} as never;
const campusB = {
  id: "campus-b",
  name: "Campus B",
  canvasW: 1200,
  canvasH: 900,
  buildings: [{ id: "science", name: "Science Building", visible: true, floors: [{ id: "science-floor-2", buildingId: "science", number: 2, label: "Floor 2", canvasW: 800, canvasH: 600, rooms: [] }] }],
} as never;

function renderPage() {
  return render(<MemoryRouter initialEntries={["/admin-dashboard/event-layouts/event-1/preview"]}><Routes><Route path="/admin-dashboard/event-layouts/:id/preview" element={<AdminEventLayoutPreviewPage />} /></Routes></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  previewState.getEventOverlay.mockResolvedValue(previewState.overlay);
});

describe("AdminEventLayoutPreviewPage", () => {
  it("shows all requested locations read-only and resolves the stored campus after switching floors", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Student Fair")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /edit campus grounds/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit science building/i })).toBeInTheDocument();
    expect(screen.getByTestId("readonly-editor")).toHaveAttribute("data-floor-id", "campus");
    expect(screen.getByTestId("readonly-editor")).toHaveAttribute("data-campus-id", "campus-b");

    fireEvent.click(screen.getByRole("button", { name: /edit science building/i }));
    await waitFor(() => expect(screen.getByTestId("readonly-editor")).toHaveAttribute("data-floor-id", "science-f2"));
    expect(screen.getByTestId("readonly-editor")).toHaveAttribute("data-campus-id", "campus-b");
    expect(screen.getByTestId("readonly-editor")).toHaveTextContent("read-only");
    expect(screen.queryByRole("button", { name: /save draft|submit to gso|delete/i })).not.toBeInTheDocument();
  });

  it("shows unavailable rather than previewing another campus when the event campus was removed", async () => {
    previewState.getEventOverlay.mockResolvedValue({ ...previewState.overlay, campusId: "campus-removed" });
    renderPage();

    expect(await screen.findByText(/published campus for this event is no longer available/i)).toBeInTheDocument();
    expect(screen.queryByTestId("readonly-editor")).not.toBeInTheDocument();
  });
});

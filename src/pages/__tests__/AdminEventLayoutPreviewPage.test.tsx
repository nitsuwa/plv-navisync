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
  EventFloorEditor: ({ readOnly, floorPlan, activeCampus, onFeedbackPoint, draftFeedbackPoint }: { readOnly?: boolean; floorPlan: { id: string }; activeCampus?: { id: string }; onFeedbackPoint?: (point: { x: number; y: number }) => void; draftFeedbackPoint?: { x: number; y: number } | null }) => (
    <div data-testid="readonly-editor" data-floor-id={floorPlan.id} data-campus-id={activeCampus?.id ?? "legacy"}>
      {readOnly ? "read-only" : "editable"}
      {onFeedbackPoint && <button onClick={() => onFeedbackPoint({ x: 100, y: 200 })}>Choose feedback point</button>}
      {draftFeedbackPoint && <span>Draft position visible</span>}
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
  it("asks before discarding a positioned comment on location switch", async () => {
    render(<MemoryRouter><AdminEventLayoutPreviewPage previewOverlay={previewState.overlay as never} onClose={vi.fn()} onAddFeedbackPin={vi.fn()} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Add pin' }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose feedback point' }));
    fireEvent.change(screen.getByLabelText('Pin comment'), { target: { value: 'Keep this comment' } });
    fireEvent.click(screen.getByRole('button', { name: /view science building/i }));
    expect(screen.getByText('Discard this unsaved pin?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep pin draft' }));
    expect(screen.getByLabelText('Pin comment')).toHaveValue('Keep this comment');
    expect(screen.getByTestId('readonly-editor')).toHaveAttribute('data-floor-id', 'campus');
  });
  it("shows the per-location capacity instead of silently dropping pin 31", async () => {
    const locationFeedback = { campus: '@event-feedback/v1:' + JSON.stringify({ text: '', pins: Array.from({length:30},(_,i)=>({id:`pin-${i}`,x:1,y:1,comment:'Issue'})) }) };
    render(<MemoryRouter><AdminEventLayoutPreviewPage previewOverlay={{...previewState.overlay,locationFeedback} as never} onAddFeedbackPin={vi.fn()} /></MemoryRouter>);
    expect(await screen.findByRole('button', { name: 'Add pin' })).toBeDisabled();
    expect(screen.getByText(/30\/30 pins/i)).toBeInTheDocument();
  });
  it("requires explicit pin mode and previews the point before saving a comment", async () => {
    const add = vi.fn();
    render(<MemoryRouter><AdminEventLayoutPreviewPage previewOverlay={previewState.overlay as never} onClose={vi.fn()} onAddFeedbackPin={add} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Add pin" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose feedback point" }));
    expect(screen.getByText("Draft position visible")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save pin" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Pin comment"), { target: { value: "Move booth" } });
    fireEvent.click(screen.getByRole("button", { name: "Save pin" }));
    expect(add).toHaveBeenCalledWith("campus", expect.objectContaining({ x: 100, y: 200, comment: "Move booth" }));
    expect(screen.queryByText("Draft position visible")).not.toBeInTheDocument();
  });
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

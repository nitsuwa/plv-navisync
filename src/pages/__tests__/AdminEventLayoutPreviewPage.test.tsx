import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import { AdminEventLayoutPreviewPage } from "../AdminEventLayoutPreviewPage";

vi.mock("../../hooks/useAdminAuth", () => ({ useAdminAuth: () => ({ loading: false, isAdmin: true, profile: null }) }));
vi.mock("../../hooks/usePublishedCampus", () => ({ usePublishedCampus: () => ({ activeCampus: null, loading: false }) }));
vi.mock("../../services/eventOverlayService", () => ({ eventOverlayService: { getEventOverlay: vi.fn().mockResolvedValue({
  id: "event-1", title: "Student Fair", description: "", organizer: "Council", status: "pending", isActive: true, markers: [], restrictedAreas: [],
  locations: [
    { id: "campus", locationRef: { type: "campus", label: "Campus Grounds" }, eventFurniture: [], eventLabels: [] },
    { id: "science-f2", locationRef: { type: "building", buildingId: "science", floorId: "science-f2", label: "Science Building — Floor 2" }, eventFurniture: [], eventLabels: [] },
  ],
}) } }));
vi.mock("../../components/events/EventFloorEditor", () => ({ EventFloorEditor: ({ readOnly }: { readOnly?: boolean }) => <div data-testid="readonly-editor">{readOnly ? "read-only" : "editable"}</div> }));

describe("AdminEventLayoutPreviewPage", () => {
  it("shows all requested locations in a read-only preview", async () => {
    render(<MemoryRouter initialEntries={["/admin-dashboard/event-layouts/event-1/preview"]}><Routes><Route path="/admin-dashboard/event-layouts/:id/preview" element={<AdminEventLayoutPreviewPage />} /></Routes></MemoryRouter>);
    await waitFor(() => expect(screen.getByText("Student Fair")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /edit campus grounds/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit science building/i })).toBeInTheDocument();
    expect(screen.getByTestId("readonly-editor")).toHaveTextContent("read-only");
    expect(screen.queryByRole("button", { name: /save draft|submit to gso|delete/i })).not.toBeInTheDocument();
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { OrganizationCurrentWorkCard } from "../OrganizationCurrentWorkCard";
import type { CampusEventOverlay } from "../../map-builder/types";
import { countOpenFeedbackPins, writeEventFeedback } from "../../../lib/eventFeedbackPins";

const overlay: CampusEventOverlay = {
  id: "event-1",
  title: "College Week 2026",
  status: "draft",
  description: "Full planning notes for this event.",
  academicYear: "2026-2027",
  creatorName: "Original Representative",
  createdAt: "2026-10-12T16:30:00Z",
  organizer: "Student organization",
  markers: [],
  restrictedAreas: [],
  isActive: false,
  locations: [{ id: "location-1", locationRef: { type: "campus", label: "Campus Grounds" }, eventFurniture: [], eventLabels: [] }],
};

describe("OrganizationCurrentWorkCard", () => {
  it.each(["text-only", "addressed-pins"])("keeps location comments visible with no open pins: %s", (kind) => {
    const feedback = kind === "text-only" ? "Move the booth away from the entrance." : writeEventFeedback("Keep an accessible route beside the booth.", [{ id: "pin-1", x: 0.4, y: 0.5, comment: "Leave this path clear." }]);
    const record: CampusEventOverlay = {
      ...overlay,
      status: "disapproved",
      locationFeedback: { "location-1": feedback },
      feedbackResolutions: kind === "addressed-pins" ? { "location-1": { "pin-1": { feedback, addressedAt: "2026-10-15T01:00:00Z", addressedBy: "representative", note: "Moved" } } } : {},
    };
    const openPins = countOpenFeedbackPins(record.locationFeedback, record.feedbackResolutions);
    expect(openPins).toBe(0);
    render(<MemoryRouter><OrganizationCurrentWorkCard
      overlay={record} campusName="Main Campus"
      statusPresentation={{ label: "Needs revision", color: "text-red-700", bg: "bg-red-50", icon: null }}
      nextStep="Review GSO feedback." unread={false} markingRead={false} onMarkRead={vi.fn()}
      furnitureCount={0} labelsCount={0} openFeedbackCount={openPins}
      primaryAction={<a href="/student/events/event-1/edit">Revise maps</a>} menuActions={[]}
    /></MemoryRouter>);
    expect(screen.getByText(kind === "text-only" ? /Move the booth away from the entrance/ : /Keep an accessible route beside the booth/)).toBeVisible();
    expect(screen.queryByText(/0 open map feedback pins/)).not.toBeInTheDocument();
  });

  it("keeps essential content/actions visible and reveals secondary metadata in Event details", async () => {
    const onSelect = vi.fn();
    render(<MemoryRouter><OrganizationCurrentWorkCard
      overlay={overlay}
      campusName="Main Campus"
      statusPresentation={{ label: "Draft", color: "text-sky-700", bg: "bg-sky-50", icon: <span aria-hidden="true">D</span> }}
      nextStep="Continue planning and submit for review."
      unread={false}
      markingRead={false}
      onMarkRead={vi.fn()}
      furnitureCount={4}
      labelsCount={2}
      openFeedbackCount={0}
      primaryAction={<a href="/student/events/event-1/edit">Continue draft</a>}
      menuActions={[{ id: "delete", label: "Delete", disabled: false, destructive: true, icon: <span aria-hidden="true">×</span>, onSelect }]}
      detailsContent={<p>Revision 11</p>}
    /></MemoryRouter>);

    expect(screen.getByRole("heading", { name: "College Week 2026" })).toBeInTheDocument();
    expect(screen.getByText("Continue planning and submit for review.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue draft" })).toHaveAttribute("href", "/student/events/event-1/edit");
    expect(screen.queryByText("Original Representative")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Event details" }));
    expect(screen.getByText("Original Representative")).toBeInTheDocument();
    expect(screen.getByText("Full planning notes for this event.")).toBeInTheDocument();
    expect(screen.getByText("Revision 11")).toBeInTheDocument();

    const trigger = screen.getByRole("button", { name: "More actions for College Week 2026" });
    fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" });
    fireEvent.pointerUp(trigger, { button: 0, pointerType: "mouse" });
    const menuItem = await screen.findByRole("menuitem", { name: "Delete" });
    fireEvent.click(menuItem);
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(expect.any(HTMLButtonElement)));
  });
});

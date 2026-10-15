import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { OrganizationHistoryCard } from "../OrganizationHistoryCard";

const event = {
  id: "history-1",
  title: "College Week 2026",
  status: "approved",
  dateStart: "2026-10-13T01:00:00Z",
  dateEnd: "2026-10-13T09:00:00Z",
  academicYear: "2026-2027",
  creatorName: "Past Representative",
  createdAt: "2026-10-12T16:30:00Z",
  campusId: "campus-1",
  updatedAt: "2026-10-12T16:30:00Z",
  locations: [
    { id: "l1", locationRef: { label: "Campus Grounds" } },
    { id: "l2", locationRef: { label: "COED Ground Floor" } },
    { id: "l3", locationRef: { label: "CABA Lobby" } },
  ],
} as Record<string, unknown>;

describe("OrganizationHistoryCard", () => {
  it("emphasizes map viewing, discloses extra locations and details, and preserves archived routes", async () => {
    const onReuse = vi.fn();
    const { rerender } = render(<MemoryRouter><OrganizationHistoryCard event={event as never} canReuse onReuse={onReuse} /></MemoryRouter>);

    const maps = screen.getByRole("link", { name: "View event maps" });
    expect(maps).toHaveAttribute("href", "/student/events/history-1/edit");
    expect(maps).toHaveClass("bg-primary");
    expect(screen.getByRole("button", { name: "Reuse as new draft" })).toHaveClass("border");
    expect(screen.getByText(/Campus Grounds · COED Ground Floor/)).toBeInTheDocument();
    expect(screen.queryByText(/CABA Lobby/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show 1 more location" }));
    expect(screen.getByText(/CABA Lobby/)).toBeInTheDocument();
    expect(screen.queryByText("Past Representative")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Event details" }));
    expect(screen.getByText("Past Representative")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reuse as new draft" }));
    expect(onReuse).toHaveBeenCalledWith(event);

    rerender(<MemoryRouter><OrganizationHistoryCard event={{ ...event, archivedAt: "2026-10-14T00:00:00Z" } as never} canReuse onReuse={onReuse} /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "View event maps" })).toHaveAttribute("href", "/student/events/history-1/edit?history=1");
    expect(screen.getByText("Archived")).toBeInTheDocument();
  });

  it("does not render reuse for an unfinished event or mislabel approval as publication", () => {
    render(<MemoryRouter><OrganizationHistoryCard event={{ ...event, status: "pending" } as never} canReuse={false} onReuse={vi.fn()} /></MemoryRouter>);
    expect(screen.queryByRole("button", { name: "Reuse as new draft" })).not.toBeInTheDocument();
    expect(screen.getByText("Pending review")).toBeInTheDocument();
  });
});

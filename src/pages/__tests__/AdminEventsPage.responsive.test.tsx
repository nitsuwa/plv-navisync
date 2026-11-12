import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ManagedEvent } from "../../services/eventService";
import { AdminEventsPage } from "../AdminEventsPage";

const eventMocks = vi.hoisted(() => ({ listEvents: vi.fn(), createEvent: vi.fn(), updateEvent: vi.fn(), archiveEvent: vi.fn() }));
const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("../../services/eventService", () => ({
  eventService: {
    listEvents: eventMocks.listEvents,
    createEvent: eventMocks.createEvent,
    updateEvent: eventMocks.updateEvent,
    archiveEvent: eventMocks.archiveEvent,
  },
}));
vi.mock("../../hooks/useToast", () => ({ useToast: () => toastMocks }));
vi.mock("../../hooks/useEscToClose", () => ({ useEscToClose: vi.fn() }));

const longTitle = "CampusListingNeedsToWrap".repeat(8);
const listing: ManagedEvent = {
  id: "listing-long-title",
  title: longTitle,
  description: "Campus activity with a deliberately long title.",
  category: "Academic",
  organizer: "Student Affairs",
  venue: "Student Center",
  startsAt: "2026-11-20T03:00:00.000Z",
  endsAt: "2026-11-20T06:00:00.000Z",
  status: "published",
  coverImagePath: null,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
};

describe("AdminEventsPage responsive cards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    eventMocks.listEvents.mockResolvedValue([listing]);
  });

  it("wraps long unbroken listing titles without hiding the status or actions", async () => {
    render(<AdminEventsPage />);

    const title = await screen.findByRole("heading", { name: longTitle, exact: true });
    const card = title.closest("div.bg-card");
    expect(card).not.toBeNull();
    expect(title).toHaveClass("min-w-0", "flex-1", "break-words");
    expect(title).toHaveClass("[overflow-wrap:anywhere]");
    expect(within(card as HTMLElement).getByText("Published", { exact: true })).toBeInTheDocument();
    expect(within(card as HTMLElement).getByRole("button", { name: /Edit/ })).toBeInTheDocument();
    expect(within(card as HTMLElement).getByRole("button", { name: /Archive/ })).toBeInTheDocument();
  });
});

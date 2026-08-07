import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/supabase", () => ({
  isConnected: false,
  supabase: null,
  getSupabase: vi.fn(() => {
    throw new Error("Supabase is not connected.");
  }),
}));

vi.mock("../../services/reportService", () => {
  const report = {
    id: "r1",
    campusId: "c1",
    buildingId: "b1",
    buildingName: "Main Academic Building",
    floorId: null,
    floorLabel: null,
    reporterId: "student-1",
    category: "maintenance",
    priority: "medium",
    title: "Broken hallway light",
    description: "Lights out in the hallway",
    status: "pending",
    internalNotes: null,
    resolutionNotes: null,
    createdAt: "2026-08-07T00:00:00Z",
    updatedAt: "2026-08-07T00:00:00Z",
  };
  return {
    reportService: {
      listAllReports: vi.fn().mockResolvedValue([report]),
      updateReportStatus: vi.fn().mockResolvedValue(undefined),
      updateReportInternalNotes: vi.fn().mockResolvedValue(undefined),
      archiveReport: vi.fn().mockResolvedValue(undefined),
      getReportHistory: vi.fn().mockResolvedValue([]),
    },
  };
});

vi.mock("../../services/eventService", () => {
  const event = {
    id: "ev1",
    title: "Tech Summit 2026",
    description: "Annual technology summit",
    category: "Academic",
    organizer: "CITE",
    venue: "LRC 3F Audio-Visual Room",
    startsAt: "2026-09-01T01:00:00Z",
    endsAt: "2026-09-01T05:00:00Z",
    status: "draft",
    coverImagePath: null,
    createdAt: "2026-08-07T00:00:00Z",
    updatedAt: "2026-08-07T00:00:00Z",
  };
  return {
    eventService: {
      getPublishedAnnouncements: vi.fn().mockResolvedValue([]),
      getUpcomingEvents: vi.fn().mockResolvedValue([]),
      listEvents: vi.fn().mockResolvedValue([event]),
      createEvent: vi.fn().mockResolvedValue(event),
      updateEvent: vi.fn().mockResolvedValue(undefined),
      archiveEvent: vi.fn().mockResolvedValue(undefined),
    },
  };
});

vi.mock("../../services/announcementService", () => {
  const announcement = {
    id: "a1",
    title: "Enrollment Now Open",
    content: "Enrollment for the second semester is now open.",
    category: "academic",
    priority: "high",
    status: "published",
    startsAt: null,
    expiresAt: null,
    createdBy: "u1",
    createdAt: "2026-08-07T00:00:00Z",
    updatedAt: "2026-08-07T00:00:00Z",
    archivedAt: null,
  };
  return {
    announcementService: {
      getPublishedAnnouncements: vi.fn().mockResolvedValue([]),
      listAnnouncements: vi.fn().mockResolvedValue([announcement]),
      createAnnouncement: vi.fn().mockResolvedValue(announcement),
      updateAnnouncement: vi.fn().mockResolvedValue(undefined),
      publishAnnouncement: vi.fn().mockResolvedValue(undefined),
      archiveAnnouncement: vi.fn().mockResolvedValue(undefined),
    },
  };
});

import { AdminAnnouncementsPage } from "../AdminAnnouncementsPage";
import { AdminEventsPage } from "../AdminEventsPage";
import { AdminReportsPage } from "../AdminReportsPage";

describe("admin operational pages (C8-A)", () => {
  beforeAll(() => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  beforeEach(() => vi.clearAllMocks());

  it("renders the report queue from reportService", async () => {
    render(
      <MemoryRouter>
        <AdminReportsPage />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByRole("heading", { name: "Student Reports" })).toBeInTheDocument());
    expect(await screen.findByText("Broken hallway light")).toBeInTheDocument();
  });

  it("renders the events list from eventService", async () => {
    render(
      <MemoryRouter>
        <AdminEventsPage />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByRole("heading", { name: "Campus Events" })).toBeInTheDocument());
    expect(await screen.findByText("Tech Summit 2026")).toBeInTheDocument();
    expect(screen.getByText("LRC 3F Audio-Visual Room")).toBeInTheDocument();
  });

  it("renders the announcements table from announcementService", async () => {
    render(
      <MemoryRouter>
        <AdminAnnouncementsPage />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByRole("heading", { name: "Manage Announcements" })).toBeInTheDocument());
    expect(await screen.findByText("Enrollment Now Open")).toBeInTheDocument();
  });
});

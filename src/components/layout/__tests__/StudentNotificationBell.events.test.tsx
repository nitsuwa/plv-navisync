import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eventPreviewFixture } from "../../../test/eventFullPackFixtures";

const mocks = vi.hoisted(() => ({
  listPublishedEventPreviews: vi.fn(),
  getStudentReports: vi.fn(),
  loadStudentPreferences: vi.fn(),
}));

vi.mock("../../../hooks/usePublishedCampus", () => ({
  usePublishedCampus: () => ({ activeCampus: { id: "campus-a" } }),
}));
vi.mock("../../../services/eventOverlayService", () => ({
  eventOverlayService: { listPublishedEventPreviews: mocks.listPublishedEventPreviews },
}));
vi.mock("../../../services/reportService", () => ({
  reportService: { getStudentReports: mocks.getStudentReports },
}));
vi.mock("../../../services/studentPreferencesService", () => ({
  loadStudentPreferences: mocks.loadStudentPreferences,
}));

import { StudentNotificationBell } from "../StudentNotificationBell";

describe("student event notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.getStudentReports.mockResolvedValue([]);
    mocks.loadStudentPreferences.mockResolvedValue({ mapUpdates: true, reportStatus: true, campusEvents: true });
    mocks.listPublishedEventPreviews.mockResolvedValue({
      serverNow: "2026-10-08T04:00:00.000Z",
      events: [
        eventPreviewFixture({ id: "ongoing", title: "Ongoing Campus Event" }),
        eventPreviewFixture({
          id: "upcoming",
          title: "Upcoming Campus Event",
          dateStart: "2026-10-08T06:00:00.000Z",
          dateEnd: "2026-10-08T08:00:00.000Z",
        }),
        eventPreviewFixture({
          id: "ended",
          title: "Ended Campus Event",
          dateStart: "2026-10-08T01:00:00.000Z",
          dateEnd: "2026-10-08T03:00:00.000Z",
        }),
      ],
    });
  });

  it("shows ongoing and upcoming published campus events, excludes ended events, and marks one read", async () => {
    render(
      <MemoryRouter>
        <StudentNotificationBell
          ownerId="student-a"
          isStudentOrg={false}
          eventUpdates={[]}
          unreadEventIds={new Set()}
          markEventRead={vi.fn()}
          refreshEventUpdates={vi.fn().mockResolvedValue(undefined)}
        />
      </MemoryRouter>,
    );

    await waitFor(() => expect(mocks.listPublishedEventPreviews).toHaveBeenCalledWith("campus-a"));
    fireEvent.click(screen.getByRole("button", { name: /^Notifications/ }));

    expect(await screen.findByRole("dialog", { name: "Student notifications" })).toBeInTheDocument();
    expect(await screen.findByText("Ongoing Campus Event")).toBeInTheDocument();
    expect(screen.getByText("Upcoming Campus Event")).toBeInTheDocument();
    expect(screen.queryByText("Ended Campus Event")).not.toBeInTheDocument();
    expect(screen.getByText("ongoing", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("upcoming", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Notifications, 2 unread" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: /Ongoing Campus Event/ }));
    expect(screen.getByRole("button", { name: "Notifications, 1 unread" })).toBeInTheDocument();
    const readIds = JSON.parse(localStorage.getItem("plv-student-notification-read:v1:student-a") ?? "[]") as string[];
    expect(readIds.some((id) => id.includes("campus-event:campus-a:ongoing"))).toBe(true);
  });
});

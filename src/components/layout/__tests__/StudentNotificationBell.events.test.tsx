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
  normalizeReportStatus: (status: string) => status,
  reportService: { getStudentReports: mocks.getStudentReports },
}));
vi.mock("../../../services/studentPreferencesService", () => ({
  loadStudentPreferences: mocks.loadStudentPreferences,
}));

import { StudentNotificationBell, StudentNotificationsSection } from "../StudentNotificationBell";

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

  it("shows a successor handover summary and opens the matching organization workspace", async () => {
    const markHandoverRead = vi.fn();
    render(
      <MemoryRouter>
        <StudentNotificationBell
          ownerId="successor"
          isStudentOrg
          eventUpdates={[]}
          unreadEventIds={new Set()}
          markEventRead={vi.fn()}
          refreshEventUpdates={vi.fn().mockResolvedValue(undefined)}
          handoverUpdates={[{
            organizationId: "org-it", organizationName: "IT Organization", grantId: "grant-2026",
            academicYear: "2026–2027", expiresAt: "2027-06-30T00:00:00Z", startsAt: "2026-10-09T00:00:00Z",
            pendingCount: 1, unfinishedCount: 2, openFeedbackCount: 1, isRead: false,
          }]}
          markHandoverRead={markHandoverRead}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));
    const notice = await screen.findByRole("link", { name: /IT Organization event handover/i });
    expect(notice).toHaveAttribute("href", "/student/events?organizationId=org-it&handover=grant-2026");
    expect(screen.getByText(/2 unfinished events \(1 pending submission\) · 1 open feedback pin/i)).toBeInTheDocument();
    fireEvent.click(notice);
    expect(markHandoverRead).toHaveBeenCalledWith("grant-2026");
  });

  it("shows the handover action when only pending submissions remain", async () => {
    render(<MemoryRouter><StudentNotificationBell ownerId="pending-successor" isStudentOrg eventUpdates={[]} unreadEventIds={new Set()} markEventRead={vi.fn()} refreshEventUpdates={vi.fn().mockResolvedValue(undefined)} handoverUpdates={[{
      organizationId: "org-it", organizationName: "IT Organization", grantId: "grant-pending", academicYear: "2026–2027", expiresAt: "2027-06-30T00:00:00Z", startsAt: "2026-10-09T00:00:00Z", pendingCount: 2, unfinishedCount: 0, openFeedbackCount: 0, isRead: false,
    }]} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));
    expect(await screen.findByRole("link", { name: /IT Organization event handover/i })).toHaveAttribute("href", "/student/events?organizationId=org-it&handover=grant-pending");
    expect(screen.getByText(/2 pending submissions/i)).toBeInTheDocument();
  });

  it("uses theme-based contrast cues and a themed status filter in the notification section", async () => {
    render(
      <MemoryRouter>
        <StudentNotificationsSection
          ownerId="student-section"
          isStudentOrg={false}
          eventUpdates={[]}
          unreadEventIds={new Set()}
          markEventRead={vi.fn()}
          refreshEventUpdates={vi.fn().mockResolvedValue(undefined)}
          campusId="campus-a"
          reportsSnapshot={[{
            id: "report-resolved",
            campusId: "campus-a",
            reporterId: "student-section",
            category: "maintenance",
            priority: "low",
            title: "Walkway light",
            description: "The light has been repaired.",
            status: "resolved",
            updates: [{ text: "Status changed to resolved", date: "2026-10-12T00:00:00.000Z" }],
            createdAt: "2026-10-01T00:00:00.000Z",
            updatedAt: "2026-10-12T00:00:00.000Z",
          }]}
          reportsSnapshotLoading={false}
          reportsSnapshotError={false}
          onRetryReports={vi.fn()}
        />
      </MemoryRouter>,
    );

    const notice = await screen.findByRole("link", { name: /Upcoming Campus Event/i });
    expect(notice.querySelector("[data-notification-icon]")).toHaveClass("text-foreground");
    expect(notice.querySelector("[data-notification-icon]")).not.toHaveClass("text-accent-foreground");
    expect(notice).toHaveClass("bg-primary/[0.02]");
    expect(notice).toHaveClass("dark:border-blue-300/55");
    expect(notice.querySelector(".uppercase")).toHaveClass("dark:text-blue-300");
    expect(screen.getByLabelText("Report status: Resolved")).toHaveClass("dark:text-emerald-300");
    expect(screen.getAllByText("Unread notification")).toHaveLength(3);
    expect(screen.getAllByText("Unread notification")[0]).toHaveClass("sr-only");
    expect(notice.querySelector("time")).toHaveAttribute("datetime", "2026-10-08T06:00:00.000Z");
    expect(notice.querySelector("time")).toHaveTextContent(/\S/);
    expect(screen.getByRole("button", { name: /Mark all read/ })).toHaveClass("dark:text-blue-300");
    expect(screen.getByRole("link", { name: /Ongoing Campus Event/i }).querySelector(".uppercase")).toHaveClass("text-emerald-800", "dark:text-emerald-300");

    const statusFilter = screen.getByRole("combobox", { name: "Report status" });
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
    try {
      fireEvent.click(statusFilter);
      expect(await screen.findByRole("listbox")).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "All notifications" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("option", { name: "Pending" }));
      expect(await screen.findByText("No pending reports")).toBeInTheDocument();
      expect(statusFilter).toHaveTextContent("Pending");
    } finally {
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: originalScrollIntoView });
    }
  });
});

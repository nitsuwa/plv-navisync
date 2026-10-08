import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({
  listActivity: vi.fn(),
  resolveContexts: vi.fn(),
  getPreferences: vi.fn(),
  navigate: vi.fn(),
  submissions: [] as Array<Record<string, unknown>>,
  markSubmissionRead: vi.fn(),
  requestGuarded: vi.fn(),
}));

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
    Outlet: () => null,
    useLocation: () => ({ pathname: "/admin-dashboard", search: "", hash: "" }),
    useNavigate: () => mocks.navigate,
  };
});
vi.mock("../../ui/NavigationProgress", () => ({ NavigationProgress: () => null }));
vi.mock("../AdminSidebar", () => ({ AdminSidebar: () => null }));
vi.mock("../../ui/ThemeToggle", () => ({ ThemeToggle: () => null }));
vi.mock("../../../hooks/useTheme", () => ({ useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }) }));
vi.mock("../../../hooks/useAdminAuth", () => ({ useAdminAuth: () => ({
  loading: false,
  isAdmin: true,
  profile: { id: "admin-1", first_name: "Demo", last_name: "Administrator", email: "admin@example.test" },
}) }));
vi.mock("../../map-builder/UnsavedChangesContext", () => ({
  UnsavedChangesProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useUnsavedChangesContext: () => ({ requestGuarded: mocks.requestGuarded }),
}));
vi.mock("../../../services/activityLogService", () => ({
  activityLogErrorMessage: (error: unknown) => {
    const value = error && typeof error === "object" ? error as { code?: unknown; message?: unknown } : {};
    return typeof value.message === "string" ? `${value.message}${typeof value.code === "string" ? ` (${value.code})` : ""}` : "Could not load activity logs.";
  },
  activityLogService: {
    listVisibleActivityLogs: mocks.listActivity,
    resolveActivityPresentationContexts: mocks.resolveContexts,
  },
}));
vi.mock("../../../services/adminNotificationPreferencesService", () => ({
  adminNotificationPreferencesService: {
    get: mocks.getPreferences,
    isEnabled: () => true,
  },
}));
vi.mock("../../../lib/notificationService", () => ({
  notificationService: { markLogsSeen: vi.fn(), countUnseenLogs: () => 0 },
}));
vi.mock("../../../hooks/useAdminEventSubmissions", () => ({ useAdminEventSubmissions: () => ({ events: mocks.submissions, unreadIds: new Set(mocks.submissions.map(event => event.id)), pendingCount: mocks.submissions.length, unreadCount: mocks.submissions.length, eventsEnabled: true, loading: false, error: '', receiptError: '', refresh: vi.fn(), markRead: mocks.markSubmissionRead }) }));

import { AdminLayout } from "../AdminLayout";

describe("Admin activity notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.submissions = [];
    mocks.markSubmissionRead.mockResolvedValue('saved');
    mocks.requestGuarded.mockImplementation((action: () => void) => action());
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((media: string) => ({
        matches: false,
        media,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    mocks.listActivity.mockRejectedValue({ code: "PGRST205", message: "Activity preferences are unavailable" });
    mocks.resolveContexts.mockResolvedValue(new Map());
    mocks.getPreferences.mockResolvedValue({ reports: true, events: true, campus: true, announcements: true, users: true });
  });

  it("shows an error and retry instead of a false empty state, then loads restored activity", async () => {
    render(<AdminLayout />);
    fireEvent.click(await screen.findByRole("button", { name: "Notifications" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn’t load activity.");
    expect(screen.queryByText("No activity yet.")).not.toBeInTheDocument();

    mocks.listActivity.mockResolvedValue([{
      id: "log-1",
      action: "campus_version.published",
      actor_id: null,
      campus_id: null,
      entity_type: "campus_versions",
      entity_id: null,
      metadata: null,
      created_at: "2026-09-29T14:40:27Z",
    }]);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Campus map published")).toBeInTheDocument();
    await waitFor(() => expect(mocks.listActivity).toHaveBeenCalledTimes(3));
  });

  it('keeps submission notices unread when opening the bell and links each notice to its exact review', async () => {
    mocks.listActivity.mockResolvedValue([]);
    mocks.submissions = [{ id: 'qa-one', title: 'Student Fair', organizer: 'Science Council', status: 'pending', submittedAt: '2026-10-07T08:00:00Z', locations: [{ id: 'grounds', locationRef: { type: 'campus', label: 'Campus Grounds' }, eventFurniture: [], eventLabels: [] }] }];
    render(<AdminLayout />);
    fireEvent.click(await screen.findByRole('button', { name: 'Notifications' }));
    const action = await screen.findByRole('button', { name: /Review Student Fair/i });
    expect(screen.getByText(/Science Council/)).toBeInTheDocument();
    expect(mocks.markSubmissionRead).not.toHaveBeenCalled();
    fireEvent.click(action);
    expect(mocks.navigate).toHaveBeenCalledWith('/admin-dashboard/event-layouts?review=qa-one');
  });

  it('protects unsaved map work before following a submission notification', async () => {
    mocks.listActivity.mockResolvedValue([]);
    mocks.submissions = [{ id: 'qa-one', title: 'Student Fair', organizer: 'Science Council', status: 'pending', locations: [] }];
    let continueNavigation: (() => void) | undefined;
    mocks.requestGuarded.mockImplementation((action: () => void) => { continueNavigation = action; });
    render(<AdminLayout />);
    fireEvent.click(await screen.findByRole('button', { name: 'Notifications' }));
    fireEvent.click(await screen.findByRole('button', { name: /Review Student Fair/i }));
    expect(mocks.navigate).not.toHaveBeenCalled();
    continueNavigation?.();
    expect(mocks.navigate).toHaveBeenCalledWith('/admin-dashboard/event-layouts?review=qa-one');
  });
});

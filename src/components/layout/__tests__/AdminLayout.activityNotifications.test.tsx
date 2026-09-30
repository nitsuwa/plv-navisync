import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({
  listActivity: vi.fn(),
  resolveContexts: vi.fn(),
  getPreferences: vi.fn(),
  navigate: vi.fn(),
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

import { AdminLayout } from "../AdminLayout";

describe("Admin activity notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});

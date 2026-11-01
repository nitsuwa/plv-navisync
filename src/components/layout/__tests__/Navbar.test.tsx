import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Navbar } from "../Navbar";

const authState = vi.hoisted(() => ({
  isStudent: true,
  isAdmin: false,
  isStudentOrg: true,
  loading: false,
  username: "Test Student",
  role: "student_org" as const,
  profile: null as null | { id: string; avatar_path?: string },
  signOut: vi.fn(),
}));
const themeState = vi.hoisted(() => ({
  theme: "light" as "light" | "dark",
  toggleTheme: vi.fn(),
}));

vi.mock("../../../hooks/useStudentAuth", () => ({
  useStudentAuth: () => authState,
}));

vi.mock("../../../hooks/useTheme", () => ({
  useTheme: () => themeState,
}));

vi.mock("../../../hooks/useStudentOrgEventUpdates", () => ({
  useStudentOrgEventUpdates: () => ({
    events: [],
    unreadIds: new Set<string>(),
    unreadCount: 0,
    error: null,
    refresh: vi.fn(),
    markRead: vi.fn(),
    handoverUpdates: [],
    markHandoverRead: vi.fn(),
  }),
}));

vi.mock("../StudentNotificationBell", () => ({
  StudentNotificationBell: () => <button type="button" aria-label="Notifications" />,
}));

vi.mock("../../../hooks/useToast", () => ({
  useToast: () => ({
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
    promise: vi.fn(),
  }),
}));

vi.mock("../../../services/reportService", () => ({
  reportService: { getStudentReports: vi.fn().mockResolvedValue([]) },
}));

vi.mock("../../../lib/notificationService", () => ({
  notificationService: { detectReportStatusChanges: vi.fn().mockReturnValue([]) },
}));

function renderNavbar() {
  return render(
    <MemoryRouter initialEntries={["/home"]}>
      <Navbar />
    </MemoryRouter>,
  );
}

function RouteProbe() {
  const location = useLocation();
  return <><Navbar /><span data-testid="current-route">{location.pathname}</span></>;
}

describe("Navbar student navigation", () => {
  beforeEach(() => {
    authState.isStudent = true;
    authState.isAdmin = false;
    authState.isStudentOrg = true;
    authState.loading = false;
    authState.username = "Test Student";
    authState.profile = null;
    authState.signOut.mockReset();
    themeState.theme = "light";
    themeState.toggleTheme.mockReset();
  });

  it("shows Home, Map, and Organization Events to Student Org users", () => {
    authState.isStudent = true;
    authState.isStudentOrg = true;
    renderNavbar();

    expect(screen.getByRole("link", { name: /Home/ })).toHaveAttribute("href", "/home");
    expect(screen.getByRole("link", { name: /Map/ })).toHaveAttribute("href", "/map");
    expect(screen.getByRole("link", { name: /Organization Events/ })).toHaveAttribute("href", "/student/events");
    expect(screen.queryByRole("link", { name: /My Day/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Announcements/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeInTheDocument();
  });

  it("does not expose Organization Events to regular students", () => {
    authState.isStudent = true;
    authState.isStudentOrg = false;
    renderNavbar();

    expect(screen.getByRole("link", { name: /Home/ })).toHaveAttribute("href", "/home");
    expect(screen.getByRole("link", { name: /Map/ })).toHaveAttribute("href", "/map");
    expect(screen.queryByRole("link", { name: /Organization Events/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /My Day/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Announcements/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeInTheDocument();
  });

  it.each([
    ["regular students", false],
    ["Student Organization accounts", true],
  ])("places the theme toggle before Notifications for %s", (_accountType, isStudentOrg) => {
    authState.isStudent = true;
    authState.isStudentOrg = isStudentOrg;
    authState.profile = { id: "student-profile" };
    renderNavbar();

    const themeToggle = screen.getByRole("button", { name: "Switch to dark mode" });
    const notifications = screen.getByRole("button", { name: "Notifications" });
    const profile = screen.getByRole("button", { name: /Test Student.*user menu/i });

    expect(themeToggle.parentElement).toBe(notifications.parentElement);
    expect(themeToggle.nextElementSibling).toBe(notifications);
    expect(notifications.nextElementSibling).toBe(profile.parentElement);
    fireEvent.click(themeToggle);
    expect(themeState.toggleTheme).toHaveBeenCalledTimes(1);
  });

  it("keeps the account menu focused on account pages and omits Home", () => {
    authState.isStudent = true;
    authState.isStudentOrg = false;
    authState.loading = false;
    renderNavbar();
    fireEvent.click(screen.getByRole("button", { name: /Test Student.*user menu/i }));

    expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /My Profile/ })).toHaveAttribute("href", "/student");
    expect(screen.getByRole("link", { name: /Favorites/ })).toHaveAttribute("href", "/student/favorites");
    expect(screen.getByRole("link", { name: /My Reports/ })).toHaveAttribute("href", "/student/reports");
    expect(screen.getByRole("link", { name: /Settings/ })).toHaveAttribute("href", "/student/settings");
    expect(screen.getByRole("button", { name: /Sign Out/ })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Home/ })).toHaveLength(1);
  });

  it("uses the first outside click only to dismiss the account menu", async () => {
    const underlay = vi.fn();
    render(<MemoryRouter initialEntries={["/home"]}><><Navbar /><button onClick={underlay}>Map underneath</button></></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /Test Student.*user menu/i }));
    await screen.findByRole("link", { name: /My Profile/ });
    const outsideButton = screen.getByRole("button", { name: "Map underneath" });
    fireEvent.pointerDown(outsideButton);
    fireEvent.click(outsideButton);

    await waitFor(() => expect(screen.queryByRole("link", { name: /My Profile/ })).not.toBeInTheDocument());
    expect(underlay).not.toHaveBeenCalled();
  });

  it("executes Sign Out and returns to the public route", async () => {
    authState.isStudent = true;
    authState.isStudentOrg = false;
    authState.loading = false;
    authState.signOut.mockResolvedValue(undefined);
    render(<MemoryRouter initialEntries={["/home"]}><RouteProbe /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /Test Student.*user menu/i }));
    fireEvent.click(screen.getByRole("button", { name: /Sign Out/ }));

    await waitFor(() => {
      expect(authState.signOut).toHaveBeenCalled();
      expect(screen.getByTestId("current-route")).toHaveTextContent("/");
    });
  });

  it("shows an accessible account status while authentication is resolving", () => {
    authState.isStudent = false;
    authState.isStudentOrg = false;
    authState.loading = true;
    renderNavbar();

    expect(screen.getByRole("status", { name: /checking account/i })).toBeInTheDocument();
    expect(screen.getByText("Checking account")).toBeInTheDocument();
  });

  it("keeps public Sign in as navigation only for a guest", async () => {
    authState.isStudent = false;
    authState.isStudentOrg = false;
    authState.isAdmin = false;
    authState.loading = false;
    authState.signOut.mockClear();
    render(<MemoryRouter initialEntries={["/"]}><RouteProbe /></MemoryRouter>);

    expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: /Login/ }));

    await waitFor(() => expect(screen.getByTestId("current-route")).toHaveTextContent("/admin"));
    expect(authState.signOut).not.toHaveBeenCalled();
  });

  it("shows an Admin dashboard link instead of guest Sign in for an active Admin", () => {
    authState.isStudent = false;
    authState.isStudentOrg = false;
    authState.isAdmin = true;
    authState.loading = false;
    renderNavbar();

    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/admin-dashboard");
    expect(screen.queryByRole("link", { name: /Login/ })).not.toBeInTheDocument();
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { Navbar } from "../Navbar";

const authState = vi.hoisted(() => ({
  isStudent: true,
  isStudentOrg: true,
  loading: false,
  username: "Test Student",
  role: "student_org" as const,
  profile: null,
  signOut: vi.fn(),
}));

vi.mock("../../../hooks/useStudentAuth", () => ({
  useStudentAuth: () => authState,
}));

vi.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
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
  it("shows Home, Map, and My Events to Student Org users", () => {
    authState.isStudent = true;
    authState.isStudentOrg = true;
    renderNavbar();

    expect(screen.getByRole("link", { name: /Home/ })).toHaveAttribute("href", "/home");
    expect(screen.getByRole("link", { name: /Map/ })).toHaveAttribute("href", "/map");
    expect(screen.getByRole("link", { name: /My Events/ })).toHaveAttribute("href", "/student/events");
    expect(screen.queryByRole("link", { name: /My Day/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Announcements/ })).not.toBeInTheDocument();
  });

  it("does not expose My Events to regular students", () => {
    authState.isStudent = true;
    authState.isStudentOrg = false;
    renderNavbar();

    expect(screen.getByRole("link", { name: /Home/ })).toHaveAttribute("href", "/home");
    expect(screen.getByRole("link", { name: /Map/ })).toHaveAttribute("href", "/map");
    expect(screen.queryByRole("link", { name: /My Events/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /My Day/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Announcements/ })).not.toBeInTheDocument();
  });

  it("keeps the account menu focused on account pages and omits Home", () => {
    authState.isStudent = true;
    authState.isStudentOrg = false;
    authState.loading = false;
    renderNavbar();
    fireEvent.click(screen.getByRole("button", { name: /Test Student.*user menu/i }));

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
});

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
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

describe("Navbar student navigation", () => {
  it("shows Home, Map, and My Events to Student Org users", () => {
    authState.isStudent = true;
    authState.isStudentOrg = true;
    renderNavbar();

    expect(screen.getByRole("link", { name: /Home/ })).toHaveAttribute("href", "/home");
    expect(screen.getByRole("link", { name: /Map/ })).toHaveAttribute("href", "/map");
    expect(screen.getByRole("link", { name: /My Events/ })).toHaveAttribute("href", "/student/events");
    expect(screen.queryByRole("link", { name: /My Day/ })).not.toBeInTheDocument();
  });

  it("does not expose My Events to regular students", () => {
    authState.isStudent = true;
    authState.isStudentOrg = false;
    renderNavbar();

    expect(screen.getByRole("link", { name: /Home/ })).toHaveAttribute("href", "/home");
    expect(screen.getByRole("link", { name: /Map/ })).toHaveAttribute("href", "/map");
    expect(screen.queryByRole("link", { name: /My Events/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /My Day/ })).not.toBeInTheDocument();
  });
});

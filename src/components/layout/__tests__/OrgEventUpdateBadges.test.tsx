import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { Navbar } from "../Navbar";
import { MobileBottomNav } from "../MobileBottomNav";
vi.mock("../../../hooks/useStudentAuth", () => ({ useStudentAuth: () => ({ isStudent: true, isStudentOrg: true, isAdmin: false, loading: false, username: "Org", profile: { id: "org" }, signOut: vi.fn() }) }));
vi.mock("../../../hooks/useStudentOrgEventUpdates", () => ({ useStudentOrgEventUpdates: () => ({ unreadCount: 2 }) }));
vi.mock("../../../hooks/useTheme", () => ({ useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }) }));
vi.mock("../../../hooks/useToast", () => ({ useToast: () => ({ info: vi.fn(), error: vi.fn() }) }));
vi.mock("../../../services/reportService", () => ({ reportService: { getStudentReports: vi.fn().mockResolvedValue([]) } }));
describe("Student Org event navigation badges", () => {
  it("exposes the same unread layout count in desktop and mobile navigation", () => {
    render(<MemoryRouter><Navbar /><MobileBottomNav /></MemoryRouter>);
    const desktop = screen.getByRole("link", { name: "My Events, 2 unread layout updates" });
    const mobile = screen.getByRole("link", { name: "Events, 2 unread layout updates" });
    expect(within(desktop).getByTestId("event-unread-count")).toHaveTextContent("2");
    expect(within(mobile).getByTestId("event-unread-count")).toHaveTextContent("2");
  });
});

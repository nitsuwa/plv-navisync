import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { MobileBottomNav } from "../MobileBottomNav";

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

vi.mock("../../ui/MoreSheet", () => ({
  MoreSheet: () => null,
}));

function renderNav(pathname = "/map") {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <MobileBottomNav />
    </MemoryRouter>,
  );
}

describe("MobileBottomNav", () => {
  it("gives Student Org users direct Home, Map, My Events, and Profile navigation", () => {
    authState.isStudent = true;
    authState.isStudentOrg = true;
    renderNav();

    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/home");
    expect(screen.getByRole("link", { name: "Map" })).toHaveAttribute("href", "/map");
    expect(screen.getByRole("link", { name: "My Events" })).toHaveAttribute("href", "/student/events");
    expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute("href", "/student");
    expect(screen.queryByRole("button", { name: /more/i })).not.toBeInTheDocument();
  });

  it("does not expose My Events to regular students", () => {
    authState.isStudent = true;
    authState.isStudentOrg = false;
    renderNav();

    expect(screen.getByRole("link", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Map" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Profile" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "My Events" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /more/i })).not.toBeInTheDocument();
  });

  it("hides for every focused map surface and restores during browsing", () => {
    authState.isStudent = true;
    authState.isStudentOrg = true;
    renderNav();

    expect(screen.getByRole("link", { name: "Map" })).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new CustomEvent("map-surface-toggle", { detail: { surface: "route-planner", open: true } }));
    });
    expect(screen.queryByRole("link", { name: "Map" })).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new CustomEvent("map-surface-toggle", { detail: { surface: "browse", open: false } }));
    });
    expect(screen.getByRole("link", { name: "Map" })).toBeInTheDocument();
  });
});

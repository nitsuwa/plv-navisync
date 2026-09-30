import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobileBottomNav } from "../MobileBottomNav";

const auth = vi.hoisted(() => ({ isStudent: false, isStudentOrg: false }));

vi.mock("../../../hooks/useStudentAuth", () => ({
  useStudentAuth: () => ({ ...auth, loading: false }),
}));

function renderNav(pathname = "/map") {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <MobileBottomNav />
    </MemoryRouter>,
  );
}

describe("MobileBottomNav", () => {
  beforeEach(() => {
    auth.isStudent = false;
    auth.isStudentOrg = false;
  });

  it("shows the configured Home and Map routes for public visitors", () => {
    renderNav("/map");
    const nav = screen.getByRole("navigation", { name: "Mobile navigation" });
    expect(within(nav).getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    expect(within(nav).getByRole("link", { name: "Map" })).toHaveAttribute("href", "/map");
    expect(within(nav).getByRole("link", { name: "Map" })).toHaveAttribute("aria-current", "page");
  });

  it("shows Home and Map for regular students", () => {
    auth.isStudent = true;
    renderNav("/home");
    const nav = screen.getByRole("navigation", { name: "Mobile navigation" });
    expect(within(nav).getByRole("link", { name: "Home" })).toHaveAttribute("href", "/home");
    expect(within(nav).getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Map" })).toHaveAttribute("href", "/map");
    expect(within(nav).queryByRole("link", { name: "Events" })).not.toBeInTheDocument();
  });

  it("adds Events for Student Organization users and keeps the active route visible", () => {
    auth.isStudent = true;
    auth.isStudentOrg = true;
    renderNav("/student/events");
    const nav = screen.getByRole("navigation", { name: "Mobile navigation" });
    expect(within(nav).getAllByRole("link")).toHaveLength(3);
    expect(within(nav).getByRole("link", { name: "Events" })).toHaveAttribute("href", "/student/events");
    expect(within(nav).getByRole("link", { name: "Events" })).toHaveAttribute("aria-current", "page");
    expect(nav.firstElementChild).toHaveClass("grid-cols-3");
  });

  it("stays visible while a building or route sheet is open", () => {
    renderNav();
    window.dispatchEvent(new CustomEvent("map-surface-toggle", { detail: { surface: "route-planner", open: true } }));
    expect(screen.getByRole("navigation", { name: "Mobile navigation" })).toBeInTheDocument();
  });
});

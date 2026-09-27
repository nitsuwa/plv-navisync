import { act, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { MobileBottomNav } from "../MobileBottomNav";

function renderNav(pathname = "/map") {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <MobileBottomNav />
    </MemoryRouter>,
  );
}

describe("MobileBottomNav", () => {
  it("provides only a Map shortcut on mobile, including from Home and Profile", () => {
    for (const pathname of ["/map", "/home", "/student"]) {
      const { unmount } = renderNav(pathname);
      const nav = screen.getByRole("navigation", { name: "Mobile navigation" });
      const links = within(nav).getAllByRole("link");

      expect(links).toHaveLength(1);
      expect(links[0]).toHaveAccessibleName("Map");
      expect(links[0]).toHaveAttribute("href", "/map");
      expect(within(nav).queryByRole("link", { name: "Home" })).not.toBeInTheDocument();
      expect(within(nav).queryByRole("link", { name: "Profile" })).not.toBeInTheDocument();
      unmount();
    }
  });

  it("marks Map as the active page only on the map route", () => {
    const { unmount } = renderNav("/home");
    expect(screen.getByRole("link", { name: "Map" })).not.toHaveAttribute("aria-current");
    unmount();

    renderNav("/map");
    expect(screen.getByRole("link", { name: "Map" })).toHaveAttribute("aria-current", "page");
  });

  it("hides while a focused map surface is open and restores during browsing", () => {
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

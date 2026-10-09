import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { AdminEventsWorkspacePage, LegacyAdminEventLayoutsRedirect } from "../AdminEventsWorkspacePage";

vi.mock("../AdminEventLayoutsPage", () => ({
  AdminEventLayoutsPage: ({ workspaceView }: { workspaceView: string }) => <div data-testid="layout-workspace" data-view={workspaceView}>Layout content</div>,
}));
vi.mock("../AdminEventsPage", () => ({ AdminEventsPage: () => <div data-testid="campus-listings">Campus listing content</div> }));

function CurrentLocation() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

describe("AdminEventsWorkspacePage", () => {
  it("keeps the legacy Events URL on campus listings and switches workspace views", () => {
    render(<MemoryRouter initialEntries={["/admin-dashboard/events"]}>
      <Routes><Route path="/admin-dashboard/events" element={<><AdminEventsWorkspacePage /><CurrentLocation /></>} /></Routes>
    </MemoryRouter>);

    expect(screen.getByTestId("campus-listings")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Campus listings" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: "Needs review" }));
    expect(screen.getByTestId("layout-workspace")).toHaveAttribute("data-view", "review");
    expect(screen.getByTestId("location")).toHaveTextContent("/admin-dashboard/events?view=review");
  });

  it("opens the requested review view from the new sidebar link", () => {
    render(<MemoryRouter initialEntries={["/admin-dashboard/events?view=review"]}>
      <Routes><Route path="/admin-dashboard/events" element={<AdminEventsWorkspacePage />} /></Routes>
    </MemoryRouter>);
    expect(screen.getByRole("tab", { name: "Needs review" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("layout-workspace")).toHaveAttribute("data-view", "review");
  });

  it("supports arrow-key navigation between the workspace tabs", () => {
    render(<MemoryRouter initialEntries={["/admin-dashboard/events?view=review"]}>
      <Routes><Route path="/admin-dashboard/events" element={<AdminEventsWorkspacePage />} /></Routes>
    </MemoryRouter>);
    fireEvent.keyDown(screen.getByRole("tab", { name: "Needs review" }), { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Approved & publication" })).toHaveAttribute("aria-selected", "true");
  });

  it("redirects old review links while preserving their query parameters", () => {
    render(<MemoryRouter initialEntries={["/admin-dashboard/event-layouts?review=event-1&source=bell"]}>
      <Routes>
        <Route path="/admin-dashboard/event-layouts" element={<LegacyAdminEventLayoutsRedirect />} />
        <Route path="/admin-dashboard/events" element={<CurrentLocation />} />
      </Routes>
    </MemoryRouter>);
    expect(screen.getByTestId("location")).toHaveTextContent("/admin-dashboard/events?review=event-1&source=bell&view=review");
  });
});

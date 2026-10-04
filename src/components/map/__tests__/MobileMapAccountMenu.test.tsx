import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import type { Building } from "../../../types";
import type { StudentAuthState } from "../../../hooks/useStudentAuth";
import { MobileMapAccountMenu } from "../MobileMapAccountMenu";
import { MobileBuildingSheet } from "../MobileBuildingSheet";

const building: Building = {
  id: "b1", name: "Science Hall", code: "SCI", description: "", category: "academic", floor_count: 3,
  created_at: "2026-01-01T00:00:00Z",
};

vi.mock("../../../hooks/useStudentAuth", () => ({
  useStudentAuth: () => ({
    isStudent: true,
    loading: false,
    username: "Demo Student",
    role: "student",
    signOut: vi.fn(),
  }),
}));

describe("MobileMapAccountMenu", () => {
  it("reserves a compact 48px profile target beside the full-width responsive search", () => {
    render(
      <MemoryRouter>
        <MobileMapAccountMenu />
      </MemoryRouter>,
    );

    const menuButton = screen.getByRole("button", { name: /user menu/i });
    expect(menuButton).toHaveClass("h-12", "w-12", "min-w-12", "shrink-0");
    expect(within(menuButton).getByText("DE").parentElement).toHaveClass("h-8", "w-8");
  });

  it("portals the anchored menu to the transient foreground and restores focus on Escape", () => {
    const onOpenChange = vi.fn();
    render(
      <MemoryRouter>
        <MobileMapAccountMenu onOpenChange={onOpenChange} />
      </MemoryRouter>,
    );
    const trigger = screen.getByRole("button", { name: /user menu/i });
    onOpenChange.mockClear();

    fireEvent.click(trigger);
    const menu = screen.getByRole("menu", { name: "Student account menu" });
    expect(menu).toHaveClass("map-layer-transient");
    expect(menu.parentElement).toBe(document.body);
    expect(onOpenChange).toHaveBeenLastCalledWith(true);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "Student account menu" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);

    fireEvent.click(trigger);
    expect(screen.getByRole("menu", { name: "Student account menu" })).toBeInTheDocument();
    fireEvent.pointerDown(document.body, { pointerType: "touch" });
    expect(screen.queryByRole("menu", { name: "Student account menu" })).not.toBeInTheDocument();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("shows only working profile destinations and omits redundant Home", () => {
    render(<MemoryRouter><MobileMapAccountMenu /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /user menu/i }));

    const menu = screen.getByRole("menu", { name: "Student account menu" });
    expect(within(menu).queryByRole("menuitem", { name: "Home" })).not.toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "My Profile" })).toHaveAttribute("href", "/student");
    expect(within(menu).getByRole("menuitem", { name: "Favorites" })).toHaveAttribute("href", "/student/favorites");
    expect(within(menu).getByRole("menuitem", { name: "My Reports" })).toHaveAttribute("href", "/student/reports");
    expect(within(menu).getByRole("menuitem", { name: "Settings" })).toHaveAttribute("href", "/student/settings");
    expect(within(menu).getByRole("menuitem", { name: "Sign Out" })).toBeInTheDocument();
  });

  it("swallows the click paired with an outside pointer so the map beneath is not activated", () => {
    const onMapClick = vi.fn();
    render(
      <MemoryRouter>
        <button type="button" onClick={onMapClick}>Map building</button>
        <MobileMapAccountMenu />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /user menu/i }));
    const mapTarget = screen.getByRole("button", { name: "Map building" });
    fireEvent.pointerDown(mapTarget, { pointerType: "touch" });
    fireEvent.click(mapTarget);

    expect(onMapClick).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu", { name: "Student account menu" })).not.toBeInTheDocument();
  });

  it("swallows click-only outside input so the map beneath is not activated", () => {
    const onMapClick = vi.fn();
    render(
      <MemoryRouter>
        <button type="button" onClick={onMapClick}>Map building</button>
        <MobileMapAccountMenu />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /user menu/i }));
    fireEvent.click(screen.getByRole("button", { name: "Map building" }));

    expect(onMapClick).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu", { name: "Student account menu" })).not.toBeInTheDocument();
  });

  it("keeps the building sheet and its snap state underneath the active profile menu", () => {
    function OverlayHarness() {
      const [profileOpen, setProfileOpen] = useState(false);
      return (
        <>
          <MobileMapAccountMenu onOpenChange={setProfileOpen} />
          <MobileBuildingSheet
            selected={building} onClose={vi.fn()} onDirections={vi.fn()} onEnterBuilding={vi.fn()}
            onSave={vi.fn()} onReport={vi.fn()} onSignInPrompt={vi.fn()} saved={new Set()}
            studentAuth={{ isStudent: true } as StudentAuthState} hasFloorPlans={false} floorPlanCount={0}
            facilities={[]} accessibility={[]} showQR={false} onToggleQR={vi.fn()} interactionPaused={profileOpen}
          />
        </>
      );
    }

    render(<MemoryRouter><OverlayHarness /></MemoryRouter>);
    const sheet = screen.getByTestId("mobile-building-sheet");
    fireEvent.click(screen.getByRole("button", { name: /user menu/i }));
    const menu = screen.getByRole("menu", { name: "Student account menu" });
    expect(menu.parentElement).toBe(document.body);
    expect(menu).toHaveAttribute("data-map-layer", "transient");
    expect(sheet).toHaveClass("map-layer-building-sheet");
    expect(sheet).toHaveAttribute("data-interaction-paused", "true");
    expect(sheet).toHaveAttribute("data-sheet-state", "default");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "Student account menu" })).not.toBeInTheDocument();
    expect(sheet).toHaveAttribute("data-interaction-paused", "false");
    expect(sheet).toHaveAttribute("data-sheet-state", "default");

    fireEvent.click(screen.getByRole("button", { name: /user menu/i }));
    fireEvent.pointerDown(sheet, { pointerType: "touch" });
    expect(screen.queryByRole("menu", { name: "Student account menu" })).not.toBeInTheDocument();
    expect(sheet).toHaveAttribute("data-interaction-paused", "false");
    expect(sheet).toHaveAttribute("data-sheet-state", "default");
  });
});

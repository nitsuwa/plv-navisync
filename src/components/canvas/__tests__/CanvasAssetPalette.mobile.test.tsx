import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CanvasAssetPalette } from "../CanvasAssetPalette";

describe("CanvasAssetPalette mobile affordances", () => {
  it("keeps the collapsed tray reachable at a narrow viewport", () => {
    vi.stubGlobal("innerWidth", 375);
    render(<CanvasAssetPalette surface="event" activeKey="chair" onSelect={vi.fn()} compact />);
    const toggle = screen.getByRole("button", { name: /choose asset/i });
    expect(toggle.className).toContain("min-h-11");
    fireEvent.click(toggle);
    expect(screen.getByRole("searchbox", { name: "Search assets" }).className).toContain("h-9");
    vi.unstubAllGlobals();
  });

  it("marks the open floating catalog as a mobile bottom sheet with a close action", () => {
    vi.stubGlobal("innerWidth", 375);
    render(<CanvasAssetPalette surface="event" activeKey="chair" onSelect={vi.fn()} floating />);

    fireEvent.click(screen.getByRole("button", { name: /browse assets/i }));

    const panel = screen.getByRole("dialog", { name: "Choose an event item" });
    expect(panel).toHaveAttribute("data-mobile-sheet", "true");
    expect(screen.getByRole("button", { name: "Close asset picker" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close asset picker" }));
    expect(screen.queryByRole("dialog", { name: "Choose an event item" })).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("closes the floating catalog with Escape without changing the active asset", () => {
    vi.stubGlobal("innerWidth", 375);
    const onSelect = vi.fn();
    render(<CanvasAssetPalette surface="event" activeKey="chair" onSelect={onSelect} floating />);

    fireEvent.click(screen.getByRole("button", { name: /browse assets/i }));
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Choose an event item" }), { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "Choose an event item" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Chair.*selected/i })).toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("focuses search while open and restores focus to the trigger when Escape closes the sheet", async () => {
    vi.stubGlobal("innerWidth", 375);
    render(<CanvasAssetPalette surface="event" activeKey="chair" onSelect={vi.fn()} floating />);

    const trigger = screen.getByRole("button", { name: /browse assets/i });
    fireEvent.click(trigger);
    const search = await screen.findByRole("searchbox", { name: "Search assets" });
    expect(search).toHaveFocus();

    fireEvent.keyDown(screen.getByRole("dialog", { name: "Choose an event item" }), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Choose an event item" })).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    vi.unstubAllGlobals();
  });
});

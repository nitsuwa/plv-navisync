import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CanvasAssetPalette } from "../CanvasAssetPalette";

describe("CanvasAssetPalette", () => {
  it("shows visual event choices with accessible descriptions", () => {
    render(<CanvasAssetPalette surface="event" activeKey="chair" onSelect={vi.fn()} />);
    expect(screen.getByRole("region", { name: "Event assets" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Chair: Single chair/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: /Stage:/i })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Whiteboard/i })).not.toBeInTheDocument();
  });

  it("filters assets by name and reports the selected asset", () => {
    const onSelect = vi.fn();
    render(<CanvasAssetPalette surface="event" activeKey={null} onSelect={onSelect} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search assets" }), { target: { value: "podium" } });
    expect(screen.getByRole("option", { name: /Podium:/i })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /^Chair:/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: /Podium:/i }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ key: "podium" }));
  });

  it("can collapse into a compact mobile tray", () => {
    render(<CanvasAssetPalette surface="event" activeKey={null} onSelect={vi.fn()} compact />);
    const toggle = screen.getByRole("button", { name: /choose asset/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("searchbox", { name: "Search assets" })).toBeInTheDocument();
  });

  it("keeps the asset panel attached to a floating dock instead of a flow row", () => {
    render(
      <CanvasAssetPalette
        surface="event"
        activeKey="chair"
        onSelect={vi.fn()}
        floating
      />,
    );

    const dock = screen.getByTestId("canvas-asset-floating-palette");
    expect(dock).toHaveAttribute("data-floating", "true");
    expect(screen.getByRole("button", { name: /add event item/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /more assets/i })).toBeInTheDocument();
  });

  it("offers the active asset and recent choices without opening the full catalog", () => {
    const onSelect = vi.fn();
    render(<CanvasAssetPalette surface="event" activeKey="chair" onSelect={onSelect} floating />);

    expect(screen.getByText("Recently used")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Chair.*selected/i })).toBeInTheDocument();
    expect(screen.queryByRole("searchbox", { name: "Search assets" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Table/i }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ key: "table" }));
  });
});

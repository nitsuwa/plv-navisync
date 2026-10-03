import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EventPlacementDock } from "../EventPlacementDock";

function renderDock(overrides: Partial<React.ComponentProps<typeof EventPlacementDock>> = {}) {
  const props = {
    activeAssetKey: "chair",
    disabled: false,
    repeatPlacement: true,
    placementActive: true,
    touchPlacementReady: false,
    canPlace: true,
    layoutsOpen: false,
    onSelectAsset: vi.fn(),
    onRepeatPlacementChange: vi.fn(),
    onOpenLayouts: vi.fn(),
    onCloseLayouts: vi.fn(),
    onCancelPlacement: vi.fn(),
    onPlaceHere: vi.fn(),
    ...overrides,
  };
  return { ...render(<EventPlacementDock {...props} />), props };
}

describe("EventPlacementDock", () => {
  it("shows stable quick-asset intent and forwards a quick selection", () => {
    const { props } = renderDock();
    const quickAssets = screen.getByRole("group", { name: "Quick assets" });
    expect(withinText(quickAssets)).toEqual(["Chair", "Table", "Booth", "Stage"]);
    fireEvent.click(screen.getByRole("button", { name: "Table" }));
    expect(props.onSelectAsset).toHaveBeenCalledWith(expect.objectContaining({ key: "table" }));
    expect(screen.getByText("Place multiple")).toBeInTheDocument();
  });

  it("opens Layouts without using selection Arrange terminology", () => {
    const { props } = renderDock();
    fireEvent.click(screen.getByRole("button", { name: "Open layouts" }));
    expect(props.onOpenLayouts).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /^Arrange$/ })).not.toBeInTheDocument();
  });

  it("changes repeat placement and exposes a separate cancel action", () => {
    const { props } = renderDock();
    fireEvent.click(screen.getByRole("switch", { name: "Place multiple" }));
    expect(props.onRepeatPlacementChange).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByRole("button", { name: "Cancel placement" }));
    expect(props.onCancelPlacement).toHaveBeenCalledTimes(1);
  });

  it("keeps dock pointer and click events from bubbling onto the canvas", () => {
    const onCanvasClick = vi.fn();
    render(
      <div onClick={onCanvasClick}>
        <EventPlacementDock
          activeAssetKey="chair"
          disabled={false}
          repeatPlacement
          placementActive={false}
          touchPlacementReady={false}
          canPlace
          layoutsOpen={false}
          onSelectAsset={vi.fn()}
          onRepeatPlacementChange={vi.fn()}
          onOpenLayouts={vi.fn()}
          onCloseLayouts={vi.fn()}
          onCancelPlacement={vi.fn()}
          onPlaceHere={vi.fn()}
        />
      </div>,
    );
    fireEvent.pointerDown(screen.getByRole("button", { name: "Open layouts" }));
    fireEvent.click(screen.getByRole("button", { name: "Open layouts" }));
    expect(onCanvasClick).not.toHaveBeenCalled();
  });
});

function withinText(element: HTMLElement) {
  return Array.from(element.querySelectorAll("button")).map((button) => button.textContent?.trim().replace(/\s+/g, " "));
}

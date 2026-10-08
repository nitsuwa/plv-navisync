import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EventPreviewLayer } from "../EventPreviewLayer";
import type { CampusEventOverlay } from "../../map-builder/types";
import { EventAssetVisual } from "../../events/eventAssets";
describe("student event preview assets", () => {
  it("uses the same catalog color/artwork as admin preview without an editing box and aligns text at its top-left position", () => {
    const event = { id: "stage-event", title: "Stage event", eventFurniture: [{ id: "stage", type: "stage", name: "Stage", x: 20, y: 30, width: 120, height: 80, rotation: 0, color: "#8b5cf6" }], eventLabels: [{ id: "label", x: 145, y: 40, text: "STAGE", fontSize: 14, color: "#1f2937" }] } as unknown as CampusEventOverlay;
    const { container } = render(<><EventAssetVisual type="stage" label="Admin stage" /><svg><EventPreviewLayer events={[event]} onSelect={vi.fn()} /></svg></>);
    expect(screen.getByRole("img", { name: "Stage" }).style.color).toBe(screen.getByRole("img", { name: "Admin stage" }).style.color);
    const stageGroup = screen.getByRole("img", { name: "Stage" }).parentElement!;
    expect(stageGroup.querySelector(":scope > rect")).toBeNull();
    const label = container.querySelector('text')!;
    expect(label).toHaveAttribute("dominant-baseline", "text-before-edge");
    expect(label).toHaveAttribute("font-weight", "700");
    expect(label).toHaveAttribute("x", "145");
    expect(label).toHaveAttribute("y", "40");
  });
  it("uses recognizable asset art, hides hidden items, and opens details without changing the layout", () => {
    const event = { id: "event-a", title: "Org Week", eventFurniture: [
      { id: "chair", type: "chair", name: "Audience chair", x: 10, y: 20, width: 16, height: 16, rotation: 45 },
      { id: "hidden", type: "table", name: "Hidden table", x: 30, y: 40, width: 50, height: 30, visible: false },
    ], eventLabels: [] } as unknown as CampusEventOverlay;
    const original = JSON.stringify(event);
    const select = vi.fn();
    render(<svg><EventPreviewLayer events={[event]} onSelect={select} /></svg>);
    fireEvent.click(screen.getByRole("img", { name: "Audience chair" }));
    expect(screen.queryByRole("img", { name: "Hidden table" })).not.toBeInTheDocument();
    expect(select).toHaveBeenCalledWith(event);
    expect(JSON.stringify(event)).toBe(original);
  });
});

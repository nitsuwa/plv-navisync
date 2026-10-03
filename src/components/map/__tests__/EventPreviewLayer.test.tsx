import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EventPreviewLayer } from "../EventPreviewLayer";
import type { CampusEventOverlay } from "../../map-builder/types";
describe("student event preview assets", () => {
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

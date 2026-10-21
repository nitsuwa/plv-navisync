import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ToolbarTooltip } from "../ToolbarTooltip";

describe("ToolbarTooltip overlay ownership", () => {
  it("keeps the Save hint above the properties sidebar and within the viewport", async () => {
    render(
      <>
        <aside data-testid="properties-sidebar" style={{ position: "fixed", zIndex: 50 }}>Room Properties</aside>
        <ToolbarTooltip tool="save" label="Save" hint="Save your current draft changes.">
          <button type="button">Save</button>
        </ToolbarTooltip>
      </>,
    );

    const trigger = screen.getByRole("button", { name: "Save" }).parentElement as HTMLDivElement;
    trigger.getBoundingClientRect = () => ({
      x: 940, y: 700, left: 940, top: 700, right: 980, bottom: 728,
      width: 40, height: 28, toJSON: () => ({}),
    });
    fireEvent.mouseEnter(screen.getByRole("button", { name: "Save" }));

    const tooltip = await screen.findByRole("tooltip");
    const floatingLayer = tooltip.parentElement as HTMLDivElement;
    const sidebarLayer = Number(getComputedStyle(screen.getByTestId("properties-sidebar")).zIndex);

    expect(floatingLayer.parentElement).toBe(document.body);
    expect(floatingLayer.style.position).toBe("fixed");
    expect(Number(floatingLayer.style.zIndex)).toBeGreaterThan(sidebarLayer);
    expect(tooltip.className).toContain("max-h-[calc(100dvh-24px)]");
    expect(floatingLayer.style.transform).toBe("translate(-50%, -100%)");
    expect(Number.parseFloat(floatingLayer.style.top)).toBeLessThan(window.innerHeight);
  });

  it("hides an open hint when a modal appears", async () => {
    render(
      <ToolbarTooltip tool="save" label="Save" hint="Save your current draft changes.">
        <button type="button">Save</button>
      </ToolbarTooltip>,
    );
    fireEvent.mouseEnter(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("tooltip");

    const modal = document.createElement("div");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    document.body.append(modal);
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
    modal.remove();
  });
});

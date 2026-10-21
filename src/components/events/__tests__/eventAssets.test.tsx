import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EVENT_FURNITURE_TEMPLATES, EventAssetVisual, eventFurnitureFromTemplate } from "../eventAssets";

describe("event asset palette", () => {
  it("uses compact equipment footprints and a standard canopy for new placements", () => {
    const sizes = Object.fromEntries(EVENT_FURNITURE_TEMPLATES.map(item => [item.type, [item.width, item.height]]));
    expect(sizes.speaker).toEqual([16, 18]);
    expect(sizes.projector).toEqual([14, 12]);
    expect(sizes.monitor).toEqual([28, 12]);
    expect(sizes.microphone).toEqual([14, 14]);
    expect(sizes.tent).toEqual([120, 120]);
  });
  it("includes the requested event assets", () => {
    const names = EVENT_FURNITURE_TEMPLATES.map((asset) => asset.name);
    expect(names).toEqual(expect.arrayContaining(["Booth", "Chair", "Stage", "Speaker", "Projector", "Monitor"]));
  });

  it("renders an identifiable native visual for each requested asset", () => {
    for (const asset of EVENT_FURNITURE_TEMPLATES.filter((item) => ["booth", "chair", "stage", "speaker", "projector", "monitor"].includes(item.type))) {
      const { unmount } = render(<EventAssetVisual type={asset.type} label={asset.name} />);
      expect(screen.getByLabelText(asset.name)).toBeInTheDocument();
      unmount();
    }
  });

  it("persists a stable asset key while keeping the legacy type", () => {
    const template = EVENT_FURNITURE_TEMPLATES.find((asset) => asset.type === "chair");
    expect(template).toBeDefined();
    const furniture = eventFurnitureFromTemplate(template!, 20, 30, "chair-1");
    expect(furniture.type).toBe("chair");
    expect(furniture.assetKey).toBe("chair");
  });
});

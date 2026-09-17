import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CanvasAssetVisual } from "../CanvasAssetVisual";

describe("CanvasAssetVisual", () => {
  it("renders a named, scalable chair illustration", () => {
    render(<CanvasAssetVisual assetKey="chair" label="Chair" />);

    const asset = screen.getByRole("img", { name: "Chair" });
    expect(asset.tagName.toLowerCase()).toBe("svg");
    expect(asset).toHaveAttribute("viewBox");
    expect(asset.querySelectorAll("path, rect, circle, line, polygon").length).toBeGreaterThan(0);
  });

  it("renders an accessible fallback for an unknown asset", () => {
    render(<CanvasAssetVisual assetKey="missing" label="Custom event item" />);

    expect(screen.getByRole("img", { name: "Custom event item" })).toBeInTheDocument();
  });
});

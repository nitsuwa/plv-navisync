import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { DECOR_ASSET_TYPES } from "../constants";
import { DecorAssetArt, DecorAssetVisual } from "../DecorAssetVisual";

afterEach(cleanup);

describe("DecorAssetVisual", () => {
  it("renders an svg with the artwork for every supported asset type", () => {
    for (const t of DECOR_ASSET_TYPES) {
      const { container } = render(<DecorAssetVisual type={t.type} />);
      const svg = container.querySelector("svg");
      expect(svg, `${t.type} should render an <svg>`).not.toBeNull();
      expect(svg!.getAttribute("viewBox"), `${t.type} viewBox`).toBe(`0 0 ${t.defaultWidth} ${t.defaultHeight}`);
      const paths = container.querySelectorAll("path");
      expect(paths.length, `${t.type} should render all parts`).toBe(t.parts!.length);
    }
  });

  it("returns null for an unknown type", () => {
    const { container } = render(<DecorAssetVisual type="does-not-exist" />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("applies className and style to the wrapper svg", () => {
    const { container } = render(
      <DecorAssetVisual type="tree" className="w-5 h-6" style={{ opacity: 0.85 }} />
    );
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("class")).toContain("w-5");
    expect(svg.getAttribute("style")).toContain("opacity: 0.85");
  });
});

describe("DecorAssetArt", () => {
  it("renders exactly the descriptor's part count", () => {
    const t = DECOR_ASSET_TYPES[0];
    // Wrap in <svg> so jsdom treats the <path> elements as SVG (matches canvas usage).
    const { container } = render(<svg><DecorAssetArt descriptor={t} /></svg>);
    expect(container.querySelectorAll("path").length).toBe(t.parts!.length);
  });

  it("falls back to a single path for a legacy descriptor without parts", () => {
    const { container } = render(
      <svg><DecorAssetArt descriptor={{ type: "tree", label: "T", category: "C", color: "#fff", svgPath: "M0 0 Z", defaultWidth: 10, defaultHeight: 10 }} /></svg>
    );
    const paths = container.querySelectorAll("path");
    expect(paths.length).toBe(1);
    expect(paths[0].getAttribute("d")).toBe("M0 0 Z");
    expect(paths[0].getAttribute("fill")).toBe("#fff");
  });
});

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FloorFurnitureSymbol } from "../FloorEditor";

describe("Floor Editor furniture symbols", () => {
  it.each([
    ["toilet", "ellipse"],
    ["urinal", "ellipse"],
    ["sink", "ellipse"],
    ["double-sink", "ellipse"],
    ["faucet", "circle"],
    ["toilet-stall", "rect"],
    ["pwd-toilet-stall", "rect"],
    ["stall-partition", "rect"],
    ["mirror", "rect"],
    ["soap-dispenser", "rect"],
    ["tissue-dispenser", "rect"],
    ["hand-dryer", "rect"],
    ["restroom-trash-bin", "path"],
    ["floor-drain", "line"],
  ])("renders the %s architectural symbol", (type, element) => {
    const { container } = render(
      <svg viewBox="0 0 40 40">
        <FloorFurnitureSymbol type={type} x={2} y={2} width={36} height={36} color="#cbd5e1" />
      </svg>,
    );
    expect(container.querySelector(element)).not.toBeNull();
  });

  it("renders a complete stall with a door cue and nested toilet", () => {
    const { container } = render(
      <svg viewBox="0 0 40 40">
        <FloorFurnitureSymbol type="toilet-stall" x={2} y={2} width={36} height={36} color="#e2e8f0" />
      </svg>,
    );
    expect(container.querySelectorAll("rect").length).toBeGreaterThanOrEqual(2);
    expect(container.querySelectorAll("line").length).toBeGreaterThanOrEqual(4);
    expect(container.querySelector("path")).not.toBeNull();
    expect(container.querySelector("ellipse")).not.toBeNull();
  });
});

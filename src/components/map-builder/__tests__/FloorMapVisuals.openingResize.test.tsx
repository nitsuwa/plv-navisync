import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { WallOpeningSymbol, updateWallOpeningSymbolDomGeometry } from "../FloorMapVisuals";

describe("wall opening resize preview geometry", () => {
  it("redraws a Door leaf and circular swing from the new opening width", () => {
    const { getByTestId } = render(
      <svg>
        <g data-testid="door-symbol">
          <WallOpeningSymbol kind="door" width={32} wallThickness={6} color="#92400e" background="#eee" direction="left" hinge="left" swingSide="a" selected />
        </g>
      </svg>,
    );
    const group = getByTestId("door-symbol") as unknown as SVGGElement;
    updateWallOpeningSymbolDomGeometry(group, {
      kind: "door", width: 50, wallThickness: 6, direction: "left", hinge: "left", swingSide: "a",
    });

    expect(group.querySelector('[data-opening-part="wall-cut"]')).toHaveAttribute("x1", "-25");
    expect(group.querySelector('[data-opening-part="door-hinge"]')).toHaveAttribute("cx", "-25");
    expect(group.querySelector('[data-opening-part="door-leaf"]')).toHaveAttribute("y2", "-50");
    expect(group.querySelector('[data-opening-part="door-swing-arc"]')?.getAttribute("d")).toContain("A 50 50");
    expect(group.querySelector('[data-opening-part="selection-outline"]')).toHaveAttribute("width", "56");
    expect(group.getAttribute("transform")).toBeNull();
  });

  it("redraws a Window along its local wall axis without changing its thickness", () => {
    const { getByTestId } = render(
      <svg>
        <g data-testid="window-symbol">
          <WallOpeningSymbol kind="window" width={20} wallThickness={6} color="#0284c7" background="#eee" selected />
        </g>
      </svg>,
    );
    const group = getByTestId("window-symbol") as unknown as SVGGElement;
    updateWallOpeningSymbolDomGeometry(group, { kind: "window", width: 44, wallThickness: 6 });

    expect(group.querySelector('[data-opening-part="wall-cut"]')).toHaveAttribute("x1", "-22");
    expect(group.querySelector('[data-opening-part="window-glass"]')).toHaveAttribute("width", "44");
    expect(group.querySelector('[data-opening-part="window-glazing-upper"]')).toHaveAttribute("y1", "-5");
    expect(group.querySelector('[data-opening-part="window-glazing-upper"]')).toHaveAttribute("x2", "22");
    expect(group.querySelector('[data-opening-part="selection-outline"]')).toHaveAttribute("height", "16");
    expect(group.getAttribute("transform")).toBeNull();
  });
});

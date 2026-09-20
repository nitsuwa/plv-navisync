import { createElement } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OutdoorBuildingVisual, fitOutdoorBuildingLabel, fitOutdoorBuildingLabelLines } from "../ReadonlyOutdoorVisuals";

describe("fitOutdoorBuildingLabel", () => {
  it("keeps a legitimate Building name when the actual label width can hold it", () => {
    expect(fitOutdoorBuildingLabel("STUDENT CENTER BUILDING", 110, 5.5)).toEqual({
      text: "STUDENT CENTER BUILDING",
      truncated: false,
    });
  });

  it("uses the available Building width rather than a fixed character count", () => {
    const fitted = fitOutdoorBuildingLabel("STUDENT CENTER BUILDING", 48, 5.5);
    expect(fitted.truncated).toBe(true);
    expect(fitted.text).toMatch(/\u2026$/);
    expect(fitted.text.length).toBeLessThan("STUDENT CENTER BUILDING".length);
  });

  it("leaves short names unchanged", () => {
    expect(fitOutdoorBuildingLabel("SC", 24, 5.5)).toEqual({ text: "SC", truncated: false });
  });

  it("wraps a long Building name into readable lines before truncating", () => {
    const fitted = fitOutdoorBuildingLabelLines("COLLEGE OF ACCOUNTANCY AND BUSINESS ADMINISTRATION", 82, 7, 2);
    expect(fitted.lines).toHaveLength(2);
    expect(fitted.lines[0]).not.toBe("");
    expect(fitted.lines[1]).toMatch(/\u2026$/);
    expect(fitted.truncated).toBe(true);
  });

  it("keeps the label in the Building transform instead of counter-rotating it", () => {
    const { container } = render(createElement(
      "svg",
      null,
      createElement(OutdoorBuildingVisual, {
        building: {
          id: "building-rotation-test",
          name: "COLLEGE OF ACCOUNTANCY AND BUSINESS ADMINISTRATION",
          code: "CABA",
          category: "Academic",
          description: "",
          x: 100,
          y: 200,
          width: 120,
          height: 80,
          color: "#f97316",
          floors: [],
          rotation: 90,
        },
        labelLayout: "editor",
        showFloorCount: false,
      }),
    ));

    const building = container.querySelector('[data-testid="readonly-building"]');
    const label = container.querySelector('[data-testid="building-label-group"]');
    expect(building?.getAttribute("transform")).toBe("rotate(90, 160, 240)");
    expect(label?.getAttribute("transform")).toBeNull();
    expect(label?.getAttribute("clip-path")).toBe("url(#building-label-clip-building-rotation-test)");
  });
});

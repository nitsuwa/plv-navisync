import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { createElement } from "react";
import { FURNITURE_CATEGORIES, getFurniturePaletteCategories } from "../constants";
import { FloorFurnitureSymbol, furnitureTooltipContent } from "../FloorEditor";

describe("Floor Editor furniture library", () => {
  it("exposes the complete restroom fixture set as ordinary reusable assets", () => {
    const restroom = FURNITURE_CATEGORIES.find((category) => category.id === "restroom");
    expect(restroom).toBeDefined();
    const types = new Set(restroom?.items.map((item) => item.type));
    expect([...[
      "toilet", "urinal", "sink", "double-sink", "faucet", "toilet-stall",
      "pwd-toilet-stall", "stall-partition", "mirror", "soap-dispenser",
      "tissue-dispenser", "hand-dryer", "restroom-trash-bin", "floor-drain",
    ]].every((type) => types.has(type))).toBe(true);
  });

  it("keeps stable dimensions for template-ready restroom records", () => {
    const restroom = FURNITURE_CATEGORIES.find((category) => category.id === "restroom")!;
    const normal = restroom.items.find((item) => item.type === "toilet-stall")!;
    const pwd = restroom.items.find((item) => item.type === "pwd-toilet-stall")!;
    expect(normal.width).toBeGreaterThan(0);
    expect(normal.height).toBeGreaterThan(0);
    expect(pwd.width).toBeGreaterThan(normal.width);
    expect(pwd.height).toBeGreaterThan(normal.height);
    expect(new Set(restroom.items.map((item) => item.type)).size).toBe(restroom.items.length);
  });

  it("curates the default palette around PLV classroom, lab, library, and facilities work", () => {
    const primary = new Set(getFurniturePaletteCategories().flatMap((category) => category.items.map((item) => item.type)));
    expect([...primary]).toEqual(expect.arrayContaining([
      "chair", "bench", "waiting-bench", "sofa", "lecture-row-4", "lecture-row-6", "lecture-row-8",
      "student-desk-chair", "study-table-4", "study-table-6", "conference-table", "lab-workbench",
      "faculty-desk-chair", "library-study-table", "drafting-table-stool",
      "cabinet", "library-bookshelf", "double-sided-library-shelf", "equipment-cabinet", "locker",
      "computer-workstation-chair", "computer-lab-table-4", "computer-lab-table-6", "projector", "wall-display", "printer-copier",
      "table-tennis", "vending-machine", "drinking-fountain", "reception-counter",
    ]));
    expect(primary.has("bookshelf")).toBe(false);
    expect(primary.has("server-rack")).toBe(false);
    expect(primary.has("faucet")).toBe(false);
    expect(primary.has("soap-dispenser")).toBe(false);
  });

  it("keeps advanced fixtures globally searchable without promoting them", () => {
    expect(getFurniturePaletteCategories("soap").flatMap((category) => category.items.map((item) => item.type))).toContain("soap-dispenser");
    expect(getFurniturePaletteCategories("server").flatMap((category) => category.items.map((item) => item.type))).toContain("server-rack");
    expect(getFurniturePaletteCategories("faucet").flatMap((category) => category.items.map((item) => item.type))).toContain("faucet");
    expect(getFurniturePaletteCategories("shelf").flatMap((category) => category.items.map((item) => item.type))).toEqual(expect.arrayContaining(["bookshelf", "library-bookshelf"]));
  });

  it("keeps composite defaults in sensible scale order", () => {
    const items = FURNITURE_CATEGORIES.flatMap((category) => category.items);
    const find = (type: string) => items.find((item) => item.type === type)!;
    expect(find("computer-lab-table-6").width).toBeGreaterThan(find("computer-lab-table-4").width);
    expect(find("table-tennis").width).toBeGreaterThan(find("conference-table").width);
    expect(find("drafting-table-stool").width).toBeGreaterThan(find("chair").width);
    expect(find("pwd-toilet-stall").width).toBeGreaterThan(find("toilet-stall").width);
  });

  it("renders each new PLV composite as a compact architectural symbol", () => {
    const renderSymbol = (type: string) => render(createElement("svg", null, createElement(FloorFurnitureSymbol, { type, x: 0, y: 0, width: 100, height: 50, color: "#64748b" }))).container;
    expect(renderSymbol("drafting-table-stool").querySelectorAll("rect").length).toBeGreaterThanOrEqual(2);
    expect(renderSymbol("computer-lab-table-4").querySelectorAll("rect").length).toBeGreaterThanOrEqual(9);
    expect(renderSymbol("computer-lab-table-6").querySelectorAll("rect").length).toBeGreaterThanOrEqual(13);
    expect(renderSymbol("table-tennis").querySelectorAll("line").length).toBeGreaterThanOrEqual(2);
    expect(renderSymbol("vending-machine").querySelectorAll("rect").length).toBeGreaterThanOrEqual(2);
    expect(renderSymbol("drinking-fountain").querySelector("ellipse")).toBeTruthy();
    expect(renderSymbol("reception-counter").querySelectorAll("rect").length).toBeGreaterThanOrEqual(2);
  });

  it("keeps furniture hints concise and independent of the library category", () => {
    const facilities = FURNITURE_CATEGORIES.find((category) => category.id === "facilities")!;
    const reception = facilities.items.find((item) => item.type === "reception-counter")!;
    const hint = furnitureTooltipContent(reception);
    expect(hint).toBe("Reception / Service Counter - Service counter with workstation cue");
    expect(hint).not.toContain("Facilities / Amenities");
    expect(furnitureTooltipContent({ name: "Chair" })).toBe("Chair");
  });
});

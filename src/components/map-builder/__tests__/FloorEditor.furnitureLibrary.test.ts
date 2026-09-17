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
    expect(renderSymbol("student-desk-chair").querySelector("[data-testid='student-desk-surface']")).not.toBeNull();
    expect(renderSymbol("faculty-desk-chair").querySelector("[data-testid='faculty-desk-surface']")).not.toBeNull();
    expect(renderSymbol("lecture-row-6").querySelector("[data-testid='furniture-row-writing-rail']")).not.toBeNull();
    expect(renderSymbol("drafting-table-stool").querySelectorAll("rect").length).toBeGreaterThanOrEqual(2);
    expect(renderSymbol("computer-lab-table-4").querySelectorAll("rect").length).toBeGreaterThanOrEqual(9);
    expect(renderSymbol("computer-lab-table-6").querySelectorAll("rect").length).toBeGreaterThanOrEqual(13);
    expect(renderSymbol("lab-workbench").querySelectorAll("rect").length).toBeGreaterThanOrEqual(4);
    expect(renderSymbol("table-tennis").querySelectorAll("line").length).toBeGreaterThanOrEqual(2);
    expect(renderSymbol("vending-machine").querySelectorAll("rect").length).toBeGreaterThanOrEqual(2);
    expect(renderSymbol("drinking-fountain").querySelector("ellipse")).toBeTruthy();
    expect(renderSymbol("reception-counter").querySelectorAll("rect").length).toBeGreaterThanOrEqual(2);
    expect(renderSymbol("toilet").querySelector("[data-testid='toilet-bowl']")).not.toBeNull();
  });

  it("renders every catalogue type through the shared FloorFurnitureSymbol", () => {
    const items = FURNITURE_CATEGORIES.flatMap((category) => category.items);
    for (const item of items) {
      expect(() => {
        const { container } = render(createElement("svg", null, createElement(FloorFurnitureSymbol, {
          type: item.type,
          x: 0,
          y: 0,
          width: Math.max(40, item.width),
          height: Math.max(30, item.height),
          color: item.color,
        })));
        expect(container.querySelector("svg")).not.toBeNull();
      }, item.type).not.toThrow();
    }
  });

  it("keeps the remaining PLV plan symbols structurally recognizable", () => {
    const renderSymbol = (type: string) => render(createElement("svg", null, createElement(FloorFurnitureSymbol, {
      type, x: 0, y: 0, width: 100, height: 50, color: "#64748b",
    }))).container;
    const count = (type: string, selector: string) => renderSymbol(type).querySelectorAll(selector).length;

    expect(count("computer-workstation-chair", "[data-testid='computer-workstation-monitor']")).toBe(1);
    expect(count("computer-workstation-chair", "[data-testid='computer-workstation-keyboard']")).toBe(1);
    expect(count("computer-lab-table-4", "[data-testid='computer-lab-monitor']")).toBe(4);
    expect(count("computer-lab-table-6", "[data-testid='computer-lab-monitor']")).toBe(6);
    expect(renderSymbol("projector").querySelector("[data-testid='projector-lens']")).not.toBeNull();
    expect(renderSymbol("wall-display").querySelector("[data-testid='wall-display-screen']")).not.toBeNull();
    expect(renderSymbol("printer-copier").querySelector("[data-testid='printer-output']")).not.toBeNull();

    expect(renderSymbol("reception-counter").querySelector("[data-testid='reception-service-side']")).not.toBeNull();
    expect(count("study-table-4", "[data-testid='furniture-seat']")).toBe(4);
    expect(count("study-table-6", "[data-testid='furniture-seat']")).toBe(6);
    expect(renderSymbol("conference-table").querySelector("[data-testid='conference-table-centerline']")).not.toBeNull();
    expect(renderSymbol("library-study-table").querySelector("[data-testid='library-table-centerline']")).not.toBeNull();

    expect(count("sink", "[data-testid='sink-basin']")).toBe(1);
    expect(count("double-sink", "[data-testid='sink-basin']")).toBe(2);
    expect(renderSymbol("toilet-stall").querySelector("[data-testid='toilet-stall-symbol']")).not.toBeNull();
    expect(renderSymbol("pwd-toilet-stall").querySelector("[data-testid='pwd-grab-bar']")).not.toBeNull();
    expect(renderSymbol("mirror").querySelector("[data-testid='mirror-symbol']")).not.toBeNull();
    expect(renderSymbol("hand-dryer").querySelector("[data-testid='hand-dryer-body']")).not.toBeNull();
    expect(renderSymbol("floor-drain").querySelector("[data-testid='floor-drain-symbol']")).not.toBeNull();

    expect(renderSymbol("equipment-cabinet").querySelector("[data-testid='equipment-cabinet-symbol']")).not.toBeNull();
    expect(renderSymbol("double-sided-library-shelf").querySelector("[data-testid='double-sided-library-shelf-symbol']")).not.toBeNull();
    expect(renderSymbol("locker").querySelector("[data-testid='locker-body']")).not.toBeNull();
    expect(renderSymbol("waiting-bench").querySelector("[data-testid='waiting-bench-back']")).not.toBeNull();
    expect(renderSymbol("table-tennis").querySelector("[data-testid='table-tennis-net']")).not.toBeNull();
    expect(renderSymbol("vending-machine").querySelector("[data-testid='vending-machine-body']")).not.toBeNull();
    expect(renderSymbol("drinking-fountain").querySelector("[data-testid='drinking-fountain-spout']")).not.toBeNull();
  });

  it("keeps furniture hints concise and independent of the library category", () => {
    const facilities = FURNITURE_CATEGORIES.find((category) => category.id === "facilities")!;
    const reception = facilities.items.find((item) => item.type === "reception-counter")!;
    const hint = furnitureTooltipContent(reception);
    expect(hint).toBe("Reception / Service Counter - Service counter with workstation cue");
    expect(hint).not.toContain("Facilities / Amenities");
    expect(furnitureTooltipContent({ name: "Chair", description: "Classroom chair" })).toBe("Chair - Classroom chair");
  });
});

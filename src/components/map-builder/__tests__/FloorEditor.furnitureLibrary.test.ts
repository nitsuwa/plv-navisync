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

  it("matches useful object aliases without opening categories first", () => {
    const typesFor = (query: string) => getFurniturePaletteCategories(query)
      .flatMap((category) => category.items.map((item) => item.type));
    expect(typesFor("counter")).toEqual(expect.arrayContaining(["service-counter", "reception-counter"]));
    expect(typesFor("bathroom")).toEqual(expect.arrayContaining(["toilet", "urinal", "sink"]));
    expect(typesFor("computer")).toEqual(expect.arrayContaining(["computer-workstation-chair", "computer-lab-table-4", "computer-lab-table-6"]));
    expect(typesFor("umbrella")).toContain("garden-shade-umbrella");
    expect(typesFor("study")).toEqual(expect.arrayContaining(["student-desk-chair", "long-table", "study-carrel", "communal-study-table"]));
    expect(typesFor("library")).toEqual(expect.arrayContaining(["rack-bookshelf", "library-counter", "study-carrel"]));
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

  it("exposes the PLV floor-plan library and keeps grouped assets as one visual symbol", () => {
    const types = new Set(FURNITURE_CATEGORIES.flatMap((category) => category.items.map((item) => item.type)));
    expect([...types]).toEqual(expect.arrayContaining([
      "round-table-chairs", "workstation", "computer-workstation", "clinic-bed", "rectangular-table",
      "dining-table-4-seats", "dining-table-6-seats", "service-stall", "printer-copier", "service-counter",
      "rack-bookshelf", "l-shaped-workstation", "drinking-fountain", "toilet", "urinal", "sink",
      "lounge-chair", "lounge-chair-cluster", "lounge-sofa", "bench", "coffee-table",
      "conference-table-large", "audience-chair", "audience-seating-4x4", "lecture-chair-writing-arm",
      "boardroom-table-chairs", "long-table", "computer-station", "speech-lab-row", "collaborative-hub-table",
      "library-counter", "wall-counter", "garden-shade-umbrella", "communal-study-table", "double-sided-study-table",
      "study-carrel", "study-carrel-row",
    ]));

    const renderSymbol = (type: string) => render(createElement("svg", null, createElement(FloorFurnitureSymbol, {
      type, x: 0, y: 0, width: 100, height: 70, color: "#64748b",
    }))).container;
    expect(renderSymbol("round-table-chairs").querySelectorAll("[data-testid='furniture-seat']")).toHaveLength(6);
    expect(renderSymbol("dining-table-4-seats").querySelectorAll("[data-testid='furniture-seat']")).toHaveLength(4);
    expect(renderSymbol("dining-table-6-seats").querySelectorAll("[data-testid='furniture-seat']")).toHaveLength(6);
    expect(renderSymbol("lounge-chair-cluster").querySelectorAll("path").length).toBeGreaterThanOrEqual(3);
    expect(renderSymbol("clinic-bed").querySelector("[data-testid='clinic-bed-pillow']")).not.toBeNull();
    expect(renderSymbol("rack-bookshelf").querySelectorAll("line").length).toBeGreaterThan(2);
    expect(renderSymbol("l-shaped-workstation").querySelector("[data-testid='l-shaped-workstation-symbol']")).not.toBeNull();
    expect(renderSymbol("service-stall").querySelector("[data-testid='service-stall-symbol']")).not.toBeNull();
    expect(renderSymbol("service-stall").querySelector("[data-testid='service-stall-serving-opening']")).not.toBeNull();
    expect(renderSymbol("service-stall").querySelector("[data-testid='service-stall-floor-pattern']")).not.toBeNull();
    expect(renderSymbol("service-stall").querySelector("[data-testid='service-stall-queue-marker']")).not.toBeNull();
    expect(renderSymbol("service-counter").querySelector("[data-testid='service-counter-customer-edge']")).not.toBeNull();
    expect(renderSymbol("conference-table-large").querySelector("[data-testid='conference-table-large-surface']")).not.toBeNull();
    expect(renderSymbol("conference-table-large").querySelectorAll("[data-testid='furniture-seat']")).toHaveLength(16);
    expect(renderSymbol("audience-chair").querySelector("[data-testid='audience-chair-symbol']")).not.toBeNull();
    expect(renderSymbol("audience-seating-4x4").querySelectorAll("[data-testid='furniture-seat']")).toHaveLength(16);
    expect(renderSymbol("garden-shade-umbrella").querySelector("[data-testid='garden-shade-canopy']")).not.toBeNull();
    expect(renderSymbol("garden-shade-umbrella").querySelectorAll("[data-testid='garden-shade-rib']")).toHaveLength(8);
    expect(renderSymbol("communal-study-table").querySelector("[data-testid='communal-study-table-surface']")).not.toBeNull();
    expect(renderSymbol("communal-study-table").querySelectorAll("[data-testid='furniture-seat']")).toHaveLength(16);
    expect(renderSymbol("double-sided-study-table").querySelectorAll("[data-testid='double-sided-study-table-bench']")).toHaveLength(2);
    expect(renderSymbol("study-carrel").querySelectorAll("[data-testid='study-carrel-partition']")).toHaveLength(2);
    expect(renderSymbol("study-carrel-row").querySelectorAll("[data-testid='study-carrel-unit']")).toHaveLength(4);
  });

  it("renders the upper-floor lecture, library, computer, and collaboration symbols distinctly", () => {
    const renderSymbol = (type: string) => render(createElement("svg", null, createElement(FloorFurnitureSymbol, {
      type, x: 0, y: 0, width: 100, height: 50, color: "#64748b",
    }))).container;

    expect(renderSymbol("lecture-chair-writing-arm").querySelector("[data-testid='lecture-chair-writing-arm-symbol']")).not.toBeNull();
    expect(renderSymbol("lecture-chair-writing-arm").querySelector("[data-testid='lecture-chair-writing-arm']")).not.toBeNull();
    expect(renderSymbol("lecture-row-6").querySelectorAll("[data-testid='lecture-chair-writing-arm']")).toHaveLength(6);
    expect(renderSymbol("boardroom-table-chairs").querySelector("[data-testid='boardroom-table-surface']")).not.toBeNull();
    expect(renderSymbol("boardroom-table-chairs").querySelectorAll("[data-testid='furniture-seat']")).toHaveLength(14);
    expect(renderSymbol("long-table").querySelector("[data-testid='long-table-surface']")).not.toBeNull();
    expect(renderSymbol("computer-station").querySelector("[data-testid='computer-station-monitor']")).not.toBeNull();
    expect(renderSymbol("rack-bookshelf").querySelectorAll("line").length).toBeGreaterThan(2);
    expect(renderSymbol("library-counter").querySelector("[data-testid='library-counter-public-side']")).not.toBeNull();
    expect(renderSymbol("wall-counter").querySelector("[data-testid='wall-counter-surface']")).not.toBeNull();
    expect(renderSymbol("speech-lab-row").querySelectorAll("[data-testid='speech-lab-station']").length).toBeGreaterThanOrEqual(4);
    expect(renderSymbol("collaborative-hub-table").querySelectorAll("[data-testid='collaborative-hub-arm']")).toHaveLength(3);
    expect(renderSymbol("collaborative-hub-table").querySelectorAll("[data-testid='furniture-seat']")).toHaveLength(6);
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

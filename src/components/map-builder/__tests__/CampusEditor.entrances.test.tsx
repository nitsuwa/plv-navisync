import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useState } from "react";
import { CampusEditor } from "../CampusEditor";
import type { Campus } from "../types";

function makeCampus(): Campus {
  return {
    id: "c1",
    name: "Test Campus",
    code: "TC",
    description: "",
    address: "",
    city: "",
    province: "",
    postalCode: "",
    status: "active",
    publishStatus: "draft",
    visibleToStudents: false,
    features: { indoorNavigation: true, accessibilityNavigation: true, emergencyRoutes: true, issueReporting: true },
    canvasW: 900,
    canvasH: 680,
    settings: { accessibility: true, emergency: true, eventLayer: true, gps: true },
    buildings: [{
      id: "b1",
      name: "Building One",
      code: "B1",
      category: "Academic",
      description: "",
      x: 100,
      y: 100,
      width: 120,
      height: 80,
      color: "#1e40af",
      expanded: false,
      floors: [{ id: "f1", buildingId: "b1", number: 1, label: "Ground Floor", rooms: [], paths: [] }],
    }],
    markers: [],
    paths: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
}

function Harness({ onCampusChange, initialCampus }: { onCampusChange?: (c: Campus) => void; initialCampus?: Campus }) {
  const [campus, setCampus] = useState<Campus>(() => initialCampus ?? makeCampus());
  return (
    <CampusEditor
      campus={campus}
      onBack={() => {}}
      onUpdate={(c) => { onCampusChange?.(c); setCampus(c); }}
      onPublish={() => {}}
      onOpenFloor={() => {}}
      onAddBuilding={() => {}}
    />
  );
}

function canvasSvg(container: HTMLElement): SVGSVGElement {
  const svg = Array.from(container.querySelectorAll("svg")).find((s) => s.getAttribute("viewBox") === "0 0 900 680");
  expect(svg).toBeTruthy();
  Object.defineProperty(svg, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ left: 0, top: 0, right: 900, bottom: 680, width: 900, height: 680, x: 0, y: 0, toJSON: () => ({}) }),
  });
  return svg as SVGSVGElement;
}

function buildingGroup(container: HTMLElement): SVGGElement {
  const rect = Array.from(container.querySelectorAll("rect")).find((r) => r.getAttribute("fill") === "#1e40af");
  expect(rect).toBeTruthy();
  return rect!.closest("g")!.parentElement as unknown as SVGGElement;
}

function addEntrance(container: HTMLElement) {
  fireEvent.mouseDown(buildingGroup(container), { clientX: 120, clientY: 120, bubbles: true });
  fireEvent.mouseUp(canvasSvg(container), { clientX: 120, clientY: 120, bubbles: true });
  fireEvent.click(screen.getAllByText("Add")[0]);
}

function visibleText(label: string): HTMLElement {
  const match = screen.getAllByText(label).find((el) => el.tagName.toLowerCase() !== "title");
  expect(match, `visible text ${label}`).toBeTruthy();
  return match!;
}

function setTextInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  fireEvent.input(input, { target: { value } });
  fireEvent.blur(input);
}

afterEach(() => {
  cleanup();
  latestCampus = null;
});

let latestCampus: Campus | null = null;

describe("CampusEditor building entrances", () => {
  it("adds, renders, and selects a building-attached entrance", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    addEntrance(container);

    const entrance = latestCampus!.buildings[0].entrances![0];
    expect(entrance).toMatchObject({ buildingId: "b1", edge: "bottom", offset: 0.5, type: "general", isPrimary: true, accessible: false });
    expect(container.querySelector(`[data-entrance-id="${entrance.id}"]`)).toBeTruthy();
    expect(screen.getAllByText("Entrance").length).toBeGreaterThan(0);
    expect(screen.getByText("Parent")).toBeTruthy();
  });

  it("drags an entrance along the perimeter and deletes only that entrance", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    addEntrance(container);
    const entranceId = latestCampus!.buildings[0].entrances![0].id;
    const entranceNode = container.querySelector(`[data-entrance-id="${entranceId}"]`)!;
    const svg = canvasSvg(container);

    fireEvent.mouseDown(entranceNode, { clientX: 160, clientY: 180, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 222, clientY: 150, bubbles: true });
    fireEvent.mouseUp(svg, { clientX: 222, clientY: 150, bubbles: true });

    expect(latestCampus!.buildings[0].entrances![0]).toMatchObject({ edge: "right", offset: 0.625 });

    fireEvent.click(screen.getByText("Delete Entrance"));
    expect(latestCampus!.buildings[0].entrances).toEqual([]);
    expect(latestCampus!.buildings).toHaveLength(1);
  });

  it("configures name, type, accessibility, side, and position from the entrance panel", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    addEntrance(container);

    const nameInput = container.querySelector("#entrance-name") as HTMLInputElement;
    fireEvent.focus(nameInput);
    setTextInput(nameInput, "North Gate");

    expect(container.querySelector("#entrance-type")).toBeNull();
    fireEvent.click(screen.getByText("Service Entrance"));

    expect(container.querySelector("#entrance-edge")).toBeNull();
    fireEvent.click(screen.getByText("North"));

    const positionSlider = container.querySelector("#entrance-offset") as HTMLInputElement;
    fireEvent.change(positionSlider, { target: { value: "0.25" } });
    fireEvent.blur(positionSlider);

    fireEvent.click(screen.getByLabelText("Accessible"));

    expect(latestCampus!.buildings[0].entrances![0]).toMatchObject({
      type: "service",
      edge: "top",
      offset: 0.25,
      accessible: true,
    });
  });

  it("shows entrance rows on the building panel and selecting a row focuses entrance properties", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    addEntrance(container);

    fireEvent.mouseDown(buildingGroup(container), { clientX: 120, clientY: 120, bubbles: true });
    fireEvent.mouseUp(canvasSvg(container), { clientX: 120, clientY: 120, bubbles: true });

    expect(screen.getByText("Entrances (1)")).toBeTruthy();
    fireEvent.click(visibleText("Primary Entrance"));

    expect(screen.getByText("Parent")).toBeTruthy();
    expect(screen.getByText("Purpose")).toBeTruthy();
  });

  it("switches primary entrance in one update without affecting another building", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    addEntrance(container);
    fireEvent.mouseDown(buildingGroup(container), { clientX: 120, clientY: 120, bubbles: true });
    fireEvent.mouseUp(canvasSvg(container), { clientX: 120, clientY: 120, bubbles: true });
    fireEvent.click(screen.getAllByText("Add")[0]);

    const [first, second] = latestCampus!.buildings[0].entrances!;
    expect(first.isPrimary).toBe(true);
    expect(second.isPrimary).toBe(false);

    fireEvent.mouseDown(buildingGroup(container), { clientX: 120, clientY: 120, bubbles: true });
    fireEvent.mouseUp(canvasSvg(container), { clientX: 120, clientY: 120, bubbles: true });
    fireEvent.click(visibleText("Entrance 2"));
    fireEvent.click(screen.getByLabelText("Primary Entrance"));

    const entrances = latestCampus!.buildings[0].entrances!;
    expect(entrances.find((e) => e.id === first.id)?.isPrimary).toBe(false);
    expect(entrances.find((e) => e.id === second.id)?.isPrimary).toBe(true);
    expect(latestCampus!.buildings).toHaveLength(1);
  });

  it("duplicates Phase 2 entrance fields with new entrance and parent ids", () => {
    const initialCampus = makeCampus();
    initialCampus.buildings[0].entrances = [{
      id: "ent1",
      buildingId: "b1",
      edge: "bottom",
      offset: 0.5,
      name: "Service Door",
      type: "service",
      isPrimary: false,
      accessible: true,
    }];
    const { container } = render(<Harness initialCampus={initialCampus} onCampusChange={(c) => { latestCampus = c; }} />);

    fireEvent.mouseDown(buildingGroup(container), { clientX: 120, clientY: 120, bubbles: true });
    fireEvent.mouseUp(canvasSvg(container), { clientX: 120, clientY: 120, bubbles: true });
    fireEvent.keyDown(window, { key: "d", ctrlKey: true });

    expect(latestCampus!.buildings).toHaveLength(2);
    const original = initialCampus.buildings[0].entrances![0];
    const duplicateBuilding = latestCampus!.buildings[1];
    const duplicateEntrance = duplicateBuilding.entrances![0];
    expect(duplicateEntrance).toMatchObject({
      name: "Service Door",
      type: "service",
      accessible: true,
      edge: original.edge,
      offset: original.offset,
      isPrimary: false,
      buildingId: duplicateBuilding.id,
    });
    expect(duplicateEntrance.id).not.toBe(original.id);
  });

  it("promotes a remaining General entrance when deleting the current primary", () => {
    const initialCampus = makeCampus();
    initialCampus.buildings[0].entrances = [
      { id: "ent1", buildingId: "b1", edge: "bottom", offset: 0.5, type: "general", isPrimary: true },
      { id: "ent2", buildingId: "b1", edge: "top", offset: 0.5, type: "general", isPrimary: false },
    ];
    const { container } = render(<Harness initialCampus={initialCampus} onCampusChange={(c) => { latestCampus = c; }} />);

    fireEvent.mouseDown(buildingGroup(container), { clientX: 120, clientY: 120, bubbles: true });
    fireEvent.mouseUp(canvasSvg(container), { clientX: 120, clientY: 120, bubbles: true });
    fireEvent.click(visibleText("Primary Entrance"));
    fireEvent.click(screen.getByText("Delete Entrance"));

    expect(latestCampus!.buildings[0].entrances).toHaveLength(1);
    expect(latestCampus!.buildings[0].entrances![0]).toMatchObject({ id: "ent2", type: "general", isPrimary: true });
  });

  it("does not promote Service or Emergency Exit after deleting the only General primary", () => {
    const initialCampus = makeCampus();
    initialCampus.buildings[0].entrances = [
      { id: "ent1", buildingId: "b1", edge: "bottom", offset: 0.5, type: "general", isPrimary: true },
      { id: "ent2", buildingId: "b1", edge: "top", offset: 0.5, type: "service", isPrimary: false },
      { id: "ent3", buildingId: "b1", edge: "left", offset: 0.5, type: "emergency_exit", isPrimary: false },
    ];
    const { container } = render(<Harness initialCampus={initialCampus} onCampusChange={(c) => { latestCampus = c; }} />);

    fireEvent.mouseDown(buildingGroup(container), { clientX: 120, clientY: 120, bubbles: true });
    fireEvent.mouseUp(canvasSvg(container), { clientX: 120, clientY: 120, bubbles: true });
    fireEvent.click(visibleText("Primary Entrance"));
    fireEvent.click(screen.getByText("Delete Entrance"));

    expect(latestCampus!.buildings[0].entrances).toHaveLength(2);
    expect(latestCampus!.buildings[0].entrances!.some((e) => e.isPrimary)).toBe(false);
  });
});

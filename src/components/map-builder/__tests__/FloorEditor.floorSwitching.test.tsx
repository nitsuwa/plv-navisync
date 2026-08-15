import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { FloorEditor } from "../FloorEditor";
import type { Campus } from "../types";

function makeCampus(initialWall = false): Campus {
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
    canvasW: 580,
    canvasH: 380,
    settings: { accessibility: true, emergency: true, eventLayer: true, gps: true },
    buildings: [
      {
        id: "b1",
        name: "Main Building",
        code: "MB",
        category: "Academic",
        description: "",
        x: 100,
        y: 100,
        width: 120,
        height: 80,
        color: "#0e2a6e",
        floors: [
          {
            id: "f1",
            buildingId: "b1",
            number: 1,
            label: "Ground Floor",
            canvasW: 580,
            canvasH: 380,
            rooms: [],
            paths: [],
            walls: initialWall ? [{ id: "w1", x1: 50, y1: 50, x2: 150, y2: 50, thickness: 4, color: "#64748b", material: "concrete" }] : [],
            doors: [],
            windows: [],
            furniture: [],
            stairs: [],
            ramps: [],
            elevators: [],
            labels: [],
          },
          {
            id: "f2",
            buildingId: "b1",
            number: 2,
            label: "Floor 2",
            canvasW: 580,
            canvasH: 380,
            rooms: [],
            paths: [],
            walls: [],
            doors: [],
            windows: [],
            furniture: [],
            stairs: [],
            ramps: [],
            elevators: [],
            labels: [],
          },
        ],
      },
    ],
    markers: [],
    paths: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
}

function Harness({
  initialCampus,
  onCampusChange,
  onFloorChange,
  onSave,
}: {
  initialCampus?: Campus;
  onCampusChange?: (c: Campus) => void;
  onFloorChange?: (id: string) => void;
  onSave?: (c: Campus) => Promise<Campus>;
}) {
  const [campus, setCampus] = useState<Campus>(initialCampus ?? makeCampus());
  const [floorId, setFloorId] = useState("f1");

  return (
    <FloorEditor
      campus={campus}
      buildingId="b1"
      floorId={floorId}
      onBack={() => {}}
      onSwitchFloor={(id) => {
        setFloorId(id);
        onFloorChange?.(id);
      }}
      onUpdate={(c) => {
        onCampusChange?.(c);
        setCampus(c);
      }}
      onSave={onSave}
    />
  );
}

function canvasSvg(container: HTMLElement): SVGSVGElement {
  const svg = Array.from(container.querySelectorAll("svg")).find((s) => s.getAttribute("viewBox") === "0 0 580 380");
  expect(svg).toBeTruthy();
  return svg as SVGSVGElement;
}

function stubSvgRect(container: HTMLElement) {
  const svg = canvasSvg(container);
  Object.defineProperty(svg, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ left: 0, top: 0, right: 580, bottom: 380, width: 580, height: 380, x: 0, y: 0, toJSON: () => ({}) }),
  });
  return svg;
}

function drawWall(container: HTMLElement, startX = 60, startY = 60, endX = 140, endY = 60) {
  const svg = stubSvgRect(container);
  fireEvent.keyDown(window, { key: "w" });
  fireEvent.mouseDown(svg, { clientX: startX, clientY: startY, bubbles: true });
  fireEvent.mouseMove(svg, { clientX: endX, clientY: endY, bubbles: true });
  fireEvent.mouseDown(svg, { clientX: endX, clientY: endY, bubbles: true });
}

function floorOne(campus: Campus) {
  return campus.buildings[0].floors.find((floor) => floor.id === "f1")!;
}

function floorTwoButton() {
  // Selector-first floor UI: the floor tabs live behind the "Select floor"
  // dropdown (replaced the always-visible tab buttons).
  fireEvent.click(screen.getByRole("button", { name: /Select floor/i }));
  return screen.getByRole("option", { name: /Floor 2/i });
}

let latestCampus: Campus | null = null;
let activeFloorId = "f1";

beforeEach(() => {
  latestCampus = null;
  activeFloorId = "f1";
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("FloorEditor floor switching", () => {
  it("prompts before switching away from unsaved floor edits and keep editing leaves the user on the same floor", async () => {
    const { container } = render(
      <Harness onCampusChange={(c) => { latestCampus = c; }} onFloorChange={(id) => { activeFloorId = id; }} />
    );

    drawWall(container);
    expect(floorOne(latestCampus!).walls).toHaveLength(1);

    fireEvent.click(floorTwoButton());

    expect(screen.getByText("Unsaved Floor Changes")).toBeTruthy();
    expect(activeFloorId).toBe("f1");

    fireEvent.click(screen.getByRole("button", { name: /Keep Editing/i }));

    await waitFor(() => expect(screen.queryByText("Unsaved Floor Changes")).toBeNull());
    expect(activeFloorId).toBe("f1");
    expect(floorOne(latestCampus!).walls).toHaveLength(1);
  });

  it("discards dirty floor edits before switching", async () => {
    const { container } = render(
      <Harness onCampusChange={(c) => { latestCampus = c; }} onFloorChange={(id) => { activeFloorId = id; }} />
    );

    drawWall(container);
    fireEvent.click(floorTwoButton());
    fireEvent.click(screen.getByRole("button", { name: /Discard Changes/i }));

    expect(activeFloorId).toBe("f2");
    expect(floorOne(latestCampus!).walls).toHaveLength(0);
    await waitFor(() => expect(screen.queryByText("Unsaved Floor Changes")).toBeNull());
  });

  it("saves dirty floor edits before switching and clears the dirty guard", async () => {
    const onSave = vi.fn(async (campus: Campus) => campus);
    const { container } = render(
      <Harness onCampusChange={(c) => { latestCampus = c; }} onFloorChange={(id) => { activeFloorId = id; }} onSave={onSave} />
    );

    drawWall(container);
    fireEvent.click(floorTwoButton());
    fireEvent.click(screen.getByRole("button", { name: /Save Changes/i }));

    await waitFor(() => expect(activeFloorId).toBe("f2"));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(floorOne(latestCampus!).walls).toHaveLength(1);
    expect(screen.queryByText("Unsaved Floor Changes")).toBeNull();
  });

  it("keeps the user on the current floor when save fails", async () => {
    const onSave = vi.fn(async () => {
      throw new Error("Save failed");
    });
    const { container } = render(
      <Harness onCampusChange={(c) => { latestCampus = c; }} onFloorChange={(id) => { activeFloorId = id; }} onSave={onSave} />
    );

    drawWall(container);
    fireEvent.click(floorTwoButton());
    fireEvent.click(screen.getByRole("button", { name: /Save Changes/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(activeFloorId).toBe("f1");
    expect(floorOne(latestCampus!).walls).toHaveLength(1);
    expect(screen.getByText("Unsaved Floor Changes")).toBeTruthy();
  });

  it("switches cleanly after an explicit save without prompting again", async () => {
    const onSave = vi.fn(async (campus: Campus) => campus);
    const { container } = render(
      <Harness onCampusChange={(c) => { latestCampus = c; }} onFloorChange={(id) => { activeFloorId = id; }} onSave={onSave} />
    );

    drawWall(container);
    fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    fireEvent.click(floorTwoButton());

    expect(activeFloorId).toBe("f2");
    expect(screen.queryByText("Unsaved Floor Changes")).toBeNull();
  });

  it("does not treat selection-only changes or clean panning as unsaved floor edits", () => {
    const { container } = render(
      <Harness initialCampus={makeCampus(true)} onCampusChange={(c) => { latestCampus = c; }} onFloorChange={(id) => { activeFloorId = id; }} />
    );
    const svg = stubSvgRect(container);
    const wall = container.querySelector('g line[stroke="#64748b"]')!.closest("g")!;

    fireEvent.mouseDown(wall, { clientX: 50, clientY: 50, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.queryByTestId("selection-glow")).toBeTruthy();

    fireEvent.keyDown(window, { key: "h" });
    fireEvent.mouseDown(svg, { clientX: 20, clientY: 20, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 40, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.click(floorTwoButton());

    expect(activeFloorId).toBe("f2");
    expect(screen.queryByText("Unsaved Floor Changes")).toBeNull();
    expect(latestCampus).toBeNull();
  });

  it("clears incomplete drawing state while switching floors", () => {
    const { container } = render(
      <Harness onCampusChange={(c) => { latestCampus = c; }} onFloorChange={(id) => { activeFloorId = id; }} />
    );
    const svg = stubSvgRect(container);

    fireEvent.keyDown(window, { key: "w" });
    fireEvent.mouseDown(svg, { clientX: 60, clientY: 60, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 100, clientY: 60, bubbles: true });
    fireEvent.click(floorTwoButton());

    expect(activeFloorId).toBe("f2");
    expect(screen.queryByText("Unsaved Floor Changes")).toBeNull();

    // Back to Ground Floor through the same selector dropdown.
    fireEvent.click(screen.getByRole("button", { name: /Select floor/i }));
    fireEvent.click(screen.getByRole("option", { name: /Ground Floor/i }));
    fireEvent.mouseDown(svg, { clientX: 140, clientY: 60, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });

    expect(latestCampus).toBeNull();
  });

  it("resets history on floor switch so undo on the next floor does not mutate the previous floor", async () => {
    const onSave = vi.fn(async (campus: Campus) => campus);
    const { container } = render(
      <Harness onCampusChange={(c) => { latestCampus = c; }} onFloorChange={(id) => { activeFloorId = id; }} onSave={onSave} />
    );

    drawWall(container);
    fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(floorOne(latestCampus!).walls).toHaveLength(1);

    fireEvent.click(floorTwoButton());
    expect(activeFloorId).toBe("f2");

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(floorOne(latestCampus!).walls).toHaveLength(1);
  });
});

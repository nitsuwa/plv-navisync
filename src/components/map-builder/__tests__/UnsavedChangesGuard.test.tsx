import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { CampusEditor } from "../CampusEditor";
import { FloorEditor } from "../FloorEditor";
import type { Campus, FloorPlan } from "../types";

// ── Campus harness (dirty = campus JSON differs from the saved snapshot) ────

function makeCampus(name = "Test Campus"): Campus {
  return {
    id: "c1",
    name,
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
      entrances: [{ id: "ent-main", name: "Main Entrance", type: "general", edge: "bottom", offset: 0.5, accessible: true, isPrimary: true }],
      floors: [{
        id: "f1",
        buildingId: "b1",
        number: 1,
        label: "Ground Floor",
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
      }],
    }],
    markers: [],
    paths: [],
    navNodes: [],
    navEdges: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  } as Campus;
}

function CampusHarness({
  initialCampus,
  savedSnapshot,
  onSave,
  onBack,
}: {
  initialCampus: Campus;
  savedSnapshot: string;
  onSave: (c: Campus) => Promise<Campus>;
  onBack: () => void;
}) {
  const [campus, setCampus] = useState(initialCampus);
  return (
    <CampusEditor
      campus={campus}
      onBack={onBack}
      onUpdate={setCampus}
      onSave={onSave}
      onPublish={() => {}}
      onOpenFloor={() => {}}
      onAddBuilding={() => {}}
      savedSnapshot={savedSnapshot}
    />
  );
}

// ── Floor harness (two floors so floor-switch/back flows are exercisable) ──

function makeFloorCampus(): Campus {
  const base = makeCampus();
  const floor = (id: string, number: number, label: string): FloorPlan => ({
    id,
    buildingId: "b1",
    number,
    label,
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
  });
  base.buildings[0].floors = [floor("f1", 1, "Ground Floor"), floor("f2", 2, "Floor 2")];
  return base;
}

function FloorHarness({
  initialCampus,
  onCampusChange,
  onBack,
  onSave,
}: {
  initialCampus: Campus;
  onCampusChange?: (c: Campus) => void;
  onBack?: () => void;
  onSave?: (c: Campus) => Promise<Campus>;
}) {
  const [campus, setCampus] = useState(initialCampus);
  return (
    <FloorEditor
      campus={campus}
      buildingId="b1"
      floorId="f1"
      onBack={onBack ?? (() => {})}
      onSwitchFloor={() => {}}
      onUpdate={(c) => {
        onCampusChange?.(c);
        setCampus(c);
      }}
      onSave={onSave}
    />
  );
}

function floorSvg(container: HTMLElement): SVGSVGElement {
  const svg = Array.from(container.querySelectorAll("svg")).find((s) => s.getAttribute("viewBox") === "0 0 580 380");
  expect(svg).toBeTruthy();
  return svg as SVGSVGElement;
}

function stubFloorSvgRect(container: HTMLElement) {
  const svg = floorSvg(container);
  Object.defineProperty(svg, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ left: 0, top: 0, right: 580, bottom: 380, width: 580, height: 380, x: 0, y: 0, toJSON: () => ({}) }),
  });
  return svg;
}

function drawWall(container: HTMLElement) {
  const svg = stubFloorSvgRect(container);
  fireEvent.keyDown(window, { key: "w" });
  fireEvent.mouseDown(svg, { clientX: 60, clientY: 60, bubbles: true });
  fireEvent.mouseMove(svg, { clientX: 140, clientY: 60, bubbles: true });
  fireEvent.mouseDown(svg, { clientX: 140, clientY: 60, bubbles: true });
}

function firstFloor(campus: Campus) {
  return campus.buildings[0].floors.find((f) => f.id === "f1")!;
}

/** Dispatch a beforeunload and return whether the handler prevented it. */
function dispatchBeforeUnload(): boolean {
  const event = new Event("beforeunload", { cancelable: true });
  const spy = vi.spyOn(event, "preventDefault").mockImplementation(() => {});
  Object.defineProperty(event, "returnValue", { writable: true, value: "" });
  window.dispatchEvent(event);
  return spy.mock.calls.length > 0;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("shared unsaved-changes guard — CampusEditor", () => {
  it("Continue Editing cancels the back navigation and preserves state", async () => {
    const current = makeCampus();
    const saved = { ...current, name: "Saved Name" }; // differs → dirty
    const onSave = vi.fn(async (c: Campus) => c);
    const onBack = vi.fn();

    render(<CampusHarness initialCampus={current} savedSnapshot={JSON.stringify(saved)} onSave={onSave} onBack={onBack} />);

    fireEvent.click(screen.getByTitle("Back to campus list"));
    expect(screen.getByText("Unsaved Changes")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Continue Editing/i }));

    await waitFor(() => expect(screen.queryByText("Unsaved Changes")).toBeNull());
    expect(onBack).not.toHaveBeenCalled();
  });

  it("Discard Changes restores the saved baseline and continues the navigation", async () => {
    const current = makeCampus();
    const saved = { ...current, name: "Saved Name" };
    const onSave = vi.fn(async (c: Campus) => c);
    const onBack = vi.fn();

    render(<CampusHarness initialCampus={current} savedSnapshot={JSON.stringify(saved)} onSave={onSave} onBack={onBack} />);

    fireEvent.click(screen.getByTitle("Back to campus list"));
    fireEvent.click(screen.getByRole("button", { name: /Discard Changes/i }));

    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("beforeunload warns only while dirty", async () => {
    const current = makeCampus();
    const onSave = vi.fn(async (c: Campus) => c);

    // Clean editor → no native warning.
    render(<CampusHarness initialCampus={current} savedSnapshot={JSON.stringify(current)} onSave={onSave} onBack={() => {}} />);
    expect(dispatchBeforeUnload()).toBe(false);

    cleanup();
    document.body.innerHTML = "";

    // Dirty editor → native warning fires.
    const saved = { ...current, name: "Saved Name" };
    render(<CampusHarness initialCampus={current} savedSnapshot={JSON.stringify(saved)} onSave={onSave} onBack={() => {}} />);
    expect(dispatchBeforeUnload()).toBe(true);
  });

  it("repeated back attempts keep a single modal with one pending action", async () => {
    const current = makeCampus();
    const saved = { ...current, name: "Saved Name" };
    const onSave = vi.fn(async (c: Campus) => c);
    const onBack = vi.fn();

    render(<CampusHarness initialCampus={current} savedSnapshot={JSON.stringify(saved)} onSave={onSave} onBack={onBack} />);

    const back = screen.getByTitle("Back to campus list");
    fireEvent.click(back);
    fireEvent.click(back);
    fireEvent.click(back);

    expect(screen.getAllByText("Unsaved Changes").length).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: /Discard Changes/i }));
    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
  });
});

describe("shared unsaved-changes guard — FloorEditor", () => {
  it("back with unsaved floor edits prompts the shared dialog; Keep Editing stays", async () => {
    const current = makeFloorCampus();
    const onBack = vi.fn();
    const { container } = render(<FloorHarness initialCampus={current} onBack={onBack} />);

    drawWall(container);
    expect(firstFloor(current).walls).toHaveLength(0); // harness baseline untouched

    fireEvent.click(screen.getByRole("button", { name: "Test Campus" }));
    expect(screen.getByText("Unsaved Floor Changes")).toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Keep Editing/i }));
    await waitFor(() => expect(screen.queryByText("Unsaved Floor Changes")).toBeNull());
    expect(onBack).not.toHaveBeenCalled();
  });

  it("back + Discard navigates and restores the saved floor baseline", async () => {
    const current = makeFloorCampus();
    let latest: Campus = current;
    const onBack = vi.fn();
    const { container } = render(
      <FloorHarness initialCampus={current} onCampusChange={(c) => { latest = c; }} onBack={onBack} />,
    );

    drawWall(container);
    fireEvent.click(screen.getByRole("button", { name: "Test Campus" }));
    fireEvent.click(screen.getByRole("button", { name: /Discard Changes/i }));

    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
    expect(firstFloor(latest).walls).toHaveLength(0);
  });

  it("beforeunload warns while the floor is dirty", () => {
    const current = makeFloorCampus();
    const { container } = render(<FloorHarness initialCampus={current} />);

    drawWall(container);
    expect(dispatchBeforeUnload()).toBe(true);

    cleanup();
    document.body.innerHTML = "";

    // Clean floor → no native warning.
    render(<FloorHarness initialCampus={makeFloorCampus()} />);
    expect(dispatchBeforeUnload()).toBe(false);
  });
});

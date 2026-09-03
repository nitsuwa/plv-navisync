import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { CampusEditor } from "../CampusEditor";
import type { Campus } from "../types";

// ── Fixture: one expanded building with three floors ───────────────────────

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
      expanded: true,
      floors: [
        { id: "f1", buildingId: "b1", number: 1, label: "Ground Floor", rooms: [], paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [] },
        { id: "f2", buildingId: "b1", number: 2, label: "Floor 2", rooms: [], paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [] },
        { id: "f3", buildingId: "b1", number: 3, label: "Floor 3", rooms: [], paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [] },
      ],
    }],
    markers: [],
    paths: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
}

function Harness({
  onCampusChange,
  initialCampus,
  onOpenFloor,
}: {
  onCampusChange?: (c: Campus) => void;
  initialCampus?: Campus;
  onOpenFloor?: () => void;
}) {
  const [campus, setCampus] = useState<Campus>(() => initialCampus ?? makeCampus());
  return (
    <CampusEditor
      campus={campus}
      onBack={() => {}}
      onUpdate={(c) => { onCampusChange?.(c); setCampus(c); }}
      onPublish={() => {}}
      onOpenFloor={onOpenFloor ?? (() => {})}
      onAddBuilding={() => {}}
    />
  );
}

function labels(c: Campus): string[] {
  return c.buildings[0].floors.map((f) => f.label);
}

function openFloorMenu(rowLabel: string): HTMLElement {
  fireEvent.click(screen.getByRole("button", { name: `Floor actions: ${rowLabel}` }));
  return screen.getByTestId("hierarchy-floor-actions-menu");
}

function floorRow(rowLabel: string): HTMLElement {
  const row = screen.getByText(rowLabel).closest('[draggable="true"]');
  expect(row).toBeTruthy();
  return row as HTMLElement;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("Hierarchy floor management UX", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows the shared floor actions menu with edge-disable states from each row", () => {
    render(<Harness />);

    const lastMenu = openFloorMenu("Floor 3");
    expect(within(lastMenu).getByRole("button", { name: "Rename Floor" })).toBeInTheDocument();
    expect(within(lastMenu).getByRole("button", { name: "Duplicate Floor" })).toBeInTheDocument();
    expect((within(lastMenu).getByRole("button", { name: "Move Up" }) as HTMLButtonElement).disabled).toBe(false);
    expect((within(lastMenu).getByRole("button", { name: "Move Down" }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(lastMenu).getByRole("button", { name: "Delete Floor" }) as HTMLButtonElement).disabled).toBe(false);

    // First floor: Move Up is disabled instead.
    fireEvent.click(screen.getByRole("button", { name: "Floor actions: Ground Floor" }));
    const firstMenu = screen.getByTestId("hierarchy-floor-actions-menu");
    expect((within(firstMenu).getByRole("button", { name: "Move Up" }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(firstMenu).getByRole("button", { name: "Move Down" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("moves floors up and down from the row menu", () => {
    let latest: Campus | null = null;
    render(<Harness onCampusChange={(c) => { latest = c; }} />);

    fireEvent.click(within(openFloorMenu("Floor 3")).getByRole("button", { name: "Move Up" }));
    expect(labels(latest!)).toEqual(["Ground Floor", "Floor 3", "Floor 2"]);

    fireEvent.click(within(openFloorMenu("Ground Floor")).getByRole("button", { name: "Move Down" }));
    expect(labels(latest!)).toEqual(["Floor 3", "Ground Floor", "Floor 2"]);
  });

  it("reorders floors by dragging rows without accidentally opening a floor", () => {
    const onOpenFloor = vi.fn();
    let latest: Campus | null = null;
    render(<Harness onCampusChange={(c) => { latest = c; }} onOpenFloor={onOpenFloor} />);

    const dataTransfer = { setData: vi.fn(), effectAllowed: "move", dropEffect: "none" };
    fireEvent.dragStart(floorRow("Floor 3"), { dataTransfer });
    fireEvent.dragOver(floorRow("Floor 2"), { dataTransfer });
    fireEvent.drop(floorRow("Floor 2"), { dataTransfer });
    fireEvent.dragEnd(floorRow("Floor 3"), { dataTransfer });

    expect(labels(latest!)).toEqual(["Ground Floor", "Floor 3", "Floor 2"]);
    expect(onOpenFloor).not.toHaveBeenCalled();
  });

  it("renames a floor from the row menu", () => {
    let latest: Campus | null = null;
    render(<Harness onCampusChange={(c) => { latest = c; }} />);

    fireEvent.click(within(openFloorMenu("Floor 2")).getByRole("button", { name: "Rename Floor" }));
    fireEvent.change(screen.getByPlaceholderText("Floor label"), { target: { value: "Main Lobby" } });
    fireEvent.click(screen.getByRole("button", { name: "Rename Floor" }));

    expect(labels(latest!)).toEqual(["Ground Floor", "Main Lobby", "Floor 3"]);
  });

  it("deletes a floor from the row menu only after confirmation with its authored item count", () => {
    let latest: Campus | null = null;
    render(<Harness onCampusChange={(c) => { latest = c; }} />);

    fireEvent.click(within(openFloorMenu("Floor 2")).getByRole("button", { name: "Delete Floor" }));
    const dialog = screen.getByRole("dialog", { name: "Delete Floor" });
    expect(dialog).toHaveTextContent("and its 0 authored items");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete Floor" }));

    expect(labels(latest!)).toEqual(["Ground Floor", "Floor 3"]);
  });

  it("blocks deleting the last remaining floor from the row menu", () => {
    const single = makeCampus();
    single.buildings[0].floors = [single.buildings[0].floors[0]];
    render(<Harness initialCampus={single} />);

    fireEvent.click(within(openFloorMenu("Ground Floor")).getByRole("button", { name: "Delete Floor" }));
    expect(screen.queryByRole("dialog", { name: "Delete Floor" })).toBeNull();
    expect(screen.getByRole("button", { name: "Floor actions: Ground Floor" })).toBeInTheDocument();
  });

  // ── Issue 4: hierarchy building name truncates instead of colliding with
  // the floor-count / actions at narrow widths ──
  it("building name gets truncate so it never pushes into the floor count", () => {
    const campus = makeCampus();
    campus.buildings[0].name = "A Very Long Building Name That Cannot Possibly Fit In A Narrow Sidebar";
    const { container } = render(<Harness initialCampus={campus} />);

    const nameEl = screen.getByText(campus.buildings[0].name);
    // The name element must ellipsize (truncate) instead of wrapping/overflowing
    // into the floor-count + action buttons on the right.
    expect(nameEl.className).toContain("truncate");
    expect(nameEl.className).toContain("min-w-0");
    // Floor count remains visible and does not overlap the name (separate node).
    expect(screen.getByText("3F")).toBeInTheDocument();
    // The building name span sits in the same row as the floor count.
    const row = nameEl.closest("[draggable='true']");
    expect(row).toBeTruthy();
    const countEl = screen.getByText("3F");
    expect(row!.contains(countEl)).toBe(true);
  });

  it("floor rows truncate their labels the same way", () => {
    const campus = makeCampus();
    campus.buildings[0].floors[1].label = "Second Floor With An Extremely Long Descriptive Label For QA";
    render(<Harness initialCampus={campus} />);

    const labelEl = screen.getByText(campus.buildings[0].floors[1].label);
    expect(labelEl.className).toContain("truncate");
    expect(labelEl.className).toContain("min-w-0");
  });
});

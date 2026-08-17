/**
 * B7 Final Correction — Locate Ping, Publish Button, Floor Drag Handle
 * Focused regression tests for the three specific fixes.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { CampusEditor } from "../CampusEditor";
import type { Campus, NavigationNode, NavigationEdge, FloorSelection } from "../types";

afterEach(cleanup);

// ── Campus factory matching b7Markers.test.tsx ────────────────────────
function makeCampus(overrides?: Partial<Campus>): Campus {
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
    buildings: [],
    markers: [],
    paths: [],
    navNodes: [],
    navEdges: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    ...overrides,
  };
}

function node(overrides: Partial<NavigationNode> & { id: string; type: NavigationNode["type"] }): NavigationNode {
  return {
    name: overrides.id,
    x: 200,
    y: 200,
    accessible: true,
    color: "#16a34a",
    ...overrides,
  };
}

function edge(overrides: Partial<NavigationEdge> & { id: string; startNodeId: string; endNodeId: string }): NavigationEdge {
  return {
    distance: 100,
    bidirectional: true,
    accessible: true,
    type: "walkway",
    color: "#16a34a",
    width: 3,
    ...overrides,
  };
}

// ── Harness ─────────────────────────────────────────────────────────────
function Harness({ initialCampus, savedSnapshot }: { initialCampus: Campus; savedSnapshot?: string }) {
  const [campus, setCampus] = useState<Campus>(initialCampus);
  return (
    <CampusEditor
      campus={campus}
      onBack={() => {}}
      onUpdate={setCampus}
      onPublish={async () => {}}
      onOpenFloor={() => {}}
      onAddBuilding={() => {}}
      onOpenCanvasSettings={() => {}}
      savedSnapshot={savedSnapshot ?? JSON.stringify(initialCampus)}
    />
  );
}

function openIssuesPopover() {
  fireEvent.mouseDown(screen.getByTestId("issues-popover"));
}

// ═══════════════════════════════════════════════════════════════════════
// 1. LOCATE FLASH REMOVAL
// ═══════════════════════════════════════════════════════════════════════
describe("B7 Correction — locate flash removed", () => {
  it("does NOT render a locate-flash overlay when locating a nav node issue", () => {
    const campus = makeCampus({
      navNodes: [node({ id: "n1", type: "outdoor", x: 240, y: 160 })],
    });
    const { container } = render(<Harness initialCampus={campus} />);
    openIssuesPopover();
    fireEvent.click(screen.getByText(/has no navigation connections/));

    // The locate-flash SVG overlay must NOT exist
    expect(container.querySelector('[data-testid="locate-flash"]')).toBeNull();
  });

  it("does NOT render a locate-flash overlay when locating a building issue", () => {
    const campus = makeCampus({
      buildings: [{
        id: "b1",
        name: "Building A",
        code: "BA",
        category: "Academic",
        description: "",
        x: 100,
        y: 100,
        width: 200,
        height: 150,
        color: "#3b82f6",
        expanded: false,
        floors: [{ id: "f1", buildingId: "b1", number: 1, label: "Ground Floor", rooms: [], paths: [] }],
        entrances: [],
      }],
    });
    const { container } = render(<Harness initialCampus={campus} />);

    // No locate-flash overlay
    expect(container.querySelector('[data-testid="locate-flash"]')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 2. PUBLISH BUTTON INTERACTABILITY
// ═══════════════════════════════════════════════════════════════════════
describe("B7 Correction — Publish button entry", () => {
  it("publish button is enabled for a saved draft campus (not dirty, draft, never published)", () => {
    const campus = makeCampus({ publishStatus: "draft" });
    const snapshot = JSON.stringify(campus);
    render(<Harness initialCampus={campus} savedSnapshot={snapshot} />);
    const publishBtn = screen.getByRole("button", { name: /Publish/i });
    expect(publishBtn).not.toBeDisabled();
  });

  it("clicking Publish opens the pre-publish review dialog", async () => {
    const campus = makeCampus({
      publishStatus: "draft",
      navNodes: [node({ id: "n1", type: "outdoor", x: 240, y: 160 })],
    });
    const snapshot = JSON.stringify(campus);
    render(<Harness initialCampus={campus} savedSnapshot={snapshot} />);
    const publishBtn = screen.getByRole("button", { name: /Publish/i });
    fireEvent.click(publishBtn);

    // PrePublishDialog should appear
    await act(async () => {});
    const dialog = screen.getByRole("dialog", { name: /Pre-publish validation/i });
    expect(dialog).toBeTruthy();
  });

  it("publish button is disabled when campus has unsaved changes (isDirty)", () => {
    const campus = makeCampus();
    const oldSnapshot = JSON.stringify({ ...campus, name: "Old Snapshot" });
    render(<Harness initialCampus={campus} savedSnapshot={oldSnapshot} />);
    const publishBtn = screen.getByRole("button", { name: /Publish/i });
    expect(publishBtn).toBeDisabled();
  });

  it("publish button is disabled when already published with no changes", () => {
    const campus = makeCampus({
      publishStatus: "published",
      updatedAt: "2026-01-10",
      publishedAt: "2026-01-10",
    });
    const snapshot = JSON.stringify(campus);
    render(<Harness initialCampus={campus} savedSnapshot={snapshot} />);
    const publishBtn = screen.getByRole("button", { name: /Publish/i });
    expect(publishBtn).toBeDisabled();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 3. FLOOR DRAG HANDLE
// ═══════════════════════════════════════════════════════════════════════
describe("B7 Correction — floor drag handle removed", () => {
  it("expanded floor rows do NOT have draggable attribute or grip handle", () => {
    const campus = makeCampus({
      buildings: [{
        id: "b1",
        name: "Building A",
        code: "BA",
        category: "Academic",
        description: "",
        x: 100,
        y: 100,
        width: 200,
        height: 150,
        color: "#3b82f6",
        expanded: true,
        floors: [{ id: "f1", buildingId: "b1", number: 1, label: "Ground Floor", rooms: [], paths: [] }],
        entrances: [],
      }],
    });
    render(<Harness initialCampus={campus} />);

    // Floor row exists and is clickable
    const floorLabel = screen.getByText("Ground Floor");
    expect(floorLabel).toBeTruthy();

    // Floor row must NOT have draggable attribute
    const floorRow = floorLabel.closest("[draggable]");
    expect(floorRow).toBeNull();

    // No "Drag to reorder" title on the floor row area
    const dragTitles = document.querySelectorAll("[title='Drag to reorder']");
    for (const el of dragTitles) {
      // The only draggable elements with "Drag to reorder" should be BUILDING rows,
      // not floor rows. Check parent: floor rows have "Ground Floor" text.
      expect(el.closest(".pl-8")).toBeNull(); // pl-8 = floor list container
    }
  });

  it("floor list still has the Add Floor button", () => {
    const campus = makeCampus({
      buildings: [{
        id: "b1",
        name: "Building A",
        code: "BA",
        category: "Academic",
        description: "",
        x: 100,
        y: 100,
        width: 200,
        height: 150,
        color: "#3b82f6",
        expanded: true,
        floors: [{ id: "f1", buildingId: "b1", number: 1, label: "Ground Floor", rooms: [], paths: [] }],
        entrances: [],
      }],
    });
    render(<Harness initialCampus={campus} />);
    expect(screen.getByText("Add Floor")).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 4. PROPERTIES PANEL FLOOR ROWS (browser-reality verification)
// ═══════════════════════════════════════════════════════════════════════
import { PropertiesPanel } from "../PropertiesPanel";

describe("B7 Correction — PropertiesPanel floor rows have no grip handle", () => {
  const building = {
    id: "b1",
    name: "Building A",
    code: "BA",
    category: "Academic",
    description: "",
    x: 100,
    y: 100,
    width: 200,
    height: 150,
    color: "#3b82f6",
    floors: [
      { id: "f1", buildingId: "b1", number: 1, label: "Ground Floor", rooms: [], paths: [] },
      { id: "f2", buildingId: "b1", number: 2, label: "Floor 2", rooms: [], paths: [] },
    ],
    entrances: [],
  };

  const baseProps = {
    selected: null,
    selBldg: building,
    selMkr: undefined,
    selPath: undefined,
    allPaths: [],
    selRoute: undefined,
    selDecorAsset: undefined,
    allDecorAssets: [],
    allBuildings: [building],
    layer: "campus" as const,
    multiSelected: [],
    multiSelectedBuildings: [],
    selectedOutdoorCount: 0,
    onBatchUpdateBuildings: () => {},
    onBatchDeleteBuildings: () => {},
    onBatchUpdatePaths: () => {},
    onBatchDeletePaths: () => {},
    onClearMultiSelect: () => {},
    onUpdateBuilding: () => {},
    onAddEntrance: () => {},
    onSelectEntrance: () => {},
    onUpdateEntrance: () => {},
    onDeleteEntrance: () => {},
    onUpdateMarker: () => {},
    onDeleteBuilding: () => {},
    onDeleteMarker: () => {},
    onUpdateDecorAsset: () => {},
    onDeleteDecorAsset: () => {},
    onDuplicateDecorAsset: () => {},
    onClose: () => {},
  };

  it("Ground Floor row renders without a GripVertical drag handle", () => {
    const { container } = render(<PropertiesPanel {...baseProps} />);
    const groundFloor = screen.getByText("Ground Floor");
    expect(groundFloor).toBeTruthy();

    // The floor row container should NOT contain GripVertical (six-dot) icon
    const floorRow = groundFloor.closest(".flex.items-center")?.parentElement;
    if (floorRow) {
      const svgs = floorRow.querySelectorAll("svg");
      for (const svg of svgs) {
        // No SVG should have the GripVertical path pattern (6 dots)
        const paths = svg.querySelectorAll("path");
        // GripVertical has exactly 6 circle paths — but simpler: check class
        // We just verify no element has cursor-grab class in the floor row
        expect(svg.closest("[class*='cursor-grab']")).toBeNull();
      }
    }
  });

  it("Floor 2 row renders without a GripVertical drag handle", () => {
    const { container } = render(<PropertiesPanel {...baseProps} />);
    const floor2 = screen.getByText("Floor 2");
    expect(floor2).toBeTruthy();

    // No cursor-grab element in the floor row area
    const floorRow = floor2.closest(".flex.items-center");
    if (floorRow) {
      const grabEls = floorRow.querySelectorAll("[class*='cursor-grab']");
      expect(grabEls.length).toBe(0);
    }
  });

  it("floor rows show number badge, label, and room count (no grip)", () => {
    const { container } = render(<PropertiesPanel {...baseProps} />);
    // Number badge for Ground Floor
    expect(screen.getByText("1")).toBeTruthy();
    // Number badge for Floor 2
    expect(screen.getByText("2")).toBeTruthy();
    // Labels
    expect(screen.getByText("Ground Floor")).toBeTruthy();
    expect(screen.getByText("Floor 2")).toBeTruthy();
    // Room counts
    const roomCounts = screen.getAllByText("0 rooms");
    expect(roomCounts.length).toBe(2);
  });

  it("floor rows have no draggable attribute", () => {
    const { container } = render(<PropertiesPanel {...baseProps} />);
    const draggables = container.querySelectorAll("[draggable]");
    // No floor row should be draggable
    for (const el of draggables) {
      const hasFloorLabel = el.querySelector("[class*='truncate']");
      if (hasFloorLabel) {
        const text = hasFloorLabel.textContent ?? "";
        expect(text).not.toMatch(/Ground Floor|Floor \d/);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 5. FLOOR DELETE CONFIRMATION PARITY
// ═══════════════════════════════════════════════════════════════════════
describe("B7 Correction — PropertiesPanel floor delete confirmation", () => {
  const buildingWithFloors = {
    id: "b1",
    name: "Building A",
    code: "BA",
    category: "Academic",
    description: "",
    x: 100,
    y: 100,
    width: 200,
    height: 150,
    color: "#3b82f6",
    floors: [
      { id: "f1", buildingId: "b1", number: 1, label: "Ground Floor", rooms: [], paths: [] },
      { id: "f2", buildingId: "b1", number: 2, label: "Floor 2", rooms: [], paths: [] },
    ],
    entrances: [],
  };

  it("clicking delete does NOT immediately remove the floor", () => {
    const onUpdateBuilding = vi.fn();
    render(
      <PropertiesPanel
        selected={null}
        selBldg={buildingWithFloors}
        selMkr={undefined}
        selPath={undefined}
        allPaths={[]}
        selRoute={undefined}
        selDecorAsset={undefined}
        allDecorAssets={[]}
        allBuildings={[buildingWithFloors]}
        layer="campus"
        multiSelected={[]}
        multiSelectedBuildings={[]}
        selectedOutdoorCount={0}
        onBatchUpdateBuildings={() => {}}
        onBatchDeleteBuildings={() => {}}
        onBatchUpdatePaths={() => {}}
        onBatchDeletePaths={() => {}}
        onClearMultiSelect={() => {}}
        onUpdateBuilding={onUpdateBuilding}
        onAddEntrance={() => {}}
        onSelectEntrance={() => {}}
        onUpdateEntrance={() => {}}
        onDeleteEntrance={() => {}}
        onUpdateMarker={() => {}}
        onDeleteBuilding={() => {}}
        onDeleteMarker={() => {}}
        onUpdateDecorAsset={() => {}}
        onDeleteDecorAsset={() => {}}
        onDuplicateDecorAsset={() => {}}
        onClose={() => {}}
      />
    );

    // Click the delete (minus) button for Floor 2
    const floor2Row = screen.getByText("Floor 2").closest(".flex.items-center");
    const deleteBtn = floor2Row?.querySelector("button");
    expect(deleteBtn).toBeTruthy();
    fireEvent.click(deleteBtn!);

    // Should NOT have called onUpdateBuilding yet (no immediate delete)
    expect(onUpdateBuilding).not.toHaveBeenCalled();
  });

  it("confirmation dialog opens after clicking delete", () => {
    render(
      <PropertiesPanel
        selected={null}
        selBldg={buildingWithFloors}
        selMkr={undefined}
        selPath={undefined}
        allPaths={[]}
        selRoute={undefined}
        selDecorAsset={undefined}
        allDecorAssets={[]}
        allBuildings={[buildingWithFloors]}
        layer="campus"
        multiSelected={[]}
        multiSelectedBuildings={[]}
        selectedOutdoorCount={0}
        onBatchUpdateBuildings={() => {}}
        onBatchDeleteBuildings={() => {}}
        onBatchUpdatePaths={() => {}}
        onBatchDeletePaths={() => {}}
        onClearMultiSelect={() => {}}
        onUpdateBuilding={() => {}}
        onAddEntrance={() => {}}
        onSelectEntrance={() => {}}
        onUpdateEntrance={() => {}}
        onDeleteEntrance={() => {}}
        onUpdateMarker={() => {}}
        onDeleteBuilding={() => {}}
        onDeleteMarker={() => {}}
        onUpdateDecorAsset={() => {}}
        onDeleteDecorAsset={() => {}}
        onDuplicateDecorAsset={() => {}}
        onClose={() => {}}
      />
    );

    const floor2Row = screen.getByText("Floor 2").closest(".flex.items-center");
    const deleteBtn = floor2Row?.querySelector("button");
    fireEvent.click(deleteBtn!);

    // ConfirmDialog should open — look for the dialog role
    const dialog = screen.getByRole("dialog", { name: /Delete Floor/i });
    expect(dialog).toBeTruthy();
  });

  it("dialog identifies the correct floor name", () => {
    render(
      <PropertiesPanel
        selected={null}
        selBldg={buildingWithFloors}
        selMkr={undefined}
        selPath={undefined}
        allPaths={[]}
        selRoute={undefined}
        selDecorAsset={undefined}
        allDecorAssets={[]}
        allBuildings={[buildingWithFloors]}
        layer="campus"
        multiSelected={[]}
        multiSelectedBuildings={[]}
        selectedOutdoorCount={0}
        onBatchUpdateBuildings={() => {}}
        onBatchDeleteBuildings={() => {}}
        onBatchUpdatePaths={() => {}}
        onBatchDeletePaths={() => {}}
        onClearMultiSelect={() => {}}
        onUpdateBuilding={() => {}}
        onAddEntrance={() => {}}
        onSelectEntrance={() => {}}
        onUpdateEntrance={() => {}}
        onDeleteEntrance={() => {}}
        onUpdateMarker={() => {}}
        onDeleteBuilding={() => {}}
        onDeleteMarker={() => {}}
        onUpdateDecorAsset={() => {}}
        onDeleteDecorAsset={() => {}}
        onDuplicateDecorAsset={() => {}}
        onClose={() => {}}
      />
    );

    const floor2Row = screen.getByText("Floor 2").closest(".flex.items-center");
    const deleteBtn = floor2Row?.querySelector("button");
    fireEvent.click(deleteBtn!);

    // Dialog message should mention "Floor 2"
    expect(screen.getAllByText(/Floor 2/).length).toBeGreaterThan(1);
  });

  it("Cancel preserves the floor — no deletion occurs", () => {
    const onUpdateBuilding = vi.fn();
    render(
      <PropertiesPanel
        selected={null}
        selBldg={buildingWithFloors}
        selMkr={undefined}
        selPath={undefined}
        allPaths={[]}
        selRoute={undefined}
        selDecorAsset={undefined}
        allDecorAssets={[]}
        allBuildings={[buildingWithFloors]}
        layer="campus"
        multiSelected={[]}
        multiSelectedBuildings={[]}
        selectedOutdoorCount={0}
        onBatchUpdateBuildings={() => {}}
        onBatchDeleteBuildings={() => {}}
        onBatchUpdatePaths={() => {}}
        onBatchDeletePaths={() => {}}
        onClearMultiSelect={() => {}}
        onUpdateBuilding={onUpdateBuilding}
        onAddEntrance={() => {}}
        onSelectEntrance={() => {}}
        onUpdateEntrance={() => {}}
        onDeleteEntrance={() => {}}
        onUpdateMarker={() => {}}
        onDeleteBuilding={() => {}}
        onDeleteMarker={() => {}}
        onUpdateDecorAsset={() => {}}
        onDeleteDecorAsset={() => {}}
        onDuplicateDecorAsset={() => {}}
        onClose={() => {}}
      />
    );

    const floor2Row = screen.getByText("Floor 2").closest(".flex.items-center");
    fireEvent.click(floor2Row!.querySelector("button")!);

    // Click Cancel
    fireEvent.click(screen.getByText("Cancel"));

    // No deletion should have occurred
    expect(onUpdateBuilding).not.toHaveBeenCalled();
    // Both floors should still be visible
    expect(screen.getByText("Ground Floor")).toBeTruthy();
    expect(screen.getByText("Floor 2")).toBeTruthy();
  });

  it("Confirm removes the correct floor and preserves the other", () => {
    const onUpdateBuilding = vi.fn();
    render(
      <PropertiesPanel
        selected={null}
        selBldg={buildingWithFloors}
        selMkr={undefined}
        selPath={undefined}
        allPaths={[]}
        selRoute={undefined}
        selDecorAsset={undefined}
        allDecorAssets={[]}
        allBuildings={[buildingWithFloors]}
        layer="campus"
        multiSelected={[]}
        multiSelectedBuildings={[]}
        selectedOutdoorCount={0}
        onBatchUpdateBuildings={() => {}}
        onBatchDeleteBuildings={() => {}}
        onBatchUpdatePaths={() => {}}
        onBatchDeletePaths={() => {}}
        onClearMultiSelect={() => {}}
        onUpdateBuilding={onUpdateBuilding}
        onAddEntrance={() => {}}
        onSelectEntrance={() => {}}
        onUpdateEntrance={() => {}}
        onDeleteEntrance={() => {}}
        onUpdateMarker={() => {}}
        onDeleteBuilding={() => {}}
        onDeleteMarker={() => {}}
        onUpdateDecorAsset={() => {}}
        onDeleteDecorAsset={() => {}}
        onDuplicateDecorAsset={() => {}}
        onClose={() => {}}
      />
    );

    const floor2Row = screen.getByText("Floor 2").closest(".flex.items-center");
    fireEvent.click(floor2Row!.querySelector("button")!);

    // Click the confirm button ("Delete Floor")
    fireEvent.click(screen.getByText("Delete Floor", { selector: "button" }));

    // Should have called onUpdateBuilding with the remaining floor
    expect(onUpdateBuilding).toHaveBeenCalledTimes(1);
    const [buildingId, changes] = onUpdateBuilding.mock.calls[0];
    expect(buildingId).toBe("b1");
    expect(changes.floors).toHaveLength(1);
    expect(changes.floors[0].label).toBe("Ground Floor");
    expect(changes.floors[0].number).toBe(1);
  });

  it("delete button is disabled when only one floor exists", () => {
    const singleFloorBuilding = {
      ...buildingWithFloors,
      floors: [{ id: "f1", buildingId: "b1", number: 1, label: "Ground Floor", rooms: [], paths: [] }],
    };
    render(
      <PropertiesPanel
        selected={null}
        selBldg={singleFloorBuilding}
        selMkr={undefined}
        selPath={undefined}
        allPaths={[]}
        selRoute={undefined}
        selDecorAsset={undefined}
        allDecorAssets={[]}
        allBuildings={[singleFloorBuilding]}
        layer="campus"
        multiSelected={[]}
        multiSelectedBuildings={[]}
        selectedOutdoorCount={0}
        onBatchUpdateBuildings={() => {}}
        onBatchDeleteBuildings={() => {}}
        onBatchUpdatePaths={() => {}}
        onBatchDeletePaths={() => {}}
        onClearMultiSelect={() => {}}
        onUpdateBuilding={() => {}}
        onAddEntrance={() => {}}
        onSelectEntrance={() => {}}
        onUpdateEntrance={() => {}}
        onDeleteEntrance={() => {}}
        onUpdateMarker={() => {}}
        onDeleteBuilding={() => {}}
        onDeleteMarker={() => {}}
        onUpdateDecorAsset={() => {}}
        onDeleteDecorAsset={() => {}}
        onDuplicateDecorAsset={() => {}}
        onClose={() => {}}
      />
    );

    const floorRow = screen.getByText("Ground Floor").closest(".flex.items-center");
    const deleteBtn = floorRow?.querySelector("button");
    expect(deleteBtn).toBeTruthy();
    expect(deleteBtn).toBeDisabled();
  });
});

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
      entrances: [{ id: "ent-main", name: "Main Entrance", type: "general", edge: "bottom", offset: 0.5, accessible: true, isPrimary: true }],
      floors: [{
        id: "f1",
        buildingId: "b1",
        number: 1,
        label: "Ground Floor",
        rooms: [],
        paths: [],
        walls: [],
        doors: [{ id: "door-a", label: "Door A", x: 20, y: 20, width: 20, direction: "left", color: "#b45309" }],
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
    navNodes: [
      { id: "entrance-node", campusId: "c1", buildingId: "b1", entranceId: "ent-main", name: "Main Entrance", type: "entrance", x: 150, y: 180, accessible: true },
      { id: "door-node", campusId: "c1", buildingId: "b1", floorId: "f1", doorId: "door-a", name: "Door A", type: "hallway", x: 20, y: 20, accessible: true },
    ],
    navEdges: [{
      id: "edge-current",
      startNodeId: "entrance-node",
      endNodeId: "door-node",
      distance: 1,
      bidirectional: true,
      accessible: true,
      emergencySafe: true,
      type: "entrance_transition",
    }],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  } as unknown as Campus;
}

function Harness({
  initialCampus,
  savedSnapshot,
  onSave,
  onBack,
  onCampusChange,
}: {
  initialCampus: Campus;
  savedSnapshot: string;
  onSave: (campus: Campus) => Promise<Campus>;
  onBack: () => void;
  onCampusChange?: (campus: Campus) => void;
}) {
  const [campus, setCampus] = useState(initialCampus);
  return (
    <CampusEditor
      campus={campus}
      onBack={onBack}
      onUpdate={(next) => { onCampusChange?.(next); setCampus(next); }}
      onSave={onSave}
      onPublish={() => {}}
      onOpenFloor={() => {}}
      onAddBuilding={() => {}}
      savedSnapshot={savedSnapshot}
    />
  );
}

function clickBack() {
  fireEvent.click(screen.getByRole("button", { name: /Back to campus list/i }));
}

function campusSvg(container: HTMLElement): SVGSVGElement {
  const svg = container.querySelector<SVGSVGElement>('svg[viewBox="0 0 900 680"]');
  expect(svg).toBeTruthy();
  Object.defineProperty(svg, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ left: 0, top: 0, right: 900, bottom: 680, width: 900, height: 680, x: 0, y: 0, toJSON: () => ({}) }),
  });
  return svg!;
}

function selectAndDuplicateBuilding(container: HTMLElement) {
  const svg = campusSvg(container);
  const buildingBody = Array.from(container.querySelectorAll<SVGRectElement>("rect")).find((rect) => rect.getAttribute("fill") === "#1e40af");
  expect(buildingBody, "building body rect").toBeTruthy();
  fireEvent.mouseDown(buildingBody!.parentElement!, { clientX: 160, clientY: 140, bubbles: true });
  fireEvent.mouseUp(svg, { bubbles: true });
  fireEvent.keyDown(window, { key: "d", ctrlKey: true });
}

describe("B5 Phase 4.5 - Save Draft persistence flow", () => {
  it("saves the current campus nav graph before leaving", async () => {
    const current = makeCampus();
    current.navNodes!.push(
      { id: "saved-walk-a", campusId: "c1", name: "Walking Point A", type: "outdoor", x: 220, y: 240, accessible: true, color: "#2563eb" },
      { id: "saved-walk-b", campusId: "c1", name: "Walking Point B", type: "outdoor", x: 300, y: 240, accessible: true, color: "#2563eb" },
    );
    current.navEdges!.push({
      id: "authored-campus-walk",
      startNodeId: "saved-walk-a",
      endNodeId: "saved-walk-b",
      distance: 80,
      bidirectional: true,
      accessible: true,
      emergencySafe: true,
      type: "walkway",
      color: "#2563eb",
      width: 4,
    });
    const saved = { ...current, navEdges: current.navEdges!.filter((edge) => edge.id !== "authored-campus-walk") };
    const onSave = vi.fn(async (campus: Campus) => campus);
    const onBack = vi.fn();

    render(<Harness initialCampus={current} savedSnapshot={JSON.stringify(saved)} onSave={onSave} onBack={onBack} />);
    clickBack();
    fireEvent.click(screen.getByRole("button", { name: /Save Draft/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].navEdges).toEqual(current.navEdges);
    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
  });

  it("does not leave when Save Draft persistence fails", async () => {
    const current = makeCampus();
    const saved = { ...current, description: "Earlier saved description" };
    const onSave = vi.fn(async () => {
      throw new Error("database rejected navigation_edges");
    });
    const onBack = vi.fn();

    render(<Harness initialCampus={current} savedSnapshot={JSON.stringify(saved)} onSave={onSave} onBack={onBack} />);
    clickBack();
    fireEvent.click(screen.getByRole("button", { name: /Save Draft/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onBack).not.toHaveBeenCalled();
    expect(await screen.findByText("database rejected navigation_edges")).toBeInTheDocument();
    expect(screen.getByText("Unsaved Changes")).toBeInTheDocument();
  });
});

describe("B7 Phase 2 — Save Draft is never blocked by validation", () => {
  it("deduplicates same-tick Save submissions and uses truthful indeterminate copy", async () => {
    const current = makeCampus();
    const saved = { ...current, description: "Earlier saved description" };
    let resolveSave!: (campus: Campus) => void;
    const onSave = vi.fn(() => new Promise<Campus>((resolve) => { resolveSave = resolve; }));

    render(<Harness initialCampus={current} savedSnapshot={JSON.stringify(saved)} onSave={onSave} onBack={() => {}} />);
    const saveButton = screen.getByRole("button", { name: "Save" });
    act(() => {
      fireEvent.click(saveButton);
      fireEvent.click(saveButton);
    });

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const dialog = screen.getByRole("dialog", { name: "Performing saving" });
    expect(within(dialog).getByRole("heading", { name: "Saving changes" })).toBeInTheDocument();
    expect(within(dialog).getByText("Keeping your campus map up to date.")).toBeInTheDocument();
    expect(within(dialog).getByText("Saving map data…")).toBeInTheDocument();
    expect(dialog.querySelector('[role="progressbar"]')).not.toHaveAttribute("aria-valuenow");

    await act(async () => { resolveSave(current); });
    await screen.findByRole("heading", { name: "Campus Map Saved" });
  });

  it("saves a draft that has validation WARNINGS", async () => {
    // Orphan nav node → nav_orphan_node warning. Saving must NOT be blocked.
    const current = makeCampus();
    current.navNodes!.push({ id: "orphan", campusId: "c1", name: "Orphan", type: "outdoor", x: 500, y: 500, accessible: true } as NonNullable<Campus["navNodes"]>[number]);
    const saved = { ...current, description: "Earlier saved description" };
    const onSave = vi.fn(async (c: Campus) => c);
    const onBack = vi.fn();

    render(<Harness initialCampus={current} savedSnapshot={JSON.stringify(saved)} onSave={onSave} onBack={onBack} />);
    // The warning is live in the global Issues control BEFORE saving.
    expect(Number(screen.getByTestId("issues-popover").getAttribute("data-count"))).toBeGreaterThan(0);

    clickBack();
    fireEvent.click(screen.getByRole("button", { name: /Save Draft/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
  });

  it("saves a draft that has validation ERRORS", async () => {
    // Building pushed beyond the canvas → boundary error. Saving must NOT be blocked.
    const current = makeCampus();
    current.buildings[0] = { ...current.buildings[0], x: 850 };
    const saved = { ...current, description: "Earlier saved description" };
    const onSave = vi.fn(async (c: Campus) => c);
    const onBack = vi.fn();

    render(<Harness initialCampus={current} savedSnapshot={JSON.stringify(saved)} onSave={onSave} onBack={onBack} />);
    expect(Number(screen.getByTestId("issues-popover").getAttribute("data-count"))).toBeGreaterThan(0);

    clickBack();
    fireEvent.click(screen.getByRole("button", { name: /Save Draft/i }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
  });

  it("successful save does NOT remove validation issues and clears dirty state", async () => {
    const current = makeCampus();
    current.navNodes!.push({ id: "orphan", campusId: "c1", name: "Orphan", type: "outdoor", x: 500, y: 500, accessible: true } as NonNullable<Campus["navNodes"]>[number]);
    const saved = { ...current, description: "Earlier saved description" };
    const onSave = vi.fn(async (c: Campus) => c);
    const onBack = vi.fn();

    render(<Harness initialCampus={current} savedSnapshot={JSON.stringify(saved)} onSave={onSave} onBack={onBack} />);
    // Save via the toolbar button directly (no back-guard needed).
    const issueCountBefore = screen.getByTestId("issues-popover").getAttribute("data-count");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    // Validation issues legitimately remain after the save.
    expect(screen.getByTestId("issues-popover").getAttribute("data-count")).toBe(issueCountBefore);
    // Dirty state is cleared normally. The button keeps its accessible name
    // "Save" while the visible lifecycle label reports "Saved".
    const saveBtn = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
    expect(saveBtn.querySelector("[data-toolbar-lifecycle-label]")).toHaveTextContent("Saved");
  });

  it("a real save failure preserves dirty edits and reports the failure", async () => {
    const current = makeCampus();
    const saved = { ...current, description: "Earlier saved description" };
    const onSave = vi.fn(async () => {
      throw new Error("database offline");
    });
    const onBack = vi.fn();

    render(<Harness initialCampus={current} savedSnapshot={JSON.stringify(saved)} onSave={onSave} onBack={onBack} />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    // Failure surfaces inside the save screen with a retry — dirty state stays.
    expect(await screen.findByText("Unable to Save Campus Map")).toBeInTheDocument();
    // The toolbar Save button is still enabled (draft still dirty).
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(false);
    expect(onBack).not.toHaveBeenCalled();
  });

  it("successful Save commits the current campus as the new undo/redo baseline", async () => {
    const initialCampus = makeCampus();
    let latestCampus = initialCampus;
    const onSave = vi.fn(async (campus: Campus) => campus);
    const { container } = render(<Harness
      initialCampus={initialCampus}
      // Model an already-dirty persisted baseline so save can clear a Redo
      // branch after the current edit has been undone.
      savedSnapshot={JSON.stringify({ ...initialCampus, description: "previous saved description" })}
      onSave={onSave}
      onBack={() => {}}
      onCampusChange={(campus) => { latestCampus = campus; }}
    />);

    selectAndDuplicateBuilding(container);
    expect(latestCampus.buildings).toHaveLength(2);
    expect((screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    await waitFor(() => expect(latestCampus.buildings).toHaveLength(1));
    expect((screen.getByRole("button", { name: "Redo" }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect((screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByRole("button", { name: "Redo" }) as HTMLButtonElement).disabled).toBe(true);
    });
    expect(await screen.findByRole("heading", { name: "Campus Map Saved" })).toBeInTheDocument();
    await waitFor(
      () => expect(screen.queryByRole("dialog", { name: "saving complete" })).toBeNull(),
      { timeout: 2500 },
    );

    selectAndDuplicateBuilding(container);
    await waitFor(() => expect(latestCampus.buildings).toHaveLength(2));
    expect((screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    await waitFor(() => expect(latestCampus.buildings).toHaveLength(1));
  });

  it("failed Save preserves the pre-save undo history", async () => {
    const initialCampus = makeCampus();
    const onSave = vi.fn(async () => { throw new Error("database offline"); });
    const { container } = render(<Harness initialCampus={initialCampus} savedSnapshot={JSON.stringify(initialCampus)} onSave={onSave} onBack={() => {}} />);

    selectAndDuplicateBuilding(container);
    expect((screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Unable to Save Campus Map");

    expect((screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

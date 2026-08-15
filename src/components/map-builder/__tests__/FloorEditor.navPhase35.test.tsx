import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useCallback, useState } from "react";
import { FloorEditor } from "../FloorEditor";
import type { Campus } from "../types";

// ── B5 Phase 3.1.4 — Floor Save Sync (remount-surviving dirty) + tab overflow UX ──
//
// The real page re-keys the floor view by floorId (`viewKey = floor-${campusId}-${floorId}`),
// so switching to a freshly added floor REMOUNTS FloorEditor. The 3.1.3 in-component
// structure baseline was state — a remount re-initialized it from the CURRENT campus and
// wiped the unsaved structure change (inner Save disabled, outer Save enabled). The fix
// derives the structure dirty from the page's persisted `savedSnapshot` prop instead.

function makeBaseCampus(): Campus {
  return {
    id: "c1", name: "Test Campus", code: "TC", description: "", address: "", city: "",
    province: "", postalCode: "", status: "active", publishStatus: "draft", visibleToStudents: false,
    features: { indoorNavigation: true, accessibilityNavigation: true, emergencyRoutes: true, issueReporting: true },
    canvasW: 220, canvasH: 160,
    settings: { accessibility: true, emergency: true, eventLayer: true, gps: true },
    buildings: [
      {
        id: "b1", name: "Main Building", code: "MB", category: "Academic", description: "",
        x: 100, y: 100, width: 120, height: 80, color: "#0e2a6e",
        floors: [
          { id: "f1", buildingId: "b1", number: 1, label: "Ground Floor", canvasW: 220, canvasH: 160, rooms: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [], paths: [] },
        ],
      },
    ],
    markers: [], paths: [], navNodes: [], navEdges: [], createdAt: "2026-01-01", updatedAt: "2026-01-01",
  };
}

/** Adds N floors with sequential ids/numbers so the tab strip overflows. */
function campusWithManyFloors(count: number): Campus {
  const campus = makeBaseCampus();
  const first = campus.buildings[0].floors[0];
  campus.buildings[0].floors = [first, ...Array.from({ length: count - 1 }, (_, i) => ({
    id: `f${i + 2}`, buildingId: "b1", number: i + 2, label: `Floor ${i + 2}`,
    canvasW: 220, canvasH: 160, rooms: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [], paths: [],
  }))];
  return campus;
}

const STAIR = { id: "s1", x: 40, y: 30, width: 20, height: 16, rotation: 0, direction: "both", label: "Stairs" };
const STAIR_CX = STAIR.x + STAIR.width / 2; // 50
const STAIR_CY = STAIR.y + STAIR.height / 2; // 38

function campusWithStair(): Campus {
  const campus = makeBaseCampus();
  campus.buildings[0].floors[0] = { ...campus.buildings[0].floors[0], stairs: [STAIR] };
  return campus;
}

/**
 * Page-like harness: mirrors AdminMapBuilderPage — onSwitchFloor changes floorId (forcing
 * a remount via key, exactly like the page's viewKey), onUpdate replaces the campus, and
 * a successful save updates the persisted snapshot. All three are needed to reproduce the
 * manual QA scenario (Add Floor → remount → inner Save must stay enabled).
 */
function PageHarness({ initialCampus, onSave }: { initialCampus: Campus; onSave?: (c: Campus) => Promise<Campus> }) {
  const [campus, setCampus] = useState(initialCampus);
  const [floorId, setFloorId] = useState(initialCampus.buildings[0].floors[0].id);
  const [snapshot, setSnapshot] = useState<string | undefined>(JSON.stringify(initialCampus));
  const save = useCallback(async (c: Campus) => {
    const saved = onSave ? await onSave(c) : c;
    setSnapshot(JSON.stringify(saved));
    setCampus(saved);
    return saved;
  }, [onSave]);
  return (
    <FloorEditor
      key={floorId}
      campus={campus}
      buildingId="b1"
      floorId={floorId}
      onBack={() => {}}
      onSwitchFloor={setFloorId}
      onUpdate={setCampus}
      onSave={save}
      savedSnapshot={snapshot}
    />
  );
}

function stubSvgRect(container: HTMLElement, w = 220, h = 160): SVGSVGElement {
  const svg = Array.from(container.querySelectorAll("svg")).find(
    (s) => s.getAttribute("viewBox") === `0 0 ${w} ${h}`
  ) as SVGSVGElement;
  Object.defineProperty(svg, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ left: 0, top: 0, right: w, bottom: h, width: w, height: h, x: 0, y: 0, toJSON: () => ({}) }),
  });
  Object.defineProperty(svg.viewBox, "baseVal", {
    configurable: true,
    value: { width: w, height: h, x: 0, y: 0 },
  });
  Object.defineProperty(svg.parentElement, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ left: 0, top: 0, right: w, bottom: h, width: w, height: h, x: 0, y: 0, toJSON: () => ({}) }),
  });
  return svg;
}

function saveButton(): HTMLButtonElement {
  return screen.getByTitle(/save floor draft changes|no floor changes to save/i) as HTMLButtonElement;
}

function latestCampus(onUpdate: ReturnType<typeof vi.fn>): Campus {
  const calls = onUpdate.mock.calls;
  return calls[calls.length - 1][0] as Campus;
}

describe("B5 Phase 3.1.4 — Floor Save Sync (remount-surviving structure dirty)", () => {
  afterEach(() => cleanup());

  it("Add Floor keeps FloorEditor Save ENABLED after the page remounts on the floor switch", async () => {
    const { container } = render(<PageHarness initialCampus={makeBaseCampus()} />);
    stubSvgRect(container);
    expect(saveButton()).toHaveProperty("disabled", true);

    // The page switches floorId → key changes → FloorEditor remounts with the
    // new 2-floor campus but the OLD (1-floor) persisted snapshot.
    fireEvent.click(screen.getByRole("button", { name: "Add Floor" }));

    await waitFor(() => expect(saveButton()).toHaveProperty("disabled", false));
    // The new floor is now ACTIVE after the page remount — its label is shown
    // in the floor selector button (this design has no separate tab strip).
    expect(screen.getByRole("button", { name: "Select floor" }).textContent).toContain("Floor 2");
  });

  it("Save after Add Floor persists once and DISABLES the inner Save again", async () => {
    const onSave = vi.fn(async (c: Campus) => c);
    const { container } = render(<PageHarness initialCampus={makeBaseCampus()} onSave={onSave} />);
    stubSvgRect(container);

    fireEvent.click(screen.getByRole("button", { name: "Add Floor" }));
    await waitFor(() => expect(saveButton()).toHaveProperty("disabled", false));

    fireEvent.click(saveButton());
    await waitFor(() => expect(saveButton()).toHaveProperty("disabled", true));
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0] as Campus;
    expect(saved.buildings[0].floors).toHaveLength(2);
    expect(new Set(saved.buildings[0].floors.map((f) => f.number)).size).toBe(2);
  });

  it("Save → Add Floor → Save again: structure dirty re-arms after each remount", async () => {
    const onSave = vi.fn(async (c: Campus) => c);
    const { container } = render(<PageHarness initialCampus={makeBaseCampus()} onSave={onSave} />);
    stubSvgRect(container);

    // First add + save → clean.
    fireEvent.click(screen.getByRole("button", { name: "Add Floor" }));
    await waitFor(() => expect(saveButton()).toHaveProperty("disabled", false));
    fireEvent.click(saveButton());
    await waitFor(() => expect(saveButton()).toHaveProperty("disabled", true));

    // Second add (remount onto Floor 3) → dirty again.
    fireEvent.click(screen.getByRole("button", { name: "Add Floor" }));
    await waitFor(() => expect(saveButton()).toHaveProperty("disabled", false));
    fireEvent.click(saveButton());
    await waitFor(() => expect(saveButton()).toHaveProperty("disabled", true));
    expect(onSave).toHaveBeenCalledTimes(2);
    expect((onSave.mock.calls[1][0] as Campus).buildings[0].floors).toHaveLength(3);
  });
});

describe("B5 Phase 3.1.4 — physical floor object changes enable Save and persist", () => {
  afterEach(() => cleanup());

  function selectStair(container: HTMLElement) {
    const stair = Array.from(container.querySelectorAll("g[data-floor-title]")).find(
      (el) => el.getAttribute("data-floor-title") === "Stairs"
    ) as SVGGElement | undefined;
    fireEvent.mouseDown(stair!, { clientX: STAIR_CX, clientY: STAIR_CY, bubbles: true });
  }

  function dragStair(container: HTMLElement) {
    const svg = Array.from(container.querySelectorAll("svg")).find(
      (s) => s.getAttribute("viewBox") === "0 0 220 160"
    ) as SVGSVGElement;
    selectStair(container);
    fireEvent.mouseMove(svg, { clientX: STAIR_CX + 20, clientY: STAIR_CY + 20, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
  }

  it("editing an existing Stair enables Save and the save payload retains the moved object", async () => {
    const onSave = vi.fn(async (c: Campus) => c);
    const { container } = render(<PageHarness initialCampus={campusWithStair()} onSave={onSave} />);
    stubSvgRect(container);
    expect(saveButton()).toHaveProperty("disabled", true);

    dragStair(container);
    expect(saveButton()).toHaveProperty("disabled", false);

    fireEvent.click(saveButton());
    await waitFor(() => expect(saveButton()).toHaveProperty("disabled", true));
    const saved = onSave.mock.calls[0][0] as Campus;
    const stairs = saved.buildings[0].floors[0].stairs;
    expect(stairs).toHaveLength(1);
    // The stair moved (original x=40) — the payload carries the edited geometry.
    expect(stairs[0].x).not.toBe(40);
  });

  it("after Save, a further Stair edit re-enables Save (no stale clean state)", async () => {
    const onSave = vi.fn(async (c: Campus) => c);
    const { container } = render(<PageHarness initialCampus={campusWithStair()} onSave={onSave} />);
    stubSvgRect(container);

    dragStair(container);
    fireEvent.click(saveButton());
    await waitFor(() => expect(saveButton()).toHaveProperty("disabled", true));

    dragStair(container);
    expect(saveButton()).toHaveProperty("disabled", false);
  });
});

describe("B5 Phase 3.1.4 — floor selector overflow + active-floor visibility", () => {
  afterEach(() => cleanup());

  it("with many floors, Add Floor (+) and Floor actions (…) stay pinned and reachable", () => {
    const { container } = render(<PageHarness initialCampus={campusWithManyFloors(12)} />);
    stubSvgRect(container);

    // The floor selector region is BOUNDED (flex-grow with min/max widths) so it
    // can never push the pinned controls off-screen; the header row itself does
    // not scroll horizontally.
    const bar = container.querySelector("[data-testid='floor-tab-bar']") as HTMLElement;
    expect(bar).toBeTruthy();
    expect(bar.className).toContain("min-w-");
    expect(bar.className).toContain("flex-[");
    expect(bar.className).toContain("max-w-");
    expect(bar.parentElement?.className.includes("overflow")).toBe(false);

    // Pinned controls are present and NOT hidden inside the selector button.
    const selectButton = screen.getByRole("button", { name: "Select floor" });
    const addFloor = screen.getByRole("button", { name: "Add Floor" });
    const floorActions = screen.getByRole("button", { name: "Floor actions" });
    expect(bar.contains(addFloor)).toBe(true);
    expect(bar.contains(floorActions)).toBe(true);
    expect(selectButton.contains(addFloor)).toBe(false);
    expect(selectButton.contains(floorActions)).toBe(false);

    // All 12 floors remain reachable from the selector popover.
    fireEvent.click(selectButton);
    expect(within(screen.getByTestId("floor-selector-popover")).queryAllByRole("option")).toHaveLength(12);
  });

  it("the ACTIVE floor is always visible in the selector button, including after a switch", () => {
    const { container } = render(<PageHarness initialCampus={campusWithManyFloors(12)} />);
    stubSvgRect(container);

    const selectButton = screen.getByRole("button", { name: "Select floor" });
    expect(selectButton.textContent).toContain("Ground Floor");

    // Switching floors through the popover updates the button (page remount).
    fireEvent.click(selectButton);
    fireEvent.click(within(screen.getByTestId("floor-selector-popover")).getByRole("option", { name: /Floor 12/ }));
    expect(screen.getByRole("button", { name: "Select floor" }).textContent).toContain("Floor 12");
  });

  it("long floor labels truncate without breaking the header layout", () => {
    const campus = makeBaseCampus();
    campus.buildings[0].floors[0].label = "A Very Long Floor Name That Should Not Overflow The Header";
    const { container } = render(<PageHarness initialCampus={campus} />);
    stubSvgRect(container);

    const selectButton = screen.getByRole("button", { name: "Select floor" });
    expect(selectButton.querySelector("span")?.className).toContain("truncate");
    expect(selectButton.getAttribute("title")).toContain("A Very Long Floor Name");
  });
});

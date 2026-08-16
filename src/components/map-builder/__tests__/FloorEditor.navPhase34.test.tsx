import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { FloorEditor } from "../FloorEditor";
import type { Campus } from "../types";

// ── B5 Phase 3.1.3 — Add Floor must mark the campus structure dirty ──

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

function Harness({ onCampusChange, onSave, initialCampus = makeBaseCampus() }: {
  onCampusChange?: (c: Campus) => void;
  onSave?: (c: Campus) => Promise<Campus>;
  initialCampus?: Campus;
}) {
  const [campus, setCampus] = useState<Campus>(initialCampus);
  return (
    <FloorEditor
      campus={campus}
      buildingId="b1"
      floorId="f1"
      onBack={() => {}}
      onSwitchFloor={() => {}}
      onUpdate={(c) => { onCampusChange?.(c); setCampus(c); }}
      onSave={onSave ?? (async (c) => c)}
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

function latestCampus(onCampusChange: ReturnType<typeof vi.fn>): Campus {
  const calls = onCampusChange.mock.calls;
  return calls[calls.length - 1][0] as Campus;
}

const STAIR = { id: "s1", x: 40, y: 30, width: 20, height: 16, rotation: 0, direction: "both", label: "Stairs" };
const STAIR_CX = STAIR.x + STAIR.width / 2; // 50
const STAIR_CY = STAIR.y + STAIR.height / 2; // 38

function campusWithStair(): Campus {
  const campus = makeBaseCampus();
  campus.buildings[0].floors[0] = {
    ...campus.buildings[0].floors[0], stairs: [STAIR],
  };
  return campus;
}

function selectStair(container: HTMLElement) {
  const stair = Array.from(container.querySelectorAll("g[data-floor-title]")).find(
    (el) => el.getAttribute("data-floor-title") === "Stairs"
  ) as SVGGElement | undefined;
  fireEvent.mouseDown(stair!, { clientX: STAIR_CX, clientY: STAIR_CY, bubbles: true });
}

/** Selects the stair AND drags it — makes the floor dirty (one committed gesture). */
function dragStair(container: HTMLElement) {
  const svg = Array.from(container.querySelectorAll("svg")).find(
    (s) => s.getAttribute("viewBox") === "0 0 220 160"
  ) as SVGSVGElement;
  selectStair(container);
  fireEvent.mouseMove(svg, { clientX: STAIR_CX + 20, clientY: STAIR_CY + 20, bubbles: true });
  fireEvent.mouseUp(svg, { bubbles: true });
}

/** The Save toolbar button — title tracks the dirty state, so it is unambiguous. */
function saveButton(): HTMLButtonElement {
  return screen.getByTitle(/save floor draft changes|no floor changes to save/i) as HTMLButtonElement;
}

describe("B5 Phase 3.1.3 — Add Floor marks structure dirty / enables Save", () => {
  afterEach(() => cleanup());

  it("Add Floor on a clean floor enables the Save button (structure change)", () => {
    const onCampusChange = vi.fn();
    const { container } = render(<Harness initialCampus={makeBaseCampus()} onCampusChange={onCampusChange} />);
    stubSvgRect(container);
    expect(saveButton()).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByRole("button", { name: "Add Floor" }));

    const floors = latestCampus(onCampusChange).buildings[0].floors;
    expect(floors).toHaveLength(2);
    expect(saveButton()).toHaveProperty("disabled", false);
  });

  it("Save after Add Floor persists the new floor once and clears the dirty state", async () => {
    const onCampusChange = vi.fn();
    const onSave = vi.fn(async (c: Campus) => c);
    const { container } = render(<Harness initialCampus={makeBaseCampus()} onCampusChange={onCampusChange} onSave={onSave} />);
    stubSvgRect(container);

    fireEvent.click(screen.getByRole("button", { name: "Add Floor" }));
    expect(saveButton()).toHaveProperty("disabled", false);

    fireEvent.click(saveButton());

    await waitFor(() => expect(saveButton()).toHaveProperty("disabled", true));
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0] as Campus;
    expect(saved.buildings[0].floors).toHaveLength(2);
    expect(latestCampus(onCampusChange).buildings[0].floors).toHaveLength(2);
  });

  it("Save then Add Floor enables Save again (a NEW dirty state is created)", async () => {
    const onCampusChange = vi.fn();
    const onSave = vi.fn(async (c: Campus) => c);
    const { container } = render(<Harness initialCampus={makeBaseCampus()} onCampusChange={onCampusChange} onSave={onSave} />);
    stubSvgRect(container);

    // First add + save → clean.
    fireEvent.click(screen.getByRole("button", { name: "Add Floor" }));
    fireEvent.click(saveButton());
    await waitFor(() => expect(saveButton()).toHaveProperty("disabled", true));
    expect(latestCampus(onCampusChange).buildings[0].floors).toHaveLength(2);

    // Second add → dirty again, Save enabled.
    fireEvent.click(screen.getByRole("button", { name: "Add Floor" }));
    expect(latestCampus(onCampusChange).buildings[0].floors).toHaveLength(3);
    expect(saveButton()).toHaveProperty("disabled", false);
  });

  it("Discard previous floor edits then Add Floor still enables Save (new structure dirty)", async () => {
    const onCampusChange = vi.fn();
    const { container } = render(<Harness initialCampus={campusWithStair()} onCampusChange={onCampusChange} />);
    stubSvgRect(container);

    // Make the current floor dirty.
    dragStair(container);
    expect(onCampusChange).toHaveBeenCalled();

    // Add Floor while dirty → Save/Discard dialog.
    fireEvent.click(screen.getByRole("button", { name: "Add Floor" }));
    expect(screen.getByText("Unsaved Floor Changes")).toBeInTheDocument();

    // Discard the content edits — the new floor is still added and dirty.
    fireEvent.click(screen.getByRole("button", { name: "Discard Changes" }));

    await waitFor(() => {
      expect(screen.queryByText("Unsaved Floor Changes")).toBeNull();
      expect(latestCampus(onCampusChange).buildings[0].floors).toHaveLength(2);
    });
    expect(saveButton()).toHaveProperty("disabled", false);
  });

  it("repeated Save never duplicates the new floor", async () => {
    const onCampusChange = vi.fn();
    const onSave = vi.fn(async (c: Campus) => c);
    const { container } = render(<Harness initialCampus={campusWithStair()} onCampusChange={onCampusChange} onSave={onSave} />);
    stubSvgRect(container);

    fireEvent.click(screen.getByRole("button", { name: "Add Floor" }));
    fireEvent.click(saveButton());
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(saveButton()).toHaveProperty("disabled", true));

    // Second save while clean is a no-op (button disabled → no extra call).
    fireEvent.click(saveButton());
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(latestCampus(onCampusChange).buildings[0].floors).toHaveLength(2);

    // Dirty it again and save — still exactly two unique-number floors.
    dragStair(container);
    expect(saveButton()).toHaveProperty("disabled", false);
    fireEvent.click(saveButton());
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    const floors = latestCampus(onCampusChange).buildings[0].floors;
    expect(floors).toHaveLength(2);
    expect(new Set(floors.map((f) => f.number)).size).toBe(2);
  });
});

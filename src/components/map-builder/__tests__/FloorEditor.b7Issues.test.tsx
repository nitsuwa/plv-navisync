import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, act, within } from "@testing-library/react";
import { toast } from "sonner";
import { useState } from "react";
import { FloorEditor } from "../FloorEditor";
import type { Campus, FloorRoom, FloorPlan } from "../types";

// ── B7 Phase 1 — Floor Issues panel consistency + on-canvas markers ───────
// The Floor Editor Issues panel must equal the canonical campus validation
// list filtered to the CURRENT floor (plus its own local live checks), and
// affected objects must carry ONE small restrained marker that disappears the
// moment the issue is fixed.

function floor(overrides: Partial<FloorPlan> & { id: string; number: number; label: string; rooms?: FloorRoom[] }): FloorPlan {
  return {
    id: overrides.id,
    buildingId: "b1",
    number: overrides.number,
    label: overrides.label,
    rooms: overrides.rooms ?? [],
    paths: [],
    walls: [],
    doors: [],
    windows: [],
    furniture: [],
    stairs: [],
    ramps: [],
    elevators: [],
    labels: [],
    canvasW: 600,
    canvasH: 450,
    ...overrides,
  };
}

function room(overrides: Partial<FloorRoom> & { id: string; name: string }): FloorRoom {
  return {
    type: "classroom",
    x: 20,
    y: 20,
    w: 40,
    h: 30,
    floorId: "f1",
    buildingId: "b1",
    ...overrides,
  };
}

function makeCampus(floors: FloorPlan[], navNodes: Campus["navNodes"] = [], navEdges: Campus["navEdges"] = []): Campus {
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
      floors,
      entrances: [{ id: "e1", buildingId: "b1", edge: "bottom", offset: 0.5, type: "general", isPrimary: true }],
    }],
    markers: [],
    paths: [],
    navNodes,
    navEdges,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
}

let applyFixRef: ((c: Campus) => void) | null = null;

function Harness({ campus, floorId = "f1", initialSelection }: { campus: Campus; floorId?: string; initialSelection?: Parameters<typeof FloorEditor>[0]["initialSelection"] }) {
  const [state, setState] = useState<Campus>(campus);
  applyFixRef = setState;
  return (
    <FloorEditor
      campus={state}
      buildingId="b1"
      floorId={floorId}
      initialSelection={initialSelection}
      onBack={() => {}}
      onSwitchFloor={() => {}}
      onUpdate={setState}
      onSave={async () => state}
    />
  );
}

let warningSpy: ReturnType<typeof vi.spyOn>;
let infoSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warningSpy = vi.spyOn(toast, "warning").mockImplementation(() => "" as never);
  infoSpy = vi.spyOn(toast, "info").mockImplementation(() => "" as never);
});

afterEach(() => {
  cleanup();
  warningSpy.mockRestore();
  infoSpy.mockRestore();
  applyFixRef = null;
});

function issuesCount(): string {
  return screen.getByLabelText(/Issues:/).getAttribute("aria-label")!;
}

describe("FloorEditor Issues panel — canonical campus issues for the current floor (B7 Phase 1)", () => {
  it("shows duplicate_room_name in the current Floor Editor Issues panel", () => {
    const campus = makeCampus([
      floor({
        id: "f1", number: 1, label: "Ground Floor",
        rooms: [room({ id: "r1", name: "Room 201" }), room({ id: "r2", name: "room 201" })],
      }),
    ]);
    render(<Harness campus={campus} />);
    expect(issuesCount()).toBe("Issues: 1");
    act(() => { screen.getByTestId("issues-toolbar").click(); });
    expect(screen.getByText(/Room name .Room 201. is duplicated/i)).toBeTruthy();
  });

  it("renaming the duplicate removes it from the floor panel immediately (no save)", () => {
    const campus = makeCampus([
      floor({
        id: "f1", number: 1, label: "Ground Floor",
        rooms: [room({ id: "r1", name: "Room 201" }), room({ id: "r2", name: "room 201" })],
      }),
    ]);
    render(<Harness campus={campus} />);
    expect(issuesCount()).toBe("Issues: 1");

    const fixed: Campus = {
      ...campus,
      buildings: campus.buildings.map((b) => ({
        ...b,
        floors: b.floors.map((f) => ({
          ...f,
          rooms: f.rooms.map((r) => (r.id === "r2" ? { ...r, name: "Room 202" } : r)),
        })),
      })),
    };
    act(() => { applyFixRef!(fixed); });
    expect(issuesCount()).toBe("Issues: 0");
  });

  it("does NOT show an issue that belongs to another floor", () => {
    const campus = makeCampus([
      floor({ id: "f1", number: 1, label: "Ground Floor" }),
      floor({
        id: "f2", number: 2, label: "Second Floor",
        rooms: [room({ id: "r1", name: "Room 201", floorId: "f2" }), room({ id: "r2", name: "room 201", floorId: "f2" })],
      }),
    ]);
    const { unmount } = render(<Harness campus={campus} floorId="f1" />);
    expect(issuesCount()).toBe("Issues: 0");
    unmount();
    cleanup();
    render(<Harness campus={campus} floorId="f2" />);
    expect(issuesCount()).toBe("Issues: 1");
  });

  it("keeps FloorEditor-local live issues alongside canonical ones", () => {
    // A stair whose direction is invalid on the only floor would be a local
    // warning — but single-floor buildings are exempt, so instead use a room
    // pushed outside the canvas: a LOCAL floor-geometry error that must stay.
    const campus = makeCampus([
      floor({
        id: "f1", number: 1, label: "Ground Floor",
        rooms: [room({ id: "r1", name: "Room 201", x: 5000, y: 5000 })],
      }),
    ]);
    render(<Harness campus={campus} />);
    expect(issuesCount()).toBe("Issues: 1");
    act(() => { screen.getByTestId("issues-toolbar").click(); });
    expect(screen.getByText(/Room is outside the floor canvas/)).toBeTruthy();
  });
});

describe("FloorEditor on-canvas issue markers (B7 Phase 1)", () => {
  it("shows ONE warning marker on an emergency exit door without a nav link", () => {
    const campus = makeCampus([
      floor({
        id: "f1", number: 1, label: "Ground Floor",
        doors: [{ id: "d1", x: 100, y: 100, width: 8, direction: "left", color: "#000", isEmergencyExit: true }],
      }),
    ]);
    const { container } = render(<Harness campus={campus} />);
    const markers = container.querySelectorAll('[data-testid="issue-marker"]');
    expect(markers).toHaveLength(1);
    expect(markers[0].getAttribute("data-issue-object")).toBe("door:d1");
    expect(markers[0].getAttribute("data-issue-severity")).toBe("warning");
  });

  it("the marker disappears immediately after the door is linked to a nav node", () => {
    const campus = makeCampus(
      [
        floor({
          id: "f1", number: 1, label: "Ground Floor",
          doors: [{ id: "d1", x: 100, y: 100, width: 8, direction: "left", color: "#000", isEmergencyExit: true }],
        }),
      ],
      [
        { id: "door-node", name: "Exit", type: "room_access", x: 100, y: 100, buildingId: "b1", floorId: "f1", doorId: "d1", accessible: true, color: "#16a34a" },
        { id: "hall-node", name: "Hall", type: "hallway", x: 150, y: 100, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
      ],
      [{ id: "e1", startNodeId: "door-node", endNodeId: "hall-node", distance: 50, bidirectional: true, accessible: true, type: "walkway", color: "#16a34a", width: 3 }],
    );
    const { container } = render(<Harness campus={campus} />);
    expect(container.querySelectorAll('[data-testid="issue-marker"]')).toHaveLength(0);
    expect(issuesCount()).toBe("Issues: 0");
  });

  it("renders ONE marker per object even with multiple issues on the same door (error wins)", () => {
    const campus = makeCampus([
      floor({
        id: "f1", number: 1, label: "Ground Floor",
        // Emergency exit WITHOUT a nav link (canonical warning) AND pushed far
        // outside the canvas (local floor-geometry error).
        doors: [{ id: "d1", x: 5000, y: 5000, width: 8, direction: "left", color: "#000", isEmergencyExit: true }],
      }),
    ]);
    const { container } = render(<Harness campus={campus} />);
    const markers = container.querySelectorAll('[data-testid="issue-marker"]');
    expect(markers).toHaveLength(1);
    expect(markers[0].getAttribute("data-issue-object")).toBe("door:d1");
    // Worst severity wins: error, not warning.
    expect(markers[0].getAttribute("data-issue-severity")).toBe("error");
  });
});

describe("FloorEditor locate behavior (B7 Phase 1 — ping removed)", () => {
  it("locates a room without rendering a floating ping overlay", async () => {
    const campus = makeCampus([
      floor({
        id: "f1", number: 1, label: "Ground Floor",
        rooms: [room({ id: "r1", name: "Room 201", x: 20, y: 30, w: 40, h: 30 })],
      }),
    ]);
    render(<Harness campus={campus} initialSelection={{ type: "room", id: "r1" }} />);
    // Locate flash overlay should NOT render (removed in B7 correction)
    const flash = screen.queryByTestId("locate-flash");
    expect(flash).toBeNull();
  });

  it("locates a nav node without rendering a floating ping overlay", async () => {
    const campus = makeCampus(
      [floor({ id: "f1", number: 1, label: "Ground Floor" })],
      [{ id: "n1", name: "Waypoint", type: "hallway", x: 120, y: 80, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" }],
    );
    render(<Harness campus={campus} initialSelection={{ type: "navNode", id: "n1" }} />);
    // Locate flash overlay should NOT render (removed in B7 correction)
    const flash = screen.queryByTestId("locate-flash");
    expect(flash).toBeNull();
  });
});

describe("FloorEditor object issue guidance in Properties (B7 Phase 2)", () => {
  function duplicateRoomCampus(): Campus {
    return makeCampus([
      floor({
        id: "f1", number: 1, label: "Ground Floor",
        rooms: [room({ id: "r1", name: "Room 201" }), room({ id: "r2", name: "room 201" })],
      }),
    ]);
  }

  it("a selected room with a WARNING shows the contextual issue section near the top of its Properties", () => {
    render(<Harness campus={duplicateRoomCampus()} initialSelection={{ type: "room", id: "r2" }} />);
    const panel = screen.getByTestId("floor-properties-panel");
    const section = within(panel).queryByTestId("object-issue-section");
    expect(section).toBeTruthy();
    expect(section!.getAttribute("data-severity")).toBe("warning");
    expect(section!.textContent).toContain("Needs attention");
    expect(section!.textContent).toContain('Room name "room 201" is duplicated');
  });

  it("correcting the object removes the contextual issue immediately", () => {
    render(<Harness campus={duplicateRoomCampus()} initialSelection={{ type: "room", id: "r2" }} />);
    expect(within(screen.getByTestId("floor-properties-panel")).queryByTestId("object-issue-section")).toBeTruthy();

    const fixed: Campus = {
      ...duplicateRoomCampus(),
      buildings: duplicateRoomCampus().buildings.map((b) => ({
        ...b,
        floors: b.floors.map((f) => ({
          ...f,
          rooms: f.rooms.map((r) => (r.id === "r2" ? { ...r, name: "Room 202" } : r)),
        })),
      })),
    };
    act(() => { applyFixRef!(fixed); });
    expect(within(screen.getByTestId("floor-properties-panel")).queryByTestId("object-issue-section")).toBeNull();
  });

  it("an object with no issue shows NO empty issue section", () => {
    // r1 is the FIRST occurrence — the duplicate warning targets r2 only.
    render(<Harness campus={duplicateRoomCampus()} initialSelection={{ type: "room", id: "r1" }} />);
    expect(within(screen.getByTestId("floor-properties-panel")).queryByTestId("object-issue-section")).toBeNull();
  });

  it("a selected nav node with an ERROR shows all unique applicable issues with error styling", () => {
    // Two hallway nodes joined by a floor_transition edge: the transition
    // starts from a non-transition node (ERROR on hall-a) and is missing a
    // shared transition ID (WARNING on hall-a). Both must appear; error wins.
    const campus = makeCampus(
      [floor({ id: "f1", number: 1, label: "Ground Floor" })],
      [
        { id: "hall-a", name: "Hall A", type: "hallway", x: 100, y: 100, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
        { id: "hall-b", name: "Hall B", type: "hallway", x: 200, y: 100, buildingId: "b1", floorId: "f1", accessible: true, color: "#16a34a" },
      ],
      [{ id: "t1", startNodeId: "hall-a", endNodeId: "hall-b", distance: 100, bidirectional: true, accessible: true, type: "floor_transition", color: "#16a34a", width: 3 }],
    );
    render(<Harness campus={campus} initialSelection={{ type: "navNode", id: "hall-a" }} />);
    const panel = screen.getByTestId("floor-nav-node-props");
    const section = within(panel).queryByTestId("object-issue-section");
    expect(section).toBeTruthy();
    expect(section!.getAttribute("data-severity")).toBe("error");
    expect(section!.textContent).toContain("starts from a non-transition node");
    expect(section!.textContent).toContain("missing a shared transition ID");
  });
});

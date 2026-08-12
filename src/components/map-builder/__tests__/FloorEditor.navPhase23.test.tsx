import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { toast } from "sonner";
import { useState } from "react";
import { FloorEditor } from "../FloorEditor";
import { linkedPlacementBlockAt, roomLinkedCuePosition } from "../../../lib/indoorNavigationGraph";
import type { Campus, FloorRoom } from "../types";

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeBaseCampus(): Campus {
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
            canvasW: 220,
            canvasH: 160,
            rooms: [],
            walls: [],
            doors: [],
            windows: [],
            furniture: [],
            stairs: [],
            ramps: [],
            elevators: [],
            labels: [],
            paths: [],
          },
        ],
      },
    ],
    markers: [],
    paths: [],
    navNodes: [],
    navEdges: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
}

const TEST_ROOM: FloorRoom = { id: "r1", name: "Lecture Hall", type: "classroom", x: 20, y: 20, w: 50, h: 40, floorId: "f1", buildingId: "b1" };

function withRoom(campus: Campus): Campus {
  const next = structuredClone(campus);
  next.buildings[0].floors[0].rooms = [TEST_ROOM];
  return next;
}

function withWallAndDoor(campus: Campus): Campus {
  const next = structuredClone(campus);
  next.buildings[0].floors[0].walls = [
    { id: "w1", x1: 40, y1: 70, x2: 140, y2: 70, thickness: 6, color: "#64748b", material: "concrete" },
  ];
  next.buildings[0].floors[0].doors = [
    { id: "d1", x: 90, y: 70, width: 24, direction: "left", color: "#b45309", wallId: "w1", offset: 0.5 },
  ];
  return next;
}

function withCirculation(campus: Campus): Campus {
  const next = structuredClone(campus);
  next.buildings[0].floors[0].stairs = [{ id: "st1", x: 10, y: 120, width: 20, height: 16, direction: "both", label: "Stairs" }];
  next.buildings[0].floors[0].elevators = [{ id: "ev1", x: 120, y: 120, width: 16, height: 16, doorWidth: 6, label: "Elevator", accessible: true }];
  next.buildings[0].floors[0].ramps = [{ id: "rmp1", x: 170, y: 20, width: 24, height: 12, label: "Ramp", direction: "both", handrails: true, slope: "gentle", accessible: true }];
  return next;
}

// ── Harness ──────────────────────────────────────────────────────────────────

function Harness({ onCampusChange, initialCampus = makeBaseCampus() }: {
  onCampusChange?: (c: Campus) => void;
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
      onSave={async () => campus}
    />
  );
}

// ── Canvas helpers (1:1 viewBox mapping like the other floor tests) ─────────

function canvasSvg(container: HTMLElement, w = 220, h = 160): SVGSVGElement {
  const svg = Array.from(container.querySelectorAll("svg")).find(
    (s) => s.getAttribute("viewBox") === `0 0 ${w} ${h}`
  );
  expect(svg).toBeTruthy();
  return svg as SVGSVGElement;
}

function stubSvgRect(container: HTMLElement, w = 220, h = 160): SVGSVGElement {
  const svg = canvasSvg(container, w, h);
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

function enterNavigationMode() {
  fireEvent.click(screen.getByRole("tab", { name: "Navigation" }));
}

function clickCanvas(container: HTMLElement, x: number, y: number) {
  const svg = stubSvgRect(container);
  fireEvent.mouseDown(svg, { clientX: x, clientY: y, bubbles: true });
  fireEvent.mouseUp(svg, { bubbles: true });
  return svg;
}

function navNodes(container: HTMLElement): SVGGElement[] {
  return Array.from(container.querySelectorAll('[data-testid="nav-node"]')) as SVGGElement[];
}

function navLinkedNodes(container: HTMLElement): SVGGElement[] {
  return Array.from(container.querySelectorAll('[data-testid="nav-linked-node"]')) as SVGGElement[];
}

function navEdges(container: HTMLElement): SVGLineElement[] {
  return Array.from(container.querySelectorAll('[data-testid="nav-edge"], [data-testid="nav-edge-selected"]')) as SVGLineElement[];
}

function latestCampus(onCampusChange: ReturnType<typeof vi.fn>): Campus {
  const calls = onCampusChange.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][0] as Campus;
}

function nodeAt(container: HTMLElement, x: number, y: number): SVGGElement {
  const g = navNodes(container).find((el) => {
    const hit = el.querySelector('[data-testid="nav-node-hit"]') as SVGCircleElement | null;
    return hit && Number(hit.getAttribute("cx")) === x && Number(hit.getAttribute("cy")) === y;
  });
  expect(g, `node at ${x},${y}`).toBeTruthy();
  return g!;
}

function placeWaypoint(container: HTMLElement, x: number, y: number) {
  fireEvent.click(screen.getByTestId("nav-library-waypoint"));
  clickCanvas(container, x, y);
}

function linkRoom(container: HTMLElement) {
  fireEvent.click(screen.getByTestId("nav-library-link"));
  clickCanvas(container, 45, 40);
}

function dragDataTransfer() {
  return { setData: vi.fn(), effectAllowed: "copy", dropEffect: "copy" };
}

function fireDrag(type: "dragstart" | "dragover" | "drop", el: Element, x: number, y: number, dt: object) {
  const ev =
    type === "dragstart"
      ? createEvent.dragStart(el, { dataTransfer: dt })
      : type === "dragover"
        ? createEvent.dragOver(el, { dataTransfer: dt })
        : createEvent.drop(el, { dataTransfer: dt });
  Object.defineProperty(ev, "clientX", { configurable: true, value: x });
  Object.defineProperty(ev, "clientY", { configurable: true, value: y });
  fireEvent(el, ev as Event);
  return ev;
}

// ── Suite ────────────────────────────────────────────────────────────────────

describe("B5 Phase 2.3 — Indoor Navigation Multi-Select + Placement Rules + Circulation Visual Polish", () => {
  let onCampusChange: ReturnType<typeof vi.fn>;
  let container: HTMLElement;
  // Sonner's <Toaster /> does not mount its portal in jsdom, so toasts are
  // asserted by spying on the sonner API the app calls through useToast.
  let toastInfoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => window.setTimeout(() => cb(performance.now()), 0));
    vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
    toastInfoSpy = vi.spyOn(toast, "info").mockImplementation(() => "" as never);
    onCampusChange = vi.fn();
    const rendered = render(<Harness onCampusChange={onCampusChange} />);
    container = rendered.container;
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function expectInfoToast(message: string) {
    expect(toastInfoSpy.mock.calls.some((call) => String(call[0]).includes(message))).toBe(true);
  }

  // ── PURE PLACEMENT RULES ──

  it("pure helper: free placement is blocked on Door / Stairs / Elevator / Ramp and the Room center zone", () => {
    const campus = withCirculation(withWallAndDoor(withRoom(makeBaseCampus())));
    const { rooms, doors, stairs, elevators, ramps } = campus.buildings[0].floors[0];
    expect(linkedPlacementBlockAt({ x: 90, y: 70 }, rooms, doors, stairs, elevators, ramps)).toBe("door");
    expect(linkedPlacementBlockAt({ x: 20, y: 128 }, rooms, doors, stairs, elevators, ramps)).toBe("stairs");
    expect(linkedPlacementBlockAt({ x: 128, y: 128 }, rooms, doors, stairs, elevators, ramps)).toBe("elevator");
    expect(linkedPlacementBlockAt({ x: 182, y: 26 }, rooms, doors, stairs, elevators, ramps)).toBe("ramp");
    // Room center (semantic target / label zone) blocks free placement…
    expect(linkedPlacementBlockAt({ x: 45, y: 40 }, rooms, doors, stairs, elevators, ramps)).toBe("room");
    // …but the interior of a large room away from the label zone stays free space.
    expect(linkedPlacementBlockAt({ x: 60, y: 30 }, rooms, doors, stairs, elevators, ramps)).toBeNull();
    expect(linkedPlacementBlockAt({ x: 150, y: 130 }, rooms, doors, stairs, elevators, ramps)).toBeNull();
  });

  it("pure helper: room-linked cue position is offset from the room center (never over the label)", () => {
    const pos = roomLinkedCuePosition(TEST_ROOM);
    // Room center is (45,40); the cue must sit above it inside the room bounds.
    expect(pos.x).toBe(45);
    expect(pos.y).toBeLessThan(40);
    expect(pos.y).toBeGreaterThanOrEqual(TEST_ROOM.y);
  });

  // ── PLACEMENT: FREE WAYPOINT / DESTINATION ──

  it("Add Waypoint on a Door is rejected with Link Location guidance and no mutation", () => {
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withWallAndDoor(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    stubSvgRect(container);
    const callsBefore = onCampusChange.mock.calls.length;
    fireEvent.click(screen.getByTestId("nav-library-waypoint"));
    clickCanvas(container, 90, 70); // on the door
    expectInfoToast("Use Link Location for this object");
    expect(onCampusChange.mock.calls.length).toBe(callsBefore);
    expect(navNodes(container)).toHaveLength(0);
    expect(navLinkedNodes(container)).toHaveLength(0);
  });

  it("Add Waypoint on the Room semantic target is rejected; open interior is allowed", () => {
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withRoom(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    stubSvgRect(container);
    // Room center → blocked.
    fireEvent.click(screen.getByTestId("nav-library-waypoint"));
    clickCanvas(container, 45, 40);
    expectInfoToast("Use Link Location for this object");
    expect(navNodes(container)).toHaveLength(0);
    // Open interior of the same large room (away from the label zone) → allowed.
    fireEvent.click(screen.getByTestId("nav-library-waypoint"));
    clickCanvas(container, 60, 30);
    expect(navNodes(container)).toHaveLength(1);
    expect(latestCampus(onCampusChange).navNodes.find((n) => n.x === 60 && n.y === 30)).toBeTruthy();
  });

  it("Destination tool on a Room semantic target is blocked with guidance; drag-drop drop rejects too", () => {
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withRoom(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    stubSvgRect(container);
    // Click-armed Destination tool.
    fireEvent.click(screen.getByTestId("nav-library-destination"));
    clickCanvas(container, 45, 40);
    expectInfoToast("Use Link Location for this object");
    expect(navNodes(container)).toHaveLength(0);
    // Drag-and-drop Waypoint onto the room center → rejected (no node).
    const dt = dragDataTransfer();
    fireDrag("dragstart", screen.getByTestId("nav-library-waypoint"), 0, 0, dt);
    const svg = stubSvgRect(container);
    fireDrag("dragover", svg, 45, 40, dt);
    fireDrag("drop", svg, 45, 40, dt);
    expect(navNodes(container)).toHaveLength(0);
    expect(navLinkedNodes(container)).toHaveLength(0);
  });

  // ── MULTI-SELECTION PRESERVATION ──

  it("clicking a member of a multi-selection preserves the group + multi Properties", () => {
    enterNavigationMode();
    placeWaypoint(container, 40, 40);
    placeWaypoint(container, 120, 80);
    const svg = stubSvgRect(container);
    // Shift-select both.
    fireEvent.mouseDown(nodeAt(container, 40, 40), { clientX: 40, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(nodeAt(container, 120, 80), { clientX: 120, clientY: 80, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.getByTestId("floor-nav-multi-props")).toBeTruthy();
    // Plain click on one member — the multi-selection must NOT collapse.
    fireEvent.mouseDown(nodeAt(container, 40, 40), { clientX: 40, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.getByTestId("floor-nav-multi-props")).toBeTruthy();
    expect(screen.queryByTestId("floor-nav-node-props")).toBeNull();
    expect(screen.getByText("2 waypoints selected")).toBeTruthy();
    // Clicking an UNRELATED node collapses to single-object editing.
    placeWaypoint(container, 180, 30);
    fireEvent.mouseDown(nodeAt(container, 180, 30), { clientX: 180, clientY: 30, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.getByTestId("floor-nav-node-props")).toBeTruthy();
    expect(screen.queryByTestId("floor-nav-multi-props")).toBeNull();
  });

  it("dragging a selected member moves the whole free group rigidly in ONE history action", () => {
    enterNavigationMode();
    placeWaypoint(container, 40, 40);
    placeWaypoint(container, 120, 80);
    const svg = stubSvgRect(container);
    // Shift-select both, then drag member A by +30/+20 — the group must follow.
    fireEvent.mouseDown(nodeAt(container, 40, 40), { clientX: 40, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(nodeAt(container, 120, 80), { clientX: 120, clientY: 80, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(nodeAt(container, 40, 40), { clientX: 40, clientY: 40, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 70, clientY: 60, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const after = latestCampus(onCampusChange);
    expect(after.navNodes.find((n) => n.x === 70 && n.y === 60)).toBeTruthy();
    expect(after.navNodes.find((n) => n.x === 150 && n.y === 100)).toBeTruthy();
    // Multi-selection Properties persist after the group move.
    expect(screen.getByTestId("floor-nav-multi-props")).toBeTruthy();
    // ONE history action — a single undo restores both.
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    const undone = latestCampus(onCampusChange);
    expect(undone.navNodes.find((n) => n.x === 40 && n.y === 40)).toBeTruthy();
    expect(undone.navNodes.find((n) => n.x === 120 && n.y === 80)).toBeTruthy();
  });

  it("mixed selection: free nodes move while linked locations stay attached (one toast)", () => {
    cleanup();
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={withRoom(makeBaseCampus())} />);
    container = rendered.container;
    enterNavigationMode();
    stubSvgRect(container);
    placeWaypoint(container, 40, 130);
    placeWaypoint(container, 120, 130);
    linkRoom(container);
    const svg = stubSvgRect(container);
    // Shift-select both free nodes + the linked room node.
    fireEvent.mouseDown(nodeAt(container, 40, 130), { clientX: 40, clientY: 130, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(nodeAt(container, 120, 130), { clientX: 120, clientY: 130, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(navLinkedNodes(container)[0], { clientX: 45, clientY: 40, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // Drag a free member — free nodes move, the linked node stays at its anchor.
    fireEvent.mouseDown(nodeAt(container, 40, 130), { clientX: 40, clientY: 130, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 60, clientY: 140, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    const after = latestCampus(onCampusChange);
    expect(after.navNodes.find((n) => n.type === "hallway" && n.x === 60)).toBeTruthy();
    const roomNode = after.navNodes.find((n) => n.roomId === "r1")!;
    expect(roomNode.x).toBe(45);
    expect(roomNode.y).toBe(30);
    expectInfoToast("Linked locations stay put");
  });

  // ── COPY / PASTE / DUPLICATE GROUP ──

  it("Ctrl+C / Ctrl+V / Ctrl+D preserve the multi-selected group (fresh ids, remapped edges)", () => {
    enterNavigationMode();
    placeWaypoint(container, 40, 40);
    placeWaypoint(container, 120, 80);
    const svg = stubSvgRect(container);
    // Connect A→B so edges get remapped on paste.
    fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
    fireEvent.mouseDown(nodeAt(container, 40, 40), { clientX: 40, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(nodeAt(container, 120, 80), { clientX: 120, clientY: 80, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    // Multi-select both.
    fireEvent.mouseDown(nodeAt(container, 40, 40), { clientX: 40, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(nodeAt(container, 120, 80), { clientX: 120, clientY: 80, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.keyDown(window, { key: "c", ctrlKey: true });
    fireEvent.keyDown(window, { key: "v", ctrlKey: true });
    let after = latestCampus(onCampusChange);
    expect(after.navNodes).toHaveLength(4);
    expect(after.navEdges).toHaveLength(2);
    // The pasted set stays multi-selected with the summary inspector.
    expect(screen.getByTestId("floor-nav-multi-props")).toBeTruthy();
    expect(screen.getByText("2 waypoints selected")).toBeTruthy();
    // Ctrl+D duplicates the pasted selection — still one action, still multi.
    fireEvent.keyDown(window, { key: "d", ctrlKey: true });
    after = latestCampus(onCampusChange);
    expect(after.navNodes).toHaveLength(6);
    // Every edge connects two nodes that both exist.
    for (const e of after.navEdges) {
      expect(after.navNodes.some((n) => n.id === e.startNodeId)).toBe(true);
      expect(after.navNodes.some((n) => n.id === e.endNodeId)).toBe(true);
    }
  });

  // ── REMOVE TOOL REGRESSION ──

  it("Remove tool on a group member removes only that node and keeps the rest selected", () => {
    enterNavigationMode();
    placeWaypoint(container, 40, 40);
    placeWaypoint(container, 120, 80);
    const svg = stubSvgRect(container);
    fireEvent.mouseDown(nodeAt(container, 40, 40), { clientX: 40, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    fireEvent.mouseDown(nodeAt(container, 120, 80), { clientX: 120, clientY: 80, shiftKey: true, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(screen.getByTestId("floor-nav-multi-props")).toBeTruthy();
    // Remove tool targets the clicked node only — the OTHER member stays selected.
    fireEvent.click(screen.getByRole("button", { name: /Remove/ }));
    fireEvent.mouseDown(nodeAt(container, 40, 40), { clientX: 40, clientY: 40, bubbles: true });
    fireEvent.mouseUp(svg, { bubbles: true });
    expect(latestCampus(onCampusChange).navNodes).toHaveLength(1);
    expect(latestCampus(onCampusChange).navNodes[0].x).toBe(120);
    // The remaining node is still selected and its properties panel is open.
    expect(screen.getByTestId("floor-nav-node-props")).toBeTruthy();
    expect(screen.queryByTestId("floor-nav-multi-props")).toBeNull();
  });

  // ── CIRCULATION VISUALS ──

  it("Stairs renders repeated treads + a centered directional arrow", () => {
    cleanup();
    const campus = withCirculation(makeBaseCampus());
    const rendered = render(<Harness initialCampus={campus} />);
    container = rendered.container;
    const stair = container.querySelector('[data-testid="stairs-symbol"]') as SVGGElement;
    expect(stair).toBeTruthy();
    expect(stair.querySelectorAll('[data-testid="stairs-tread"]').length).toBeGreaterThanOrEqual(3);
    const arrow = stair.querySelector('[data-testid="stairs-arrow"]') as SVGGElement | null;
    expect(arrow).toBeTruthy();
    // Arrow is centered on the stair object (translate to its center).
    const st = campus.buildings[0].floors[0].stairs[0];
    expect(arrow!.getAttribute("transform")).toContain(`translate(${st.x + st.width / 2} ${st.y + st.height / 2})`);
  });

  it("Elevator renders shaft frame + cab + centered door + symmetric chevrons", () => {
    cleanup();
    const campus = withCirculation(makeBaseCampus());
    const rendered = render(<Harness initialCampus={campus} />);
    container = rendered.container;
    const el = container.querySelector('[data-testid="elevator-symbol"]') as SVGGElement;
    expect(el).toBeTruthy();
    expect(el.querySelector('[data-testid="elevator-shaft"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="elevator-cab"]')).toBeTruthy();
    const door = el.querySelector('[data-testid="elevator-door"]') as SVGRectElement | null;
    expect(door).toBeTruthy();
    // The door is horizontally centered on the elevator.
    const ev = campus.buildings[0].floors[0].elevators[0];
    const cx = ev.x + ev.width / 2;
    expect(Number(door!.getAttribute("x")) + Number(door!.getAttribute("width")) / 2).toBeCloseTo(cx, 5);
    const chev = el.querySelector('[data-testid="elevator-chevrons"]') as SVGGElement | null;
    expect(chev).toBeTruthy();
    expect(chev!.getAttribute("transform")).toContain(`translate(${cx} ${ev.y + ev.height / 2})`);
  });

  it("Ramp renders a centered footprint with rails + directional arrow", () => {
    cleanup();
    const campus = withCirculation(makeBaseCampus());
    const rendered = render(<Harness initialCampus={campus} />);
    container = rendered.container;
    const ramp = container.querySelector('[data-testid="ramp-symbol"]') as SVGGElement;
    expect(ramp).toBeTruthy();
    // B5 Phase 2.5: simplified blue accessibility footprint + centered icon.
    expect(ramp.querySelector('[data-testid="ramp-blue-base"]')).toBeTruthy();
    const icon = ramp.querySelector('[data-testid="ramp-accessibility-icon"]') as SVGGElement | null;
    expect(icon).toBeTruthy();
    const rp = campus.buildings[0].floors[0].ramps[0];
    expect(icon!.getAttribute("transform")).toContain(`translate(${rp.x + rp.width / 2} ${rp.y + rp.height / 2})`);
  });

  it("rotation wraps the circulation symbols so internal geometry stays centered", () => {
    cleanup();
    const campus = withCirculation(makeBaseCampus());
    campus.buildings[0].floors[0].stairs[0].rotation = 90;
    campus.buildings[0].floors[0].elevators[0].rotation = 45;
    campus.buildings[0].floors[0].ramps[0].rotation = -30;
    const rendered = render(<Harness initialCampus={campus} />);
    container = rendered.container;
    const st = campus.buildings[0].floors[0].stairs[0];
    const stairWrap = container.querySelector('[data-testid="stairs-symbol"]') as SVGGElement;
    expect(stairWrap.getAttribute("transform")).toContain(`rotate(90, ${st.x + st.width / 2}, ${st.y + st.height / 2})`);
    const ev = campus.buildings[0].floors[0].elevators[0];
    const elWrap = container.querySelector('[data-testid="elevator-symbol"]') as SVGGElement;
    expect(elWrap.getAttribute("transform")).toContain(`rotate(45, ${ev.x + ev.width / 2}, ${ev.y + ev.height / 2})`);
    const rp = campus.buildings[0].floors[0].ramps[0];
    const rampWrap = container.querySelector('[data-testid="ramp-symbol"]') as SVGGElement;
    expect(rampWrap.getAttribute("transform")).toContain(`rotate(-30, ${rp.x + rp.width / 2}, ${rp.y + rp.height / 2})`);
  });

  it("circulation-linked cues stay small and never stack a big waypoint circle over the symbol", () => {
    cleanup();
    const campus = withCirculation(makeBaseCampus());
    const rendered = render(<Harness onCampusChange={onCampusChange} initialCampus={campus} />);
    container = rendered.container;
    enterNavigationMode();
    stubSvgRect(container);
    // Link the elevator; the cue must be a small badge, not a full-size node ring.
    fireEvent.click(screen.getByTestId("nav-library-link"));
    clickCanvas(container, 128, 128);
    const linked = navLinkedNodes(container)[0];
    expect(linked).toBeTruthy();
    const hit = linked.querySelector('[data-testid="nav-node-hit"]') as SVGCircleElement;
    expect(Number(hit.getAttribute("r"))).toBeLessThanOrEqual(11);
    // No stacked selection ring + badge simultaneously in the normal state.
    expect(linked.querySelectorAll('[data-testid="nav-node-selected"]')).toHaveLength(0);
    // The physical elevator symbol still exists (nothing was duplicated).
    expect(container.querySelector('[data-testid="elevator-symbol"]')).toBeTruthy();
  });
});

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { CampusEditor } from "../CampusEditor";
import type { Campus, NavigationNode } from "../types";
import { syncExteriorEmergencyStairGraph } from "../../../lib/exteriorEmergencyStairs";

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
      floors: [{ id: "f1", buildingId: "b1", number: 1, label: "Ground Floor", rooms: [], paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [] }],
    }],
    markers: [],
    paths: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
}

function Harness({ onCampusChange, initialCampus, onPreviewStudent }: { onCampusChange?: (c: Campus) => void; initialCampus?: Campus; onPreviewStudent?: (c: Campus, isDirty: boolean) => void }) {
  const [campus, setCampus] = useState<Campus>(() => initialCampus ?? makeCampus());
  return (
    <CampusEditor
      campus={campus}
      onBack={() => {}}
      onUpdate={(c) => { onCampusChange?.(c); setCampus(c); }}
      onPublish={() => {}}
      onOpenFloor={() => {}}
      onAddBuilding={() => {}}
      onPreviewStudent={onPreviewStudent}
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
  it("uses one Review & Publish lifecycle action", () => {
    render(<Harness onPreviewStudent={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Review & Publish" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Preview Student View" })).not.toBeInTheDocument();
  });

  it("keeps the outdoor toolbar in independent left, centered, and right zones", () => {
    render(<Harness />);
    const header = screen.getByTestId("campus-editor-header");
    expect(header.className).toContain("editor-toolbar-shell");
    expect(header.className).toContain("grid-cols-[minmax(0,1fr)_minmax(0,auto)_minmax(0,1fr)]");
    expect(header.className).toContain("overflow-visible");
    expect(screen.getByTestId("campus-toolbar-left")).toBeInTheDocument();
    expect(screen.getByTestId("campus-toolbar-center")).toBeInTheDocument();
    expect(screen.getByTestId("campus-toolbar-right")).toBeInTheDocument();
  });

  it("turning Navigation off also closes an open Test Route session", async () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Show and edit the walking network" }));
    fireEvent.click(screen.getByRole("button", { name: "Test Route" }));
    expect(screen.getAllByTestId("test-route-full").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Hide the walking network" }));

    expect(screen.getByRole("button", { name: "Show and edit the walking network" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryAllByTestId("test-route-full")).toHaveLength(0));
  });

  it("closing Test Route leaves Navigation on when Navigation was already enabled", async () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Show and edit the walking network" }));
    fireEvent.click(screen.getByRole("button", { name: "Test Route" }));
    fireEvent.click(screen.getByRole("button", { name: "Test Route" }));

    await waitFor(() => expect(screen.queryAllByTestId("test-route-full")).toHaveLength(0));
    expect(screen.getByRole("button", { name: "Hide the walking network" })).toBeInTheDocument();
  });

  it("picks a Campus Gate through the map target, including when its nav anchor is on top", async () => {
    const campus = makeCampus();
    campus.markers = [{ id: "gate-main", name: "Main Gate", type: "gate", purpose: "general", x: 260, y: 260, color: "#2563eb", navNodeId: "gate-node" } as any];
    campus.navNodes = [{ id: "gate-node", name: "Main Gate", type: "outdoor", x: 260, y: 260, campusId: campus.id, accessible: true, color: "#2563eb", gateId: "gate-main" }];
    const { container } = render(<Harness initialCampus={campus} />);
    fireEvent.click(screen.getByRole("button", { name: "Show and edit the walking network" }));
    fireEvent.click(screen.getByRole("button", { name: "Test Route" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Pick on Map" })[0]);
    const gateAnchor = container.querySelector('[data-testid="nav-node"][data-node-id="gate-node"]');
    expect(gateAnchor).toBeTruthy();
    fireEvent.mouseDown(gateAnchor!, { clientX: 260, clientY: 260, bubbles: true });
    await waitFor(() => expect(screen.getAllByText("Main Gate").length).toBeGreaterThan(0));
  });

  it("aligns a moved Campus Gate anchor to its connected Pathway axis without moving the target", () => {
    const campus = makeCampus();
    campus.markers = [{ id: "gate-main", name: "Main Gate", type: "gate", purpose: "general", x: 260, y: 260, color: "#2563eb", navNodeId: "gate-node" } as any];
    campus.navNodes = [
      { id: "gate-node", name: "Main Gate", type: "outdoor", x: 260, y: 260, campusId: campus.id, accessible: true, color: "#2563eb", gateId: "gate-main" },
      { id: "path-target", name: "Pathway", type: "outdoor", x: 420, y: 264, campusId: campus.id, accessible: true, color: "#16a34a" },
    ];
    campus.navEdges = [{ id: "gate-path", startNodeId: "gate-node", endNodeId: "path-target", distance: 160, bidirectional: true, accessible: true, emergencySafe: true, type: "walking", color: "#16a34a", width: 3 }];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(next) => { latestCampus = next; }} />);
    const gate = container.querySelector('[data-testid="campus-gate"]')!;
    const svg = canvasSvg(container);
    fireEvent.mouseDown(gate, { clientX: 260, clientY: 260, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 360, clientY: 264, bubbles: true });
    expect(latestCampus?.markers?.find((marker) => marker.id === "gate-main")?.y).toBe(264);
    expect(container.querySelectorAll('[data-testid="alignment-guide"]').length).toBeGreaterThan(0);
    expect(latestCampus?.navNodes?.find((node) => node.id === "path-target")?.y).toBe(264);
    expect(latestCampus?.navEdges?.find((edge) => edge.id === "gate-path")?.id).toBe("gate-path");
    expect(latestCampus?.navNodes?.find((node) => node.id === "gate-node")?.id).toBe("gate-node");
    fireEvent.mouseUp(svg, { clientX: 360, clientY: 264, bubbles: true });
    expect(container.querySelectorAll('[data-testid="alignment-guide"]')).toHaveLength(0);
  });

  it("opens compact Canvas Settings and reuses the existing grid-size update", () => {
    render(<Harness onCampusChange={(campus) => { latestCampus = campus; }} />);

    fireEvent.click(screen.getByTestId("canvas-settings-trigger"));
    const popover = screen.getByTestId("canvas-settings-popover");
    expect(popover).toBeInTheDocument();
    expect(popover.parentElement).toBe(document.body);
    expect(screen.getByText("Grid snap")).toBeInTheDocument();
    expect(screen.getByText("Edge snap")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "40" }));
    expect(latestCampus?.gridSize).toBe(40);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("canvas-settings-popover")).not.toBeInTheDocument();
  });

  it("keeps canvas resize handles active through a draft drag and supports cancel", () => {
    const { container } = render(<Harness onCampusChange={(campus) => { latestCampus = campus; }} />);
    const svg = canvasSvg(container);

    fireEvent.click(screen.getByTestId("canvas-settings-trigger"));
    fireEvent.click(screen.getByRole("button", { name: "Resize on canvas" }));
    expect(screen.getByTestId("canvas-resize-handles")).toBeInTheDocument();

    const east = screen.getByTestId("canvas-resize-handle-e");
    fireEvent.mouseDown(east, { clientX: 900, clientY: 340, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 1000, clientY: 340, bubbles: true });
    fireEvent.mouseUp(svg, { clientX: 1000, clientY: 340, bubbles: true });

    expect(screen.getByTestId("canvas-resize-handles")).toBeInTheDocument();
    expect(screen.getByTestId("canvas-resize-confirmation")).toBeInTheDocument();
    expect(latestCampus).toBeNull();
    expect(screen.getByText(/1000 × 680px/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByTestId("canvas-resize-handles")).toBeInTheDocument();
    expect(screen.queryByTestId("canvas-resize-confirmation")).not.toBeInTheDocument();
    expect(latestCampus).toBeNull();
  });

  it("keeps the resize transaction alive when the pointer leaves the canvas edge", () => {
    const { container } = render(<Harness />);
    const svg = canvasSvg(container);

    fireEvent.click(screen.getByTestId("canvas-settings-trigger"));
    fireEvent.click(screen.getByRole("button", { name: "Resize on canvas" }));
    fireEvent.mouseDown(screen.getByTestId("canvas-resize-handle-e"), { clientX: 900, clientY: 340, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: 1000, clientY: 340, bubbles: true });
    fireEvent.mouseLeave(svg, { bubbles: true });

    expect(screen.getByTestId("canvas-resize-handles")).toBeInTheDocument();
    expect(screen.getByTestId("canvas-resize-confirmation")).toBeInTheDocument();
    expect(screen.getByText(/1000 × 680px/)).toBeInTheDocument();
  });

  it("opens the campus-specific keyboard shortcut help from the toolbar", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Keyboard shortcuts" }));
    expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
    expect(screen.getByText("Campus workspace")).toBeInTheDocument();
  });

  it("adds, renders, and selects a building-attached entrance", () => {
    const { container } = render(<Harness onCampusChange={(c) => { latestCampus = c; }} />);
    addEntrance(container);

    const entrance = latestCampus!.buildings[0].entrances![0];
    expect(entrance).toMatchObject({ buildingId: "b1", edge: "bottom", offset: 0.5, type: "general", isPrimary: true, accessible: true });
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

    expect(latestCampus!.buildings[0].entrances![0]).toMatchObject({ edge: "right", offset: 0.5 });

    fireEvent.click(screen.getByText("Delete Entrance"));
    fireEvent.click(screen.getByText("Remove Entrance"));
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
    fireEvent.click(screen.getByText("Service Access"));

    expect(container.querySelector("#entrance-edge")).toBeNull();
    fireEvent.click(screen.getByText("North"));

    const positionSlider = container.querySelector("#entrance-offset") as HTMLInputElement;
    fireEvent.change(positionSlider, { target: { value: "0.25" } });
    fireEvent.blur(positionSlider);

    const accessibleCheckbox = screen.getByLabelText("Accessible") as HTMLInputElement;
    if (!accessibleCheckbox.checked) fireEvent.click(accessibleCheckbox);

    expect(latestCampus!.buildings[0].entrances![0]).toMatchObject({
      type: "service",
      edge: "top",
      offset: 0.25,
      accessible: true,
    });
  });

  it("locks generated Exterior Emergency Stair discharge and confirms canonical removal", () => {
    const initialCampus = makeCampus();
    initialCampus.buildings[0].exteriorEmergencyStairs = [{
      id: "ext-1",
      buildingId: "b1",
      label: "Emergency Stair 1",
      state: "open",
      width: 28,
      height: 42,
      attachment: { edge: "right", offset: 0.5 },
      servedFloorIds: ["f1"],
      emergencySafe: true,
    }];
    const hydrated = syncExteriorEmergencyStairGraph(initialCampus);
    latestCampus = hydrated;
    const { container } = render(<Harness initialCampus={hydrated} onCampusChange={(c) => { latestCampus = c; }} />);
    const outdoorDischarge = hydrated.navNodes?.find((node) => node.exteriorEmergencyStairId === "ext-1" && !node.floorId);
    expect(outdoorDischarge).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show and edit the walking network" }));

    const discharge = container.querySelector(`[data-node-id="${outdoorDischarge!.id}"]`)!;
    const svg = canvasSvg(container);
    fireEvent.mouseDown(discharge, { clientX: outdoorDischarge!.x, clientY: outdoorDischarge!.y, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: outdoorDischarge!.x + 80, clientY: outdoorDischarge!.y + 40, bubbles: true });
    fireEvent.mouseUp(svg, { clientX: outdoorDischarge!.x + 80, clientY: outdoorDischarge!.y + 40, bubbles: true });
    expect(latestCampus?.navNodes?.find((node) => node.id === outdoorDischarge!.id)).toMatchObject({ x: outdoorDischarge!.x, y: outdoorDischarge!.y });

    fireEvent.mouseDown(buildingGroup(container), { clientX: 120, clientY: 120, bubbles: true });
    fireEvent.mouseUp(svg, { clientX: 120, clientY: 120, bubbles: true });
    fireEvent.click(screen.getByRole("button", { name: "Delete Exterior Emergency Stair" }));
    const dialog = screen.getByRole("dialog", { name: "Remove Exterior Emergency Stair?" });
    expect(dialog).toHaveTextContent("generated occurrences on all served Floors");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(latestCampus?.buildings[0].exteriorEmergencyStairs).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Delete Exterior Emergency Stair" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Stair" }));
    expect(latestCampus?.buildings[0].exteriorEmergencyStairs ?? []).toHaveLength(0);
    expect(latestCampus?.navNodes?.some((node) => node.id === outdoorDischarge!.id)).toBe(false);
  });

  it("renders the generated Stair Exit discharge as a clear outdoor Connect target", () => {
    const initialCampus = makeCampus();
    initialCampus.buildings[0].exteriorEmergencyStairs = [{
      id: "ext-visible",
      buildingId: "b1",
      label: "Emergency Stair 1",
      state: "open",
      width: 28,
      height: 42,
      attachment: { edge: "right", offset: 0.5 },
      servedFloorIds: ["f1"],
      emergencySafe: true,
    }];
    const hydrated = syncExteriorEmergencyStairGraph(initialCampus);
    const discharge = hydrated.navNodes?.find((node) => node.exteriorEmergencyStairId === "ext-visible" && !node.floorId)!;
    const { container } = render(<Harness initialCampus={hydrated} />);
    fireEvent.click(screen.getByRole("button", { name: "Show and edit the walking network" }));
    const group = container.querySelector(`[data-testid="nav-node"][data-node-id="${discharge.id}"]`)!;
    expect(group).toHaveTextContent("Generated Stair Exit (Connect target)");
    expect(group.querySelector('circle[fill="#dc2626"]')).toBeTruthy();
    expect(group.querySelector('circle[r="13"]')).toBeTruthy();
    fireEvent.mouseDown(group, { clientX: discharge.x, clientY: discharge.y, bubbles: true });
    expect(screen.getByTestId("nav-node-props")).toHaveTextContent("Stair Exit");
    expect(screen.getByTestId("nav-node-props")).toHaveTextContent("Generated / Locked");
    expect(screen.getByTestId("nav-node-props")).toHaveTextContent("Needs Outdoor Connection");
    expect(screen.getByTestId("nav-node-props")).toHaveTextContent("Connect this Stair Exit to the Outdoor Walking Network.");
    expect(screen.getAllByText("Needs Outdoor Connection")).toHaveLength(1);
  });

  it("shows the generated Stair Exit as connected once an outdoor network edge exists", () => {
    const initialCampus = makeCampus();
    initialCampus.buildings[0].exteriorEmergencyStairs = [{
      id: "ext-connected",
      buildingId: "b1",
      label: "Emergency Stair 1",
      state: "open",
      width: 28,
      height: 42,
      attachment: { edge: "right", offset: 0.5 },
      servedFloorIds: ["f1"],
      emergencySafe: true,
    }];
    const hydrated = syncExteriorEmergencyStairGraph(initialCampus);
    const discharge = hydrated.navNodes?.find((node) => node.exteriorEmergencyStairId === "ext-connected" && !node.floorId)!;
    hydrated.navNodes = [...(hydrated.navNodes ?? []), { id: "outdoor-network", name: "Outdoor Network", type: "outdoor", x: discharge.x + 100, y: discharge.y, campusId: "c1", accessible: true, color: "#16a34a" } satisfies NavigationNode];
    hydrated.navEdges = [...(hydrated.navEdges ?? []), { id: "outdoor-link", startNodeId: discharge.id, endNodeId: "outdoor-network", distance: 100, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 3 }];
    const { container } = render(<Harness initialCampus={hydrated} />);
    fireEvent.click(screen.getByRole("button", { name: "Show and edit the walking network" }));
    const group = container.querySelector(`[data-testid="nav-node"][data-node-id="${discharge.id}"]`)!;
    fireEvent.mouseDown(group, { clientX: discharge.x, clientY: discharge.y, bubbles: true });
    expect(screen.getByTestId("generated-stair-exit-connected")).toHaveTextContent("Connected");
    expect(screen.queryByText("Needs Outdoor Connection")).toBeNull();
  });

  it("commits a generated Stair Exit connector to another outdoor waypoint in the live graph", () => {
    const initialCampus = makeCampus();
    initialCampus.buildings[0].exteriorEmergencyStairs = [{
      id: "ext-waypoint",
      buildingId: "b1",
      label: "Emergency Stair 1",
      state: "open",
      width: 28,
      height: 42,
      attachment: { edge: "right", offset: 0.5 },
      servedFloorIds: ["f1"],
      emergencySafe: true,
    }];
    const hydrated = syncExteriorEmergencyStairGraph(initialCampus);
    const discharge = hydrated.navNodes?.find((node) => node.exteriorEmergencyStairId === "ext-waypoint" && !node.floorId)!;
    const target = { id: "outdoor-target", name: "Outdoor waypoint", type: "outdoor" as const, x: discharge.x + 120, y: discharge.y + 40, campusId: "c1", accessible: true, color: "#16a34a" } satisfies NavigationNode;
    hydrated.navNodes = [...(hydrated.navNodes ?? []), target];
    const { container } = render(<Harness initialCampus={hydrated} onCampusChange={(campus) => { latestCampus = campus; }} />);
    fireEvent.click(screen.getByRole("button", { name: "Show and edit the walking network" }));
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    const sourceGroup = container.querySelector(`[data-testid="nav-node"][data-node-id="${discharge.id}"]`)!;
    const targetGroup = container.querySelector(`[data-testid="nav-node"][data-node-id="${target.id}"]`)!;
    const nodeCountBeforeConnect = latestCampus?.navNodes?.length ?? hydrated.navNodes?.length ?? 0;
    fireEvent.mouseDown(sourceGroup, { clientX: discharge.x, clientY: discharge.y, bubbles: true });
    fireEvent.mouseDown(targetGroup, { clientX: target.x, clientY: target.y, bubbles: true });

    const connector = latestCampus?.navEdges?.find((edge) =>
      (edge.startNodeId === discharge.id && edge.endNodeId === target.id)
      || (edge.startNodeId === target.id && edge.endNodeId === discharge.id),
    );
    expect(connector).toBeTruthy();
    expect(latestCampus?.navNodes?.some((node) => node.id === connector?.startNodeId)).toBe(true);
    expect(latestCampus?.navNodes?.some((node) => node.id === connector?.endNodeId)).toBe(true);
    expect(connector?.bendPoints?.length).toBeGreaterThan(0);
    const connectorStart = latestCampus?.navNodes?.find((node) => node.id === connector?.startNodeId)!;
    const connectorEnd = latestCampus?.navNodes?.find((node) => node.id === connector?.endNodeId)!;
    const connectorPoints = [connectorStart, ...(connector?.bendPoints ?? []), connectorEnd];
    expect(connectorPoints.slice(0, -1).every((point, index) => {
      const next = connectorPoints[index + 1];
      return point.x === next.x || point.y === next.y;
    })).toBe(true);
    // Clicking an existing endpoint commits only the edge; it must not leave a
    // stray waypoint beside the target.
    expect(latestCampus?.navNodes).toHaveLength(nodeCountBeforeConnect);
    expect(container.querySelector(`[data-testid="nav-edge"][data-edge-id="${connector!.id}"]`)).toBeTruthy();

    fireEvent.mouseDown(container.querySelector(`[data-testid="nav-node"][data-node-id="${discharge.id}"]`)!, { clientX: discharge.x, clientY: discharge.y, bubbles: true });
    expect(screen.getByTestId("generated-stair-exit-connected")).toHaveTextContent("Connected");
    expect(screen.queryByText("Needs Outdoor Connection")).toBeNull();
  });

  it("commits a generated Stair Exit connector to a manual outdoor edge midpoint", () => {
    const initialCampus = makeCampus();
    initialCampus.buildings[0].exteriorEmergencyStairs = [{
      id: "ext-manual-edge",
      buildingId: "b1",
      label: "Emergency Stair 1",
      state: "open",
      width: 28,
      height: 42,
      attachment: { edge: "right", offset: 0.5 },
      servedFloorIds: ["f1"],
      emergencySafe: true,
    }];
    const hydrated = syncExteriorEmergencyStairGraph(initialCampus);
    const discharge = hydrated.navNodes?.find((node) => node.exteriorEmergencyStairId === "ext-manual-edge" && !node.floorId)!;
    const pointA = { id: "manual-a", name: "A", type: "outdoor" as const, x: 300, y: discharge.y, campusId: "c1", accessible: true, color: "#16a34a" } satisfies NavigationNode;
    const pointB = { id: "manual-b", name: "B", type: "outdoor" as const, x: 500, y: discharge.y, campusId: "c1", accessible: true, color: "#16a34a" } satisfies NavigationNode;
    hydrated.navNodes = [...(hydrated.navNodes ?? []), pointA, pointB];
    hydrated.navEdges = [...(hydrated.navEdges ?? []), { id: "manual-edge", startNodeId: pointA.id, endNodeId: pointB.id, distance: 200, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 3 }];
    const { container } = render(<Harness initialCampus={hydrated} onCampusChange={(campus) => { latestCampus = campus; }} />);
    fireEvent.click(screen.getByRole("button", { name: "Show and edit the walking network" }));
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    const sourceGroup = container.querySelector(`[data-testid="nav-node"][data-node-id="${discharge.id}"]`)!;
    fireEvent.mouseDown(sourceGroup, { clientX: discharge.x, clientY: discharge.y, bubbles: true });
    const edgeGroup = container.querySelector(`[data-testid="nav-edge"][data-edge-id="manual-edge"]`)!;
    fireEvent.mouseDown(edgeGroup, { clientX: 400, clientY: discharge.y, bubbles: true });

    const inserted = latestCampus?.navNodes?.find((node) => node.id !== discharge.id && node.x === 400 && node.y === discharge.y && node.name === "Walking Point");
    expect(inserted).toBeTruthy();
    const connector = latestCampus?.navEdges?.find((edge) =>
      (edge.startNodeId === discharge.id && edge.endNodeId === inserted?.id)
      || (edge.startNodeId === inserted?.id && edge.endNodeId === discharge.id),
    );
    expect(connector).toBeTruthy();
    expect(latestCampus?.navEdges?.filter((edge) => edge.startNodeId === pointA.id || edge.endNodeId === pointB.id)).toHaveLength(2);
    expect(container.querySelector(`[data-testid="nav-edge"][data-edge-id="${connector!.id}"]`)).toBeTruthy();
  });

  it("targets an Entrance connector midpoint as one canonical junction", () => {
    const campus = makeCampus();
    campus.buildings[0].entrances = [{
      id: "entrance-junction",
      buildingId: "b1",
      edge: "bottom",
      offset: 0.5,
      type: "general",
      name: "Main Entrance",
      isPrimary: true,
      accessible: true,
    }];
    const entranceNode = {
      id: "entrance-node",
      name: "Main Entrance",
      type: "entrance" as const,
      x: 160,
      y: 180,
      campusId: "c1",
      buildingId: "b1",
      entranceId: "entrance-junction",
      accessible: true,
      color: "#16a34a",
    } satisfies NavigationNode;
    const pathwayNode = {
      id: "pathway-node",
      name: "Pathway",
      type: "outdoor" as const,
      x: 400,
      y: 180,
      campusId: "c1",
      accessible: true,
      color: "#16a34a",
    } satisfies NavigationNode;
    const sourceNode = {
      id: "junction-source",
      name: "Source",
      type: "outdoor" as const,
      x: 450,
      y: 300,
      campusId: "c1",
      accessible: true,
      color: "#16a34a",
    } satisfies NavigationNode;
    campus.navNodes = [entranceNode, pathwayNode, sourceNode];
    campus.navEdges = [{
      id: "entrance-connector",
      startNodeId: entranceNode.id,
      endNodeId: pathwayNode.id,
      distance: 240,
      bidirectional: true,
      accessible: true,
      type: "walkway",
      color: "#16a34a",
      width: 4,
    }];

    const { container } = render(<Harness initialCampus={campus} onCampusChange={(next) => { latestCampus = next; }} />);
    fireEvent.click(screen.getByRole("button", { name: "Show and edit the walking network" }));
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    const source = container.querySelector(`[data-testid="nav-node"][data-node-id="${sourceNode.id}"]`)!;
    const connector = container.querySelector(`[data-testid="nav-edge"][data-edge-id="entrance-connector"]`)!;
    fireEvent.mouseDown(source, { clientX: sourceNode.x, clientY: sourceNode.y, bubbles: true });
    fireEvent.mouseDown(connector, { clientX: 280, clientY: 180, bubbles: true });

    const inserted = latestCampus?.navNodes?.find((node) => node.pathJunction && node.x === 280 && node.y === 180);
    expect(inserted).toBeTruthy();
    expect(latestCampus?.navEdges?.some((edge) =>
      (edge.startNodeId === entranceNode.id && edge.endNodeId === inserted?.id)
      || (edge.startNodeId === inserted?.id && edge.endNodeId === entranceNode.id),
    )).toBe(true);
    expect(latestCampus?.navEdges?.some((edge) =>
      (edge.startNodeId === inserted?.id && edge.endNodeId === pathwayNode.id)
      || (edge.startNodeId === pathwayNode.id && edge.endNodeId === inserted?.id),
    )).toBe(true);
    expect(latestCampus?.navEdges?.some((edge) =>
      (edge.startNodeId === sourceNode.id && edge.endNodeId === inserted?.id)
      || (edge.startNodeId === inserted?.id && edge.endNodeId === sourceNode.id),
    )).toBe(true);
    expect(latestCampus?.navNodes?.filter((node) => node.x === 280 && node.y === 180)).toHaveLength(1);
  });

  it("keeps Entrance connector graph state immutable during unrelated Hierarchy UI actions", () => {
    const campus = makeCampus();
    campus.buildings[0].entrances = [{ id: "entrance-stable", buildingId: "b1", edge: "bottom", offset: 0.5, name: "Main Entrance", isPrimary: true, accessible: true }];
    campus.buildings.push({
      id: "b2",
      name: "Other Building",
      code: "B2",
      category: "Academic",
      description: "",
      x: 500,
      y: 100,
      width: 120,
      height: 80,
      color: "#7c3aed",
      expanded: false,
      floors: [{ id: "f2", buildingId: "b2", number: 1, label: "Ground Floor", rooms: [], paths: [] }],
    });
    campus.navNodes = [
      { id: "stable-entrance", name: "Main Entrance", type: "entrance", x: 160, y: 180, campusId: "c1", buildingId: "b1", entranceId: "entrance-stable", accessible: true, color: "#16a34a" },
      { id: "stable-path", name: "Pathway", type: "outdoor", x: 400, y: 180, campusId: "c1", accessible: true, color: "#16a34a" },
    ];
    campus.navEdges = [{ id: "stable-edge", startNodeId: "stable-entrance", endNodeId: "stable-path", distance: 240, bidirectional: true, accessible: true, type: "walkway", color: "#16a34a", width: 4, bendPoints: [{ x: 280, y: 180 }] }];
    let latest: Campus | null = null;
    render(<Harness initialCampus={campus} onCampusChange={(next) => { latest = next; }} />);
    const before = JSON.stringify({ navNodes: (latest ?? campus).navNodes, navEdges: (latest ?? campus).navEdges });

    const otherRow = screen.getAllByText("Other Building")
      .map((element) => element.closest("[draggable='true']"))
      .find((row): row is HTMLElement => Boolean(row));
    expect(otherRow).toBeTruthy();
    fireEvent.click(otherRow!);
    expect(JSON.stringify({ navNodes: (latest ?? campus).navNodes, navEdges: (latest ?? campus).navEdges })).toBe(before);
    fireEvent.click(within(otherRow!).getByRole("button", { name: "Hide Other Building" }));
    expect(latest).toBeTruthy();
    expect(JSON.stringify({ navNodes: latest!.navNodes, navEdges: latest!.navEdges })).toBe(before);
  });

  it("exposes local bend and straighten controls for an Entrance connector", () => {
    const campus = makeCampus();
    campus.buildings[0].entrances = [{
      id: "entrance-geometry",
      buildingId: "b1",
      edge: "bottom",
      offset: 0.5,
      name: "Main Entrance",
      isPrimary: true,
      accessible: true,
    }];
    campus.navNodes = [
      { id: "entrance-geometry-node", name: "Main Entrance", type: "entrance", x: 160, y: 180, campusId: "c1", buildingId: "b1", entranceId: "entrance-geometry", accessible: true, color: "#16a34a" },
      { id: "geometry-target", name: "Pathway", type: "outdoor", x: 400, y: 260, campusId: "c1", accessible: true, color: "#16a34a" },
    ];
    campus.navEdges = [{
      id: "entrance-geometry-edge",
      startNodeId: "entrance-geometry-node",
      endNodeId: "geometry-target",
      distance: 250,
      bidirectional: true,
      accessible: true,
      emergencySafe: true,
      bendPoints: [{ x: 280, y: 180 }, { x: 280, y: 240 }],
    }];
    const { container } = render(<Harness initialCampus={campus} onCampusChange={(next) => { latestCampus = next; }} />);
    fireEvent.click(screen.getByRole("button", { name: "Show and edit the walking network" }));
    const edge = container.querySelector('[data-testid="nav-edge"][data-edge-id="entrance-geometry-edge"]');
    expect(edge).toBeTruthy();
    fireEvent.mouseDown(edge!, { clientX: 280, clientY: 180, bubbles: true });

    expect(screen.getByTestId("nav-edge-add-bend")).toBeInTheDocument();
    expect(screen.getByTestId("nav-edge-straighten")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("nav-edge-straighten"));
    expect(latestCampus?.navEdges?.find((candidate) => candidate.id === "entrance-geometry-edge")?.bendPoints).toBeUndefined();
  });

  it("aligns a physical Exterior Emergency Stair to the connected discharge node axis", () => {
    const initialCampus = makeCampus();
    initialCampus.buildings[0].exteriorEmergencyStairs = [{
      id: "ext-align",
      buildingId: "b1",
      label: "Emergency Stair 1",
      state: "open",
      width: 28,
      height: 42,
      attachment: { edge: "right", offset: 0.5 },
      servedFloorIds: ["f1"],
      emergencySafe: true,
    }];
    const hydrated = syncExteriorEmergencyStairGraph(initialCampus);
    const discharge = hydrated.navNodes?.find((node) => node.exteriorEmergencyStairId === "ext-align" && !node.floorId)!;
    hydrated.navNodes = [...(hydrated.navNodes ?? []), { id: "outdoor-axis", name: "Outdoor axis", campusId: "c1", type: "outdoor", x: discharge.x + 36, y: discharge.y + 5, accessible: true } satisfies NavigationNode];
    hydrated.navEdges = [{ id: "discharge-link", startNodeId: discharge.id, endNodeId: "outdoor-axis", distance: 36, bidirectional: true, accessible: true, emergencySafe: true, type: "walkway", color: "#16a34a", width: 3 }];
    const { container } = render(<Harness initialCampus={hydrated} onCampusChange={(campus) => { latestCampus = campus; }} />);
    const stair = container.querySelector('[data-testid="exterior-emergency-stair"]')!;
    const svg = canvasSvg(container);
    fireEvent.mouseDown(stair, { clientX: discharge.x, clientY: discharge.y, bubbles: true });
    fireEvent.mouseMove(svg, { clientX: discharge.x, clientY: discharge.y + 5, bubbles: true });
    expect(latestCampus?.navNodes?.find((node) => node.id === discharge.id)?.y).toBe(discharge.y + 5);
    expect(latestCampus?.navEdges?.find((edge) => edge.id === "discharge-link")).toMatchObject({ startNodeId: discharge.id, endNodeId: "outdoor-axis" });
    fireEvent.mouseUp(svg, { clientX: discharge.x, clientY: discharge.y + 5, bubbles: true });
  });

  it("commits a Stair Exit to a Pathway midpoint with the junction and connector immediately visible", () => {
    const initialCampus = makeCampus();
    initialCampus.buildings[0].exteriorEmergencyStairs = [{
      id: "ext-pathway",
      buildingId: "b1",
      label: "Emergency Stair 1",
      state: "open",
      width: 28,
      height: 42,
      attachment: { edge: "right", offset: 0.5 },
      servedFloorIds: ["f1"],
      emergencySafe: true,
    }];
    initialCampus.paths = [{
      id: "walkway-midpoint",
      name: "Walkway",
      type: "walkway",
      color: "#94a3b8",
      width: 12,
      points: [{ x: 300, y: 260 }, { x: 500, y: 260 }],
      pathNetworkId: "outdoor-network",
      visible: true,
      locked: false,
    }, {
      id: "walkway-branch",
      name: "Walkway branch",
      type: "walkway",
      color: "#94a3b8",
      width: 12,
      points: [{ x: 500, y: 260 }, { x: 500, y: 340 }],
      pathNetworkId: "outdoor-network",
      visible: true,
      locked: false,
    }];
    const hydrated = syncExteriorEmergencyStairGraph(initialCampus);
    const discharge = hydrated.navNodes?.find((node) => node.exteriorEmergencyStairId === "ext-pathway" && !node.floorId)!;
    const { container } = render(<Harness initialCampus={hydrated} onCampusChange={(campus) => { latestCampus = campus; }} />);
    fireEvent.doubleClick(container.querySelector(`[data-testid="campus-path"][data-path-id="walkway-midpoint"]`)!, { bubbles: true });
    expect(screen.getByText("Edit Pathway")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    const svg = canvasSvg(container);
    const dischargeGroup = container.querySelector(`[data-testid="nav-node"][data-node-id="${discharge.id}"]`)!;
    fireEvent.mouseDown(dischargeGroup, { clientX: discharge.x, clientY: discharge.y, bubbles: true });
    fireEvent.mouseUp(svg, { clientX: discharge.x, clientY: discharge.y, bubbles: true });
    const path = container.querySelector(`[data-testid="campus-path"][data-path-id="walkway-midpoint"]`)!;
    fireEvent.mouseDown(path, { clientX: 400, clientY: 260, bubbles: true });
    fireEvent.mouseUp(svg, { clientX: 400, clientY: 260, bubbles: true });

    expect(latestCampus).toBeTruthy();
    const updatedPath = latestCampus!.paths.find((candidate) => candidate.id === "walkway-midpoint")!;
    expect(updatedPath.points).toEqual([{ x: 300, y: 260 }, { x: 400, y: 260 }, { x: 500, y: 260 }]);
    const junction = latestCampus!.navNodes?.find((node) => node.generatedFromPathVertices?.some((ref) => ref.pathId === "walkway-midpoint"));
    expect(junction).toBeTruthy();
    const midpointJunction = latestCampus!.navNodes?.find((node) => node.x === 400 && node.y === 260 && node.generatedFromPathVertices?.some((ref) => ref.pathId === "walkway-midpoint"));
    expect(midpointJunction).toBeTruthy();
    const connector = latestCampus!.navEdges?.find((edge) =>
      (edge.startNodeId === discharge.id && edge.endNodeId === midpointJunction!.id)
      || (edge.startNodeId === midpointJunction!.id && edge.endNodeId === discharge.id),
    );
    expect(connector).toBeTruthy();
    expect(connector?.generatedFromPathIds).toBeUndefined();
    expect([connector?.startNodeId, connector?.endNodeId]).toEqual(expect.arrayContaining([discharge.id, midpointJunction!.id]));
    expect(container.querySelector(`[data-testid="nav-edge"][data-edge-id="${connector!.id}"]`)).toBeTruthy();
    expect(container.querySelector(`[data-testid="nav-node"][data-node-id="${junction!.id}"]`)).toBeTruthy();

    // The inspector must consume the same post-commit graph snapshot as the
    // Canvas: selecting the generated discharge immediately reports the
    // outdoor connection instead of retaining the stale warning.
    const finalDischarge = latestCampus!.navNodes?.find((node) => node.exteriorEmergencyStairId === "ext-pathway" && !node.floorId)!;
    const dischargeGroupAfterCommit = container.querySelector(`[data-testid="nav-node"][data-node-id="${finalDischarge.id}"]`)!;
    fireEvent.mouseDown(dischargeGroupAfterCommit, { clientX: finalDischarge.x, clientY: finalDischarge.y, bubbles: true });
    expect(screen.getByTestId("generated-stair-exit-connected")).toHaveTextContent("Connected");
    expect(screen.queryByText("Needs Outdoor Connection")).toBeNull();
    // The generated discharge also owns its canonical Ground bridge, so the
    // live total is two edges here: that bridge plus the authored outdoor
    // Stair Exit connector.
    expect(screen.getByText("Connected paths").parentElement).toHaveTextContent("2");
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
    fireEvent.click(screen.getByText("Remove Entrance"));

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
    fireEvent.click(screen.getByText("Remove Entrance"));

    expect(latestCampus!.buildings[0].entrances).toHaveLength(2);
    expect(latestCampus!.buildings[0].entrances!.some((e) => e.isPrimary)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FloorEditor } from "../FloorEditor";
import type { Campus } from "../types";

function campusFixture(): Campus {
  return {
    id: "campus-1",
    name: "PLV Campus",
    code: "PLV",
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
      id: "building-1", name: "Main Building", code: "MAIN", category: "Academic", description: "",
      x: 20, y: 20, width: 300, height: 220, color: "#0e2a6e",
      floors: [{
        id: "floor-1", buildingId: "building-1", number: 1, label: "Ground Floor", canvasW: 900, canvasH: 680,
        rooms: [], paths: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [],
      }],
    }],
    markers: [], paths: [], navNodes: [], navEdges: [], createdAt: "2026-01-01", updatedAt: "2026-01-01",
  };
}

describe("FloorEditor room templates", () => {
  it("opens the visual catalogue and searches built-in templates", () => {
    render(<FloorEditor campus={campusFixture()} buildingId="building-1" floorId="floor-1" onBack={() => {}} onSwitchFloor={() => {}} onUpdate={() => {}} />);
    fireEvent.click(screen.getByTestId("room-template-button"));
    expect(screen.getByTestId("room-template-catalogue")).toBeInTheDocument();
    expect(screen.getAllByText("Classroom — 40 Seats").length).toBeGreaterThan(0);
    fireEvent.change(screen.getByTestId("room-template-search"), { target: { value: "computer" } });
    expect(screen.getAllByText("Computer Laboratory").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("room-template-card-classroom-40")).toBeNull();
  });

  it("uses the same card preview scene for a template preview", () => {
    render(<FloorEditor campus={campusFixture()} buildingId="building-1" floorId="floor-1" onBack={() => {}} onSwitchFloor={() => {}} onUpdate={() => {}} />);
    fireEvent.click(screen.getByTestId("room-template-button"));
    fireEvent.click(screen.getAllByRole("button", { name: "Preview" })[0]);
    expect(screen.getByTestId("room-template-detail")).toBeInTheDocument();
    expect(screen.getAllByTestId("room-template-scene").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Approximate footprint")).toBeInTheDocument();
  });

  it("commits a placed template as one normal physical-object update", () => {
    const campus = campusFixture();
    const updates: Campus[] = [];
    const { container } = render(<FloorEditor campus={campus} buildingId="building-1" floorId="floor-1" onBack={() => {}} onSwitchFloor={() => {}} onUpdate={(next) => updates.push(next)} />);
    fireEvent.click(screen.getByTestId("room-template-button"));
    fireEvent.click(screen.getByTestId("room-template-use-classroom-40"));
    const svg = container.querySelector('svg[viewBox="0 0 900 680"]') as SVGSVGElement;
    expect(svg).toBeTruthy();
    Object.defineProperty(svg, "getBoundingClientRect", { configurable: true, value: () => ({ left: 0, top: 0, width: 900, height: 680, right: 900, bottom: 680 }) });
    fireEvent.mouseMove(svg, { clientX: 450, clientY: 340, bubbles: true });
    fireEvent.mouseDown(svg, { clientX: 450, clientY: 340, bubbles: true });
    fireEvent.mouseUp(svg, { clientX: 450, clientY: 340, bubbles: true });
    const placed = updates.at(-1)?.buildings[0].floors[0];
    expect(placed?.rooms).toHaveLength(1);
    expect(placed?.walls).toHaveLength(4);
    expect(placed?.furniture.filter((item) => item.type === "student-desk-chair")).toHaveLength(40);
    expect(placed?.doors).toEqual([]);
    expect(placed?.navNodes ?? updates.at(-1)?.navNodes ?? []).toEqual([]);
  });

  it("cancels template placement without creating objects", () => {
    const campus = campusFixture();
    const updates: Campus[] = [];
    render(<FloorEditor campus={campus} buildingId="building-1" floorId="floor-1" onBack={() => {}} onSwitchFloor={() => {}} onUpdate={(next) => updates.push(next)} />);
    fireEvent.click(screen.getByTestId("room-template-button"));
    fireEvent.click(screen.getByTestId("room-template-use-classroom-40"));
    expect(screen.getByTestId("room-template-placement-preview")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("room-template-placement-preview")).toBeNull();
    expect(updates).toHaveLength(0);
  });

  it("opens the Add Floor chooser without mutating, then preserves the blank-floor path", () => {
    const campus = campusFixture();
    const updates: Campus[] = [];
    const switches: string[] = [];
    render(<FloorEditor campus={campus} buildingId="building-1" floorId="floor-1" onBack={() => {}} onSwitchFloor={(id) => switches.push(id)} onUpdate={(next) => updates.push(next)} />);
    fireEvent.click(screen.getByRole("button", { name: "Add Floor" }));
    expect(screen.getByTestId("floor-creation-chooser")).toBeInTheDocument();
    expect(updates).toHaveLength(0);
    fireEvent.click(screen.getByTestId("start-blank-floor"));
    expect(updates).toHaveLength(1);
    expect(updates[0].buildings[0].floors).toHaveLength(2);
    expect(switches).toHaveLength(1);
    expect(updates[0].buildings[0].floors[1].rooms).toEqual([]);
  });

  it("browses Floor starters and creates a physical-only Floor through Add Floor", () => {
    const campus = campusFixture();
    const updates: Campus[] = [];
    const switches: string[] = [];
    render(<FloorEditor campus={campus} buildingId="building-1" floorId="floor-1" onBack={() => {}} onSwitchFloor={(id) => switches.push(id)} onUpdate={(next) => updates.push(next)} />);
    fireEvent.click(screen.getByRole("button", { name: "Add Floor" }));
    fireEvent.click(screen.getByTestId("browse-floor-templates"));
    expect(screen.getByTestId("floor-template-catalogue")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("floor-template-search"), { target: { value: "computer" } });
    expect(screen.getByTestId("floor-template-card-computer-laboratory-floor")).toBeInTheDocument();
    expect(screen.getByText(/Navigation setup required/i)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("floor-template-use-computer-laboratory-floor"));
    expect(updates).toHaveLength(1);
    const created = updates[0].buildings[0].floors[1];
    expect(created.canvasW).toBe(1380);
    expect(created.rooms.length).toBeGreaterThan(0);
    expect(created.walls.length).toBeGreaterThan(4);
    expect(created.furniture.length).toBeGreaterThan(0);
    expect(created.doors).toEqual([]);
    expect(created.stairs).toEqual([]);
    expect(created.paths).toEqual([]);
    expect(updates[0].navNodes ?? []).toEqual(campus.navNodes);
    expect(updates[0].navEdges ?? []).toEqual(campus.navEdges);
    expect(switches).toEqual([created.id]);
    expect(screen.queryByTestId("floor-template-catalogue")).toBeNull();
  });

  it("keeps Floor template preview and creation details physical-only", () => {
    render(<FloorEditor campus={campusFixture()} buildingId="building-1" floorId="floor-1" onBack={() => {}} onSwitchFloor={() => {}} onUpdate={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Add Floor" }));
    fireEvent.click(screen.getByTestId("browse-floor-templates"));
    fireEvent.click(screen.getAllByRole("button", { name: "Preview" })[0]);
    expect(screen.getByTestId("floor-template-detail")).toBeInTheDocument();
    expect(screen.getByText(/Navigation not included/i)).toBeInTheDocument();
    expect(screen.getAllByTestId(/floor-template-scene/).length).toBeGreaterThanOrEqual(2);
  });
});

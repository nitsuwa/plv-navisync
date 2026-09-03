import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { useState } from "react";
import { CampusEditor } from "../CampusEditor";
import type { Campus, NavigationNode, NavigationEdge, FloorSelection } from "../types";

// ── B7 Phase 2 — Object-specific issue guidance (Campus Properties) ───────
// Selecting an object that has a live validation issue shows a compact
// "Needs attention" section near the TOP of its Properties panel, using the
// SAME canonical live validation list as the global Issues control + markers.

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
    publishStatus: "published",
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

function withBuilding(campus: Campus, overrides: Partial<Campus["buildings"][number]> = {}): Campus {
  return {
    ...campus,
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
      entrances: [{ id: "e1", buildingId: "b1", edge: "bottom", offset: 0.5, type: "general", isPrimary: true }],
      ...overrides,
    }],
  };
}

let applyFixRef: ((c: Campus) => void) | null = null;

function Harness({ initialCampus }: { initialCampus: Campus }) {
  const [campus, setCampus] = useState<Campus>(initialCampus);
  applyFixRef = setCampus;
  return (
    <CampusEditor
      campus={campus}
      onBack={() => {}}
      onUpdate={setCampus}
      onPublish={() => {}}
      onOpenFloor={(_buildingId: string, _floorId: string, _selection?: FloorSelection) => {}}
      onAddBuilding={() => {}}
      savedSnapshot={JSON.stringify(initialCampus)}
    />
  );
}

function openIssuesPopover() {
  fireEvent.mouseDown(screen.getByTestId("issues-popover"));
}

function issueSection(): HTMLElement | null {
  return screen.queryByTestId("object-issue-section");
}

/** Click an object's issue row in the global Issues popover (locates + selects). */
function clickIssueRow(text: RegExp) {
  fireEvent.click(screen.getByText(text));
}

/** Find a building <g> by its body fill color (outer g has no transform attr). */
function buildingG(container: HTMLElement, color: string): SVGGElement {
  const g = Array.from(container.querySelectorAll("g")).find(
    (el) => !el.hasAttribute("transform") && el.querySelector(`rect[fill="${color}"]`)
  );
  expect(g, `building g with fill ${color}`).toBeTruthy();
  return g as SVGGElement;
}

let toastSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  toastSpy = vi.spyOn(toast, "info").mockImplementation(() => "" as never);
});
afterEach(() => {
  cleanup();
  toastSpy.mockRestore();
  applyFixRef = null;
});

describe("CampusEditor object issue guidance (B7 Phase 2)", () => {
  it("a selected waypoint with a WARNING shows the contextual issue section", () => {
    const campus = makeCampus({ navNodes: [node({ id: "n1", type: "outdoor", name: "Orphan" })] });
    render(<Harness initialCampus={campus} />);
    openIssuesPopover();
    clickIssueRow(/has no navigation connections/);

    expect(screen.getByTestId("nav-node-props")).toBeTruthy();
    const section = issueSection();
    expect(section).toBeTruthy();
    expect(section!.getAttribute("data-severity")).toBe("warning");
    expect(section!.textContent).toContain("Needs attention");
    expect(section!.textContent).toContain("Nav Orphan Node");
    expect(section!.textContent).toContain('"Orphan" has no navigation connections.');
  });

  it("a selected object with an ERROR uses error styling", () => {
    const campus = makeCampus({
      navNodes: [node({ id: "a", type: "outdoor" })],
      navEdges: [edge({ id: "e1", startNodeId: "ghost", endNodeId: "a" })], // missing start node → error
    });
    render(<Harness initialCampus={campus} />);
    openIssuesPopover();
    clickIssueRow(/missing start node/);

    const section = issueSection();
    expect(section).toBeTruthy();
    expect(section!.getAttribute("data-severity")).toBe("error");
  });

  it("correcting the object removes the contextual issue immediately", () => {
    const campus = makeCampus({ navNodes: [node({ id: "n1", type: "outdoor" })] });
    render(<Harness initialCampus={campus} />);
    openIssuesPopover();
    clickIssueRow(/has no navigation connections/);
    expect(issueSection()).toBeTruthy();

    // Delete the orphan node (as if the admin fixed it) — section disappears.
    act(() => { applyFixRef!({ ...campus, navNodes: [] }); });
    expect(issueSection()).toBeNull();
  });

  it("an object with MULTIPLE issues shows all unique applicable issues (worst severity styling)", () => {
    // Missing name (warning) + out-of-bounds (error) — both target the building.
    const campus = withBuilding(makeCampus(), { name: "", x: 850 });
    const { container } = render(<Harness initialCampus={campus} />);
    const g = buildingG(container, "#1e40af");
    fireEvent.mouseDown(g, { clientX: 160, clientY: 140 });
    fireEvent.mouseUp(g, { clientX: 160, clientY: 140 });

    const section = issueSection();
    expect(section).toBeTruthy();
    expect(section!.getAttribute("data-severity")).toBe("error");
    expect(section!.textContent).toContain("Missing Name");
    expect(section!.textContent).toContain("Boundary");
  });

  it("an object with no issue shows NO empty issue section (issues on another object do not leak)", () => {
    // The building itself is valid; the entrance warning targets the entrance,
    // not the building — selecting the building must show no issue section.
    const campus = withBuilding(makeCampus());
    const { container } = render(<Harness initialCampus={campus} />);
    const g = buildingG(container, "#1e40af");
    fireEvent.mouseDown(g, { clientX: 160, clientY: 140 });
    fireEvent.mouseUp(g, { clientX: 160, clientY: 140 });

    expect(screen.getByText("Building")).toBeTruthy(); // properties open
    expect(issueSection()).toBeNull();
  });

  it("selecting a different object changes the contextual issue list correctly", () => {
    const campus = makeCampus({
      navNodes: [
        node({ id: "n1", type: "outdoor", name: "Orphan One" }),
        node({ id: "n2", type: "outdoor", name: "Orphan Two" }),
      ],
    });
    render(<Harness initialCampus={campus} />);
    openIssuesPopover();

    // Select the first orphan waypoint.
    clickIssueRow(/Orphan One.*has no navigation connections/);
    expect(issueSection()!.textContent).toContain('"Orphan One" has no navigation connections.');

    // Select the second orphan — the section must switch to its issue.
    openIssuesPopover();
    clickIssueRow(/Orphan Two.*has no navigation connections/);
    const section = issueSection();
    expect(section).toBeTruthy();
    expect(section!.textContent).toContain('"Orphan Two" has no navigation connections.');
    expect(section!.textContent).not.toContain('"Orphan One" has no navigation connections.');
  });
});

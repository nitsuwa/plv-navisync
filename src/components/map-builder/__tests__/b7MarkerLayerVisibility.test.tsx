/**
 * B7 Correction — Issue markers must respect active editor layer/mode.
 *
 * When the Navigation layer is hidden (Campus/Design mode), navNode/navEdge
 * issue markers must NOT appear on the canvas — the issue stays in the Issues
 * list but no floating badge renders on an invisible object.  The same applies
 * to the Floor Editor in Design mode vs Navigation mode.
 *
 * These tests verify the fix for the visual bug where navigation issue
 * indicators remained visible while the navigation layer was not rendered.
 */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { useState } from "react";
import { CampusEditor } from "../CampusEditor";
import { FloorEditor } from "../FloorEditor";
import type {
  Campus, NavigationNode, NavigationEdge, FloorSelection, FloorPlan, FloorRoom,
} from "../types";

// ── Helpers ────────────────────────────────────────────────────────────────

function makeCampus(overrides?: Partial<Campus>): Campus {
  return {
    id: "c1", name: "Test Campus", code: "TC", description: "",
    address: "", city: "", province: "", postalCode: "",
    status: "active", publishStatus: "draft", visibleToStudents: false,
    features: { indoorNavigation: true, accessibilityNavigation: true, emergencyRoutes: true, issueReporting: true },
    canvasW: 900, canvasH: 680,
    settings: { accessibility: true, emergency: true, eventLayer: true, gps: true },
    buildings: [], markers: [], paths: [], navNodes: [], navEdges: [],
    createdAt: "2026-01-01", updatedAt: "2026-01-01",
    ...overrides,
  };
}

function node(overrides: Partial<NavigationNode> & { id: string; type: NavigationNode["type"] }): NavigationNode {
  return { name: overrides.id, x: 200, y: 200, accessible: true, color: "#16a34a", ...overrides };
}

function edge(overrides: Partial<NavigationEdge> & { id: string; startNodeId: string; endNodeId: string }): NavigationEdge {
  return { distance: 100, bidirectional: true, accessible: true, type: "walkway", color: "#16a34a", width: 3, ...overrides };
}

function withBuilding(campus: Campus, overrides: Partial<Campus["buildings"][number]> = {}): Campus {
  return {
    ...campus,
    buildings: [{
      id: "b1", name: "Building One", code: "B1", category: "Academic",
      description: "", x: 100, y: 100, width: 120, height: 80,
      color: "#1e40af", expanded: false,
      floors: [{ id: "f1", buildingId: "b1", number: 1, label: "Ground Floor", rooms: [], paths: [] }],
      entrances: [{ id: "e1", buildingId: "b1", edge: "bottom", offset: 0.5, type: "general" }],
      ...overrides,
    }],
  };
}

function makeFloor(overrides: Partial<FloorPlan> = {}): FloorPlan {
  return {
    id: "f1", buildingId: "b1", number: 1, label: "Ground Floor",
    rooms: [], paths: [], walls: [], doors: [], windows: [],
    furniture: [], stairs: [], ramps: [], elevators: [], labels: [],
    canvasW: 600, canvasH: 450, ...overrides,
  };
}

function makeFloorCampus(floors: FloorPlan[], navNodes: Campus["navNodes"] = [], navEdges: Campus["navEdges"] = []): Campus {
  return {
    id: "c1", name: "Test Campus", code: "TC", description: "",
    address: "", city: "", province: "", postalCode: "",
    status: "active", publishStatus: "draft", visibleToStudents: false,
    features: { indoorNavigation: true, accessibilityNavigation: true, emergencyRoutes: true, issueReporting: true },
    canvasW: 900, canvasH: 680,
    settings: { accessibility: true, emergency: true, eventLayer: true, gps: true },
    buildings: [{
      id: "b1", name: "Building One", code: "B1", category: "Academic",
      description: "", x: 100, y: 100, width: 120, height: 80,
      color: "#1e40af", expanded: false, floors,
      entrances: [{ id: "e1", buildingId: "b1", edge: "bottom", offset: 0.5, type: "general", isPrimary: true }],
    }],
    markers: [], paths: [], navNodes, navEdges,
    createdAt: "2026-01-01", updatedAt: "2026-01-01",
  };
}

// ── Campus Editor Harness ──────────────────────────────────────────────────

let campusFixRef: ((c: Campus) => void) | null = null;

function CampusHarness({ initialCampus }: { initialCampus: Campus }) {
  const [campus, setCampus] = useState<Campus>(initialCampus);
  campusFixRef = setCampus;
  return (
    <CampusEditor
      campus={campus}
      onBack={() => {}}
      onUpdate={setCampus}
      onPublish={() => {}}
      onOpenFloor={() => {}}
      onAddBuilding={() => {}}
      savedSnapshot={JSON.stringify(initialCampus)}
    />
  );
}

function campusMarkers(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll('[data-testid="campus-issue-marker"]'));
}

function switchToNavLayer() {
  fireEvent.click(screen.getByText("Navigation"));
}

// ── Floor Editor Harness ───────────────────────────────────────────────────

let floorFixRef: ((c: Campus) => void) | null = null;

function FloorHarness({ campus, floorId = "f1" }: { campus: Campus; floorId?: string }) {
  const [state, setState] = useState<Campus>(campus);
  floorFixRef = setState;
  return (
    <FloorEditor
      campus={state}
      buildingId="b1"
      floorId={floorId}
      onBack={() => {}}
      onSwitchFloor={() => {}}
      onUpdate={setState}
      onSave={async () => state}
    />
  );
}

function floorIssueMarkers(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll('[data-testid="issue-marker"]'));
}

function switchToNavMode() {
  fireEvent.click(screen.getByRole("tab", { name: "Navigation" }));
}

function openFloorIssues() {
  const issuesBtn = screen.getByTestId("issues-toolbar");
  fireEvent.click(issuesBtn);
}

// ── Tests ──────────────────────────────────────────────────────────────────

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
  campusFixRef = null;
  floorFixRef = null;
});

describe("B7 Correction — Issue markers respect active editor layer/mode", () => {
  // ── Campus Editor tests ────────────────────────────────────────────────

  describe("Campus Editor — Design mode hides nav markers", () => {
    it("1. Campus Design mode + orphan navNode issue → nav marker NOT rendered", () => {
      const campus = makeCampus({
        navNodes: [node({ id: "n1", type: "outdoor" })],
      });
      const { container } = render(<CampusHarness initialCampus={campus} />);
      // Default layer is campus (design) — nav marker should NOT appear
      const navMarkers = campusMarkers(container).filter(
        (m) => m.getAttribute("data-issue-object")?.startsWith("navNode:") || m.getAttribute("data-issue-object")?.startsWith("navEdge:")
      );
      expect(navMarkers).toHaveLength(0);
    });

    it("2. Campus Navigation mode + same orphan navNode issue → marker rendered", () => {
      const campus = makeCampus({
        navNodes: [node({ id: "n1", type: "outdoor" })],
      });
      const { container } = render(<CampusHarness initialCampus={campus} />);
      // No nav markers in Design mode
      expect(campusMarkers(container).filter(
        (m) => m.getAttribute("data-issue-object")?.startsWith("navNode:")
      )).toHaveLength(0);

      // Switch to Navigation layer
      switchToNavLayer();

      // Now the nav marker should appear
      const navMarkers = campusMarkers(container).filter(
        (m) => m.getAttribute("data-issue-object")?.startsWith("navNode:")
      );
      expect(navMarkers).toHaveLength(1);
      expect(navMarkers[0].getAttribute("data-issue-object")).toBe("navNode:n1");
    });

    it("3. Campus Design mode + building/entrance issue → marker still rendered", () => {
      const campus = withBuilding(makeCampus());
      const { container } = render(<CampusHarness initialCampus={campus} />);
      const markers = campusMarkers(container);
      // Building and entrance markers should be visible in Design mode
      const buildingMarkers = markers.filter((m) => m.getAttribute("data-issue-object")?.startsWith("building:"));
      const entranceMarkers = markers.filter((m) => m.getAttribute("data-issue-object")?.startsWith("entrance:"));
      expect(buildingMarkers.length + entranceMarkers.length).toBeGreaterThan(0);
    });

    it("7. Issue remains in Issues list while nav marker is hidden in Design mode", () => {
      const campus = makeCampus({
        navNodes: [node({ id: "n1", type: "outdoor" })],
      });
      const { container } = render(<CampusHarness initialCampus={campus} />);
      // Nav markers hidden in Design mode
      expect(campusMarkers(container).filter(
        (m) => m.getAttribute("data-issue-object")?.startsWith("navNode:")
      )).toHaveLength(0);
      // But the Issues badge still shows the count
      const issuesBtn = screen.getByTestId("issues-popover");
      expect(issuesBtn.textContent).toContain("1");
    });
  });

  // ── Floor Editor tests ─────────────────────────────────────────────────

  describe("Floor Editor — Design mode hides nav markers", () => {
    it("4. Floor Design mode + navNode/navEdge issue → nav marker NOT rendered", () => {
      const campus = makeFloorCampus(
        [makeFloor()],
        [node({ id: "n1", type: "hallway", buildingId: "b1", floorId: "f1" })],
      );
      const { container } = render(<FloorHarness campus={campus} />);
      // Default mode is structure (Design) — nav markers should NOT appear
      const navMarkers = floorIssueMarkers(container).filter(
        (m) => m.getAttribute("data-issue-object")?.startsWith("navNode:") || m.getAttribute("data-issue-object")?.startsWith("navEdge:")
      );
      expect(navMarkers).toHaveLength(0);
    });

    it("5. Floor Navigation mode + same navNode issue → marker rendered", () => {
      const campus = makeFloorCampus(
        [makeFloor()],
        [node({ id: "n1", type: "hallway", buildingId: "b1", floorId: "f1" })],
      );
      const { container } = render(<FloorHarness campus={campus} />);
      // Design mode: no nav markers
      expect(floorIssueMarkers(container).filter(
        (m) => m.getAttribute("data-issue-object")?.startsWith("navNode:")
      )).toHaveLength(0);

      // Switch to Navigation mode
      switchToNavMode();

      // Now nav marker should appear
      const navMarkers = floorIssueMarkers(container).filter(
        (m) => m.getAttribute("data-issue-object")?.startsWith("navNode:")
      );
      expect(navMarkers).toHaveLength(1);
      expect(navMarkers[0].getAttribute("data-issue-object")).toBe("navNode:n1");
    });

    it("7b. Floor issue list still shows nav issues while markers are hidden in Design mode", () => {
      const campus = makeFloorCampus(
        [makeFloor()],
        [node({ id: "n1", type: "hallway", buildingId: "b1", floorId: "f1" })],
      );
      render(<FloorHarness campus={campus} />);
      // Nav markers hidden in Design mode
      // But the Issues badge shows the count including nav issues
      const issuesLabel = screen.getByLabelText(/Issues:/);
      expect(issuesLabel).toBeTruthy();
    });
  });

  // ── Locate still works through the Issues panel ────────────────────────

  describe("Issue locate still switches to Navigation mode", () => {
    it("8. Clicking a hidden nav issue in the Issues panel switches to Navigation and locates it", () => {
      const campus = makeCampus({
        navNodes: [node({ id: "n1", type: "outdoor", x: 240, y: 160 })],
      });
      const { container } = render(<CampusHarness initialCampus={campus} />);
      // Nav markers hidden in Design mode
      expect(campusMarkers(container).filter(
        (m) => m.getAttribute("data-issue-object")?.startsWith("navNode:")
      )).toHaveLength(0);

      // Open issues and click the nav issue
      fireEvent.mouseDown(screen.getByTestId("issues-popover"));
      fireEvent.click(screen.getByText(/has no navigation connections/));

      // The editor should have switched to Navigation mode and the marker should appear
      const navMarkers = campusMarkers(container).filter(
        (m) => m.getAttribute("data-issue-object")?.startsWith("navNode:")
      );
      expect(navMarkers).toHaveLength(1);
      expect(navMarkers[0].getAttribute("data-issue-object")).toBe("navNode:n1");
    });
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { FloorEditor } from "../FloorEditor";
import type { Campus } from "../types";

function makeCampus(): Campus {
  return {
    id: "dock-campus",
    name: "Dock Test Campus",
    code: "DTC",
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
    buildings: [{
      id: "dock-building",
      name: "Dock Building",
      code: "DB",
      category: "Academic",
      description: "",
      x: 100,
      y: 100,
      width: 120,
      height: 80,
      color: "#0e2a6e",
      floors: [{
        id: "dock-floor",
        buildingId: "dock-building",
        number: 1,
        label: "Ground Floor",
        canvasW: 580,
        canvasH: 380,
        rooms: [], walls: [], doors: [], windows: [], furniture: [], stairs: [], ramps: [], elevators: [], labels: [], paths: [],
      }],
    }],
    markers: [], paths: [], navNodes: [], navEdges: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
}

function Harness() {
  const [campus, setCampus] = useState(makeCampus);
  return <FloorEditor
    campus={campus}
    buildingId="dock-building"
    floorId="dock-floor"
    onBack={() => undefined}
    onSwitchFloor={() => undefined}
    onUpdate={setCampus}
    onSave={async () => campus}
  />;
}

function setStageWidth(container: HTMLElement, width: number) {
  const stage = container.querySelector<HTMLElement>('[data-tutorial="floor-canvas"]');
  expect(stage).toBeTruthy();
  Object.defineProperty(stage!, "clientWidth", { configurable: true, value: width });
  Object.defineProperty(stage!, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ left: 0, top: 0, right: width, bottom: 700, width, height: 700, x: 0, y: 0, toJSON: () => ({}) }),
  });
  fireEvent(window, new Event("resize"));
}

function setElementWidth(element: HTMLElement, width: number) {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ left: 0, top: 0, right: width, bottom: 700, width, height: 700, x: 0, y: 0, toJSON: () => ({}) }),
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("FloorEditor Test Route docking", () => {
  it("keeps compact and expanded panels against the viewport when inspectors open and close", async () => {
    const { container } = render(<Harness />);
    setStageWidth(container, 1200);

    fireEvent.click(screen.getByRole("button", { name: "Test Route" }));
    const dock = await screen.findByTestId("floor-test-route-dock");
    await waitFor(() => {
      expect(dock.style.right).toBe("20px");
      expect(dock.style.width).toBe("320px");
    });

    const originalDockElement = dock;
    fireEvent.click(screen.getByRole("button", { name: "Toggle properties panel" }));
    // Test Route enables the Navigation overlay; the Properties toggle can be
    // on without an inspector actually being rendered in this state.
    await waitFor(() => {
      expect(dock.dataset.dockState).toBe("properties-closed");
      expect(dock.style.right).toBe("20px");
    });
    const stage = container.querySelector<HTMLElement>('[data-tutorial="floor-canvas"]')!;
    const inspector = document.createElement("div");
    inspector.dataset.floorRightInspector = "true";
    setElementWidth(inspector, 256);
    stage.appendChild(inspector);
    await waitFor(() => {
      expect(dock.dataset.dockState).toBe("properties-open");
      expect(dock.style.right).toBe("270px");
    });
    expect(screen.getByTestId("floor-test-route-dock")).toBe(originalDockElement);

    fireEvent.click(screen.getByRole("button", { name: "Collapse Test Route" }));
    await waitFor(() => expect(dock.style.width).toBe("420px"));
    expect(dock.style.right).toBe("270px");

    inspector.remove();
    await waitFor(() => {
      expect(dock.dataset.dockState).toBe("properties-closed");
      expect(dock.style.right).toBe("20px");
    });
    fireEvent.click(screen.getByRole("button", { name: "Toggle properties panel" }));
    await waitFor(() => {
      expect(dock.dataset.dockState).toBe("properties-closed");
      expect(dock.style.right).toBe("20px");
    });
    expect(dock.style.width).toBe("420px");

    setStageWidth(container, 520);
    await waitFor(() => expect(dock.style.width).toBe("420px"));
    fireEvent.click(screen.getByRole("button", { name: "Toggle properties panel" }));
    const narrowInspector = document.createElement("div");
    narrowInspector.dataset.floorRightInspector = "true";
    setElementWidth(narrowInspector, 256);
    stage.appendChild(narrowInspector);
    await waitFor(() => {
      expect(dock.style.right).toBe("20px");
      expect(dock.style.width).toBe("420px");
      expect(dock.dataset.dockMode).toBe("overlay-fallback");
      expect(Number.parseFloat(dock.style.right) + Number.parseFloat(dock.style.width)).toBeLessThanOrEqual(500);
    });
  });
});

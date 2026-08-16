import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { FloorEditor } from "../FloorEditor";
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
    canvasW: 1200,
    canvasH: 800,
    settings: { accessibility: true, emergency: true, eventLayer: true, gps: true },
    buildings: [{
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
      floors: [{
        id: "f1",
        buildingId: "b1",
        number: 1,
        label: "Ground Floor",
        canvasW: 600,
        canvasH: 450,
        backgroundImage: {
          storagePath: "campus/building/floor/plan.png",
          fileName: "plan.png",
          mimeType: "image/png",
          size: 12,
          visible: true,
          opacity: 0.42,
          locked: true,
          x: 0,
          y: 0,
          width: 600,
          height: 450,
          rotation: 0,
        },
        calibration: {
          metersPerUnit: 0.05,
          editorDistance: 200,
          realDistanceM: 10,
          points: [{ x: 0, y: 0 }, { x: 200, y: 0 }],
        },
        rooms: [],
        paths: [],
        walls: [],
        doors: [],
        windows: [],
        furniture: [],
        stairs: [],
        ramps: [],
        elevators: [],
        labels: [],
      }, {
        id: "f2",
        buildingId: "b1",
        number: 2,
        label: "Custom Floor",
        canvasW: 1200,
        canvasH: 800,
        rooms: [],
        paths: [],
        walls: [],
        doors: [],
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
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
}

function Harness({ onCampusChange }: { onCampusChange?: (campus: Campus) => void }) {
  const [campus, setCampus] = useState(() => makeCampus());
  return (
    <FloorEditor
      campus={campus}
      buildingId="b1"
      floorId="f1"
      onBack={() => {}}
      onSwitchFloor={() => {}}
      onUpdate={(next) => { onCampusChange?.(next); setCampus(next); }}
    />
  );
}

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => window.setTimeout(() => cb(performance.now()), 0));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("FloorEditor floor view cleanup", () => {
  it("auto-fits the floor viewport on open without mutating floor dimensions", async () => {
    let latest = makeCampus();
    const { container } = render(<Harness onCampusChange={(campus) => { latest = campus; }} />);
    const svg = Array.from(container.querySelectorAll("svg")).find((item) => item.getAttribute("viewBox") === "0 0 600 450") as SVGSVGElement;
    expect(svg).toBeTruthy();
    Object.defineProperty(svg, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 300, height: 220, right: 300, bottom: 220, x: 0, y: 0, toJSON: () => ({}) }),
    });
    Object.defineProperty(svg.viewBox, "baseVal", {
      configurable: true,
      value: { width: 600, height: 450, x: 0, y: 0 },
    });
    Object.defineProperty(svg.parentElement, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 300, height: 220, right: 300, bottom: 220, x: 0, y: 0, toJSON: () => ({}) }),
    });

    await waitFor(() => {
      expect(container.querySelector('g[transform="translate(0,0) scale(1)"]')).toBeNull();
    });
    expect(latest.buildings[0].floors[0]).toMatchObject({ canvasW: 600, canvasH: 450 });
  });

  it("keeps dormant import/calibration/measure out of the normal workflow", () => {
    render(<Harness />);
    expect(screen.queryByText("Measure")).toBeNull();
    expect(screen.queryByText("Import Floor Plan")).toBeNull();
    expect(screen.queryByText("Calibrate Scale")).toBeNull();
    expect(screen.queryByTestId("floor-calibration-line")).toBeNull();
    expect(screen.queryByTestId("floor-plan-background-layer")).toBeNull();
  });
});

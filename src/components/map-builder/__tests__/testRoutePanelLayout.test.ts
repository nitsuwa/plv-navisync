import { describe, expect, it } from "vitest";
import {
  resolveTestRoutePanelLayout,
  TEST_ROUTE_PANEL_DESKTOP_WIDTH,
} from "../testRoutePanelLayout";

describe("Test Route desktop panel layout", () => {
  it("keeps the canonical right anchor when the Properties drawer is closed", () => {
    expect(resolveTestRoutePanelLayout({
      viewportWidth: 1280,
      panelWidth: TEST_ROUTE_PANEL_DESKTOP_WIDTH,
      propertiesVisible: false,
      propertiesWidth: 380,
    })).toEqual({ right: 20, width: 420, collidesWithProperties: false, overlaysProperties: false });
  });

  it("ignores a measured but hidden Properties drawer", () => {
    const result = resolveTestRoutePanelLayout({
      viewportWidth: 1280,
      panelWidth: TEST_ROUTE_PANEL_DESKTOP_WIDTH,
      propertiesVisible: false,
      propertiesWidth: 400,
    });
    expect(result.right).toBe(20);
  });

  it("clears an open Properties drawer by its actual width plus one consistent gap", () => {
    expect(resolveTestRoutePanelLayout({
      viewportWidth: 1280,
      panelWidth: TEST_ROUTE_PANEL_DESKTOP_WIDTH,
      propertiesVisible: true,
      propertiesWidth: 376,
    })).toEqual({ right: 390, width: 420, collidesWithProperties: true, overlaysProperties: false });
  });

  it("returns to the exact canonical anchor when the drawer closes", () => {
    const open = resolveTestRoutePanelLayout({
      viewportWidth: 1280,
      panelWidth: TEST_ROUTE_PANEL_DESKTOP_WIDTH,
      propertiesVisible: true,
      propertiesWidth: 376,
    });
    const closed = resolveTestRoutePanelLayout({
      viewportWidth: 1280,
      panelWidth: TEST_ROUTE_PANEL_DESKTOP_WIDTH,
      propertiesVisible: false,
      propertiesWidth: 376,
    });
    expect(open.right).toBe(390);
    expect(closed.right).toBe(20);
  });

  it("shrinks only to the available viewport width when a drawer collision leaves less room", () => {
    expect(resolveTestRoutePanelLayout({
      viewportWidth: 800,
      panelWidth: TEST_ROUTE_PANEL_DESKTOP_WIDTH,
      propertiesVisible: true,
      propertiesWidth: 360,
    })).toEqual({ right: 374, width: 406, collidesWithProperties: true, overlaysProperties: false });
  });

  it("keeps the same width and anchor inputs for setup, route results, and every route mode", () => {
    const layouts = ["setup", "standard", "accessible", "emergency", "route-stages"].map(() =>
      resolveTestRoutePanelLayout({
        viewportWidth: 1280,
        panelWidth: TEST_ROUTE_PANEL_DESKTOP_WIDTH,
        propertiesVisible: false,
        propertiesWidth: 0,
      }),
    );
    expect(new Set(layouts.map(({ right, width }) => `${right}:${width}`))).toEqual(new Set(["20:420"]));
  });

  it("uses the measured inspector width for each visible sidebar type", () => {
    const narrowInspector = resolveTestRoutePanelLayout({
      viewportWidth: 1024,
      panelWidth: 320,
      propertiesVisible: true,
      propertiesWidth: 240,
    });
    const wideInspector = resolveTestRoutePanelLayout({
      viewportWidth: 1024,
      panelWidth: 320,
      propertiesVisible: true,
      propertiesWidth: 384,
    });
    expect(narrowInspector.right).toBe(254);
    expect(wideInspector.right).toBe(398);
    expect(wideInspector.width).toBe(320);
  });

  it("shrinks compact and expanded panels to fit narrow editor viewports", () => {
    const compact = resolveTestRoutePanelLayout({
      viewportWidth: 520,
      panelWidth: TEST_ROUTE_PANEL_DESKTOP_WIDTH,
      propertiesVisible: true,
      propertiesWidth: 256,
    });
    const expanded = resolveTestRoutePanelLayout({
      viewportWidth: 520,
      panelWidth: 320,
      propertiesVisible: true,
      propertiesWidth: 256,
    });
    expect(compact).toEqual({ right: 20, width: 420, collidesWithProperties: true, overlaysProperties: true });
    expect(expanded).toEqual({ right: 20, width: 320, collidesWithProperties: true, overlaysProperties: true });
  });

  it("keeps a usable adjacent width when the editor has room beside the inspector", () => {
    expect(resolveTestRoutePanelLayout({
      viewportWidth: 620,
      panelWidth: TEST_ROUTE_PANEL_DESKTOP_WIDTH,
      propertiesVisible: true,
      propertiesWidth: 256,
    })).toEqual({ right: 270, width: 330, collidesWithProperties: true, overlaysProperties: false });
  });
});

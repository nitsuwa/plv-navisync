import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import type { ComponentProps } from "react";
import { CampusMapPage } from "../CampusMapPage";
import { eventOverlayService } from "../../services/eventOverlayService";
import type { Campus as EditorCampus } from "../../components/map-builder/types";

const previewCampus: EditorCampus = {
  id: "campus-test",
  name: "PLV Main Campus",
  code: "MAIN",
  description: "Test campus",
  address: "Maysan Road",
  city: "Valenzuela",
  province: "Metro Manila",
  postalCode: "1442",
  status: "active",
  publishStatus: "published",
  visibleToStudents: true,
  features: {
    indoorNavigation: true,
    accessibilityNavigation: true,
    emergencyRoutes: true,
    issueReporting: true,
  },
  canvasW: 900,
  canvasH: 680,
  canvasConfigured: true,
  settings: { accessibility: true, emergency: true, eventLayer: true, gps: true },
  buildings: [
    {
      id: "building-test",
      name: "Science Hall",
      code: "SCI",
      category: "academic",
      description: "",
      x: 120,
      y: 120,
      width: 160,
      height: 100,
      color: "#1d4ed8",
      floors: [],
    },
  ],
  markers: [],
  paths: [],
  createdAt: "2026-01-01",
  updatedAt: "2026-01-02",
  publishedAt: "2026-01-02",
};

vi.mock("../../services/eventOverlayService", () => ({
  eventOverlayService: {
    getApprovedOverlaysForCampus: vi.fn().mockResolvedValue([]),
    getApprovedOverlaysForFloor: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../../services/usageAnalyticsService", () => ({
  usageAnalyticsService: { track: vi.fn() },
}));

describe("CampusMapPage event overlays", () => {
  const renderCampusMap = (props: ComponentProps<typeof CampusMapPage> = {}) =>
    render(
      <MemoryRouter>
        <CampusMapPage {...props} />
      </MemoryRouter>,
    );

  it("loads approved campus overlays without throwing a missing service reference", async () => {
    renderCampusMap();
    await waitFor(() => expect(eventOverlayService.getApprovedOverlaysForCampus).toHaveBeenCalled());
  });

  it("exposes the responsive student map landmarks and controls", async () => {
    renderCampusMap({ previewCampus });

    await waitFor(() => {
      expect(screen.getByTestId("student-map-surface")).toHaveAttribute(
        "aria-label",
        "Interactive campus map",
      );
      expect(screen.getByTestId("student-map-controls")).toBeInTheDocument();
      expect(screen.getByTestId("student-map-quick-filters")).toBeInTheDocument();
      expect(screen.getByRole("searchbox", { name: "Search campus map" })).toHaveAttribute(
        "placeholder",
        "Search buildings, offices, and rooms",
      );
    });
  });

  it("labels manual pin mode as dropping a pin", async () => {
    renderCampusMap({ previewCampus });

    const dropPinButton = await screen.findByRole("button", { name: "Drop pin" });
    fireEvent.click(dropPinButton);

    expect(screen.getByText("Tap anywhere on the map to drop a pin")).toBeInTheDocument();
    expect(screen.queryByText("Tap anywhere on the map to set your location")).not.toBeInTheDocument();
  });

  it("zooms the student map when a two-finger pinch spreads", async () => {
    renderCampusMap({ previewCampus });

    const surface = await screen.findByTestId("student-map-surface");
    const svg = surface.querySelector("svg");
    expect(svg).not.toBeNull();

    const point = {
      x: 200,
      y: 150,
      matrixTransform: () => ({ x: 200, y: 150 }),
    } as unknown as DOMPoint;
    const matrix = {
      inverse: () => matrix,
    } as unknown as DOMMatrix;
    Object.defineProperty(svg!, "createSVGPoint", {
      configurable: true,
      value: () => point,
    });
    Object.defineProperty(svg!, "getScreenCTM", {
      configurable: true,
      value: () => matrix,
    });

    const transform = () => surface.querySelector("svg > g[transform]")?.getAttribute("transform") ?? "";
    const before = transform();

    fireEvent.touchStart(surface, {
      touches: [
        { clientX: 100, clientY: 240 },
        { clientX: 200, clientY: 240 },
      ],
    });
    fireEvent.touchMove(surface, {
      touches: [
        { clientX: 50, clientY: 240 },
        { clientX: 250, clientY: 240 },
      ],
    });

    await waitFor(() => expect(transform()).not.toBe(before));
    expect(transform()).toContain("scale(");
  });

  it("zooms the student map when a touch pointer pinch spreads", async () => {
    renderCampusMap({ previewCampus });

    const surface = await screen.findByTestId("student-map-surface");
    const svg = surface.querySelector("svg");
    expect(svg).not.toBeNull();

    const point = {
      x: 200,
      y: 150,
      matrixTransform: () => ({ x: 200, y: 150 }),
    } as unknown as DOMPoint;
    const matrix = {
      inverse: () => matrix,
    } as unknown as DOMMatrix;
    Object.defineProperty(svg!, "createSVGPoint", {
      configurable: true,
      value: () => point,
    });
    Object.defineProperty(svg!, "getScreenCTM", {
      configurable: true,
      value: () => matrix,
    });

    const transform = () => surface.querySelector("svg > g[transform]")?.getAttribute("transform") ?? "";
    const before = transform();

    fireEvent.pointerDown(surface, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 100,
      clientY: 240,
    });
    fireEvent.pointerDown(surface, {
      pointerId: 2,
      pointerType: "touch",
      clientX: 200,
      clientY: 240,
    });
    fireEvent.pointerMove(surface, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 50,
      clientY: 240,
    });
    fireEvent.pointerMove(surface, {
      pointerId: 2,
      pointerType: "touch",
      clientX: 250,
      clientY: 240,
    });

    await waitFor(() => expect(transform()).not.toBe(before));
  });

  it("fills the mobile viewport behind the floating bottom navigation", async () => {
    renderCampusMap({ previewCampus });

    const surface = await screen.findByTestId("student-map-surface");

    expect(surface).toHaveClass("h-[100dvh]");
    expect(surface).toHaveClass("md:h-[calc(100dvh-76px)]");
  });

  it("keeps the mobile building sheet closed when directions opens", async () => {
    renderCampusMap({ previewCampus });

    fireEvent.click(await screen.findByRole("button", { name: "Open Science Hall (SCI)" }));
    expect(screen.getByTestId("mobile-building-sheet")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open directions" }));

    expect(screen.getByTestId("route-planner-dialog")).toBeInTheDocument();
    expect(screen.queryByTestId("mobile-building-sheet")).not.toBeInTheDocument();
  });
});

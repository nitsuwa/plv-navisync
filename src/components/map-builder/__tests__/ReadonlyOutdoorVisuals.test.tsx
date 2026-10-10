import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Campus } from "../types";
import { projectReadonlyOutdoorCampus } from "../../../lib/readonlyOutdoorCampus";
import * as studentRouteFlow from "../../../lib/studentRouteFlow";
import { OutdoorGroundAreaArtwork, ReadonlyOutdoorArtworkLayer, ReadonlyOutdoorCampusScene, exteriorEmergencyStairVisualDimensions } from "../ReadonlyOutdoorVisuals";
import { entranceDirectionBadgePlacement } from "../EntranceDirectionBadge";
import { RouteMapOverlay } from "../../map/RouteMapOverlay";

const campus = {
  id: "c1",
  canvasW: 900,
  canvasH: 680,
  buildings: [{
    id: "b1", name: "Library", code: "LIB", category: "facility", description: "",
    x: 100, y: 80, width: 220, height: 120, color: "#0f4c81", rotation: 12, opacity: 0.9,
    floors: [], entrances: [{ id: "e1", buildingId: "b1", edge: "bottom" as const, offset: 0.5, accessible: true }],
    exteriorEmergencyStairs: [{ id: "s1", buildingId: "b1", label: "Exit Stair", state: "open" as const, width: 28, height: 42, attachment: { edge: "right" as const, offset: 0.4 }, servedFloorIds: [], sharedId: "s1", emergencySafe: true }],
  }],
  markers: [
    { id: "m1", name: "Gate", type: "entrance", x: 30, y: 40, color: "#111827" },
    { id: "m2", name: "Landmark", type: "landmark", x: 70, y: 40, color: "#7c3aed" },
  ],
  paths: [{ id: "p1", points: [{ x: 0, y: 0 }, { x: 100, y: 80 }], type: "walkway", color: "#b45309", width: 10 }],
  decorAssets: [
    { id: "d1", type: "tree" as const, x: 60, y: 60, scale: 1 },
    { id: "surface-parking", type: "ground-area" as const, groundType: "parking" as const, x: 420, y: 360, width: 220, height: 120, scale: 1, zOrder: -1000 },
    { id: "monument-1", type: "monument" as const, x: 460, y: 290, scale: 1 },
  ],
} as unknown as Campus;

describe("ReadonlyOutdoorCampusScene", () => {
  it("renders authored physical scene objects without graph overlays", () => {
    render(<svg><ReadonlyOutdoorCampusScene campus={projectReadonlyOutdoorCampus(campus)} onSelectBuilding={vi.fn()} /></svg>);
    expect(screen.getByTestId("readonly-outdoor-scene")).toBeInTheDocument();
    expect(screen.getByTestId("readonly-building")).toHaveAttribute("data-building-id", "b1");
    expect(screen.getByTestId("readonly-campus-path")).toHaveAttribute("data-path-id", "p1");
    expect(screen.getByTestId("readonly-entrance")).toHaveAttribute("data-entrance-id", "e1");
    expect(screen.getByTestId("readonly-exterior-emergency-stair")).toHaveAttribute("data-stair-id", "s1");
    expect(screen.getByTestId("exterior-stair-module")).toBeInTheDocument();
    expect(screen.getByTestId("exterior-stair-landing")).toBeInTheDocument();
    expect(screen.getAllByTestId("exterior-stair-tread").length).toBeGreaterThan(2);
    expect(screen.getAllByTestId("readonly-decor").some((node) => node.getAttribute("data-asset-id") === "d1")).toBe(true);
    expect(screen.getByTestId("readonly-ground-area")).toHaveAttribute("data-ground-type", "parking");
    expect(screen.getAllByTestId("readonly-decor").some((node) => node.getAttribute("data-asset-id") === "monument-1")).toBe(true);
    expect(screen.queryByTestId("nav-graph-layer")).not.toBeInTheDocument();
  });

  it("keeps regular outdoor assets at the Admin canvas display scale", () => {
    render(<svg><ReadonlyOutdoorCampusScene campus={projectReadonlyOutdoorCampus(campus)} /></svg>);

    const tree = screen.getAllByTestId("readonly-decor").find((node) => node.getAttribute("data-asset-id") === "d1");
    const treeArtwork = tree?.querySelector("svg");

    // The Admin Canvas renders the tree descriptor (24 × 28) at the shared
    // 3× decor scale. Student Preview must preserve that authored footprint.
    expect(treeArtwork).toHaveAttribute("width", "72");
    expect(treeArtwork).toHaveAttribute("height", "84");
  });

  it("uses the dedicated Suhay Husay symbol only when Student landmark presentation is enabled", () => {
    const landmarkCampus = {
      ...campus,
      markers: [{ id: "suhay-place", name: "Suhay Husay", type: "landmark", x: 460, y: 290, color: "#7c3aed" }],
      decorAssets: [{ id: "suhay-statue", type: "monument", name: "Suhay Husay", x: 460, y: 290, scale: 1 }],
    } as unknown as Campus;
    const projected = projectReadonlyOutdoorCampus(landmarkCampus);

    const admin = render(<svg><ReadonlyOutdoorCampusScene campus={projected} /></svg>);
    expect(admin.getByTestId("readonly-decor")).toHaveAttribute("data-asset-id", "suhay-statue");
    expect(admin.queryByTestId("student-suhay-husay-2d-symbol")).not.toBeInTheDocument();

    admin.unmount();
    render(<svg><ReadonlyOutdoorCampusScene campus={projected} studentSuhayHusayLandmark selectedCampusPlaceId="suhay-place" /></svg>);
    expect(screen.getByTestId("student-suhay-husay-2d-symbol")).toHaveAttribute("data-asset-id", "suhay-statue");
    expect(screen.getByTestId("student-suhay-husay-2d-symbol")).toHaveAttribute("data-version", "v2");
    expect(screen.getByTestId("student-suhay-standing-silhouette")).toBeInTheDocument();
    expect(screen.getByTestId("student-suhay-seated-silhouette")).toBeInTheDocument();
    expect(screen.getByTestId("student-suhay-husay-selection-ring")).toBeInTheDocument();
    expect(screen.queryByTestId("readonly-decor")).not.toBeInTheDocument();
  });

  it("honors Admin ground-area stacking order in the read-only scene", () => {
    const parking = { id: "parking", type: "parking-lot" as const, groundType: "parking" as const, x: 200, y: 100, width: 220, height: 90, zOrder: 20 };
    const plaza = { id: "plaza", type: "plaza-area" as const, groundType: "plaza" as const, x: 200, y: 100, width: 220, height: 90, zOrder: 10 };
    const projected = projectReadonlyOutdoorCampus({ ...campus, decorAssets: [parking, plaza] });
    render(<svg><ReadonlyOutdoorCampusScene campus={projected} /></svg>);

    // Admin draws lower zOrder first. The later Parking Lot remains visible
    // over the overlapping Plaza exactly as it does in the editor.
    expect(screen.getAllByTestId("readonly-ground-area").map((node) => node.getAttribute("data-ground-type")))
      .toEqual(["plaza", "parking"]);
    expect(screen.getByTestId("parking-stalls").querySelector("svg path[fill=\"#cbd5e1\"]")).toBeInTheDocument();
  });

  it("keeps the shared building visual pointer-transparent for an admin hit surface", () => {
    const onAdminHit = vi.fn();
    render(
      <svg>
        <g onClick={() => onAdminHit()}>
          <rect data-testid="admin-building-hit-target" x={90} y={70} width={240} height={140} fill="transparent" pointerEvents="all" />
          <ReadonlyOutdoorCampusScene campus={projectReadonlyOutdoorCampus(campus)} />
        </g>
      </svg>,
    );
    fireEvent.click(screen.getByTestId("admin-building-hit-target"));
    expect(onAdminHit).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("readonly-building")).toHaveAttribute("pointer-events", "none");
  });

  it("renders entrance callbacks without throwing and reports the owning building", () => {
    const onClickEntrance = vi.fn();
    render(<svg><ReadonlyOutdoorCampusScene campus={projectReadonlyOutdoorCampus(campus)} onClickEntrance={onClickEntrance} /></svg>);

    fireEvent.click(screen.getByTestId("readonly-entrance"));
    expect(onClickEntrance).toHaveBeenCalledTimes(1);
    expect(onClickEntrance).toHaveBeenCalledWith("b1");
  });

  it("can hide Student outdoor action pills while keeping entrance markers interactive", () => {
    const onClickEntrance = vi.fn();
    render(<svg><ReadonlyOutdoorCampusScene
      campus={projectReadonlyOutdoorCampus(campus)}
      onClickEntrance={onClickEntrance}
      showEntryPills={false}
    /></svg>);

    expect(screen.queryByTestId("student-enter-building-pill")).not.toBeInTheDocument();
    expect(screen.getByTestId("campus-entrance-artwork")).toBeInTheDocument();
    expect(screen.getByTestId("readonly-enter-building-door-hit-target")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("readonly-entrance"));
    expect(onClickEntrance).toHaveBeenCalledWith("b1");
  });

  it("highlights student map-pick buildings and places without Admin editing controls", () => {
    render(<svg><ReadonlyOutdoorCampusScene
      campus={projectReadonlyOutdoorCampus(campus)}
      mapPickActive
      onSelectBuilding={vi.fn()}
      onSelectCampusPlace={vi.fn()}
    /></svg>);
    expect(screen.getByTestId("student-map-pick-building-target")).toBeInTheDocument();
    expect(screen.getAllByTestId("student-map-pick-place-target")).toHaveLength(2);
    expect(screen.queryByTestId("nav-graph-layer")).not.toBeInTheDocument();
  });

  it("shows all authored Campus arrows and emphasizes only the valid Enter direction", () => {
    render(<svg><ReadonlyOutdoorCampusScene
      campus={projectReadonlyOutdoorCampus(campus)}
      onClickEntrance={vi.fn()}
      compactEntryActions
    /></svg>);
    const entrance = screen.getByTestId("readonly-entrance");
    expect(entrance).toHaveAttribute("aria-label", "Enter Library");
    const badge = screen.getByTestId("entrance-direction-badge");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute("data-screen-space", "true");
    expect(badge.querySelector('[data-testid="entrance-direction-disc"]')).toHaveAttribute("r", "7.5");
    expect(badge.querySelector('.student-transition-marker-lod')).toBeInTheDocument();
    expect(badge.querySelectorAll("[data-transition-arrow]")).toHaveLength(2);
    expect(badge.querySelector('[data-transition-arrow="entrance"]')).not.toHaveAttribute("data-transition-emphasis");
    expect(badge.querySelector('[data-transition-arrow="exit"]')).not.toHaveAttribute("data-transition-emphasis");
    expect(screen.queryByTestId("student-enter-building-marker")).not.toBeInTheDocument();
    expect(screen.queryByTestId("student-enter-building-pill")).not.toBeInTheDocument();
    expect(screen.queryByTestId("student-exit-campus-marker")).not.toBeInTheDocument();
    fireEvent.focus(entrance);
    expect(screen.queryByTestId("student-transition-tooltip")).not.toBeInTheDocument();
    expect(badge.querySelector('[data-transition-arrow="entrance"]')).toHaveAttribute("data-transition-emphasis", "pressable");
    expect(screen.queryByTestId("student-enter-building-label")).not.toBeInTheDocument();
    fireEvent.blur(entrance);
    expect(screen.queryByTestId("student-transition-tooltip")).not.toBeInTheDocument();
  });

  it("keeps an authored exit-only Campus arrow visible but calm", () => {
    const exitOnlyCampus = {
      ...campus,
      buildings: [{ ...campus.buildings[0], entrances: [{ ...campus.buildings[0]!.entrances![0], direction: "exit_only" as const }] }],
    } as unknown as Campus;
    render(<svg><ReadonlyOutdoorCampusScene campus={projectReadonlyOutdoorCampus(exitOnlyCampus)} onClickEntrance={vi.fn()} compactEntryActions /></svg>);

    const badge = screen.getByTestId("entrance-direction-badge");
    expect(badge.querySelectorAll("[data-transition-arrow]")).toHaveLength(1);
    expect(badge.querySelector('[data-transition-arrow="exit"]')).toBeInTheDocument();
    expect(badge.querySelector('[data-testid$="-emphasis"]')).toBeNull();
    expect(screen.queryByRole("button", { name: "Enter Library" })).not.toBeInTheDocument();
  });

  it("lets the active route direction override Campus context while retaining the opposite arrow", () => {
    render(<svg><ReadonlyOutdoorCampusScene
      campus={projectReadonlyOutdoorCampus(campus)}
      onClickEntrance={vi.fn()}
      compactEntryActions
      activeEntranceId="e1"
    /></svg>);
    const badge = screen.getByTestId("entrance-direction-badge");
    expect(badge.querySelector('[data-transition-arrow="entrance"]')).toHaveAttribute("data-transition-emphasis", "active");
    expect(badge.querySelector('[data-transition-arrow="exit"]')).not.toHaveAttribute("data-transition-emphasis");
    expect(badge.querySelector('[data-testid="entrance-direction-exit-emphasis"]')).toBeNull();
    expect(screen.queryByTestId("student-transition-tooltip")).not.toBeInTheDocument();
  });

  it("adds hover emphasis without moving the Campus doorway action anchor", () => {
    render(<svg><ReadonlyOutdoorCampusScene
      campus={projectReadonlyOutdoorCampus(campus)}
      onClickEntrance={vi.fn()}
      compactEntryActions
    /></svg>);
    const entrance = screen.getByTestId("readonly-entrance");
    const badge = screen.getByTestId("entrance-direction-badge");
    const anchorTransform = badge.getAttribute("transform");
    const anchorX = badge.getAttribute("data-world-anchor-x");
    const anchorY = badge.getAttribute("data-world-anchor-y");
    expect(entrance.querySelector("title")).toHaveTextContent("Enter LIB building");
    expect(badge.querySelector('[data-testid="student-doorway-micro-label-text"]')).toHaveTextContent("Enter");
    expect(badge.querySelector('[data-testid="student-doorway-micro-label-text"]')).toHaveAttribute("font-size", "11.5");
    expect(badge.querySelector('[data-testid="student-doorway-micro-label"]')).toHaveAttribute("data-label-side", "bottom");

    fireEvent.mouseEnter(entrance);

    expect(badge).toHaveAttribute("transform", anchorTransform);
    expect(badge).toHaveAttribute("data-world-anchor-x", anchorX);
    expect(badge).toHaveAttribute("data-world-anchor-y", anchorY);
    expect(screen.getByTestId("student-direction-glyph")).not.toHaveAttribute("transform");
    expect(badge).toHaveAttribute("data-emphasized-direction", "entrance");
    expect(badge.querySelector('[data-testid="student-doorway-micro-label-text"]')).toHaveTextContent("Enter LIB");
  });

  it("quietly removes the passive doorway arrow while its active route control owns the transition", () => {
    render(<svg><ReadonlyOutdoorCampusScene
      campus={projectReadonlyOutdoorCampus(campus)}
      onClickEntrance={vi.fn()}
      compactEntryActions
      activeEntranceId="e1"
      suppressActiveEntranceId="e1"
    /></svg>);

    expect(screen.queryByTestId("entrance-direction-badge")).not.toBeInTheDocument();
    expect(screen.getByTestId("readonly-enter-building-door-hit-target")).toBeInTheDocument();
  });

  it("keeps Campus arrows at low and high zoom and uses static emphasis for reduced motion", () => {
    const props = {
      campus: projectReadonlyOutdoorCampus(campus),
      onClickEntrance: vi.fn(),
      compactEntryActions: true,
      reducedMotion: true,
    } as const;
    const { rerender } = render(<svg><ReadonlyOutdoorCampusScene {...props} zoom={0.25} /></svg>);
    const badge = screen.getByTestId("entrance-direction-badge");
    expect(badge.querySelectorAll("[data-transition-arrow]")).toHaveLength(2);
    expect(badge.querySelector('[data-testid="entrance-direction-disc"]')).toHaveAttribute("vector-effect", "non-scaling-stroke");
    expect(badge.querySelector('[data-direction="entrance"]')).toHaveAttribute("vector-effect", "non-scaling-stroke");
    expect(badge.querySelector('[data-testid="entrance-direction-entrance-emphasis"] animate')).toBeNull();
    rerender(<svg><ReadonlyOutdoorCampusScene {...props} zoom={4} /></svg>);
    expect(screen.getByTestId("entrance-direction-badge")).toBe(badge);
    expect(badge.querySelectorAll("[data-transition-arrow]")).toHaveLength(2);
  });

  it("keeps the active Campus arrow and pulse on one authored doorway when zoom changes", () => {
    const projected = projectReadonlyOutdoorCampus(campus);
    const props = { campus: projected, compactEntryActions: true, onClickEntrance: vi.fn(), activeEntranceId: "e1" };
    const deriveDuplicates = vi.spyOn(studentRouteFlow, "studentOverviewDuplicateIds");
    const { rerender } = render(<svg><ReadonlyOutdoorCampusScene {...props} zoom={0.18} /></svg>);
    const initialDerivations = deriveDuplicates.mock.calls.length;
    const badge = screen.getByTestId("entrance-direction-badge");
    const x = Number(badge.getAttribute("data-world-anchor-x"));
    const y = Number(badge.getAttribute("data-world-anchor-y"));
    const placement = entranceDirectionBadgePlacement(x, y, "bottom", 12);
    expect(badge.getAttribute("transform")).toBe(`translate(${placement.x},${placement.y}) rotate(${placement.angle})`);
    expect(screen.queryByTestId("student-transition-tooltip")).not.toBeInTheDocument();
    expect(badge.querySelector('[data-testid="entrance-direction-pressable-pulse"]')).toBeNull();
    for (const zoom of [0.4, 1, 3.5]) {
      rerender(<svg><ReadonlyOutdoorCampusScene {...props} zoom={zoom} /></svg>);
      expect(screen.getByTestId("entrance-direction-badge")).toBe(badge);
      expect(badge.getAttribute("transform")).toBe(`translate(${placement.x},${placement.y}) rotate(${placement.angle})`);
      expect(screen.queryByTestId("student-transition-tooltip")).not.toBeInTheDocument();
    }
    expect(deriveDuplicates).toHaveBeenCalledTimes(initialDerivations);
    deriveDuplicates.mockRestore();
  });

  it("keeps the pulse browser-native and hover local to the entrance layer", () => {
    const component = ReadonlyOutdoorArtworkLayer as unknown as { type: (...args: unknown[]) => unknown };
    const artworkRender = vi.spyOn(component, "type");
    render(<svg><ReadonlyOutdoorCampusScene
      campus={projectReadonlyOutdoorCampus(campus)}
      onClickEntrance={vi.fn()}
      compactEntryActions
    /></svg>);
    const initialArtRenders = artworkRender.mock.calls.length;
    expect(screen.queryByTestId("entrance-direction-entrance-emphasis")).not.toBeInTheDocument();
    fireEvent.focus(screen.getByTestId("readonly-entrance"));
    expect(screen.queryByTestId("student-transition-tooltip")).not.toBeInTheDocument();
    expect(screen.getByTestId("entrance-direction-entrance-emphasis")).toBeInTheDocument();
    expect(artworkRender).toHaveBeenCalledTimes(initialArtRenders);
    artworkRender.mockRestore();
  });

  it("keeps the legacy non-student entrance presentation when compact actions are not enabled", () => {
    render(<svg><ReadonlyOutdoorCampusScene campus={projectReadonlyOutdoorCampus(campus)} onClickEntrance={vi.fn()} /></svg>);
    expect(screen.getByTestId("student-enter-building-pill")).toBeInTheDocument();
    expect(screen.queryByTestId("student-enter-building-marker")).not.toBeInTheDocument();
    expect(screen.getByTestId("entrance-direction-badge")).toBeInTheDocument();
  });

  it("emphasizes the active route entrance more strongly than other pressable entrances", () => {
    const twoEntrances = {
      ...campus,
      buildings: [{
        ...campus.buildings[0],
        entrances: [
          ...(campus.buildings[0]!.entrances ?? []),
          { id: "e2", buildingId: "b1", edge: "left" as const, offset: 0.3 },
        ],
      }],
      entrances: [
        { id: "e1", buildingId: "b1", edge: "bottom" as const, offset: 0.5, accessible: true },
        { id: "e2", buildingId: "b1", edge: "left" as const, offset: 0.3 },
      ],
    } as unknown as Campus;
    const { container, rerender } = render(<svg><ReadonlyOutdoorCampusScene
      campus={projectReadonlyOutdoorCampus(twoEntrances)} compactEntryActions onClickEntrance={vi.fn()}
      routeRelevantEntranceIds={new Set(["e1", "e2"])} activeEntranceId="e1"
    /></svg>);
    const badges = container.querySelectorAll('[data-testid="entrance-direction-badge"]');
    expect(badges).toHaveLength(2);
    const activeBadge = [...badges].find((badge) => badge.getAttribute("data-active-transition") === "true");
    const ordinaryBadge = [...badges].find((badge) => badge !== activeBadge);
    expect(activeBadge).toBeInTheDocument();
    expect(activeBadge?.querySelector('[data-transition-arrow="entrance"]')).toHaveAttribute("data-transition-emphasis", "active");
    expect(activeBadge?.querySelector('[data-transition-arrow="exit"]')).not.toHaveAttribute("data-transition-emphasis");
    expect(activeBadge?.querySelector('[data-testid="entrance-direction-entrance-emphasis"] animate')).toBeInTheDocument();
    expect(ordinaryBadge).toHaveAttribute("data-route-relevant", "true");
    expect(ordinaryBadge?.querySelector('[data-transition-arrow="entrance"]')).not.toHaveAttribute("data-transition-emphasis");
    expect(ordinaryBadge?.querySelector('[data-transition-arrow="exit"]')).not.toHaveAttribute("data-transition-emphasis");
    expect(ordinaryBadge?.querySelector('[data-testid="entrance-direction-route-halo"]')).toBeInTheDocument();
    expect(ordinaryBadge?.querySelector('[data-testid="entrance-direction-active-ring"]')).not.toBeInTheDocument();

    rerender(<svg><ReadonlyOutdoorCampusScene
      campus={projectReadonlyOutdoorCampus(twoEntrances)} compactEntryActions onClickEntrance={vi.fn()}
      routeRelevantEntranceIds={new Set(["e1", "e2"])} activeEntranceId="e1" reducedMotion
    /></svg>);
    expect(container.querySelector('[data-testid="entrance-direction-entrance-emphasis"] animate')).not.toBeInTheDocument();
    expect(container.querySelector('[data-testid="entrance-direction-entrance-emphasis"]')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="entrance-direction-active-ring"]')).toBeInTheDocument();
  });

  it("keeps close entrance icons while giving a colliding label to the hovered entrance", () => {
    const closeEntrances = {
      ...campus,
      buildings: [{
        ...campus.buildings[0],
        entrances: [
          { id: "primary", buildingId: "b1", edge: "bottom" as const, offset: 0.5, isPrimary: true },
          { id: "secondary", buildingId: "b1", edge: "bottom" as const, offset: 0.54 },
        ],
      }],
      entrances: [
        { id: "primary", buildingId: "b1", edge: "bottom" as const, offset: 0.5, isPrimary: true },
        { id: "secondary", buildingId: "b1", edge: "bottom" as const, offset: 0.54 },
      ],
    } as unknown as Campus;
    const { container } = render(<svg><ReadonlyOutdoorCampusScene
      campus={projectReadonlyOutdoorCampus(closeEntrances)} compactEntryActions onClickEntrance={vi.fn()}
    /></svg>);
    const doors = [...container.querySelectorAll('[data-testid="readonly-entrance"]')];
    expect(container.querySelectorAll('[data-testid="entrance-direction-badge"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-testid="student-doorway-micro-label"]')).toHaveLength(1);
    fireEvent.mouseEnter(doors[1]!);
    expect(container.querySelectorAll('[data-testid="entrance-direction-badge"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-testid="student-doorway-micro-label"]')).toHaveLength(1);
    expect(container.querySelector('[data-testid="student-doorway-micro-label-text"]')).toHaveTextContent("Enter LIB");
  });

  it("keeps authored Campus artwork out of per-frame route progress updates", () => {
    const projected = projectReadonlyOutdoorCampus(campus);
    const component = ReadonlyOutdoorArtworkLayer as unknown as { type: (...args: unknown[]) => unknown };
    const artworkRender = vi.spyOn(component, "type");
    const routePoints = [{ x: 10, y: 12 }, { x: 150, y: 96 }, { x: 320, y: 180 }];
    const view = (progress: number) => <svg>
      <ReadonlyOutdoorArtworkLayer campus={projected} showBuildings showLabels zoom={1} />
      <RouteMapOverlay points={routePoints} mode="standard" walkProgress={progress} layer="line" />
    </svg>;
    const { rerender } = render(view(0.2));
    expect(artworkRender).toHaveBeenCalledTimes(1);

    rerender(view(0.65));
    expect(artworkRender).toHaveBeenCalledTimes(1);
    artworkRender.mockRestore();
  });

  it("changes mobile marker detail without rerendering heavy Campus artwork or route geometry", () => {
    const projected = projectReadonlyOutdoorCampus(campus);
    const component = ReadonlyOutdoorArtworkLayer as unknown as { type: (...args: unknown[]) => unknown };
    const artworkRender = vi.spyOn(component, "type");
    const routePoints = [{ x: 10, y: 12 }, { x: 150, y: 96 }, { x: 320, y: 180 }];
    const view = (studentZoom: number) => <svg><ReadonlyOutdoorCampusScene campus={projected} compactEntryActions
      zoom={1} studentZoom={studentZoom} studentPixelScale={0.28}
      routeOverlay={<RouteMapOverlay points={routePoints} mode="standard" animated={false} layer="line" />} /></svg>;
    const { rerender } = render(view(1));
    const artworkCount = artworkRender.mock.calls.length;
    const routeStroke = screen.getByTestId("route-outer-casing");
    rerender(view(0.4));
    expect(artworkRender).toHaveBeenCalledTimes(artworkCount);
    expect(screen.getByTestId("route-outer-casing")).toBe(routeStroke);
    expect(screen.getByTestId("entrance-direction-badge")).toBeInTheDocument();
    artworkRender.mockRestore();
  });

  it("keeps a direct-tap target and places the direction arrow above route artwork", () => {
    const onClickEntrance = vi.fn();
    render(<svg>
      <path data-testid="student-route-stroke" d="M0 0L300 200" />
      <ReadonlyOutdoorCampusScene
        campus={projectReadonlyOutdoorCampus(campus)}
        compactEntryActions
        onClickEntrance={onClickEntrance}
      />
    </svg>);
    const entrance = screen.getByTestId("readonly-entrance");
    const marker = screen.getByTestId("entrance-direction-badge");
    const route = screen.getByTestId("student-route-stroke");
    expect(screen.getByTestId("readonly-enter-building-door-hit-target")).toHaveAttribute("width", "48");
    expect(Boolean(route.compareDocumentPosition(marker) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    fireEvent.click(entrance);
    expect(onClickEntrance).toHaveBeenCalledWith("b1");
  });

  it("places the route stroke above Campus artwork and below entrance markers", () => {
    const routePoints = [{ x: 30, y: 40 }, { x: 80, y: 40 }, { x: 100, y: 80 }];
    render(<svg>
      <ReadonlyOutdoorCampusScene
        campus={projectReadonlyOutdoorCampus(campus)}
        compactEntryActions
        onClickEntrance={vi.fn()}
        routeOverlay={<RouteMapOverlay points={routePoints} mode="standard" animated={false} layer="line" />}
      />
    </svg>);

    const artwork = screen.getByTestId("readonly-building");
    const routeGroup = document.querySelector('[data-route-group][data-route-layer="line"]')!;
    const routeStroke = routeGroup.querySelector("polyline[stroke=\"#1e40af\"]");
    const entranceMarker = screen.getByTestId("entrance-direction-badge");
    expect(routeStroke).toHaveAttribute("points", "30,40 80,40 100,80");
    expect(Boolean(artwork.compareDocumentPosition(routeGroup) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(Boolean(routeGroup.compareDocumentPosition(entranceMarker) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it("shows only the hovered entrance's detached tooltip among nearby arrows", () => {
    const nearbyCampus = {
      ...campus,
      buildings: [{
        ...campus.buildings[0],
        entrances: [
          ...(campus.buildings[0]!.entrances ?? []),
          { id: "e2", buildingId: "b1", edge: "bottom" as const, offset: 0.58 },
        ],
      }],
    } as unknown as Campus;
    render(<svg><ReadonlyOutdoorCampusScene
      campus={projectReadonlyOutdoorCampus(nearbyCampus)}
      onClickEntrance={vi.fn()}
      compactEntryActions
    /></svg>);
    const entrances = screen.getAllByTestId("readonly-entrance");
    expect(screen.queryAllByTestId("student-transition-tooltip")).toHaveLength(0);
    fireEvent.mouseEnter(entrances[0]!);
    expect(screen.queryAllByTestId("student-transition-tooltip")).toHaveLength(0);
    expect(screen.queryByTestId("student-enter-building-label")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("entrance-direction-badge")).toHaveLength(2);
    fireEvent.mouseLeave(entrances[0]!);
    expect(screen.queryAllByTestId("student-transition-tooltip")).toHaveLength(0);
  });

  it("selects a Campus Gate from the map and renders its selected halo", () => {
    const onSelectCampusPlace = vi.fn();
    const withGate = {
      ...campus,
      markers: [{
        id: "gate-main", name: "Campus Gate", type: "gate", purpose: "general",
        navNodeId: "gate-node", x: 240, y: 180, color: "#2563eb",
      }],
    } as unknown as Campus;
    render(<svg><ReadonlyOutdoorCampusScene
      campus={projectReadonlyOutdoorCampus(withGate)}
      selectedCampusPlaceId="gate-main"
      onSelectCampusPlace={onSelectCampusPlace}
    /></svg>);

    const gate = screen.getByTestId("readonly-campus-gate");
    expect(gate.querySelector(".campus-place-selection-ring")).toBeInTheDocument();
    fireEvent.click(gate);
    expect(onSelectCampusPlace).toHaveBeenCalledWith("gate-main");
  });

  it("keeps the authored Campus Gate artwork visible in Student overview and map pick", () => {
    const withGate = { ...campus, markers: [{ id: "gate-main", name: "Campus Gate", type: "gate", purpose: "general", x: 240, y: 180, color: "#2563eb" }] } as unknown as Campus;
    const { rerender } = render(<svg><ReadonlyOutdoorCampusScene campus={projectReadonlyOutdoorCampus(withGate)} compactEntryActions studentZoom={0.16} studentPixelScale={1} /></svg>);
    const gate = screen.getByTestId("readonly-campus-gate");
    expect(gate).toHaveAttribute("data-student-gate-screen-space", "true");
    expect(gate.querySelector(".student-map-screen-marker")).toBeInTheDocument();
    expect(gate.querySelector(".student-map-screen-marker svg[viewBox='0 0 36 30']")).toBeInTheDocument();
    rerender(<svg><ReadonlyOutdoorCampusScene campus={projectReadonlyOutdoorCampus(withGate)} compactEntryActions studentZoom={0.16} studentPixelScale={1} mapPickActive onSelectCampusPlace={vi.fn()} /></svg>);
    expect(screen.getByTestId("student-map-pick-gate-target")).toBeInTheDocument();
  });

  it("uses Admin building label/body styling and the shared entrance glyph", () => {
    const { container } = render(<svg><ReadonlyOutdoorCampusScene campus={projectReadonlyOutdoorCampus(campus)} /></svg>);
    const building = screen.getByTestId("readonly-building");
    const buildingName = Array.from(building.querySelectorAll("text")).find((node) => node.textContent === "Library");
    expect(building.querySelector('rect[fill="#0f4c81"]')).toHaveAttribute("opacity", "0.82");
    expect(buildingName).toHaveAttribute("y", "152");

    const entranceArt = screen.getByTestId("campus-entrance-artwork");
    expect(entranceArt.querySelector("path")).toHaveAttribute("d", "M-10,-7 L10,-7 L10,7 L-10,7 Z");
    expect(entranceArt.querySelector('circle[cx="-8"]')).toBeInTheDocument();
    expect(container.querySelector('pattern[id="campus-ground-asphalt-pattern"]')).toBeInTheDocument();
    const markerArtwork = screen.getAllByTestId("campus-marker-artwork").find((node) => node.getAttribute("data-marker-id") === "m2");
    expect(markerArtwork?.querySelector("text")?.textContent).toBe("★");
  });

  it("hides student-facing building and marker labels when labels are disabled", () => {
    const { container } = render(<svg><ReadonlyOutdoorCampusScene campus={projectReadonlyOutdoorCampus(campus)} showLabels={false} /></svg>);
    const textValues = Array.from(container.querySelectorAll("text")).map((element) => element.textContent);
    expect(textValues).not.toContain("LIB");
    expect(textValues).not.toContain("Library");
    expect(textValues).not.toContain("Landmark");
    expect(screen.getByTestId("readonly-building")).toBeInTheDocument();
  });

  it("uses the shared continuous path-chain geometry for connected authored paths", () => {
    const connectedPathsCampus = {
      ...campus,
      paths: [
        campus.paths[0],
        { id: "p2", points: [{ x: 100, y: 80 }, { x: 200, y: 100 }], type: "walkway", color: "#b45309", width: 10 },
      ],
    } as unknown as Campus;
    render(<svg><ReadonlyOutdoorCampusScene campus={projectReadonlyOutdoorCampus(connectedPathsCampus)} /></svg>);
    const chain = screen.getByTestId("readonly-campus-path");
    expect(chain).toHaveAttribute("data-path-ids", "p1,p2");
    expect(screen.getByTestId("campus-path-network-artwork").querySelectorAll("path")).toHaveLength(2);
  });

  it("keeps authored physical paths visible when the building layer is hidden", () => {
    render(<svg><ReadonlyOutdoorCampusScene campus={projectReadonlyOutdoorCampus(campus)} showBuildings={false} /></svg>);
    expect(screen.getByTestId("readonly-campus-path")).toBeInTheDocument();
    expect(screen.queryByTestId("readonly-building")).not.toBeInTheDocument();
  });

  it("renders parking with the shared detailed stall and vehicle artwork", () => {
    const parkingCampus = {
      ...campus,
      decorAssets: [{ ...campus.decorAssets![1]!, type: "parking-lot" as const, width: 360, height: 180, rotation: 27 }],
    };
    const projected = projectReadonlyOutdoorCampus(parkingCampus);
    render(<svg><ReadonlyOutdoorCampusScene campus={projected} /></svg>);
    const lot = screen.getByTestId("readonly-ground-area");
    expect(lot).toHaveAttribute("data-ground-type", "parking");
    expect(lot).toHaveAttribute("transform", "rotate(27,420,360)");
    const markings = screen.getByTestId("parking-stalls");
    expect(markings.querySelectorAll("path")).toHaveLength(4);
    expect(markings.querySelector("svg")).toHaveAttribute("viewBox", "0 0 120 72");
    expect(markings.querySelector("svg")).toHaveAttribute("width", "360");
    expect(markings.querySelector("svg")).toHaveAttribute("height", "180");
    expect(markings.querySelector("svg path")).toHaveAttribute("fill", "#cbd5e1");
    expect(projected.decorAssets[0]).toBe(parkingCampus.decorAssets?.[0]);
    expect(lot.textContent).not.toContain("P");
  });

  it("recovers canonical Parking Lot artwork for legacy ground-area parking records", () => {
    const legacyLot = {
      id: "legacy-parking",
      type: "ground-area" as const,
      groundType: "parking" as const,
      x: 420,
      y: 360,
      width: 300,
      height: 160,
    };
    const projected = projectReadonlyOutdoorCampus({ ...campus, decorAssets: [legacyLot] });
    render(<svg><ReadonlyOutdoorCampusScene campus={projected} /></svg>);

    const artwork = screen.getByTestId("parking-stalls").querySelector("svg");
    expect(artwork).toHaveAttribute("viewBox", "0 0 120 72");
    expect(artwork?.querySelector('path[fill="#cbd5e1"]')).toBeInTheDocument();
    expect(artwork?.querySelectorAll("path")).toHaveLength(4);
  });

  it("keeps Admin selection styling off the canonical Parking Lot artwork", () => {
    const asset = { id: "parking", type: "parking-lot" as const, x: 90, y: 60, width: 220, height: 120, groundType: "parking" as const };
    const { container } = render(<svg><OutdoorGroundAreaArtwork asset={asset} selected /></svg>);
    const area = container.querySelector('[data-testid="campus-ground-area-artwork"]');
    expect(area?.querySelector(":scope > rect")).toHaveAttribute("stroke", "transparent");
    expect(area?.querySelector(":scope > rect")).toHaveAttribute("stroke-width", "0");
    expect(screen.getByTestId("parking-stalls")).toHaveAttribute("opacity", "0.68");
  });

  it("uses a medium legacy default with constrained visual size options", () => {
    const base = { width: 28, height: 42 } as const;
    const small = exteriorEmergencyStairVisualDimensions({ ...base, visualSize: "small" });
    const medium = exteriorEmergencyStairVisualDimensions({ ...base, visualSize: undefined });
    const large = exteriorEmergencyStairVisualDimensions({ ...base, visualSize: "large" });
    expect(medium.width).toBeGreaterThan(base.width);
    expect(medium.height).toBeGreaterThan(base.height);
    expect(small.width).toBeLessThan(medium.width);
    expect(large.height).toBeGreaterThan(medium.height);
  });
});

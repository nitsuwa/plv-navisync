import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Campus } from "../../map-builder/types";
import { loadPublishedCampusImage } from "../../../lib/campusPublicMedia";
import { CampusOverviewPanel } from "../CampusOverviewPanel";

vi.mock("../../../lib/campusPublicMedia", () => ({ loadPublishedCampusImage: vi.fn().mockResolvedValue(null) }));

function publishedCampus(overrides: Partial<Campus> = {}): Campus {
  return {
    id: "main", name: "Main Campus", code: "MAIN", description: "Full published campus description. It remains readable without a line clamp.",
    address: "100 Campus Road", city: "Valenzuela", province: "Metro Manila", postalCode: "1440",
    coordinates: { lat: 14.7, lng: 120.9 }, status: "active", publishStatus: "published", visibleToStudents: true,
    features: { accessibilityNavigation: true, emergencyRoutes: true, issueReporting: true }, canvasW: 900, canvasH: 680,
    settings: { accessibility: true, emergency: true, eventLayer: true, gps: true }, buildings: [], markers: [], paths: [],
    createdAt: "", updatedAt: "", ...overrides,
  } as Campus;
}

describe("CampusOverviewPanel", () => {
  it("shows the real published map preview when no cover image is available and keeps the full description", () => {
    render(<CampusOverviewPanel campus={publishedCampus()} campuses={[publishedCampus()]} onExplore={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByTestId("campus-published-map-preview")).toHaveAttribute("aria-label", "Main Campus published campus map preview");
    expect(screen.getByText("Full published campus description. It remains readable without a line clamp.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Travel to another campus")).not.toBeInTheDocument();
  });

  it("keeps a loading skeleton in place while a published cover image is being resolved", async () => {
    let resolveCover!: (url: string | null) => void;
    const pendingCover = new Promise<string | null>((resolve) => { resolveCover = resolve; });
    vi.mocked(loadPublishedCampusImage).mockImplementation((_campusId, kind) => kind === "cover" ? pendingCover : Promise.resolve(null));
    const view = render(<CampusOverviewPanel campus={publishedCampus({ overviewImagePath: "published/main-cover.webp" })} campuses={[publishedCampus()]} onExplore={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByTestId("campus-overview-cover-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("campus-published-map-preview")).not.toBeInTheDocument();
    await act(async () => { resolveCover(null); await pendingCover; });
    expect(await screen.findByTestId("campus-published-map-preview")).toBeInTheDocument();
    view.unmount();
    vi.mocked(loadPublishedCampusImage).mockResolvedValue(null);
  });

  it("keeps the information area independently scrollable and shows only the two primary actions", () => {
    render(<CampusOverviewPanel campus={publishedCampus({ description: "A long description. ".repeat(400) })} campuses={[publishedCampus()]} onExplore={vi.fn()} onClose={vi.fn()} />);
    const panel = screen.getByTestId("campus-overview-panel");
    const information = screen.getByTestId("campus-overview-information");
    const actions = screen.getByTestId("campus-overview-actions");
    expect(panel).toHaveClass("min-h-[70dvh]", "flex-col", "overflow-hidden");
    expect(information).toHaveClass("min-h-0", "flex-1", "overflow-y-auto", "overscroll-contain", "touch-pan-y");
    expect(actions).toHaveClass("shrink-0");
    expect(within(actions).getAllByRole("button")).toHaveLength(2);
    expect(within(actions).getByRole("button", { name: /Google Maps/ })).toBeInTheDocument();
    expect(within(actions).getByRole("button", { name: /Explore Campus/ })).toBeInTheDocument();
    expect(within(actions).queryByRole("button", { name: /Directions to Campus/ })).not.toBeInTheDocument();
    expect(screen.getByText(/A long description\./)).toBeInTheDocument();
  });

  it("closes through Explore and the explicit close control", () => {
    const onExplore = vi.fn();
    const onClose = vi.fn();
    render(<CampusOverviewPanel campus={publishedCampus()} campuses={[publishedCampus()]} onExplore={onExplore} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Explore Campus" }));
    fireEvent.click(screen.getByRole("button", { name: "Close campus overview" }));
    expect(onExplore).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

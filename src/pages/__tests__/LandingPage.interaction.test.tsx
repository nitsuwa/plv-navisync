import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { LandingPage } from "../LandingPage";

vi.mock("../../services/eventService", () => ({
  eventService: {
    getPublishedAnnouncements: vi.fn().mockResolvedValue([]),
    getUpcomingEvents: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../../hooks/useScrollReveal", () => ({
  useScrollReveal: () => ({ ref: vi.fn(), visible: true }),
}));

vi.mock("../../components/ui/HeroBackground", () => ({
  LavaLampBackground: () => null,
}));

vi.mock("../../components/ui/PLVLogo", () => ({
  PLVLogo: () => <span aria-hidden="true" />,
}));

function renderLandingPage() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  );
}

describe("LandingPage interactive tour", () => {
  beforeAll(() => {
    vi.stubGlobal("IntersectionObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });

    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    }));
  });

  it("uses an accessible single-panel disclosure instead of a mobile horizontal tab strip", () => {
    renderLandingPage();

    const routeButton = screen.getByRole("button", { name: /get directions/i });
    expect(routeButton).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByTestId("landing-feature-tour-panel")).toHaveTextContent("Find a Classroom");

    fireEvent.click(routeButton);

    expect(routeButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("landing-feature-tour-panel")).toHaveTextContent("Get Directions");
  });

  it("renders the shorter landing-page information architecture", () => {
    renderLandingPage();

    expect(screen.getByRole("heading", { name: "How NaviSync Helps You" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "See It in Action" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "A Day With NaviSync" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Latest Announcements & Campus Events" })).not.toBeInTheDocument();
  });

  it("keeps campus contact details in the footer instead of duplicating them in the landing CTA", () => {
    renderLandingPage();

    expect(screen.queryByText("Campus information")).not.toBeInTheDocument();
    expect(screen.queryByText(/Maysan Road corner Tongco Street/i)).not.toBeInTheDocument();
  });

  it("shows a straight building-to-building route with an animated walking marker", () => {
    renderLandingPage();

    fireEvent.click(screen.getByRole("button", { name: /get directions/i }));

    const routePanel = screen.getByTestId("landing-feature-tour-panel");
    const routeDemo = within(routePanel).getByTestId("route-demo");
    expect(routeDemo).toHaveAttribute("data-route-style", "straight-building-route");
    expect(routeDemo).toHaveTextContent("Building A");
    expect(routeDemo).toHaveTextContent("Building B");
    expect(within(routePanel).getByTestId("route-walking-marker")).toHaveAttribute("data-animation", "walking");
  });

  it("keeps one focused interactive tour and a compact capability strip", () => {
    renderLandingPage();

    expect(screen.getByTestId("landing-map-preview")).toBeInTheDocument();
    expect(screen.getByTestId("landing-feature-tour")).toBeInTheDocument();
    expect(screen.getByText("Find buildings and offices")).toBeInTheDocument();
    expect(screen.getByText("Get walking directions")).toBeInTheDocument();
    expect(screen.getByText("Choose accessible routes")).toBeInTheDocument();
  });

  it("frames the hero around a campus map preview and practical trust signals", () => {
    renderLandingPage();

    expect(screen.getByTestId("landing-map-preview")).toHaveAttribute(
      "aria-label",
      expect.stringMatching(/campus map preview/i),
    );
    expect(screen.getByText("Campus map, at a glance")).toBeInTheDocument();
    expect(screen.getByText("Campus-wide")).toBeInTheDocument();
    expect(screen.getByText("Walking-first")).toBeInTheDocument();
    expect(screen.getByText("Access-aware")).toBeInTheDocument();
  });

  it("keeps the landing page focused on navigation outcomes", () => {
    renderLandingPage();

    expect(screen.getByRole("heading", { name: "Everything useful, right when you need it." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ready to explore PLV?" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Navigate PLV in Seconds" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Latest Announcements & Campus Events" })).not.toBeInTheDocument();
  });

  it("keeps the hero readable while reserving space for the mobile navigation dock", () => {
    renderLandingPage();

    const hero = screen.getByTestId("landing-hero");
    expect(hero).toHaveAttribute("data-scroll-behavior", "subtle");
    expect(hero).toHaveAttribute("data-mobile-nav-aware", "true");
    expect(hero).toHaveClass("min-h-0");
  });

  it("shows stairs when off and separate ramp and elevator scenes when on", () => {
    vi.useFakeTimers();
    try {
      renderLandingPage();
      fireEvent.click(screen.getByRole("button", { name: /accessible routes/i }));
      const demo = screen.getByTestId("a11y-demo");
      const toggle = within(demo).getByRole("switch", { name: "Toggle accessible route" });
      expect(within(demo).getByRole("img", { name: "Person climbing stairs" })).toBeInTheDocument();
      act(() => { vi.advanceTimersByTime(12000); });
      expect(toggle).toHaveAttribute("aria-checked", "false");

      fireEvent.click(toggle);
      expect(within(demo).queryByRole("img", { name: "Person climbing stairs" })).not.toBeInTheDocument();
      expect(within(demo).getByRole("img", { name: "Person walking up a ramp" })).toBeInTheDocument();
      expect(within(demo).getByRole("img", { name: /person entering an elevator/i })).toBeInTheDocument();
      act(() => { vi.advanceTimersByTime(12000); });
      expect(toggle).toHaveAttribute("aria-checked", "true");

      fireEvent.click(within(demo).getByRole("button", { name: "Pause animation" }));
      expect(demo.querySelector("animateMotion, animateTransform, animate")).toBeNull();
      fireEvent.click(within(demo).getByRole("button", { name: "Play animation" }));
      expect(demo.querySelector("animateMotion")).not.toBeNull();

      fireEvent.click(toggle);
      expect(within(demo).getByRole("img", { name: "Person climbing stairs" })).toBeInTheDocument();
      expect(within(demo).queryByRole("img", { name: /person entering an elevator/i })).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the accessible-route switch knob contained in both states", () => {
    renderLandingPage();
    fireEvent.click(screen.getByRole("button", { name: /accessible routes/i }));

    const toggle = within(screen.getByTestId("a11y-demo")).getByRole("switch", { name: "Toggle accessible route" });
    const knob = within(toggle).getByTestId("a11y-toggle-knob");

    expect(toggle).toHaveClass("h-6", "w-12", "shrink-0", "p-0.5");
    expect(knob).toHaveClass("left-0.5", "h-5", "w-5", "translate-x-0");

    fireEvent.click(toggle);
    expect(knob).toHaveClass("translate-x-6");
  });

  it("centers the hero seal inside its gold halo and keeps it separated from the badge", () => {
    renderLandingPage();

    const seal = screen.getByTestId("hero-seal");
    expect(seal).toHaveClass("mt-2", "h-36", "w-36", "items-center", "justify-center");
    expect(screen.getByTestId("hero-seal-halo")).toHaveClass("inset-0");
    expect(screen.getByTestId("hero-seal-ring")).toHaveClass("inset-2");
  });

  it("keeps map callouts clear of the route endpoint markers", () => {
    renderLandingPage();

    const mapPreview = screen.getByTestId("landing-map-preview");
    expect(within(mapPreview).getByTestId("map-start-callout")).toHaveAttribute("data-callout-placement", "above-start-marker");
    expect(within(mapPreview).getByTestId("map-end-callout")).toHaveAttribute("data-callout-placement", "above-end-marker");
  });

  it("turns the existing hero feature CTA into an in-page scroll cue and keeps the final CTA focused", () => {
    renderLandingPage();

    expect(screen.getByRole("link", { name: "Explore Features" })).toHaveAttribute("href", "#landing-feature-tour");
    expect(screen.getByRole("link", { name: "Open Interactive Map" })).toBeInTheDocument();
    expect(screen.queryByText("Campus information")).not.toBeInTheDocument();
  });
});

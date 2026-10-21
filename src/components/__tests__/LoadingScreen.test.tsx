import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../ui/PLVLogo", () => ({ PLVLogo: () => <div aria-label="PLV logo" /> }));
import { LoadingScreen } from "../LoadingScreen";

describe("NaviSync startup screen", () => {
  it("shows the branded session restore state and exposes retry for temporary failures", () => {
    const onRetry = vi.fn();
    render(<LoadingScreen error="Check your connection and try again." onRetry={onRetry} />);

    expect(screen.getByRole("status", { name: "NaviSync could not restore your account" })).toBeInTheDocument();
    expect(screen.getByText(/NaviSync/)).toBeInTheDocument();
    expect(screen.getByText("Check your connection and try again.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry connection" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("supports the smooth exit state without replacing the startup screen content", () => {
    const { container } = render(<LoadingScreen exiting />);
    expect(container.querySelector(".ns-startup-exit")).toBeInTheDocument();
    expect(screen.getByText("Restoring your NaviSync session…")).toBeInTheDocument();
    expect(screen.queryByTestId("startup-moving-beacon")).not.toBeInTheDocument();
    expect(screen.getByTestId("startup-route-path")).toHaveAttribute("stroke-dasharray", "1");
  });

  it("drives route illumination and the existing moving beacon from one normalized SVG timeline", () => {
    render(<LoadingScreen />);

    const route = screen.getByTestId("startup-route-path") as unknown as SVGPathElement;
    const routeTrack = screen.getByTestId("startup-route-track");
    const routeProgress = screen.getByTestId("startup-route-progress");
    const beacon = screen.getByTestId("startup-moving-beacon");
    const motion = screen.getByTestId("startup-beacon-motion");
    const pathId = route.getAttribute("id");

    expect(beacon).toBeInTheDocument();
    expect(screen.getAllByTestId("startup-moving-beacon")).toHaveLength(1);
    expect(route).toHaveAttribute("pathLength", "1");
    expect(route.getAttribute("d")).toBe(routeTrack.getAttribute("d"));
    expect(route).toHaveAttribute("stroke-dasharray", "0 1");
    expect(routeTrack).toHaveAttribute("stroke-dasharray", "2.5 4");
    expect(motion.querySelector("mpath")).toHaveAttribute("href", `#${pathId}`);
    expect(motion).toHaveAttribute("keyPoints", "0;1;1;1");
    expect(motion).toHaveAttribute("keyTimes", routeProgress.getAttribute("keyTimes"));
    expect(motion).toHaveAttribute("dur", routeProgress.getAttribute("dur"));
    expect(motion).toHaveAttribute("repeatCount", "indefinite");
    const svgAnimations = Array.from(route.ownerSVGElement!.querySelectorAll("animate, animateMotion")) as Element[];
    expect(new Set(svgAnimations.map((animation) => animation.getAttribute("dur")))).toEqual(new Set(["3.8s"]));
    expect(svgAnimations.every((animation) => animation.getAttribute("begin") === "0s")).toBe(true);
    expect(svgAnimations.every((animation) => animation.getAttribute("repeatCount") === "indefinite")).toBe(true);
    expect(routeProgress).toHaveAttribute("attributeName", "stroke-dasharray");
    expect(routeProgress).toHaveAttribute("values", "0 1;1 1;1 1;1 1");
    expect(routeProgress).toHaveAttribute("keyTimes", "0;0.72;0.92;1");
    expect(screen.getByTestId("startup-start-marker")).toHaveAttribute("cx", "8");
    const destinationHalo = screen.getByTestId("startup-destination-halo");
    expect(destinationHalo).toHaveAttribute("cx", "152");
    expect(destinationHalo.querySelector('animate[attributeName="r"]')).toHaveAttribute("keyTimes", "0;0.72;0.77;0.84;1");
  });

  it("renders a static complete route without SVG animation when reduced motion is requested", () => {
    const previousMatchMedia = Object.getOwnPropertyDescriptor(window, "matchMedia");
    const matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    Object.defineProperty(window, "matchMedia", { configurable: true, value: matchMedia });

    try {
      render(<LoadingScreen />);
      expect(screen.getByTestId("startup-route-path")).toHaveAttribute("stroke-dasharray", "1");
      expect(screen.getByTestId("startup-start-marker")).toBeInTheDocument();
      expect(screen.getByTestId("startup-destination-halo")).toBeInTheDocument();
      expect(screen.queryByTestId("startup-moving-beacon")).not.toBeInTheDocument();
      expect(screen.queryByTestId("startup-route-progress")).not.toBeInTheDocument();
    } finally {
      if (previousMatchMedia) Object.defineProperty(window, "matchMedia", previousMatchMedia);
      else Reflect.deleteProperty(window, "matchMedia");
    }
  });
});

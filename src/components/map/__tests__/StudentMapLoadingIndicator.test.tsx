import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StudentMapLoadingIndicator } from "../StudentMapLoadingIndicator";

describe("StudentMapLoadingIndicator", () => {
  it("announces the map preparation state accessibly with a reduced-motion-safe spinner", () => {
    render(<StudentMapLoadingIndicator />);

    const status = screen.getByRole("status", { name: "Preparing your map" });
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveTextContent("Preparing your map");
    expect(status.querySelector("svg.lucide-map-pin")).toBeInTheDocument();
    const reducedMotionSafeRing = [...status.querySelectorAll("span")].find((span) =>
      span.classList.contains("motion-safe:animate-spin") && span.classList.contains("motion-reduce:animate-none"));
    expect(reducedMotionSafeRing).toBeInTheDocument();
  });

  it("uses a caller-provided label for an existing map transition", () => {
    render(<StudentMapLoadingIndicator label="Switching campus" />);

    expect(screen.getByRole("status", { name: "Switching campus" })).toBeInTheDocument();
  });
});

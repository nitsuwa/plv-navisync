import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CampusAuthIllustration } from "../CampusAuthIllustration";
import { LavaLampBackground, StarField } from "../HeroBackground";

describe("CampusAuthIllustration motion preference", () => {
  it("keeps the animated route marker when motion is allowed", () => {
    const { container } = render(<CampusAuthIllustration />);
    expect(container.querySelector("animateMotion")).toBeInTheDocument();
  });

  it("shows the same campus artwork without motion when reduced motion is requested", () => {
    const { container } = render(<CampusAuthIllustration animated={false} />);
    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(container.querySelector("animateMotion")).toBeNull();
  });

  it("keeps auth stars and ambient blobs still when animation is disabled", () => {
    const { container } = render(<><StarField animated={false} /><LavaLampBackground animated={false} /></>);
    expect(Array.from(container.querySelectorAll("circle")).every((star) => (star as SVGCircleElement).style.animation === "none")).toBe(true);
    expect(Array.from(container.querySelectorAll("div[style]")).every((blob) => (blob as HTMLDivElement).style.animation === "none")).toBe(true);
  });
});

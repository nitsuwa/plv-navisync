import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NAVIBUDDY_OUTFITS, DEFAULT_NAVIBUDDY_APPEARANCE } from "../../../lib/naviBuddy";
import { NaviBuddyOutfitBust, NaviBuddyPortrait } from "../NaviBuddyPortrait";

describe("NaviBuddy wardrobe portraits", () => {
  it("renders all five chooser outfits as upper-torso busts without legs or shoes", () => {
    const markup = NAVIBUDDY_OUTFITS.map((outfit) => {
      const { container, unmount } = render(<NaviBuddyOutfitBust appearance={{ ...DEFAULT_NAVIBUDDY_APPEARANCE, outfit }} />);
      const portrait = screen.getByRole("img", { name: `${outfit === "plv_uniform" ? "PLV Uniform" : outfit[0].toUpperCase() + outfit.slice(1)} NaviBuddy` });
      expect(portrait).toHaveAttribute("viewBox", "0 0 180 190");
      expect(portrait).toHaveAttribute("data-testid", "navibuddy-outfit-bust");
      expect(portrait.querySelector('[data-testid="iskolar-bust"]')).toHaveAttribute("data-outfit", outfit);
      expect(portrait.querySelector('path[d^="M50 136"]')).toBeTruthy();
      expect(portrait.querySelector('[data-testid="iskolar-character"]')).toBeNull();
      if (outfit === "plv_uniform") expect(portrait.querySelector('path[d^="M87 138"]')).toBeTruthy();
      if (outfit === "adventurer") expect(portrait.querySelector('path[d^="M48 51"]')).toBeTruthy();
      const result = container.innerHTML;
      unmount();
      return result;
    });

    expect(new Set(markup).size).toBe(5);
  });

  it("keeps the static full-body fallback on shared character artwork", () => {
    render(<NaviBuddyPortrait appearance={DEFAULT_NAVIBUDDY_APPEARANCE} />);
    const portrait = screen.getByRole("img", { name: "Classic NaviBuddy" });
    expect(portrait.querySelector('[data-testid="iskolar-character"] path[d*="M84 170 Q110 155"]')).toBeTruthy();
  });
});

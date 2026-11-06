import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NAVIBUDDY_OUTFITS, DEFAULT_NAVIBUDDY_APPEARANCE } from "../../../lib/naviBuddy";
import { NaviBuddyPortrait } from "../NaviBuddyPortrait";

describe("NaviBuddy wardrobe portraits", () => {
  it("renders all five outfit identities on the same compact character artboard", () => {
    const markup = NAVIBUDDY_OUTFITS.map((outfit) => {
      const { container, unmount } = render(<NaviBuddyPortrait appearance={{ ...DEFAULT_NAVIBUDDY_APPEARANCE, outfit }} />);
      const portrait = screen.getByRole("img", { name: `${outfit === "plv_uniform" ? "PLV Uniform" : outfit[0].toUpperCase() + outfit.slice(1)} NaviBuddy` });
      expect(portrait).toHaveAttribute("viewBox", "0 0 180 210");
      const result = container.innerHTML;
      unmount();
      return result;
    });

    expect(new Set(markup).size).toBe(5);
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CampusGroundPreview } from "../CampusGroundPreview";

describe("CampusGroundPreview", () => {
  it.each([
    ["neutral", false],
    ["grass", true],
    ["concrete", true],
    ["pavers", true],
    ["asphalt", true],
    ["custom", true],
  ] as const)("uses the selected %s material renderer", (material, hasTexture) => {
    render(<CampusGroundPreview material={material} texture="subtle" width={900} height={680} />);
    const preview = screen.getByTestId("canvas-ground-material-preview");
    expect(preview).toHaveAttribute("data-ground-material", material);
    expect(preview).toHaveAttribute("viewBox", "0 0 900 680");
    if (hasTexture) expect(screen.getByTestId("canvas-ground-material-texture")).toBeInTheDocument();
    else expect(screen.queryByTestId("canvas-ground-material-texture")).not.toBeInTheDocument();
  });

  it("keeps the texture tiled when the preview dimensions change", () => {
    const { rerender } = render(<CampusGroundPreview material="pavers" texture="subtle" width={400} height={220} />);
    const first = screen.getByTestId("canvas-ground-material-texture");
    const patternId = String(first.getAttribute("fill")).replace("url(#", "").replace(")", "");
    expect(screen.getByRole("img", { name: "pavers ground preview" })).toBeInTheDocument();
    rerender(<CampusGroundPreview material="pavers" texture="subtle" width={1200} height={900} />);
    const second = screen.getByTestId("canvas-ground-material-texture");
    expect(second).toHaveAttribute("fill", `url(#${patternId})`);
    expect(second).toHaveAttribute("width", "1200");
    expect(second).toHaveAttribute("height", "900");
  });
});

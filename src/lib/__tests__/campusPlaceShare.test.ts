import { afterEach, describe, expect, it, vi } from "vitest";
import { campusPlaceDeepLink, shareCampusPlaceLink } from "../campusPlaceShare";

describe("campus place sharing", () => {
  afterEach(() => vi.restoreAllMocks());

  it("builds an origin-based link that selects the campus place", () => {
    expect(campusPlaceDeepLink("gate-1", "campus-1", "https://navisync.example")).toBe(
      "https://navisync.example/map?campusId=campus-1&placeId=gate-1",
    );
  });

  it("uses Web Share when available", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    await expect(shareCampusPlaceLink("Campus Gate", "https://navisync.example/map?placeId=gate-1")).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith(expect.objectContaining({
      title: expect.stringContaining("Campus Gate"),
      url: "https://navisync.example/map?placeId=gate-1",
    }));
  });

  it("copies the link on browsers without Web Share", async () => {
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    await expect(shareCampusPlaceLink("Campus Gate", "https://navisync.example/map?placeId=gate-1")).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith("https://navisync.example/map?placeId=gate-1");
  });
});

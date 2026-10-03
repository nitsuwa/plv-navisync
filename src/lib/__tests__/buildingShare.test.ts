import { afterEach, describe, expect, it, vi } from "vitest";
import { buildingMapDeepLink, shareBuildingLink } from "../buildingShare";

describe("building sharing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, "share");
  });

  it("builds a stable campus and building map deep link", () => {
    expect(buildingMapDeepLink("campus id", "building/1", "https://nav.example"))
      .toBe("https://nav.example/map?campusId=campus+id&buildingId=building%2F1");
  });

  it("uses Web Share when available", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    const result = await shareBuildingLink({ buildingName: "CABA", url: "https://nav.example/map?buildingId=caba" });
    expect(result).toBe("shared");
    expect(share).toHaveBeenCalledWith({
      title: "CABA · PLV NaviSync",
      text: "CABA — PLV NaviSync",
      url: "https://nav.example/map?buildingId=caba",
    });
  });

  it("copies the deep link when Web Share is unavailable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const result = await shareBuildingLink({ buildingName: "CABA", url: "https://nav.example/map?buildingId=caba" });
    expect(result).toBe("copied");
    expect(writeText).toHaveBeenCalledWith("https://nav.example/map?buildingId=caba");
  });
});

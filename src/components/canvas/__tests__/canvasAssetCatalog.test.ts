import { describe, expect, it } from "vitest";
import {
  getCanvasAsset,
  listCanvasAssets,
  resolveCanvasAssetKey,
} from "../canvasAssetCatalog";

describe("canvas asset catalog", () => {
  it("resolves legacy event types without changing the stored type", () => {
    expect(resolveCanvasAssetKey({ type: "chair" })).toBe("chair");
    expect(resolveCanvasAssetKey({ type: "stage" })).toBe("stage");
    expect(getCanvasAsset("chair")?.name).toBe("Chair");
  });

  it("exposes recognizable event assets and hides map-only assets", () => {
    const eventKeys = listCanvasAssets("event").map((asset) => asset.key);

    expect(eventKeys).toEqual(expect.arrayContaining([
      "chair",
      "table",
      "booth",
      "stage",
      "speaker",
      "projector",
      "monitor",
      "tent",
      "barrier",
      "signage",
    ]));
    expect(eventKeys).not.toContain("whiteboard");
  });

  it("prefers an explicit asset key and rejects unknown keys", () => {
    expect(resolveCanvasAssetKey({ type: "legacy-chair", assetKey: "chair" })).toBe("chair");
    expect(resolveCanvasAssetKey({ type: "missing", assetKey: "not-real" })).toBeUndefined();
    expect(getCanvasAsset("not-real")).toBeUndefined();
  });
});

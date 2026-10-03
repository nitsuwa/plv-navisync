import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "../../lib/supabase";
import { buildingCoverPublicUrl, uploadBuildingCoverImage, validateBuildingCoverImage } from "../buildingImageService";

vi.mock("../../lib/supabase", () => ({ getSupabase: vi.fn() }));

describe("building cover image storage", () => {
  const upload = vi.fn();
  const getPublicUrl = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    upload.mockResolvedValue({ error: null });
    getPublicUrl.mockReturnValue({ data: { publicUrl: "https://storage.example/building-cover.jpg" } });
    vi.mocked(getSupabase).mockReturnValue({
      storage: { from: vi.fn(() => ({ upload, getPublicUrl })) },
    } as never);
  });

  it("uploads an allowed image to the existing public building-images bucket and resolves a public URL", async () => {
    const file = new File(["image"], "cover.jpg", { type: "image/jpeg" });
    const path = await uploadBuildingCoverImage("building-1", file);

    expect(path).toMatch(/^buildings\/building-1\/[\w-]+\.jpg$/);
    expect(upload).toHaveBeenCalledWith(path, file, { contentType: "image/jpeg", upsert: false });
    expect(buildingCoverPublicUrl(path)).toBe("https://storage.example/building-cover.jpg");
  });

  it("rejects unsupported formats and files above 5 MB before upload", () => {
    expect(() => validateBuildingCoverImage({ type: "image/gif", size: 10 })).toThrow("JPEG, PNG, or WebP");
    expect(() => validateBuildingCoverImage({ type: "image/png", size: 5 * 1024 * 1024 + 1 })).toThrow("5 MB or smaller");
    expect(upload).not.toHaveBeenCalled();
  });
});

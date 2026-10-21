import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabase } from "../../lib/supabase";
import {
  createRoomPhotoPreviewUrl,
  deleteRoomPhotoIfUnreferenced,
  getPublishedRoomPhotoUrl,
  invalidatePublishedRoomPhotoUrl,
  ROOM_PHOTO_BUCKET,
  uploadRoomPhoto,
  validateRoomPhotoFile,
} from "../roomPhotoService";

vi.mock("../../lib/supabase", () => ({ getSupabase: vi.fn() }));

describe("private Room photo storage", () => {
  const upload = vi.fn();
  const createSignedUrl = vi.fn();
  const remove = vi.fn();
  const storageFrom = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    upload.mockResolvedValue({ error: null });
    createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://signed.example/room.jpg" }, error: null });
    remove.mockResolvedValue({ error: null });
    storageFrom.mockReturnValue({ upload, createSignedUrl, remove });
    vi.mocked(getSupabase).mockReturnValue({ storage: { from: storageFrom } } as never);
  });

  it("validates allowed image types, size and actual file signature", async () => {
    expect(() => validateRoomPhotoFile({ type: "image/gif", size: 10 })).toThrow("JPG, PNG, or WebP");
    expect(() => validateRoomPhotoFile({ type: "image/png", size: 5 * 1024 * 1024 + 1 })).toThrow("5 MB");
    await expect(uploadRoomPhoto({
      campusId: "c", buildingId: "b", floorId: "f", roomId: "r",
      file: new File(["not an image"], "fake.jpg", { type: "image/jpeg" }),
    })).rejects.toThrow("valid image");
    expect(upload).not.toHaveBeenCalled();
  });

  it("uploads an immutable image under all four campus identities", async () => {
    const jpeg = new File([new Uint8Array([0xff, 0xd8, 0xff, 0x00])], "room.jpg", { type: "image/jpeg" });
    const path = await uploadRoomPhoto({ campusId: "campus-a", buildingId: "building-b", floorId: "floor-c", roomId: "room-d", file: jpeg });

    expect(storageFrom).toHaveBeenCalledWith(ROOM_PHOTO_BUCKET);
    expect(path).toMatch(/^campus-a\/building-b\/floor-c\/room-d\/[\w-]+\.jpg$/);
    expect(upload).toHaveBeenCalledWith(path, jpeg, { contentType: "image/jpeg", upsert: false });
  });

  it("creates signed previews and rejects cross-campus student paths before signing", async () => {
    const path = "campus-a/building-b/floor-c/room-d/photo.webp";
    await expect(createRoomPhotoPreviewUrl(path)).resolves.toBe("https://signed.example/room.jpg");
    await expect(getPublishedRoomPhotoUrl({
      campusId: "other-campus", buildingId: "building-b", floorId: "floor-c", roomId: "room-d", path,
    })).resolves.toBeNull();
    expect(createSignedUrl).toHaveBeenCalledTimes(1);
    await expect(getPublishedRoomPhotoUrl({
      campusId: "campus-a", buildingId: "building-b", floorId: "floor-c", roomId: "room-d", path,
    })).resolves.toBe("https://signed.example/room.jpg");
  });

  it("coalesces and briefly reuses signed URLs for the exact published Room reference", async () => {
    const first = {
      campusId: "cache-campus", buildingId: "cache-building", floorId: "cache-floor", roomId: "cache-room",
      path: "cache-campus/cache-building/cache-floor/cache-room/photo.webp",
    };
    createSignedUrl.mockImplementationOnce(async () => {
      await Promise.resolve();
      return { data: { signedUrl: "https://signed.example/cache-room.jpg" }, error: null };
    });

    await expect(Promise.all([getPublishedRoomPhotoUrl(first), getPublishedRoomPhotoUrl(first)]))
      .resolves.toEqual(["https://signed.example/cache-room.jpg", "https://signed.example/cache-room.jpg"]);
    await expect(getPublishedRoomPhotoUrl(first)).resolves.toBe("https://signed.example/cache-room.jpg");
    expect(createSignedUrl).toHaveBeenCalledOnce();

    const differentRoom = { ...first, roomId: "another-room", path: "cache-campus/cache-building/cache-floor/another-room/photo.webp" };
    await expect(getPublishedRoomPhotoUrl(differentRoom)).resolves.toBe("https://signed.example/room.jpg");
    invalidatePublishedRoomPhotoUrl(first);
    await expect(getPublishedRoomPhotoUrl(first)).resolves.toBe("https://signed.example/room.jpg");
    expect(createSignedUrl).toHaveBeenCalledTimes(3);
  });

  it("reports storage deletion failures as retained files", async () => {
    remove.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: new Error("published path") });
    await expect(deleteRoomPhotoIfUnreferenced("draft/photo.jpg")).resolves.toBe(true);
    await expect(deleteRoomPhotoIfUnreferenced("published/photo.jpg")).resolves.toBe(false);
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RoomPhotoAdminSection } from "../RoomPhotoAdminSection";

const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  remove: vi.fn(),
  upload: vi.fn(),
}));

vi.mock("../../../services/roomPhotoService", () => ({
  createRoomPhotoPreviewUrl: mocks.preview,
  deleteRoomPhotoIfUnreferenced: mocks.remove,
  uploadRoomPhoto: mocks.upload,
}));

const room = {
  id: "room-a", name: "Room A", type: "classroom", x: 10, y: 10, w: 30, h: 30,
  floorId: "floor-a", buildingId: "building-a",
};

describe("RoomPhotoAdminSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.preview.mockResolvedValue("https://signed.example/photo.jpg");
    mocks.upload.mockResolvedValue("campus-a/building-a/floor-a/room-a/new.jpg");
    mocks.remove.mockResolvedValue(true);
  });

  it("uploads a photo for the selected room and retains the previous photo when it is still published", async () => {
    const onUpdateRoom = vi.fn();
    render(<RoomPhotoAdminSection
      campusId="campus-a" buildingId="building-a" floorId="floor-a"
      room={{ ...room, roomPhotoPath: "campus-a/building-a/floor-a/room-a/old.jpg" }}
      onUpdateRoom={onUpdateRoom}
    />);
    await screen.findByAltText("Room A photo preview");
    mocks.remove.mockResolvedValueOnce(false);
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "new.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByTestId("room-photo-file-input"), { target: { files: [file] } });

    await waitFor(() => expect(onUpdateRoom).toHaveBeenCalledWith("room-a", { roomPhotoPath: "campus-a/building-a/floor-a/room-a/new.jpg" }));
    expect(mocks.upload).toHaveBeenCalledWith(expect.objectContaining({
      campusId: "campus-a", buildingId: "building-a", floorId: "floor-a", roomId: "room-a", file,
    }));
    expect(await screen.findByText(/previous photo is retained while a saved or published map still references it/)).toBeInTheDocument();
  });

  it("clears the room photo reference and keeps storage deletion guarded", async () => {
    const onUpdateRoom = vi.fn();
    render(<RoomPhotoAdminSection
      campusId="campus-a" buildingId="building-a" floorId="floor-a"
      room={{ ...room, roomPhotoPath: "campus-a/building-a/floor-a/room-a/photo.jpg" }}
      onUpdateRoom={onUpdateRoom}
    />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Photo" }));
    await waitFor(() => expect(onUpdateRoom).toHaveBeenCalledWith("room-a", { roomPhotoPath: undefined }));
    expect(mocks.remove).toHaveBeenCalledWith("campus-a/building-a/floor-a/room-a/photo.jpg");
  });

  it("clears stale preview errors when the selected photo reference changes", async () => {
    mocks.preview.mockRejectedValueOnce(new Error("The Room photo preview is unavailable."));
    const { rerender } = render(<RoomPhotoAdminSection
      campusId="campus-a" buildingId="building-a" floorId="floor-a"
      room={{ ...room, roomPhotoPath: "campus-a/building-a/floor-a/room-a/old.jpg" }}
      onUpdateRoom={vi.fn()}
    />);
    expect(await screen.findByRole("alert")).toHaveTextContent("preview is unavailable");

    rerender(<RoomPhotoAdminSection
      campusId="campus-a" buildingId="building-a" floorId="floor-a"
      room={{ ...room, roomPhotoPath: "campus-a/building-a/floor-a/room-a/reloaded.jpg" }}
      onUpdateRoom={vi.fn()}
    />);

    await screen.findByAltText("Room A photo preview");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

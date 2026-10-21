import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FloorRoom } from "../types";
import { RoomVideoServiceError } from "../../../services/emergencyEvacuationVideoService";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  readiness: vi.fn(),
  list: vi.fn(),
  preview: vi.fn(),
  captions: vi.fn(),
  upload: vi.fn(),
  updateTitle: vi.fn(),
  publish: vi.fn(),
  unpublish: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("../../../services/emergencyEvacuationVideoService", () => ({
  RoomVideoServiceError: class RoomVideoServiceError extends Error { kind: string; constructor(kind: string, message: string) { super(message); this.kind = kind; } },
  createAdminRoomVideoPreviewUrl: mocks.preview,
  deleteAdminRoomVideo: mocks.remove,
  formatEmergencyVideoSize: vi.fn(() => "1 KB"),
  getRoomVideoBackendReadiness: mocks.readiness,
  getAdminRoomVideosForRoom: mocks.list,
  publishRoomVideo: mocks.publish,
  roomVideoBackendStatusMessage: (status: string) => ({
    missing_table: "Room Videos is not configured in the database yet. Please contact the administrator to complete setup.",
    no_access: "Your account does not have permission to manage Room Videos. Contact an administrator if you need access.",
    unavailable: "Room Videos setup could not be checked. Check your connection and try again.",
  }[status] ?? null),
  unpublishRoomVideo: mocks.unpublish,
  updateAdminRoomVideoTitle: mocks.updateTitle,
  uploadRoomVideoCaptions: mocks.captions,
  uploadRoomVideoDraft: mocks.upload,
}));

import { RoomVideoAdminSection } from "../RoomVideoAdminSection";

const room: FloorRoom = {
  id: "room-1", name: "TEST ONLY Room", type: "hall", x: 0, y: 0, w: 100, h: 100,
  buildingId: "building-1", floorId: "floor-1",
};

function openMoreActions(title: string) {
  fireEvent.pointerDown(screen.getByRole("button", { name: `More actions for ${title}` }), {
    button: 0,
    ctrlKey: false,
    pointerType: "mouse",
  });
}

describe("RoomVideoAdminSection setup handling", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    mocks.readiness.mockResolvedValue("ready");
    mocks.list.mockResolvedValue([]);
    mocks.preview.mockResolvedValue("https://signed.example/preview.mp4");
    mocks.captions.mockResolvedValue(undefined);
  });

  it("shows one concise missing-table state and prevents upload without creating a draft", async () => {
    mocks.readiness.mockResolvedValue("missing_table");
    render(<RoomVideoAdminSection campusId="campus-1" buildingId="building-1" floorId="floor-1" room={room} />);
    fireEvent.click(screen.getByRole("button", { name: "Room Videos" }));

    expect(await screen.findByTestId("room-video-setup-required")).toHaveTextContent("Video setup required");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Upload Video" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Video title")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Setup details"));
    expect(await screen.findByText(/Room Videos is not configured in the database yet/)).toBeInTheDocument();
    expect(screen.queryByTestId("room-video-upload-input")).not.toBeInTheDocument();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("reports Admin permission errors separately and hides upload controls", async () => {
    mocks.readiness.mockResolvedValue("no_access");
    render(<RoomVideoAdminSection campusId="campus-1" buildingId="building-1" floorId="floor-1" room={room} />);
    fireEvent.click(screen.getByRole("button", { name: "Room Videos" }));

    expect(await screen.findByTestId("room-video-setup-required")).toHaveTextContent("Admin access required");
    expect(screen.queryByRole("button", { name: "Upload Video" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Setup details"));
    expect(await screen.findByText(/does not have permission/i)).toBeInTheDocument();
    expect(screen.queryByText(/not configured in the database yet/i)).not.toBeInTheDocument();
  });

  it("keeps title entry in the replacement flow and focuses the Admin UI on one current video", async () => {
    const row = {
      id: "video-1", campus_id: "campus-1", building_id: "building-1", floor_id: "floor-1", room_id: room.id,
      storage_path: "campus-1/room-1/video-1.mp4", captions_path: null, original_filename: "room.mp4",
      mime_type: "video/mp4", file_size_bytes: 1024, title: "Room intro", status: "published",
    };
    mocks.list.mockResolvedValue([row]);
    render(<RoomVideoAdminSection campusId="campus-1" buildingId="building-1" floorId="floor-1" room={room} />);
    fireEvent.click(screen.getByRole("button", { name: /Room Videos/ }));

    expect(await screen.findByTestId("room-video-row-video-1")).toHaveTextContent("Published");
    expect(screen.queryByLabelText("New room video title")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand Preview" })).toBeInTheDocument();
    openMoreActions("Room intro");
    expect(screen.getByRole("menuitem", { name: "Edit title" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Replace video" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Captions" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unpublish" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("menuitem", { name: "Replace video" }));
    const input = document.querySelector<HTMLInputElement>('[data-testid="room-video-replace-input"]')!;
    fireEvent.change(input, { target: { files: [new File(["TEST ONLY"], "welcome.mp4", { type: "video/mp4" })] } });
    expect(await screen.findByLabelText("New room video title")).toHaveValue("Room intro");
    expect(screen.getByRole("button", { name: "Save as draft" })).toBeInTheDocument();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("saves a selected Room Video only after the title is confirmed in the upload flow", async () => {
    const row = {
      id: "video-draft", campus_id: "campus-1", building_id: "building-1", floor_id: "floor-1", room_id: room.id,
      storage_path: "campus-1/room-1/video-draft.mp4", captions_path: null, original_filename: "welcome.mp4",
      mime_type: "video/mp4", file_size_bytes: 1024, title: "Welcome", status: "draft",
    };
    mocks.upload.mockResolvedValue(row);
    mocks.list.mockResolvedValueOnce([]).mockResolvedValue([row]);
    render(<RoomVideoAdminSection campusId="campus-1" buildingId="building-1" floorId="floor-1" room={room} />);
    fireEvent.click(screen.getByRole("button", { name: /Room Videos/ }));
    await screen.findByRole("button", { name: "Upload Video" });

    const input = document.querySelector<HTMLInputElement>('[data-testid="room-video-upload-input"]')!;
    fireEvent.change(input, { target: { files: [new File(["TEST ONLY"], "welcome.mp4", { type: "video/mp4" })] } });
    fireEvent.click(await screen.findByRole("button", { name: "Save as draft" }));

    expect(await screen.findByTestId("room-video-row-video-draft")).toHaveTextContent("Welcome");
    expect(mocks.upload).toHaveBeenCalledWith(expect.objectContaining({ title: "welcome", roomId: room.id }));
  });

  it.each(["storage", "network"] as const)("keeps the Room Videos feature available after a %s action failure", async (kind) => {
    const row = {
      id: "video-retry", campus_id: "campus-1", building_id: "building-1", floor_id: "floor-1", room_id: room.id,
      storage_path: "campus-1/room-1/video-retry.mp4", captions_path: null, original_filename: "room.mp4",
      mime_type: "video/mp4", file_size_bytes: 1024, title: "Room intro", status: "draft",
    };
    mocks.list.mockResolvedValue([row]);
    mocks.updateTitle.mockRejectedValue(new RoomVideoServiceError(kind, `TEST ONLY ${kind} failure`));
    render(<RoomVideoAdminSection campusId="campus-1" buildingId="building-1" floorId="floor-1" room={room} />);
    fireEvent.click(screen.getByRole("button", { name: /Room Videos/ }));
    await screen.findByTestId("room-video-row-video-retry");
    openMoreActions("Room intro");
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit title" }));
    fireEvent.click(screen.getByRole("button", { name: "Save title for Room intro" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(`TEST ONLY ${kind} failure`);
    expect(screen.getByRole("button", { name: "More actions for Room intro" })).toBeEnabled();
    expect(screen.getByTestId("room-video-row-video-retry")).toBeInTheDocument();
    expect(mocks.list).toHaveBeenCalledTimes(2);
  });

  it("refreshes the row after a partially successful archive and keeps the cleanup error visible", async () => {
    const row = {
      id: "video-archive", campus_id: "campus-1", building_id: "building-1", floor_id: "floor-1", room_id: room.id,
      storage_path: "campus-1/room-1/video-archive.mp4", captions_path: null, original_filename: "room.mp4",
      mime_type: "video/mp4", file_size_bytes: 1024, title: "Old room intro", status: "draft",
    };
    mocks.list.mockResolvedValueOnce([row]).mockResolvedValueOnce([{ ...row, status: "archived" }]);
    mocks.remove.mockRejectedValue(new Error("TEST ONLY media cleanup failed after archive"));
    render(<RoomVideoAdminSection campusId="campus-1" buildingId="building-1" floorId="floor-1" room={room} />);
    fireEvent.click(screen.getByRole("button", { name: /Room Videos/ }));
    await screen.findByTestId("room-video-row-video-archive");
    openMoreActions("Old room intro");
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove video" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("cleanup failed after archive");
    expect(screen.getByTestId("room-video-row-video-archive")).toHaveTextContent("Archived");
    expect(screen.getByRole("button", { name: "Upload Video" })).toBeEnabled();
    expect(mocks.list).toHaveBeenCalledTimes(2);
  });

  it("replaces a video through a new draft and removes the prior row only after upload succeeds", async () => {
    const oldRow = {
      id: "video-old", campus_id: "campus-1", building_id: "building-1", floor_id: "floor-1", room_id: room.id,
      storage_path: "campus-1/room-1/video-old.mp4", captions_path: null, original_filename: "old.mp4",
      mime_type: "video/mp4", file_size_bytes: 1024, title: "Room intro", status: "published",
    };
    const newRow = {
      ...oldRow, id: "video-new", storage_path: "campus-1/room-1/video-new.mp4", original_filename: "updated.mp4",
      title: "Room intro", status: "draft",
    };
    mocks.list.mockResolvedValueOnce([oldRow]).mockResolvedValueOnce([newRow]);
    mocks.upload.mockResolvedValue(newRow);
    mocks.remove.mockResolvedValue(undefined);
    render(<RoomVideoAdminSection campusId="campus-1" buildingId="building-1" floorId="floor-1" room={room} />);
    fireEvent.click(screen.getByRole("button", { name: /Room Videos/ }));
    await screen.findByTestId("room-video-row-video-old");
    openMoreActions("Room intro");
    fireEvent.click(screen.getByRole("menuitem", { name: "Replace video" }));
    const input = document.querySelector<HTMLInputElement>('[data-testid="room-video-replace-input"]')!;
    fireEvent.change(input, { target: { files: [new File(["TEST ONLY"], "updated.mp4", { type: "video/mp4" })] } });
    fireEvent.click(await screen.findByRole("button", { name: "Save as draft" }));

    expect(await screen.findByTestId("room-video-row-video-new")).toHaveTextContent("Draft");
    expect(mocks.upload).toHaveBeenCalledWith(expect.objectContaining({ roomId: room.id, title: "Room intro" }));
    expect(mocks.remove).toHaveBeenCalledWith("video-old");
  });

  it("keeps the latest published video primary and hides other records in collapsed history", async () => {
    const row = (id: string, status: string, title: string) => ({
      id, campus_id: "campus-1", building_id: "building-1", floor_id: "floor-1", room_id: room.id,
      storage_path: `campus-1/room-1/${id}.mp4`, captions_path: null, original_filename: `${id}.mp4`,
      mime_type: "video/mp4", file_size_bytes: 1024, title, status,
    });
    mocks.list.mockResolvedValue([
      row("video-draft", "draft", "New draft"),
      row("video-current", "published", "Current published intro"),
      row("video-archived", "archived", "Archived intro"),
    ]);
    render(<RoomVideoAdminSection campusId="campus-1" buildingId="building-1" floorId="floor-1" room={room} />);
    fireEvent.click(screen.getByRole("button", { name: /Room Videos/ }));

    expect(await screen.findByTestId("room-video-row-video-current")).toBeInTheDocument();
    expect(screen.getByTestId("room-video-row-video-draft")).not.toBeVisible();
    expect(screen.getByTestId("room-video-row-video-archived")).not.toBeVisible();
    fireEvent.click(screen.getByText(/Other versions/));
    expect(await screen.findByTestId("room-video-row-video-draft")).toBeInTheDocument();
    expect(screen.getByTestId("room-video-row-video-archived")).toHaveTextContent("Archived");
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("supports preview, caption attachment, publish, unpublish, and remove from the primary card", async () => {
    const draft = {
      id: "video-lifecycle", campus_id: "campus-1", building_id: "building-1", floor_id: "floor-1", room_id: room.id,
      storage_path: "campus-1/room-1/video-lifecycle.mp4", captions_path: null, original_filename: "room.mp4",
      mime_type: "video/mp4", file_size_bytes: 1024, title: "Room intro", status: "draft",
    };
    const published = { ...draft, status: "published" };
    mocks.list.mockResolvedValueOnce([draft]).mockResolvedValueOnce([draft]).mockResolvedValueOnce([published]).mockResolvedValueOnce([draft]).mockResolvedValueOnce([]);
    render(<RoomVideoAdminSection campusId="campus-1" buildingId="building-1" floorId="floor-1" room={room} />);
    fireEvent.click(screen.getByRole("button", { name: /Room Videos/ }));
    await screen.findByTestId("room-video-row-video-lifecycle");

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(await screen.findByTestId("room-video-preview-video-lifecycle")).toHaveAttribute("src", "https://signed.example/preview.mp4");
    expect(mocks.preview).toHaveBeenCalledWith("video-lifecycle");

    openMoreActions("Room intro");
    fireEvent.click(screen.getByRole("menuitem", { name: "Captions" }));
    const captionsInput = document.querySelector<HTMLInputElement>('[data-testid="room-video-captions-input"]')!;
    const captions = new File(["WEBVTT\n"], "captions.vtt", { type: "text/vtt" });
    fireEvent.change(captionsInput, { target: { files: [captions] } });
    await waitFor(() => expect(mocks.captions).toHaveBeenCalledWith("video-lifecycle", captions));

    fireEvent.click(await screen.findByRole("button", { name: "Publish" }));
    await screen.findByRole("button", { name: "Unpublish" });
    expect(mocks.publish).toHaveBeenCalledWith("video-lifecycle");
    fireEvent.click(screen.getByRole("button", { name: "Unpublish" }));
    await screen.findByRole("button", { name: "Publish" });
    expect(mocks.unpublish).toHaveBeenCalledWith("video-lifecycle");

    openMoreActions("Room intro");
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Remove this Room Video?");
    expect(mocks.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remove video" }));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith("video-lifecycle"));
  });

  it("opens one large player instance and stops it when the expanded preview closes", async () => {
    const row = {
      id: "video-expanded", campus_id: "campus-1", building_id: "building-1", floor_id: "floor-1", room_id: room.id,
      storage_path: "campus-1/room-1/video-expanded.mp4", captions_path: null, original_filename: "room.mp4",
      mime_type: "video/mp4", file_size_bytes: 1024, title: "Room preview", status: "draft",
    };
    mocks.list.mockResolvedValue([row]);
    const pause = vi.fn();
    Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: pause });
    render(<RoomVideoAdminSection campusId="campus-1" buildingId="building-1" floorId="floor-1" room={room} />);
    fireEvent.click(screen.getByRole("button", { name: /Room Videos/ }));
    await screen.findByTestId("room-video-row-video-expanded");
    const expandButton = screen.getByRole("button", { name: "Expand Preview" });
    fireEvent.click(expandButton);

    const dialog = await screen.findByTestId("room-video-expanded-preview");
    const video = screen.getByTestId("room-video-expanded-video-expanded");
    expect(dialog.querySelectorAll("video")).toHaveLength(1);
    expect(screen.queryByTestId("room-video-preview-video-expanded")).not.toBeInTheDocument();
    fireEvent.playing(video);
    fireEvent.click(screen.getByRole("button", { name: "Close expanded preview" }));
    await waitFor(() => expect(screen.queryByTestId("room-video-expanded-preview")).not.toBeInTheDocument());
    expect(video).not.toBeInTheDocument();
    expect(pause).toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(expandButton));
  });
});

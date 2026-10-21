import { act, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RoomDest } from "../../../lib/combinedPathfinding";
import { StudentSelectedPlaceCard } from "../StudentSelectedPlaceCard";

const mocks = vi.hoisted(() => ({
  photo: vi.fn(),
  invalidatePhoto: vi.fn(),
  videoUnmounted: vi.fn(),
  holdVideoAvailability: false,
  initialVideoAvailable: false,
  videoAvailable: false,
  emitVideoAvailability: vi.fn(),
}));
vi.mock("../../../services/roomPhotoService", () => ({
  getPublishedRoomPhotoUrl: mocks.photo,
  invalidatePublishedRoomPhotoUrl: mocks.invalidatePhoto,
}));
vi.mock("../StudentRoomVideoCard", () => ({
  StudentRoomVideoCard: ({
    onVideoAvailabilityChange,
    onExpandedChange,
  }: {
    onVideoAvailabilityChange?: (available: boolean) => void;
    onExpandedChange?: (expanded: boolean) => void;
  }) => {
    useEffect(() => {
      mocks.emitVideoAvailability.mockImplementation((available: boolean) => {
        mocks.videoAvailable = available;
        onVideoAvailabilityChange?.(available);
        onExpandedChange?.(available);
      });
      if (!mocks.holdVideoAvailability) {
        void Promise.resolve().then(() => mocks.emitVideoAvailability(mocks.initialVideoAvailable));
      }
      return () => mocks.videoUnmounted();
    }, [onExpandedChange, onVideoAvailabilityChange]);
    if (!mocks.videoAvailable) return null;
    return (
      <div data-testid="student-room-videos">
        <span>Published Room Video</span>
      </div>
    );
  },
}));
vi.mock("../StudentEmergencyVideoCard", () => ({ StudentEmergencyVideoCard: () => null }));

const room: RoomDest = {
  type: "room", buildingId: "building-a", floorNumber: 2, roomId: "room-a", roomName: "Room 204",
  buildingLabel: "Library", buildingCode: "LIB", floorLabel: "Second Floor",
};
const actions = { onDirections: vi.fn(), onStartHere: vi.fn(), onReport: vi.fn(), onClose: vi.fn() };

describe("Student room information", () => {
  afterEach(() => vi.unstubAllGlobals());

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.holdVideoAvailability = false;
    mocks.initialVideoAvailable = false;
    mocks.videoAvailable = false;
    mocks.photo.mockResolvedValue("https://signed.example/published-room-photo.webp");
  });

  it("keeps compact details short and reveals the signed photo after expanding", async () => {
    render(<StudentSelectedPlaceCard
      room={room} campusId="campus-a" buildingId="building-a" floorId="floor-a"
      description="A quiet room for study." roomPhotoPath="campus-a/building-a/floor-a/room-a/photo.webp"
      {...actions}
    />);
    expect(await screen.findByTestId("student-room-content-hints")).toHaveTextContent("Photo available");
    expect(screen.queryByAltText("Room 204")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expand room information" }));
    expect(await screen.findByAltText("Room 204")).toHaveAttribute("src", "https://signed.example/published-room-photo.webp");
    expect(screen.getByText("About This Room")).toBeInTheDocument();
    expect(screen.getByText("A quiet room for study.")).toBeInTheDocument();
    expect(screen.getByTestId("student-room-floor-context")).toHaveTextContent("Second Floor");
    expect(screen.getByRole("button", { name: "Directions" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
    expect(screen.getByTestId("room-report")).toBeInTheDocument();
  });

  it("does not render an empty photo or description section for a room without optional information", () => {
    render(<StudentSelectedPlaceCard room={room} {...actions} />);
    expect(screen.queryByTestId("student-room-photo")).not.toBeInTheDocument();
    expect(screen.queryByText("About This Room")).not.toBeInTheDocument();
    expect(screen.queryByText(/No image uploaded|No description available/i)).not.toBeInTheDocument();
  });

  it("supports description-only and photo-only Rooms without empty media sections", async () => {
    const descriptionOnly = render(<StudentSelectedPlaceCard room={room} description="A quiet study room." {...actions} />);
    fireEvent.click(screen.getByRole("button", { name: "Expand room information" }));
    expect(screen.getByText("About This Room")).toBeInTheDocument();
    expect(screen.getByText("A quiet study room.")).toBeInTheDocument();
    expect(screen.queryByTestId("student-room-photo")).not.toBeInTheDocument();
    descriptionOnly.unmount();

    render(<StudentSelectedPlaceCard
      room={room} campusId="campus-a" buildingId="building-a" floorId="floor-a"
      roomPhotoPath="campus-a/building-a/floor-a/room-a/photo.webp" {...actions}
    />);
    expect(await screen.findByTestId("student-room-content-hints")).toHaveTextContent("Photo available");
    fireEvent.click(screen.getByRole("button", { name: "Expand room information" }));
    expect(await screen.findByAltText("Room 204")).toHaveAttribute("src", "https://signed.example/published-room-photo.webp");
    expect(screen.queryByText("About This Room")).not.toBeInTheDocument();
    expect(screen.getByTestId("student-room-photo")).toBeInTheDocument();
  });

  it("reveals a loaded published photo when browser decoding stalls", async () => {
    class LoadedImageWithStalledDecode {
      complete = false;
      naturalWidth = 0;
      naturalHeight = 0;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      decode = () => new Promise<void>(() => {});
      private imageUrl = "";
      set src(value: string) {
        this.imageUrl = value;
        this.complete = true;
        this.naturalWidth = 640;
        this.naturalHeight = 480;
        this.onload?.();
      }
      get src() { return this.imageUrl; }
    }
    vi.stubGlobal("Image", LoadedImageWithStalledDecode);

    render(<StudentSelectedPlaceCard
      room={room} campusId="campus-a" buildingId="building-a" floorId="floor-a"
      roomPhotoPath="campus-a/building-a/floor-a/room-a/photo.webp" {...actions}
    />);
    fireEvent.click(screen.getByRole("button", { name: "Expand room information" }));

    expect(await screen.findByAltText("Room 204")).toHaveAttribute("src", "https://signed.example/published-room-photo.webp");
    expect(screen.queryByTestId("student-room-photo-loading")).not.toBeInTheDocument();
  });

  it("hides route actions when Room Details is reused inside Discover PLV", () => {
    render(<StudentSelectedPlaceCard room={room} hideRouteActions {...actions} />);
    expect(screen.queryByRole("button", { name: "Directions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Report this room" })).toBeInTheDocument();
  });

  it("unmounts the Room Video when exiting Discover even if the same Room stays selected", () => {
    const props = {
      room,
      campusId: "campus-a",
      buildingId: "building-a",
      floorId: "floor-a",
      hideRouteActions: true,
      description: "Discover room details.",
      ...actions,
    };
    const view = render(<StudentSelectedPlaceCard {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Expand room information" }));
    act(() => mocks.emitVideoAvailability(true));

    view.rerender(<StudentSelectedPlaceCard {...props} hideRouteActions={false} />);

    expect(mocks.videoUnmounted).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the published photo path cannot be signed", async () => {
    mocks.photo.mockResolvedValueOnce(null);
    render(<StudentSelectedPlaceCard
      room={room} campusId="campus-a" buildingId="building-a" floorId="floor-a"
      roomPhotoPath="campus-a/building-a/floor-a/room-a/draft-only.webp" {...actions}
    />);
    await Promise.resolve();
    expect(screen.queryByTestId("student-room-photo")).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Room 204" })).not.toBeInTheDocument();
  });

  it("ignores a stale photo response after rapidly switching Rooms", async () => {
    let resolveA!: (url: string) => void;
    let resolveB!: (url: string) => void;
    mocks.photo
      .mockReturnValueOnce(new Promise<string>((resolve) => { resolveA = resolve; }))
      .mockReturnValueOnce(new Promise<string>((resolve) => { resolveB = resolve; }));
    const pathA = "campus-a/building-a/floor-a/room-a/photo.webp";
    const pathB = "campus-a/building-a/floor-a/room-b/photo.webp";
    const view = render(<StudentSelectedPlaceCard
      room={room} campusId="campus-a" buildingId="building-a" floorId="floor-a" roomPhotoPath={pathA} {...actions}
    />);
    view.rerender(<StudentSelectedPlaceCard
      room={{ ...room, roomId: "room-b", roomName: "Room 205" }} campusId="campus-a" buildingId="building-a" floorId="floor-a" roomPhotoPath={pathB} {...actions}
    />);
    fireEvent.click(screen.getByRole("button", { name: "Expand room information" }));

    resolveA("https://signed.example/room-a.webp");
    resolveB("https://signed.example/room-b.webp");

    expect(await screen.findByAltText("Room 205")).toHaveAttribute("src", "https://signed.example/room-b.webp");
    expect(screen.queryByAltText("Room 204")).not.toBeInTheDocument();
    expect(screen.getByTestId("student-room-photo")).toBeInTheDocument();
  });

  it("invalidates a short-lived cached URL when the image itself fails", async () => {
    render(<StudentSelectedPlaceCard
      room={room} campusId="campus-a" buildingId="building-a" floorId="floor-a"
      roomPhotoPath="campus-a/building-a/floor-a/room-a/photo.webp" {...actions}
    />);
    fireEvent.click(screen.getByRole("button", { name: "Expand room information" }));
    const image = await screen.findByAltText("Room 204");

    fireEvent.error(image);

    expect(mocks.invalidatePhoto).toHaveBeenCalledWith({
      campusId: "campus-a", buildingId: "building-a", floorId: "floor-a", roomId: "room-a",
      path: "campus-a/building-a/floor-a/room-a/photo.webp",
    });
    expect(screen.queryByTestId("student-room-photo")).not.toBeInTheDocument();
  });

  it("shows a photo without waiting for video lookup, then keeps it below a published video", async () => {
    mocks.holdVideoAvailability = true;
    const { container } = render(<StudentSelectedPlaceCard
      room={room} campusId="campus-a" buildingId="building-a" floorId="floor-a"
      description="A quiet, well-lit room for focused study." roomPhotoPath="campus-a/building-a/floor-a/room-a/photo.webp" {...actions}
    />);
    fireEvent.click(screen.getByRole("button", { name: "Expand room information" }));
    expect(await screen.findByAltText("Room 204")).toBeInTheDocument();
    expect(screen.queryByTestId("student-room-videos")).not.toBeInTheDocument();
    act(() => mocks.emitVideoAvailability(true));

    expect(screen.getByText("Published Room Video")).toBeInTheDocument();
    expect(screen.getByText("About This Room")).toBeInTheDocument();
    expect(screen.getByText("A quiet, well-lit room for focused study.")).toBeInTheDocument();

    const videos = screen.getByTestId("student-room-videos");
    const photo = screen.getByTestId("student-room-photo");
    const details = screen.getByTestId("student-room-sheet-details");
    expect(videos.compareDocumentPosition(photo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(photo.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelector("[data-testid='student-room-photo-loading']")).not.toBeInTheDocument();
  });

  it("does not let late video discovery undo a deliberate Compact choice", async () => {
    mocks.holdVideoAvailability = true;
    render(<StudentSelectedPlaceCard room={room} campusId="campus-a" description="Room details." {...actions} />);

    fireEvent.click(screen.getByRole("button", { name: "Expand room information" }));
    fireEvent.click(screen.getByRole("button", { name: "Collapse room information" }));
    act(() => mocks.emitVideoAvailability(true));

    expect(screen.getByRole("button", { name: "Expand room information" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByTestId("student-room-content-hints")).toHaveTextContent("Room video");
    expect(screen.getByText("Published Room Video")).not.toBeVisible();
  });

  it("opens the player on first selection when a published video exists", async () => {
    mocks.initialVideoAvailable = true;
    render(<StudentSelectedPlaceCard room={room} campusId="campus-a" {...actions} />);

    expect(await screen.findByRole("button", { name: "Collapse room information" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("student-room-videos").parentElement).not.toHaveClass("hidden");
  });
});

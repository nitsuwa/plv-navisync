import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HomeShowcaseSection } from "../HomeShowcaseSection";

const media = {
  videoUrl: "/test-only/showcase.mp4",
  posterUrl: "/test-only/showcase-poster.jpg",
  captions: { url: "/test-only/showcase.vtt", language: "en", label: "English captions" },
};
const playMock = vi.fn();

function renderShowcase(config: typeof media | { videoUrl: string; posterUrl?: string | null; captions?: null }) {
  return render(<MemoryRouter><HomeShowcaseSection media={config} /></MemoryRouter>);
}

describe("HomeShowcaseSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    playMock.mockResolvedValue(undefined);
    Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: playMock });
    Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: vi.fn() });
  });

  it("shows the static showcase artwork without mounting a broken or fake player when no source exists", () => {
    render(<MemoryRouter><HomeShowcaseSection media={{ videoUrl: null, posterUrl: null }} /></MemoryRouter>);

    expect(screen.getByRole("heading", { name: "See PLV NaviSync in Action" })).toBeInTheDocument();
    expect(screen.getByText("PLV NaviSync Showcase")).toBeInTheDocument();
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
    expect(screen.queryByTestId("home-showcase-video")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /play.*showcase/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /explore campus map/i }).every((link) => link.getAttribute("href") === "/map")).toBe(true);
  });

  it("uses an explicit-play native media element with optional captions and contained aspect ratio", async () => {
    renderShowcase(media);
    const video = screen.getByTestId("home-showcase-video") as HTMLVideoElement;

    expect(video).toHaveAttribute("src", media.videoUrl);
    expect(video).toHaveAttribute("poster", media.posterUrl);
    expect(video).toHaveAttribute("preload", "none");
    expect(video).toHaveAttribute("playsinline");
    expect(video).not.toHaveAttribute("autoplay");
    expect(video).not.toHaveAttribute("loop");
    expect(video.muted).toBe(false);
    expect(video.controls).toBe(false);
    expect(video.querySelector("track[kind='captions']")).toHaveAttribute("src", media.captions.url);
    expect(screen.getByTestId("home-showcase-player")).toHaveClass("aspect-video");
    expect(video).toHaveClass("object-contain");

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Play PLV NaviSync showcase video" })); });
    expect(playMock).toHaveBeenCalledOnce();
    fireEvent.loadedData(video);
    expect(video.controls).toBe(true);
    expect(video.loop).toBe(false);
  });

  it("offers replay after playback ends", async () => {
    renderShowcase(media);
    const video = screen.getByTestId("home-showcase-video") as HTMLVideoElement;
    Object.defineProperty(video, "currentTime", { configurable: true, writable: true, value: 12 });

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Play PLV NaviSync showcase video" })); });
    fireEvent.loadedData(video);
    fireEvent.ended(video);
    const replay = await screen.findByRole("button", { name: "Replay PLV NaviSync showcase video" });
    await act(async () => { fireEvent.click(replay); });

    expect(video.currentTime).toBe(0);
    expect(playMock).toHaveBeenCalledTimes(2);
  });

  it("recovers from a media error by remounting the configured source", async () => {
    renderShowcase(media);
    const video = screen.getByTestId("home-showcase-video");
    fireEvent.error(video);

    expect(screen.getByRole("alert")).toHaveTextContent("Video unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByTestId("home-showcase-video")).not.toBe(video));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByTestId("home-showcase-video")).toHaveAttribute("src", media.videoUrl);
  });

  it("shows a retry action if an explicitly requested video never finishes loading", async () => {
    vi.useFakeTimers();
    try {
      renderShowcase(media);
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Play PLV NaviSync showcase video" }));
        await Promise.resolve();
      });
      await act(async () => { vi.advanceTimersByTime(15000); });

      expect(screen.getByRole("alert")).toHaveTextContent("Video unavailable");
      expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("exits its fullscreen video when Escape is pressed", () => {
    renderShowcase(media);
    const video = screen.getByTestId("home-showcase-video");
    const fullscreenDescriptor = Object.getOwnPropertyDescriptor(document, "fullscreenElement");
    const exitFullscreenDescriptor = Object.getOwnPropertyDescriptor(document, "exitFullscreen");
    const exitFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: video });
    Object.defineProperty(document, "exitFullscreen", { configurable: true, value: exitFullscreen });

    try {
      fireEvent.keyDown(document, { key: "Escape" });
      expect(exitFullscreen).toHaveBeenCalledOnce();
    } finally {
      if (fullscreenDescriptor) Object.defineProperty(document, "fullscreenElement", fullscreenDescriptor);
      else Reflect.deleteProperty(document, "fullscreenElement");
      if (exitFullscreenDescriptor) Object.defineProperty(document, "exitFullscreen", exitFullscreenDescriptor);
      else Reflect.deleteProperty(document, "exitFullscreen");
    }
  });

  it("pauses the media element when the Home player unmounts", () => {
    const view = renderShowcase(media);
    view.unmount();

    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });
});

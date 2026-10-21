import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrandedRoomVideoPlayer } from "../BrandedRoomVideoPlayer";

describe("BrandedRoomVideoPlayer", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: vi.fn().mockResolvedValue(undefined) });
    Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: vi.fn() });
    Object.defineProperty(HTMLMediaElement.prototype, "load", { configurable: true, value: vi.fn() });
  });

  afterEach(() => vi.useRealTimers());

  it("uses accessible custom controls for playback, progress, volume, captions and fullscreen", async () => {
    const fullscreen = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<BrandedRoomVideoPlayer src="https://signed.example/room.mp4" title="Room welcome" captionsUrl="https://signed.example/captions.vtt" downloadUrl="https://signed.example/download" testId="student-room-video-test" />);
    Object.defineProperty(screen.getByTestId("student-room-video-test-frame"), "requestFullscreen", { configurable: true, value: fullscreen });
    const video = screen.getByTestId("student-room-video-test") as HTMLVideoElement;
    expect(video.controls).toBe(false);
    expect(video.playsInline).toBe(true);
    expect(screen.getByTestId("student-room-video-test-frame").querySelector(".aspect-video")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();

    Object.defineProperty(video, "duration", { configurable: true, value: 90 });
    fireEvent.loadedMetadata(video);
    fireEvent.canPlay(video);
    expect(screen.queryByRole("button", { name: "Start Room welcome playback" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Play Room welcome" }));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    fireEvent.playing(video);
    expect(screen.getByRole("button", { name: "Pause Room welcome" })).toBeInTheDocument();

    const seek = screen.getByRole("slider", { name: "Seek Room welcome" });
    fireEvent.change(seek, { target: { value: "42" } });
    expect(video.currentTime).toBe(42);
    fireEvent.click(screen.getByRole("button", { name: "Mute room video" }));
    fireEvent.change(screen.getByRole("slider", { name: "Room video volume" }), { target: { value: "0.4" } });
    expect(video.volume).toBeCloseTo(0.4);
    fireEvent.click(screen.getByRole("button", { name: "Turn captions on" }));
    expect(screen.getByRole("button", { name: "Turn captions off" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "View room video fullscreen" }));
    await waitFor(() => expect(fullscreen).toHaveBeenCalled());
    expect(container.querySelector("track[kind='captions']")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download Room welcome" })).toHaveAttribute("href", "https://signed.example/download");
  });

  it("shows a retry action when playback fails", async () => {
    const retry = vi.fn();
    render(<BrandedRoomVideoPlayer src="https://signed.example/room.mp4" title="Room welcome" onRetry={retry} />);
    fireEvent.canPlay(screen.getByTestId("room-video-player"));
    fireEvent.error(screen.getByTestId("room-video-player"));
    expect(screen.getByRole("alert")).toHaveTextContent(/could not be loaded/i);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
    await waitFor(() => expect(HTMLMediaElement.prototype.load).toHaveBeenCalled());
  });

  it("uses compact native controls with one idle Play control for Student video", () => {
    const view = render(<BrandedRoomVideoPlayer mode="native" src="https://signed.example/student.mp4" title="Student video" testId="native-student-video" />);
    const video = screen.getByTestId("native-student-video") as HTMLVideoElement;
    const play = screen.getByRole("button", { name: "Play Student video" });

    expect(video).toHaveAttribute("preload", "metadata");
    expect(video).toHaveAttribute("src", "https://signed.example/student.mp4");
    expect(video.controls).toBe(false);
    expect(screen.getByTestId("native-student-video-frame")).toHaveClass("aspect-video");

    fireEvent.click(play);
    expect(video.controls).toBe(true);
    expect(screen.queryByRole("button", { name: "Play Student video" })).not.toBeInTheDocument();
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();

    view.unmount();
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });

  it("fades controls during playback and reveals them on touch, hover, and keyboard focus", () => {
    vi.useFakeTimers();
    render(<BrandedRoomVideoPlayer src="https://signed.example/room.mp4" title="Room welcome" testId="visibility-test" />);
    const video = screen.getByTestId("visibility-test");
    const frame = screen.getByTestId("visibility-test-frame");
    const controls = screen.getByTestId("visibility-test-controls");

    fireEvent.canPlay(video);
    fireEvent.click(screen.getByRole("button", { name: "Play Room welcome" }));
    fireEvent.playing(video);

    act(() => vi.advanceTimersByTime(2399));
    expect(controls).toHaveAttribute("aria-hidden", "false");
    act(() => vi.advanceTimersByTime(1));
    expect(controls).toHaveAttribute("aria-hidden", "true");
    expect([...controls.querySelectorAll("button, a, input")].every((element) => (element as HTMLElement).tabIndex === -1)).toBe(true);

    fireEvent.pointerDown(frame, { pointerType: "touch" });
    expect(controls).toHaveAttribute("aria-hidden", "false");
    act(() => vi.advanceTimersByTime(2400));
    expect(controls).toHaveAttribute("aria-hidden", "true");

    fireEvent.pointerEnter(frame, { pointerType: "mouse" });
    expect(controls).toHaveAttribute("aria-hidden", "false");
    fireEvent.pointerLeave(frame, { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(2400));
    expect(controls).toHaveAttribute("aria-hidden", "true");

    fireEvent.focus(frame);
    expect(controls).toHaveAttribute("aria-hidden", "false");
    fireEvent.blur(frame, { relatedTarget: document.body });
    act(() => vi.advanceTimersByTime(2400));
    expect(controls).toHaveAttribute("aria-hidden", "true");
  });

  it("falls back to the same in-page player when the browser rejects fullscreen and exits with Escape", async () => {
    const view = render(<BrandedRoomVideoPlayer src="https://signed.example/room.mp4" title="Room welcome" testId="fallback-fullscreen" />);
    const frame = screen.getByTestId("fallback-fullscreen-frame");
    const video = screen.getByTestId("fallback-fullscreen") as HTMLVideoElement;
    const requestFullscreen = vi.fn().mockRejectedValue(new Error("fullscreen is blocked"));
    Object.defineProperty(frame, "requestFullscreen", { configurable: true, value: requestFullscreen });
    Object.defineProperty(video, "currentTime", { configurable: true, writable: true, value: 23 });
    Object.defineProperty(video, "volume", { configurable: true, writable: true, value: 0.45 });

    fireEvent.click(screen.getByRole("button", { name: "View room video fullscreen" }));
    await waitFor(() => expect(frame).toHaveClass("fixed"));
    expect(requestFullscreen).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Exit fullscreen" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(frame).not.toHaveClass("fixed");
    expect(screen.getByTestId("fallback-fullscreen")).toBe(video);
    expect(video.currentTime).toBe(23);
    expect(video.volume).toBeCloseTo(0.45);
    expect(view.container.querySelector("[role='alert']")).not.toBeInTheDocument();
  });

  it("tracks standard fullscreen entry and exit on the same media element", async () => {
    const { container } = render(<BrandedRoomVideoPlayer src="https://signed.example/room.mp4" title="Room welcome" testId="standard-fullscreen" />);
    const frame = screen.getByTestId("standard-fullscreen-frame") as HTMLElement & { requestFullscreen: () => Promise<void> };
    const video = screen.getByTestId("standard-fullscreen") as HTMLVideoElement;
    const fullscreenDescriptor = Object.getOwnPropertyDescriptor(document, "fullscreenElement");
    const exitDescriptor = Object.getOwnPropertyDescriptor(document, "exitFullscreen");
    const requestFullscreen = vi.fn(() => {
      Object.defineProperty(document, "fullscreenElement", { configurable: true, value: frame });
      fireEvent(document, new Event("fullscreenchange"));
      return Promise.resolve();
    });
    const exitFullscreen = vi.fn(() => {
      Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
      fireEvent(document, new Event("fullscreenchange"));
      return Promise.resolve();
    });
    Object.defineProperty(frame, "requestFullscreen", { configurable: true, value: requestFullscreen });
    Object.defineProperty(document, "exitFullscreen", { configurable: true, value: exitFullscreen });
    try {
      fireEvent.click(screen.getByRole("button", { name: "View room video fullscreen" }));
      await waitFor(() => expect(requestFullscreen).toHaveBeenCalledOnce());
      expect(screen.getByRole("button", { name: "Exit fullscreen" })).toBeInTheDocument();
      expect(screen.getByTestId("standard-fullscreen")).toBe(video);

      fireEvent.click(screen.getByRole("button", { name: "Exit fullscreen" }));
      expect(exitFullscreen).toHaveBeenCalledOnce();
      expect(screen.getByRole("button", { name: "View room video fullscreen" })).toBeInTheDocument();
      expect(container.querySelector("[role='alert']")).not.toBeInTheDocument();
    } finally {
      if (fullscreenDescriptor) Object.defineProperty(document, "fullscreenElement", fullscreenDescriptor);
      else Reflect.deleteProperty(document, "fullscreenElement");
      if (exitDescriptor) Object.defineProperty(document, "exitFullscreen", exitDescriptor);
      else Reflect.deleteProperty(document, "exitFullscreen");
    }
  });

  it("falls back when a restricted browser leaves the fullscreen request pending", () => {
    vi.useFakeTimers();
    const { container } = render(<BrandedRoomVideoPlayer src="https://signed.example/room.mp4" title="Room welcome" testId="pending-fullscreen" />);
    const frame = screen.getByTestId("pending-fullscreen-frame");
    Object.defineProperty(frame, "requestFullscreen", { configurable: true, value: vi.fn(() => new Promise<void>(() => {})) });

    fireEvent.click(screen.getByRole("button", { name: "View room video fullscreen" }));
    act(() => vi.advanceTimersByTime(1500));
    expect(frame).toHaveClass("fixed");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(frame).not.toHaveClass("fixed");
    expect(container.querySelector("[role='alert']")).not.toBeInTheDocument();
  });

  it("supports iOS video fullscreen events when the standard element API is unavailable", () => {
    const { container } = render(<BrandedRoomVideoPlayer src="https://signed.example/room.mp4" title="Room welcome" testId="webkit-fullscreen" />);
    const video = screen.getByTestId("webkit-fullscreen") as HTMLVideoElement & {
      webkitDisplayingFullscreen?: boolean;
      webkitEnterFullscreen?: () => void;
      webkitExitFullscreen?: () => void;
    };
    const enter = vi.fn(() => { video.webkitDisplayingFullscreen = true; });
    const exit = vi.fn(() => { video.webkitDisplayingFullscreen = false; });
    video.webkitEnterFullscreen = enter;
    video.webkitExitFullscreen = exit;

    fireEvent.click(screen.getByRole("button", { name: "View room video fullscreen" }));
    expect(enter).toHaveBeenCalledOnce();
    fireEvent(video, new Event("webkitbeginfullscreen"));
    expect(screen.getByRole("button", { name: "Exit fullscreen" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Exit fullscreen" }));
    expect(exit).toHaveBeenCalledOnce();
    fireEvent(video, new Event("webkitendfullscreen"));
    expect(screen.getByRole("button", { name: "View room video fullscreen" })).toBeInTheDocument();
    expect(container.querySelector("[role='alert']")).not.toBeInTheDocument();
  });

  it("uses iOS video fullscreen directly even when a wrapper fullscreen method exists", () => {
    render(<BrandedRoomVideoPlayer src="https://signed.example/room.mp4" title="Room welcome" testId="ios-fullscreen" />);
    const frame = screen.getByTestId("ios-fullscreen-frame");
    const video = screen.getByTestId("ios-fullscreen") as HTMLVideoElement & {
      webkitDisplayingFullscreen?: boolean;
      webkitSupportsFullscreen?: boolean;
      webkitEnterFullscreen?: () => void;
    };
    const userAgentDescriptor = Object.getOwnPropertyDescriptor(navigator, "userAgent");
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    const enter = vi.fn(() => { video.webkitDisplayingFullscreen = true; });
    Object.defineProperty(navigator, "userAgent", { configurable: true, value: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1" });
    Object.defineProperty(frame, "requestFullscreen", { configurable: true, value: requestFullscreen });
    video.webkitSupportsFullscreen = true;
    video.webkitEnterFullscreen = enter;

    try {
      fireEvent.click(screen.getByRole("button", { name: "View room video fullscreen" }));
      expect(enter).toHaveBeenCalledOnce();
      expect(requestFullscreen).not.toHaveBeenCalled();
      fireEvent(video, new Event("webkitbeginfullscreen"));
      expect(screen.getByRole("button", { name: "Exit fullscreen" })).toBeInTheDocument();
    } finally {
      if (userAgentDescriptor) Object.defineProperty(navigator, "userAgent", userAgentDescriptor);
      else Reflect.deleteProperty(navigator, "userAgent");
    }
  });

  it("uses the expanded player as a fullscreen fallback when no fullscreen API is exposed", async () => {
    const { container } = render(<BrandedRoomVideoPlayer src="https://signed.example/room.mp4" title="Room welcome" testId="unsupported-fullscreen" />);
    const frame = screen.getByTestId("unsupported-fullscreen-frame");
    const requestDescriptor = Object.getOwnPropertyDescriptor(frame, "requestFullscreen");
    const prototypeDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "requestFullscreen");
    Reflect.deleteProperty(frame, "requestFullscreen");
    Reflect.deleteProperty(HTMLElement.prototype, "requestFullscreen");
    try {
      fireEvent.click(screen.getByRole("button", { name: "View room video fullscreen" }));
      await waitFor(() => expect(frame).toHaveClass("fixed"));
      fireEvent.click(screen.getByRole("button", { name: "Exit fullscreen" }));
      expect(frame).not.toHaveClass("fixed");
      expect(container.querySelector("[role='alert']")).not.toBeInTheDocument();
    } finally {
      if (requestDescriptor) Object.defineProperty(frame, "requestFullscreen", requestDescriptor);
      if (prototypeDescriptor) Object.defineProperty(HTMLElement.prototype, "requestFullscreen", prototypeDescriptor);
    }
  });
});

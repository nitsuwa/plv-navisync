import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const scanner = vi.hoisted(() => ({
  decode: null as null | ((result: { getText: () => string } | undefined) => void),
  reject: null as Error | null,
  stop: vi.fn(),
}));

vi.mock("@zxing/browser", () => ({
  BrowserQRCodeReader: class {
    decodeFromVideoDevice(_device: unknown, _video: unknown, callback: typeof scanner.decode) {
      scanner.decode = callback;
      return scanner.reject ? Promise.reject(scanner.reject) : Promise.resolve({ stop: scanner.stop });
    }
  },
}));

import { LocationQRScanner } from "../LocationQRScanner";

describe("LocationQRScanner", () => {
  beforeEach(() => {
    scanner.decode = null;
    scanner.reject = null;
    scanner.stop.mockClear();
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn() } });
  });

  it("explains camera permission denial and keeps map search available", async () => {
    scanner.reject = Object.assign(new Error("denied"), { name: "NotAllowedError" });
    render(<LocationQRScanner onClose={vi.fn()} onScan={vi.fn()} onSearchInstead={vi.fn()} />);
    expect(await screen.findByText(/Camera access was denied/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Search the map instead/ })).toBeInTheDocument();
  });

  it("uses a full-screen mobile surface with a bounded viewfinder and centered square scan frame", () => {
    render(<LocationQRScanner onClose={vi.fn()} onScan={vi.fn()} onSearchInstead={vi.fn()} />);

    const dialog = screen.getByRole("dialog", { name: "Scan a location QR" });
    const scanner = screen.getByTestId("location-qr-scanner");
    const viewfinder = screen.getByTestId("location-qr-viewfinder");
    const frame = screen.getByTestId("location-qr-scan-frame");
    expect(scanner).toHaveClass("fixed", "inset-0", "z-[1000]");
    expect(dialog).toHaveClass("h-full", "w-full", "max-w-none", "sm:max-w-md");
    expect(viewfinder).toHaveClass("flex-1", "min-h-[min(58vw,14rem)]", "max-h-[58dvh]");
    expect(frame).toHaveClass("aspect-square", "left-1/2", "top-1/2");
    expect(screen.getByTestId("location-qr-video")).toHaveClass("object-cover");
    expect(screen.getByRole("button", { name: "Close QR scanner" })).toHaveClass("h-11", "w-11");
    expect(screen.getByRole("button", { name: /Search the map instead/ })).toHaveClass("min-h-11");
  });

  it("processes a valid camera result once and releases its stream", async () => {
    const onScan = vi.fn(() => true);
    const track = { stop: vi.fn() };
    const view = render(<LocationQRScanner onClose={vi.fn()} onScan={onScan} onSearchInstead={vi.fn()} />);
    const video = screen.getByTestId("location-qr-video") as HTMLVideoElement;
    let stream: MediaStream | { getTracks: () => { stop: () => void }[] } | null = { getTracks: () => [track] };
    Object.defineProperty(video, "srcObject", { configurable: true, get: () => stream, set: (value) => { stream = value; } });
    await waitFor(() => expect(scanner.decode).toBeTypeOf("function"));
    await act(async () => {
      scanner.decode?.({ getText: () => "https://example.test/map?locationId=gate" });
      scanner.decode?.({ getText: () => "https://example.test/map?locationId=gate" });
      await new Promise((resolve) => window.setTimeout(resolve, 110));
    });
    expect(onScan).toHaveBeenCalledOnce();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(scanner.stop).toHaveBeenCalledOnce();
    view.unmount();
  });
});

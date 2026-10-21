import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DiscoverTourPanel } from "../DiscoverTourPanel";

const handlers = {
  onPrevious: vi.fn(), onNext: vi.fn(), onEnter: vi.fn(), onBack: vi.fn(), onExit: vi.fn(),
};

describe("DiscoverTourPanel", () => {
  it("shows one authored stop, navigates, enters, and returns from inside", () => {
    const view = render(<DiscoverTourPanel
      open view="showcase" building={{ name: "Science Building", code: "SCI", description: "Labs and lecture rooms.", floorCount: 3 }}
      stopIndex={1} stopCount={3} {...handlers}
    />);
    expect(screen.getByTestId("discover-building-name")).toHaveTextContent("Science Building");
    expect(screen.getByTestId("discover-tour-position")).toHaveTextContent("Building 2 of 3");
    fireEvent.click(screen.getByRole("button", { name: "Previous Building" }));
    fireEvent.click(screen.getByRole("button", { name: "Next Building" }));
    fireEvent.click(screen.getByRole("button", { name: "See What's Inside" }));
    expect(handlers.onPrevious).toHaveBeenCalledOnce();
    expect(handlers.onNext).toHaveBeenCalledOnce();
    expect(handlers.onEnter).toHaveBeenCalledOnce();

    view.rerender(<DiscoverTourPanel
      open view="inside" building={{ name: "Science Building", code: "SCI", floorCount: 3 }}
      stopIndex={1} stopCount={3} {...handlers}
    />);
    expect(screen.getByRole("button", { name: "Back to Building" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next Building" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("discover-building-description")).not.toBeInTheDocument();
  });

  it("preserves useful scroll position when switching buildings and returning from inside", () => {
    const view = render(<DiscoverTourPanel
      open view="showcase" building={{ name: "Science Building", code: "SCI", description: "Labs and lecture rooms.", floorCount: 3 }}
      stopIndex={0} stopCount={2} {...handlers}
    />);
    const content = screen.getByTestId("discover-panel-scroll-content");
    content.scrollTop = 80;
    fireEvent.scroll(content);
    view.rerender(<DiscoverTourPanel
      open view="showcase" building={{ name: "Library", code: "LIB", floorCount: 1 }}
      stopIndex={1} stopCount={2} {...handlers}
    />);
    expect(screen.getByTestId("discover-panel-scroll-content").scrollTop).toBe(80);
    view.rerender(<DiscoverTourPanel open view="inside" building={{ name: "Library", code: "LIB", floorCount: 1 }} stopIndex={1} stopCount={2} {...handlers} />);
    view.rerender(<DiscoverTourPanel open view="showcase" building={{ name: "Library", code: "LIB", floorCount: 1 }} stopIndex={1} stopCount={2} {...handlers} />);
    expect(screen.getByTestId("discover-panel-scroll-content").scrollTop).toBe(80);
  });

  it("keeps a single Back to Building control at the top left on desktop and mobile", () => {
    const onBack = vi.fn();
    render(<DiscoverTourPanel
      open view="inside" roomSelected building={{ name: "Science Building", code: "SCI", floorCount: 3 }}
      stopIndex={0} stopCount={1} {...handlers} onBack={onBack}
    />);

    const panel = screen.getByTestId("discover-tour-panel");
    expect(panel).toHaveClass("md:bottom-auto", "md:left-4", "md:right-auto", "md:top-4");
    expect(screen.queryByRole("button", { name: "Exit Tour" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Inside/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to Building" }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("handles a single stop and unavailable published content without fake building details", () => {
    const view = render(<DiscoverTourPanel open view="showcase" building={{ name: "Library", code: "LIB", floorCount: 0 }} stopIndex={0} stopCount={1} {...handlers} />);
    expect(screen.queryByRole("button", { name: "Previous Building" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next Building" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "See What's Inside" })).toBeDisabled();
    view.rerender(<DiscoverTourPanel open view="showcase" stopIndex={0} stopCount={0} unavailable {...handlers} />);
    expect(screen.getByText("No published buildings are available to explore yet.")).toBeInTheDocument();
    expect(screen.queryByTestId("discover-building-description")).not.toBeInTheDocument();
  });

  it("requires explicit confirmation before ending active navigation", () => {
    const onEndNavigationAndStart = vi.fn();
    const onCancelNavigationGuard = vi.fn();
    render(<DiscoverTourPanel open view="showcase" stopIndex={0} stopCount={0} navigationGuard {...handlers} onEndNavigationAndStart={onEndNavigationAndStart} onCancelNavigationGuard={onCancelNavigationGuard} />);
    expect(screen.getByRole("dialog", { name: "End navigation before the tour?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep Navigation" }));
    expect(onCancelNavigationGuard).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "End Navigation & Start Tour" }));
    expect(onEndNavigationAndStart).toHaveBeenCalledOnce();
  });

  it("keeps the mobile showcase compact until expanded, then reveals full description and cover", () => {
    const description = "A useful description of campus facilities and learning spaces. ".repeat(5);
    render(<DiscoverTourPanel open view="showcase" building={{ name: "Library", code: "LIB", description, coverImageUrl: "https://images.example/library.jpg", floorCount: 2 }} stopIndex={0} stopCount={1} {...handlers} />);
    const descriptionText = screen.getByTestId("discover-building-description");
    expect(descriptionText).toHaveClass("hidden", "md:block");
    expect(screen.getByTestId("discover-building-cover")).toHaveClass("hidden", "md:block");
    const disclosure = screen.getByRole("button", { name: "Expand Discover details" });
    fireEvent.click(disclosure);
    expect(disclosure).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("discover-building-description")).toHaveClass("block");
    expect(screen.getByTestId("discover-building-cover")).toHaveClass("block");
    expect(screen.getByRole("button", { name: "Collapse Discover details" })).toBeInTheDocument();
  });

  it("reveals the full building name when expanded and supports handle swipe gestures", () => {
    const longName = "COLLEGE OF ENGINEERING AND INFORMATION TECHNOLOGY";
    render(<DiscoverTourPanel open view="showcase" building={{ name: longName, code: "CEIT", floorCount: 6 }} stopIndex={4} stopCount={5} {...handlers} />);
    const heading = screen.getByTestId("discover-building-name");
    expect(heading).toHaveClass("line-clamp-2", "md:line-clamp-none");

    const handle = screen.getByTestId("discover-sheet-handle");
    fireEvent.pointerDown(handle, { pointerId: 7, pointerType: "touch", clientY: 70 });
    fireEvent.pointerUp(handle, { pointerId: 7, pointerType: "touch", clientY: 20 });

    expect(heading).toHaveClass("line-clamp-none");
    expect(screen.getByRole("button", { name: "Collapse Discover details" })).toBeInTheDocument();

    fireEvent.pointerDown(handle, { pointerId: 8, pointerType: "touch", clientY: 20 });
    fireEvent.pointerUp(handle, { pointerId: 8, pointerType: "touch", clientY: 70 });
    expect(screen.getByRole("button", { name: "Expand Discover details" })).toBeInTheDocument();
  });

  it("keeps a tour-owned expanded choice across building changes and entering/backing out", () => {
    const onMobileExpandedChange = vi.fn();
    const props = {
      open: true,
      view: "showcase" as const,
      building: { name: "Science Building", code: "SCI", description: "Details", floorCount: 3 },
      stopIndex: 0,
      stopCount: 3,
      mobileExpanded: false,
      onMobileExpandedChange,
      ...handlers,
    };
    const view = render(<DiscoverTourPanel {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Expand Discover details" }));
    expect(onMobileExpandedChange).toHaveBeenCalledWith(true);

    view.rerender(<DiscoverTourPanel {...props} mobileExpanded building={{ name: "CANTEEN", code: "CAN", floorCount: 1 }} stopIndex={1} />);
    expect(screen.getByRole("button", { name: "Collapse Discover details" })).toHaveAttribute("aria-expanded", "true");
    view.rerender(<DiscoverTourPanel {...props} mobileExpanded view="inside" />);
    view.rerender(<DiscoverTourPanel {...props} mobileExpanded view="showcase" />);
    expect(screen.getByRole("button", { name: "Collapse Discover details" })).toHaveAttribute("aria-expanded", "true");
  });

  it("shows only an actual cover image and hides it after an image load failure", () => {
    const view = render(<DiscoverTourPanel open view="showcase" building={{ name: "Library", code: "LIB", floorCount: 2 }} stopIndex={0} stopCount={1} {...handlers} />);
    expect(screen.queryByTestId("discover-building-cover")).not.toBeInTheDocument();
    view.rerender(<DiscoverTourPanel open view="showcase" building={{ name: "Library", code: "LIB", coverImageUrl: "https://images.example/library.jpg", floorCount: 2 }} stopIndex={0} stopCount={1} {...handlers} />);
    const image = view.container.querySelector<HTMLImageElement>('img[src="https://images.example/library.jpg"]');
    expect(image).toBeInTheDocument();
    fireEvent.load(image!);
    const visibleImage = screen.getByAltText("Library building cover");
    expect(visibleImage).toHaveAttribute("src", "https://images.example/library.jpg");
    fireEvent.error(visibleImage);
    expect(screen.queryByTestId("discover-building-cover")).not.toBeInTheDocument();
  });

  it("never shows the previous building cover beneath the newly selected building", async () => {
    const view = render(<DiscoverTourPanel open view="showcase" building={{ name: "CABA", code: "CABA", coverImageUrl: "https://images.example/caba.jpg", floorCount: 6 }} stopIndex={0} stopCount={2} {...handlers} />);
    const firstImage = view.container.querySelector<HTMLImageElement>('img[src="https://images.example/caba.jpg"]');
    fireEvent.load(firstImage!);
    expect(screen.getByAltText("CABA building cover")).toHaveAttribute("src", "https://images.example/caba.jpg");

    view.rerender(<DiscoverTourPanel open view="showcase" building={{ name: "COED", code: "COED", coverImageUrl: "https://images.example/coed.jpg", floorCount: 6 }} stopIndex={1} stopCount={2} {...handlers} />);
    expect(screen.queryByAltText("COED building cover")).not.toBeInTheDocument();
    expect(view.container.querySelector('img[src="https://images.example/caba.jpg"]')).not.toBeInTheDocument();
    expect(screen.getByTestId("discover-cover-loading")).toBeInTheDocument();
    fireEvent.load(firstImage!);
    expect(screen.queryByAltText("CABA building cover")).not.toBeInTheDocument();
    expect(screen.getByTestId("discover-cover-loading")).toBeInTheDocument();
    fireEvent.load(view.container.querySelector('img[src="https://images.example/coed.jpg"]')!);
    expect(await screen.findByAltText("COED building cover")).toHaveAttribute("src", "https://images.example/coed.jpg");
  });

  it("preloads neighboring covers and keeps a lightweight skeleton until the current cover is displayed", () => {
    const requested: string[] = [];
    vi.stubGlobal("Image", class {
      decoding = "";
      set src(value: string) { requested.push(value); }
    });
    try {
      render(<DiscoverTourPanel open view="showcase" building={{ name: "Library", code: "LIB", coverImageUrl: "https://images.example/library.jpg", floorCount: 2 }} adjacentCoverImageUrls={["https://images.example/caba.jpg", "https://images.example/coed.jpg"]} stopIndex={0} stopCount={3} {...handlers} />);
      expect(requested).toEqual(["https://images.example/caba.jpg", "https://images.example/coed.jpg"]);
      expect(screen.getByTestId("discover-cover-loading")).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

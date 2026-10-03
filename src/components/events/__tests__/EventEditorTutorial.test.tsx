import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEditorTutorial } from "../EventEditorTutorial";

const viewport = { width: window.innerWidth, height: window.innerHeight };

function setViewport(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
  fireEvent(window, new Event("resize"));
}

afterEach(() => {
  setViewport(viewport.width, viewport.height);
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("EventEditorTutorial", () => {
  it("uses current placement, arrangement, Details, and submission language", () => {
    localStorage.clear();
    render(<EventEditorTutorial accountId="org-one" />);

    expect(screen.getByRole("heading", { name: "Choose your event location" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "Choose a fixed-size asset" })).toBeInTheDocument();
    expect(screen.getByText(/Browse assets/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "Create a seating layout" })).toBeInTheDocument();
    expect(screen.getByText(/Layouts/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "Arrange and inspect items" })).toBeInTheDocument();
    expect(screen.getByText(/Details.*Advanced/)).toBeInTheDocument();
    expect(screen.getByText(/does not create sample items/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "Save your draft" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "Review and submit" })).toBeInTheDocument();
    expect(screen.getByText(/Review & submit/)).toBeInTheDocument();
  });

  it("places its mobile card above a low spotlight target instead of covering it", async () => {
    setViewport(390, 844);
    localStorage.clear();
    const view = render(
      <>
        <button data-event-tour="locations">Event location</button>
        <EventEditorTutorial accountId="org-mobile" />
      </>,
    );
    const target = view.container.querySelector<HTMLElement>('[data-event-tour="locations"]')!;
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue(new DOMRect(160, 690, 70, 50));
    Object.defineProperty(target, "getClientRects", { configurable: true, value: () => [new DOMRect(160, 690, 70, 50)] });

    await waitFor(() => expect(screen.getByRole("dialog").style.top).toBe("418px"));
    const card = screen.getByRole("dialog");
    const cardTop = Number.parseFloat(card.style.top);
    const cardHeight = 260;
    expect(cardTop).toBeGreaterThanOrEqual(16);
    expect(cardTop + cardHeight).toBeLessThanOrEqual(690);
  });

  it("clears a hidden step's stale spotlight anchor when positioning the next step", async () => {
    setViewport(1024, 900);
    localStorage.clear();
    const view = render(
      <>
        <button data-event-tour="locations">Event location</button>
        <EventEditorTutorial accountId="org-desktop" />
      </>,
    );
    const target = view.container.querySelector<HTMLElement>('[data-event-tour="locations"]')!;
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue(new DOMRect(300, 100, 120, 44));
    Object.defineProperty(target, "getClientRects", { configurable: true, value: () => [new DOMRect(300, 100, 120, 44)] });

    await waitFor(() => expect(screen.getByRole("dialog").style.left).toBe("136px"));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByRole("dialog").style.left).toBe("16px"));
    expect(screen.getByRole("dialog").style.top).toBe("16px");
  });

  it("remembers completion per account and permits replay", () => {
    localStorage.clear();
    const view = render(<EventEditorTutorial accountId="org-one" />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Skip tour" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    view.unmount();
    render(<EventEditorTutorial accountId="org-one" />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Editor help" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

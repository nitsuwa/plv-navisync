import { useState } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OrganizationEventsWorkspaceTabs } from "../OrganizationEventsWorkspaceTabs";

function StatefulHistoryPanel() {
  const [search, setSearch] = useState("");
  return <label>Search retained history<input aria-label="History query" value={search} onChange={(event) => setSearch(event.target.value)} /></label>;
}

describe("OrganizationEventsWorkspaceTabs", () => {
  it("aligns the first History visit with the tabs and restores each saved scroll position", async () => {
    function Workspace() {
      const [view, setView] = useState<"current" | "history">("current");
      return <OrganizationEventsWorkspaceTabs value={view} onValueChange={setView} currentPanel="Current" historyPanel="History" />;
    }
    const scrollDescriptor = Object.getOwnPropertyDescriptor(window, "scrollY")!;
    let scrollY = 420;
    Object.defineProperty(window, "scrollY", { configurable: true, get: () => scrollY });
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation((options: number | ScrollToOptions) => {
      if (typeof options === "object") scrollY = options.top ?? 0;
    });
    try {
      render(<Workspace />);
      const tabBar = screen.getByRole("tablist").parentElement!;
      Object.defineProperty(tabBar.parentElement, "offsetTop", { configurable: true, value: 500 });
      fireEvent.mouseDown(screen.getByRole("tab", { name: "Event history" }), { button: 0 });
      await waitFor(() => expect(scrollTo).toHaveBeenLastCalledWith({ top: 500, left: 0, behavior: "instant" }));
      scrollY = 650;
      fireEvent.mouseDown(screen.getByRole("tab", { name: "Current work" }), { button: 0 });
      await waitFor(() => expect(scrollY).toBe(420));
      fireEvent.mouseDown(screen.getByRole("tab", { name: "Event history" }), { button: 0 });
      await waitFor(() => expect(scrollY).toBe(650));
    } finally {
      scrollTo.mockRestore();
      Object.defineProperty(window, "scrollY", scrollDescriptor);
    }
  });

  it("lazy-mounts history, exposes one active panel, and retains its state", async () => {
    const onValueChange = vi.fn();
    const { rerender } = render(<OrganizationEventsWorkspaceTabs
      value="current"
      onValueChange={onValueChange}
      currentCount={3}
      currentPanel={<button>Current action</button>}
      historyPanel={<StatefulHistoryPanel />}
    />);

    expect(screen.getByRole("tab", { name: "Current work" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Current work" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "History query" })).not.toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Event history" }), { button: 0 });
    expect(onValueChange).toHaveBeenCalledWith("history");
    rerender(<OrganizationEventsWorkspaceTabs
      value="history"
      onValueChange={onValueChange}
      currentCount={3}
      historyCount={4}
      currentPanel={<button>Current action</button>}
      historyPanel={<StatefulHistoryPanel />}
    />);

    const input = screen.getByRole("textbox", { name: "History query" });
    fireEvent.change(input, { target: { value: "College Week" } });
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    expect(within(screen.getByRole("tabpanel", { name: "Event history" })).getByRole("textbox", { name: "History query" })).toHaveValue("College Week");

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Current work" }), { button: 0 });
    rerender(<OrganizationEventsWorkspaceTabs
      value="current"
      onValueChange={onValueChange}
      currentCount={3}
      historyCount={4}
      currentPanel={<button>Current action</button>}
      historyPanel={<StatefulHistoryPanel />}
    />);
    expect(screen.queryByRole("textbox", { name: "History query" })).not.toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Event history" }), { button: 0 });
    rerender(<OrganizationEventsWorkspaceTabs
      value="history"
      onValueChange={onValueChange}
      currentCount={3}
      historyCount={4}
      currentPanel={<button>Current action</button>}
      historyPanel={<StatefulHistoryPanel />}
    />);
    await waitFor(() => expect(screen.getByRole("textbox", { name: "History query" })).toHaveValue("College Week"));
  });

  it("uses manual keyboard activation and themed 44px controls", async () => {
    const onValueChange = vi.fn();
    render(<OrganizationEventsWorkspaceTabs value="current" onValueChange={onValueChange} currentPanel="Current" historyPanel="History" />);
    const current = screen.getByRole("tab", { name: "Current work" });
    const history = screen.getByRole("tab", { name: "Event history" });

    act(() => current.focus());
    fireEvent.keyDown(current, { key: "ArrowRight", keyCode: 39, which: 39 });
    await waitFor(() => expect(history).toHaveFocus());
    expect(onValueChange).not.toHaveBeenCalled();
    fireEvent.keyDown(history, { key: "Enter", keyCode: 13, which: 13 });
    expect(onValueChange).toHaveBeenCalledWith("history");
    expect(current).toHaveClass("min-h-11");
    expect(history).toHaveClass("min-h-11");
  });
});

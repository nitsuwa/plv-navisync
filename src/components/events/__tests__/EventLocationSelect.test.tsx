import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventLocationSelect } from "../EventLocationSelect";

const options = [
  { value: "building-a", label: "College of Engineering and Information Technology — Main Academic Building" },
  { value: "building-b", label: "Science Building" },
  { value: "building-disabled", label: "Unavailable Building", disabled: true },
];

const originalMatchMedia = window.matchMedia;

function setMobileViewport(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      matches,
      media: "(max-width: 639px)",
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

afterEach(() => {
  if (originalMatchMedia) {
    Object.defineProperty(window, "matchMedia", { configurable: true, value: originalMatchMedia });
  } else {
    Reflect.deleteProperty(window, "matchMedia");
  }
});
describe("EventLocationSelect", () => {
  it("opens from the keyboard, skips disabled options, selects, and returns focus", async () => {
    const onChange = vi.fn();
    render(<EventLocationSelect label="Building" value="building-a" options={options} onChange={onChange} searchable />);
    const trigger = screen.getByRole("combobox", { name: "Building" });

    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const search = await screen.findByRole("searchbox", { name: "Search Building" });
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith("building-b");
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("closes on Escape and restores focus to its trigger", async () => {
    render(<EventLocationSelect label="Floor" value="floor-1" options={[{ value: "floor-1", label: "Ground Floor" }]} onChange={vi.fn()} searchable />);
    const trigger = screen.getByRole("combobox", { name: "Floor" });
    fireEvent.click(trigger);
    fireEvent.keyDown(await screen.findByRole("searchbox", { name: "Search Floor" }), { key: "Escape" });

    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("filters searchable options and shows a helpful no-results state", async () => {
    render(<EventLocationSelect label="Building" value="building-a" options={options} onChange={vi.fn()} searchable />);
    fireEvent.click(screen.getByRole("combobox", { name: "Building" }));
    fireEvent.change(await screen.findByRole("searchbox", { name: "Search Building" }), { target: { value: "no matching campus" } });

    expect(await screen.findByText("No results found.")).toBeInTheDocument();
  });

  it("supports touch selection and a bounded mobile bottom sheet", async () => {
    setMobileViewport(true);
    const onChange = vi.fn();
    render(<EventLocationSelect label="Building" value="building-a" options={options} onChange={onChange} />);
    fireEvent.click(screen.getByRole("combobox", { name: "Building" }));

    const sheet = await screen.findByRole("dialog", { name: "Choose Building" });
    expect(sheet).toHaveClass("fixed", "bottom-0", "rounded-t-2xl", "bg-card", "text-foreground");
    expect(sheet).toHaveStyle({ maxHeight: "min(75dvh, 38rem)" });
    const option = screen.getByRole("option", { name: "Science Building" });
    fireEvent.pointerDown(option, { pointerType: "touch" });
    fireEvent.click(option);

    expect(onChange).toHaveBeenCalledWith("building-b");
  });

  it("renders themed desktop options, preserves long names, disables unavailable entries, and dismisses outside", async () => {
    render(<EventLocationSelect label="Building" value="building-a" options={options} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("combobox", { name: "Building" }));
    const listbox = await screen.findByRole("listbox");

    expect(screen.getByRole("dialog")).toHaveClass("bg-card", "text-foreground", "border-border");
    expect(screen.getByRole("option", { name: options[0].label })).toHaveClass("whitespace-normal", "break-words");
    expect(screen.getByRole("option", { name: "Unavailable Building" })).toBeDisabled();
    fireEvent.pointerDown(document.body, { pointerType: "mouse" });

    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  });
});

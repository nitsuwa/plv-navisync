import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EmergencyRoutePicker, type EmergencyRoutePickerOption } from "../EmergencyRoutePicker";

const options: EmergencyRoutePickerOption[] = [
  { value: "route-a", doorLabel: "Library Door", exitLabel: "Exterior Stair 2", distanceM: 64, transitions: ["Take Exterior Stair 2 to Floor 1"] },
  { value: "route-b", doorLabel: "East Door", exitLabel: "Main Entrance", distanceM: 91 },
  { value: "route-disabled", doorLabel: "North Door", exitLabel: "Main Entrance", distanceM: 110, disabledReason: "Same final physical exit as Route A" },
];

describe("EmergencyRoutePicker", () => {
  it("keeps route cards inside the picker width and shows concise route details", () => {
    render(<EmergencyRoutePicker label="Evacuation Route A" value="" options={options} onChange={vi.fn()} testId="route-picker" />);
    fireEvent.click(screen.getByRole("combobox", { name: "Evacuation Route A" }));

    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(screen.getByText("Library Door → Exterior Stair 2")).toBeTruthy();
    expect(screen.getByText("Connected graph route · 64 m")).toBeTruthy();
    expect(screen.getByText("Take Exterior Stair 2 to Floor 1")).toBeTruthy();
    expect(screen.getByText("Same final physical exit as Route A")).toBeTruthy();
    expect(screen.getByTestId("route-picker-menu").className).toContain("max-w-full");
  });

  it("supports arrow-key selection, Enter, Escape, and accessible disabled options", () => {
    const onChange = vi.fn();
    render(<EmergencyRoutePicker label="Evacuation Route A" value="" options={options} onChange={onChange} />);
    const trigger = screen.getByRole("combobox", { name: "Evacuation Route A" });

    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("route-a");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);
    expect(screen.getByRole("option", { name: /north door.*main entrance.*same final physical exit as route a/i })).toHaveAttribute("aria-disabled", "true");
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("closes on outside click and can clear a saved assignment", () => {
    const onChange = vi.fn();
    render(<div><EmergencyRoutePicker label="Evacuation Route B" value="route-a" selectedTitle="Left Exit" options={options} onChange={onChange} /><button>Outside</button></div>);
    const trigger = screen.getByRole("combobox", { name: "Evacuation Route B" });

    expect(trigger).toHaveTextContent("Left Exit");
    expect(trigger).toHaveTextContent("Start: Library Door · Destination: Exterior Stair 2");
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: /clear this route selection/i }));
    expect(onChange).toHaveBeenCalledWith("");

    fireEvent.click(trigger);
    fireEvent.mouseDown(screen.getByRole("button", { name: "Outside" }));
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});

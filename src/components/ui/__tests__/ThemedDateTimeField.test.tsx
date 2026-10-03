import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { manilaDateTimeParts, manilaDateTimeToIso, ThemedDateTimeField } from "../ThemedDateTimeField";

describe("ThemedDateTimeField", () => {
  it("round-trips event date and time using Asia/Manila regardless of browser timezone", () => {
    expect(manilaDateTimeToIso("2026-10-02", "09:00")).toBe("2026-10-02T01:00:00.000Z");
    expect(manilaDateTimeParts("2026-10-02T01:00:00.000Z")).toEqual({ date: "2026-10-02", time: "09:00" });
  });

  it("uses a themed calendar and plain text time input instead of native date or time pickers", () => {
    const onDateChange = vi.fn();
    const onTimeChange = vi.fn();
    render(<ThemedDateTimeField label="Event starts" date="2026-09-15" time="09:00" onDateChange={onDateChange} onTimeChange={onTimeChange} />);

    fireEvent.click(screen.getByRole("button", { name: /event starts date: september 15, 2026/i }));
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    fireEvent.click(screen.getByRole("button", { name: "October 2, 2026" }));

    expect(onDateChange).toHaveBeenCalledWith("2026-10-02");
    expect(screen.getByLabelText("Event starts time")).toHaveAttribute("type", "text");
    expect(screen.getByLabelText("Event starts time")).toHaveAttribute("inputmode", "numeric");
    fireEvent.change(screen.getByLabelText("Event starts time"), { target: { value: "1745" } });
    expect(onTimeChange).toHaveBeenCalledWith("17:45");
    expect(document.querySelector('input[type="date"], input[type="time"], input[type="datetime-local"]')).toBeNull();
  });
});

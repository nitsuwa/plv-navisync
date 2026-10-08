import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { manilaDateTimeParts, manilaDateTimeToIso, ThemedDateTimeField } from "../ThemedDateTimeField";

describe("ThemedDateTimeField", () => {
  function EditableTime({ initial = "14:13" }: { initial?: string }) {
    const [time, setTime] = useState(initial);
    return <ThemedDateTimeField label="Start" date="" time={time} onDateChange={vi.fn()} onTimeChange={setTime} />;
  }

  it("steps hours and minutes without scrolling and keeps AM/PM independent at boundaries", () => {
    render(<EditableTime initial="23:59" />);
    fireEvent.click(screen.getByRole("button", { name: "Start time: 11:59 PM" }));
    fireEvent.click(screen.getByRole("button", { name: "Increase hour" }));
    expect(screen.getByRole("spinbutton", { name: "Hour" })).toHaveValue("12");
    fireEvent.click(screen.getByRole("button", { name: "Increase hour" }));
    fireEvent.click(screen.getByRole("button", { name: "Increase minute" }));
    expect(screen.getByRole("spinbutton", { name: "Hour" })).toHaveValue("1");
    expect(screen.getByRole("spinbutton", { name: "Minute" })).toHaveValue("00");
    expect(screen.getByRole("button", { name: "PM" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Decrease hour" }));
    fireEvent.click(screen.getByRole("button", { name: "Decrease minute" }));
    fireEvent.click(screen.getByRole("button", { name: "AM" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("button", { name: "Start time: 12:59 AM" })).toBeInTheDocument();
  });

  it("accepts direct typing, Enter and arrow keys with padded minutes", () => {
    render(<EditableTime />);
    fireEvent.click(screen.getByRole("button", { name: "Start time: 2:13 PM" }));
    const hour = screen.getByRole("spinbutton", { name: "Hour" });
    const minute = screen.getByRole("spinbutton", { name: "Minute" });
    fireEvent.change(hour, { target: { value: "10" } });
    fireEvent.keyDown(hour, { key: "Enter" });
    fireEvent.change(minute, { target: { value: "7" } });
    fireEvent.blur(minute);
    expect(minute).toHaveValue("07");
    fireEvent.keyDown(minute, { key: "ArrowUp" });
    fireEvent.keyDown(hour, { key: "ArrowDown" });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("button", { name: "Start time: 9:08 PM" })).toBeInTheDocument();
  });

  it("keeps invalid or empty drafts out of the saved time and allows correction", () => {
    render(<EditableTime />);
    fireEvent.click(screen.getByRole("button", { name: "Start time: 2:13 PM" }));
    const minute = screen.getByRole("spinbutton", { name: "Minute" });
    fireEvent.change(minute, { target: { value: "60" } });
    fireEvent.blur(minute);
    expect(minute).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Done" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Start time: 2:13 PM", hidden: true })).toBeInTheDocument();
    fireEvent.change(minute, { target: { value: "" } });
    expect(screen.getByRole("button", { name: "Done" })).toBeDisabled();
    fireEvent.change(minute, { target: { value: "59" } });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("button", { name: "Start time: 2:59 PM" })).toBeInTheDocument();
  });

  it("closes only the nested picker on Escape and returns focus to its trigger", async () => {
    const outerEscape = vi.fn();
    window.addEventListener("keydown", outerEscape);
    try {
      render(<EditableTime />);
      fireEvent.click(screen.getByRole("button", { name: "Start time: 2:13 PM" }));
      expect(screen.getByRole("dialog", { name: "Start time picker" })).toBeInTheDocument();
      fireEvent.keyDown(screen.getByRole("button", { name: "Increase hour" }), { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("dialog", { name: "Start time picker" })).not.toBeInTheDocument());
      expect(outerEscape).not.toHaveBeenCalled();
      await waitFor(() => expect(screen.getByRole("button", { name: "Start time: 2:13 PM" })).toHaveFocus());
    } finally { window.removeEventListener("keydown", outerEscape); }
  });
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
    fireEvent.click(screen.getByRole("button", { name: "Event starts time: 9:00 AM" }));
    fireEvent.click(screen.getByRole("button", { name: "PM" }));
    expect(onTimeChange).toHaveBeenCalledWith("21:00");
    expect(document.querySelector('input[type="date"], input[type="time"], input[type="datetime-local"]')).toBeNull();
  });
  it.each([["00:00", "12:00 AM"], ["12:00", "12:00 PM"], ["17:45", "5:45 PM"]])("displays %s as %s", (time, display) => {
    render(<ThemedDateTimeField label="Start" date="" time={time} onDateChange={vi.fn()} onTimeChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: `Start time: ${display}` })).toBeInTheDocument();
  });
});

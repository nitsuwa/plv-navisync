import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BuildingWeeklyHoursEditor } from "../BuildingWeeklyHoursEditor";
import { weeklyHoursPreset } from "../../../lib/buildingInformation";

describe("BuildingWeeklyHoursEditor", () => {
  it("sets structured weekday hours and leaves the weekend closed", () => {
    const onChange = vi.fn();
    render(<BuildingWeeklyHoursEditor onChange={onChange} onClear={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Weekdays 8/ }));
    const schedule = onChange.mock.calls[0][0];
    expect(schedule.monday).toEqual({ closed: false, open: "08:00", close: "17:00" });
    expect(schedule.friday).toEqual(schedule.monday);
    expect(schedule.saturday.closed).toBe(true);
    expect(schedule.sunday.closed).toBe(true);
  });

  it("mirrors the edited weekday across Monday to Friday when enabled", () => {
    const onChange = vi.fn();
    render(<BuildingWeeklyHoursEditor value={weeklyHoursPreset("weekdays")} onChange={onChange} onClear={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Monday opening time"), { target: { value: "09:30" } });
    const schedule = onChange.mock.calls[0][0];
    expect(schedule.monday.open).toBe("09:30");
    expect(schedule.tuesday.open).toBe("09:30");
    expect(schedule.friday.open).toBe("09:30");
    expect(schedule.saturday.closed).toBe(true);
  });

  it("lets the admin turn off the same-weekday shortcut", () => {
    const schedule = weeklyHoursPreset("weekdays");
    render(<BuildingWeeklyHoursEditor value={schedule} onChange={vi.fn()} onClear={vi.fn()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Use same hours Monday/ }));
    expect(screen.getByLabelText("Tuesday opening time")).toBeEnabled();
  });

  it("does not render time fields for closed days and converts legacy hours only after an explicit action", () => {
    const onChange = vi.fn();
    const view = render(<BuildingWeeklyHoursEditor legacyValue="Mon-Fri, 8:00 AM-5:00 PM" onChange={onChange} onClear={vi.fn()} />);
    expect(screen.getByText("Mon-Fri, 8:00 AM-5:00 PM")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Set weekly hours" }));
    expect(onChange).toHaveBeenCalled();
    const structured = onChange.mock.calls[0][0];
    view.rerender(<BuildingWeeklyHoursEditor value={structured} legacyValue="Mon-Fri, 8:00 AM-5:00 PM" onChange={onChange} onClear={vi.fn()} />);
    expect(screen.queryByLabelText("Monday opening time")).toBeNull();
    expect(screen.queryByLabelText("Sunday opening time")).toBeNull();
  });
});

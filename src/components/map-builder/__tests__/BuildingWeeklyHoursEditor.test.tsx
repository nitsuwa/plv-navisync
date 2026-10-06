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

  it("mirrors a custom picker time across Monday to Friday when enabled", () => {
    const onChange = vi.fn();
    render(<BuildingWeeklyHoursEditor value={weeklyHoursPreset("weekdays")} onChange={onChange} onClear={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Monday opening time: 8:00 AM" }));
    fireEvent.click(screen.getByRole("button", { name: "Monday opening time hour 9" }));
    fireEvent.click(screen.getByRole("button", { name: "Monday opening time minute 30" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    const schedule = onChange.mock.calls[0][0];
    expect(schedule.monday.open).toBe("09:30");
    expect(schedule.tuesday.open).toBe("09:30");
    expect(schedule.friday.open).toBe("09:30");
    expect(schedule.saturday.closed).toBe(true);
  });

  it("uses the custom time picker and commits the selected time without a native browser control", () => {
    const onChange = vi.fn();
    render(<BuildingWeeklyHoursEditor value={weeklyHoursPreset("weekdays")} onChange={onChange} onClear={vi.fn()} />);
    expect(document.querySelector('input[type="time"]')).toBeNull();
    expect(document.querySelector("select")).toBeNull();
    expect(screen.getByRole("button", { name: "Monday closing time: 5:00 PM" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Monday closing time: 5:00 PM" }));
    fireEvent.click(screen.getByRole("button", { name: "Monday closing time hour 4" }));
    fireEvent.click(screen.getByRole("button", { name: "Monday closing time minute 30" }));
    fireEvent.click(screen.getByRole("button", { name: "Monday closing time AM" }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].monday.close).toBe("04:30");
  });

  it("closes the time picker when the Properties panel scrolls", () => {
    const { container } = render(
      <div data-testid="properties-panel-content">
        <BuildingWeeklyHoursEditor value={weeklyHoursPreset("weekdays")} onChange={vi.fn()} onClear={vi.fn()} />
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Monday opening time: 8:00 AM" }));
    expect(screen.getByText("Select time")).toBeInTheDocument();
    fireEvent.scroll(container.querySelector('[data-testid="properties-panel-content"]')!);
    expect(screen.queryByText("Select time")).toBeNull();
  });

  it("displays externally reloaded wall-clock values without timezone conversion", () => {
    const onChange = vi.fn();
    const original = weeklyHoursPreset("weekdays");
    const view = render(<BuildingWeeklyHoursEditor value={original} onChange={onChange} onClear={vi.fn()} />);
    const reloaded = { ...original, monday: { ...original.monday, open: "20:15" } };
    view.rerender(<BuildingWeeklyHoursEditor value={reloaded} onChange={onChange} onClear={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Monday opening time: 8:15 PM" })).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("lets the admin turn off the same-weekday shortcut", () => {
    const schedule = weeklyHoursPreset("weekdays");
    render(<BuildingWeeklyHoursEditor value={schedule} onChange={vi.fn()} onClear={vi.fn()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Use same hours Monday/ }));
    expect(screen.getByRole("button", { name: /^Tuesday opening time:/ })).toBeEnabled();
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

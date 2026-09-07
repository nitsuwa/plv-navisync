import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CompactDropdown } from "../CompactDropdown";

describe("CompactDropdown", () => {
  it("renders a compact listbox menu and supports keyboard selection", async () => {
    const onChange = vi.fn();
    render(<CompactDropdown value="bottom" ariaLabel="Exterior Zone side" options={[{ value: "top", label: "North" }, { value: "bottom", label: "South" }]} onChange={onChange} />);
    const trigger = screen.getByRole("combobox", { name: "Exterior Zone side" });
    fireEvent.click(trigger);
    const menu = await screen.findByRole("listbox", { name: "Exterior Zone side" });
    expect(menu).toBeInTheDocument();
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    fireEvent.keyDown(menu, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("top");
  });
});

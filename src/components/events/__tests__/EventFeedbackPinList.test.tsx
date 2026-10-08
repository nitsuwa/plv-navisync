import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EventFeedbackPinList } from "../EventFeedbackPinList";

const pins = [{ id: "first", x: 10, y: 20, comment: "Keep this entrance clear" }, { id: "second", x: 30, y: 40, comment: "Long feedback ".repeat(35) }];
describe("EventFeedbackPinList", () => {
  it("shows complete feedback and removes only the requested pin", () => {
    const remove = vi.fn(); render(<EventFeedbackPinList locationLabel="Campus Grounds" pins={pins} onRemove={remove} />);
    expect(screen.getByText(pins[1].comment.trim())).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove feedback pin 2 from Campus Grounds" }));
    expect(remove).toHaveBeenCalledExactlyOnceWith("second");
  });
  it("disables removal while the review decision is being submitted", () => {
    const remove = vi.fn(); render(<EventFeedbackPinList locationLabel="Campus Grounds" pins={pins} disabled onRemove={remove} />);
    const button = screen.getByRole("button", { name: "Remove feedback pin 1 from Campus Grounds" });
    expect(button).toBeDisabled(); fireEvent.click(button); expect(remove).not.toHaveBeenCalled();
  });
});

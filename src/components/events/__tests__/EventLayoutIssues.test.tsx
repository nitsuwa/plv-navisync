import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EventLayoutIssues } from "../EventLayoutIssues";
import type { LayoutWarning } from "../../../lib/eventLayoutValidation";

const warning: LayoutWarning = {
  code: "overlap",
  severity: "warning",
  itemIds: ["booth-a", "booth-b"],
  message: "Booth overlaps Booth. Consider adding clearance between them.",
};

describe("EventLayoutIssues", () => {
  it("keeps a fixed-height summary row and focuses every referenced item", () => {
    const onFocusItems = vi.fn();
    render(<EventLayoutIssues warnings={[warning]} onFocusItems={onFocusItems} />);
    const summary = screen.getByTestId("event-layout-warnings");
    expect(summary).toHaveClass("h-9", "shrink-0");
    fireEvent.click(screen.getByRole("button", { name: /open 1 layout issue/i }));
    fireEvent.click(screen.getByRole("button", { name: /show items/i }));
    expect(onFocusItems).toHaveBeenCalledWith(["booth-a", "booth-b"]);
  });

  it("does not expose the old verbose focus chips", () => {
    render(<EventLayoutIssues warnings={[warning]} onFocusItems={vi.fn()} />);
    expect(screen.queryByText(/Focus:/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /open 1 layout issue/i }));
    expect(screen.getByText(/review walking space|Booth overlaps Booth/i)).toBeInTheDocument();
  });

  it("shows a useful empty state without using approval language", () => {
    render(<EventLayoutIssues warnings={[]} onFocusItems={vi.fn()} />);
    expect(screen.getByText("Layout checks")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /open layout checks/i }));
    expect(screen.getByText(/No placement checks need attention/)).toBeInTheDocument();
    expect(screen.queryByText(/Approved/)).not.toBeInTheDocument();
  });
});

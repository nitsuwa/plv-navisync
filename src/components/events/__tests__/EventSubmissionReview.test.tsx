import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EventSubmissionReview } from "../EventSubmissionReview";

describe("event submission checklist", () => {
  it("blocks submission on critical issues and links directly to the location", () => {
    const review = vi.fn();
    render(<EventSubmissionReview open title="College Week" locations={[{
      id: "floor-a", label: "Science Ground Floor", furnitureCount: 0, labelCount: 0,
      issues: [{ severity: "critical", message: "Add the planned items to this map." }],
    }]} onClose={() => {}} onConfirm={() => {}} onReviewLocation={review} />);
    expect(screen.getByRole("button", { name: "Confirm submission" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Review Science/ }));
    expect(review).toHaveBeenCalledWith("floor-a");
  });
  it("requires an explicit confirmation after showing all map counts", () => {
    const confirm = vi.fn();
    render(<EventSubmissionReview open title="College Week" locations={[{
      id: "grounds", label: "Campus Grounds", furnitureCount: 25, labelCount: 1, issues: [],
    }]} onClose={() => {}} onConfirm={confirm} onReviewLocation={() => {}} />);
    expect(screen.getByText("25 assets · 1 labels")).toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm submission" }));
    expect(confirm).toHaveBeenCalledOnce();
  });
});

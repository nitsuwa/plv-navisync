import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EventSubmissionReview } from "../EventSubmissionReview";

describe("event submission checklist", () => {
  it('includes feedback readiness and prevents confirmation when a pin is open', () => {
    render(<EventSubmissionReview open title="Fair" locations={[{id:'grounds',label:'Grounds',furnitureCount:1,labelCount:0,issues:[]}]} feedbackTotal={3} feedbackOpen={1} onClose={vi.fn()} onConfirm={vi.fn()} onReviewLocation={vi.fn()} />);
    expect(screen.getByText('GSO feedback · 2/3 addressed · 1 open')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm submission' })).toBeDisabled();
  });
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
    expect(screen.getByText("Submission summary")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm submission" }));
    expect(confirm).toHaveBeenCalledOnce();
  });
});

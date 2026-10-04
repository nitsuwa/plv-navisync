import { fireEvent, render, screen, cleanup, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EventFeedbackChecklist } from "../EventFeedbackChecklist";
import { writeEventFeedback } from "../../../lib/eventFeedbackPins";
afterEach(cleanup);
const feedback = writeEventFeedback("", [{ id: "pin", x: 2, y: 3, comment: "Move the booth away from the gate" }]);
const overlay = { id: "event", locations: [{ id: "campus", locationRef: { type: "campus", label: "Campus Grounds" }, eventFurniture: [], eventLabels: [] }], locationFeedback: { campus: feedback } };
it('reveals and focuses an open issue when submission is blocked after filtering', async () => {
  const props={overlay:overlay as never,onChange:vi.fn(),onLocatePin:vi.fn()};
  const {rerender}=render(<EventFeedbackChecklist {...props} />);
  fireEvent.click(screen.getByRole('button',{name:/^Addressed/}));
  rerender(<EventFeedbackChecklist {...props} forceOpen />);
  await waitFor(()=>expect(screen.getByRole('button',{name:'Show pin 1 on map'})).toHaveFocus());
});
it("locates a pin without acknowledging it and filters addressed issues", () => {
  const locate = vi.fn(); const change = vi.fn();
  render(<EventFeedbackChecklist overlay={overlay as never} onChange={change} onLocatePin={locate} />);
  fireEvent.click(screen.getByRole('button', { name: 'Show pin 1 on map' }));
  expect(locate).toHaveBeenCalledWith('campus', 'pin');
  expect(change).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /^Addressed/ }));
  expect(screen.queryByText('Move the booth away from the gate')).not.toBeInTheDocument();
});
it("lets the owner submit a resolution note for the correct pin", () => {
  const onChange = vi.fn();
  render(<EventFeedbackChecklist overlay={overlay as never} onChange={onChange} />);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Moved booth to courtyard" } });
  fireEvent.click(screen.getByRole("button", { name: "Mark as addressed" }));
  expect(onChange).toHaveBeenCalledWith("campus", "pin", true, "Moved booth to courtyard");
});
it("shows administrators the student claim without offering student controls", () => {
  render(<EventFeedbackChecklist overlay={{ ...overlay, feedbackResolutions: { campus: { pin: { feedback, addressedAt: "2026-10-03T00:00:00Z", addressedBy: "org", note: "Moved booth" } } } } as never} />);
  expect(screen.getByText("Addressed")).toBeInTheDocument();
  expect(screen.getByText(/Student note: Moved booth/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: 'Mark as addressed' })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: 'Reopen issue' })).not.toBeInTheDocument();
});

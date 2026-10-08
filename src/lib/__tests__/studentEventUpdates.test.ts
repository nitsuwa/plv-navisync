import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CampusEventOverlay } from "../../components/map-builder/types";
import { eventReviewFingerprint, eventReviewSeenPrefix, isEventReviewUnread, markEventReviewRead } from "../studentEventUpdates";
const event = { id: "layout-a", createdByUserId: "org-a", status: "approved", submittedAt: "2026-10-06T00:00:00Z", adminComment: "Approved", locationFeedback: { grounds: "Keep the path open" } } as CampusEventOverlay;
beforeEach(() => localStorage.clear());
describe("Student Org event review updates", () => {
  it("treats corrupted receipts as unread and reports failed persistence without throwing", () => {
    localStorage.setItem(eventReviewSeenPrefix("org-a") + event.id, "invalid-json");
    expect(isEventReviewUnread("org-a", event)).toBe(true);
    const fail = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    expect(markEventReviewRead("org-a", event)).toBe(false); fail.mockRestore();
  });
  it("marks unseen approvals and disapprovals but ignores owner draft/pending changes", () => {
    expect(isEventReviewUnread("org-a", event)).toBe(true);
    expect(isEventReviewUnread("org-a", { ...event, status: "disapproved" })).toBe(true);
    expect(isEventReviewUnread("org-a", { ...event, status: "pending" })).toBe(false);
    expect(isEventReviewUnread("org-a", { ...event, status: "draft" })).toBe(false);
    expect(isEventReviewUnread("org-b", event)).toBe(false);
  });
  it("clears only the acknowledged layout and remembers it after another read", () => {
    markEventReviewRead("org-a", event);
    expect(isEventReviewUnread("org-a", event)).toBe(false);
    expect(isEventReviewUnread("org-a", { ...event, id: "layout-b" })).toBe(true);
    expect(isEventReviewUnread("org-b", { ...event, createdByUserId: "org-b" })).toBe(true);
  });
  it("re-notifies for changed admin comments, location feedback and repeated decisions on a new submission", () => {
    markEventReviewRead("org-a", event);
    expect(isEventReviewUnread("org-a", { ...event, adminComment: "New feedback" })).toBe(true);
    expect(isEventReviewUnread("org-a", { ...event, locationFeedback: { grounds: "Move booth" } })).toBe(true);
    expect(isEventReviewUnread("org-a", { ...event, submittedAt: "2026-10-07T00:00:00Z" })).toBe(true);
  });
  it("does not re-notify for publication timing, own edits or feedback resolution", () => {
    markEventReviewRead("org-a", event);
    expect(isEventReviewUnread("org-a", { ...event, updatedAt: "2026-10-08T00:00:00Z", revision: 22, title: "Renamed", publicationAt: "2026-10-09T00:00:00Z", feedbackResolutions: {} })).toBe(false);
    expect(eventReviewFingerprint({ ...event, locationFeedback: { b: "B", a: "A" } })).toBe(eventReviewFingerprint({ ...event, locationFeedback: { a: "A", b: "B" } }));
  });
});

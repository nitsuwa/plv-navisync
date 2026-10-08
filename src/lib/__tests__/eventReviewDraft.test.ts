import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearEventReviewDraft, eventReviewDraftKey, readEventReviewDraft, writeEventReviewDraft, type EventReviewDraftFields } from "../eventReviewDraft";
import { writeEventFeedback, readEventFeedback } from "../eventFeedbackPins";
import type { CampusEventOverlay } from "../../components/map-builder/types";

const event = { id: "proposal", status: "pending", updatedAt: "2026-10-06T01:00:00Z", submittedAt: "2026-10-06T00:00:00Z", revision: 2 } as CampusEventOverlay;
const fields: EventReviewDraftFields = {
  comment: "Check the entrance", locationFeedback: { grounds: writeEventFeedback("Keep access clear", [{ id: "pin", x: 120, y: 80, comment: "Move the booth" }]) },
  eventStartDate: "2026-10-10", eventStartTime: "09:00", eventEndDate: "2026-10-10", eventEndTime: "17:00",
  publicationMode: "schedule", publicationDate: "2026-10-09", publicationTime: "12:00", scheduleTouched: true,
};
beforeEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

describe("event review draft recovery", () => {
  it("recovers exact staged pin coordinates, comments and schedule without a server call", () => {
    expect(writeEventReviewDraft("admin-a", event, fields)).toBe(true);
    const restored = readEventReviewDraft("admin-a", event);
    expect(restored).toEqual({ status: "restored", draft: fields });
    if (restored.status === "restored") expect(readEventFeedback(restored.draft.locationFeedback.grounds).pins).toEqual([{ id: "pin", x: 120, y: 80, comment: "Move the booth" }]);
  });
  it("keeps drafts separate by admin and proposal", () => {
    writeEventReviewDraft("admin-a", event, fields);
    expect(readEventReviewDraft("admin-b", event).status).toBe("missing");
    expect(readEventReviewDraft("admin-a", { ...event, id: "other" }).status).toBe("missing");
  });
  it.each([
    { updatedAt: "2026-10-06T02:00:00Z" }, { revision: 3 }, { submittedAt: "2026-10-06T02:00:00Z" }, { status: "approved" as const },
  ])("does not apply a draft to a different server submission: %j", patch => {
    writeEventReviewDraft("admin-a", event, fields);
    expect(readEventReviewDraft("admin-a", { ...event, ...patch }).status).toBe("stale");
  });
  it("ignores malformed data but keeps an unchanged pending review until it is discarded or submitted", () => {
    localStorage.setItem(eventReviewDraftKey("admin-a", event.id), "not-json");
    expect(readEventReviewDraft("admin-a", event).status).toBe("invalid");
    writeEventReviewDraft("admin-a", event, fields);
    const now = Date.now(); vi.spyOn(Date, "now").mockReturnValue(now + 8 * 24 * 60 * 60 * 1000);
    expect(readEventReviewDraft("admin-a", event).status).toBe("restored");
  });
  it("reports unavailable storage and preserves the previous saved draft on a failed write", () => {
    writeEventReviewDraft("admin-a", event, fields);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    expect(writeEventReviewDraft("admin-a", event, { ...fields, comment: "New unsaved text" })).toBe(false);
    expect(readEventReviewDraft("admin-a", event)).toEqual({ status: "restored", draft: fields });
  });
  it("clears only the explicitly discarded or submitted review", () => {
    writeEventReviewDraft("admin-a", event, fields); writeEventReviewDraft("admin-b", event, fields);
    expect(clearEventReviewDraft("admin-a", event.id)).toBe(true);
    expect(readEventReviewDraft("admin-a", event).status).toBe("missing");
    expect(readEventReviewDraft("admin-b", event).status).toBe("restored");
  });
  it("cannot persist an anonymous or revisionless review", () => {
    expect(writeEventReviewDraft(undefined, event, fields)).toBe(false);
    expect(writeEventReviewDraft("admin-a", { ...event, updatedAt: undefined }, fields)).toBe(false);
  });
});

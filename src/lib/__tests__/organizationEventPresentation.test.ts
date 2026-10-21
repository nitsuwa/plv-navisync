import { describe, expect, it } from "vitest";
import type { CampusEventOverlay } from "../../components/map-builder/types";
import { writeEventFeedback } from "../eventFeedbackPins";
import {
  formatOrganizationEventCreatedDate,
  formatOrganizationEventSchedule,
  isCurrentOrganizationWork,
  parseOrganizationEventsView,
} from "../organizationEventPresentation";

const event = (status: string, values: Record<string, unknown> = {}) => ({
  id: status,
  title: status,
  status,
  ...values,
}) as CampusEventOverlay;

describe("organization event presentation", () => {
  it.each(["draft", "pending", "disapproved"])("keeps %s work current regardless of its old schedule", (status) => {
    expect(isCurrentOrganizationWork(event(status, { dateEnd: "2020-01-01T00:00:00Z" }), Date.parse("2026-10-11T03:00:00Z"))).toBe(true);
  });

  it.each([
    ["upcoming", "2026-10-11T04:00:00Z", "2026-10-11T08:00:00Z"],
    ["ongoing", "2026-10-11T02:00:00Z", "2026-10-11T08:00:00Z"],
  ])("keeps approved %s work current", (_phase, dateStart, dateEnd) => {
    expect(isCurrentOrganizationWork(event("approved", {
      isActive: true,
      publicationAt: "2026-10-10T00:00:00Z",
      dateStart,
      dateEnd,
    }), Date.parse("2026-10-11T03:00:00Z"))).toBe(true);
  });

  it("keeps an ended approved event current while it has an open feedback pin", () => {
    const value = writeEventFeedback("Please move the booth", [{ id: "pin-1", x: 10, y: 20, comment: "Please move the booth" }]);
    expect(isCurrentOrganizationWork(event("approved", {
      isActive: true,
      publicationAt: "2026-10-01T00:00:00Z",
      dateStart: "2026-10-10T00:00:00Z",
      dateEnd: "2026-10-10T08:00:00Z",
      locationFeedback: { "loc-1": value },
    }), Date.parse("2026-10-11T03:00:00Z"))).toBe(true);
  });

  it("excludes an ended approved event when no open feedback remains", () => {
    expect(isCurrentOrganizationWork(event("approved", {
      isActive: true,
      publicationAt: "2026-10-01T00:00:00Z",
      dateStart: "2026-10-10T00:00:00Z",
      dateEnd: "2026-10-10T08:00:00Z",
    }), Date.parse("2026-10-11T03:00:00Z"))).toBe(false);
  });

  it("parses only the supported view and defaults unknown values to Current work", () => {
    expect(parseOrganizationEventsView("history")).toBe("history");
    expect(parseOrganizationEventsView("current")).toBe("current");
    expect(parseOrganizationEventsView("other")).toBe("current");
    expect(parseOrganizationEventsView(null)).toBe("current");
  });

  it.each([
    [undefined, undefined, "Not scheduled"],
    ["invalid", undefined, "Not scheduled"],
    ["2026-10-13T01:00:00Z", "invalid", "Oct 13, 2026, 9:00 AM PHT"],
    ["2026-10-13T01:00:00Z", "2026-10-13T09:00:00Z", "Oct 13, 2026 · 9:00 AM–5:00 PM PHT"],
    ["2026-10-12T16:30:00Z", "2026-10-13T09:00:00Z", "Oct 13, 2026 · 12:30 AM–5:00 PM PHT"],
    ["2026-10-13T01:00:00Z", "2026-10-14T09:00:00Z", "Oct 13, 2026, 9:00 AM – Oct 14, 2026, 5:00 PM PHT"],
  ])("formats schedule safely in Asia/Manila", (start, end, expected) => {
    expect(formatOrganizationEventSchedule(start, end)).toBe(expected);
  });

  it("formats created dates in Asia/Manila and handles missing values", () => {
    expect(formatOrganizationEventCreatedDate("2026-10-12T16:30:00Z")).toBe("Oct 13, 2026 PHT");
    expect(formatOrganizationEventCreatedDate("invalid")).toBe("Creation date unavailable");
  });
});

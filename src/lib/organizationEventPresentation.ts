import type { CampusEventOverlay } from "../components/map-builder/types";
import { countOpenFeedbackPins } from "./eventFeedbackPins";
import { getStudentEventPhase } from "./eventPublication";

export type OrganizationEventsView = "current" | "history";

const MANILA_ZONE = "Asia/Manila";
const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: MANILA_ZONE,
  dateStyle: "medium",
});
const TIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: MANILA_ZONE,
  hour: "numeric",
  minute: "2-digit",
});

function validDate(value?: string): Date | null {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value);
}

function manilaCalendarDate(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: MANILA_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function parseOrganizationEventsView(value: string | null): OrganizationEventsView {
  return value === "history" ? "history" : "current";
}

export function isCurrentOrganizationWork(overlay: CampusEventOverlay, nowMs: number): boolean {
  return overlay.status !== "approved"
    || countOpenFeedbackPins(overlay.locationFeedback, overlay.feedbackResolutions) > 0
    || ["upcoming", "ongoing"].includes(getStudentEventPhase(overlay, nowMs));
}

export function formatOrganizationEventSchedule(dateStart?: string, dateEnd?: string): string {
  const start = validDate(dateStart);
  if (!start) return "Not scheduled";

  const end = validDate(dateEnd);
  if (!end || end.getTime() <= start.getTime()) {
    return `${DATE_FORMAT.format(start)}, ${TIME_FORMAT.format(start)} PHT`;
  }

  if (manilaCalendarDate(start) === manilaCalendarDate(end)) {
    return `${DATE_FORMAT.format(start)} · ${TIME_FORMAT.format(start)}–${TIME_FORMAT.format(end)} PHT`;
  }

  return `${DATE_FORMAT.format(start)}, ${TIME_FORMAT.format(start)} – ${DATE_FORMAT.format(end)}, ${TIME_FORMAT.format(end)} PHT`;
}

export function formatOrganizationEventCreatedDate(value?: string): string {
  const date = validDate(value);
  return date ? `${DATE_FORMAT.format(date)} PHT` : "Creation date unavailable";
}

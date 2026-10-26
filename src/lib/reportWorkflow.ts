import type { ReportStatus } from "../services/reportService";

/**
 * Report lifecycle rules. The database enforces the same table in
 * `private.enforce_report_workflow` (migration 20261026120000); keep them in sync.
 *
 *   pending ──► under_review ──► in_progress ──► resolved
 *      │             │  ▲            │              │
 *      └──► rejected ◄┘  └────────────┘              │
 *              │                                     │
 *              └──────── reopen ──► under_review ◄───┘
 *
 * A report can't be resolved before someone has reviewed it, and closing it
 * either way needs a reason the reporter can read.
 */
export const REPORT_TRANSITIONS: Record<ReportStatus, readonly ReportStatus[]> = {
  pending: ["under_review", "rejected"],
  under_review: ["in_progress", "resolved", "rejected"],
  in_progress: ["resolved", "under_review"],
  resolved: ["under_review"],
  rejected: ["under_review"],
};

/** Minimum length for a reason the reporter will read. */
export const CLOSING_NOTE_MIN_LENGTH = 15;
export const REOPEN_REASON_MIN_LENGTH = 10;
/** Reporters may reopen a closed report this long after it closed. */
export const REPORTER_REOPEN_WINDOW_DAYS = 30;
/** And at most this many times, so a report can't bounce forever. */
export const REPORTER_REOPEN_LIMIT = 2;

export function allowedNextStatuses(status: ReportStatus): readonly ReportStatus[] {
  return REPORT_TRANSITIONS[status] ?? [];
}

export function isClosedStatus(status: ReportStatus): boolean {
  return status === "resolved" || status === "rejected";
}

/** Moving a closed report back to review. */
export function isReopen(from: ReportStatus, to: ReportStatus): boolean {
  return isClosedStatus(from) && to === "under_review";
}

export interface TransitionRequirement {
  /** A note is mandatory for this step. */
  noteRequired: boolean;
  minLength: number;
  /** Label for the note field. */
  noteLabel: string;
  placeholder: string;
}

export function transitionRequirement(from: ReportStatus, to: ReportStatus): TransitionRequirement {
  if (to === "resolved") {
    return {
      noteRequired: true,
      minLength: CLOSING_NOTE_MIN_LENGTH,
      noteLabel: "What was done to resolve it?",
      placeholder: "e.g. Maintenance replaced the ceiling light in CABA-101 on Oct 27.",
    };
  }
  if (to === "rejected") {
    return {
      noteRequired: true,
      minLength: CLOSING_NOTE_MIN_LENGTH,
      noteLabel: "Why is this report being dismissed?",
      placeholder: "e.g. Duplicate of an earlier report; that issue is already being repaired.",
    };
  }
  if (isReopen(from, to)) {
    return {
      noteRequired: true,
      minLength: REOPEN_REASON_MIN_LENGTH,
      noteLabel: "Why is this report being reopened?",
      placeholder: "e.g. The reporter confirmed the light is still flickering.",
    };
  }
  return {
    noteRequired: false,
    minLength: 0,
    noteLabel: "Update for the reporter (optional)",
    placeholder: to === "in_progress"
      ? "e.g. Work order sent to the maintenance team."
      : "e.g. We're checking this with the building custodian.",
  };
}

/** Returns an error message, or null when the step is allowed. */
export function validateTransition(from: ReportStatus, to: ReportStatus, note: string): string | null {
  if (!allowedNextStatuses(from).includes(to)) {
    return from === "pending" && to === "resolved"
      ? "Review the report before resolving it."
      : "That status change isn't allowed from the report's current status.";
  }
  const requirement = transitionRequirement(from, to);
  const length = note.trim().length;
  if (requirement.noteRequired && length < requirement.minLength) {
    return `Add at least ${requirement.minLength} characters explaining this to the reporter.`;
  }
  return null;
}

export interface ReporterReopenState {
  allowed: boolean;
  /** Why reopening isn't offered, for display. */
  reason?: string;
}

export function reporterReopenState(
  report: { status: ReportStatus; updatedAt: string },
  nowMs: number = Date.now(),
): ReporterReopenState {
  if (!isClosedStatus(report.status)) return { allowed: false };
  const closedAt = Date.parse(report.updatedAt);
  const windowMs = REPORTER_REOPEN_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  if (Number.isFinite(closedAt) && nowMs - closedAt > windowMs) {
    return { allowed: false, reason: `Reports can be reopened within ${REPORTER_REOPEN_WINDOW_DAYS} days of closing.` };
  }
  return { allowed: true };
}

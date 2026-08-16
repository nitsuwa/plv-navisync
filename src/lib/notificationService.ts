/**
 * Lightweight client-side notification detection, persisted in localStorage.
 *
 * 1. Student report-status changes — compares the student's current report
 *    statuses against the last-seen snapshot, so a status change made by an
 *    admin shows up as an in-app notification on the next visit.
 * 2. Admin activity-log unread count — remembers when the bell was last
 *    opened and reports how many logs arrived since.
 *
 * No database table is required; this intentionally stays client-side.
 */

const REPORT_SEEN_KEY = "plv-report-status-seen";
const LOGS_SEEN_KEY = "plv-admin-logs-seen";

interface SeenReport {
  id: string;
  status: string;
  updatedAt: string;
}

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Notifications must never break the app.
  }
}

// ── Student report-status changes ─────────────────────────────────────────

export interface ReportStatusChange {
  id: string;
  title: string;
  from: string;
  to: string;
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: "Pending",
    investigating: "Under Review",
    under_review: "Under Review",
    resolved: "Resolved",
    rejected: "Dismissed",
    dismissed: "Dismissed",
  };
  return map[status] ?? status.replace(/_/g, " ");
}

/** Compare current reports against the last-seen snapshot. */
export function detectReportStatusChanges(
  reports: { id: string; title?: string; status: string; updatedAt?: string }[]
): ReportStatusChange[] {
  const seen = readJSON<SeenReport[]>(REPORT_SEEN_KEY, []);
  const byId = new Map(seen.map((s) => [s.id, s]));
  const changes: ReportStatusChange[] = [];

  for (const r of reports) {
    const prev = byId.get(r.id);
    if (!prev) continue; // brand-new report, not a status change
    if (prev.status !== r.status) {
      changes.push({
        id: r.id,
        title: r.title ?? "Report",
        from: statusLabel(prev.status),
        to: statusLabel(r.status),
      });
    }
  }
  return changes;
}

/** Count reports whose status differs from the last-seen snapshot. */
export function countUnseenReportChanges(
  reports: { id: string; status: string }[]
): number {
  const seen = readJSON<SeenReport[]>(REPORT_SEEN_KEY, []);
  const byId = new Map(seen.map((s) => [s.id, s]));
  return reports.filter((r) => {
    const prev = byId.get(r.id);
    return prev && prev.status !== r.status;
  }).length;
}

/** Persist the current snapshot so next time only newer changes notify. */
export function markReportStatusSeen(
  reports: { id: string; status: string; updatedAt?: string }[]
): void {
  const now = new Date().toISOString();
  writeJSON(
    REPORT_SEEN_KEY,
    reports.map((r) => ({ id: r.id, status: r.status, updatedAt: r.updatedAt ?? now }))
  );
}

// ── Admin activity-log unread count ────────────────────────────────────────

/** Number of log rows newer than the last time the bell was opened. */
export function countUnseenLogs(logs: { created_at: string }[]): number {
  const lastSeen = readJSON<number>(LOGS_SEEN_KEY, 0);
  return logs.filter((l) => new Date(l.created_at).getTime() > lastSeen).length;
}

/** Record that the bell was opened (now). */
export function markLogsSeen(): void {
  writeJSON(LOGS_SEEN_KEY, Date.now());
}

export const notificationService = {
  detectReportStatusChanges,
  countUnseenReportChanges,
  markReportStatusSeen,
  countUnseenLogs,
  markLogsSeen,
};

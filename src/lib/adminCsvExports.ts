import type { ActivityPresentationContext, ActivityLogRow } from "../services/activityLogService";
import { formatAdminActivity } from "../services/adminActivityPresentation";
import type { IssueReport, ReportStatus } from "../services/reportService";

const REPORT_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  under_review: "Under Review",
  in_progress: "In Progress",
  resolved: "Resolved",
  rejected: "Rejected",
};

function humanize(value: string): string {
  return value.replaceAll("_", " ").replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

/** Date-only filename stamp in the same reporting timezone used for reports. */
export function formatManilaDateStamp(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Render report timestamps consistently in the application's reporting timezone. */
export function formatReportExportTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}:${part("second")}.${part("fractionalSecond")} PHT (UTC+08:00)`;
}

/** Map only administrator-review fields; private notes and reporter email are excluded. */
export function toAdminReportExportRows(reports: IssueReport[]): Record<string, unknown>[] {
  return reports.map((report) => ({
    "Report ID": report.id,
    "Report Title": report.title,
    Category: humanize(report.category),
    Priority: humanize(report.priority),
    Status: REPORT_STATUS_LABELS[report.status as ReportStatus] ?? humanize(report.status),
    Description: report.description,
    Location: report.campusPlaceName ?? report.buildingName ?? "",
    Floor: report.floorLabel ?? "",
    Room: report.roomName ?? "",
    "Submitted At (PHT)": formatReportExportTimestamp(report.createdAt),
    "Submitted At (UTC)": report.createdAt,
    Reporter: report.reporterName ?? report.reporterId,
  }));
}

/** Export only the visible audit row fields; raw metadata is intentionally omitted. */
export function toAdminActivityExportRows(
  logs: ActivityLogRow[],
  contexts: Map<string, ActivityPresentationContext>,
): Record<string, unknown>[] {
  return logs.map((log) => {
    const context = contexts.get(log.id);
    // Audit descriptions can incorporate target names and arbitrary metadata.
    // Keep the exported summary generic so student names and raw metadata do
    // not escape into an offline file; the actor/campus labels are explicit
    // fields already resolved for the authorized Activity Logs view.
    const formatted = formatAdminActivity(
      { ...log, metadata: null },
      { actorName: context?.actorName, campusName: context?.campusName },
    );
    return {
      "Date & Time (UTC)": log.created_at,
      Activity: formatted.title,
      Category: formatted.category,
      Description: formatted.description,
      "Performed By": formatted.actorLabel,
      Campus: formatted.campusLabel ?? "",
      "Action Code": formatted.technicalAction,
      "Record ID": formatted.recordId,
    };
  });
}

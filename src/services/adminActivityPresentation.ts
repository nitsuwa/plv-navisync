import type { ActivityLogRow } from "./activityLogService";

export interface ActivityPresentationContext {
  actorName?: string | null;
  campusName?: string | null;
  targetName?: string | null;
}

export interface FormattedAdminActivity {
  title: string;
  description: string;
  notificationText: string;
  category: string;
  actorLabel: string;
  campusLabel: string | null;
  timestamp: string;
  relativeTime: string;
  technicalAction: string;
  recordId: string;
}

interface ActivityCopy {
  title: string;
  category: string;
  activity: (context: ActivityPresentationContext) => string;
  notification: (context: ActivityPresentationContext) => string;
}

const dash = (value: string | null | undefined) => value?.trim() || "";
const quoted = (value: string) => `“${value}”`;
const campusSuffix = (context: ActivityPresentationContext) => context.campusName ? ` for ${context.campusName}` : "";
const actorSuffix = (context: ActivityPresentationContext) => context.actorName ? ` by ${context.actorName}` : "";

/** One source of Admin-facing activity copy for logs, dashboard, and notifications. */
export const ADMIN_ACTIVITY_CATALOG: Record<string, ActivityCopy> = {
  "campus_version.published": {
    title: "Campus map published", category: "Campus",
    activity: (c) => `${c.campusName || "Campus"} map was published${actorSuffix(c)}.`,
    notification: (c) => `${c.campusName || "Campus"} map was published.`,
  },
  "campus.save": {
    title: "Campus draft saved", category: "Campus",
    activity: (c) => `${c.campusName || "Campus"} draft was saved${actorSuffix(c)}.`,
    notification: (c) => `${c.campusName || "Campus"} draft was saved.`,
  },
  "campus.publish": {
    title: "Campus map published", category: "Campus",
    activity: (c) => `${c.campusName || "Campus"} map was published${actorSuffix(c)}.`,
    notification: (c) => `${c.campusName || "Campus"} map was published.`,
  },
  "campus.unpublish": {
    title: "Campus map unpublished", category: "Campus",
    activity: (c) => `${c.campusName || "Campus"} was removed from student maps${actorSuffix(c)}.`,
    notification: (c) => `${c.campusName || "Campus"} was removed from student maps.`,
  },
  "campus.archive": {
    title: "Campus archived", category: "Campus",
    activity: (c) => `${c.campusName || "Campus"} was archived${actorSuffix(c)}.`,
    notification: (c) => `${c.campusName || "Campus"} was archived.`,
  },
  "report.pending": {
    title: "Report received", category: "Reports",
    activity: (c) => `${c.targetName ? quoted(c.targetName) : "A report"} was received${campusSuffix(c)}.`,
    notification: (c) => `${c.targetName ? quoted(c.targetName) : "A report"} was received.`,
  },
  "report.under_review": {
    title: "Report under review", category: "Reports",
    activity: (c) => `${c.targetName ? quoted(c.targetName) : "A report"} is being reviewed${campusSuffix(c)}.`,
    notification: (c) => `${c.targetName ? quoted(c.targetName) : "A report"} is being reviewed.`,
  },
  "report.in_progress": {
    title: "Report in progress", category: "Reports",
    activity: (c) => `${c.targetName ? quoted(c.targetName) : "A report"} is being addressed${campusSuffix(c)}.`,
    notification: (c) => `${c.targetName ? quoted(c.targetName) : "A report"} is being addressed.`,
  },
  "report.resolved": {
    title: "Report resolved", category: "Reports",
    activity: (c) => `${c.targetName ? quoted(c.targetName) : "A report"} was marked as resolved${campusSuffix(c)}.`,
    notification: (c) => `${c.targetName ? quoted(c.targetName) : "A report"} was resolved.`,
  },
  "report.rejected": {
    title: "Report dismissed", category: "Reports",
    activity: (c) => `${c.targetName ? quoted(c.targetName) : "A report"} was dismissed${campusSuffix(c)}.`,
    notification: (c) => `${c.targetName ? quoted(c.targetName) : "A report"} was dismissed.`,
  },
  "report.notes": {
    title: "Report notes updated", category: "Reports",
    activity: (c) => `Internal notes were updated for ${c.targetName ? quoted(c.targetName) : "a report"}${campusSuffix(c)}.`,
    notification: () => "Internal notes were updated on a report.",
  },
  "report.archive": {
    title: "Report archived", category: "Reports",
    activity: (c) => `${c.targetName ? quoted(c.targetName) : "A report"} was archived${campusSuffix(c)}.`,
    notification: (c) => `${c.targetName ? quoted(c.targetName) : "A report"} was archived.`,
  },
  "event.create": {
    title: "Event created", category: "Events",
    activity: (c) => `${c.targetName ? quoted(c.targetName) : "An event"} was created${campusSuffix(c)}.`,
    notification: (c) => `${c.targetName ? quoted(c.targetName) : "An event"} was created.`,
  },
  "event.update": {
    title: "Event updated", category: "Events",
    activity: (c) => `${c.targetName ? quoted(c.targetName) : "An event"} was updated${campusSuffix(c)}.`,
    notification: (c) => `${c.targetName ? quoted(c.targetName) : "An event"} was updated.`,
  },
  "event.archive": {
    title: "Event archived", category: "Events",
    activity: (c) => `${c.targetName ? quoted(c.targetName) : "An event"} was archived${campusSuffix(c)}.`,
    notification: (c) => `${c.targetName ? quoted(c.targetName) : "An event"} was archived.`,
  },
  "event_overlay.create": {
    title: "Event overlay created", category: "Events",
    activity: (c) => `${c.targetName ? quoted(c.targetName) : "An event overlay"} was created${campusSuffix(c)}.`,
    notification: (c) => `${c.targetName ? quoted(c.targetName) : "An event overlay"} was created.`,
  },
  "event_overlay.update_details": {
    title: "Event overlay updated", category: "Events",
    activity: (c) => `${c.targetName ? quoted(c.targetName) : "An event overlay"} was updated${campusSuffix(c)}.`,
    notification: (c) => `${c.targetName ? quoted(c.targetName) : "An event overlay"} was updated.`,
  },
  "event_overlay.update_layout": {
    title: "Event layout updated", category: "Events",
    activity: (c) => `The layout for ${c.targetName ? quoted(c.targetName) : "an event overlay"} was updated${campusSuffix(c)}.`,
    notification: (c) => `${c.targetName ? quoted(c.targetName) : "An event"} layout was updated.`,
  },
  "event_overlay.submit": {
    title: "Event layout submitted", category: "Events",
    activity: (c) => `${c.targetName ? quoted(c.targetName) : "An event layout"} was submitted for review${campusSuffix(c)}.`,
    notification: (c) => `${c.targetName ? quoted(c.targetName) : "An event layout"} was submitted for review.`,
  },
  "event_overlay.approved": {
    title: "Event overlay approved", category: "Events",
    activity: (c) => `${c.targetName ? quoted(c.targetName) : "An event overlay"} was approved${campusSuffix(c)}.`,
    notification: (c) => `${c.targetName ? quoted(c.targetName) : "An event overlay"} was approved.`,
  },
  "event_overlay.disapproved": {
    title: "Event overlay not approved", category: "Events",
    activity: (c) => `${c.targetName ? quoted(c.targetName) : "An event overlay"} was not approved${campusSuffix(c)}.`,
    notification: (c) => `${c.targetName ? quoted(c.targetName) : "An event overlay"} was not approved.`,
  },
  "event_overlay.delete": {
    title: "Event overlay removed", category: "Events",
    activity: (c) => `${c.targetName ? quoted(c.targetName) : "An event overlay"} was removed${campusSuffix(c)}.`,
    notification: (c) => `${c.targetName ? quoted(c.targetName) : "An event overlay"} was removed.`,
  },
  "announcement.create": {
    title: "Announcement created", category: "Announcements",
    activity: (c) => `${c.targetName ? quoted(c.targetName) : "An announcement"} was created${campusSuffix(c)}.`,
    notification: (c) => `${c.targetName ? quoted(c.targetName) : "An announcement"} was created.`,
  },
  "announcement.update": {
    title: "Announcement updated", category: "Announcements",
    activity: (c) => `${c.targetName ? quoted(c.targetName) : "An announcement"} was updated${campusSuffix(c)}.`,
    notification: (c) => `${c.targetName ? quoted(c.targetName) : "An announcement"} was updated.`,
  },
  "announcement.publish": {
    title: "Announcement published", category: "Announcements",
    activity: (c) => `${c.targetName ? quoted(c.targetName) : "An announcement"} was published${campusSuffix(c)}.`,
    notification: (c) => `${c.targetName ? quoted(c.targetName) : "An announcement"} was published.`,
  },
  "announcement.archive": {
    title: "Announcement archived", category: "Announcements",
    activity: (c) => `${c.targetName ? quoted(c.targetName) : "An announcement"} was archived${campusSuffix(c)}.`,
    notification: (c) => `${c.targetName ? quoted(c.targetName) : "An announcement"} was archived.`,
  },
  "settings.update": {
    title: "Platform settings updated", category: "Settings",
    activity: () => "Student experience, map, or notification settings were updated.",
    notification: () => "Platform settings were updated.",
  },
  "admin.profile_updated": {
    title: "User account updated", category: "Users",
    activity: (c) => `${c.targetName || "A user account"} was updated${actorSuffix(c)}.`,
    notification: (c) => `${c.targetName || "A user account"} was updated.`,
  },
};

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function metadataText(metadata: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function humanizeAction(action: unknown): string {
  const rawAction = typeof action === "string" ? action : "";
  const words = rawAction.toLocaleLowerCase().replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!words) return "Activity recorded";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function adminActivityTitle(action: string): string {
  return ADMIN_ACTIVITY_CATALOG[action]?.title ?? humanizeAction(action);
}

function humanizeCategory(entityType: unknown): string {
  const key = typeof entityType === "string" ? entityType.toLowerCase() : "";
  if (key.includes("report")) return "Reports";
  if (key.includes("event")) return "Events";
  if (key.includes("announcement")) return "Announcements";
  if (key.includes("setting")) return "Settings";
  if (key.includes("campus") || key.includes("floor") || key.includes("building")) return "Campus";
  if (key.includes("profile") || key.includes("user")) return "Users";
  return "System";
}

export function formatActivityTimestamp(iso: string): string {
  const date = new Date(typeof iso === "string" ? iso : "");
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  }).format(date);
}

export function formatActivityTimeAgo(iso: string, now = Date.now()): string {
  const parsed = new Date(typeof iso === "string" ? iso : "").getTime();
  if (!Number.isFinite(parsed)) return "";
  const mins = Math.floor(Math.max(0, now - parsed) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}

export function formatAdminActivity(
  activity: Pick<ActivityLogRow, "id" | "action" | "entity_type" | "entity_id" | "campus_id" | "metadata" | "created_at">,
  context: ActivityPresentationContext = {},
): FormattedAdminActivity {
  const safeActivity = activity && typeof activity === "object" ? activity : {} as typeof activity;
  const safeContext = context && typeof context === "object" ? context : {};
  const action = typeof safeActivity.action === "string" ? safeActivity.action : "";
  const activityId = typeof safeActivity.id === "string" ? safeActivity.id : "";
  const createdAt = typeof safeActivity.created_at === "string" ? safeActivity.created_at : "";
  const metadata = metadataObject(safeActivity.metadata);
  const resolved: ActivityPresentationContext = {
    ...safeContext,
    actorName: dash(safeContext.actorName) || undefined,
    campusName: dash(safeContext.campusName) || metadataText(metadata, "campus_name", "campusName") || undefined,
    targetName: dash(safeContext.targetName) || metadataText(metadata, "title", "name", "report_title", "event_title", "announcement_title") || undefined,
  };
  const definition = ADMIN_ACTIVITY_CATALOG[action];
  const title = definition?.title ?? humanizeAction(action);
  const category = definition?.category ?? humanizeCategory(safeActivity.entity_type);
  const activityDescription = definition?.activity(resolved)
    ?? `${title}${resolved.campusName ? ` for ${resolved.campusName}` : ""}${actorSuffix(resolved)}.`;
  const description = resolved.actorName && !activityDescription.includes(resolved.actorName)
    ? `${activityDescription.replace(/[.!?]$/, "")} by ${resolved.actorName}.`
    : activityDescription;
  const notificationText = definition?.notification(resolved)
    ?? `${resolved.targetName ? `${quoted(resolved.targetName)}: ` : ""}${title.charAt(0).toLowerCase()}${title.slice(1)}${resolved.campusName ? ` for ${resolved.campusName}` : ""}.`;
  return {
    title,
    description,
    notificationText,
    category,
    actorLabel: dash(resolved.actorName) || "System",
    campusLabel: resolved.campusName || null,
    timestamp: formatActivityTimestamp(activity.created_at),
    relativeTime: formatActivityTimeAgo(activity.created_at),
    technicalAction: action || "unknown.action",
    recordId: activityId,
  };
}

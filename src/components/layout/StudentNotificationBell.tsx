import { useCallback, useEffect, useId, useMemo, useRef, useState, type ComponentType, type ComponentPropsWithoutRef, type RefObject } from "react";
import { Bell, CalendarDays, CheckCheck, ChevronDown, ChevronUp, Flag, RefreshCw } from "lucide-react";
import { Link } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { createPortal } from "react-dom";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../app/components/ui/select";
import type { CampusEventOverlay } from "../map-builder/types";
import { normalizeReportStatus, type IssueReport, type ReportStatus } from "../../services/reportService";
import { reportService } from "../../services/reportService";
import { loadStudentPreferences, type StudentNotificationPreferences } from "../../services/studentPreferencesService";
import { eventReviewFingerprint, hasEventHandoverWork } from "../../lib/studentEventUpdates";
import { STUDENT_REPORT_SUBMITTED_EVENT } from "../../lib/studentReportNotifications";
import { visibleEventCards } from "../../lib/eventMapView";
import { formatEventDate } from "../../lib/eventPublication";
import { usePublishedCampus } from "../../hooks/usePublishedCampus";
import { usePublishedEventPreviews } from "../../hooks/usePublishedEventPreviews";
import type { PublicEventPreview } from "../../types/eventPreview";
import type { EventOrganizationHandoverSummary } from "../../types/eventOrganization";
import { cn } from "../../lib/utils";

export interface StudentNotificationBellProps {
  ownerId: string;
  isStudentOrg: boolean;
  eventUpdates: CampusEventOverlay[];
  unreadEventIds: ReadonlySet<string>;
  markEventRead: (event: CampusEventOverlay) => unknown;
  eventUpdatesError?: string;
  refreshEventUpdates: () => Promise<void>;
  handoverUpdates?: EventOrganizationHandoverSummary[];
  markHandoverRead?: (grantId: string) => unknown;
  containerRef?: RefObject<HTMLDivElement | null>;
}

interface StudentNotificationsSectionProps extends Omit<StudentNotificationBellProps, "containerRef"> {
  campusId: string | null;
  reportsSnapshot: IssueReport[];
  reportsSnapshotLoading: boolean;
  reportsSnapshotError: boolean;
  onRetryReports: () => void;
}

interface StudentNotificationFeedProps extends StudentNotificationBellProps {
  campusId: string | null;
  presentation: "bell" | "section";
  mapTrigger?: boolean;
  reportsSnapshot?: IssueReport[];
  reportsSnapshotLoading?: boolean;
  reportsSnapshotError?: boolean;
  onRetryReports?: () => void;
}

interface StudentNotification {
  id: string;
  kind: "report" | "event-review" | "event-handover" | "campus-event";
  title: string;
  message: string;
  date: string;
  href: string;
  unread: boolean;
  event?: CampusEventOverlay;
  phase?: "upcoming" | "ongoing";
  reportStatus?: ReportStatus;
  handover?: EventOrganizationHandoverSummary;
}

const READ_IDS_PREFIX = "plv-student-notification-read:v1:";
const NOTIFICATION_READ_EVENT = "plv-student-notification-read";
const MAX_NOTIFICATIONS = 30;
// The Home section previews the newest few so the rest of Home stays reachable.
const SECTION_PREVIEW_COUNT = 3;
const REPORT_STATUS_PRESENTATION: Record<ReportStatus, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  under_review: { label: "Under Review", className: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  in_progress: { label: "In Progress", className: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300" },
  resolved: { label: "Resolved", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  // Matches the student Reports page, which shows rejected reports as Dismissed.
  rejected: { label: "Dismissed", className: "bg-destructive/10 text-destructive dark:text-red-300" },
};
const REPORT_STATUS_FILTER_OPTIONS: Array<{ value: ReportStatus | "all"; label: string }> = [
  { value: "all", label: "All notifications" },
  ...Object.entries(REPORT_STATUS_PRESENTATION).map(([value, status]) => ({
    value: value as ReportStatus,
    label: status.label,
  })),
];

// The shared Radix wrappers forward these DOM props at runtime; their installed declarations omit them.
const NotificationSelectTrigger = SelectTrigger as unknown as ComponentType<ComponentPropsWithoutRef<"button"> & { size?: "sm" | "default" | "lg" }>;
const NotificationSelectContent = SelectContent as unknown as ComponentType<ComponentPropsWithoutRef<"div"> & { position?: "item-aligned" | "popper"; sideOffset?: number }>;
const NotificationSelectItem = SelectItem as unknown as ComponentType<ComponentPropsWithoutRef<"div"> & { value: string; disabled?: boolean; textValue?: string }>;

function readStorageKey(ownerId: string) {
  return `${READ_IDS_PREFIX}${encodeURIComponent(ownerId)}`;
}

function loadReadIds(ownerId: string): Set<string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(readStorageKey(ownerId)) ?? "[]");
    return new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function saveReadIds(ownerId: string, ids: Set<string>) {
  try {
    localStorage.setItem(readStorageKey(ownerId), JSON.stringify([...ids].slice(-300)));
  } catch {
    // A storage failure should not keep the notification panel from opening.
  }
}

function formatNotificationDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Recently";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function reportUpdateNotifications(reports: IssueReport[], readIds: Set<string>): StudentNotification[] {
  return reports.flatMap((report) => {
    const createdAt = new Date(report.createdAt).getTime();
    const updates = report.updates ?? [];
    const submissionUpdate = updates.find((update) => {
      const text = update.text.trim().toLowerCase();
      return Number.isFinite(createdAt)
        && new Date(update.date).getTime() === createdAt
        && (text === "report submitted" || text === "status changed to pending");
    });

    return updates
      .filter((update) => Number.isFinite(new Date(update.date).getTime())
        && new Date(update.date).getTime() >= createdAt)
      .map((update) => {
        const isSubmission = update === submissionUpdate;
        const id = `report:${report.id}:${update.date}:${update.text}`;
        return {
          id,
          kind: "report" as const,
          title: report.title || "Report update",
          message: isSubmission ? "Report submitted" : update.text,
          date: update.date,
          href: `/student/reports?reportId=${encodeURIComponent(report.id)}`,
          unread: !readIds.has(id),
          // Badges reflect where the report stands now, not the status at the
          // time of each update, so an old "Report submitted" row can't keep
          // saying Pending after the report was resolved or dismissed.
          reportStatus: normalizeReportStatus(report.status),
        };
      });
  });
}

function eventReviewNotifications(
  events: CampusEventOverlay[] = [],
  unreadIds: ReadonlySet<string> = new Set(),
): StudentNotification[] {
  return events.flatMap((event) => {
    const fingerprint = eventReviewFingerprint(event);
    if (!fingerprint) return [];
    const approved = event.status === "approved";
    const feedback = [event.adminComment, ...Object.values(event.locationFeedback ?? {})]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value));
    const reviewText = approved ? "Your event layout was approved." : "Your event layout needs changes.";
    const message = [reviewText, ...feedback].join(" ");
    return [{
      id: `event:${event.id}:${fingerprint}`,
      kind: "event-review" as const,
      title: event.title || "Event layout update",
      message,
      date: event.updatedAt ?? event.submittedAt ?? event.publicationAt ?? "",
      href: `/student/events${event.organizationId ? `?organizationId=${encodeURIComponent(event.organizationId)}` : ""}`,
      unread: unreadIds.has(event.id),
      event,
    }];
  });
}

function handoverNotifications(updates: EventOrganizationHandoverSummary[] = []): StudentNotification[] {
  return updates.filter(hasEventHandoverWork).map((update) => {
    // The server's unfinished total includes pending submissions.
    const total = Math.max(update.unfinishedCount, update.pendingCount);
    const work = total === 1 ? "1 unfinished event" : `${total} unfinished events`;
    const pending = update.pendingCount === 1 ? "1 pending submission" : `${update.pendingCount} pending submissions`;
    const feedback = update.openFeedbackCount === 1 ? "1 open feedback pin" : `${update.openFeedbackCount} open feedback pins`;
    const summary = [total > 0 ? `${work}${update.pendingCount > 0 ? ` (${pending})` : ""}` : "", update.openFeedbackCount > 0 ? feedback : ""].filter(Boolean).join(" · ");
    return {
      id: `event-handover:${update.grantId}`,
      kind: "event-handover" as const,
      title: `${update.organizationName} event handover`,
      message: `${update.academicYear} · ${summary}. Review your organization’s current work.`,
      date: update.startsAt,
      href: `/student/events?organizationId=${encodeURIComponent(update.organizationId)}&handover=${encodeURIComponent(update.grantId)}`,
      unread: !update.isRead,
      handover: update,
    };
  });
}

function publishedEventNotifications(
  events: PublicEventPreview[],
  nowMs: number,
  readIds: Set<string>,
): StudentNotification[] {
  return visibleEventCards(events, nowMs, "all").map((event) => {
    const id = `campus-event:${event.campusId}:${event.id}:${event.publicationAt}:${event.dateStart}:${event.dateEnd}`;
    const message = event.phase === "ongoing"
      ? `Happening now · Ends ${formatEventDate(event.dateEnd)}`
      : `Upcoming · Starts ${formatEventDate(event.dateStart)}`;
    return {
      id,
      kind: "campus-event" as const,
      title: event.title || "Campus event",
      message,
      date: event.dateStart,
      href: `/map?eventId=${encodeURIComponent(event.id)}&eventCampusId=${encodeURIComponent(event.campusId)}${event.locations[0] ? `&eventLocationId=${encodeURIComponent(event.locations[0].id)}` : ""}`,
      unread: !readIds.has(id),
      phase: event.phase,
    };
  });
}

export function StudentNotificationBell({
  ...props
}: StudentNotificationBellProps) {
  const { activeCampus } = usePublishedCampus();
  return <StudentNotificationFeed {...props} campusId={activeCampus?.id ?? null} presentation="bell" />;
}

export function StudentNotificationBellForCampus({ campusId, ...props }: StudentNotificationBellProps & { campusId: string | null }) {
  return <StudentNotificationFeed {...props} campusId={campusId} presentation="bell" mapTrigger />;
}

export function StudentNotificationsSection(props: StudentNotificationsSectionProps) {
  return <StudentNotificationFeed {...props} presentation="section" />;
}

function StudentNotificationFeed({
  ownerId, isStudentOrg, eventUpdates, unreadEventIds, markEventRead,
  handoverUpdates = [], markHandoverRead,
  eventUpdatesError, refreshEventUpdates, containerRef, campusId, presentation,
  mapTrigger = false,
  reportsSnapshot, reportsSnapshotLoading = false, reportsSnapshotError = false, onRetryReports,
}: StudentNotificationFeedProps) {
  const isSection = presentation === "section";
  const filterLabelId = useId();
  const sectionListId = useId();
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState(false);
  const notificationPanelRef = useRef<HTMLElement | null>(null);
  const [reports, setReports] = useState<IssueReport[]>([]);
  const [eventClockMs, setEventClockMs] = useState(() => Date.now());
  const [preferences, setPreferences] = useState<StudentNotificationPreferences | null>(null);
  const [reportError, setReportError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [readIds, setReadIds] = useState(() => loadReadIds(ownerId));
  const [reportStatusFilter, setReportStatusFilter] = useState<ReportStatus | "all">("all");
  const reportRequestInFlight = useRef(false);
  const lastReportRefreshAt = useRef(0);
  const publishedEventFeed = usePublishedEventPreviews({
    campusId,
    enabled: Boolean(campusId && preferences !== null && preferences.campusEvents !== false),
  });
  const publishedEvents = publishedEventFeed.events;
  const publishedEventsLoading = publishedEventFeed.loading;
  const publishedEventsError = Boolean(publishedEventFeed.error);
  const eventServerOffsetMs = publishedEventFeed.serverOffsetMs;

  const refreshReports = useCallback(async (force = true) => {
    if (reportsSnapshot !== undefined) {
      onRetryReports?.();
      return;
    }
    const now = Date.now();
    if (reportRequestInFlight.current || (!force && now - lastReportRefreshAt.current < 5_000)) return;
    reportRequestInFlight.current = true;
    lastReportRefreshAt.current = now;
    try {
      const result = await reportService.getStudentReports();
      setReports(result);
      setReportError(false);
    } catch {
      setReportError(true);
    } finally {
      reportRequestInFlight.current = false;
      setLoading(false);
    }
  }, [onRetryReports, reportsSnapshot]);

  const refreshPublishedEvents = useCallback((force = true) => {
    if (!campusId || preferences === null || preferences.campusEvents === false) return Promise.resolve();
    return publishedEventFeed.refresh(force);
  }, [campusId, preferences?.campusEvents, publishedEventFeed.refresh]);

  useEffect(() => {
    let mounted = true;
    const refreshWhileMounted = () => {
      if (mounted) void refreshReports();
    };
    if (reportsSnapshot === undefined) refreshWhileMounted();
    else {
      setReports(reportsSnapshot);
      setReportError(reportsSnapshotError);
      setLoading(reportsSnapshotLoading);
    }
    void loadStudentPreferences().then((value) => {
      if (mounted) setPreferences(value);
    });
    const interval = reportsSnapshot === undefined ? window.setInterval(() => {
      if (document.visibilityState !== "hidden") void refreshReports(false);
    }, 60_000) : undefined;
    const refreshOnFocus = () => {
      if (reportsSnapshot === undefined && document.visibilityState !== "hidden") void refreshReports(false);
    };
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnFocus);
    window.addEventListener(STUDENT_REPORT_SUBMITTED_EVENT, refreshWhileMounted);
    return () => {
      mounted = false;
      if (interval !== undefined) window.clearInterval(interval);
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnFocus);
      window.removeEventListener(STUDENT_REPORT_SUBMITTED_EVENT, refreshWhileMounted);
    };
  }, [ownerId, refreshReports, reportsSnapshot, reportsSnapshotError, reportsSnapshotLoading]);

  useEffect(() => {
    const interval = window.setInterval(() => setEventClockMs(Date.now()), 15_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    setReadIds(loadReadIds(ownerId));
  }, [ownerId]);

  useEffect(() => {
    const syncReadIds = (event: Event) => {
      const detail = (event as CustomEvent<{ ownerId?: string; ids?: string[] }>).detail;
      if (detail?.ownerId === ownerId && Array.isArray(detail.ids)) setReadIds(new Set(detail.ids));
    };
    const syncStorageReadIds = (event: StorageEvent) => {
      if (event.key === null || event.key === readStorageKey(ownerId)) setReadIds(loadReadIds(ownerId));
    };
    window.addEventListener(NOTIFICATION_READ_EVENT, syncReadIds);
    window.addEventListener("storage", syncStorageReadIds);
    return () => {
      window.removeEventListener(NOTIFICATION_READ_EVENT, syncReadIds);
      window.removeEventListener("storage", syncStorageReadIds);
    };
  }, [ownerId]);

  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node
        && !containerRef?.current?.contains(event.target)
        && !notificationPanelRef.current?.contains(event.target)) setOpen(false);
    };
    const dismissEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissEscape);
    };
  }, [containerRef, open]);

  const notifications = useMemo(() => {
    const items = [
      ...(preferences?.reportStatus === false ? [] : reportUpdateNotifications(reportsSnapshot ?? reports, readIds)),
      ...(preferences?.campusEvents === false ? [] : publishedEventNotifications(publishedEvents, eventClockMs + eventServerOffsetMs, readIds)),
      ...(!isStudentOrg || preferences?.campusEvents === false ? [] : eventReviewNotifications(eventUpdates, unreadEventIds)),
      ...(!isStudentOrg ? [] : handoverNotifications(handoverUpdates)),
    ];
    return items.sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
  }, [eventClockMs, eventServerOffsetMs, eventUpdates, handoverUpdates, isStudentOrg, preferences, publishedEvents, readIds, reports, reportsSnapshot, unreadEventIds]);
  const filteredNotifications = useMemo(() => {
    if (!isSection || reportStatusFilter === "all") return notifications;
    return notifications.filter((item) => item.kind === "report" && item.reportStatus === reportStatusFilter);
  }, [isSection, notifications, reportStatusFilter]);
  const unreadCount = notifications.filter((item) => item.unread).length;
  const displayedNotifications = isSection
    ? (expanded ? filteredNotifications : filteredNotifications.slice(0, SECTION_PREVIEW_COUNT))
    : notifications.slice(0, MAX_NOTIFICATIONS);
  const hiddenSectionCount = isSection ? Math.max(0, filteredNotifications.length - SECTION_PREVIEW_COUNT) : 0;

  const collapseSection = () => {
    setExpanded(false);
    // Scroll anchoring keeps the toggle in place as the list shrinks, which
    // can push the header off-screen. Check after the collapse has rendered.
    window.requestAnimationFrame(() => {
      const panel = notificationPanelRef.current;
      if (!panel || panel.getBoundingClientRect().top >= 0) return;
      // Clear the sticky navbar rather than tucking the header under it.
      const top = panel.getBoundingClientRect().top + window.scrollY - 72;
      window.scrollTo({ top, behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    });
  };
  const displayedReportsLoading = reportsSnapshot === undefined ? loading : reportsSnapshotLoading;
  const displayedReportError = reportsSnapshot === undefined ? reportError : reportsSnapshotError;
  const includeNonReportNotifications = !isSection || reportStatusFilter === "all";
  const displayedNotificationsLoading = displayedReportsLoading
    || (includeNonReportNotifications && Boolean(campusId) && publishedEventsLoading);
  const displayedNotificationsError = displayedReportError
    || (includeNonReportNotifications && (Boolean(eventUpdatesError) || publishedEventsError));

  const markReportRead = (id: string) => {
    setReadIds((current) => {
      const next = new Set(current).add(id);
      saveReadIds(ownerId, next);
      window.dispatchEvent(new CustomEvent(NOTIFICATION_READ_EVENT, { detail: { ownerId, ids: [...next] } }));
      return next;
    });
  };

  const markAllRead = () => {
    const next = new Set(readIds);
    notifications.filter((item) => item.kind === "report" || item.kind === "campus-event").forEach((item) => next.add(item.id));
    saveReadIds(ownerId, next);
    setReadIds(next);
    window.dispatchEvent(new CustomEvent(NOTIFICATION_READ_EVENT, { detail: { ownerId, ids: [...next] } }));
    notifications.forEach((item) => {
      if (item.kind === "event-review" && item.event && item.unread) markEventRead(item.event);
      if (item.kind === "event-handover" && item.handover && item.unread) markHandoverRead?.(item.handover.grantId);
    });
  };

  const unreadLabel = unreadCount > 0 ? `${unreadCount} unread` : "All caught up";

  return (
    <div className={isSection ? "w-full" : "relative"} ref={containerRef} data-student-notifications data-presentation={presentation}>
      {!isSection && <button
        type="button"
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Notifications"
        onClick={() => {
          if (!open) {
            void refreshReports();
            void refreshEventUpdates();
            void refreshPublishedEvents(false);
          }
          setOpen(!open);
        }}
        className={cn(
          "relative inline-flex shrink-0 items-center justify-center border transition-[transform,background-color,border-color,color,box-shadow] duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
          mapTrigger
            ? "h-12 w-12 min-w-12 rounded-2xl border-border/70 bg-card/95 text-primary shadow-[0_6px_18px_rgba(15,23,42,0.14)] backdrop-blur-xl hover:bg-muted"
            : "h-9 w-9 rounded-xl border-border text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring",
        )}
      >
        <Bell className={cn("h-4 w-4", mapTrigger && "h-[18px] w-[18px]")} aria-hidden="true" />
        {unreadCount > 0 && <span className={cn(
          "absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-extrabold leading-none text-destructive-foreground",
          mapTrigger ? "h-5 min-w-5" : "h-4",
        )}>{unreadCount > 9 ? "9+" : unreadCount}</span>}
      </button>}

      {(() => {
        const notificationPanel = (
          <motion.section
            ref={notificationPanelRef}
            id={isSection ? "student-notifications" : undefined}
            role={isSection ? "region" : "dialog"}
            aria-label="Student notifications"
            initial={isSection ? false : { opacity: 0, y: -5, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className={cn(
              isSection ? "w-full" : "flex flex-col overflow-hidden rounded-2xl border border-border bg-card",
              isSection
                ? ""
                : mapTrigger
                  ? "fixed z-[70] max-h-[min(72vh,34rem)] w-[min(23rem,calc(100vw-1.5rem))] shadow-2xl"
                  : "student-notification-popover absolute right-0 top-full z-[70] mt-2 max-h-[min(72vh,34rem)] w-[min(23rem,calc(100vw-1.5rem))] shadow-2xl",
            )}
            style={!isSection ? {
              // Leave room for the sticky header, mobile navigation, and device safe areas.
              // The notification list can then scroll inside the panel on short screens.
              maxHeight: "min(72dvh, 34rem, calc(100dvh - 9rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)))",
              ...(mapTrigger ? {
                top: "calc(max(0.5rem, env(safe-area-inset-top, 0.5rem)) + 3.5rem)",
                right: "max(0.5rem, env(safe-area-inset-right, 0px))",
              } : {}),
            } : undefined}
          >
            <header className={cn(
              "flex shrink-0 items-center justify-between gap-3",
              isSection ? "mb-3" : "border-b border-border px-4 py-3",
            )}>
              <div className={cn("min-w-0", isSection && "flex items-center gap-2.5")}>
                {isSection && <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Bell className="h-4 w-4" aria-hidden="true" /></span>}
                <div className="min-w-0">
                  <h2 className={cn("font-extrabold text-foreground", isSection ? "text-xs uppercase tracking-wider" : "text-sm")}>Notifications</h2>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{unreadLabel}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={markAllRead}
                disabled={unreadCount === 0}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 text-[11px] font-bold text-primary transition-colors disabled:cursor-default disabled:opacity-45 dark:text-blue-300",
                  isSection
                    ? "min-h-9 rounded-xl border border-border/60 bg-card/60 px-3 hover:border-primary/25 hover:bg-primary/5"
                    : "rounded-lg px-2 py-1.5 hover:bg-primary/8",
                )}
              >
                <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" /> Mark all read
              </button>
            </header>

            {isSection && (
              <div className="mb-2.5 flex items-center justify-between gap-3">
                <span id={filterLabelId} className="shrink-0 text-xs font-semibold text-muted-foreground">
                  Report status
                </span>
                <Select value={reportStatusFilter} onValueChange={(value) => { setReportStatusFilter(value as ReportStatus | "all"); setExpanded(false); }}>
                  <NotificationSelectTrigger
                    size="default"
                    aria-label="Filter notifications by report status"
                    aria-labelledby={filterLabelId}
                    className="!h-9 min-w-0 w-[min(13rem,62%)] rounded-xl border-border bg-background px-3 text-xs font-bold text-foreground shadow-sm transition-colors hover:border-primary/45 focus-visible:border-primary/60 focus-visible:ring-2 focus-visible:ring-primary/30 motion-reduce:transition-none data-[state=open]:border-primary/60 data-[state=open]:ring-2 data-[state=open]:ring-primary/15 [&_svg]:opacity-100"
                  >
                    <SelectValue />
                  </NotificationSelectTrigger>
                  <NotificationSelectContent position="popper" sideOffset={6} className="z-[80] max-h-[min(18rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] rounded-xl border-border bg-popover p-1.5 text-popover-foreground shadow-xl motion-reduce:animate-none">
                    {REPORT_STATUS_FILTER_OPTIONS.map((option) => (
                      <NotificationSelectItem key={option.value} value={option.value} className="min-h-11 rounded-lg px-3 py-2 text-sm focus:bg-primary/10 focus:text-foreground data-[highlighted]:bg-primary/10 data-[highlighted]:text-foreground data-[state=checked]:bg-primary/10 data-[state=checked]:text-foreground">
                        {option.label}
                      </NotificationSelectItem>
                    ))}
                  </NotificationSelectContent>
                </Select>
              </div>
            )}

            <div className={cn(
              isSection ? "w-full" : "min-h-0 flex-1 overflow-y-auto overscroll-contain",
            )}>
              {displayedNotificationsLoading && displayedNotifications.length === 0 ? (
                <p role="status" className="px-4 py-8 text-center text-xs text-muted-foreground">Loading updates…</p>
              ) : displayedNotifications.length ? (<>
                <ul id={isSection ? sectionListId : undefined} aria-label={isSection ? "All notifications" : "Recent notifications"} className={cn(
                  isSection ? "space-y-2" : "divide-y divide-border/70",
                )}>
                  {displayedNotifications.map((item) => {
                    const Icon = item.kind === "report" ? Flag : CalendarDays;
                    return (
                      <li key={item.id}>
                        <Link
                        to={item.href}
                          onClick={() => {
                            if (item.kind === "report" || item.kind === "campus-event") markReportRead(item.id);
                            else if (item.kind === "event-handover" && item.handover) markHandoverRead?.(item.handover.grantId);
                            else if (item.event) markEventRead(item.event);
                            if (!isSection) setOpen(false);
                          }}
                          className={cn(
                            "flex items-start gap-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                            isSection
                              ? "rounded-2xl border border-border/70 bg-card px-3 py-2.5 sm:px-3.5 hover:border-primary/35 hover:bg-primary/[0.03] hover:shadow-sm"
                              : "px-4 py-3 hover:bg-muted/60",
                            item.unread && (isSection ? "border-primary/55 bg-primary/[0.02] dark:border-blue-300/55" : "bg-primary/[0.02]"),
                          )}
                        >
                          <span className={cn(
                            "mt-0.5 flex shrink-0 items-center justify-center rounded-xl",
                            isSection ? "h-9 w-9" : "h-8 w-8",
                            item.kind === "report" ? "bg-primary/10 text-primary" : "bg-accent/15 text-foreground",
                          )} data-notification-icon>
                            <Icon className={cn("h-4 w-4", isSection && "h-[18px] w-[18px]")} aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex min-w-0 items-start gap-2">
                              <span className={cn("min-w-0 flex-1 line-clamp-1 text-foreground", item.unread ? "font-extrabold" : "font-semibold", isSection ? "text-sm" : "text-xs")}>{item.title}</span>
                              <span className="flex shrink-0 items-center gap-2">
                                {item.reportStatus && <span aria-label={`Report status: ${REPORT_STATUS_PRESENTATION[item.reportStatus].label}`} className={cn(
                                  "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-extrabold",
                                  REPORT_STATUS_PRESENTATION[item.reportStatus].className,
                                )}>{REPORT_STATUS_PRESENTATION[item.reportStatus].label}</span>}
                                {item.phase && <span className={cn(
                                  "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide",
                                  item.phase === "ongoing" ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300" : "bg-primary/10 text-primary dark:text-blue-300",
                                )}>{item.phase}</span>}
                                {item.unread && <>
                                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary ring-2 ring-primary/20" aria-hidden="true" />
                                  <span className="sr-only">Unread notification</span>
                                </>}
                              </span>
                            </span>
                            {isSection ? (
                              // One line for message and time keeps each Home row short.
                              <span className="mt-0.5 flex min-w-0 items-baseline gap-1.5 text-xs text-foreground/75">
                                <span className="min-w-0 truncate">{item.message}</span>
                                {/* Campus-event messages already name their start time. */}
                                {item.kind === "campus-event" ? (
                                  <time className="sr-only" dateTime={item.date || undefined}>{formatNotificationDate(item.date)}</time>
                                ) : <>
                                  <span aria-hidden="true">·</span>
                                  <time className="shrink-0 text-[11px] font-medium" dateTime={item.date || undefined}>{formatNotificationDate(item.date)}</time>
                                </>}
                              </span>
                            ) : <>
                              <span className="mt-1 block text-xs leading-relaxed text-foreground/75">{item.message}</span>
                              <time className="mt-1.5 block text-[10px] font-medium text-foreground/75" dateTime={item.date || undefined}>{formatNotificationDate(item.date)}</time>
                            </>}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                {hiddenSectionCount > 0 && (
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={sectionListId}
                    onClick={() => (expanded ? collapseSection() : setExpanded(true))}
                    className="mt-2 flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/80 text-xs font-bold text-primary transition-colors hover:border-primary/35 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-blue-300"
                  >
                    {expanded ? <>Show fewer <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /></> : <>Show all {filteredNotifications.length} notifications <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /></>}
                  </button>
                )}
              </>) : displayedNotificationsError ? (
                <div className={cn("px-4 py-7 text-center", isSection && "rounded-2xl border border-border/60 bg-card/50")}>
                  <p className="text-xs font-semibold text-foreground">Updates are temporarily unavailable.</p>
                  <button type="button" onClick={() => { void refreshReports(); void refreshEventUpdates(); void refreshPublishedEvents(); }} className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline">
                    <RefreshCw className="h-3 w-3" aria-hidden="true" /> Retry
                  </button>
                </div>
              ) : (
                <div className={cn("px-4 py-8 text-center", isSection && "rounded-2xl border border-dashed border-border/60 bg-card/40")}>
                  <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-muted-foreground"><Bell className="h-4 w-4" aria-hidden="true" /></span>
                  <p className="mt-2 text-xs font-bold text-foreground">
                    {isSection && reportStatusFilter !== "all"
                      ? `No ${REPORT_STATUS_PRESENTATION[reportStatusFilter].label.toLowerCase()} reports`
                      : "You’re all caught up"}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {isSection && reportStatusFilter !== "all"
                      ? "Choose another report status to see matching notifications."
                      : "Report updates and upcoming campus events will appear here."}
                  </p>
                </div>
              )}
            </div>
          </motion.section>
        );
        if (mapTrigger && !isSection && typeof document !== "undefined") {
          return createPortal(<AnimatePresence>{open && notificationPanel}</AnimatePresence>, document.body);
        }
        return <AnimatePresence>{(open || isSection) && notificationPanel}</AnimatePresence>;
      })()}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Bell, CalendarDays, CheckCheck, Flag, RefreshCw } from "lucide-react";
import { Link } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import type { CampusEventOverlay } from "../map-builder/types";
import { normalizeReportStatus, type IssueReport, type ReportStatus } from "../../services/reportService";
import { reportService } from "../../services/reportService";
import { eventOverlayService } from "../../services/eventOverlayService";
import { loadStudentPreferences, type StudentNotificationPreferences } from "../../services/studentPreferencesService";
import { eventReviewFingerprint } from "../../lib/studentEventUpdates";
import { visibleEventCards } from "../../lib/eventMapView";
import { formatEventDate } from "../../lib/eventPublication";
import { usePublishedCampus } from "../../hooks/usePublishedCampus";
import type { PublicEventPreview } from "../../types/eventPreview";
import { cn } from "../../lib/utils";

export interface StudentNotificationBellProps {
  ownerId: string;
  isStudentOrg: boolean;
  eventUpdates: CampusEventOverlay[];
  unreadEventIds: ReadonlySet<string>;
  markEventRead: (event: CampusEventOverlay) => unknown;
  eventUpdatesError?: string;
  refreshEventUpdates: () => Promise<void>;
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
  kind: "report" | "event-review" | "campus-event";
  title: string;
  message: string;
  date: string;
  href: string;
  unread: boolean;
  event?: CampusEventOverlay;
  phase?: "upcoming" | "ongoing";
  reportStatus?: ReportStatus;
}

const READ_IDS_PREFIX = "plv-student-notification-read:v1:";
const NOTIFICATION_READ_EVENT = "plv-student-notification-read";
const MAX_NOTIFICATIONS = 30;
const REPORT_STATUS_PRESENTATION: Record<ReportStatus, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  under_review: { label: "Under Review", className: "bg-blue-500/10 text-blue-700 dark:text-blue-300" },
  in_progress: { label: "In Progress", className: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300" },
  resolved: { label: "Resolved", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  rejected: { label: "Rejected", className: "bg-destructive/10 text-destructive" },
};

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
  return reports.flatMap((report) => (report.updates ?? [])
    .filter((update) => update.text.trim().toLowerCase() !== "report submitted"
      && Number.isFinite(new Date(update.date).getTime())
      && new Date(update.date).getTime() >= new Date(report.createdAt).getTime())
    .map((update) => {
      const id = `report:${report.id}:${update.date}:${update.text}`;
      return {
        id,
        kind: "report" as const,
        title: report.title || "Report update",
        message: update.text,
        date: update.date,
        href: `/student/reports?reportId=${encodeURIComponent(report.id)}`,
        unread: !readIds.has(id),
        reportStatus: normalizeReportStatus(report.status),
      };
    }));
}

function eventReviewNotifications(
  events: CampusEventOverlay[],
  unreadIds: ReadonlySet<string>,
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
      href: "/student/events",
      unread: unreadIds.has(event.id),
      event,
    }];
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
  eventUpdatesError, refreshEventUpdates, containerRef, campusId, presentation,
  mapTrigger = false,
  reportsSnapshot, reportsSnapshotLoading = false, reportsSnapshotError = false, onRetryReports,
}: StudentNotificationFeedProps) {
  const isSection = presentation === "section";
  const [open, setOpen] = useState(false);
  const [reports, setReports] = useState<IssueReport[]>([]);
  const [publishedEvents, setPublishedEvents] = useState<PublicEventPreview[]>([]);
  const [publishedEventsLoading, setPublishedEventsLoading] = useState(false);
  const [eventClockMs, setEventClockMs] = useState(() => Date.now());
  const [eventServerOffsetMs, setEventServerOffsetMs] = useState(0);
  const [preferences, setPreferences] = useState<StudentNotificationPreferences | null>(null);
  const [reportError, setReportError] = useState(false);
  const [publishedEventsError, setPublishedEventsError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [readIds, setReadIds] = useState(() => loadReadIds(ownerId));
  const eventRequestId = useRef(0);

  const refreshReports = useCallback(async () => {
    if (reportsSnapshot !== undefined) {
      onRetryReports?.();
      return;
    }
    try {
      const result = await reportService.getStudentReports();
      setReports(result);
      setReportError(false);
    } catch {
      setReportError(true);
    } finally {
      setLoading(false);
    }
  }, [onRetryReports, reportsSnapshot]);

  const refreshPublishedEvents = useCallback(async () => {
    if (!campusId || preferences?.campusEvents === false) {
      setPublishedEvents([]);
      setPublishedEventsLoading(false);
      setPublishedEventsError(false);
      return;
    }
    const requestId = ++eventRequestId.current;
    setPublishedEventsLoading(true);
    try {
      const feed = await eventOverlayService.listPublishedEventPreviews(campusId);
      if (requestId !== eventRequestId.current) return;
      const receivedAt = Date.now();
      const serverOffset = Date.parse(feed.serverNow) - receivedAt;
      setEventClockMs(receivedAt);
      setEventServerOffsetMs(Number.isFinite(serverOffset) ? serverOffset : 0);
      setPublishedEvents(feed.events);
      setPublishedEventsLoading(false);
      setPublishedEventsError(false);
    } catch {
      if (requestId !== eventRequestId.current) return;
      setPublishedEventsLoading(false);
      setPublishedEventsError(true);
    }
  }, [campusId, preferences?.campusEvents]);

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
      if (document.visibilityState !== "hidden") refreshWhileMounted();
    }, 30_000) : undefined;
    const refreshOnFocus = () => {
      if (reportsSnapshot === undefined && document.visibilityState !== "hidden") refreshWhileMounted();
    };
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnFocus);
    return () => {
      mounted = false;
      if (interval !== undefined) window.clearInterval(interval);
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnFocus);
    };
  }, [ownerId, refreshReports, reportsSnapshot, reportsSnapshotError, reportsSnapshotLoading]);

  useEffect(() => {
    let mounted = true;
    const refreshWhileMounted = () => {
      if (mounted) void refreshPublishedEvents();
    };
    refreshWhileMounted();
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "hidden") refreshWhileMounted();
    }, 30_000);
    const refreshOnFocus = () => {
      if (document.visibilityState !== "hidden") refreshWhileMounted();
    };
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnFocus);
    return () => {
      mounted = false;
      eventRequestId.current += 1;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnFocus);
    };
  }, [refreshPublishedEvents]);

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
      if (event.target instanceof Node && !containerRef?.current?.contains(event.target)) setOpen(false);
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
    ];
    return items.sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
  }, [eventClockMs, eventServerOffsetMs, eventUpdates, isStudentOrg, preferences, publishedEvents, readIds, reports, reportsSnapshot, unreadEventIds]);
  const unreadCount = notifications.filter((item) => item.unread).length;
  const displayedNotifications = isSection ? notifications : notifications.slice(0, MAX_NOTIFICATIONS);
  const displayedReportsLoading = reportsSnapshot === undefined ? loading : reportsSnapshotLoading;
  const displayedReportError = reportsSnapshot === undefined ? reportError : reportsSnapshotError;

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
            void refreshPublishedEvents();
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

      <AnimatePresence>
        {(open || isSection) && (
          <motion.section
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
                  : "absolute right-0 top-full z-[70] mt-2 max-h-[min(72vh,34rem)] w-[min(23rem,calc(100vw-1.5rem))] shadow-2xl",
            )}
            style={mapTrigger ? {
              top: "calc(max(0.5rem, env(safe-area-inset-top, 0.5rem)) + 3.5rem)",
              right: "max(0.5rem, env(safe-area-inset-right, 0px))",
            } : undefined}
          >
            <header className={cn(
              "flex items-center justify-between gap-3",
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
                  "inline-flex shrink-0 items-center gap-1.5 text-[11px] font-bold text-primary transition-colors disabled:cursor-default disabled:opacity-45",
                  isSection
                    ? "min-h-9 rounded-xl border border-border/60 bg-card/60 px-3 hover:border-primary/25 hover:bg-primary/5"
                    : "rounded-lg px-2 py-1.5 hover:bg-primary/8",
                )}
              >
                <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" /> Mark all read
              </button>
            </header>

            <div className={cn(
              "min-h-20 flex-1 overflow-y-auto overscroll-contain",
              isSection && "max-h-[34rem] min-h-0",
            )}>
              {(displayedReportsLoading || (Boolean(campusId) && publishedEventsLoading)) && notifications.length === 0 ? (
                <p role="status" className="px-4 py-8 text-center text-xs text-muted-foreground">Loading updates…</p>
              ) : notifications.length ? (
                <ul aria-label={isSection ? "All notifications" : "Recent notifications"} className={cn(
                  isSection ? "space-y-2.5" : "divide-y divide-border/70",
                )}>
                  {displayedNotifications.map((item) => {
                    const Icon = item.kind === "report" ? Flag : CalendarDays;
                    return (
                      <li key={item.id}>
                        <Link
                        to={item.href}
                          onClick={() => {
                            if (item.kind === "report" || item.kind === "campus-event") markReportRead(item.id);
                            else if (item.event) markEventRead(item.event);
                            if (!isSection) setOpen(false);
                          }}
                          className={cn(
                            "flex items-start gap-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                            isSection
                              ? "rounded-2xl border border-border/60 bg-card/50 px-4 py-4 hover:border-primary/15 hover:bg-card hover:shadow-sm"
                              : "px-4 py-3 hover:bg-muted/60",
                            item.unread && (isSection ? "border-primary/25 bg-primary/[0.04]" : "bg-primary/[0.035]"),
                          )}
                        >
                          <span className={cn(
                            "mt-0.5 flex shrink-0 items-center justify-center rounded-xl",
                            isSection ? "h-10 w-10" : "h-8 w-8",
                            item.kind === "report" ? "bg-primary/10 text-primary" : "bg-accent/15 text-accent-foreground",
                          )}>
                            <Icon className={cn("h-4 w-4", isSection && "h-[18px] w-[18px]")} aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1">
                              <span className="flex items-start justify-between gap-2">
                                <span className={cn("line-clamp-1 font-bold text-foreground", isSection ? "text-sm" : "text-xs")}>{item.title}</span>
                                {item.reportStatus && <span aria-label={`Report status: ${REPORT_STATUS_PRESENTATION[item.reportStatus].label}`} className={cn(
                                  "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-extrabold",
                                  REPORT_STATUS_PRESENTATION[item.reportStatus].className,
                                )}>{REPORT_STATUS_PRESENTATION[item.reportStatus].label}</span>}
                                {item.phase && <span className={cn(
                                "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide",
                                item.phase === "ongoing" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-primary/10 text-primary",
                              )}>{item.phase}</span>}
                              {item.unread && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                            </span>
                            <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{item.message}</span>
                            <time className="mt-1.5 block text-[10px] font-medium text-muted-foreground/80" dateTime={item.date || undefined}>{formatNotificationDate(item.date)}</time>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : displayedReportError || eventUpdatesError || publishedEventsError ? (
                <div className={cn("px-4 py-7 text-center", isSection && "rounded-2xl border border-border/60 bg-card/50")}>
                  <p className="text-xs font-semibold text-foreground">Updates are temporarily unavailable.</p>
                  <button type="button" onClick={() => { void refreshReports(); void refreshEventUpdates(); void refreshPublishedEvents(); }} className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline">
                    <RefreshCw className="h-3 w-3" aria-hidden="true" /> Retry
                  </button>
                </div>
              ) : (
                <div className={cn("px-4 py-8 text-center", isSection && "rounded-2xl border border-dashed border-border/60 bg-card/40")}>
                  <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-muted-foreground"><Bell className="h-4 w-4" aria-hidden="true" /></span>
                  <p className="mt-2 text-xs font-bold text-foreground">You’re all caught up</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">Report updates and upcoming campus events will appear here.</p>
                </div>
              )}
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}

import { Outlet, useNavigate, useLocation } from "react-router";
import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { NavigationProgress } from "../ui/NavigationProgress";
import { UnsavedChangesProvider, useUnsavedChangesContext } from "../map-builder/UnsavedChangesContext";
import { AdminSidebar } from "./AdminSidebar";
import { ThemeToggle } from "../ui/ThemeToggle";
import { useTheme } from "../../hooks/useTheme";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { cn } from "../../lib/utils";
import { PanelLeftClose, PanelLeft, Menu, Bell, User, History, CheckCheck } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  activityLogErrorMessage,
  activityLogService,
  type ActivityLogRow,
} from "../../services/activityLogService";
import { formatAdminActivity } from "../../services/adminActivityPresentation";
import type { ActivityPresentationContext } from "../../services/activityLogService";
import { notificationService } from "../../lib/notificationService";
import {
  adminNotificationPreferencesService,
} from "../../services/adminNotificationPreferencesService";
import { isSuperAdminRole } from "../../lib/roles";
import { useAdminEventSubmissions } from "../../hooks/useAdminEventSubmissions";
import { submissionUpdateLabel } from "../../lib/adminEventSubmissions";
import { normalizeEventOverlayLocations } from "../../lib/eventOverlayModel";
import { formatEventSubmissionTime } from "../../lib/eventSubmissionTime";

/** This child runs inside the provider so notifications protect editor drafts. */
function AdminNotificationAction({ to, onNavigate, ariaLabel, className, children }: { to: string; onNavigate: () => void; ariaLabel?: string; className: string; children: ReactNode }) {
  const { requestGuarded } = useUnsavedChangesContext();
  const navigate = useNavigate();
  return <button type="button" aria-label={ariaLabel} className={className} onClick={() => requestGuarded(() => { onNavigate(); navigate(to); })}>{children}</button>;
}

/** Branded full-screen loader shown while the session/profile is checked. */
function AuthGateLoader() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background">
      <div className="w-11 h-11 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
      <p className="text-xs font-semibold text-muted-foreground">Checking your session…</p>
    </div>
  );
}

const ROUTE_LABELS: Record<string, string> = {
  "/admin-dashboard":                "Dashboard",
  "/admin-dashboard/map-builder":    "Map Builder",
  "/admin-dashboard/announcements":  "Announcements",
  "/admin-dashboard/reports":        "Reports",
  "/admin-dashboard/event-layouts":  "Event Layouts",
  "/admin-dashboard/users":          "Users",
  "/admin-dashboard/settings":       "Settings",
  // Legacy pages still reachable by URL but not in sidebar
  "/admin-dashboard/buildings":      "Buildings",
  "/admin-dashboard/floor-plans":    "Floor Plans",
  "/admin-dashboard/routes":         "Routes",
  "/admin-dashboard/locations":      "Campus Locations",
  "/admin-dashboard/accessibility":  "Accessibility",
  "/admin-dashboard/events":         "Event Maps",
};

export function AdminLayout() {
  const { theme, toggleTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 767.98px)").matches
  );
  const [bellOpen, setBellOpen] = useState(false);
  const bellOpenRef = useRef(bellOpen);
  bellOpenRef.current = bellOpen;
  const [logs, setLogs] = useState<ActivityLogRow[]>([]);
  const [activityContexts, setActivityContexts] = useState<Map<string, ActivityPresentationContext>>(new Map());
  const [activityFeedLoading, setActivityFeedLoading] = useState(true);
  const [activityFeedError, setActivityFeedError] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();
  const { loading, isAdmin, profile } = useAdminAuth();
  const submissions = useAdminEventSubmissions(profile?.id, isAdmin && !loading);
  const submissionUnread = submissions.eventsEnabled ? submissions.unreadCount : 0;
  const notificationUnread = unread + submissionUnread;

  const loadActivityNotifications = useCallback(async () => {
    if (loading || !isAdmin) return;
    setActivityFeedLoading(true);
    setActivityFeedError(null);
    try {
      const [allRows, preferences] = await Promise.all([
        activityLogService.listVisibleActivityLogs({ limit: 40 }),
        adminNotificationPreferencesService.get(),
      ]);
      // Pending submissions have their own actionable feed. Draft/autosave audit
      // records remain in Activity Logs without crowding the notification bell.
      const eligibleRows = allRows.filter((row) => adminNotificationPreferencesService.isEnabled(row, preferences) && !['event_overlay.submit', 'event_overlay.create', 'event_overlay.update_layout', 'event_overlay.update_details'].includes(row.action));
      const rows = eligibleRows.slice(0, 6);
      const contextMap = await activityLogService.resolveActivityPresentationContexts(rows);
      setLogs(rows);
      setActivityContexts(contextMap);
      setUnread(bellOpenRef.current ? 0 : notificationService.countUnseenLogs(eligibleRows, profile?.id));
    } catch (error) {
      setActivityFeedError(activityLogErrorMessage(error));
    } finally {
      setActivityFeedLoading(false);
    }
  }, [isAdmin, loading, profile?.id]);

  useEffect(() => {
    if (loading || !isAdmin) return;
    void loadActivityNotifications();
    const onActivityCleared = () => void loadActivityNotifications();
    const onPreferencesUpdated = () => void loadActivityNotifications();
    const onStorage = (event: StorageEvent) => {
      if (event.key === "plv-admin-activity-clear-sync") void loadActivityNotifications();
    };
    window.addEventListener("plv-admin-activity-cleared", onActivityCleared);
    window.addEventListener("plv-admin-notification-preferences-updated", onPreferencesUpdated);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("plv-admin-activity-cleared", onActivityCleared);
      window.removeEventListener("plv-admin-notification-preferences-updated", onPreferencesUpdated);
      window.removeEventListener("storage", onStorage);
    };
  }, [isAdmin, loadActivityNotifications, loading]);

  useEffect(() => {
    if (bellOpen) {
      notificationService.markLogsSeen(profile?.id);
      setUnread(0);
      void loadActivityNotifications();
    }
  }, [bellOpen, loadActivityNotifications, profile?.id]);

  // Keep the mobile drawer closed when navigating between pages.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  // Track viewport changes so the hamburger opens a drawer on mobile.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767.98px)");
    const handle = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handle);
    return () => mq.removeEventListener("change", handle);
  }, []);

  useEffect(() => {
    if (loading) return;
    // Unauthenticated users AND non-admin accounts are sent to the login page.
    if (!isAdmin) {
      const from = `${location.pathname}${location.search}${location.hash}`;
      navigate("/admin", { replace: true, state: { from } });
    }
  }, [loading, isAdmin, navigate, location.pathname, location.search, location.hash]);

  // Show a loader while the session/profile is being checked, and keep showing
  // it for the brief moment after the redirect above is triggered.
  // Keep an already-authorized layout mounted while Supabase revalidates a
  // session in the background (most noticeable when returning to a tab). A
  // transient auth check must not unmount the Map Builder and discard its
  // in-memory draft; the hook still clears `profile` on an authoritative
  // sign-out or role change, which sends the user through the gate below.
  if (loading && !profile) return <AuthGateLoader />;
  if (!isAdmin) return <AuthGateLoader />;

  const pageTitle = ROUTE_LABELS[location.pathname]
    ?? (location.pathname.startsWith("/admin-dashboard/event-layouts/") ? "Event Layout Preview" : "Admin");

  return (
    <UnsavedChangesProvider>
    <div className="flex h-screen overflow-hidden bg-background">
      <NavigationProgress />

      {/* Desktop: inline collapsible sidebar */}
      <div className="hidden md:block h-full">
        <AdminSidebar collapsed={collapsed} />
      </div>

      {/* Mobile: overlay drawer */}
      <AnimatePresence>
        {mobileNavOpen && (
          <>
            <motion.div
              key="mobile-nav-overlay"
              className="fixed inset-0 z-40 bg-black/50 md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileNavOpen(false)}
            />
            <motion.div
              key="mobile-nav-drawer"
              className="fixed inset-y-0 left-0 z-50 md:hidden"
              initial={{ x: -260 }}
              animate={{ x: 0 }}
              exit={{ x: -260 }}
              transition={{ type: "spring", stiffness: 350, damping: 32 }}
            >
              <AdminSidebar collapsed={false} onNavigate={() => setMobileNavOpen(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top bar */}
        <header className="h-16 border-b border-border bg-card flex items-center px-4 gap-3 shrink-0 shadow-sm">
          <button
            onClick={() => (isMobile ? setMobileNavOpen(true) : setCollapsed(!collapsed))}
            className="inline-flex items-center justify-center w-9 h-9 rounded-xl border border-border text-muted-foreground hover:bg-muted active:scale-90 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={isMobile ? "Open navigation menu" : collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isMobile ? <Menu className="h-4 w-4" /> : collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>

          {/* Breadcrumb */}
          <div className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
            <span className="min-w-0 truncate font-semibold text-foreground">{pageTitle}</span>
          </div>

          <div className="flex-1" />

          <ThemeToggle theme={theme} onToggle={toggleTheme} />

          {/* Notification bell — real activity-log feed */}
          <div className="relative">
            <button
              onClick={() => setBellOpen((v) => !v)}
              aria-expanded={bellOpen}
              aria-haspopup="true"
              aria-label="Notifications"
              className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-border text-muted-foreground hover:bg-muted active:scale-90 transition-all"
            >
              <Bell className="h-4 w-4" />
              {notificationUnread > 0 && (
                <span data-testid="admin-notification-unread" className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-[10px] font-extrabold flex items-center justify-center border border-card">
                  {notificationUnread > 99 ? "99+" : notificationUnread}
                </span>
              )}
            </button>

            <AnimatePresence>
              {bellOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -5 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -5 }}
                  transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                  aria-label="Admin notifications"
                  className="absolute right-0 top-full mt-2 w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-border bg-card shadow-xl overflow-hidden max-md:fixed max-md:left-3 max-md:right-3 max-md:top-[4.5rem] max-md:mt-0 max-md:w-auto"
                  style={{ zIndex: 60, transformOrigin: "top right" }}
                >
                  <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                    <Bell className="h-3.5 w-3.5 text-primary" />
                    <p className="text-sm font-extrabold text-foreground flex-1">Notifications</p>
                    {notificationUnread > 0 && (
                      <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300">{notificationUnread} unread</span>
                    )}
                  </div>
                  <div className="max-h-[min(28rem,70dvh)] overflow-y-auto overscroll-contain">
                    {submissions.eventsEnabled && <div className="border-b border-border">
                      <div className="px-4 pt-3 pb-2"><p className="text-xs font-bold">Event submissions <span className="font-normal text-muted-foreground">· {submissions.pendingCount} pending</span></p><p className="mt-1 text-[11px] text-muted-foreground">Open a submission to mark its update as read.</p></div>
                      {submissions.events.slice(0, 6).map(event => {
                        const isUnread = submissions.unreadIds.has(event.id);
                        const count = normalizeEventOverlayLocations(event).length;
                        return <AdminNotificationAction key={event.id} to={`/admin-dashboard/event-layouts?review=${encodeURIComponent(event.id)}`} ariaLabel={`Review ${event.title}`} onNavigate={() => setBellOpen(false)} className="flex min-h-11 w-full gap-3 px-4 py-3 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary">
                          <span className="relative mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><History className="h-4 w-4" />{isUnread && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-600 ring-2 ring-card" />}</span>
                          <span className="min-w-0 flex-1"><span className="block break-words text-xs font-bold">{event.title}</span><span className="mt-1 block break-words text-xs text-muted-foreground">{event.organizer || 'Student organization'} · {count} map{count === 1 ? '' : 's'}</span><span className="mt-1 block text-[11px] text-muted-foreground">{submissionUpdateLabel(event)} · {formatEventSubmissionTime(event.lastEditedAt && Date.parse(event.lastEditedAt) > Date.parse(event.submittedAt ?? '') ? event.lastEditedAt : event.submittedAt)}</span><span className="mt-2 block text-xs font-bold text-primary">Review submission <span aria-hidden="true">→</span></span></span>
                        </AdminNotificationAction>;
                      })}
                      {submissions.loading && <p role="status" className="px-4 pb-3 text-xs text-muted-foreground">Loading submissions…</p>}
                      {submissions.error && <div className="px-4 pb-3"><p role="alert" className="text-xs text-destructive">{submissions.error}</p><button type="button" onClick={() => void submissions.refresh()} className="mt-1 min-h-11 text-xs font-bold text-primary">Retry submissions</button></div>}
                      {submissions.receiptError && <div className="px-4 pb-3"><p role="status" className="text-xs text-muted-foreground">{submissions.receiptError}</p><button type="button" onClick={()=>void submissions.refresh()} className="mt-1 min-h-11 text-xs font-bold text-primary">Retry read sync</button></div>}
                      {!submissions.loading && !submissions.error && submissions.pendingCount === 0 && <p className="px-4 pb-3 text-xs text-muted-foreground">No submissions waiting for review.</p>}
                      {submissions.pendingCount > 0 && <AdminNotificationAction to="/admin-dashboard/event-layouts" onNavigate={() => setBellOpen(false)} className="flex min-h-11 w-full items-center justify-center border-t border-border text-xs font-bold text-primary hover:bg-muted">View all {submissions.pendingCount} pending submissions</AdminNotificationAction>}
                    </div>}
                    <div className="divide-y divide-border">
                    {logs.length > 0 ? (
                      logs.map((l) => (
                        <div key={l.id} className="flex items-center gap-2.5 px-4 py-2.5">
                          <div className="w-6 h-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                            <History className="h-3 w-3" />
                          </div>
                          <div className="flex-1 min-w-0">
                            {(() => {
                              const formatted = formatAdminActivity(l, activityContexts.get(l.id));
                              return (
                                <>
                                  <p className="truncate text-[11px] font-bold text-foreground">{formatted.title}</p>
                                  <p className="truncate text-[10px] text-muted-foreground">{formatted.notificationText}</p>
                                  <p className="truncate text-[9px] text-muted-foreground/80">{formatted.category} · {formatted.actorLabel}</p>
                                </>
                              );
                            })()}
                          </div>
                          <span className="shrink-0 text-[9px] text-muted-foreground">{formatAdminActivity(l, activityContexts.get(l.id)).relativeTime}</span>
                        </div>
                      ))
                    ) : activityFeedLoading ? (
                      <p className="px-4 py-6 text-center text-xs text-muted-foreground">Loading activity…</p>
                    ) : activityFeedError ? (
                      <div className="space-y-2 px-4 py-5 text-center">
                        <p role="alert" className="text-xs font-semibold text-muted-foreground">Couldn’t load activity.</p>
                        <button onClick={() => void loadActivityNotifications()} className="text-[11px] font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Try again</button>
                      </div>
                    ) : (
                      <p className="px-4 py-6 text-center text-xs text-muted-foreground">No activity yet.</p>
                    )}
                    </div>
                  </div>
                  <AdminNotificationAction
                    to="/admin-dashboard/activity-logs"
                    onNavigate={() => setBellOpen(false)}
                    className="flex min-h-11 w-full items-center justify-center gap-1.5 px-4 py-2.5 border-t border-border text-[11px] font-bold text-primary hover:bg-muted transition-colors"
                  >
                    <CheckCheck className="h-3 w-3" /> View all activity logs
                  </AdminNotificationAction>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* User */}
          <div className="flex items-center gap-2.5 pl-2 border-l border-border" role="status" aria-label="Current user">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-sm">
              <User className="h-4 w-4 text-primary-foreground" />
            </div>
            <div className="hidden sm:block">
              <p className="text-xs font-bold text-foreground leading-none">
                {profile
                  ? [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.email
                  : "Administrator"}
              </p>
              <p className="text-[10px] text-muted-foreground">{isSuperAdminRole(profile?.role ?? "") ? "Super Administrator" : "Administrator"} · PLV NaviSync</p>
            </div>
          </div>
        </header>

        <main className={cn(
          "flex-1 min-h-0",           // min-h-0 allows flex child to shrink below content size
          location.pathname === "/admin-dashboard/map-builder"
            ? "overflow-hidden flex flex-col"   // map builder fills all remaining height, no padding
            : "overflow-y-auto p-5 lg:p-7"
        )}>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.1 }}
            className="h-full flex flex-col"
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
    </UnsavedChangesProvider>
  );
}

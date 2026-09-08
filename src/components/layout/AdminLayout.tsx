import { Outlet, useNavigate, useLocation } from "react-router";
import { useState, useEffect } from "react";
import { NavigationProgress } from "../ui/NavigationProgress";
import { UnsavedChangesProvider } from "../map-builder/UnsavedChangesContext";
import { AdminSidebar } from "./AdminSidebar";
import { ThemeToggle } from "../ui/ThemeToggle";
import { useTheme } from "../../hooks/useTheme";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { cn } from "../../lib/utils";
import { PanelLeftClose, PanelLeft, Menu, Bell, User, History, CheckCheck } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  activityLogService,
  type ActivityLogRow,
} from "../../services/activityLogService";
import { notificationService } from "../../lib/notificationService";
import { Link } from "react-router";

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
  const [logs, setLogs] = useState<ActivityLogRow[]>([]);
  const [unread, setUnread] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();
  const { loading, isAdmin, profile } = useAdminAuth();

  // Load the latest activity logs once the session is confirmed and refresh
  // whenever the bell is reopened.
  useEffect(() => {
    if (loading || !isAdmin) return;
    let mounted = true;
    const loadLogs = async () => {
      try {
        const rows = await activityLogService.listActivityLogs({ limit: 6 });
        if (!mounted) return;
        setLogs(rows);
        setUnread(notificationService.countUnseenLogs(rows));
      } catch {
        // Bell stays empty when logs are unavailable.
      }
    };
    loadLogs();
    return () => {
      mounted = false;
    };
  }, [loading, isAdmin]);

  useEffect(() => {
    if (bellOpen) {
      notificationService.markLogsSeen();
      setUnread(0);
    }
  }, [bellOpen]);

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
    if (!isAdmin) navigate("/admin", { replace: true });
  }, [loading, isAdmin, navigate]);

  // Show a loader while the session/profile is being checked, and keep showing
  // it for the brief moment after the redirect above is triggered.
  // Keep an already-authorized layout mounted while Supabase revalidates a
  // session in the background (most noticeable when returning to a tab). A
  // transient auth check must not unmount the Map Builder and discard its
  // in-memory draft; the hook still clears `profile` on an authoritative
  // sign-out or role change, which sends the user through the gate below.
  if (loading && !profile) return <AuthGateLoader />;
  if (!isAdmin) return <AuthGateLoader />;

  const pageTitle = ROUTE_LABELS[location.pathname] ?? "Admin";

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
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{pageTitle}</span>
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
              className="relative inline-flex items-center justify-center w-9 h-9 rounded-xl border border-border text-muted-foreground hover:bg-muted active:scale-90 transition-all"
            >
              <Bell className="h-4 w-4" />
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-accent text-accent-foreground text-[9px] font-extrabold flex items-center justify-center border border-card">
                  {unread > 9 ? "9+" : unread}
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
                  className="absolute right-0 top-full mt-2 w-72 rounded-2xl border border-border bg-card shadow-xl overflow-hidden"
                  style={{ zIndex: 60, transformOrigin: "top right" }}
                >
                  <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                    <Bell className="h-3.5 w-3.5 text-primary" />
                    <p className="text-xs font-extrabold text-foreground flex-1">Activity</p>
                    {unread > 0 && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-accent text-accent-foreground">{unread} new</span>
                    )}
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-border">
                    {logs.length > 0 ? (
                      logs.map((l) => (
                        <div key={l.id} className="flex items-center gap-2.5 px-4 py-2.5">
                          <div className="w-6 h-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                            <History className="h-3 w-3" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-bold text-foreground truncate">{activityLogService.readableActionLabel(l.action)}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{l.entity_type ?? "system"}</p>
                          </div>
                          <span className="text-[9px] text-muted-foreground font-mono shrink-0">{activityLogService.timeAgoLabel(l.created_at)}</span>
                        </div>
                      ))
                    ) : (
                      <p className="px-4 py-6 text-center text-xs text-muted-foreground">No activity yet.</p>
                    )}
                  </div>
                  <Link
                    to="/admin-dashboard/activity-logs"
                    onClick={() => setBellOpen(false)}
                    className="flex items-center justify-center gap-1.5 px-4 py-2.5 border-t border-border text-[11px] font-bold text-primary hover:bg-muted transition-colors"
                  >
                    <CheckCheck className="h-3 w-3" /> View all activity logs
                  </Link>
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
              <p className="text-[10px] text-muted-foreground">Administrator · PLV NaviSync</p>
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

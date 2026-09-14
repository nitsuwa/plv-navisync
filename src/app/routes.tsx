import { createBrowserRouter, Link } from "react-router";
import { lazy, Suspense, type ComponentType } from "react";
import { PublicLayout }  from "../components/layout/PublicLayout";
import { AdminLayout }   from "../components/layout/AdminLayout";
import { isDynamicImportError, RouteErrorElement } from "../components/ui/ErrorBoundary";

type LazyPageModule = { default: ComponentType<any> };

const LAZY_IMPORT_RELOAD_KEY = "plv-navisync:lazy-import-reload";

function clearLazyImportReloadFlag(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(LAZY_IMPORT_RELOAD_KEY);
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
}

function reloadOnceAfterLazyImportFailure(): boolean {
  // Vitest intentionally leaves the error available to the test router rather
  // than trying to reload the jsdom document.
  if (typeof window === "undefined" || import.meta.env.MODE === "test") return false;

  try {
    if (window.sessionStorage.getItem(LAZY_IMPORT_RELOAD_KEY) === "1") return false;
    window.sessionStorage.setItem(LAZY_IMPORT_RELOAD_KEY, "1");
    window.location.reload();
    return true;
  } catch {
    // If storage or reload is unavailable, let the route error element render.
    return false;
  }
}

/**
 * Retry a failed page import once. Transient dev-server/network failures can
 * recover without interrupting the user; persistent failures are handed to
 * the route error element, whose reload action can recover stale deployments.
 */
export function lazyPage(load: () => Promise<LazyPageModule>) {
  return lazy(async () => {
    try {
      const page = await load();
      clearLazyImportReloadFlag();
      return page;
    } catch (error) {
      if (!isDynamicImportError(error)) throw error;

      // A browser may cache a failed module record, so retry the request once
      // and then refresh the document once to obtain a fresh module graph.
      try {
        const page = await load();
        clearLazyImportReloadFlag();
        return page;
      } catch (retryError) {
        reloadOnceAfterLazyImportFailure();
        throw retryError;
      }
    }
  });
}

// ── Lazy-loaded pages for code splitting ──────────────────────────────────
// Note: All page imports use named exports, so we wrap them to convert to default exports
const LandingPage          = lazyPage(() => import("../pages/LandingPage").then(m => ({ default: m.LandingPage })));
const CampusMapPage        = lazyPage(() => import("../pages/CampusMapPage").then(m => ({ default: m.CampusMapPage })));
const BuildingsPage        = lazyPage(() => import("../pages/BuildingsPage").then(m => ({ default: m.BuildingsPage })));
const BuildingDetailsPage  = lazyPage(() => import("../pages/BuildingDetailsPage").then(m => ({ default: m.BuildingDetailsPage })));
const HelpCenterPage       = lazyPage(() => import("../pages/HelpCenterPage").then(m => ({ default: m.HelpCenterPage })));
const AnnouncementsPage    = lazyPage(() => import("../pages/AnnouncementsPage").then(m => ({ default: m.AnnouncementsPage })));
const AdminLoginPage       = lazyPage(() => import("../pages/AdminLoginPage").then(m => ({ default: m.AdminLoginPage })));
const AdminDashboardPage   = lazyPage(() => import("../pages/AdminDashboardPage").then(m => ({ default: m.AdminDashboardPage })));
const AdminBuildingsPage   = lazyPage(() => import("../pages/AdminBuildingsPage").then(m => ({ default: m.AdminBuildingsPage })));
const AdminLocationsPage   = lazyPage(() => import("../pages/AdminLocationsPage").then(m => ({ default: m.AdminLocationsPage })));
const AdminUsersPage       = lazyPage(() => import("../pages/AdminUsersPage").then(m => ({ default: m.AdminUsersPage })));
const AdminSettingsPage    = lazyPage(() => import("../pages/AdminSettingsPage").then(m => ({ default: m.AdminSettingsPage })));
const RegistrationPage     = lazyPage(() => import("../pages/RegistrationPage").then(m => ({ default: m.RegistrationPage })));
const AdminMapBuilderPage  = lazyPage(() => import("../pages/AdminMapBuilderPage").then(m => ({ default: m.AdminMapBuilderPage })));
const AdminFloorPlansPage  = lazyPage(() => import("../pages/AdminFloorPlansPage").then(m => ({ default: m.AdminFloorPlansPage })));
const AdminRoutesPage      = lazyPage(() => import("../pages/AdminRoutesPage").then(m => ({ default: m.AdminRoutesPage })));
const AdminReportsPage     = lazyPage(() => import("../pages/AdminReportsPage").then(m => ({ default: m.AdminReportsPage })));
const AdminAccessibilityPage = lazyPage(() => import("../pages/AdminAccessibilityPage").then(m => ({ default: m.AdminAccessibilityPage })));
const AdminEventsPage      = lazyPage(() => import("../pages/AdminEventsPage").then(m => ({ default: m.AdminEventsPage })));
const AdminAnnouncementsPage = lazyPage(() => import("../pages/AdminAnnouncementsPage").then(m => ({ default: m.AdminAnnouncementsPage })));
const AdminActivityLogsPage = lazyPage(() => import("../pages/AdminActivityLogsPage").then(m => ({ default: m.AdminActivityLogsPage })));
const StudentProfilePage   = lazyPage(() => import("../pages/StudentProfilePage").then(m => ({ default: m.StudentProfilePage })));
const StudentFavoritesPage = lazyPage(() => import("../pages/StudentFavoritesPage").then(m => ({ default: m.StudentFavoritesPage })));
const StudentReportsPage   = lazyPage(() => import("../pages/StudentReportsPage").then(m => ({ default: m.StudentReportsPage })));
const StudentSettingsPage  = lazyPage(() => import("../pages/StudentSettingsPage").then(m => ({ default: m.StudentSettingsPage })));
const StudentMyDayPage     = lazyPage(() => import("../pages/StudentMyDayPage").then(m => ({ default: m.StudentMyDayPage })));
const StudentHomePage      = lazyPage(() => import("../pages/StudentHomePage").then(m => ({ default: m.StudentHomePage })));
const VerificationPendingPage = lazyPage(() => import("../pages/AuthLifecyclePages").then(m => ({ default: m.VerificationPendingPage })));
const AuthCallbackPage     = lazyPage(() => import("../pages/AuthLifecyclePages").then(m => ({ default: m.AuthCallbackPage })));
const ForgotPasswordPage   = lazyPage(() => import("../pages/AuthLifecyclePages").then(m => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage    = lazyPage(() => import("../pages/AuthLifecyclePages").then(m => ({ default: m.ResetPasswordPage })));

// ── Suspense fallback — branded shimmer skeleton ─────────────────────────
function PageLoading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <div className="w-full max-w-3xl space-y-6">
        {/* Header skeleton */}
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2 flex-1">
            <div className="h-7 w-48 rounded-xl bg-muted/60 animate-pulse" />
            <div className="h-4 w-64 rounded-lg bg-muted/40 animate-pulse" />
          </div>
          <div className="h-9 w-28 rounded-xl bg-muted/60 animate-pulse shrink-0" />
        </div>

        {/* Content blocks */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="h-32 rounded-2xl bg-muted/50 animate-pulse" />
            <div className="h-24 rounded-2xl bg-muted/40 animate-pulse" />
          </div>
          <div className="space-y-3">
            <div className="h-24 rounded-2xl bg-muted/40 animate-pulse" />
            <div className="h-32 rounded-2xl bg-muted/50 animate-pulse" />
          </div>
        </div>

        <div className="h-12 rounded-2xl bg-muted/30 animate-pulse" />
      </div>
    </div>
  );
}

function SuspensePage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoading />}>{children}</Suspense>;
}

const routeErrorElement = <RouteErrorElement />;

function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 text-center animate-fade-in">
      {/* 404 decorative background */}
      <div className="relative mb-6">
        <div className="text-[8rem] font-extrabold text-primary/[0.06] tracking-tighter leading-none select-none">
          404
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20 shadow-sm">
            <span className="text-3xl font-extrabold text-primary/60">?</span>
          </div>
        </div>
      </div>

      <h2 className="text-2xl font-extrabold text-foreground mb-2">Page Not Found</h2>
      <p className="text-sm text-muted-foreground max-w-sm mb-8 leading-relaxed">
        The page you are looking for doesn't exist or has been moved.
        Check the URL or use one of the links below to find what you need.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 active:scale-[0.97] transition-all shadow-sm"
        >
          Go Home
        </Link>
        <Link
          to="/map"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border text-sm font-bold text-foreground hover:bg-muted active:scale-[0.97] transition-all"
        >
          Open Campus Map
        </Link>
        <Link
          to="/help"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border text-sm font-bold text-foreground hover:bg-muted active:scale-[0.97] transition-all"
        >
          Help Center
        </Link>
      </div>

      {/* Quick links */}
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
        <Link to="/buildings" className="hover:text-foreground transition-colors">Browse Buildings</Link>
        <Link to="/my-day" className="hover:text-foreground transition-colors">My Day</Link>
        <Link to="/admin" className="hover:text-foreground transition-colors">Admin Login</Link>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════

export const router = createBrowserRouter([
  // ── Public pages
  {
    path: "/",
    element: <PublicLayout />,
    errorElement: routeErrorElement,
    children: [
      { index: true, element: <SuspensePage><LandingPage /></SuspensePage> },
      { path: "map", element: <SuspensePage><CampusMapPage /></SuspensePage> },
      { path: "buildings", element: <SuspensePage><BuildingsPage /></SuspensePage> },
      { path: "buildings/:id", element: <SuspensePage><BuildingDetailsPage /></SuspensePage> },
      { path: "help", element: <SuspensePage><HelpCenterPage /></SuspensePage> },
      { path: "announcements", element: <SuspensePage><AnnouncementsPage /></SuspensePage> },

      // Student portal
      { path: "home", element: <SuspensePage><StudentHomePage /></SuspensePage> },
      { path: "my-day", element: <SuspensePage><StudentMyDayPage /></SuspensePage> },
      { path: "student", element: <SuspensePage><StudentProfilePage /></SuspensePage> },
      { path: "student/favorites", element: <SuspensePage><StudentFavoritesPage /></SuspensePage> },
      { path: "student/reports", element: <SuspensePage><StudentReportsPage /></SuspensePage> },
      { path: "student/settings", element: <SuspensePage><StudentSettingsPage /></SuspensePage> },

      { path: "*", element: <NotFound /> },
    ],
  },

  // ── Auth pages (standalone)
  { path: "/admin", element: <SuspensePage><AdminLoginPage /></SuspensePage>, errorElement: routeErrorElement },
  { path: "/register", element: <SuspensePage><RegistrationPage /></SuspensePage>, errorElement: routeErrorElement },
  { path: "/auth/verify", element: <SuspensePage><VerificationPendingPage /></SuspensePage>, errorElement: routeErrorElement },
  { path: "/auth/callback", element: <SuspensePage><AuthCallbackPage /></SuspensePage>, errorElement: routeErrorElement },
  { path: "/auth/forgot-password", element: <SuspensePage><ForgotPasswordPage /></SuspensePage>, errorElement: routeErrorElement },
  { path: "/auth/reset-password", element: <SuspensePage><ResetPasswordPage /></SuspensePage>, errorElement: routeErrorElement },

  // ── Admin portal (protected by AdminLayout's auth check)
  {
    path: "/admin-dashboard",
    element: <AdminLayout />,
    errorElement: routeErrorElement,
    children: [
      { index: true, element: <SuspensePage><AdminDashboardPage /></SuspensePage> },
      { path: "buildings", element: <SuspensePage><AdminBuildingsPage /></SuspensePage> },
      { path: "locations", element: <SuspensePage><AdminLocationsPage /></SuspensePage> },
      { path: "users", element: <SuspensePage><AdminUsersPage /></SuspensePage> },
      { path: "settings", element: <SuspensePage><AdminSettingsPage /></SuspensePage> },
      { path: "map-builder", element: <SuspensePage><AdminMapBuilderPage /></SuspensePage> },
      { path: "floor-plans", element: <SuspensePage><AdminFloorPlansPage /></SuspensePage> },
      { path: "routes", element: <SuspensePage><AdminRoutesPage /></SuspensePage> },
      { path: "reports", element: <SuspensePage><AdminReportsPage /></SuspensePage> },
      { path: "accessibility", element: <SuspensePage><AdminAccessibilityPage /></SuspensePage> },
      { path: "events", element: <SuspensePage><AdminEventsPage /></SuspensePage> },
      { path: "announcements", element: <SuspensePage><AdminAnnouncementsPage /></SuspensePage> },
      { path: "activity-logs", element: <SuspensePage><AdminActivityLogsPage /></SuspensePage> },
    ],
  },
]);

import { createBrowserRouter } from "react-router";
import { PublicLayout }  from "../components/layout/PublicLayout";
import { AdminLayout }   from "../components/layout/AdminLayout";
import { LandingPage }          from "../pages/LandingPage";
import { CampusMapPage }        from "../pages/CampusMapPage";
import { BuildingsPage }        from "../pages/BuildingsPage";
import { BuildingDetailsPage }  from "../pages/BuildingDetailsPage";
import { AnnouncementsPage }    from "../pages/AnnouncementsPage";
import { HelpCenterPage }       from "../pages/HelpCenterPage";
import { AdminLoginPage }       from "../pages/AdminLoginPage";
import { AdminDashboardPage }   from "../pages/AdminDashboardPage";
import { AdminBuildingsPage }   from "../pages/AdminBuildingsPage";
import { AdminAnnouncementsPage } from "../pages/AdminAnnouncementsPage";
import { AdminLocationsPage }   from "../pages/AdminLocationsPage";
import { AdminUsersPage }       from "../pages/AdminUsersPage";
import { AdminSettingsPage }    from "../pages/AdminSettingsPage";
import { RegistrationPage }     from "../pages/RegistrationPage";
import { AdminMapBuilderPage }    from "../pages/AdminMapBuilderPage";
import { AdminFloorPlansPage }    from "../pages/AdminFloorPlansPage";
import { AdminRoutesPage }        from "../pages/AdminRoutesPage";
import { AdminReportsPage }       from "../pages/AdminReportsPage";
import { AdminAccessibilityPage } from "../pages/AdminAccessibilityPage";
import { AdminEventsPage }        from "../pages/AdminEventsPage";
import { StudentProfilePage }     from "../pages/StudentProfilePage";
import { StudentFavoritesPage }   from "../pages/StudentFavoritesPage";
import { StudentReportsPage }     from "../pages/StudentReportsPage";
import { StudentSettingsPage }    from "../pages/StudentSettingsPage";

function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="text-7xl font-extrabold text-primary/15 tracking-tighter">404</div>
      <h2 className="text-2xl font-extrabold text-foreground">Page Not Found</h2>
      <p className="text-muted-foreground text-sm max-w-xs">
        The page you are looking for does not exist or has been moved.
      </p>
      <a href="/"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors shadow-sm">
        Go Home
      </a>
    </div>
  );
}

export const router = createBrowserRouter([
  // ── Public pages
  {
    path: "/",
    Component: PublicLayout,
    children: [
      { index: true,              Component: LandingPage },
      { path: "map",              Component: CampusMapPage },
      { path: "buildings",        Component: BuildingsPage },
      { path: "buildings/:id",    Component: BuildingDetailsPage },
      { path: "announcements",    Component: AnnouncementsPage },
      { path: "help",             Component: HelpCenterPage },

      // Student profile section
      { path: "student",           Component: StudentProfilePage   },
      { path: "student/favorites", Component: StudentFavoritesPage },
      { path: "student/reports",   Component: StudentReportsPage   },
      { path: "student/settings",  Component: StudentSettingsPage  },

      { path: "*", Component: NotFound },
    ],
  },

  // ── Auth pages (standalone, no AdminLayout)
  { path: "/admin",    Component: AdminLoginPage },
  { path: "/register", Component: RegistrationPage },

  // ── Admin portal (protected by AdminLayout's auth check)
  {
    path: "/admin",
    Component: AdminLayout,
    children: [
      { path: "dashboard",     Component: AdminDashboardPage },
      { path: "buildings",     Component: AdminBuildingsPage },
      { path: "announcements", Component: AdminAnnouncementsPage },
      { path: "locations",     Component: AdminLocationsPage },
      { path: "users",         Component: AdminUsersPage },
      { path: "settings",      Component: AdminSettingsPage },
      { path: "map-builder",   Component: AdminMapBuilderPage  },
      { path: "floor-plans",   Component: AdminFloorPlansPage  },
      { path: "routes",        Component: AdminRoutesPage       },
      { path: "reports",       Component: AdminReportsPage      },
      { path: "accessibility", Component: AdminAccessibilityPage},
      { path: "events",        Component: AdminEventsPage       },
    ],
  },
]);

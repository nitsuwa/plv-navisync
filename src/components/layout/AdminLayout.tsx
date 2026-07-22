import { Outlet, useNavigate, useLocation } from "react-router";
import { useState, useEffect } from "react";
import { NavigationProgress } from "../ui/NavigationProgress";
import { AdminSidebar } from "./AdminSidebar";
import { ThemeToggle } from "../ui/ThemeToggle";
import { useTheme } from "../../hooks/useTheme";
import { cn } from "../../lib/utils";
import { PanelLeftClose, PanelLeft, Bell, User } from "lucide-react";
import { motion } from "motion/react";

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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const auth = sessionStorage.getItem("plv-admin-auth");
    if (!auth) navigate("/admin");
    else setIsAuthenticated(true);
  }, [navigate]);

  if (!isAuthenticated) return null;

  const pageTitle = ROUTE_LABELS[location.pathname] ?? "Admin";

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <NavigationProgress />
      <AdminSidebar collapsed={collapsed} />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top bar */}
        <header className="h-16 border-b border-border bg-card flex items-center px-4 gap-3 shrink-0 shadow-sm">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="inline-flex items-center justify-center w-9 h-9 rounded-xl border border-border text-muted-foreground hover:bg-muted active:scale-90 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>

          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{pageTitle}</span>
          </div>

          <div className="flex-1" />

          <ThemeToggle theme={theme} onToggle={toggleTheme} />

          {/* Notification bell */}
          <button className="relative inline-flex items-center justify-center w-9 h-9 rounded-xl border border-border text-muted-foreground hover:bg-muted active:scale-90 transition-all" aria-label="Notifications">
            <Bell className="h-4 w-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-accent border border-card" />
          </button>

          {/* User */}
          <div className="flex items-center gap-2.5 pl-2 border-l border-border" role="status" aria-label="Current user">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-sm">
              <User className="h-4 w-4 text-primary-foreground" />
            </div>
            <div className="hidden sm:block">
              <p className="text-xs font-bold text-foreground leading-none">Administrator</p>
              <p className="text-[10px] text-muted-foreground">PLV NaviSync</p>
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
  );
}

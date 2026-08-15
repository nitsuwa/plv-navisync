import { Link, useLocation, useNavigate } from "react-router";
import { useUnsavedChangesContext } from "../map-builder/UnsavedChangesContext";
import {
  LayoutDashboard, LogOut, Settings, Map, Flag, Users, Megaphone, CalendarDays, History,
} from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "../../lib/utils";
import { reportService } from "../../services/reportService";
import { PLVLogo } from "../ui/PLVLogo";
import { supabase } from "../../lib/supabase";
import { motion, useReducedMotion } from "motion/react";
import { sidebarSpring } from "../../config/animation";

// Core admin navigation — focused on essential workflows.
// Buildings, Floor Plans, Routes, Locations, and Accessibility are managed
// inside the Map Builder workspace via its layer system; operational pages
// (Reports, Announcements, Events) are standalone routes.
const NAV_ITEMS = [
  { label: "Dashboard",     path: "/admin-dashboard",            icon: LayoutDashboard },
  { label: "Map Builder",   path: "/admin-dashboard/map-builder", icon: Map              },
  { label: "Reports",       path: "/admin-dashboard/reports",     icon: Flag             },
  { label: "Announcements", path: "/admin-dashboard/announcements", icon: Megaphone     },
  { label: "Events",        path: "/admin-dashboard/events",      icon: CalendarDays    },
  { label: "Users",         path: "/admin-dashboard/users",       icon: Users           },
  { label: "Activity Logs", path: "/admin-dashboard/activity-logs", icon: History       },
  { label: "Settings",      path: "/admin-dashboard/settings",    icon: Settings        },
];

interface AdminSidebarProps { collapsed?: boolean; }

function NavItem({ label, path, icon: Icon, active, collapsed, badge, onNavigate }: {
  label: string; path: string; icon: React.ElementType;
  active: boolean; collapsed: boolean; badge?: number;
  onNavigate: () => void;
}) {
  return (
    <Link
      to={path}
      onClick={(e) => {
        // Route every sidebar section change through the shared unsaved-changes
        // guard so leaving the map builder with a dirty draft prompts first.
        if (active) return; // already here — nothing to leave
        e.preventDefault();
        onNavigate();
      }}
      title={collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center rounded-xl text-sm font-semibold transition-all duration-150 relative active:scale-[0.97]",
        collapsed ? "justify-center w-10 h-10 mx-auto" : "gap-2.5 px-3 py-2.5",
        active
          ? "bg-white/18 text-white shadow-sm"
          : "text-sidebar-foreground/60 hover:bg-white/10 hover:text-sidebar-foreground/90"
      )}>
      {active && !collapsed && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-sidebar-primary" />
      )}
      <Icon className={cn("shrink-0", collapsed ? "h-5 w-5" : "h-4 w-4")}/>
      {!collapsed && (
        <>
          <span className="flex-1 truncate" style={{ fontFamily: "var(--font-body)" }}>{label}</span>
          {badge && badge > 0 && (
            <span className="flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-amber-500 text-white text-[10px] font-extrabold shrink-0">
              {badge}
            </span>
          )}
        </>
      )}
      {collapsed && badge && badge > 0 && (
        <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-500"/>
      )}
    </Link>
  );
}

export function AdminSidebar({ collapsed = false }: AdminSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { requestGuarded } = useUnsavedChangesContext();
  const shouldReduce = useReducedMotion();
  const [signingOut, setSigningOut] = useState(false);
  const [pendingReports, setPendingReports] = useState(0);

  // Real pending-report count for the Reports badge (0 = no badge shown).
  useEffect(() => {
    let cancelled = false;
    reportService
      .countPendingReports()
      .then((count) => { if (!cancelled) setPendingReports(count); })
      .catch(() => { if (!cancelled) setPendingReports(0); });
    return () => { cancelled = true; };
  }, []);

  const navItems = NAV_ITEMS.map((item) =>
    item.label === "Reports" && pendingReports > 0
      ? { ...item, badge: pendingReports }
      : item
  );

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  const handleSignOut = async () => {
    if (signingOut) return;
    // Signing out leaves the editor entirely — route through the shared guard
    // so a dirty draft prompts before the page unmounts.
    setSigningOut(true);
    try {
      await supabase?.auth.signOut();
    } finally {
      requestGuarded(() => navigate("/admin", { replace: true }));
    }
  };

  return (
    <motion.aside
      animate={shouldReduce ? undefined : { width: collapsed ? 64 : 224 }}
      transition={sidebarSpring()}
      className={cn(
        "flex flex-col h-full overflow-hidden",
        "bg-sidebar border-r border-sidebar-border",
        collapsed ? "w-16" : "w-56"
      )}>
      {/* Logo */}
      <div className={cn(
        "flex items-center h-16 border-b border-sidebar-border shrink-0",
        collapsed ? "justify-center px-2" : "gap-3 px-4"
      )}>
        <PLVLogo size={32} className="shrink-0"/>
        {!collapsed && (
          <div className="overflow-hidden min-w-0">
            <span className="font-extrabold text-sidebar-foreground text-sm block leading-none whitespace-nowrap truncate"
              style={{ fontFamily: "var(--font-sans)" }}>
              PLV NaviSync
            </span>
            <span className="text-[10px] font-bold text-sidebar-primary tracking-widest uppercase whitespace-nowrap">
              Admin Portal
            </span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2.5 py-4 flex flex-col gap-0.5 overflow-y-auto scrollbar-show-on-hover">
        {navItems.map(item => (
          <NavItem
            key={item.path}
            {...item}
            active={isActive(item.path)}
            collapsed={collapsed}
            onNavigate={() => requestGuarded(() => navigate(item.path))}
          />
        ))}
      </nav>

      {/* Sign out */}
      <div className="px-2.5 pb-5 border-t border-sidebar-border pt-3">
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          title={collapsed ? "Sign Out" : undefined}
          className={cn(
            "flex w-full items-center rounded-xl text-sm font-medium text-sidebar-foreground/40",
            "hover:text-white hover:bg-destructive/25 transition-all duration-150 active:scale-[0.97] disabled:opacity-50",
            collapsed ? "justify-center w-10 h-10 mx-auto" : "gap-2.5 px-3 py-2.5"
          )}>
          <LogOut className={cn("shrink-0", collapsed ? "h-5 w-5" : "h-4 w-4")}/>
          {!collapsed && <span style={{ fontFamily: "var(--font-body)" }}>Sign Out</span>}
        </button>
      </div>
    </motion.aside>
  );
}

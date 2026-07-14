import { Link, useLocation } from "react-router";
import {
  LayoutDashboard, LogOut, Settings, Map, Flag, Users,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { PLVLogo } from "../ui/PLVLogo";

// Per workflow doc: Dashboard · Map Builder · Reports · Users · Settings
const NAV_ITEMS = [
  { label: "Dashboard",   path: "/admin/dashboard",   icon: LayoutDashboard },
  { label: "Map Builder", path: "/admin/map-builder", icon: Map             },
  { label: "Reports",     path: "/admin/reports",     icon: Flag, badge: 2  },
  { label: "Users",       path: "/admin/users",       icon: Users           },
  { label: "Settings",    path: "/admin/settings",    icon: Settings        },
];

interface AdminSidebarProps { collapsed?: boolean; }

function NavItem({ label, path, icon: Icon, active, collapsed, badge }: {
  label: string; path: string; icon: React.ElementType;
  active: boolean; collapsed: boolean; badge?: number;
}) {
  return (
    <Link
      to={path}
      title={collapsed ? label : undefined}
      className={cn(
        "flex items-center rounded-xl text-sm font-medium transition-all duration-150 relative",
        collapsed ? "justify-center w-10 h-10 mx-auto" : "gap-3 px-3 py-2.5",
        active
          ? "bg-white/15 text-white shadow-sm"
          : "text-sidebar-foreground/60 hover:bg-white/8 hover:text-sidebar-foreground"
      )}>
      <Icon className={cn("shrink-0", collapsed ? "h-5 w-5" : "h-4 w-4")}/>
      {!collapsed && (
        <>
          <span className="flex-1" style={{ fontFamily: "var(--font-body)" }}>{label}</span>
          {badge && badge > 0 && (
            <span className="flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-amber-500 text-white text-[10px] font-extrabold shrink-0">
              {badge}
            </span>
          )}
          {active && !badge && <div className="w-1.5 h-1.5 rounded-full bg-sidebar-primary shrink-0"/>}
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

  const isActive = (path: string) => {
    // Map Builder also activates for sub-pages that live inside it
    if (path === "/admin/map-builder")
      return ["/admin/map-builder", "/admin/floor-plans", "/admin/routes", "/admin/events", "/admin/accessibility"].some(p => location.pathname === p);
    if (path === "/admin/settings")
      return ["/admin/settings", "/admin/announcements", "/admin/locations"].some(p => location.pathname === p);
    return location.pathname === path;
  };

  return (
    <aside className={cn(
      "flex flex-col h-full transition-all duration-300 ease-in-out",
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
            <span className="text-[9px] font-bold text-sidebar-primary tracking-widest uppercase whitespace-nowrap">
              Admin Portal
            </span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 flex flex-col gap-0.5 overflow-y-auto scrollbar-show-on-hover">
        {NAV_ITEMS.map(item => (
          <NavItem key={item.path} {...item} active={isActive(item.path)} collapsed={collapsed}/>
        ))}
      </nav>

      {/* Exit */}
      <div className="px-2 pb-4 border-t border-sidebar-border pt-3">
        <Link
          to="/"
          title={collapsed ? "Exit Admin" : undefined}
          className={cn(
            "flex items-center rounded-xl text-sm font-medium text-sidebar-foreground/40",
            "hover:text-white hover:bg-destructive/30 transition-all duration-150",
            collapsed ? "justify-center w-10 h-10 mx-auto" : "gap-3 px-3 py-2.5"
          )}>
          <LogOut className={cn("shrink-0", collapsed ? "h-5 w-5" : "h-4 w-4")}/>
          {!collapsed && <span style={{ fontFamily: "var(--font-body)" }}>Exit Admin</span>}
        </Link>
      </div>
    </aside>
  );
}

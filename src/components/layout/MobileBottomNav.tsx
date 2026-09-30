import { CalendarDays, Compass, Home, Map } from "lucide-react";
import { Link, useLocation } from "react-router";
import { useStudentAuth } from "../../hooks/useStudentAuth";
import { cn } from "../../lib/utils";

export function MobileBottomNav() {
  const { pathname } = useLocation();
  const { isStudent, isStudentOrg } = useStudentAuth();
  const links = isStudent
    ? [
        { label: "Home", path: "/home", icon: Home },
        { label: "Map", path: "/map", icon: Compass },
        ...(isStudentOrg ? [{ label: "Events", path: "/student/events", icon: CalendarDays }] : []),
      ]
    : [
        { label: "Home", path: "/", icon: Home },
        { label: "Map", path: "/map", icon: Map },
      ];

  return (
    <nav
      className="md:hidden fixed inset-x-0 bottom-0 z-50 border-t border-border/80 bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur-xl"
      aria-label="Mobile navigation"
      data-testid="mobile-bottom-navigation"
    >
      <div className={cn("mx-auto grid min-h-16 max-w-screen-sm gap-1 px-3", links.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
        {links.map(({ label, path, icon: Icon }) => {
          const active = path === "/"
            ? pathname === "/"
            : path === "/home"
              ? pathname === "/home"
              : pathname === path || pathname.startsWith(`${path}/`);
          return (
            <Link
              key={path}
              to={path}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-2 py-1 text-[11px] font-bold leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                active ? "text-primary" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
              )}
            >
              <Icon className="h-5 w-5 shrink-0" strokeWidth={active ? 2.5 : 2} aria-hidden="true" />
              <span className="max-w-full truncate">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

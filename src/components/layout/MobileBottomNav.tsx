import { CalendarDays, Compass, Home, Map, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { cn } from "../../lib/utils";
import { useStudentAuth } from "../../hooks/useStudentAuth";
import { MAP_SURFACE_EVENT, isFocusedMapSurface, type MapSurface } from "../../lib/mapSurface";

interface MobileNavTab {
  to: string;
  label: string;
  icon: typeof Home;
}

const GUEST_TABS: MobileNavTab[] = [
  { to: "/", label: "Home", icon: Home },
  { to: "/map", label: "Map", icon: Map },
];

function getStudentTabs(isStudentOrg: boolean): MobileNavTab[] {
  return [
    { to: "/home", label: "Home", icon: Home },
    { to: "/map", label: "Map", icon: Compass },
    ...(isStudentOrg ? [{ to: "/student/events", label: "My Events", icon: CalendarDays }] : []),
    { to: "/student", label: "Profile", icon: UserRound },
  ];
}

export function MobileBottomNav() {
  const { pathname } = useLocation();
  const { isStudent, isStudentOrg } = useStudentAuth();
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    const onLegacySheet = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      setSheetOpen(Boolean(detail?.open));
    };
    const onSurface = (event: Event) => {
      const detail = (event as CustomEvent<{ surface?: MapSurface; open?: boolean }>).detail;
      setSheetOpen(detail?.surface ? isFocusedMapSurface(detail.surface) : Boolean(detail?.open));
    };
    window.addEventListener("building-sheet-toggle", onLegacySheet);
    window.addEventListener(MAP_SURFACE_EVENT, onSurface);
    return () => {
      window.removeEventListener("building-sheet-toggle", onLegacySheet);
      window.removeEventListener(MAP_SURFACE_EVENT, onSurface);
    };
  }, []);

  const tabs = isStudent ? getStudentTabs(isStudentOrg) : GUEST_TABS;
  const isActive = (to: string) => to === "/" ? pathname === "/" : pathname.startsWith(to);

  if (sheetOpen) return null;

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 pointer-events-none"
      style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom, 12px))" }}
      aria-label="Main navigation"
    >
      <div className="px-3 pointer-events-auto">
        <div className="mobile-dock mx-auto max-w-md rounded-[24px] border border-border/30 bg-white/95 shadow-2xl backdrop-blur-xl dark:bg-card/95">
          <div className={cn(
            "grid items-center gap-1 px-1.5 py-1",
            tabs.length === 2 && "grid-cols-2",
            tabs.length === 3 && "grid-cols-3",
            tabs.length === 4 && "grid-cols-4",
          )}>
            {tabs.map(({ to, label, icon: Icon }) => {
              const active = isActive(to);
              const featured = to === "/map" && tabs.length === 3;
              return (
                <Link
                  key={to}
                  to={to}
                  aria-current={active ? "page" : undefined}
                  title={label}
                  className={cn(
                    "relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[10px] font-bold leading-none transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:scale-95",
                    featured && "-mt-5 min-h-[72px] rounded-[22px] border-2 shadow-[0_8px_30px_rgba(0,0,0,0.22)]",
                    active
                      ? featured
                        ? "border-primary/30 bg-primary text-primary-foreground shadow-primary/20"
                        : "bg-primary/10 text-primary"
                      : featured
                        ? "border-border/80 bg-card text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className={cn("h-5 w-5", featured && "h-6 w-6")} strokeWidth={featured ? 2.5 : 2.2} />
                  <span className="max-w-full truncate">{label}</span>
                  {active && !featured && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-primary" aria-hidden="true" />}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}

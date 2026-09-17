import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router";
import { Home, Compass, Menu } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "../../lib/utils";
import { useStudentAuth } from "../../hooks/useStudentAuth";
import { MoreSheet } from "../ui/MoreSheet";

const STUDENT_TABS = [
  { to: "/map", label: "Map" },
];

const GUEST_TABS = [
  { to: "/", label: "Home" },
  { to: "/map", label: "Map" },
];

export function MobileBottomNav() {
  const { pathname } = useLocation();
  const { isStudent } = useStudentAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    const onSheet = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setSheetOpen(Boolean(detail?.open));
    };
    window.addEventListener("building-sheet-toggle", onSheet);
    return () => window.removeEventListener("building-sheet-toggle", onSheet);
  }, []);

  const tabs = isStudent ? STUDENT_TABS : GUEST_TABS;

  const isActive = (to: string) =>
    to === "/" ? pathname === "/" : pathname.startsWith(to);

  const homeTab = isStudent ? undefined : tabs[0];
  const homeActive = homeTab ? isActive(homeTab.to) : false;
  const navActive = isStudent ? isActive("/map") : isActive("/map");

  if (sheetOpen) return null;

  return (
    <>
      <nav
        className={cn(
          "md:hidden fixed bottom-0 left-0 right-0 z-40 pointer-events-none transition-transform duration-300",
          "max-md:landscape:bottom-0"
        )}
        style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom, 12px))" }}
        aria-label="Main navigation"
      >
        <div className="px-3 pb-0.5 pointer-events-auto">
          <div className={cn(
            "mobile-dock rounded-[24px] shadow-2xl bg-white/95 dark:bg-card/95 backdrop-blur-xl border border-border/30",
            "max-w-sm mx-auto"
          )}>
            <div className="flex items-stretch justify-around items-end px-1 py-0.5 relative overflow-visible">
              {/* Active indicator pill */}
              {homeActive && (
                <motion.div
                  layoutId="mobile-nav-active"
                  className="absolute top-0.5 bottom-0.5 bg-primary/12 rounded-2xl"
                  style={{ width: "33%", left: "0%" }}
                  transition={{ type: "spring", stiffness: 450, damping: 30, mass: 0.8 }}
                />
              )}

              {/* Home is available to guests only. */}
              {homeTab ? (
                <Link
                  to={homeTab.to}
                  aria-current={homeActive ? "page" : undefined}
                  className="flex-1 flex flex-col items-center justify-center gap-0 relative min-h-[56px] group"
                >
                  <motion.div
                    whileTap={{ scale: 0.88 }}
                    transition={{ type: "spring", stiffness: 400, damping: 15 }}
                    className={cn(
                      "flex items-center justify-center rounded-xl transition-all duration-200",
                      homeActive
                        ? "w-[50px] h-9 bg-primary text-primary-foreground shadow-md shadow-primary/25"
                        : "w-10 h-9 text-muted-foreground"
                    )}
                  >
                    <Home className="h-5 w-5" />
                  </motion.div>
                  <motion.span
                    className={cn(
                      "text-[10px] font-bold leading-none tracking-tight",
                      homeActive ? "text-primary" : "text-muted-foreground/70"
                    )}
                    animate={{ scale: homeActive ? 1.05 : 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  >
                    {homeTab.label}
                  </motion.span>
                  {homeActive && (
                    <motion.div
                      layoutId="mobile-nav-dot"
                      className="absolute -bottom-0.5 w-1 h-1 rounded-full bg-primary"
                      transition={{ type: "spring", stiffness: 500, damping: 25 }}
                    />
                  )}
                </Link>
              ) : <div className="flex-1" aria-hidden="true" />}

              {/* Center - elevated Map button (always visible, not "selected") */}
              <div className="flex-1 flex flex-col items-center justify-end relative" style={{ marginTop: -36 }}>
                <motion.div
                  whileTap={{ scale: 0.92 }}
                  transition={{ type: "spring", stiffness: 400, damping: 15 }}
                >
                  <Link
                    to="/map"
                    className={cn(
                      "flex flex-col items-center justify-center gap-0.5 relative",
                      "w-[72px] h-[72px] rounded-[22px]",
                      "text-foreground",
                      "shadow-[0_8px_30px_rgba(0,0,0,0.25)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)]",
                      "border-2 border-border/80",
                      "active:scale-95 transition-all duration-200",
                      navActive 
                        ? "bg-primary text-primary-foreground border-primary/30 shadow-primary/20"
                        : "bg-card hover:bg-muted"
                    )}
                  >
                    <Compass className={cn("h-6 w-6", navActive ? "text-primary-foreground" : "text-primary")} strokeWidth={2.5} />
                    <span className={cn("text-[9px] font-extrabold leading-none tracking-tight", navActive ? "text-primary-foreground" : "text-foreground")}>
                      Map
                    </span>
                  </Link>
                </motion.div>
                {navActive && (
                  <motion.div
                    layoutId="mobile-nav-dot-center"
                    className="absolute -bottom-1 w-1 h-1 rounded-full bg-primary"
                    transition={{ type: "spring", stiffness: 500, damping: 25 }}
                  />
                )}
              </div>

              {/* More tab - opens bottom sheet */}
              <button
                onClick={() => setMoreOpen(true)}
                className="flex-1 flex flex-col items-center justify-center gap-0 relative min-h-[56px] group"
              >
                <motion.div
                  whileTap={{ scale: 0.88 }}
                  transition={{ type: "spring", stiffness: 400, damping: 15 }}
                  className="w-10 h-9 flex items-center justify-center rounded-xl text-muted-foreground"
                >
                  <Menu className="h-5 w-5" strokeWidth={2} />
                </motion.div>
                <span className="text-[10px] font-bold leading-none tracking-tight text-muted-foreground/70">
                  More
                </span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* More bottom sheet */}
      {isStudent && <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />}
    </>
  );
}

import { Link, useLocation } from "react-router";
import { Home, Map, HelpCircle, User, Compass, Building2 } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "../../lib/utils";
import { useStudentAuth } from "../../hooks/useStudentAuth";

const ALL_TABS = [
    { to: "/", icon: Home, label: "Home" },
    { to: "/map", icon: Compass, label: "Map" },
    { to: "/student", icon: User, label: "Profile", auth: true },
  ];

const STUDENT_TABS = [
    { to: "/map", icon: Compass, label: "Map", auth: false },
  ];

  const landscapeClasses = "max-md:landscape:px-6 max-md:landscape:pb-1 max-md:landscape:gap-0";
  const landscapeDock = "max-md:landscape:rounded-[20px] max-md:landscape:max-w-none max-md:landscape:mx-0 max-md:landscape:flex-row max-md:landscape:px-2 max-md:landscape:py-1";

export function MobileBottomNav() {
  const { pathname } = useLocation();
  const { loading: authLoading, isStudent } = useStudentAuth();

  const tabs = isStudent ? STUDENT_TABS : ALL_TABS;

  const isActive = (to: string) =>
    to === "/"
      ? pathname === "/"
      : to === "/student"
        ? pathname.startsWith("/student")
        : pathname.startsWith(to);

  const activeIndex = tabs.findIndex(t => isActive(t.to));

  return (
    <nav
      className={cn(
        "md:hidden fixed bottom-0 left-0 right-0 z-50 pointer-events-none",
        "max-md:landscape:bottom-0"
      )}
      style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom, 12px))" }}
      aria-label="Main navigation"
    >
      <div className={cn("px-3 pb-0.5 pointer-events-auto", landscapeClasses)}>
        <div className={cn(
          "mobile-dock rounded-[24px] overflow-hidden shadow-2xl bg-card/95 backdrop-blur-xl border border-border/50",
          "max-w-sm mx-auto",
          landscapeDock
        )}>
          <div className="flex items-stretch justify-around px-1 py-0.5 relative">
            {/* Active indicator — animated pill */}
            {activeIndex >= 0 && (
              <motion.div
                layoutId="mobile-nav-active"
                className="absolute top-0.5 bottom-0.5 bg-primary/12 rounded-2xl"
                style={{
                  width: `${100 / tabs.length}%`,
                  left: `${(activeIndex / tabs.length) * 100}%`,
                }}
                transition={{ type: "spring", stiffness: 450, damping: 30, mass: 0.8 }}
              />
            )}

            {tabs.map(({ to, icon: Icon, label, auth }) => {
              const active = isActive(to);
              const href = auth && !isStudent && !authLoading ? "/admin" : to;

              return (
                <Link
                  key={to}
                  to={href}
                  aria-current={active ? "page" : undefined}
                  className="flex-1 flex flex-col items-center justify-center gap-0 relative min-h-[56px] group"
                >
                  <motion.div
                    whileTap={{ scale: 0.88 }}
                    transition={{ type: "spring", stiffness: 400, damping: 15 }}
                    className={cn(                          "flex items-center justify-center rounded-xl transition-all duration-200",
                      active
                        ? "w-[50px] h-9 bg-primary text-primary-foreground shadow-md shadow-primary/25"
                        : "w-10 h-9 text-muted-foreground"
                    )}
                  >
                    <Icon
                      className="transition-all duration-200"
                      style={{ width: active ? 20 : 19, height: active ? 20 : 19 }}
                      strokeWidth={active ? 2.5 : 2}
                    />
                  </motion.div>
                  <motion.span
                    className={cn(
                      "text-[10px] font-bold leading-none tracking-tight",
                      active ? "text-primary" : "text-muted-foreground/70"
                    )}
                    animate={{
                      y: active ? 0 : 0,
                      scale: active ? 1.05 : 1,
                    }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  >
                    {label}
                  </motion.span>
                  {/* Active dot indicator */}
                  {active && (
                    <motion.div
                      layoutId="mobile-nav-dot"
                      className="absolute -bottom-0.5 w-1 h-1 rounded-full bg-primary"
                      transition={{ type: "spring", stiffness: 500, damping: 25 }}
                    />
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}

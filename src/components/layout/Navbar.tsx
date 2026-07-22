import { Link, useLocation, useNavigate } from "react-router";
import {
  Map, Home, HelpCircle, LogIn, LogOut, User, Bookmark, Flag, Settings,
  ChevronDown,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ThemeToggle } from "../ui/ThemeToggle";
import { useTheme } from "../../hooks/useTheme";
import { PLVLogo } from "../ui/PLVLogo";
import { useStudentAuth } from "../../hooks/useStudentAuth";
import { cn } from "../../lib/utils";

const NAV_LINKS = [
  { label: "Home", path: "/", icon: Home },
  { label: "Map", path: "/map", icon: Map },
  { label: "Help Center", path: "/help", icon: HelpCircle },
];

export function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [scrollY, setScrollY] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const studentAuth = useStudentAuth();

  const handleStudentLogout = () => {
    sessionStorage.removeItem("plv-student-auth");
    setDropdownOpen(false);
    navigate("/");
  };

  const isHome = location.pathname === "/";

  useEffect(() => {
    const handler = () => setScrollY(window.scrollY);
    handler();
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    setDropdownOpen(false);
  }, [location.pathname]);

  const fillProgress = Math.min(scrollY / 80, 1);
  const showWhiteText = isHome && theme === "dark" && fillProgress < 0.9;

  const isActive = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  const initials = studentAuth
    ? studentAuth.username.slice(0, 2).toUpperCase()
    : "";



  return (
    <nav
      className={cn("sticky top-0 z-40 w-full border-b", !isHome && "border-border bg-card/95 backdrop-blur-lg shadow-sm")}
      style={isHome ? {
        background: theme === "dark"
          ? `rgba(7,18,52,${0.68 + fillProgress * 0.28})`
          : `rgba(255,255,255,${0.78 + fillProgress * 0.18})`,
        backdropFilter: `blur(${10 + fillProgress * 8}px)`,
        WebkitBackdropFilter: `blur(${10 + fillProgress * 8}px)`,
        borderBottomColor: theme === "dark"
          ? `rgba(255,255,255,${0.10 + fillProgress * 0.08})`
          : `rgba(14,42,110,${0.08 + fillProgress * 0.10})`,
        boxShadow: `0 1px 8px rgba(0,0,0,${0.10 + fillProgress * 0.08})`,
      } : {
        transition: "background-color 250ms ease, border-color 250ms ease, box-shadow 250ms ease",
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between gap-2" style={{ height: 56 }}>
          {/* ── Brand ── */}
          <Link to="/" className="flex items-center gap-2 shrink-0 group">
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} transition={{ type: "spring", stiffness: 300, damping: 15 }}>
              <PLVLogo size={32} />
            </motion.div>
            <div className="leading-tight select-none">
              <span
                className="font-extrabold text-[12px] tracking-tight block leading-none"
                style={{ color: showWhiteText ? "rgba(255,255,255,0.95)" : undefined, transition: "color 200ms ease" }}
              >
                PLV <span style={{ color: showWhiteText ? "rgba(255,255,255,0.7)" : undefined }}>NaviSync</span>
              </span>
              <span className="text-[8px] font-bold text-accent tracking-widest uppercase leading-none mt-0.5 block hidden sm:block"
                style={{ color: showWhiteText ? "rgba(200,152,12,0.9)" : undefined, transition: "color 200ms ease" }}>
                Smart Campus Navigator
              </span>
            </div>
          </Link>

          {/* ── Desktop centre nav links ── */}
          <div className="hidden md:flex items-center gap-0.5 flex-1 justify-center max-w-xs">
            {NAV_LINKS.map(({ label, path, icon: Icon }) => {
              const active = isActive(path);
              return (
                <Link key={path} to={path}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex items-center gap-1.5 rounded-xl transition-colors duration-150 select-none",
                    "px-3.5 py-2 text-sm font-semibold",
                    active
                      ? showWhiteText ? "text-white" : "text-primary"
                      : showWhiteText ? "text-white/80 hover:text-white" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                  style={showWhiteText ? { textShadow: "0 1px 4px rgba(0,0,0,0.6)" } : undefined}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {label}
                  {active && (
                    <motion.span
                      layoutId="nav-underline"
                      className="absolute inset-x-3 bottom-0.5 h-0.5 rounded-full"
                      style={{ background: showWhiteText ? "white" : "var(--primary)" }}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                  )}
                </Link>
              );
            })}
          </div>

          {/* ── Right actions ── */}
          <div className="flex items-center gap-1.5 shrink-0">
            <ThemeToggle theme={theme} onToggle={toggleTheme} />

            {studentAuth ? (
              /* Student avatar dropdown */
              <div className="relative" ref={dropdownRef}>
                <motion.button
                  onClick={() => setDropdownOpen(v => !v)}
                  whileTap={{ scale: 0.93 }}
                  aria-label={`${studentAuth.username} — user menu`}
                  aria-expanded={dropdownOpen}
                  aria-haspopup="true"
                  className={cn(
                    "flex items-center gap-2 h-9 pl-1 pr-2.5 rounded-xl transition-all duration-150",
                    showWhiteText
                      ? "hover:bg-white/10 border border-white/20"
                      : "hover:bg-muted border border-border"
                  )}
                  style={{ color: showWhiteText ? "rgba(255,255,255,0.9)" : "var(--foreground)" }}
                >
                  <div              aria-hidden="true"
              className="w-7 h-7 rounded-xl flex items-center justify-center text-[11px] font-extrabold text-primary-foreground shrink-0"
                    style={{ background: "var(--primary)" }}>
                    {initials}
                  </div>
                  <span className="hidden sm:block text-xs font-bold capitalize">{studentAuth.username}</span>
                  <motion.div
                    animate={{ rotate: dropdownOpen ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronDown className="h-3 w-3 shrink-0" />
                  </motion.div>
                </motion.button>

                <AnimatePresence>
                  {dropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -5 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -5 }}
                      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                      className="absolute right-0 top-full mt-2 w-56 rounded-2xl border border-border bg-card shadow-xl overflow-hidden"
                      style={{ zIndex: 60, transformOrigin: "top right" }}
                    >
                      <div className="px-4 py-3.5 border-b border-border">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-extrabold text-primary-foreground shrink-0 bg-primary">
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-extrabold text-foreground truncate">{studentAuth.username}</p>
                            <p className="text-[11px] text-muted-foreground capitalize">{studentAuth.role}</p>
                          </div>
                        </div>
                      </div>
                      <div className="py-1.5">
                        <Link to="/student" className="flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted transition-colors">
                          <User className="h-4 w-4 text-muted-foreground shrink-0" /> My Profile
                        </Link>
                        <Link to="/student/favorites" className="flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted transition-colors">
                          <Bookmark className="h-4 w-4 text-muted-foreground shrink-0" /> Favorites
                        </Link>
                        <Link to="/student/reports" className="flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted transition-colors">
                          <Flag className="h-4 w-4 text-muted-foreground shrink-0" /> My Reports
                        </Link>
                      </div>
                      <div className="h-px mx-3 bg-border" />
                      <div className="py-1.5">
                        <Link to="/student/settings" className="flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted transition-colors">
                          <Settings className="h-4 w-4 text-muted-foreground shrink-0" /> Settings
                        </Link>
                        <button onClick={handleStudentLogout}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold hover:bg-destructive/8 text-destructive transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                          <LogOut className="h-4 w-4 shrink-0" /> Sign Out
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <Link to="/admin"
                className="inline-flex items-center gap-1 h-9 px-3 sm:px-4 rounded-xl text-xs sm:text-sm font-bold transition-all duration-200 hover:brightness-110 active:scale-95"
                style={{
                  border: showWhiteText ? "1px solid rgba(255,255,255,0.45)" : "1px solid var(--primary)",
                  color: showWhiteText ? "rgba(255,255,255,0.9)" : "var(--primary)",
                  textShadow: showWhiteText ? "0 1px 4px rgba(0,0,0,0.5)" : "none",
                }}>
                <LogIn className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden xs:inline">Login</span>
              </Link>
            )}


          </div>
        </div>
      </div>


    </nav>
  );
}

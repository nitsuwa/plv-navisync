import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate } from "react-router";
import { motion } from "motion/react";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { Bookmark, ChevronDown, Flag, Home, LogIn, LogOut, Settings, UserRound } from "lucide-react";
import { useStudentAuth } from "../../hooks/useStudentAuth";
import { cn } from "../../lib/utils";

const menuItemClass = "flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50";

interface MobileMapAccountMenuProps {
  onOpenChange?: (open: boolean) => void;
}

export function MobileMapAccountMenu({ onOpenChange }: MobileMapAccountMenuProps) {
  const { isStudent, loading, username, role, signOut } = useStudentAuth();
  const [open, setOpen] = useState(false);
  const reducedMotion = useReducedMotion();
  const menuRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 8 });
  const navigate = useNavigate();
  const location = useLocation();
  const displayName = isStudent ? username : "Campus visitor";
  const initials = isStudent ? (username.trim().slice(0, 2).toUpperCase() || "ST") : "GU";
  const roleLabel = isStudent ? role.replaceAll("_", " ") : "Guest";

  const changeOpen = (value: boolean) => {
    setOpen(value);
    onOpenChange?.(value);
  };

  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || wrapperRef.current?.contains(target)) return;
      changeOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && open) {
        changeOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, onOpenChange]);

  useEffect(() => changeOpen(false), [location.pathname]);

  useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuPosition({
        top: rect.bottom + 8,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.visualViewport?.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.visualViewport?.removeEventListener("resize", updatePosition);
    };
  }, [open]);

  const handleSignOut = async () => {
    await signOut();
    changeOpen(false);
    navigate("/");
  };

  return (
      <div ref={wrapperRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => changeOpen(!open)}
        aria-label={loading ? "Checking student account" : `${displayName} — user menu`}
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={loading}
        className={cn(
          "relative flex h-12 w-12 min-w-12 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-card/95 p-0 text-foreground shadow-[0_6px_18px_rgba(15,23,42,0.14)] backdrop-blur-xl transition-[transform,background-color,border-color] duration-150 hover:bg-muted active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-70",
          open && "border-primary/40",
        )}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[10px] font-extrabold text-primary-foreground" aria-hidden="true">
          {loading ? <span className="h-3 w-3 animate-pulse rounded-full bg-white/80" /> : initials}
        </span>
        <ChevronDown className={cn("absolute bottom-1 right-1 h-3 w-3 rounded-full bg-card text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>

      {createPortal(
          <motion.div
            ref={menuRef}
            data-map-layer="transient"
            data-open={open && !loading}
            role={open && !loading ? "menu" : undefined}
            aria-label={open && !loading ? "Student account menu" : undefined}
            aria-hidden={!open || loading}
            inert={!open || loading}
            initial={false}
            animate={open && !loading ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.96, y: -5 }}
            transition={reducedMotion ? { duration: 0.01 } : { duration: 0.17, ease: "easeOut" }}
            className="map-layer-transient fixed z-[var(--map-layer-transient)] max-h-[calc(100dvh-6rem-env(safe-area-inset-bottom,0px))] w-[min(13rem,calc(100vw-10rem))] origin-top-right overflow-y-auto rounded-2xl border border-border bg-card text-foreground shadow-2xl md:hidden"
            style={{ top: menuPosition.top, right: menuPosition.right, pointerEvents: open && !loading ? "auto" : "none" }}
          >
            <div className="flex items-center gap-3 border-b border-border px-4 py-3.5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-extrabold text-primary-foreground" aria-hidden="true">
                {initials}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-extrabold">{displayName}</span>
                <span className="block text-[11px] capitalize text-muted-foreground">{roleLabel}</span>
              </span>
            </div>

            <div className="py-1.5">
              <Link role="menuitem" to={isStudent ? "/home" : "/"} onClick={() => changeOpen(false)} className={menuItemClass}>
                <Home className="h-4 w-4 shrink-0 text-muted-foreground" /> Home
              </Link>
              {isStudent ? (
                <>
                  <Link role="menuitem" to="/student" onClick={() => changeOpen(false)} className={menuItemClass}>
                    <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" /> My Profile
                  </Link>
                  <Link role="menuitem" to="/student/favorites" onClick={() => changeOpen(false)} className={menuItemClass}>
                    <Bookmark className="h-4 w-4 shrink-0 text-muted-foreground" /> Favorites
                  </Link>
                  <Link role="menuitem" to="/student/reports" onClick={() => changeOpen(false)} className={menuItemClass}>
                    <Flag className="h-4 w-4 shrink-0 text-muted-foreground" /> My Reports
                  </Link>
                </>
              ) : (
                <Link role="menuitem" to="/register" onClick={() => changeOpen(false)} className={menuItemClass}>
                  <LogIn className="h-4 w-4 shrink-0 text-muted-foreground" /> Student sign in
                </Link>
              )}
            </div>

            {isStudent && (
              <>
                <div className="mx-3 h-px bg-border" />
                <div className="py-1.5">
                  <Link role="menuitem" to="/student/settings" onClick={() => changeOpen(false)} className={menuItemClass}>
                    <Settings className="h-4 w-4 shrink-0 text-muted-foreground" /> Settings
                  </Link>
                  <button role="menuitem" type="button" onClick={() => void handleSignOut()} className={cn(menuItemClass, "text-destructive hover:bg-destructive/10 focus-visible:bg-destructive/10")}>
                    <LogOut className="h-4 w-4 shrink-0" /> Sign Out
                  </button>
                </div>
              </>
            )}
          </motion.div>,
        document.body,
      )}
    </div>
  );
}

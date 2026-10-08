import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate } from "react-router";
import { motion } from "motion/react";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { Bookmark, ChevronDown, Flag, LogIn, LogOut, Settings, UserRound } from "lucide-react";
import { useStudentAuth } from "../../hooks/useStudentAuth";
import { useToast } from "../../hooks/useToast";
import { cn } from "../../lib/utils";
import { StudentAvatar } from "../ui/StudentAvatar";

const menuItemClass = "flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50";

interface MobileMapAccountMenuProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function MobileMapAccountMenu({ open: controlledOpen, onOpenChange }: MobileMapAccountMenuProps) {
  const { isStudent, loading, username, role, profile, signOut } = useStudentAuth();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const reducedMotion = useReducedMotion();
  const menuRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 8 });
  const [menuMaxHeight, setMenuMaxHeight] = useState(400);
  const suppressOutsideClickRef = useRef(false);
  const outsideClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { error: showError } = useToast();
  const displayName = isStudent ? username : "Campus visitor";
  const roleLabel = isStudent ? role.replaceAll("_", " ") : "Guest";
  const openRef = useRef(open);
  openRef.current = open;

  const changeOpen = (value: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(value);
    onOpenChange?.(value);
  };

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || wrapperRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-testid='student-map-search-panel']")) {
        changeOpen(false);
        return;
      }
      if (target instanceof Element && target.closest("[data-testid='student-map-notification-trigger']")) {
        changeOpen(false);
        return;
      }
      // The outside gesture dismisses the menu only; it must not activate a
      // building, map control, or sheet underneath the popover.
      suppressOutsideClickRef.current = true;
      if (outsideClickTimerRef.current) clearTimeout(outsideClickTimerRef.current);
      outsideClickTimerRef.current = setTimeout(() => { suppressOutsideClickRef.current = false; }, 700);
      event.preventDefault();
      event.stopPropagation();
      changeOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && open) {
        event.preventDefault();
        event.stopPropagation();
        changeOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, onOpenChange]);

  useEffect(() => {
    const swallowDismissClick = (event: MouseEvent) => {
      if (suppressOutsideClickRef.current) {
        suppressOutsideClickRef.current = false;
        if (outsideClickTimerRef.current) clearTimeout(outsideClickTimerRef.current);
        outsideClickTimerRef.current = null;
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      // Click-only input paths still dismiss the foreground menu without
      // activating map content underneath it.
      if (!openRef.current) return;
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || wrapperRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-testid='student-map-search-panel']")) {
        changeOpen(false);
        return;
      }
      if (target instanceof Element && target.closest("[data-testid='student-map-notification-trigger']")) {
        changeOpen(false);
        return;
      }
      changeOpen(false);
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    document.addEventListener("click", swallowDismissClick, true);
    return () => {
      document.removeEventListener("click", swallowDismissClick, true);
      if (outsideClickTimerRef.current) clearTimeout(outsideClickTimerRef.current);
    };
  }, []);

  useEffect(() => changeOpen(false), [location.pathname]);

  useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const top = Math.min(rect.bottom + 8, Math.max(8, viewportHeight - 168));
      setMenuPosition({
        top,
        right: Math.max(8, window.innerWidth - rect.right),
      });
      setMenuMaxHeight(Math.max(144, viewportHeight - top - 12 - (window.visualViewport?.offsetTop ?? 0)));
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
    try {
      await signOut();
      changeOpen(false);
      navigate("/");
    } catch {
      showError("Could not sign out. Please try again.");
    }
  };

  return (
      <div ref={wrapperRef} data-testid="student-map-profile-trigger" className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => changeOpen(!open)}
        aria-label={`${displayName} — user menu`}
        aria-busy={loading}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          "relative flex h-12 w-12 min-w-12 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-card/95 p-0 text-foreground shadow-[0_6px_18px_rgba(15,23,42,0.14)] backdrop-blur-xl transition-[transform,background-color,border-color] duration-150 hover:bg-muted active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-70",
          open && "border-primary/40",
        )}
      >
        {loading
          ? <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[10px] font-extrabold text-primary-foreground" aria-hidden="true"><span className="h-3 w-3 animate-pulse rounded-full bg-white/80" /></span>
          : <StudentAvatar name={username} avatarPath={profile?.avatar_path} className="h-8 w-8 text-[10px]" aria-hidden />}
        <ChevronDown className={cn("absolute bottom-1 right-1 h-3 w-3 rounded-full bg-card text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>

      {createPortal(
          <motion.div
            ref={menuRef}
            data-map-layer="transient"
            data-open={open}
            role={open ? "menu" : undefined}
            aria-label={open ? "Student account menu" : undefined}
            aria-hidden={!open}
            inert={!open ? ("" as never) : undefined}
            initial={false}
            animate={open ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.96, y: -5 }}
            transition={reducedMotion ? { duration: 0.01 } : { duration: 0.17, ease: "easeOut" }}
            className="map-layer-transient fixed z-[var(--map-layer-transient)] w-[min(14.5rem,calc(100vw-1rem))] origin-top-right overflow-y-auto rounded-2xl border border-border bg-card text-foreground shadow-2xl md:hidden"
            style={{ top: menuPosition.top, right: menuPosition.right, maxHeight: menuMaxHeight, pointerEvents: open ? "auto" : "none" }}
          >
            <div className="flex items-center gap-3 border-b border-border px-4 py-3.5">
              <StudentAvatar name={username} avatarPath={profile?.avatar_path} className="h-11 w-11 rounded-xl text-sm" aria-hidden />
              <span className="min-w-0">
                <span className="block truncate text-sm font-extrabold">{displayName}</span>
                <span className="block text-[11px] capitalize text-muted-foreground">{roleLabel}</span>
              </span>
            </div>

            {loading ? (
              <div role="status" className="px-4 py-3 text-xs font-medium text-muted-foreground">Checking student account…</div>
            ) : <div className="py-1.5">
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
            </div>}

            {isStudent && !loading && (
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

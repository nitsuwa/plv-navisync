import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, MapPin } from "lucide-react";
import { cn } from "../../lib/utils";

export interface StudentCampusOption {
  id: string;
  name: string;
  code?: string | null;
  lifecycleStatus?: string | null;
}

export interface StudentCampusMenuLayout {
  placement: "above" | "below";
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

interface CampusMenuLayoutInput {
  trigger: Pick<DOMRect, "top" | "right" | "bottom" | "left">;
  viewport: { left: number; top: number; width: number; height: number };
  obstacles?: readonly Pick<DOMRect, "left" | "right" | "top" | "bottom">[];
  mobile: boolean;
  campusCount: number;
  safeAreaBottom?: number;
}

/** Computes a viewport-contained menu position and reserves room before visible map overlays. */
export function computeStudentCampusMenuLayout({
  trigger,
  viewport,
  obstacles = [],
  mobile,
  campusCount,
  safeAreaBottom = 0,
}: CampusMenuLayoutInput): StudentCampusMenuLayout {
  const margin = 12;
  const viewportRight = viewport.left + viewport.width;
  const viewportBottom = viewport.top + viewport.height;
  const width = mobile ? Math.min(300, Math.max(220, viewport.width - margin * 2)) : 220;
  const left = mobile
    ? Math.max(viewport.left + margin, Math.min(viewportRight - margin - width, trigger.left))
    : Math.max(viewport.left + margin, Math.min(viewportRight - margin - width, trigger.left + (trigger.right - trigger.left - width) / 2));
  const desiredHeight = Math.min(400, Math.max(176, 48 + campusCount * 56));
  const horizontalOverlap = (obstacle: Pick<DOMRect, "left" | "right">) => left < obstacle.right && left + width > obstacle.left;
  const lowerLimit = Math.min(viewportBottom - margin - safeAreaBottom, ...obstacles
    .filter((obstacle) => horizontalOverlap(obstacle) && obstacle.top >= trigger.bottom)
    .map((obstacle) => obstacle.top - 8));
  const upperLimit = Math.max(viewport.top + margin, ...obstacles
    .filter((obstacle) => horizontalOverlap(obstacle) && obstacle.bottom <= trigger.top)
    .map((obstacle) => obstacle.bottom + 8));
  const belowSpace = Math.max(0, lowerLimit - trigger.bottom - 8);
  const aboveSpace = Math.max(0, trigger.top - 8 - upperLimit);
  const placement = belowSpace >= desiredHeight || belowSpace >= aboveSpace ? "below" : "above";
  const availableHeight = placement === "below" ? belowSpace : aboveSpace;
  const maxHeight = Math.max(0, Math.min(desiredHeight, availableHeight));
  const top = placement === "below"
    ? Math.min(lowerLimit - maxHeight, trigger.bottom + 8)
    : Math.max(upperLimit, trigger.top - maxHeight - 8);

  return { placement, top, left, width, maxHeight };
}

export function computeStudentCampusSelectorMaxWidth(surfaceWidth: number, floorPickerLeft?: number, surfaceLeft = 0): number {
  const floorRoom = floorPickerLeft == null ? Number.POSITIVE_INFINITY : floorPickerLeft - surfaceLeft - 20;
  return Math.max(120, Math.round(Math.min(260, surfaceWidth - 24, floorRoom)));
}

interface StudentCampusSelectorProps {
  campuses: readonly StudentCampusOption[];
  activeCampusId?: string | null;
  activeCampusName?: string | null;
  mobileTop?: number | null;
  mobileMaxWidth?: number | null;
  /** Return false to keep the menu open (for example, after a declined confirmation). */
  onSelect: (campusId: string) => boolean | void;
}

const CAMPUS_MENU_OBSTACLES = [
  "[data-map-search-header='true']",
  "[data-map-layer='account-trigger']",
  "[data-testid='student-floor-picker']",
  "[data-testid='student-selected-place-card']",
  "[data-testid='student-room-and-video-stack']",
  "[data-testid='mobile-building-sheet']",
  "[data-testid='route-planner-dialog']",
  "[data-testid='collapsed-route-card']",
  "[data-testid='mobile-active-route-dock']",
  "[data-testid='event-map-panel']",
  ".student-map-utility-stack",
  "[data-testid='student-event-map-button']",
].join(",");

export function StudentCampusSelector({ campuses, activeCampusId, activeCampusName, mobileTop, mobileMaxWidth, onSelect }: StudentCampusSelectorProps) {
  const [open, setOpen] = useState(false);
  const [layout, setLayout] = useState<StudentCampusMenuLayout | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const initialMenuFocusSet = useRef(false);
  const menuId = "student-campus-selector-menu";
  const activeCampus = campuses.find((campus) => campus.id === activeCampusId);
  const campusName = activeCampusName ?? activeCampus?.name ?? "Select Campus";

  const measureMenu = useCallback(() => {
    if (typeof window === "undefined") return;
    const trigger = triggerRef.current?.getBoundingClientRect();
    if (!trigger) return;
    const surface = rootRef.current?.closest<HTMLElement>("[data-testid='student-map-surface']");
    const visualViewport = window.visualViewport;
    const viewport = {
      left: visualViewport?.offsetLeft ?? 0,
      top: visualViewport?.offsetTop ?? 0,
      width: visualViewport?.width ?? window.innerWidth,
      height: visualViewport?.height ?? window.innerHeight,
    };
    const obstacles = [
      ...Array.from(surface?.querySelectorAll<HTMLElement>(CAMPUS_MENU_OBSTACLES) ?? []),
      ...Array.from(document.querySelectorAll<HTMLElement>("[aria-label='Mobile navigation'], [data-testid='student-floor-picker-menu']")),
    ]
      .filter((element) => element !== rootRef.current && !rootRef.current?.contains(element))
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ element, rect }) => {
        const style = window.getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      })
      .map(({ rect }) => rect);
    const safeAreaBottom = Number.parseFloat(surface ? window.getComputedStyle(surface).getPropertyValue("--student-map-safe-area-bottom") : "0") || 0;
    const nextLayout = computeStudentCampusMenuLayout({
      trigger,
      viewport,
      obstacles,
      mobile: window.innerWidth < 768,
      campusCount: campuses.length,
      safeAreaBottom,
    });
    setLayout((current) => current
      && current.placement === nextLayout.placement
      && current.top === nextLayout.top
      && current.left === nextLayout.left
      && current.width === nextLayout.width
      && current.maxHeight === nextLayout.maxHeight
      ? current
      : nextLayout);
  }, [campuses.length]);

  useLayoutEffect(() => {
    if (!open) return;
    measureMenu();
    const surface = rootRef.current?.closest<HTMLElement>("[data-testid='student-map-surface']");
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measureMenu);
    if (surface) {
      observer?.observe(surface);
      surface.querySelectorAll<HTMLElement>(CAMPUS_MENU_OBSTACLES).forEach((element) => observer?.observe(element));
    }
    document.querySelectorAll<HTMLElement>("[aria-label='Mobile navigation'], [data-testid='student-floor-picker-menu']").forEach((element) => observer?.observe(element));
    const onTransitionEnd = (event: TransitionEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".student-map-utility-stack, .student-map-event-control, [data-testid='student-room-and-video-stack'], [data-testid='student-selected-place-card'], [data-testid='mobile-building-sheet'], [data-testid='route-planner-dialog']")) measureMenu();
    };
    document.addEventListener("transitionend", onTransitionEnd, true);
    window.addEventListener("resize", measureMenu);
    window.addEventListener("scroll", measureMenu, true);
    window.visualViewport?.addEventListener("resize", measureMenu);
    window.visualViewport?.addEventListener("scroll", measureMenu);
    return () => {
      observer?.disconnect();
      document.removeEventListener("transitionend", onTransitionEnd, true);
      window.removeEventListener("resize", measureMenu);
      window.removeEventListener("scroll", measureMenu, true);
      window.visualViewport?.removeEventListener("resize", measureMenu);
      window.visualViewport?.removeEventListener("scroll", measureMenu);
    };
  }, [measureMenu, open]);

  useEffect(() => {
    if (!open) {
      initialMenuFocusSet.current = false;
      return;
    }
    if (layout && !initialMenuFocusSet.current) {
      initialMenuFocusSet.current = true;
      const activeIndex = Math.max(0, campuses.findIndex((campus) => campus.id === activeCampusId));
      requestAnimationFrame(() => optionRefs.current[activeIndex]?.focus());
    }
  }, [activeCampusId, campuses, layout, open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && (rootRef.current?.contains(target) || menuRef.current?.contains(target))) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key === "Tab") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  const focusOption = (index: number) => {
    const next = (index + campuses.length) % campuses.length;
    optionRefs.current[next]?.focus();
  };
  const chooseCampus = (campusId: string) => {
    const accepted = onSelect(campusId);
    if (accepted === false) return;
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  return (
    <div
      ref={rootRef}
      data-testid="student-campus-selector"
      data-dock="mobile-top-left-desktop-bottom-center"
      data-no-drag
      className="student-campus-selector map-layer-controls pointer-events-auto"
      style={{
        "--student-map-campus-selector-top": mobileTop == null ? undefined : `${mobileTop}px`,
        "--student-map-campus-selector-max-width": mobileMaxWidth == null ? undefined : `${mobileMaxWidth}px`,
      } as CSSProperties}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Change campus. Current campus: ${campusName}`}
        title={campusName}
        className={cn(
          "student-campus-selector-trigger flex min-h-10 items-center gap-2 rounded-full border border-border/80 bg-card/95 px-3 text-xs font-semibold text-foreground shadow-[0_5px_16px_rgba(15,23,42,0.14)] backdrop-blur-xl transition-[background-color,box-shadow] duration-150 hover:bg-muted hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
          "md:min-h-11 md:rounded-2xl md:px-4",
        )}
        style={{ fontFamily: "var(--font-body)" }}
      >
        <MapPin aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
        <span className="max-w-[190px] truncate md:max-w-[260px]">{campusName}</span>
        <ChevronDown aria-hidden="true" className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-150", open && "rotate-180")} />
      </button>
      {open && layout && campuses.length > 0 && createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Select campus"
          data-testid="student-campus-selector-menu"
          data-placement={layout.placement}
          className="fixed z-[110] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-card/98 py-1 text-foreground shadow-2xl backdrop-blur-xl"
          style={{ left: layout.left, top: layout.top, width: layout.width, maxHeight: layout.maxHeight }}
          onKeyDown={(event) => {
            const buttons = optionRefs.current.filter((button): button is HTMLButtonElement => Boolean(button));
            const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
            if (event.key === "ArrowDown") { event.preventDefault(); focusOption(index + 1); }
            if (event.key === "ArrowUp") { event.preventDefault(); focusOption(index <= 0 ? buttons.length - 1 : index - 1); }
            if (event.key === "Home") { event.preventDefault(); focusOption(0); }
            if (event.key === "End") { event.preventDefault(); focusOption(buttons.length - 1); }
          }}
        >
          <p className="sticky top-0 z-10 border-b border-border bg-card/98 px-3.5 py-2 text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Select campus</p>
          {campuses.map((campus, index) => {
            const selected = campus.id === activeCampusId;
            return (
              <button
                key={campus.id}
                ref={(element) => { optionRefs.current[index] = element; }}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                aria-label={`${campus.name}${campus.code ? `, ${campus.code}` : ""}${selected ? ", Active" : ""}`}
                onClick={() => chooseCampus(campus.id)}
                className="flex min-h-12 w-full items-center gap-3 px-3.5 py-2 text-left transition-colors hover:bg-muted/70 focus-visible:bg-muted focus-visible:outline-none"
                style={{ background: selected ? "color-mix(in srgb, var(--primary) 8%, transparent)" : undefined }}
              >
                <span className={cn("h-2 w-2 shrink-0 rounded-full", selected ? "bg-primary" : "bg-muted-foreground/45")} />
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate text-xs font-bold", selected && "text-primary")}>{campus.name}</span>
                  {campus.code && <span className="block truncate text-[10px] text-muted-foreground">{campus.code}</span>}
                </span>
                {campus.lifecycleStatus === "coming_soon" && <span className="shrink-0 rounded-full bg-sky-100 px-1.5 py-0.5 text-[8px] font-extrabold text-sky-700">Coming Soon</span>}
                {selected && <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}

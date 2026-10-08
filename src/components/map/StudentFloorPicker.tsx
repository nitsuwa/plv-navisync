import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Layers, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { cn } from "../../lib/utils";

export interface StudentFloorOption {
  number: number;
  label: string;
}

type MenuKind = "popover" | "sheet";

export interface StudentFloorPickerLayout {
  kind: MenuKind;
  placement: "above" | "below";
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

interface StudentFloorPickerLayoutInput {
  trigger: Pick<DOMRect, "top" | "right" | "bottom" | "left">;
  viewport: { left: number; top: number; width: number; height: number };
  surface: Pick<DOMRect, "left" | "right" | "top" | "bottom">;
  headerBottom?: number;
  floorCount: number;
  mobile: boolean;
  obstacles?: readonly Pick<DOMRect, "left" | "right" | "top" | "bottom">[];
}

/** Pure layout calculation so responsive placement can be checked without a browser screenshot. */
export function computeStudentFloorPickerLayout({
  trigger,
  viewport,
  surface,
  headerBottom,
  floorCount,
  mobile,
  obstacles = [],
}: StudentFloorPickerLayoutInput): StudentFloorPickerLayout {
  const margin = 12;
  const viewportRight = viewport.left + viewport.width;
  const viewportBottom = viewport.top + viewport.height;
  const leftBound = Math.max(viewport.left + margin, surface.left + margin);
  const rightBound = Math.min(viewportRight - margin, surface.right - margin);
  const topBound = Math.max(viewport.top + margin, surface.top + margin, (headerBottom ?? 0) + 8);
  const bottomBound = Math.min(viewportBottom - margin, surface.bottom - (mobile ? 88 : margin));
  const availableWidth = Math.max(0, rightBound - leftBound);
  const width = Math.min(288, availableWidth);
  const desiredHeight = Math.min(352, Math.max(180, 54 + floorCount * 48));
  const above = Math.max(0, trigger.top - 8 - topBound);
  const below = Math.max(0, bottomBound - trigger.bottom - 8);
  const alignedLeft = mobile ? trigger.right - width : (trigger.left + trigger.right - width) / 2;
  const left = Math.max(leftBound, Math.min(rightBound - width, alignedLeft));
  const candidates = ([(below >= desiredHeight || below >= above) ? "below" : "above", "below", "above"] as const)
    .filter((placement, index, all) => all.indexOf(placement) === index)
    .map((placement) => {
      const space = placement === "below" ? below : above;
      const candidateHeight = Math.min(desiredHeight, space);
      const top = placement === "below" ? Math.min(bottomBound - candidateHeight, trigger.bottom + 8) : Math.max(topBound, trigger.top - candidateHeight - 8);
      const candidate = { left, right: left + width, top, bottom: top + candidateHeight };
      const blocked = obstacles.some((obstacle) => candidate.left < obstacle.right
        && candidate.right > obstacle.left
        && candidate.top < obstacle.bottom
        && candidate.bottom > obstacle.top);
      return { placement, space, candidateHeight, top, blocked };
    });
  const chosen = candidates.find((candidate) => candidate.space >= 168 && !candidate.blocked);
  const placement = chosen?.placement ?? ((below >= above) ? "below" : "above");
  const availableHeight = chosen?.space ?? (placement === "below" ? below : above);
  const maxHeight = Math.max(0, Math.min(desiredHeight, availableHeight));
  const kind: MenuKind = width < 240 || !chosen ? "sheet" : "popover";

  if (kind === "sheet") {
    const sheetWidth = Math.min(360, availableWidth || viewport.width - margin * 2);
    return {
      kind,
      placement: "below",
      width: sheetWidth,
      left: Math.max(leftBound, Math.min(rightBound - sheetWidth, viewport.left + (viewport.width - sheetWidth) / 2)),
      top: Math.max(topBound, Math.min(bottomBound - Math.min(desiredHeight, 300), viewport.top + (viewport.height - Math.min(desiredHeight, 300)) / 2)),
      maxHeight: Math.max(120, Math.min(desiredHeight, viewport.height * 0.72, viewport.height - margin * 2 - 8)),
    };
  }

  const maxHeightForMenu = Math.max(144, maxHeight);
  const top = chosen?.top ?? (placement === "below"
    ? Math.min(bottomBound - maxHeightForMenu, trigger.bottom + 8)
    : Math.max(topBound, trigger.top - maxHeightForMenu - 8));
  return { kind, placement, top, left, width, maxHeight: maxHeightForMenu };
}

interface StudentFloorPickerProps {
  buildingName: string;
  buildingCode?: string;
  floors: readonly StudentFloorOption[];
  activeFloor: number;
  routeFloors?: readonly number[];
  routePanelOpen?: boolean;
  embedded?: boolean;
  onSelect: (floorNumber: number) => void;
  /** True only while a constrained-screen modal fallback owns the small-screen surface. */
  onFallbackOpenChange?: (open: boolean) => void;
}

function compactFloorLabel(floor: StudentFloorOption | undefined) {
  if (!floor) return "Floor";
  if (/ground|lobby|ground level/i.test(floor.label)) return "G/F";
  const number = floor.label.match(/\d+/)?.[0] ?? String(floor.number);
  if (/basement|sublevel/i.test(floor.label)) return `B${number}`;
  if (/mezzanine/i.test(floor.label)) return "MZ";
  return `${number}F`;
}

export function StudentFloorPicker({
  buildingName,
  buildingCode,
  floors,
  activeFloor,
  routeFloors = [],
  routePanelOpen = false,
  embedded = false,
  onSelect,
  onFallbackOpenChange,
}: StudentFloorPickerProps) {
  const [open, setOpen] = useState(false);
  const [layout, setLayout] = useState<StudentFloorPickerLayout | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const fallbackOpenRef = useRef(false);
  const reducedMotion = useReducedMotion();
  const current = floors.find((floor) => floor.number === activeFloor) ?? floors[0];

  const measureLayout = () => {
    if (typeof window === "undefined") return;
    const trigger = triggerRef.current?.getBoundingClientRect();
    const surfaceElement = rootRef.current?.closest<HTMLElement>("[data-testid='student-map-surface']");
    if (!trigger || !surfaceElement) return;
    const visualViewport = window.visualViewport;
    const viewport = {
      left: visualViewport?.offsetLeft ?? 0,
      top: visualViewport?.offsetTop ?? 0,
      width: visualViewport?.width ?? window.innerWidth,
      height: visualViewport?.height ?? window.innerHeight,
    };
    const surface = surfaceElement.getBoundingClientRect();
    const searchHeader = surfaceElement.querySelector<HTMLElement>("[data-map-search-header='true']");
    const headerBottom = searchHeader?.getBoundingClientRect().bottom;
    const obstacles = Array.from(surfaceElement.querySelectorAll<HTMLElement>("[data-testid='route-planner-dialog'], [data-testid='student-selected-place-card'], [data-testid='mobile-building-sheet']"))
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0);
    const computedLayout = computeStudentFloorPickerLayout({
      trigger,
      viewport,
      surface,
      headerBottom,
      floorCount: floors.length,
      mobile: window.innerWidth < 768,
      obstacles,
    });
    const nextLayout = embedded ? { ...computedLayout, kind: "sheet" as const } : computedLayout;
    setLayout((current) => current
      && current.kind === nextLayout.kind
      && current.placement === nextLayout.placement
      && current.top === nextLayout.top
      && current.left === nextLayout.left
      && current.width === nextLayout.width
      && current.maxHeight === nextLayout.maxHeight
      ? current
      : nextLayout);
  };

  useLayoutEffect(() => {
    if (!open) return;
    measureLayout();
    window.addEventListener("resize", measureLayout);
    window.addEventListener("scroll", measureLayout, true);
    window.visualViewport?.addEventListener("resize", measureLayout);
    window.visualViewport?.addEventListener("scroll", measureLayout);
    return () => {
      window.removeEventListener("resize", measureLayout);
      window.removeEventListener("scroll", measureLayout, true);
      window.visualViewport?.removeEventListener("resize", measureLayout);
      window.visualViewport?.removeEventListener("scroll", measureLayout);
    };
  }, [open, floors.length, routePanelOpen, embedded]);

  useEffect(() => {
    const next = Boolean(open && layout?.kind === "sheet");
    if (fallbackOpenRef.current === next) return;
    fallbackOpenRef.current = next;
    onFallbackOpenChange?.(next);
  }, [layout?.kind, onFallbackOpenChange, open]);

  // The standalone control hands off to the Route Planner's embedded mobile
  // trigger. Close any already-open standalone menu so its portal cannot stay
  // visible as a second competing Floor selector.
  useEffect(() => {
    if (!embedded && routePanelOpen) setOpen(false);
  }, [embedded, routePanelOpen]);

  useEffect(() => () => onFallbackOpenChange?.(false), [onFallbackOpenChange]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && (rootRef.current?.contains(target) || menuRef.current?.contains(target))) return;
      setOpen(false);
      const surface = rootRef.current?.closest<HTMLElement>("[data-testid='student-map-surface']");
      if (layout?.kind === "sheet" || (target instanceof Node && surface?.contains(target))) {
        event.stopPropagation();
        if (layout?.kind === "sheet") triggerRef.current?.focus();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (layout?.kind !== "sheet" || event.key !== "Tab") return;
      const options = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? []);
      if (options.length === 0) return;
      const first = options[0];
      const last = options[options.length - 1];
      if (event.shiftKey && (document.activeElement === first || !menuRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [layout?.kind, open]);

  useEffect(() => {
    if (open) optionRefs.current[floors.findIndex((floor) => floor.number === activeFloor)]?.focus();
  }, [open, activeFloor, floors, layout?.kind]);

  if (floors.length < 2 || !current) return null;

  const closePicker = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };
  const moveFocus = (index: number, direction: -1 | 1) => {
    const next = (index + direction + floors.length) % floors.length;
    optionRefs.current[next]?.focus();
  };
  const stopMapEvents = (event: { stopPropagation: () => void }) => event.stopPropagation();

  const optionList = (
    <div id="student-floor-picker-options" role="listbox" aria-label={`Floors in ${buildingName}`} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
      {floors.map((floor, index) => {
        const selected = floor.number === activeFloor;
        return (
          <button
            key={`${floor.number}:${floor.label}`}
            ref={(element) => { optionRefs.current[index] = element; }}
            type="button"
            role="option"
            aria-selected={selected}
            onClick={() => { onSelect(floor.number); closePicker(); }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") { event.preventDefault(); event.stopPropagation(); moveFocus(index, 1); }
              if (event.key === "ArrowUp") { event.preventDefault(); event.stopPropagation(); moveFocus(index, -1); }
              if (event.key === "Home") { event.preventDefault(); event.stopPropagation(); optionRefs.current[0]?.focus(); }
              if (event.key === "End") { event.preventDefault(); event.stopPropagation(); optionRefs.current[floors.length - 1]?.focus(); }
              if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); onSelect(floor.number); closePicker(); }
            }}
            className={cn(
              "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50",
              selected ? "bg-primary/10 font-bold text-primary" : "font-medium text-foreground hover:bg-muted",
            )}
          >
            <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-extrabold", selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
              {compactFloorLabel(floor)}
            </span>
            <span className="min-w-0 flex-1 truncate">{floor.label}</span>
            {floor.number !== activeFloor && routeFloors.includes(floor.number) && (
              <span data-testid="student-floor-route-status" className="shrink-0 text-[9px] font-bold text-primary">Route</span>
            )}
            {selected && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );

  const menu = open && layout && typeof document !== "undefined" ? createPortal(
    <AnimatePresence initial={false}>
      {layout.kind === "sheet" ? (
        <motion.div
          key="student-floor-picker-scrim"
          data-testid="student-floor-picker-scrim"
            className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/35 px-3 py-4 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{ paddingTop: "max(1rem, env(safe-area-inset-top, 0px))", paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px))" }}
          onPointerDown={(event) => { stopMapEvents(event); if (event.target === event.currentTarget) closePicker(); }}
          onClick={stopMapEvents}
        >
          <motion.div
            ref={menuRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="student-floor-picker-title"
            data-testid="student-floor-picker-menu"
            data-placement="sheet"
            className="flex w-full max-w-[360px] flex-col overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-2xl"
            style={{ maxHeight: `${layout.maxHeight}px` }}
            initial={reducedMotion ? false : { opacity: 0, y: 8, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 5, scale: 0.985 }}
            transition={reducedMotion ? { duration: 0.01 } : { duration: 0.16, ease: "easeOut" }}
            onPointerDown={stopMapEvents}
            onClick={stopMapEvents}
            onWheel={stopMapEvents}
            onTouchMove={stopMapEvents}
          >
            <div className="flex shrink-0 items-start gap-3 border-b border-border px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p id="student-floor-picker-title" className="text-[9px] font-extrabold uppercase tracking-[0.13em] text-muted-foreground">{buildingCode || buildingName}</p>
                <p className="text-[13px] font-bold leading-tight text-foreground">Choose floor</p>
                {buildingCode && <p className="line-clamp-2 text-[10px] leading-snug text-muted-foreground">{buildingName}</p>}
              </div>
            <button type="button" aria-label="Close floor picker" onClick={() => closePicker()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted/70 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"><X className="h-4 w-4" /></button>
            </div>
            {optionList}
          </motion.div>
        </motion.div>
      ) : (
        <motion.div
          key="student-floor-picker-popover"
          ref={menuRef}
          role="presentation"
          data-testid="student-floor-picker-menu"
          data-placement={layout.placement}
          className="fixed z-[120] flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-[0_14px_38px_rgba(15,23,42,0.2)]"
          style={{ top: layout.top, left: layout.left, width: layout.width, maxHeight: layout.maxHeight }}
          initial={reducedMotion ? false : { opacity: 0, y: layout.placement === "below" ? -4 : 4, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: layout.placement === "below" ? -3 : 3, scale: 0.985 }}
          transition={reducedMotion ? { duration: 0.01 } : { duration: 0.15, ease: "easeOut" }}
          onPointerDown={stopMapEvents}
          onClick={stopMapEvents}
          onWheel={stopMapEvents}
          onTouchMove={stopMapEvents}
        >
          <div className="shrink-0 border-b border-border px-3.5 pb-2 pt-3">
            <p className="text-[9px] font-extrabold uppercase tracking-[0.13em] text-muted-foreground">{buildingCode || buildingName}</p>
            <p className="text-[13px] font-bold leading-tight text-foreground">Choose floor</p>
            {buildingCode && <p className="line-clamp-2 text-[10px] leading-snug text-muted-foreground">{buildingName}</p>}
          </div>
          {optionList}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  ) : null;

  return (
    <div
      ref={rootRef}
      data-testid={embedded ? "student-floor-picker-inline" : "student-floor-picker"}
      data-dock="floor-control-top"
      data-no-drag
      className={cn(embedded
        ? "student-map-utility-control relative z-[65] shrink-0 md:hidden"
        : "student-map-utility-control absolute isolate right-3 top-[calc(env(safe-area-inset-top,0px)+4.5rem)] md:right-4 md:top-4",
        !embedded && routePanelOpen && "hidden md:block",
        !embedded && (open ? "z-[90]" : routePanelOpen ? "z-[60]" : "z-[45]"))}
      data-route-panel-open={routePanelOpen ? "true" : "false"}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Choose floor. Current floor: ${current.label}`}
        aria-haspopup={layout?.kind === "sheet" && open ? "dialog" : "listbox"}
        aria-controls={open ? "student-floor-picker-options" : undefined}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            setOpen(true);
          }
        }}
        title={`${buildingName} · ${current.label}`}
        className={cn("flex min-h-11 w-auto max-w-[calc(100vw-7rem)] items-center gap-2 rounded-2xl border border-border/80 bg-card/95 px-3.5 text-xs font-bold text-foreground shadow-[0_6px_18px_rgba(15,23,42,0.14)] backdrop-blur-xl transition-[transform,background-color,box-shadow] duration-150 hover:bg-muted hover:shadow-lg active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 md:w-[min(360px,calc(100vw-2rem))] md:max-w-[min(360px,calc(100vw-2rem))] md:px-4", embedded && "max-w-[136px] px-2.5")}
      >
        <Layers className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span data-testid="student-floor-mobile-label" className="min-w-0 truncate md:hidden">Floor · {compactFloorLabel(current)}</span>
        <span className="hidden min-w-0 flex-1 items-center gap-2 overflow-hidden md:flex">
          <span data-testid="student-floor-building-name" className="min-w-0 flex-1 truncate" title={buildingName}>{buildingCode || buildingName}</span>
          <span className="shrink-0 text-muted-foreground/60" aria-hidden="true">·</span>
          <span data-testid="student-floor-current-label" className="shrink-0 whitespace-nowrap text-foreground">{current.label}</span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150", open && "rotate-180")} aria-hidden="true" />
      </button>
      {menu}
    </div>
  );
}

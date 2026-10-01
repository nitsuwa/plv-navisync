import { useRef, useCallback, useEffect, useState } from "react";
import { X, Navigation, Bookmark, Layers, Flag } from "lucide-react";
import { motion, useMotionValue, useTransform, animate, useDragControls, useReducedMotion } from "motion/react";
import type { Building } from "../../types";
import { cn } from "../../lib/utils";
import type { StudentAuthState } from "../../hooks/useStudentAuth";
import { useEscToClose } from "../../hooks/useEscToClose";

interface MobileBuildingSheetProps {
  selected: Building;
  onClose: () => void;
  onDirections: (b: Building) => void;
  onFloorPlan: (b: Building) => void;
  onSave: (id: string) => void;
  onReport: (b: Building) => void;
  onSignInPrompt: (msg: string) => void;
  saved: Set<string>;
  studentAuth: StudentAuthState;
  hasFloorPlans: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}

const SNAP_THRESHOLD = 72;

export function MobileBuildingSheet({
  selected, onClose, onDirections, onFloorPlan, onSave, onReport,
  onSignInPrompt, saved, studentAuth, hasFloorPlans,
  onExpandedChange,
}: MobileBuildingSheetProps) {
  useEscToClose(onClose);
  const controls = useDragControls();
  const sheetRef = useRef<HTMLDivElement>(null);
  const handlePointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const reducedMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(false);

  const setSheetExpanded = useCallback((value: boolean) => {
    setExpanded(value);
    onExpandedChange?.(value);
  }, [onExpandedChange]);
  const dragY = useMotionValue(0);
  const sheetOpacity = useTransform(dragY, [0, SNAP_THRESHOLD * 2], [1, 0.9]);
  const sheetScale = useTransform(dragY, [0, SNAP_THRESHOLD * 2], [1, 0.985]);
  const borderRadius = useTransform(dragY, [0, SNAP_THRESHOLD * 2], [20, 24]);

  const handleDragEnd = useCallback((_: any, info: any) => {
    const offset = info.offset.y;
    const velocity = info.velocity.y;
    const settle = (target: number, onComplete?: () => void) => {
      if (reducedMotion) {
        dragY.set(target);
        onComplete?.();
        return;
      }
      animate(dragY, target, { type: "spring", stiffness: 380, damping: 32, onComplete });
    };

    if (offset < -SNAP_THRESHOLD || velocity < -480) {
      setSheetExpanded(true);
      settle(0);
    } else if (offset > SNAP_THRESHOLD || velocity > 480) {
      if (expanded) {
        setSheetExpanded(false);
        settle(0);
      } else if (offset > SNAP_THRESHOLD * 1.5 || velocity > 700) {
        settle(window.innerHeight, onClose);
      } else {
        settle(0);
      }
    } else {
      settle(0);
    }
  }, [expanded, onClose, dragY, reducedMotion, setSheetExpanded]);

  useEffect(() => { dragY.set(0); setSheetExpanded(false); }, [selected.id, dragY, setSheetExpanded]);

  const facilities = ["Lecture Rooms"];

  return (
    <motion.div
      data-no-drag
      data-testid="mobile-building-sheet"
      ref={sheetRef}
      className="md:hidden fixed inset-x-3 z-[60] will-change-transform transition-[height] duration-[220ms] ease-out motion-reduce:transition-none landscape-minimized"
      style={{
        bottom: "calc(4.75rem + env(safe-area-inset-bottom, 0px))",
        height: expanded ? "84dvh" : "58dvh",
        maxHeight: "calc(100dvh - 5.25rem - env(safe-area-inset-bottom, 0px))",
        y: dragY,
        opacity: sheetOpacity,
        scale: sheetScale,
      }}
      drag="y"
      dragControls={controls}
      dragListener={false}
      dragConstraints={{ top: -100, bottom: 260 }}
      dragElastic={0.2}
      onDragEnd={handleDragEnd}
      initial={reducedMotion ? false : { y: "100%", opacity: 0.98 }}
      animate={{ y: 0, opacity: 1 }}
      exit={reducedMotion ? { opacity: 0 } : { y: "100%", opacity: 0 }}
      transition={reducedMotion ? { duration: 0.01 } : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.div
        className="flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-border bg-card/96 backdrop-blur-2xl"
        style={{ borderRadius, boxShadow: "0 8px 36px rgba(0,0,0,0.2), 0 2px 12px rgba(0,0,0,0.12)" }}
      >
        {/* Building image header */}
        {selected.image_url && (
          <div data-building-sheet-image className="relative h-14 shrink-0 overflow-hidden">
            <img src={selected.image_url} alt={selected.name} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          </div>
        )}

        {/* Drag handle */}
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse building details" : "Expand building details"}
          className="flex h-8 shrink-0 touch-none cursor-grab items-center justify-center active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50"
          onPointerDown={(e) => {
            handlePointerStartRef.current = { x: e.clientX, y: e.clientY };
            controls.start(e);
          }}
          onPointerCancel={() => { handlePointerStartRef.current = null; }}
          onClick={(e) => {
            const start = handlePointerStartRef.current;
            handlePointerStartRef.current = null;
            // A swipe snaps the sheet; it should not also be treated as a tap.
            if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) return;
            setSheetExpanded(!expanded);
          }}
        >
          <div className="w-9 h-1 rounded-full bg-muted-foreground/20" />
        </button>

        {/* Header — building code + name + close */}
        <div className="flex items-start justify-between px-4 pb-3 shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] font-mono font-extrabold px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                {selected.code}
              </span>
              <span className="text-xs text-muted-foreground capitalize">{selected.category}</span>
            </div>
            <h2 className="text-lg font-extrabold text-foreground leading-tight truncate pr-2">
              {selected.name}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full bg-muted/80 flex items-center justify-center shrink-0 ml-2 hover:bg-muted active:scale-90 transition-all"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Horizontal action buttons — Google Maps style */}
        <div className="grid shrink-0 grid-cols-4 gap-1.5 px-3 pb-2">
          <button
            onClick={() => onDirections(selected)}
            className="flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-xl bg-primary px-1 text-[10px] font-bold text-primary-foreground shadow-sm transition-[transform,background-color] duration-150 hover:bg-primary/90 active:scale-[0.98]"
          >
            <Navigation className="h-4 w-4" />
            Directions
          </button>

          {hasFloorPlans && (
            <button
              onClick={() => onFloorPlan(selected)}
              className="flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border border-border bg-muted px-1 text-[10px] font-bold text-muted-foreground transition-[transform,background-color] duration-150 hover:bg-secondary active:scale-[0.98]"
            >
              <Layers className="h-4 w-4" />
              Floor Plan
            </button>
          )}

          {studentAuth.isStudent ? (() => {
            const isSaved = saved.has(selected.id) || (Boolean(selected.code) && (saved.has(selected.code) || saved.has(selected.code.toLowerCase())));
            return (
              <button
                onClick={() => onSave(selected.id)}
                className={cn(
                  "flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-1 text-[10px] font-bold transition-[transform,background-color] duration-150 active:scale-[0.98]",
                  isSaved
                    ? "bg-accent/15 text-accent border-accent/30"
                    : "bg-muted text-muted-foreground border-border hover:bg-secondary"
                )}
              >
                <Bookmark className={cn("h-4 w-4", isSaved && "fill-current")} />
                {isSaved ? "Saved" : "Save"}
              </button>
            );
          })() : (
            <button
              onClick={() => onSignInPrompt("save locations")}
                className="flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border/60 bg-muted/60 px-1 text-[10px] font-semibold text-muted-foreground/80"
            >
              <Bookmark className="h-4 w-4" />
              Save
            </button>
          )}

          {studentAuth.isStudent ? (
            <button
              onClick={() => onReport(selected)}
              className="flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border border-border bg-muted px-1 text-[10px] font-bold text-muted-foreground transition-[transform,background-color,color] duration-150 hover:bg-destructive/10 hover:text-destructive active:scale-[0.98]"
            >
              <Flag className="h-4 w-4" />
              Report
            </button>
          ) : (
            <button
              onClick={() => onSignInPrompt("report issues")}
              className="flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border/60 bg-muted/60 px-1 text-[10px] font-semibold text-muted-foreground/80"
            >
              <Flag className="h-4 w-4" />
              Report
            </button>
          )}
        </div>

        {hasFloorPlans && (
          <button
            type="button"
            onClick={() => onFloorPlan(selected)}
            className="mx-3 mb-2 flex min-h-10 shrink-0 items-center justify-between rounded-xl border border-primary/15 bg-primary/5 px-3 text-left transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          >
            <span className="flex items-center gap-2 text-xs font-bold text-primary"><Layers className="h-4 w-4" />View Floor Plan</span>
            <span className="text-[10px] text-muted-foreground">Tap to explore</span>
          </button>
        )}

        {/* Scrollable content — description, hours, facilities */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 scrollbar-show-on-hover space-y-3" style={{ overscrollBehavior: "contain" }}>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {selected.description}
          </p>

          {selected.operating_hours && (
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground mb-1">Hours</p>
              <p className="text-sm text-foreground font-semibold">{selected.operating_hours}</p>
            </div>
          )}

          {/* Divider for cleaner look */}
          <div className="h-px bg-border/50" />

          {/* Compact meta info */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="font-semibold">Type: <span className="font-normal capitalize">{selected.category}</span></span>
            {(selected as any).floors?.length && (
              <span className="font-semibold">Floors: <span className="font-normal">{(selected as any).floors.length}</span></span>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

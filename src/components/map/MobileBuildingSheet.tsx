import { useRef, useCallback, useEffect } from "react";
import { X, Navigation, Layers, Bookmark, Flag, GripVertical } from "lucide-react";
import { motion, useMotionValue, useTransform, animate, useDragControls } from "motion/react";
import type { Building } from "../../types";
import { cn } from "../../lib/utils";
import { MOCK_BUILDINGS } from "../../data/mockData";

interface MobileBuildingSheetProps {
  selected: Building;
  onClose: () => void;
  onDirections: (b: Building) => void;
  onFloorPlan: (b: Building) => void;
  onSave: (id: string) => void;
  onReport: (b: Building) => void;
  onSignInPrompt: (msg: string) => void;
  saved: Set<string>;
  studentAuth: { username: string; role: "student" | "faculty" } | null;
  hasFloorPlans: boolean;
}

const SHEET_HEIGHT = 55; // vh
const SNAP_THRESHOLD = 80; // px drag to close

export function MobileBuildingSheet({
  selected, onClose, onDirections, onFloorPlan, onSave, onReport,
  onSignInPrompt, saved, studentAuth, hasFloorPlans,
}: MobileBuildingSheetProps) {
  const controls = useDragControls();
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragY = useMotionValue(0);
  const sheetOpacity = useTransform(dragY, [0, SNAP_THRESHOLD * 2], [1, 0]);
  const sheetScale = useTransform(dragY, [0, SNAP_THRESHOLD * 2], [1, 0.92]);
  const borderRadius = useTransform(dragY, [0, SNAP_THRESHOLD * 2], [24, 28]);

  const handleDragEnd = useCallback((_: any, info: any) => {
    const offset = info.offset.y;
    const velocity = info.velocity.y;
    if (offset > SNAP_THRESHOLD || velocity > 400) {
      animate(dragY, SHEET_HEIGHT * window.innerHeight / 100 * 0.6, {
        type: "spring",
        stiffness: 300,
        damping: 25,
        onComplete: onClose,
      });
    } else {
      animate(dragY, 0, { type: "spring", stiffness: 400, damping: 30 });
    }
  }, [onClose, dragY]);

  // Reset drag position when selection changes
  useEffect(() => {
    dragY.set(0);
  }, [selected.id, dragY]);

  const STATUS: Record<string, "Open" | "Busy" | "Closed"> = {
    b1: "Open", b2: "Open", b3: "Open", b4: "Open", b5: "Busy", b6: "Open",
  };
  const STATUS_DOT = { Open: "bg-green-500", Busy: "bg-amber-500", Closed: "bg-red-500" as const };
  const STATUS_COLOR = { Open: "text-green-500", Busy: "text-amber-500", Closed: "text-red-500" as const };
  const status = STATUS[selected.id] ?? "Open";

  return (
    <motion.div
      ref={sheetRef}
      data-no-drag
      className="md:hidden fixed inset-x-0 z-40 will-change-transform"
      style={{
        bottom: "76px",
        y: dragY,
        opacity: sheetOpacity,
        scale: sheetScale,
      }}
      drag="y"
      dragControls={controls}
      dragListener={false}
      dragConstraints={{ top: 0, bottom: 200 }}
      dragElastic={0.2}
      onDragEnd={handleDragEnd}
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", stiffness: 400, damping: 30, mass: 0.9 }}
    >
      <div
        className="bg-card/96 backdrop-blur-2xl border-t border-border shadow-2xl overflow-hidden flex flex-col"
        style={{
          borderRadius,
          maxHeight: `${SHEET_HEIGHT}vh`,
        }}
      >
        {/* Drag handle */}
        <div
          className="flex items-center justify-center pt-2 pb-1 shrink-0 cursor-grab active:cursor-grabbing touch-none"
          onPointerDown={(e) => controls.start(e)}
        >
          <motion.div
            className="w-10 h-1 rounded-full bg-muted-foreground/25 hover:bg-muted-foreground/40 transition-colors"
            whileTap={{ scale: 1.3 }}
          />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-4 pb-2 shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="bg-primary/90 text-primary-foreground text-[10px] font-mono font-extrabold px-1.5 py-0.5 rounded">
                {selected.code}
              </span>
              <span className={cn("flex items-center gap-1 text-[10px] font-bold", STATUS_COLOR[status])}>
                <span className={cn("w-1.5 h-1.5 rounded-full", STATUS_DOT[status])} />
                {status}
              </span>
            </div>
            <h3 className="font-extrabold text-foreground text-base leading-tight truncate pr-2" style={{ fontFamily: "var(--font-sans)" }}>
              {selected.name}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 ml-2 hover:bg-muted-foreground/20 active:scale-90 transition-all"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-4 gap-2 px-4 pb-3 border-b border-border shrink-0">
          <motion.button
            whileTap={{ scale: 0.93 }}
            onClick={() => onDirections(selected)}
            className="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-primary text-primary-foreground text-[10px] font-extrabold active:brightness-110 transition-all"
          >
            <Navigation className="h-4 w-4" /> Dir.
          </motion.button>
          {hasFloorPlans && (
            <motion.button
              whileTap={{ scale: 0.93 }}
              onClick={() => onFloorPlan(selected)}
              className="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-muted text-muted-foreground text-[10px] font-extrabold border border-border active:bg-secondary transition-colors"
            >
              <Layers className="h-4 w-4" /> Floors
            </motion.button>
          )}
          {studentAuth ? (
            <motion.button
              whileTap={{ scale: 0.93 }}
              onClick={() => onSave(selected.id)}
              className={cn(
                "flex flex-col items-center gap-1.5 py-3 rounded-2xl text-[10px] font-extrabold border transition-all",
                saved.has(selected.id)
                  ? "bg-accent/15 text-accent border-accent/30"
                  : "bg-muted text-muted-foreground border-border active:bg-secondary"
              )}
            >
              <Bookmark className={cn("h-4 w-4", saved.has(selected.id) && "fill-current")} />
              {saved.has(selected.id) ? "Saved" : "Save"}
            </motion.button>
          ) : (
            <motion.button
              whileTap={{ scale: 0.93 }}
              onClick={() => onSignInPrompt("save locations")}
              className="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-muted/60 text-muted-foreground/50 text-[10px] font-semibold border border-dashed border-border/60"
            >
              <Bookmark className="h-4 w-4" /> Save
            </motion.button>
          )}
          {studentAuth ? (
            <motion.button
              whileTap={{ scale: 0.93 }}
              onClick={() => onReport(selected)}
              className="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-muted text-muted-foreground text-[10px] font-extrabold border border-border active:text-destructive active:bg-destructive/5 transition-colors"
            >
              <Flag className="h-4 w-4" /> Report
            </motion.button>
          ) : (
            <motion.button
              whileTap={{ scale: 0.93 }}
              onClick={() => onSignInPrompt("report issues")}
              className="flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-muted/60 text-muted-foreground/50 text-[10px] font-semibold border border-dashed border-border/60"
            >
              <Flag className="h-4 w-4" /> Report
            </motion.button>
          )}
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 px-4 py-3 scrollbar-show-on-hover" style={{ overscrollBehavior: "contain" }}>
          <p className="text-sm text-muted-foreground leading-relaxed" style={{ fontFamily: "var(--font-body)" }}>
            {selected.description}
          </p>
          {selected.operating_hours && (
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground mb-1">Hours</p>
              <p className="text-sm text-foreground font-semibold">{selected.operating_hours}</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

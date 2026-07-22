import { useRef, useCallback, useEffect } from "react";
import { X, Navigation, Bookmark, Layers, Flag } from "lucide-react";
import { motion, useMotionValue, useTransform, animate, useDragControls } from "motion/react";
import type { Building } from "../../types";
import { cn } from "../../lib/utils";

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

const SHEET_HEIGHT = 55;
const SNAP_THRESHOLD = 80;

export function MobileBuildingSheet({
  selected, onClose, onDirections, onFloorPlan, onSave, onReport,
  onSignInPrompt, saved, studentAuth, hasFloorPlans,
}: MobileBuildingSheetProps) {
  const controls = useDragControls();
  const dragY = useMotionValue(0);
  const sheetOpacity = useTransform(dragY, [0, SNAP_THRESHOLD * 2], [1, 0]);
  const sheetScale = useTransform(dragY, [0, SNAP_THRESHOLD * 2], [1, 0.92]);
  const borderRadius = useTransform(dragY, [0, SNAP_THRESHOLD * 2], [20, 24]);

  const handleDragEnd = useCallback((_: any, info: any) => {
    const offset = info.offset.y;
    const velocity = info.velocity.y;
    if (offset > SNAP_THRESHOLD || velocity > 400) {
      animate(dragY, SHEET_HEIGHT * window.innerHeight / 100 * 0.6, {
        type: "spring", stiffness: 300, damping: 25,
        onComplete: onClose,
      });
    } else {
      animate(dragY, 0, { type: "spring", stiffness: 400, damping: 30 });
    }
  }, [onClose, dragY]);

  useEffect(() => { dragY.set(0); }, [selected.id, dragY]);

  const facilities = ["Lecture Rooms"];

  return (
    <motion.div
      data-no-drag
      className="md:hidden fixed inset-x-0 z-40 will-change-transform landscape-minimized"
      style={{
        bottom: 0,
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
        style={{ borderRadius, maxHeight: `${SHEET_HEIGHT}vh` }}
      >
        {/* Building image header */}
        {selected.image_url && (
          <div className="relative h-32 shrink-0 overflow-hidden">
            <img src={selected.image_url} alt={selected.name} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          </div>
        )}

        {/* Drag handle */}
        <div
          className="flex items-center justify-center pt-2.5 pb-1.5 shrink-0 cursor-grab active:cursor-grabbing touch-none"
          onPointerDown={(e) => controls.start(e)}
        >
          <div className="w-9 h-1 rounded-full bg-muted-foreground/20" />
        </div>

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
        <div className="flex items-center gap-2 px-4 pb-3 shrink-0 overflow-x-auto no-scrollbar">
          <button
            onClick={() => onDirections(selected)}
            className="flex items-center gap-1.5 h-9 px-4 rounded-full bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 active:scale-95 transition-all shrink-0"
          >
            <Navigation className="h-3.5 w-3.5" />
            Directions
          </button>

          {hasFloorPlans && (
            <button
              onClick={() => onFloorPlan(selected)}
              className="flex items-center gap-1.5 h-9 px-4 rounded-full bg-muted text-muted-foreground text-xs font-bold border border-border hover:bg-secondary active:scale-95 transition-all shrink-0"
            >
              <Layers className="h-3.5 w-3.5" />
              Floor Plan
            </button>
          )}

          {studentAuth ? (
            <button
              onClick={() => onSave(selected.id)}
              className={cn(
                "flex items-center gap-1.5 h-9 px-4 rounded-full text-xs font-bold border active:scale-95 transition-all shrink-0",
                saved.has(selected.id)
                  ? "bg-accent/15 text-accent border-accent/30"
                  : "bg-muted text-muted-foreground border-border hover:bg-secondary"
              )}
            >
              <Bookmark className={cn("h-3.5 w-3.5", saved.has(selected.id) && "fill-current")} />
              {saved.has(selected.id) ? "Saved" : "Save"}
            </button>
          ) : (
            <button
              onClick={() => onSignInPrompt("save locations")}
              className="flex items-center gap-1.5 h-9 px-4 rounded-full bg-muted/60 text-muted-foreground/50 text-xs font-semibold border border-dashed border-border/60 shrink-0"
            >
              <Bookmark className="h-3.5 w-3.5" />
              Save
            </button>
          )}

          {studentAuth ? (
            <button
              onClick={() => onReport(selected)}
              className="flex items-center gap-1.5 h-9 px-4 rounded-full bg-muted text-muted-foreground text-xs font-bold border border-border hover:bg-destructive/10 hover:text-destructive active:scale-95 transition-all shrink-0"
            >
              <Flag className="h-3.5 w-3.5" />
              Report
            </button>
          ) : (
            <button
              onClick={() => onSignInPrompt("report issues")}
              className="flex items-center gap-1.5 h-9 px-4 rounded-full bg-muted/60 text-muted-foreground/50 text-xs font-semibold border border-dashed border-border/60 shrink-0"
            >
              <Flag className="h-3.5 w-3.5" />
              Report
            </button>
          )}
        </div>

        {/* Scrollable content — description, hours, facilities */}
        <div className="overflow-y-auto flex-1 px-4 pb-5 scrollbar-show-on-hover space-y-3" style={{ overscrollBehavior: "contain" }}>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {selected.description}
          </p>

          {selected.operating_hours && (
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground mb-1">Hours</p>
              <p className="text-sm text-foreground font-semibold">{selected.operating_hours}</p>
            </div>
          )}

          {/* Floor plans shortcut */}
          {hasFloorPlans && (
            <button
              onClick={() => onFloorPlan(selected)}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-primary/5 border border-primary/15 hover:bg-primary/10 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <Layers className="h-4 w-4 text-primary shrink-0" />
                <span className="text-xs font-bold text-primary">View Floor Plan</span>
              </div>
              <span className="text-xs text-muted-foreground">Tap to explore</span>
            </button>
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
      </div>
    </motion.div>
  );
}

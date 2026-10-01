import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Layers } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { cn } from "../../lib/utils";

export interface StudentFloorOption {
  number: number;
  label: string;
}

interface StudentFloorPickerProps {
  buildingName: string;
  floors: readonly StudentFloorOption[];
  activeFloor: number;
  onSelect: (floorNumber: number) => void;
}

function compactFloorLabel(floor: StudentFloorOption | undefined) {
  if (!floor) return "Floor";
  if (/ground|lobby|ground level/i.test(floor.label)) return "G/F";
  const number = floor.label.match(/\d+/)?.[0] ?? String(floor.number);
  if (/basement|sublevel/i.test(floor.label)) return `B${number}`;
  if (/mezzanine/i.test(floor.label)) return "MZ";
  return `${number}F`;
}

export function StudentFloorPicker({ buildingName, floors, activeFloor, onSelect }: StudentFloorPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const reducedMotion = useReducedMotion();
  const current = floors.find((floor) => floor.number === activeFloor) ?? floors[0];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (open) optionRefs.current[floors.findIndex((floor) => floor.number === activeFloor)]?.focus();
  }, [open, activeFloor, floors]);

  if (floors.length < 2 || !current) return null;

  const moveFocus = (index: number, direction: -1 | 1) => {
    const next = (index + direction + floors.length) % floors.length;
    optionRefs.current[next]?.focus();
  };

  return (
    <div
      ref={rootRef}
      data-testid="student-floor-picker"
      data-no-drag
      className="absolute bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] left-3 z-30 md:bottom-6 md:left-1/2 md:-translate-x-1/2"
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Choose floor. Current floor: ${current.label}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="flex min-h-11 max-w-[calc(100vw-7rem)] items-center gap-2 rounded-2xl border border-white/50 bg-card/95 px-3.5 text-xs font-bold text-foreground shadow-[0_6px_18px_rgba(15,23,42,0.14)] backdrop-blur-xl transition-[transform,background-color,box-shadow] duration-150 hover:bg-muted hover:shadow-lg active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 dark:border-white/10 md:max-w-[min(400px,calc(100vw-2rem))] md:px-4"
      >
        <Layers className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="max-w-[calc(100vw-10rem)] truncate md:hidden">Floor · {compactFloorLabel(current)}</span>
        <span className="hidden max-w-[350px] truncate md:inline">{buildingName} · {current.label}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150", open && "rotate-180")} aria-hidden="true" />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="student-floor-options"
            role="listbox"
            aria-label={`Floors in ${buildingName}`}
            initial={reducedMotion ? false : { opacity: 0, y: 5, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.985 }}
            transition={reducedMotion ? { duration: 0.01 } : { duration: 0.16, ease: "easeOut" }}
            className="absolute bottom-full left-0 mb-2 max-h-[min(22rem,calc(100dvh-12rem))] w-[min(19rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl border border-border/70 bg-card/98 p-1.5 text-foreground shadow-2xl backdrop-blur-xl md:left-1/2 md:w-72 md:-translate-x-1/2"
          >
            <p className="px-3 pb-1.5 pt-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">Choose floor</p>
            {floors.map((floor, index) => {
              const selected = floor.number === activeFloor;
              return (
                <button
                  key={`${floor.number}:${floor.label}`}
                  ref={(element) => { optionRefs.current[index] = element; }}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => { onSelect(floor.number); setOpen(false); triggerRef.current?.focus(); }}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") { event.preventDefault(); moveFocus(index, 1); }
                    if (event.key === "ArrowUp") { event.preventDefault(); moveFocus(index, -1); }
                    if (event.key === "Home") { event.preventDefault(); optionRefs.current[0]?.focus(); }
                    if (event.key === "End") { event.preventDefault(); optionRefs.current[floors.length - 1]?.focus(); }
                  }}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50",
                    selected ? "bg-primary/8 font-bold text-primary" : "font-medium text-foreground hover:bg-muted",
                  )}
                >
                  <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-extrabold", selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                    {compactFloorLabel(floor)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{floor.label}</span>
                  {selected && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

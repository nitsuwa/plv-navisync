import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpDown, DoorOpen, Footprints, Layers2 } from "lucide-react";
import type { StudentRouteExploreTransitionChoice, StudentRouteTransitionKind } from "../../lib/studentRouteFlow";

interface StudentExploreTransitionChoiceControlProps {
  kind: StudentRouteTransitionKind;
  choices: readonly StudentRouteExploreTransitionChoice[];
  /** Optional pointer/gesture guard. Must not execute a transition choice. */
  canOpen?: () => boolean;
  className?: string;
  testId?: string;
}

function kindLabel(kind: StudentRouteTransitionKind): string {
  if (kind === "elevator") return "Elevator options";
  if (kind === "stairs") return "Stair options";
  return "Building access options";
}

function OptionIcon({ kind }: { kind: StudentRouteTransitionKind }) {
  if (kind === "elevator") return <ArrowUpDown aria-hidden="true" className="h-4 w-4 shrink-0" />;
  if (kind === "stairs") return <Footprints aria-hidden="true" className="h-4 w-4 shrink-0" />;
  return <DoorOpen aria-hidden="true" className="h-4 w-4 shrink-0" />;
}

/** Compact, keyboard-operable choice control shared by the SVG and Three.js
 * Explore markers. It changes only the inspected map view through each cue's
 * existing view-only callback. */
export function StudentExploreTransitionChoiceControl({
  kind,
  choices,
  canOpen,
  className,
  testId = "student-explore-transition-choice-control",
}: StudentExploreTransitionChoiceControlProps) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number; width: number } | null>(null);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstOptionRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      setMenuPosition(null);
      return;
    }
    const placeMenu = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const width = Math.max(180, Math.min(256, viewportWidth - 24));
      const height = Math.max(160, Math.min(260, viewportHeight - 24));
      const left = Math.max(12, Math.min(viewportWidth - width - 12, rect.left + rect.width / 2 - width / 2));
      const roomBelow = viewportHeight - rect.bottom;
      const top = roomBelow >= height + 8 || rect.top < height + 20
        ? Math.max(12, Math.min(viewportHeight - height - 12, rect.bottom + 8))
        : Math.max(12, rect.top - height - 8);
      setMenuPosition({ left, top, width });
    };
    placeMenu();
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      // The map has a global Escape shortcut that exits an indoor Floor. The
      // menu owns this key while open; let it dismiss and restore focus without
      // allowing the same keystroke to change the inspected route context.
      event.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    const focusFrame = requestAnimationFrame(() => firstOptionRef.current?.focus());
    window.addEventListener("resize", placeMenu);
    window.addEventListener("scroll", placeMenu, true);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", placeMenu);
      window.removeEventListener("scroll", placeMenu, true);
    };
  }, [open]);

  const kinds = new Set(choices.map((choice) => choice.kind));
  const triggerLabel = `${kinds.size > 1 ? "Transition options" : kindLabel(kind)}: ${choices.length} destinations`;
  return (
    <div
      ref={rootRef}
      data-testid={testId}
      className={`relative h-11 w-11 ${className ?? ""}`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={triggerLabel}
        aria-haspopup="menu"
        aria-controls={menuId}
        aria-expanded={open}
        title={triggerLabel}
        onClick={() => {
          if (canOpen && !canOpen()) return;
          setOpen((value) => !value);
        }}
        className="relative grid h-11 w-11 place-items-center rounded-full border border-white/90 bg-slate-950/90 text-white shadow-[0_5px_18px_rgba(15,23,42,.28)] ring-1 ring-sky-300/80 transition duration-150 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white motion-reduce:transition-none"
      >
        {choices.length > 1 ? <Layers2 aria-hidden="true" className="h-[18px] w-[18px]" /> : <OptionIcon kind={kind} />}
        <span aria-hidden="true" className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full border-2 border-white bg-sky-600 px-0.5 text-[9px] font-black leading-none text-white shadow-sm">
          {choices.length}
        </span>
      </button>
      {open && menuPosition && createPortal(<div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={triggerLabel}
          data-testid="student-explore-transition-choice-menu"
          style={{ position: "fixed", left: menuPosition.left, top: menuPosition.top, width: menuPosition.width, maxHeight: "min(16rem, calc(100dvh - 1.5rem))", zIndex: 10000 }}
          className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 p-1.5 text-slate-800 shadow-[0_14px_40px_rgba(15,23,42,.22)] backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150 dark:border-slate-700 dark:bg-slate-900/96 dark:text-slate-100 motion-reduce:animate-none motion-reduce:transition-none"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="px-2.5 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
            Choose a transition
          </div>
          <div className="max-h-52 overflow-y-auto">
            {choices.map((choice, index) => (
              <button
                ref={index === 0 ? firstOptionRef : undefined}
                key={`${choice.id}:${index}`}
                type="button"
                role="menuitem"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setOpen(false);
                  choice.onActivate();
                }}
                className="flex min-h-11 w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[12px] font-semibold leading-snug text-slate-700 transition-colors hover:bg-sky-50 focus-visible:bg-sky-50 focus-visible:outline-none dark:text-slate-100 dark:hover:bg-slate-800 dark:focus-visible:bg-slate-800 motion-reduce:transition-none"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                  <OptionIcon kind={choice.kind} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block line-clamp-2">{choice.displayLabel ?? choice.label}</span>
                  {choice.displayLabel && choice.label !== choice.displayLabel && (
                    <span className="mt-0.5 block line-clamp-1 text-[9px] font-medium text-slate-500 dark:text-slate-400">{choice.label}</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>, document.body)}
    </div>
  );
}

import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Check, ChevronDown, DoorOpen, Route, X } from "lucide-react";
import { cn } from "../../lib/utils";

export interface EmergencyRoutePickerOption {
  value: string;
  doorLabel: string;
  exitLabel: string;
  destinationLabel?: string;
  distanceM: number;
  transitions?: string[];
  kind?: "emergency_exit" | "exterior_stair" | "entrance" | "general";
  readinessLabel?: string;
  disabledReason?: string;
}

interface EmergencyRoutePickerProps {
  label: string;
  value: string;
  selectedTitle?: string;
  options: EmergencyRoutePickerOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  unavailableLabel?: string;
  emptyMessage?: string;
  testId?: string;
}

/**
 * Compact, inline listbox for complex route choices. Keeping the option list
 * in normal sidebar flow prevents long route descriptions from expanding a
 * portal/menu across the map canvas and naturally adapts to narrow screens.
 */
export function EmergencyRoutePicker({
  label,
  value,
  selectedTitle,
  options,
  onChange,
  disabled = false,
  unavailableLabel,
  emptyMessage = "Validate routes to load connected candidates.",
  testId,
}: EmergencyRoutePickerProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();
  const triggerId = useId();
  const activeOptionId = open && options[activeIndex] ? `${listboxId}-option-${activeIndex}` : undefined;
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: globalThis.MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsidePointer);
    return () => document.removeEventListener("mousedown", closeOnOutsidePointer);
  }, [open]);

  const openList = (preferLast = false) => {
    const selectedIndex = options.findIndex((option) => option.value === value && !option.disabledReason);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : preferLast ? Math.max(options.length - 1, 0) : 0);
    setOpen(true);
  };

  const choose = (option: EmergencyRoutePickerOption) => {
    if (option.disabledReason) return;
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onRootKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || !open) return;
    event.preventDefault();
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) openList();
      else setActiveIndex((index) => Math.min(index + 1, options.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) openList(true);
      else setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Home" && open) {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End" && open) {
      event.preventDefault();
      setActiveIndex(Math.max(options.length - 1, 0));
    } else if ((event.key === "Enter" || event.key === " ") && open) {
      event.preventDefault();
      const option = options[activeIndex];
      if (option) choose(option);
    }
  };

  const onOptionPointerMove = (_event: MouseEvent<HTMLDivElement>, index: number) => {
    setActiveIndex(index);
  };

  return (
    <div ref={rootRef} className="relative min-w-0 max-w-full" data-testid={testId} onKeyDown={onRootKeyDown} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
    }}>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={activeOptionId}
        aria-describedby={`${triggerId}-hint`}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          "flex min-h-11 w-full min-w-0 max-w-full items-center gap-2 rounded-xl border bg-background px-3 py-2 text-left transition-colors",
          open ? "border-primary/50 ring-2 ring-primary/15" : "border-border hover:border-primary/35",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        <Route className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-[11px] font-bold", selected ? "text-foreground" : "text-muted-foreground")}>
            {selected ? selectedTitle?.trim() || `${selected.doorLabel} → ${selected.exitLabel}` : unavailableLabel ?? "Choose an evacuation route"}
          </span>
          <span className="mt-0.5 block truncate text-[9px] text-muted-foreground">
            {selected ? `Start: ${selected.doorLabel} · Destination: ${selected.exitLabel}${selected.destinationLabel ? ` · via ${selected.destinationLabel}` : ""}` : "Select from validated graph routes"}
          </span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      <span id={`${triggerId}-hint`} className="sr-only">Use Up and Down Arrow keys to inspect routes, Enter to select, and Escape to close.</span>

      {open && (
        <div className="mt-2 w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-border bg-card shadow-lg" data-testid={`${testId ?? "emergency-route-picker"}-menu`}>
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold text-foreground">Available graph routes</p>
              <p className="text-[9px] text-muted-foreground">Connected routes require Admin review.</p>
            </div>
            <button type="button" aria-label={`Close ${label} options`} onClick={() => setOpen(false)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          <div className="p-2 pb-0">
            <button type="button" onClick={() => choose({ value: "", doorLabel: "", exitLabel: "", distanceM: 0 })} className="flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[9px] font-semibold text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
              <X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Clear this route selection</span>
            </button>
          </div>
          <div id={listboxId} role="listbox" aria-labelledby={triggerId} className="max-h-60 space-y-1 overflow-y-auto p-2 pt-1 overscroll-contain">
            {options.length === 0 ? (
              <p className="px-3 py-4 text-center text-[10px] leading-relaxed text-muted-foreground">{emptyMessage}</p>
            ) : options.map((option, index) => {
              const isSelected = option.value === value;
              const isActive = index === activeIndex;
              const transition = option.transitions?.[0];
              return (
                <div
                  key={option.value}
                  id={`${listboxId}-option-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={Boolean(option.disabledReason)}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseMove={(event) => onOptionPointerMove(event, index)}
                  onClick={() => choose(option)}
                  className={cn(
                    "min-w-0 cursor-pointer rounded-lg border px-2.5 py-2.5 transition-colors",
                    isSelected ? "border-primary/35 bg-primary/5" : "border-transparent hover:bg-muted/70",
                    isActive && !option.disabledReason && "ring-1 ring-primary/25",
                    option.disabledReason && "cursor-not-allowed opacity-55",
                  )}
                >
                  <div className="flex min-w-0 items-start gap-2">
                    <DoorOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-[10px] font-bold leading-snug text-foreground">{option.doorLabel} → {option.exitLabel}</p>
                      <p className="mt-1 break-words text-[9px] leading-snug text-muted-foreground">
                        {option.destinationLabel ? `Destination: ${option.destinationLabel}` : option.kind === "general" ? "General entrance fallback" : "Connected graph route"}
                        {Number.isFinite(option.distanceM) ? ` · ${Math.round(option.distanceM)} m` : ""}
                      </p>
                      {option.readinessLabel && <p className="mt-1 break-words text-[9px] font-semibold leading-snug text-amber-700 dark:text-amber-300">{option.readinessLabel}</p>}
                      {option.kind === "general" && <p className="mt-1 break-words text-[9px] leading-snug text-amber-700 dark:text-amber-300">General entrance fallback · Admin review required</p>}
                      {transition && <p className="mt-1 break-words text-[9px] leading-snug text-muted-foreground">{transition}</p>}
                      {option.disabledReason && <p className="mt-1 break-words text-[9px] font-semibold leading-snug text-amber-700 dark:text-amber-300">{option.disabledReason}</p>}
                    </div>
                    {isSelected && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

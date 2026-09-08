import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "../../lib/utils";

export interface CompactDropdownOption<T extends string = string> {
  value: T;
  label: string;
}

interface CompactDropdownProps<T extends string = string> {
  value: T;
  options: CompactDropdownOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  id?: string;
  className?: string;
  testId?: string;
  disabled?: boolean;
}

/**
 * Small shared listbox used by the editor's architectural controls.  The
 * menu is portalled and positioned from the trigger so it cannot be clipped
 * by an editor sidebar or an overflow-hidden library column.
 */
export function CompactDropdown<T extends string = string>({
  value,
  options,
  onChange,
  ariaLabel,
  id,
  className,
  testId,
  disabled = false,
}: CompactDropdownProps<T>) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, options.findIndex((option) => option.value === value)));
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties | null>(null);
  const listId = useId();
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const selected = options[selectedIndex] ?? options[0];

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger || typeof window === "undefined") return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.max(rect.width, 148);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const estimatedHeight = Math.min(280, Math.max(36, options.length * 32 + 8));
    const below = window.innerHeight - rect.bottom - 8;
    const above = rect.top - 8;
    const placeAbove = below < Math.min(estimatedHeight, 220) && above > below;
    setMenuStyle({
      position: "fixed",
      zIndex: 220,
      left,
      width,
      ...(placeAbove
        ? { bottom: Math.max(8, window.innerHeight - rect.top + 4) }
        : { top: rect.bottom + 4 }),
      maxHeight: Math.max(120, Math.min(280, placeAbove ? above : below)),
    });
  }, [options.length]);

  useLayoutEffect(() => {
    if (!open) return;
    setActiveIndex(selectedIndex);
    updatePosition();
  }, [open, selectedIndex, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    const onViewportChange = () => updatePosition();
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [open, updatePosition]);

  const choose = (next: T) => {
    onChange(next);
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  // A few legacy editor integrations (and older tests) dispatch a native
  // `change` event against the combobox trigger rather than opening the
  // listbox. Buttons do not participate in React's ChangeEventPlugin, so keep
  // that compatibility at the DOM boundary without introducing a native
  // browser-looking <select> into the UI.
  useEffect(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const onNativeChange = (event: Event) => {
      const next = (event.target as HTMLButtonElement).value as T;
      if (next && next !== value && options.some((option) => option.value === next)) choose(next);
    };
    trigger.addEventListener("change", onNativeChange);
    return () => trigger.removeEventListener("change", onNativeChange);
  }, [options, value, onChange]);

  const onTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!open) {
        setActiveIndex(selectedIndex);
        setOpen(true);
      } else {
        setActiveIndex((index) => event.key === "ArrowUp"
          ? (index - 1 + options.length) % options.length
          : (index + 1) % options.length);
      }
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
    }
  };

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => event.key === "ArrowUp"
        ? (index - 1 + options.length) % options.length
        : (index + 1) % options.length);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setActiveIndex(event.key === "Home" ? 0 : Math.max(0, options.length - 1));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const option = options[activeIndex];
      if (option) choose(option.value);
    } else if (event.key === "Escape" || event.key === "Tab") {
      setOpen(false);
      triggerRef.current?.focus();
    }
  };

  useEffect(() => {
    if (!open) return;
    const option = menuRef.current?.querySelector<HTMLElement>(`[data-option-index="${activeIndex}"]`);
    if (option && typeof option.scrollIntoView === "function") option.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => menuRef.current?.focus());
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        id={id}
        aria-label={ariaLabel}
        value={value}
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        data-testid={testId}
        onClick={() => !disabled && setOpen((current) => !current)}
        // Keep the shared trigger compatible with existing form tests and
        // integrations that dispatch a change event, while normal users use
        // the keyboard/listbox interaction above.
        onChange={(event) => {
          const next = (event.target as HTMLButtonElement).value as T;
          if (options.some((option) => option.value === next)) choose(next);
        }}
        onKeyDown={onTriggerKeyDown}
        className={cn("flex h-7 w-full items-center justify-between gap-1 rounded-md border border-border bg-input-background px-2 text-left text-[10px] text-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50", className)}
      >
        <span className="min-w-0 truncate">{selected?.label ?? "Select"}</span>
        <ChevronDown className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open && menuStyle && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          tabIndex={0}
          onKeyDown={onMenuKeyDown}
          style={menuStyle}
          className="overflow-y-auto rounded-lg border border-border bg-card p-1 text-card-foreground shadow-xl outline-none"
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isActive = index === activeIndex;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                data-option-index={index}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option.value)}
                className={cn("flex min-h-7 w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[10px] transition-colors", isActive ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted", isSelected && "font-bold")}
              >
                <span className="truncate">{option.label}</span>
                {isSelected && <Check className="h-3 w-3 shrink-0" aria-hidden="true" />}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}

import * as Dialog from "@radix-ui/react-dialog";
import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown, X } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "../../lib/utils";

export interface EventLocationSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  description?: string;
}
export interface EventLocationSelectProps {
  label: string;
  value: string;
  options: EventLocationSelectOption[];
  onChange(value: string): void;
  disabled?: boolean;
  searchable?: boolean;
}

const triggerClass =
  "flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-border bg-input-background px-4 text-left text-sm text-foreground shadow-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50";

function useNarrowViewport() {
  const [isNarrow, setIsNarrow] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia?.("(max-width: 639px)").matches ?? window.innerWidth < 640;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(max-width: 639px)");
    const update = () => setIsNarrow(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  return isNarrow;
}

export function EventLocationSelect({
  label,
  value,
  options,
  onChange,
  disabled = false,
  searchable = false,
}: EventLocationSelectProps) {
  const isNarrow = useNarrowViewport();
  const id = useId();
  const listboxId = `${id}-options`;
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedOption = options.find((option) => option.value === value);
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!searchable || !normalizedQuery) return options;
    return options.filter((option) =>
      `${option.label} ${option.description ?? ""}`.toLocaleLowerCase().includes(normalizedQuery)
    );
  }, [options, query, searchable]);
  const firstEnabledValue = filteredOptions.find((option) => !option.disabled)?.value ?? "";
  const [activeValue, setActiveValue] = useState(value);

  const openMenu = useCallback(() => {
    setQuery("");
    setActiveValue(
      selectedOption && !selectedOption.disabled
        ? selectedOption.value
        : options.find((option) => !option.disabled)?.value ?? "",
    );
    setOpen(true);
  }, [options, selectedOption?.value]);

  useEffect(() => {
    if (!open) return;
    if (searchable) searchInputRef.current?.focus();
    else listboxRef.current?.focus();
  }, [open, searchable]);

  useEffect(() => {
    if (!filteredOptions.some((option) => option.value === activeValue && !option.disabled)) {
      setActiveValue(firstEnabledValue);
    }
  }, [activeValue, filteredOptions, firstEnabledValue]);

  const closeMenu = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) setQuery("");
  }, []);

  const chooseOption = useCallback((option: EventLocationSelectOption) => {
    if (option.disabled) return;
    onChange(option.value);
    closeMenu(false);
  }, [closeMenu, onChange]);

  const moveActive = useCallback((direction: 1 | -1) => {
    const enabled = filteredOptions.filter((option) => !option.disabled);
    if (enabled.length === 0) return;
    const currentIndex = enabled.findIndex((option) => option.value === activeValue);
    const nextIndex = currentIndex < 0
      ? (direction > 0 ? 0 : enabled.length - 1)
      : (currentIndex + direction + enabled.length) % enabled.length;
    setActiveValue(enabled[nextIndex].value);
  }, [activeValue, filteredOptions]);

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      if (!open) openMenu();
      else if (event.key === "ArrowDown") moveActive(1);
      else if (event.key === "ArrowUp") moveActive(-1);
      else {
        const activeOption = filteredOptions.find((option) => option.value === activeValue);
        if (activeOption) chooseOption(activeOption);
      }
    }
  };

  const handleListKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const activeOption = filteredOptions.find((option) => option.value === activeValue);
      if (activeOption) chooseOption(activeOption);
    }
  };

  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      role="combobox"
      aria-label={label}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={listboxId}
      aria-activedescendant={open && activeValue ? `${listboxId}-${activeValue}` : undefined}
      disabled={disabled}
      onKeyDown={handleTriggerKeyDown}
      className={triggerClass}
    >
      <span className="min-w-0 flex-1 truncate" title={selectedOption?.label}>
        {selectedOption?.label ?? `Select ${label.toLocaleLowerCase()}`}
      </span>
      <ChevronDown aria-hidden="true" className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
    </button>
  );

  const optionList = (
    <>
      {searchable && (
        <div className="border-b border-border p-3">
          <input
            ref={searchInputRef}
            type="search"
            role="searchbox"
            aria-label={`Search ${label}`}
            aria-controls={listboxId}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              const first = options.find((option) => !option.disabled && `${option.label} ${option.description ?? ""}`.toLocaleLowerCase().includes(event.target.value.trim().toLocaleLowerCase()));
              setActiveValue(first?.value ?? "");
            }}
            onKeyDown={handleListKeyDown}
            placeholder={`Search ${label.toLocaleLowerCase()}...`}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>
      )}
      <div
        ref={listboxRef}
        id={listboxId}
        role="listbox"
        aria-label={label}
        aria-activedescendant={activeValue ? `${listboxId}-${activeValue}` : undefined}
        tabIndex={searchable ? -1 : 0}
        onKeyDown={handleListKeyDown}
        className="max-h-[min(20rem,var(--radix-popover-content-available-height,20rem))] overflow-y-auto overscroll-contain p-1.5 outline-none"
      >
        {filteredOptions.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">No results found.</p>
        ) : filteredOptions.map((option) => (
          <button
            key={option.value}
            id={`${listboxId}-${option.value}`}
            type="button"
            role="option"
            aria-selected={option.value === value}
            aria-disabled={option.disabled || undefined}
            disabled={option.disabled}
            tabIndex={-1}
            onMouseEnter={() => { if (!option.disabled) setActiveValue(option.value); }}
            onClick={() => chooseOption(option)}
            className={cn(
              "flex min-h-11 w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-foreground transition-colors",
              "whitespace-normal break-words focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              option.value === activeValue && "bg-primary/10",
              option.value === value && "font-semibold",
              option.disabled ? "cursor-not-allowed opacity-45" : "hover:bg-muted",
            )}
            title={option.label}
          >
            <span className="min-w-0 flex-1">
              <span className="block whitespace-normal break-words">{option.label}</span>
              {option.description && <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{option.description}</span>}
            </span>
            {option.value === value && <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
          </button>
        ))}
      </div>
    </>
  );

  return isNarrow ? (
    <Dialog.Root open={open} onOpenChange={closeMenu}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-background/65 backdrop-blur-[2px]" />
        <Dialog.Content
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            if (searchable) searchInputRef.current?.focus();
            else listboxRef.current?.focus();
          }}
          className="fixed inset-x-0 bottom-0 z-[81] flex flex-col overflow-hidden rounded-t-2xl border border-border bg-card text-foreground shadow-2xl focus:outline-none"
          style={{ maxHeight: "min(75dvh, 38rem)", paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
        >
          <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-4">
            <div className="min-w-0">
              <Dialog.Title className="truncate text-base font-bold">Choose {label}</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-muted-foreground">Select an option to continue.</Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" aria-label="Close options" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>
          {optionList}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  ) : (
    <Popover.Root open={open} onOpenChange={closeMenu}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            if (searchable) searchInputRef.current?.focus();
            else listboxRef.current?.focus();
          }}
          className="z-[81] w-[var(--radix-popover-trigger-width)] min-w-56 overflow-hidden rounded-xl border border-border bg-card text-foreground shadow-xl outline-none"
        >
          {optionList}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

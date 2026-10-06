import * as Popover from "@radix-ui/react-popover";
import { Check, Clock3 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";

const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function isValidThemedTime(value: string): boolean {
  return timePattern.test(value);
}

export function formatThemedTime(value: string): string {
  const hours = isValidThemedTime(value) ? Number(value.slice(0, 2)) : 9;
  const minutes = isValidThemedTime(value) ? value.slice(3) : "00";
  return `${hours % 12 || 12}:${minutes} ${hours >= 12 ? "PM" : "AM"}`;
}

function parseThemedTime(value: string) {
  const hours = isValidThemedTime(value) ? Number(value.slice(0, 2)) : 9;
  return {
    hour: hours % 12 || 12,
    minute: isValidThemedTime(value) ? value.slice(3) : "00",
    period: (hours >= 12 ? "PM" : "AM") as "AM" | "PM",
  };
}

function serializeThemedTime(hour: number, minute: string, period: "AM" | "PM") {
  const hour24 = hour % 12 + (period === "PM" ? 12 : 0);
  return `${String(hour24).padStart(2, "0")}:${minute}`;
}

const choiceClass = (selected: boolean) => cn(
  "flex min-h-10 w-full items-center justify-center gap-1 rounded-lg border px-2 text-xs font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
  selected
    ? "border-primary/35 bg-primary/15 text-primary shadow-sm"
    : "border-transparent text-foreground/80 hover:border-border hover:bg-card",
);

export function ThemedTimeField({
  label,
  value,
  onChange,
  disabled = false,
  className,
}: {
  label: string;
  /** Local wall-clock value in the existing HH:mm persistence format. */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => parseThemedTime(value));
  const contentRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const displayTime = formatThemedTime(value);
  const selectedTime = serializeThemedTime(draft.hour, draft.minute, draft.period);
  const updateDraft = (patch: Partial<typeof draft>) => setDraft((current) => ({ ...current, ...patch }));
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setDraft(parseThemedTime(value));
      setOpen(true);
      return;
    }
    if (selectedTime !== value) onChange(selectedTime);
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const inspector = triggerRef.current?.closest('[data-testid="properties-panel-content"]');
    const closeOnScroll = () => handleOpenChange(false);
    inspector?.addEventListener("scroll", closeOnScroll, { passive: true });
    window.addEventListener("resize", closeOnScroll);
    return () => {
      inspector?.removeEventListener("scroll", closeOnScroll);
      window.removeEventListener("resize", closeOnScroll);
    };
  }, [open, value, selectedTime]);

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          aria-label={`${label}: ${displayTime}`}
          className={cn(
            "flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-border bg-input-background px-3 text-left text-sm text-foreground transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
        >
          <span className="truncate">{displayTime}</span>
          <Clock3 aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          ref={contentRef}
          align="end"
          sideOffset={8}
          aria-label={`${label} time picker`}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            contentRef.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
          }}
          className="z-[120] rounded-xl border border-border p-4 text-card-foreground shadow-xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95"
          style={{ width: "min(19rem, calc(100vw - 2rem))", background: "color-mix(in srgb, var(--card) 90%, var(--primary) 10%)" }}
        >
          <div className="mb-4 flex items-center justify-between border-b border-border/70 pb-3">
            <div>
              <p className="text-sm font-bold text-foreground">Select time</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">Local campus time</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-xs font-bold tabular-nums text-primary">
              <Clock3 aria-hidden="true" className="h-3.5 w-3.5" />
              {formatThemedTime(selectedTime)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <p className="mb-2 px-1 text-[11px] font-bold text-foreground">Hour</p>
              <div aria-label="Hour" className="max-h-44 space-y-1 overflow-y-auto overscroll-contain rounded-xl border border-border/80 p-1.5 [scrollbar-width:thin]" style={{ background: "color-mix(in srgb, var(--muted) 55%, var(--card) 45%)" }}>
                {Array.from({ length: 12 }, (_, index) => index + 1).map((hour) => {
                  const selected = draft.hour === hour;
                  return (
                    <button
                      type="button"
                      key={hour}
                      aria-label={`${label} hour ${hour}`}
                      aria-pressed={selected}
                      onClick={() => updateDraft({ hour })}
                      className={choiceClass(selected)}
                    >
                      {String(hour).padStart(2, "0")}
                      {selected && <Check aria-hidden="true" className="h-3 w-3" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="min-w-0">
              <p className="mb-2 px-1 text-[11px] font-bold text-foreground">Minute</p>
              <div aria-label="Minute" className="max-h-44 space-y-1 overflow-y-auto overscroll-contain rounded-xl border border-border/80 p-1.5 [scrollbar-width:thin]" style={{ background: "color-mix(in srgb, var(--muted) 55%, var(--card) 45%)" }}>
                {Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0")).map((minute) => {
                  const selected = draft.minute === minute;
                  return (
                    <button
                      type="button"
                      key={minute}
                      aria-label={`${label} minute ${minute}`}
                      aria-pressed={selected}
                      onClick={() => updateDraft({ minute })}
                      className={choiceClass(selected)}
                    >
                      {minute}
                      {selected && <Check aria-hidden="true" className="h-3 w-3" />}
                    </button>
                  );
                })}
              </div>
            </div>

          </div>
          <div className="mt-4 border-t border-border/70 pt-3">
            <p className="mb-2 text-[11px] font-bold text-foreground">Period</p>
            <div aria-label="AM or PM" className="grid grid-cols-2 gap-1 rounded-xl border border-border/80 p-1.5" style={{ background: "color-mix(in srgb, var(--muted) 55%, var(--card) 45%)" }}>
                {(["AM", "PM"] as const).map((period) => {
                  const selected = draft.period === period;
                  return (
                    <button
                      type="button"
                      key={period}
                      aria-label={`${label} ${period}`}
                      aria-pressed={selected}
                      onClick={() => updateDraft({ period })}
                      className={choiceClass(selected)}
                    >
                      {period}
                      {selected && <Check aria-hidden="true" className="h-3 w-3" />}
                    </button>
                  );
                })}
            </div>
          </div>

          <Popover.Close className="mt-4 ml-auto flex min-h-10 min-w-24 items-center justify-center rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
            Done
          </Popover.Close>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

import * as Popover from "@radix-ui/react-popover";
import * as Dialog from "@radix-ui/react-dialog";
import { addDays, addMonths, format, isSameDay, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock3 } from "lucide-react";
import { useId, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import { isValidThemedTime } from "./ThemedTimeField";

export { isValidThemedTime } from "./ThemedTimeField";

const dayKeyPattern = /^\d{4}-\d{2}-\d{2}$/;

function parseDateKey(value: string): Date | null {
  if (!dayKeyPattern.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day, 12);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day ? parsed : null;
}

function formatDateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function manilaTodayKey(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function manilaDateTimeParts(value?: string): { date: string; time: string } {
  if (!value || !Number.isFinite(Date.parse(value))) return { date: "", time: "" };
  const manilaInstant = new Date(Date.parse(value) + 8 * 60 * 60 * 1000).toISOString();
  return { date: manilaInstant.slice(0, 10), time: manilaInstant.slice(11, 16) };
}

export function manilaDateTimeToIso(date: string, time: string): string | undefined {
  if (!parseDateKey(date) || !isValidThemedTime(time)) return undefined;
  const instant = new Date(`${date}T${time}:00+08:00`);
  return Number.isFinite(instant.getTime()) ? instant.toISOString() : undefined;
}

export function ThemedDateTimeField({ label, date, time, onDateChange, onTimeChange, disabled = false, error }: {
  label: string;
  date: string;
  time: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
}) {
  const selectedDate = parseDateKey(date);
  const today = parseDateKey(manilaTodayKey()) ?? new Date();
  const [open, setOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const hourIncreaseRef = useRef<HTMLButtonElement>(null);
  const timeHintId = useId();
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(selectedDate ?? today));
  const calendarStart = startOfWeek(startOfMonth(visibleMonth), { weekStartsOn: 0 });
  const days = Array.from({ length: 42 }, (_, index) => addDays(calendarStart, index));
  const weekdays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const timeIsInvalid = Boolean(time) && !isValidThemedTime(time);
  const hours = isValidThemedTime(time) ? Number(time.slice(0, 2)) : 9;
  const minutes = isValidThemedTime(time) ? time.slice(3) : "00";
  const period = hours >= 12 ? "PM" : "AM";
  const displayTime = `${hours % 12 || 12}:${minutes} ${period}`;
  const setTime = (hour: number, minute: string, meridiem: string) => onTimeChange(`${String(hour % 12 + (meridiem === "PM" ? 12 : 0)).padStart(2, "0")}:${minute}`);
  const [hourDraft, setHourDraft] = useState(String(hours % 12 || 12));
  const [minuteDraft, setMinuteDraft] = useState(minutes);
  const validHour = /^\d{1,2}$/.test(hourDraft) && Number(hourDraft) >= 1 && Number(hourDraft) <= 12;
  const validMinute = /^\d{1,2}$/.test(minuteDraft) && Number(minuteDraft) <= 59;
  const validDraft = validHour && validMinute;
  const changeTimeOpen = (value: boolean) => {
    if (value) { setHourDraft(String(hours % 12 || 12)); setMinuteDraft(minutes); }
    setTimeOpen(value);
  };
  const commitDraft = (meridiem = period) => {
    if (!validDraft) return;
    const minute = minuteDraft.padStart(2, "0");
    setHourDraft(String(Number(hourDraft)));
    setMinuteDraft(minute);
    setTime(Number(hourDraft), minute, meridiem);
  };
  const stepTime = (part: "hour" | "minute", direction: number) => {
    const hour = validHour ? Number(hourDraft) : hours % 12 || 12;
    const minute = validMinute ? Number(minuteDraft) : Number(minutes);
    const nextHour = part === "hour" ? (hour - 1 + direction + 12) % 12 + 1 : hour;
    const nextMinute = String(part === "minute" ? (minute + direction + 60) % 60 : minute).padStart(2, "0");
    setHourDraft(String(nextHour));
    setMinuteDraft(nextMinute);
    setTime(nextHour, nextMinute, period);
  };

  const focusTimeSelection = (event: Event) => {
    event.preventDefault();
    hourIncreaseRef.current?.focus({ preventScroll: true });
  };
  const timeTrigger = <button type="button" disabled={disabled} aria-label={`${label} time: ${displayTime}`} className="flex h-10 min-w-0 items-center gap-2 whitespace-nowrap rounded-xl border border-border bg-input-background px-3 text-sm tabular-nums text-foreground focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"><Clock3 aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />{displayTime}</button>;
  const timeControls = <>
    <Dialog.Title className="mb-3 shrink-0 text-sm font-bold">Choose time · {displayTime}</Dialog.Title>
    <Dialog.Description className="sr-only">Use the arrows or type an hour and minute, select AM or PM, then choose Done.</Dialog.Description>
    <div className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl border border-border bg-muted/30 p-2">
      {(["hour", "minute"] as const).map((part, index) => <div key={part} className={cn("flex min-w-0 flex-col items-center", index === 1 && "col-start-3 row-start-1")}>
        <label className="text-xs font-semibold text-muted-foreground" htmlFor={`${timeHintId}-${part}`}>{part === "hour" ? "Hour" : "Minute"}</label>
        <button ref={part === "hour" ? hourIncreaseRef : undefined} type="button" aria-label={`Increase ${part}`} onClick={() => stepTime(part, 1)} className="flex h-11 w-full items-center justify-center rounded-lg text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><ChevronUp aria-hidden className="h-5 w-5" /></button>
        <input id={`${timeHintId}-${part}`} type="text" role="spinbutton" inputMode="numeric" autoComplete="off" maxLength={2} aria-valuemin={part === "hour" ? 1 : 0} aria-valuemax={part === "hour" ? 12 : 59} aria-valuenow={(part === "hour" ? validHour : validMinute) ? Number(part === "hour" ? hourDraft : minuteDraft) : undefined} aria-invalid={part === "hour" ? !validHour : !validMinute} aria-describedby={timeHintId} value={part === "hour" ? hourDraft : minuteDraft} onChange={event => (part === "hour" ? setHourDraft : setMinuteDraft)(event.target.value)} onBlur={() => commitDraft()} onFocus={event => event.target.select()} onKeyDown={event => {
          if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); stepTime(part, event.key === "ArrowUp" ? 1 : -1); }
          if (event.key === "Enter") { event.preventDefault(); commitDraft(); }
        }} className="h-12 w-full min-w-0 rounded-lg border border-transparent bg-transparent text-center text-3xl font-semibold tabular-nums text-foreground outline-none focus:border-primary focus:bg-card focus:ring-2 focus:ring-primary/20 aria-invalid:border-destructive" />
        <button type="button" aria-label={`Decrease ${part}`} onClick={() => stepTime(part, -1)} className="flex h-11 w-full items-center justify-center rounded-lg text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><ChevronDown aria-hidden className="h-5 w-5" /></button>
      </div>)}
      <span aria-hidden className="col-start-2 row-start-1 mt-4 text-2xl font-semibold text-muted-foreground">:</span>
    </div>
    <div className="mt-3 flex shrink-0 gap-2">{["AM", "PM"].map(value => <button type="button" key={value} disabled={!validDraft} aria-pressed={period === value} onClick={() => commitDraft(value)} className={cn("min-h-11 flex-1 rounded-xl border border-border text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50", period === value ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>{value}</button>)}</div>
    <p id={timeHintId} aria-live="polite" className={cn("mt-2 shrink-0 text-xs", validDraft ? "text-muted-foreground" : "text-destructive")}>{validDraft ? "Use the arrows or type a time." : "Enter an hour from 1–12 and a minute from 00–59."}</p>
    <Dialog.Close disabled={!validDraft} onClick={() => commitDraft()} className="mt-3 min-h-11 w-full shrink-0 rounded-xl bg-primary text-sm font-bold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50">Done</Dialog.Close>
  </>;

  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-xs font-bold text-foreground">{label} <span className="font-medium text-muted-foreground">(Asia/Manila)</span></legend>
      <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
        <Popover.Root modal open={open} onOpenChange={setOpen}>
          <Popover.Trigger asChild>
            <button
              type="button"
              disabled={disabled}
              aria-label={selectedDate ? `${label} date: ${format(selectedDate, "MMMM d, yyyy")}` : `Choose ${label.toLowerCase()} date`}
              className="flex h-10 min-w-0 items-center justify-between gap-2 rounded-xl border border-border bg-input-background px-3 text-left text-sm text-foreground transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className={cn("truncate", !selectedDate && "text-muted-foreground")}>{selectedDate ? format(selectedDate, "MMM d, yyyy") : "Choose date"}</span>
              <CalendarDays aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              align="start"
              sideOffset={8}
              collisionPadding={12}
              onEscapeKeyDown={event => event.stopPropagation()}
              onOpenAutoFocus={(event) => {
                event.preventDefault();
                const content = event.target as HTMLElement;
                (content.querySelector<HTMLButtonElement>('button[aria-pressed="true"]') || content.querySelector<HTMLButtonElement>('button[aria-current="date"]') || content.querySelector<HTMLButtonElement>('button'))?.focus({ preventScroll: true });
              }}
              className="pointer-events-auto z-[120] max-h-[var(--radix-popover-content-available-height)] w-[min(19rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-card p-3 text-foreground shadow-2xl outline-none"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <button type="button" onClick={() => setVisibleMonth((month) => addMonths(month, -1))} aria-label="Previous month" className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
                  <ChevronLeft aria-hidden="true" className="h-4 w-4" />
                </button>
                <p aria-live="polite" className="text-sm font-bold">{format(visibleMonth, "MMMM yyyy")}</p>
                <button type="button" onClick={() => setVisibleMonth((month) => addMonths(month, 1))} aria-label="Next month" className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
                  <ChevronRight aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-7 gap-1" aria-label={`${format(visibleMonth, "MMMM yyyy")} calendar`}>
                {weekdays.map((weekday) => <span key={weekday} aria-hidden="true" className="flex h-8 items-center justify-center text-[11px] font-semibold text-muted-foreground">{weekday}</span>)}
                {days.map((day) => {
                  const selected = Boolean(selectedDate && isSameDay(day, selectedDate));
                  const todaySelected = isSameDay(day, today);
                  const currentMonth = isSameMonth(day, visibleMonth);
                  return <button
                    key={formatDateKey(day)}
                    type="button"
                    aria-label={format(day, "MMMM d, yyyy")}
                    aria-pressed={selected}
                    aria-current={todaySelected ? "date" : undefined}
                    onClick={() => { onDateChange(formatDateKey(day)); setOpen(false); }}
                    className={cn(
                      "h-9 rounded-lg text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                      selected ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground hover:bg-muted",
                      !currentMonth && !selected && "text-muted-foreground/50",
                      todaySelected && !selected && "ring-1 ring-primary/40",
                    )}
                  >{format(day, "d")}</button>;
                })}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-border pt-2">
                <button type="button" onClick={() => { onDateChange(""); setOpen(false); }} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground">Clear</button>
                <button type="button" onClick={() => { onDateChange(manilaTodayKey()); setVisibleMonth(startOfMonth(today)); setOpen(false); }} className="rounded-lg px-2 py-1.5 text-xs font-bold text-primary hover:bg-primary/10">Today</button>
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        <Dialog.Root open={timeOpen} onOpenChange={changeTimeOpen}>
          <Dialog.Trigger asChild>{timeTrigger}</Dialog.Trigger>
          <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-[120] bg-black/20" /><Dialog.Content aria-label={`${label} time picker`} aria-labelledby={undefined} onOpenAutoFocus={focusTimeSelection} onEscapeKeyDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()} className="fixed left-1/2 top-1/2 z-[121] flex max-h-[calc(100dvh-1.5rem)] w-[min(19rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto overscroll-contain rounded-2xl border border-border bg-card p-4 text-foreground shadow-xl outline-none">{timeControls}</Dialog.Content></Dialog.Portal>
        </Dialog.Root>
      </div>
      {(error || timeIsInvalid) && <p role="alert" className="mt-1.5 text-xs text-destructive">{error || "Choose a valid time using AM or PM."}</p>}
    </fieldset>
  );
}

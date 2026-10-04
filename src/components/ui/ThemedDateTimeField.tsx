import * as Popover from "@radix-ui/react-popover";
import { addDays, addMonths, format, isSameDay, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/utils";

const dayKeyPattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

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
  if (!parseDateKey(date) || !timePattern.test(time)) return undefined;
  const instant = new Date(`${date}T${time}:00+08:00`);
  return Number.isFinite(instant.getTime()) ? instant.toISOString() : undefined;
}

export function isValidThemedTime(value: string): boolean {
  return timePattern.test(value);
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

  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-xs font-bold text-foreground">{label} <span className="font-medium text-muted-foreground">(Asia/Manila)</span></legend>
      <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
        <Popover.Root open={open} onOpenChange={setOpen}>
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
              onOpenAutoFocus={(event) => event.preventDefault()}
              className="z-[120] w-[min(19rem,calc(100vw-2rem))] rounded-2xl border border-border bg-card p-3 text-foreground shadow-2xl outline-none"
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
        <Popover.Root>
          <Popover.Trigger asChild><button type="button" disabled={disabled} aria-label={`${label} time: ${displayTime}`} className="flex h-10 min-w-0 items-center gap-2 rounded-xl border border-border bg-input-background px-3 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"><Clock3 aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />{displayTime}</button></Popover.Trigger>
          <Popover.Portal><Popover.Content align="end" sideOffset={8} aria-label={`${label} time picker`} className="z-[120] w-[min(19rem,calc(100vw-2rem))] rounded-2xl border border-border bg-card p-4 text-foreground shadow-xl">
            <p className="mb-3 text-sm font-bold">Choose time · {displayTime}</p>
            <div className="mb-3 flex gap-2">{["AM", "PM"].map(value => <button type="button" key={value} aria-pressed={period === value} onClick={() => setTime(hours, minutes, value)} className={cn("min-h-10 flex-1 rounded-xl border border-border text-sm font-bold", period === value ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>{value}</button>)}</div>
            <div className="grid grid-cols-2 gap-3"><div><p className="mb-2 text-xs font-semibold text-muted-foreground">Hour</p><div className="grid max-h-44 grid-cols-2 gap-1 overflow-y-auto overscroll-contain">{Array.from({ length: 12 }, (_, index) => index + 1).map(hour => <button type="button" key={hour} aria-label={`Hour ${hour}`} aria-pressed={(hours % 12 || 12) === hour} onClick={() => setTime(hour, minutes, period)} className="min-h-9 rounded-lg text-sm hover:bg-muted aria-pressed:bg-primary/10 aria-pressed:text-primary">{hour}</button>)}</div>
            </div><div><p className="mb-2 text-xs font-semibold text-muted-foreground">Minute</p><div className="grid max-h-44 grid-cols-2 gap-1 overflow-y-auto overscroll-contain">{Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0")).map(minute => <button type="button" key={minute} aria-label={`Minute ${minute}`} aria-pressed={minutes === minute} onClick={() => setTime(hours, minute, period)} className="min-h-9 rounded-lg text-xs hover:bg-muted aria-pressed:bg-primary/10 aria-pressed:text-primary">{minute}</button>)}</div>
            </div></div><Popover.Close className="mt-3 min-h-10 w-full rounded-xl bg-primary text-sm font-bold text-primary-foreground">Done</Popover.Close>
          </Popover.Content></Popover.Portal>
        </Popover.Root>
      </div>
      {(error || timeIsInvalid) && <p role="alert" className="mt-1.5 text-xs text-destructive">{error || "Choose a valid time using AM or PM."}</p>}
    </fieldset>
  );
}

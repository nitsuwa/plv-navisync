import { useMemo, useState } from "react";
import { CalendarClock, Copy, RotateCcw } from "lucide-react";
import { cn } from "../../lib/utils";
import { ThemedTimeField } from "../ui/ThemedTimeField";
import { formatWeeklyOperatingHours, updateOperatingDay, weeklyHoursPreset } from "../../lib/buildingInformation";
import { OPERATING_DAYS, type OperatingDayKey, type WeeklyOperatingHours } from "../../types/buildingInformation";

const EMPTY_HOURS: WeeklyOperatingHours = Object.fromEntries(
  OPERATING_DAYS.map(({ key }) => [key, { closed: true }]),
) as WeeklyOperatingHours;

interface BuildingWeeklyHoursEditorProps {
  value?: WeeklyOperatingHours;
  legacyValue?: string;
  disabled?: boolean;
  onChange: (value: WeeklyOperatingHours, summary?: string) => void;
  onClear: () => void;
}

function sameHours(a: WeeklyOperatingHours[OperatingDayKey], b: WeeklyOperatingHours[OperatingDayKey]) {
  return a.closed === b.closed && a.open === b.open && a.close === b.close;
}

export function BuildingWeeklyHoursEditor({ value, legacyValue, disabled = false, onChange, onClear }: BuildingWeeklyHoursEditorProps) {
  const [sameWeekdays, setSameWeekdays] = useState(() => {
    if (!value) return true;
    return [value.tuesday, value.wednesday, value.thursday, value.friday].every((day) => sameHours(value.monday, day));
  });
  const [editing, setEditing] = useState(Boolean(value));
  const hours = value ?? EMPTY_HOURS;
  const summary = useMemo(() => formatWeeklyOperatingHours(value), [value]);

  const commit = (next: WeeklyOperatingHours) => onChange(next, formatWeeklyOperatingHours(next));
  const updateDay = (key: OperatingDayKey, changes: Partial<WeeklyOperatingHours[OperatingDayKey]>) => {
    let next = updateOperatingDay(hours, key, changes);
    if (!next[key].closed && (!next[key].open || !next[key].close)) {
      next = updateOperatingDay(next, key, { open: next[key].open || "08:00", close: next[key].close || "17:00" });
    }
    if (sameWeekdays && ["monday", "tuesday", "wednesday", "thursday", "friday"].includes(key)) {
      const weekday = next[key];
      next = { ...next, monday: { ...weekday }, tuesday: { ...weekday }, wednesday: { ...weekday }, thursday: { ...weekday }, friday: { ...weekday } };
    }
    commit(next);
  };

  const setPreset = (kind: "weekdays" | "daily") => {
    const next = weeklyHoursPreset(kind);
    setEditing(true);
    setSameWeekdays(kind === "weekdays");
    commit(next);
  };

  const toggleSameWeekdays = (checked: boolean) => {
    setSameWeekdays(checked);
    if (!checked) return;
    const monday = hours.monday;
    commit({ ...hours, tuesday: { ...monday }, wednesday: { ...monday }, thursday: { ...monday }, friday: { ...monday } });
  };

  return (
    <section className="space-y-2" aria-label="Operating hours">
      <div className="flex items-center justify-between gap-2">
        <label className="block text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Operating hours <span className="font-normal normal-case tracking-normal">(optional)</span></label>
        {(value || legacyValue) && <button type="button" disabled={disabled} onClick={onClear} className="text-[9px] font-semibold text-muted-foreground hover:text-destructive disabled:opacity-40">Clear</button>}
      </div>

      {!value && legacyValue && !editing && (
        <div className="rounded-xl border border-border/70 bg-muted/20 p-2.5">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Existing hours</p>
          <p className="mt-1 text-[11px] text-foreground">{legacyValue}</p>
          <button type="button" disabled={disabled} onClick={() => { setEditing(true); commit(EMPTY_HOURS); }} className="mt-2 inline-flex h-7 items-center gap-1 rounded-lg border border-primary/20 bg-card px-2 text-[9px] font-bold text-primary hover:bg-primary/5">Set weekly hours</button>
        </div>
      )}

      {(!value && (!legacyValue || editing)) && (
        <div className="flex flex-wrap gap-1.5" aria-label="Hours presets">
          <button type="button" disabled={disabled} onClick={() => setPreset("weekdays")} className="rounded-full border border-border bg-card px-2.5 py-1.5 text-[9px] font-semibold text-foreground hover:border-primary/30 hover:text-primary disabled:opacity-40">Weekdays 8–5</button>
          <button type="button" disabled={disabled} onClick={() => setPreset("daily")} className="rounded-full border border-border bg-card px-2.5 py-1.5 text-[9px] font-semibold text-foreground hover:border-primary/30 hover:text-primary disabled:opacity-40">Open daily</button>
          <button type="button" disabled={disabled} onClick={() => { setEditing(true); commit(EMPTY_HOURS); }} className="rounded-full border border-border bg-card px-2.5 py-1.5 text-[9px] font-semibold text-foreground hover:border-primary/30 hover:text-primary disabled:opacity-40">Custom</button>
        </div>
      )}

      {value && (
        <>
          <div className="flex items-start justify-between gap-2 rounded-lg bg-muted/30 px-2 py-1.5">
            <p className="min-w-0 whitespace-normal break-words text-[10px] font-semibold leading-snug text-foreground">{summary || "Add hours for each open day"}</p>
            <CalendarClock className="h-3.5 w-3.5 shrink-0 text-primary" />
          </div>
          <label className="flex items-center gap-2 px-1 text-[10px] text-muted-foreground">
            <input type="checkbox" checked={sameWeekdays} disabled={disabled} onChange={(event) => toggleSameWeekdays(event.target.checked)} className="accent-primary" />
            <Copy className="h-3 w-3" /> Use same hours Monday–Friday
          </label>
          <div className="space-y-1 rounded-xl border border-border/70 bg-muted/10 p-1.5">
            {OPERATING_DAYS.map(({ key, label }) => {
              const day = hours[key];
              const mirrored = sameWeekdays && key !== "monday" && ["tuesday", "wednesday", "thursday", "friday"].includes(key);
              return (
                <div key={key} className="grid grid-cols-[60px_50px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-1 rounded-lg px-1 py-1">
                  <span className="text-[10px] font-semibold text-foreground">{label}</span>
                  <button type="button" disabled={disabled || mirrored} aria-pressed={!day.closed} onClick={() => updateDay(key, day.closed ? { closed: false, open: "08:00", close: "17:00" } : { closed: true })} className={cn("h-7 rounded-md border px-1 text-[9px] font-bold disabled:opacity-50", day.closed ? "border-border text-muted-foreground" : "border-emerald-300/70 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300")}>{day.closed ? "Closed" : "Open"}</button>
                  {day.closed ? <span className="col-span-2 text-center text-[10px] text-muted-foreground">Closed</span> : <>
                    <ThemedTimeField label={`${label} opening time`} value={day.open ?? "08:00"} disabled={disabled || mirrored} onChange={(open) => updateDay(key, { open })} className="h-8 rounded-md px-2 text-[11px]" />
                    <ThemedTimeField label={`${label} closing time`} value={day.close ?? "17:00"} disabled={disabled || mirrored} onChange={(close) => updateDay(key, { close })} className="h-8 rounded-md px-2 text-[11px]" />
                  </>}
                </div>
              );
            })}
          </div>
          <p className="text-[8px] leading-snug text-muted-foreground">Times use the campus local time. No public open/closed status is inferred.</p>
          <button type="button" disabled={disabled} onClick={() => { onClear(); setEditing(false); }} className="inline-flex h-6 items-center gap-1 text-[9px] font-semibold text-muted-foreground hover:text-destructive disabled:opacity-40"><RotateCcw className="h-3 w-3" /> Remove weekly schedule</button>
        </>
      )}
    </section>
  );
}

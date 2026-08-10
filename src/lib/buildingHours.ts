/**
 * Building operating-hours registry + live Open/Closed status helper.
 *
 * The legacy MOCK_BUILDINGS carry a human-readable `operating_hours` string,
 * while the seeded campus (b_scb, b_caba, …) has no hours field. This module
 * adds a small registry for the seeded campus and a parser for the legacy
 * string so both sources get a live status without touching any shared type.
 */

export interface HoursRange {
  /** 24h hour (0–23) when the building opens, e.g. 7 */
  open: number;
  /** 24h hour (0–23) when the building closes, e.g. 20 */
  close: number;
  /** Optional days-of-week array (0=Sunday … 6=Saturday). Omitted = every day. */
  days?: number[];
}

/** Seeded-campus hours by building id (and by code as a fallback). */
export const BUILDING_HOURS: Record<string, HoursRange> = {
  b_scb:      { open: 7,  close: 20 },
  scb:        { open: 7,  close: 20 },
  b_canteen:  { open: 6,  close: 20 },
  canteen:    { open: 6,  close: 20 },
  b_caba:     { open: 7,  close: 19 },
  caba:       { open: 7,  close: 19 },
  b_coed:     { open: 7,  close: 19 },
  coed:       { open: 7,  close: 19 },
  b_ceit:     { open: 7,  close: 19 },
  ceit:       { open: 7,  close: 19 },
  b_guard:    { open: 0,  close: 24 }, // 24h guard house / gate
  guard:      { open: 0,  close: 24 },
};

export type OpenStatus = "Open" | "Busy" | "Closed";

export interface OpenStatusResult {
  status: OpenStatus | null;
  /** Human label to show next to the dot, e.g. "Open · until 8 PM". */
  label: string;
  /** Raw hours string when known (registry label or legacy string). */
  hoursLabel?: string;
}

/** Parse a legacy string like "Mon–Fri 7:00 AM – 8:00 PM" into a range. */
export function parseHoursString(raw?: string | null): HoursRange | null {
  if (!raw) return null;
  const match = raw.match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*[–-]\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return null;
  const to24 = (h: number, mer: string) => {
    if (mer.toUpperCase() === "PM" && h !== 12) return h + 12;
    if (mer.toUpperCase() === "AM" && h === 12) return 0;
    return h;
  };
  const open = to24(Number(match[1]), match[3]);
  const close = to24(Number(match[4]), match[6]);
  return { open, close: close === 0 ? 24 : close };
}

/**
 * Compute the live status for a building-like object at `now`.
 * `now` is injectable for tests.
 */
export function getOpenStatus(
  building: { id?: string; code?: string; operating_hours?: string | null },
  now: Date = new Date()
): OpenStatusResult {
  const range =
    BUILDING_HOURS[building.id ?? ""] ??
    BUILDING_HOURS[building.code ?? ""] ??
    parseHoursString(building.operating_hours);

  if (!range) {
    return {
      status: null,
      label: building.operating_hours ?? "Hours unavailable",
      hoursLabel: building.operating_hours ?? undefined,
    };
  }

  const day = now.getDay();
  const hour = now.getHours() + now.getMinutes() / 60;
  const isOpenDay = !range.days || range.days.includes(day);
  const isOpen = isOpenDay && hour >= range.open && hour < range.close;

  const fmt = (h: number) => {
    const hh = h % 24;
    const ampm = hh >= 12 ? "PM" : "AM";
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    return `${h12} ${ampm}`;
  };
  const hoursLabel = `${fmt(range.open)} – ${fmt(range.close)}`;

  if (range.close === 24 && range.open === 0) {
    return { status: "Open", label: "Open · 24 hours", hoursLabel: "Open 24 hours" };
  }

  // Within 30 minutes of closing → "Busy" (about to close).
  if (isOpen && hour >= range.close - 0.5) {
    return { status: "Busy", label: `Busy · closes ${fmt(range.close)}`, hoursLabel };
  }
  if (isOpen) {
    return { status: "Open", label: `Open · until ${fmt(range.close)}`, hoursLabel };
  }
  return { status: "Closed", label: `Closed · opens ${fmt(range.open)}`, hoursLabel };
}

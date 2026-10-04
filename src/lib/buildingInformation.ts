import type { CampusBuilding } from "../components/map-builder/types";
import { BUILDING_TYPE_OPTIONS, OPERATING_DAYS, type BuildingTypeValue, type OperatingDayKey, type WeeklyOperatingHours } from "../types/buildingInformation";

const ROOM_TYPES_FOR_FACILITY: Record<string, string[]> = {
  Restroom: ["restroom", "accessible_restroom"],
  Clinic: ["clinic"],
  "Study Area": ["study_area", "study area"],
  "Student Lounge": ["student_lounge", "student lounge"],
  "Service Counter": ["service_counter", "service counter"],
  "Wi-Fi": ["wifi", "wi-fi"],
  Library: ["library"],
};

export function facilityIsOnAuthoredMap(building: CampusBuilding, label: string): boolean {
  if (label === "Elevator") return (building.floors ?? []).some((floor) => (floor.elevators ?? []).some((item) => item.visible !== false));
  const acceptedTypes = ROOM_TYPES_FOR_FACILITY[label] ?? [];
  return (building.floors ?? []).some((floor) => (floor.rooms ?? []).some((room) => acceptedTypes.includes(String(room.type ?? "").trim().toLocaleLowerCase())));
}

export function deriveBuildingAccessibilityFacts(building: CampusBuilding): { label: string; source: string }[] {
  const facts = new Map<string, string>();
  if (building.accessibility?.accessibleEntrance || (building.entrances ?? []).some((entrance) => entrance.accessible === true)) {
    facts.set("Accessible entrance", (building.entrances ?? []).some((entrance) => entrance.accessible === true)
      ? "Detected from entrance configuration"
      : "Previously authored building information");
  }
  if (building.accessibility?.hasElevator || (building.floors ?? []).some((floor) => (floor.elevators ?? []).some((elevator) => elevator.visible !== false))) {
    facts.set("Elevator available", (building.floors ?? []).some((floor) => (floor.elevators ?? []).some((elevator) => elevator.visible !== false))
      ? "Detected from floor maps"
      : "Previously authored building information");
  }
  if (building.accessibility?.hasRamp || (building.floors ?? []).some((floor) =>
    [...(floor.ramps ?? []), ...(floor.entranceRamps ?? [])].some((ramp) => ramp.visible !== false && ramp.accessible !== false))) {
    facts.set("Ramp access", (building.floors ?? []).some((floor) =>
      [...(floor.ramps ?? []), ...(floor.entranceRamps ?? [])].some((ramp) => ramp.visible !== false && ramp.accessible !== false))
      ? "Detected from authored ramp objects"
      : "Previously authored building information");
  }
  if ((building.floors ?? []).some((floor) => (floor.rooms ?? []).some((room) =>
    room.type.toLocaleLowerCase() === "restroom" && room.accessibility === true))) {
    facts.set("Accessible restroom", "Detected from room configuration");
  }
  return [...facts].map(([label, source]) => ({ label, source }));
}

export function buildingTypeValue(building: Pick<CampusBuilding, "buildingType" | "category">): BuildingTypeValue {
  if (building.buildingType && BUILDING_TYPE_OPTIONS.some((option) => option.value === building.buildingType)) return building.buildingType;
  const category = String(building.category ?? "").trim().toLocaleLowerCase().replace(/[ -]+/g, "_");
  if (["academic", "administrative", "administration", "admin"].includes(category)) {
    return category === "academic" ? "academic" : "administrative";
  }
  if (["library", "library_learning", "laboratory", "learning"].includes(category)) return "library_learning";
  if (["dining", "canteen", "food"].includes(category)) return "dining";
  if (["student_services", "facility", "services"].includes(category)) return "student_services";
  if (category === "mixed_use") return "mixed_use";
  return "other";
}

export function weeklyHoursPreset(kind: "weekdays" | "daily"): WeeklyOperatingHours {
  const hours = Object.fromEntries(OPERATING_DAYS.map(({ key }) => {
    const closed = kind === "weekdays" && ["saturday", "sunday"].includes(key);
    return [key, closed ? { closed } : { closed, open: "08:00", close: "17:00" }];
  })) as WeeklyOperatingHours;
  return hours;
}

function timeLabel(value: string): string {
  const [rawHour, rawMinute] = value.split(":");
  const hour = Number(rawHour);
  const minute = Number(rawMinute);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return value;
  const meridiem = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${meridiem}`;
}

export function formatWeeklyOperatingHours(hours: WeeklyOperatingHours | undefined): string | undefined {
  if (!hours) return undefined;
  const entries = OPERATING_DAYS.map((day) => ({
    key: day.key,
    label: day.shortLabel,
    value: hours[day.key],
  }));
  const groups: { start: string; end: string; value: string }[] = [];
  for (const item of entries) {
    const value = item.value.closed ? "Closed" : item.value.open && item.value.close
      ? `${timeLabel(item.value.open)}–${timeLabel(item.value.close)}`
      : "";
    if (!value) continue;
    const last = groups.at(-1);
    if (last?.value === value) last.end = item.label;
    else groups.push({ start: item.label, end: item.label, value });
  }
  return groups.length ? groups.map((group) => `${group.start}${group.end !== group.start ? `–${group.end}` : ""} ${group.value}`).join(" · ") : undefined;
}

export function hasCompleteWeeklyHours(hours: WeeklyOperatingHours): boolean {
  return OPERATING_DAYS.every(({ key }) => {
    const day = hours[key];
    return day.closed || (!!day.open && !!day.close);
  });
}

export function updateOperatingDay(
  hours: WeeklyOperatingHours,
  key: OperatingDayKey,
  changes: Partial<WeeklyOperatingHours[OperatingDayKey]>,
): WeeklyOperatingHours {
  return { ...hours, [key]: { ...hours[key], ...changes } };
}

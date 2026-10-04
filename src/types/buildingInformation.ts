export const OPERATING_DAYS = [
  { key: "monday", label: "Monday", shortLabel: "Mon" },
  { key: "tuesday", label: "Tuesday", shortLabel: "Tue" },
  { key: "wednesday", label: "Wednesday", shortLabel: "Wed" },
  { key: "thursday", label: "Thursday", shortLabel: "Thu" },
  { key: "friday", label: "Friday", shortLabel: "Fri" },
  { key: "saturday", label: "Saturday", shortLabel: "Sat" },
  { key: "sunday", label: "Sunday", shortLabel: "Sun" },
] as const;

export type OperatingDayKey = typeof OPERATING_DAYS[number]["key"];
export interface DailyOperatingHours {
  closed: boolean;
  open?: string;
  close?: string;
}
export type WeeklyOperatingHours = Record<OperatingDayKey, DailyOperatingHours>;

export type BuildingTypeValue =
  | "academic"
  | "administrative"
  | "student_services"
  | "library_learning"
  | "dining"
  | "mixed_use"
  | "other";

export const BUILDING_TYPE_OPTIONS: { value: BuildingTypeValue; label: string }[] = [
  { value: "academic", label: "Academic" },
  { value: "administrative", label: "Administrative" },
  { value: "student_services", label: "Student Services" },
  { value: "library_learning", label: "Library / Learning" },
  { value: "dining", label: "Dining" },
  { value: "mixed_use", label: "Mixed Use" },
  { value: "other", label: "Other" },
];

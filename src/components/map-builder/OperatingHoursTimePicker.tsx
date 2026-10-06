import { formatThemedTime, ThemedTimeField } from "../ui/ThemedTimeField";

/** @deprecated Prefer ThemedTimeField directly for new operating-hours UI. */
export function formatOperatingTime(value: string) {
  return formatThemedTime(value).replace("AM", "am").replace("PM", "pm");
}

/** Compatibility adapter retained for any older operating-hours callers. */
export function OperatingHoursTimePicker({
  label,
  value,
  disabled = false,
  onCommit,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onCommit: (value: string) => void;
}) {
  return (
    <ThemedTimeField
      label={label}
      value={value}
      disabled={disabled}
      onChange={onCommit}
      className="h-8 rounded-md px-2 text-[11px]"
    />
  );
}

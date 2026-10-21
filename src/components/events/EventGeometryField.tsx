import { useEffect, useRef, useState } from "react";

export function EventGeometryField({ label, ariaLabel = label, value, disabled = false, onCommit }: {
  label: string; ariaLabel?: string; value: number; disabled?: boolean; onCommit: (value: number) => void;
}) {
  const [text, setText] = useState(String(Math.round(value * 100) / 100)), [focused, setFocused] = useState(false);
  const cancel = useRef(false);
  useEffect(() => { if (!focused) setText(String(Math.round(value * 100) / 100)); }, [value, focused]);
  return <label className="flex min-w-0 flex-col gap-1.5 text-xs font-semibold text-muted-foreground">{label}
    <input type="number" aria-label={ariaLabel} value={text} disabled={disabled}
      onFocus={() => { cancel.current = false; setFocused(true); }} onChange={event => setText(event.target.value)}
      onBlur={() => { setFocused(false); if (!cancel.current && !disabled && text.trim() && Number.isFinite(Number(text))) onCommit(Number(text)); else setText(String(Math.round(value * 100) / 100)); }}
      onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } else if (event.key === "Escape") { event.stopPropagation(); cancel.current = true; setText(String(Math.round(value * 100) / 100)); event.currentTarget.blur(); } }}
      className="h-11 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50" />
  </label>;
}

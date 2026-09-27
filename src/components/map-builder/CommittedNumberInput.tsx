import { useRef, useState } from "react";

interface CommittedNumberInputProps {
  id?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onCommit: (value: number) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  "aria-label"?: string;
  "data-testid"?: string;
  /** Optional keyboard nudge without changing the component's draft model. */
  onStep?: (delta: number, baseValue: number) => void;
}

/** Numeric editor that keeps an empty/invalid draft out of application state. */
export function CommittedNumberInput({
  id,
  value,
  min,
  max,
  step,
  onCommit,
  className,
  placeholder,
  disabled,
  "aria-label": ariaLabel,
  "data-testid": dataTestId,
  onStep,
}: CommittedNumberInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const draftRef = useRef<string | null>(null);

  const updateDraft = (next: string) => {
    draftRef.current = next;
    setDraft(next);
  };

  const commit = () => {
    const raw = draftRef.current;
    draftRef.current = null;
    setDraft(null);
    if (raw === null || raw.trim() === "") return;
    const parsed = Number(raw.trim());
    if (!Number.isFinite(parsed)) return;
    const next = Math.max(min ?? Number.NEGATIVE_INFINITY, Math.min(max ?? Number.POSITIVE_INFINITY, parsed));
    if (next !== value) onCommit(next);
  };

  const cancel = () => {
    draftRef.current = null;
    setDraft(null);
  };

  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      min={min}
      max={max}
      step={step}
      value={draft ?? String(value)}
      onChange={(event) => updateDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          event.preventDefault();
          cancel();
          event.currentTarget.blur();
        } else if ((event.key === "ArrowUp" || event.key === "ArrowDown") && onStep) {
          const draftValue = draftRef.current === null ? value : Number(draftRef.current.trim());
          if (!Number.isFinite(draftValue)) return;
          event.preventDefault();
          onStep((event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? 10 : 1), draftValue);
          draftRef.current = null;
          setDraft(null);
        }
      }}
      className={className}
      placeholder={placeholder}
      disabled={disabled}
      aria-label={ariaLabel}
      data-testid={dataTestId}
    />
  );
}

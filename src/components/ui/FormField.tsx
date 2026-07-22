import { cn } from "../../lib/utils";
import type { LucideIcon } from "lucide-react";

interface FormFieldProps {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  helper?: string;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  minLength?: number;
  type?: "text" | "email" | "number" | "url" | "tel";
  step?: string | number;
  rows?: number;
  disabled?: boolean;
  className?: string;
  icon?: LucideIcon;
  /** Show character count in format `{length}/{maxLength}` */
  showCharCount?: boolean;
  /** Use monospace font for code/ID fields */
  mono?: boolean;
}

const inputBase =
  "w-full h-10 px-4 rounded-xl border bg-input-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm transition-all";

const errorBorder = "border-destructive focus:ring-destructive/30";
const normalBorder = "border-border focus:border-primary";

export function FormField({
  label, id, value, onChange, error, helper, placeholder,
  required, maxLength, minLength, type = "text", step,
  rows, disabled, className, icon: Icon, showCharCount, mono,
}: FormFieldProps) {
  const hasError = !!error;
  const inputCls = cn(
    inputBase,
    hasError ? errorBorder : normalBorder,
    Icon && "pl-9",
    mono && "font-mono",
    rows && "h-auto py-2.5 resize-y min-h-[44px]",
    disabled && "opacity-50 cursor-not-allowed",
    className,
  );

  const handleChange = (v: string) => {
    onChange(v);
  };

  const isTextarea = rows && rows > 1;

  return (
    <div>
      <label htmlFor={id} className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wide">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      <div className="relative">
        {Icon && (
          <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        )}
        {isTextarea ? (
          <textarea
            id={id}
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={placeholder}
            rows={rows}
            disabled={disabled}
            aria-invalid={hasError}
            aria-describedby={hasError ? `${id}-error` : undefined}
            className={inputCls}
          />
        ) : (
          <input
            id={id}
            type={type}
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={placeholder}
            minLength={minLength}
            step={step}
            disabled={disabled}
            aria-invalid={hasError}
            aria-describedby={hasError ? `${id}-error` : undefined}
            className={inputCls}
          />
        )}
      </div>
      <div className="flex items-center justify-between mt-1">
        {helper && !hasError ? (
          <p className="text-[10px] text-muted-foreground">{helper}</p>
        ) : hasError ? (
          <p id={`${id}-error`} role="alert" className="text-[10px] text-destructive font-medium">{error}</p>
        ) : (
          <span />
        )}
        {showCharCount && maxLength && (
          <span className="text-[10px] text-muted-foreground tabular-nums ml-auto">
            {String(value).length}/{maxLength}
          </span>
        )}
      </div>
    </div>
  );
}

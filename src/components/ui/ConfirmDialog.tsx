import { useEffect, useRef } from "react";
import { AlertTriangle, X } from "lucide-react";
import { cn } from "../../lib/utils";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "info";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onCancel]);

  if (!open) return null;

  const variantStyles = {
    danger: {
      icon: "bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400",
      button: "bg-red-600 hover:bg-red-700 text-white",
      border: "border-red-200 dark:border-red-800/30",
    },
    warning: {
      icon: "bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400",
      button: "bg-amber-600 hover:bg-amber-700 text-white",
      border: "border-amber-200 dark:border-amber-800/30",
    },
    info: {
      icon: "bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400",
      button: "bg-primary hover:bg-primary/90 text-primary-foreground",
      border: "border-blue-200 dark:border-blue-800/30",
    },
  };

  const vs = variantStyles[variant];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-background/70 backdrop-blur-sm p-4 animate-fade-in"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm animate-scale-in overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4 p-5">
          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", vs.icon)}>
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <h3 className="text-sm font-extrabold text-foreground" style={{ fontFamily: "var(--font-sans)" }}>
              {title}
            </h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed" style={{ fontFamily: "var(--font-body)" }}>
              {message}
            </p>
          </div>
          <button
            onClick={onCancel}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button
            onClick={onCancel}
            className="flex-1 h-9 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:bg-muted transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={cn("flex-1 h-9 rounded-xl text-xs font-extrabold transition-colors shadow-sm", vs.button)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useRef, useCallback } from "react";
import { AlertTriangle, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../../lib/utils";
import { SPRING, DURATION } from "../../config/animation";

interface TypeToConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  /** The exact text the user must type to enable the confirm button */
  confirmText: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "info";
  onConfirm: () => void;
  onCancel: () => void;
}

export function TypeToConfirmDialog({
  open,
  title,
  message,
  confirmText,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  variant = "danger",
  onConfirm,
  onCancel,
}: TypeToConfirmDialogProps) {
  const [typed, setTyped] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Focus trap: save and restore focus
  useEffect(() => {
    if (open) {
      previousActiveElement.current = document.activeElement as HTMLElement | null;
      requestAnimationFrame(() => {
        dialogRef.current?.focus();
      });
    } else {
      previousActiveElement.current?.focus();
      previousActiveElement.current = null;
    }
  }, [open]);

  // Focus trap: keep focus within dialog
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Tab") {
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = dialog.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  }, []);

  useEffect(() => {
    if (!open) setTyped("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onCancel]);

  const isExactMatch = typed === confirmText;

  const variantStyles = {
    danger: {
      icon: "bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400",
      button: "bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-sm",
      border: "border-red-200 dark:border-red-800/30",
    },
    warning: {
      icon: "bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400",
      button: "bg-amber-600 hover:bg-amber-700 text-white shadow-sm",
      border: "border-amber-200 dark:border-amber-800/30",
    },
    info: {
      icon: "bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400",
      button: "bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm",
      border: "border-blue-200 dark:border-blue-800/30",
    },
  };

  const vs = variantStyles[variant];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: DURATION.fast }}
          role="dialog" aria-modal="true" aria-label={title}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-background/70 backdrop-blur-sm p-4"
          onClick={onCancel}
        >
          <motion.div
            ref={dialogRef}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={SPRING.confirm}
            onKeyDown={handleKeyDown}
            className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden outline-none"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
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
                aria-label="Close dialog"
                className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Type-to-confirm input */}
            <div className="px-5 pb-3 text-center">
              <p className="text-[11px] text-muted-foreground mb-2 leading-relaxed" style={{ fontFamily: "var(--font-body)" }}>
                Type <span className="font-extrabold text-foreground">{confirmText}</span> to confirm
              </p>
              <input
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={`Type "${confirmText}"`}
                className={cn(
                  "w-full h-10 px-3.5 rounded-xl border text-sm outline-none transition-all font-mono",
                  isExactMatch
                    ? "border-red-400 bg-red-50 dark:bg-red-900/10 text-red-700 dark:text-red-300 ring-1 ring-red-400/30"
                    : "border-border bg-input-background text-foreground"
                )}
                autoComplete="off"
                spellCheck={false}
                autoFocus
              />
            </div>

            {/* Buttons */}
            <div className="flex gap-2 px-5 pb-5">
              <button
                onClick={onCancel}
                className="flex-1 h-10 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:bg-muted hover:border-foreground/20 active:scale-[0.97] transition-all duration-200"
              >
                {cancelLabel}
              </button>
              <button
                onClick={onConfirm}
                disabled={!isExactMatch}
                className={cn(
                  "flex-1 h-10 rounded-xl text-xs font-extrabold transition-all duration-200 shadow-sm active:scale-[0.97]",
                  isExactMatch
                    ? `${vs.button} hover:shadow-md`
                    : "bg-muted text-muted-foreground/40 cursor-not-allowed"
                )}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

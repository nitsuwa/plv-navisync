import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { AlertTriangle, Map, Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";

/**
 * Shared unsaved-changes confirmation dialog.
 *
 * Rendered through a portal into `document.body` with a very high z-index so
 * it can never be trapped by an editor's local stacking context — the dimmed
 * backdrop and blur always cover the FULL viewport (editor chrome, tabs,
 * toolbar, page header, sidebar …) exactly the same everywhere it is used.
 *
 * Two visual modes:
 *  - dirty  → "Unsaved Changes" + Save Draft / Discard Changes / Continue Editing
 *  - clean  → informational "Unpublished Changes" + Leave Anyway / Continue Editing
 *
 * Clicking the backdrop deliberately does nothing (the pending navigation is
 * only ever resumed via an explicit button).
 */
interface UnsavedChangesDialogProps {
  open: boolean;
  isDirty: boolean;
  saving?: boolean;
  error?: string | null;
  /** Custom copy — both editors share the flow but keep their own wording. */
  title?: string;
  infoTitle?: string;
  description?: string;
  infoDescription?: string;
  continueLabel?: string;
  saveLabel?: string;
  saveIcon?: React.ElementType;
  discardLabel?: string;
  leaveLabel?: string;
  onCancel: () => void;
  onSave: () => void;
  onDiscard: () => void;
}

export function UnsavedChangesDialog({
  open,
  isDirty,
  saving = false,
  error,
  title = "Unsaved Changes",
  infoTitle = "Unpublished Changes",
  description = "Your latest edits haven't been saved yet.",
  infoDescription = "You have unpublished changes. The live map is still showing the previous published version.",
  continueLabel = "Continue Editing",
  saveLabel = "Save Draft",
  saveIcon: SaveIcon = Map,
  discardLabel = "Discard Changes",
  leaveLabel = "Leave Anyway",
  onCancel,
  onSave,
  onDiscard,
}: UnsavedChangesDialogProps) {
  const content = (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-background/80 backdrop-blur-md p-4"
          aria-modal="true"
          role="dialog"
          aria-label={isDirty ? title : infoTitle}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-4 p-5 sm:p-6">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <h3 className="text-sm font-extrabold text-foreground">{isDirty ? title : infoTitle}</h3>
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                  {isDirty ? description : infoDescription}
                </p>
                {error && (
                  <p className="mt-2.5 rounded-lg border border-destructive/25 bg-destructive/10 px-2.5 py-1.5 text-[10px] font-semibold text-destructive">
                    {error}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row px-5 pb-5 sm:px-6 sm:pb-6">
              <button
                onClick={onCancel}
                disabled={saving}
                className="flex-1 h-10 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
              >
                {continueLabel}
              </button>
              {isDirty && (
                <button
                  onClick={onSave}
                  disabled={saving}
                  className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-xs font-extrabold hover:bg-primary/90 shadow-sm transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SaveIcon className="h-3.5 w-3.5" />}
                  {saving ? "Saving..." : saveLabel}
                </button>
              )}
              <button
                onClick={onDiscard}
                disabled={saving}
                className={cn(
                  "flex-1 h-10 rounded-xl text-xs font-extrabold shadow-sm transition-all disabled:opacity-50",
                  isDirty
                    ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {isDirty ? discardLabel : leaveLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return typeof document !== "undefined" ? createPortal(content, document.body) : null;
}

import { motion, AnimatePresence } from "motion/react";
import { AlertTriangle, Map } from "lucide-react";
import { cn } from "../../lib/utils";

interface EditorBackDialogProps {
  open: boolean;
  isDirty: boolean;
  publishStatus: "draft" | "published";
  onClose: () => void;
  onSaveAndBack: () => void;
  onBack: () => void;
}

export function EditorBackDialog({
  open,
  isDirty,
  publishStatus,
  onClose,
  onSaveAndBack,
  onBack,
}: EditorBackDialogProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[150] flex items-center justify-center bg-background/70 backdrop-blur-sm p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 8 }}
            className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-4 p-5">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                {isDirty ? (
                  <>
                    <h3 className="text-sm font-extrabold text-foreground">Unsaved Changes</h3>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      Your latest edits haven't been saved yet.
                      {publishStatus === "published"
                        ? " The live map is still showing the previous published version."
                        : ""}
                    </p>
                  </>
                ) : (
                  <>
                    <h3 className="text-sm font-extrabold text-foreground">Unpublished Changes</h3>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      You have unpublished changes. The live map is still showing the previous published version.
                    </p>
                  </>
                )}
              </div>
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <button
                onClick={onClose}
                className="flex-1 h-10 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:bg-muted transition-colors"
              >
                Continue Editing
              </button>
              {isDirty && (
                <button
                  onClick={onSaveAndBack}
                  className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-xs font-extrabold hover:bg-primary/90 shadow-sm transition-all flex items-center justify-center gap-1.5"
                >
                  <Map className="h-3.5 w-3.5" /> Save Draft
                </button>
              )}
              <button
                onClick={onBack}
                className={cn(
                  "flex-1 h-10 rounded-xl text-xs font-extrabold shadow-sm transition-all",
                  isDirty
                    ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {isDirty ? "Discard Changes" : "Leave Anyway"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

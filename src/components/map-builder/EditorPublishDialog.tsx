import { motion, AnimatePresence } from "motion/react";
import { Globe } from "lucide-react";

interface EditorPublishDialogProps {
  open: boolean;
  onClose: () => void;
  onPublish: () => void;
  disabled?: boolean;
}

export function EditorPublishDialog({ open, onClose, onPublish, disabled }: EditorPublishDialogProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[150] flex items-center justify-center bg-background/70 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 8 }}
            className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-4 p-5">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Globe className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <h3 className="text-sm font-extrabold text-foreground">Publish Map?</h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  This will replace the currently live campus map that students and visitors can access.
                </p>
              </div>
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <button
                onClick={onClose}
                className="flex-1 h-10 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onPublish}
                disabled={disabled}
                className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-xs font-extrabold hover:bg-primary/90 shadow-sm transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Globe className="h-3.5 w-3.5" /> Publish Now
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

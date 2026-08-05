import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Save, Globe, CheckCircle2, AlertTriangle, X, RotateCcw,
  Upload, RefreshCw, Copy, FileDown, Loader2, EyeOff, Archive,
} from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────────────

export type ActionType = "saving" | "publishing" | "unpublishing" | "updating" | "auto-saving" | "restoring" | "duplicating" | "exporting" | "archiving";

export type ActionState = "loading" | "success" | "error";

export interface ActionProgressDialogProps {
  /** Whether the dialog is visible */
  open: boolean;
  /** Current state of the action */
  state: ActionState;
  /** What action is being performed (controls icon, title, messages) */
  action: ActionType;
  /** Optional campus/building name for personalized messages */
  entityName?: string;
  /** Called when the dialog closes */
  onClose: () => void;
  /** Called when the user clicks retry */
  onRetry?: () => void;
  /** Called when the user clicks "Review Issues" (error state) */
  onReviewIssues?: () => void;
  /** How long to show success state before auto-dismissing (ms) */
  autoDismissMs?: number;
}

// ── Action config — per-action-type icon, title, messages ───────────────────

interface ActionConfig {
  icon: React.ElementType;
  title: string;
  loadingMessage: string;
  successTitle: string;
  successMessage: string;
  errorTitle: string;
  errorMessage: string;
  statusMessages: string[];
}

const ACTION_CONFIGS: Record<ActionType, ActionConfig> = {
  saving: {
    icon: Save,
    title: "Saving Campus Map",
    loadingMessage: "Please wait while your campus map and recent changes are being securely saved.",
    successTitle: "Campus Map Saved",
    successMessage: 'Your latest changes have been successfully saved.',
    errorTitle: "Unable to Save Campus Map",
    errorMessage: "An error occurred while saving your project. Please check your connection and try again.",
    statusMessages: [
      "Saving building layouts...",
      "Updating floor plans...",
      "Validating map data...",
      "Processing navigation paths...",
      "Organizing campus information...",
      "Finalizing project...",
      "Almost done...",
    ],
  },
  publishing: {
    icon: Globe,
    title: "Publishing Campus Map",
    loadingMessage: "Your campus map is being prepared for live deployment.",
    successTitle: "Campus Map Published",
    successMessage: "The latest version of your campus map has been successfully published and is now available to students.",
    errorTitle: "Publishing Failed",
    errorMessage: "The campus map could not be published. No changes were deployed.",
    statusMessages: [
      "Validating project...",
      "Publishing building information...",
      "Updating floor maps...",
      "Synchronizing navigation routes...",
      "Applying accessibility information...",
      "Deploying live campus map...",
      "Finalizing publication...",
      "Almost done...",
    ],
  },
  updating: {
    icon: RefreshCw,
    title: "Updating Campus",
    loadingMessage: "Applying your latest changes to the campus project.",
    successTitle: "Campus Updated",
    successMessage: "Your changes have been applied successfully.",
    errorTitle: "Update Failed",
    errorMessage: "An error occurred while updating. Please try again.",
    statusMessages: [
      "Applying changes...",
      "Syncing data...",
      "Verifying integrity...",
      "Finalizing update...",
    ],
  },
  "auto-saving": {
    icon: Upload,
    title: "Auto-Saving",
    loadingMessage: "Your progress is being automatically saved.",
    successTitle: "Auto-Save Complete",
    successMessage: "Your latest changes have been automatically saved.",
    errorTitle: "Auto-Save Failed",
    errorMessage: "An error occurred while auto-saving. Please save manually.",
    statusMessages: [
      "Auto-saving progress...",
      "Tracking changes...",
      "Persisting data...",
      "Almost done...",
    ],
  },
  restoring: {
    icon: Loader2,
    title: "Restoring Campus",
    loadingMessage: "Restoring your campus project from a previous version.",
    successTitle: "Campus Restored",
    successMessage: "Your campus has been restored to the selected version.",
    errorTitle: "Restore Failed",
    errorMessage: "Could not restore the selected version. Please try again.",
    statusMessages: [
      "Preparing restore...",
      "Restoring buildings...",
      "Reconstructing floor plans...",
      "Validating restored data...",
      "Almost done...",
    ],
  },
  duplicating: {
    icon: Copy,
    title: "Duplicating Campus",
    loadingMessage: "Creating a copy of your campus project.",
    successTitle: "Campus Duplicated",
    successMessage: "A copy of your campus has been created successfully.",
    errorTitle: "Duplicate Failed",
    errorMessage: "Could not duplicate the campus. Please try again.",
    statusMessages: [
      "Copying campus data...",
      "Duplicating buildings...",
      "Copying floor plans...",
      "Finalizing copy...",
      "Almost done...",
    ],
  },
  exporting: {
    icon: FileDown,
    title: "Exporting Campus",
    loadingMessage: "Preparing your campus data for export.",
    successTitle: "Export Complete",
    successMessage: "Your campus has been exported successfully.",
    errorTitle: "Export Failed",
    errorMessage: "Could not export the campus. Please try again.",
    statusMessages: [
      "Preparing data...",
      "Packaging files...",
      "Compressing resources...",
      "Finalizing export...",
      "Almost done...",
    ],
  },
  unpublishing: {
    icon: EyeOff,
    title: "Unpublishing Campus Map",
    loadingMessage: "Your campus is being removed from the student-facing map.",
    successTitle: "Campus Map Unpublished",
    successMessage: "Your campus has been taken down from the student view.",
    errorTitle: "Unpublishing Failed",
    errorMessage: "The campus could not be unpublished. Please try again.",
    statusMessages: [
      "Preparing to take campus offline...",
      "Removing campus data...",
      "Updating student map view...",
      "Clearing navigation caches...",
      "Finalizing takedown...",
      "Almost done...",
    ],
  },
  archiving: {
    icon: Archive,
    title: "Archiving Campus",
    loadingMessage: "Your campus is being moved to the archive. Buildings, floor plans, and settings will be preserved.",
    successTitle: "Campus Archived",
    successMessage: "Your campus has been archived and hidden from students. You can restore it at any time.",
    errorTitle: "Archiving Failed",
    errorMessage: "The campus could not be archived. Please try again.",
    statusMessages: [
      "Preparing campus for archive...",
      "Removing from student view...",
      "Preserving building data...",
      "Archiving floor plans...",
      "Finalizing archive...",
      "Almost done...",
    ],
  },
};

// ── Component ───────────────────────────────────────────────────────────────

export function ActionProgressDialog({
  open,
  state,
  action,
  entityName,
  onClose,
  onRetry,
  onReviewIssues,
  autoDismissMs = 1200,
}: ActionProgressDialogProps) {
  const cfg = ACTION_CONFIGS[action];
  const ActionIcon = cfg.icon;
  const [messageIndex, setMessageIndex] = useState(0);

  // Rotate through status messages every 2s during loading
  useEffect(() => {
    if (state !== "loading") return;
    setMessageIndex(0);
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % cfg.statusMessages.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [state, cfg.statusMessages.length]);

  // Auto-dismiss on success
  useEffect(() => {
    if (state !== "success") return;
    const timer = setTimeout(() => {
      onClose();
    }, autoDismissMs);
    return () => clearTimeout(timer);
  }, [state, autoDismissMs, onClose]);

  const handleRetry = useCallback(() => {
    onRetry?.();
  }, [onRetry]);

  // Prevent background interaction while loading
  const captureClicks = useCallback((e: React.MouseEvent) => {
    if (state === "loading") {
      e.stopPropagation();
    }
  }, [state]);

  const isLoading = state === "loading";
  const isSuccess = state === "success";
  const isError = state === "error";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key={`progress-${action}-${state}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="fixed inset-0 z-[100] flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-label={isLoading ? `Performing ${action}` : isSuccess ? `${action} complete` : `${action} failed`}
          style={{
            background: "rgba(0,0,0,0.06)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
          onClick={captureClicks}
        >
          <motion.div
            key={`card-${state}`}
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 16 }}
            transition={{
              type: "spring",
              duration: 0.45,
              bounce: 0.2,
            }}
            className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ── Loading State ── */}
            {isLoading && (
              <div className="flex flex-col items-center text-center px-8 py-10">
                {/* Animated icon container */}
                <div className="relative w-14 h-14 mb-5">
                  {/* Pulsing background */}
                  <motion.div
                    className="absolute inset-0 rounded-2xl bg-primary/10"
                    animate={{
                      scale: [1, 1.08, 1],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  />
                  {/* Spinning icon */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        ease: "linear",
                      }}
                    >
                      <ActionIcon className="h-6 w-6 text-primary" />
                    </motion.div>
                  </div>
                </div>

                <h2 className="text-lg font-extrabold text-foreground mb-1.5" style={{ fontFamily: "var(--font-sans)" }}>
                  {cfg.title}
                </h2>
                <p className="text-sm text-muted-foreground mb-6 leading-relaxed max-w-[260px]" style={{ fontFamily: "var(--font-body)" }}>
                  {cfg.loadingMessage}
                </p>

                {/* Rotating status message */}
                <div className="h-6 flex items-center">
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={messageIndex}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.2 }}
                      className="text-xs text-muted-foreground font-medium flex items-center gap-2"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-pulse" />
                      {cfg.statusMessages[messageIndex]}
                    </motion.span>
                  </AnimatePresence>
                </div>

                {/* Indeterminate progress bar */}
                <div className="w-full h-1 rounded-full bg-muted mt-4 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-primary"
                    initial={{ width: "0%" }}
                    animate={{ width: "90%" }}
                    transition={{
                      duration: 8,
                      ease: "easeInOut",
                      repeat: Infinity,
                      repeatType: "reverse",
                    }}
                  />
                </div>
              </div>
            )}

            {/* ── Success State ── */}
            {isSuccess && (
              <div className="flex flex-col items-center text-center px-8 py-10">
                {/* Success icon with expanding ring */}
                <div className="relative w-14 h-14 mb-5">
                  {/* Expanding ripple */}
                  <motion.div
                    className="absolute inset-0 rounded-full border-2 border-green-300 dark:border-green-700/40"
                    initial={{ scale: 0.8, opacity: 0.8 }}
                    animate={{ scale: 1.4, opacity: 0 }}
                    transition={{
                      duration: 1.2,
                      repeat: Infinity,
                      ease: "easeOut",
                    }}
                  />
                  {/* Background circle */}
                  <motion.div
                    className="absolute inset-0 rounded-2xl bg-green-100 dark:bg-green-900/20"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{
                      type: "spring",
                      stiffness: 200,
                      damping: 15,
                    }}
                  />
                  {/* Check icon */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <motion.div
                      initial={{ scale: 0, rotate: -90 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{
                        type: "spring",
                        stiffness: 300,
                        damping: 15,
                        delay: 0.1,
                      }}
                    >
                      <CheckCircle2 className="h-7 w-7 text-green-600 dark:text-green-400" />
                    </motion.div>
                  </div>
                </div>

                <h2 className="text-lg font-extrabold text-foreground mb-1.5" style={{ fontFamily: "var(--font-sans)" }}>
                  {cfg.successTitle}
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-[280px]" style={{ fontFamily: "var(--font-body)" }}>
                  {entityName
                    ? `"${entityName}" — ${cfg.successMessage}`
                    : cfg.successMessage}
                </p>

                {/* Auto-dismiss indicator */}
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8 }}
                  className="text-[10px] text-muted-foreground/50 mt-6"
                >
                  Closing automatically...
                </motion.p>
              </div>
            )}

            {/* ── Error State ── */}
            {isError && (
              <div className="flex flex-col items-center text-center px-8 py-8">
                {/* Error icon */}
                <div className="relative w-14 h-14 mb-5">
                  <motion.div
                    className="absolute inset-0 rounded-2xl bg-red-100 dark:bg-red-900/20"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{
                      type: "spring",
                      stiffness: 200,
                      damping: 15,
                    }}
                  >
                    <div className="w-full h-full flex items-center justify-center">
                      <motion.div
                        initial={{ scale: 0, rotate: -15 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{
                          type: "spring",
                          stiffness: 300,
                          damping: 15,
                          delay: 0.1,
                        }}
                      >
                        <AlertTriangle className="h-7 w-7 text-red-600 dark:text-red-400" />
                      </motion.div>
                    </div>
                  </motion.div>
                </div>

                <h2 className="text-lg font-extrabold text-foreground mb-1.5" style={{ fontFamily: "var(--font-sans)" }}>
                  {cfg.errorTitle}
                </h2>
                <p className="text-sm text-muted-foreground mb-6 leading-relaxed max-w-[280px]" style={{ fontFamily: "var(--font-body)" }}>
                  {entityName && action === "saving" || action === "publishing"
                    ? `${cfg.errorMessage}`
                    : cfg.errorMessage}
                </p>

                {/* Action buttons */}
                <div className="flex gap-3 w-full">
                  <button
                    onClick={onClose}
                    className="flex-1 h-10 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors flex items-center justify-center gap-1.5"
                  >
                    <X className="h-4 w-4" /> Close
                  </button>
                  {onReviewIssues && (
                    <button
                      onClick={onReviewIssues}
                      className="flex-1 h-10 rounded-xl border border-amber-300 dark:border-amber-700/40 text-xs font-bold text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/10 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <AlertTriangle className="h-4 w-4" /> Review Issues
                    </button>
                  )}
                  <button
                    onClick={handleRetry}
                    className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-xs font-extrabold hover:bg-primary/90 transition-colors shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RotateCcw className="h-4 w-4" /> Retry
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

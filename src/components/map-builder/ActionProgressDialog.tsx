import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import {
  Save, Globe, CheckCircle2, AlertTriangle, X, RotateCcw,
  Upload, RefreshCw, Copy, FileDown, Loader2, EyeOff, Archive,
  Trash2,
} from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────────────

export type ActionType = "saving" | "publishing" | "unpublishing" | "updating" | "auto-saving" | "restoring" | "duplicating" | "exporting" | "archiving" | "deleting";

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
  /** Optional copy overrides for lifecycle batches and stage-specific errors. */
  titleOverride?: string;
  loadingMessageOverride?: string;
  successTitleOverride?: string;
  successMessageOverride?: string;
  errorTitleOverride?: string;
  errorMessageOverride?: string;
  progressMessage?: string;
  /** Use a marquee indicator instead of an illustrative progress fill. */
  indeterminateProgress?: boolean;
  failureItems?: Array<{ id: string; name: string; reason: string }>;
  retryLabel?: string;
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
    title: "Saving changes",
    loadingMessage: "Keeping your campus map up to date.",
    successTitle: "Campus Map Saved",
    successMessage: 'Your latest changes have been successfully saved.',
    errorTitle: "Unable to Save Campus Map",
    errorMessage: "An error occurred while saving your project. Please check your connection and try again.",
    statusMessages: ["Saving map data…"],
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
  deleting: {
    icon: Trash2,
    title: "Deleting Campus",
    loadingMessage: "Permanently removing this archived campus and its authored map data.",
    successTitle: "Campus Permanently Deleted",
    successMessage: "The archived campus and its authored map data have been removed.",
    errorTitle: "Permanent Delete Failed",
    errorMessage: "The campus was not removed. Refresh and try again after checking its lifecycle state.",
    statusMessages: [
      "Checking archive status...",
      "Removing campus-owned data...",
      "Removing saved snapshots...",
      "Finalizing deletion...",
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
  titleOverride,
  loadingMessageOverride,
  successTitleOverride,
  successMessageOverride,
  errorTitleOverride,
  errorMessageOverride,
  progressMessage,
  indeterminateProgress = false,
  failureItems,
  retryLabel = "Retry",
}: ActionProgressDialogProps) {
  const cfg = ACTION_CONFIGS[action];
  const ActionIcon = cfg.icon;
  const [messageIndex, setMessageIndex] = useState(0);
  const [showFailures, setShowFailures] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const stateRef = useRef(state);
  stateRef.current = state;

  // Rotate through status messages every 2s during loading
  useEffect(() => {
    if (state !== "loading" || action === "saving") {
      setMessageIndex(0);
      return;
    }
    setMessageIndex(0);
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % cfg.statusMessages.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [state, action, cfg.statusMessages.length]);

  useEffect(() => {
    if (state !== "error") setShowFailures(false);
  }, [state]);

  // Auto-dismiss only while the success dialog is actually open.  Keeping
  // `open` in the contract prevents a timer from a hidden success state from
  // firing after a later save reopens the dialog.
  useEffect(() => {
    if (!open || state !== "success" || autoDismissMs <= 0) return;
    const timer = setTimeout(() => {
      onCloseRef.current();
    }, autoDismissMs);
    return () => clearTimeout(timer);
  }, [open, state, autoDismissMs]);

  const handleRetry = useCallback(() => {
    onRetry?.();
  }, [onRetry]);

  // Keep the modal genuinely modal for pointer, keyboard, and assistive-tech
  // users. A body portal clears editor stacking contexts; inert siblings and a
  // focus trap prevent access to the editor behind it while persistence runs.
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const overlay = overlayRef.current;
    if (!overlay) return;

    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const inertSiblings = [...document.body.children]
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== overlay)
      .map((element) => ({ element, wasInert: element.inert }));
    inertSiblings.forEach(({ element }) => { element.inert = true; });

    const focusInitialTarget = () => dialogRef.current?.focus({ preventScroll: true });
    focusInitialTarget();

    const handleKeyDown = (event: KeyboardEvent) => {
      const eventTarget = event.target instanceof Node ? event.target : null;
      if (!eventTarget || !overlayRef.current?.contains(eventTarget)) {
        // Preserve browser navigation/window shortcuts while preventing
        // editor hotkeys, including Ctrl/Cmd+S, from reaching editor listeners.
        const key = event.key.toLowerCase();
        const browserShortcut = event.key === "F5"
          || (event.altKey && ["arrowleft", "arrowright", "f4"].includes(key))
          || ((event.ctrlKey || event.metaKey) && ["r", "l", "t", "w", "n", "tab", "+", "-", "0"].includes(key));
        if (event.key === "Escape" && stateRef.current !== "loading") {
          event.preventDefault();
          event.stopImmediatePropagation();
          onCloseRef.current();
          return;
        }
        event.stopImmediatePropagation();
        if (!browserShortcut || (event.ctrlKey || event.metaKey) && key === "s") event.preventDefault();
        if (event.key === "Escape") event.preventDefault();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (stateRef.current !== "loading") onCloseRef.current();
        return;
      }
      if (event.key === "Tab") {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        const items = focusable
          ? [...focusable].filter((element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true")
          : [];
        if (items.length === 0) {
          event.preventDefault();
          dialogRef.current?.focus({ preventScroll: true });
          return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
        return;
      }

    const key = event.key.toLowerCase();
    const browserShortcut = event.key === "F5"
      || (event.altKey && ["arrowleft", "arrowright", "f4"].includes(key))
      || ((event.ctrlKey || event.metaKey) && ["r", "l", "t", "w", "n", "tab", "+", "-", "0"].includes(key));
    const buttonActivation = event.target instanceof HTMLElement
      && event.target.closest("button:not([disabled])")
      && (event.key === "Enter" || event.key === " ");
    event.stopImmediatePropagation();
    if (buttonActivation) return;
    if (!browserShortcut || (event.ctrlKey || event.metaKey) && key === "s") event.preventDefault();
    };
    const keepFocusInside = (event: FocusEvent) => {
      if (!overlayRef.current?.contains(event.target as Node)) focusInitialTarget();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("focusin", keepFocusInside, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("focusin", keepFocusInside, true);
      inertSiblings.forEach(({ element, wasInert }) => { element.inert = wasInert; });
      if (previousFocus?.isConnected) {
        const restoreTarget = previousFocus.hasAttribute("disabled")
          ? previousFocus.closest<HTMLElement>("[data-focus-restore]")
          : previousFocus;
        restoreTarget?.focus({ preventScroll: true });
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const target = state === "error"
      ? dialogRef.current?.querySelector<HTMLElement>("button")
      : dialogRef.current;
    target?.focus({ preventScroll: true });
  }, [open, state]);

  // Prevent background interaction while loading
  const captureClicks = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
  }, []);

  const isLoading = state === "loading";
  const isSuccess = state === "success";
  const isError = state === "error";
  const showIndeterminateProgress = indeterminateProgress ?? action === "saving";

  if (typeof document === "undefined") return null;

  return createPortal((
    <AnimatePresence>
      {open && (
        <motion.div
          key={`progress-${action}-${state}`}
          ref={overlayRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.2, ease: "easeOut" }}
          className="fixed inset-0 map-layer-blocking z-[var(--map-layer-blocking)] flex items-center justify-center overflow-y-auto p-4 [padding-top:max(1rem,env(safe-area-inset-top))] [padding-bottom:max(1rem,env(safe-area-inset-bottom))]"
          role="dialog"
          aria-modal="true"
          aria-busy={isLoading}
          aria-label={isLoading ? `Performing ${action}` : isSuccess ? `${action} complete` : `${action} failed`}
          tabIndex={-1}
          style={{
            background: "rgba(15,23,42,0.22)",
            backdropFilter: reducedMotion ? "blur(2px)" : "blur(5px)",
            WebkitBackdropFilter: reducedMotion ? "blur(2px)" : "blur(5px)",
          }}
          onPointerDownCapture={(event) => { if (event.target === event.currentTarget) event.stopPropagation(); }}
          onMouseDownCapture={(event) => { if (event.target === event.currentTarget) event.stopPropagation(); }}
          onClick={captureClicks}
        >
          <motion.div
            key={`card-${state}`}
            ref={dialogRef}
            initial={reducedMotion ? false : { opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reducedMotion ? undefined : { opacity: 0, scale: 0.92, y: 16 }}
            transition={{
              type: reducedMotion ? "tween" : "spring",
              duration: reducedMotion ? 0 : 0.45,
              bounce: reducedMotion ? 0 : 0.2,
            }}
            className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm max-h-[calc(100dvh-2rem)] overflow-y-auto outline-none"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ── Loading State ── */}
            {isLoading && (
              <div className="flex flex-col items-center text-center px-8 py-10">
                {/* Animated icon container */}
                <div className="relative w-14 h-14 mb-5">
                  {/* Pulsing background */}
                  {!reducedMotion && <motion.div
                    className="absolute inset-0 rounded-2xl bg-primary/10"
                    animate={{ scale: [1, 1.08, 1] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  />}
                  {/* Spinning icon */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <motion.div
                      animate={reducedMotion ? undefined : { rotate: 360 }}
                      transition={reducedMotion ? undefined : { duration: 1.5, repeat: Infinity, ease: "linear" }}
                    >
                      <ActionIcon className="h-6 w-6 text-primary" />
                    </motion.div>
                  </div>
                </div>

                <h2 className="text-lg font-extrabold text-foreground mb-1.5" style={{ fontFamily: "var(--font-sans)" }}>
                  {titleOverride ?? cfg.title}
                </h2>
                <p className="text-sm text-muted-foreground mb-6 leading-relaxed max-w-[260px]" style={{ fontFamily: "var(--font-body)" }}>
                  {loadingMessageOverride ?? cfg.loadingMessage}
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
                      role="status"
                      aria-live="polite"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-pulse" />
                      {progressMessage ?? (action === "saving" ? "Saving map data…" : cfg.statusMessages[messageIndex])}
                    </motion.span>
                  </AnimatePresence>
                </div>

                {/* Indeterminate progress bar */}
                <div className="w-full h-1 rounded-full bg-muted mt-4 overflow-hidden" role="progressbar" aria-label="Saving in progress" aria-valuetext="Saving">
                  {showIndeterminateProgress ? (
                    <motion.div
                      className="h-full w-[38%] rounded-full bg-primary"
                      initial={false}
                      animate={reducedMotion ? { opacity: [0.55, 1] } : { x: ["-110%", "280%"] }}
                      transition={reducedMotion ? { duration: 1.4, repeat: Infinity } : { duration: 1.25, ease: "easeInOut", repeat: Infinity }}
                    />
                  ) : (
                    <motion.div
                      className="h-full rounded-full bg-primary"
                      initial={{ width: "0%" }}
                      animate={{ width: "90%" }}
                      transition={{ duration: 8, ease: "easeInOut", repeat: Infinity, repeatType: "reverse" }}
                    />
                  )}
                </div>
              </div>
            )}

            {/* ── Success State ── */}
            {isSuccess && (
              <div className="flex flex-col items-center text-center px-8 py-10">
                {/* Success icon with expanding ring */}
                <div className="relative w-14 h-14 mb-5">
                  {/* Expanding ripple */}
                  {!reducedMotion && <motion.div
                    className="absolute inset-0 rounded-full border-2 border-green-300 dark:border-green-700/40"
                    initial={{ scale: 0.8, opacity: 0.8 }}
                    animate={{ scale: 1.4, opacity: 0 }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }}
                  />}
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
                  {successTitleOverride ?? cfg.successTitle}
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-[280px]" style={{ fontFamily: "var(--font-body)" }}>
                  {successMessageOverride ?? (entityName
                    ? `"${entityName}" — ${cfg.successMessage}`
                    : cfg.successMessage)}
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
                  {errorTitleOverride ?? cfg.errorTitle}
                </h2>
                <p className="text-sm text-muted-foreground mb-6 leading-relaxed max-w-[280px]" style={{ fontFamily: "var(--font-body)" }}>
                  {errorMessageOverride ?? cfg.errorMessage}
                </p>

                {failureItems && failureItems.length > 0 && (
                  <div className="w-full mb-5 text-left">
                    <button
                      type="button"
                      aria-expanded={showFailures}
                      onClick={() => setShowFailures((visible) => !visible)}
                      className="w-full rounded-lg border border-border px-3 py-2 text-xs font-bold text-foreground hover:bg-muted transition-colors"
                    >
                      {showFailures ? "Hide Failed Campuses" : "View Failed Campuses"} ({failureItems.length})
                    </button>
                    {showFailures && (
                      <ul className="mt-2 max-h-36 overflow-y-auto space-y-1.5 rounded-lg bg-muted/50 p-2" aria-label="Failed campuses">
                        {failureItems.map((failure) => (
                          <li key={failure.id} className="rounded-md px-2 py-1.5">
                            <p className="text-xs font-bold text-foreground truncate">{failure.name}</p>
                            <p className="text-[11px] leading-snug text-muted-foreground">{failure.reason}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

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
                    <RotateCcw className="h-4 w-4" /> {retryLabel}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  ), document.body);
}

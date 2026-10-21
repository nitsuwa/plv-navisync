import { ActionProgressDialog } from "./ActionProgressDialog";
import type { ActionProgressDialogProps } from "./ActionProgressDialog";

// ── Props ───────────────────────────────────────────────────────────────────
export interface SaveScreenProps {
  open: boolean;
  state: "saving" | "success" | "error";
  campusName?: string;
  titleOverride?: ActionProgressDialogProps["titleOverride"];
  loadingMessageOverride?: ActionProgressDialogProps["loadingMessageOverride"];
  successTitleOverride?: ActionProgressDialogProps["successTitleOverride"];
  successMessageOverride?: ActionProgressDialogProps["successMessageOverride"];
  errorTitleOverride?: ActionProgressDialogProps["errorTitleOverride"];
  errorMessageOverride?: ActionProgressDialogProps["errorMessageOverride"];
  progressMessage?: ActionProgressDialogProps["progressMessage"];
  indeterminateProgress?: boolean;
  onClose: () => void;
  onRetry?: () => void;
  autoDismissMs?: number;
  /** Called when the user clicks "Review Issues" in the error state */
  onReviewIssues?: () => void;
}

// ── Component ───────────────────────────────────────────────────────────────
export function SaveScreen({
  open,
  state,
  campusName,
  titleOverride,
  loadingMessageOverride,
  successTitleOverride,
  successMessageOverride,
  errorTitleOverride,
  errorMessageOverride,
  progressMessage,
  indeterminateProgress,
  onClose,
  onRetry,
  autoDismissMs = 1200,
  onReviewIssues,
}: SaveScreenProps) {
  // Map legacy "saving" state name to ActionProgressDialog's "loading" state
  const mappedState: ActionProgressDialogProps["state"] =
    state === "saving" ? "loading" : state === "success" ? "success" : "error";

  return (
    <ActionProgressDialog
      open={open}
      state={mappedState}
      action="saving"
      entityName={campusName}
      titleOverride={titleOverride}
      loadingMessageOverride={loadingMessageOverride}
      successTitleOverride={successTitleOverride}
      successMessageOverride={successMessageOverride}
      errorTitleOverride={errorTitleOverride}
      errorMessageOverride={errorMessageOverride}
      progressMessage={progressMessage}
      indeterminateProgress={indeterminateProgress}
      onClose={onClose}
      onRetry={onRetry}
      onReviewIssues={onReviewIssues}
      autoDismissMs={autoDismissMs}
    />
  );
}

import { ActionProgressDialog } from "./ActionProgressDialog";
import type { ActionProgressDialogProps } from "./ActionProgressDialog";

// ── Props ───────────────────────────────────────────────────────────────────
export interface SaveScreenProps {
  open: boolean;
  state: "saving" | "success" | "error";
  campusName?: string;
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
      onClose={onClose}
      onRetry={onRetry}
      onReviewIssues={onReviewIssues}
      autoDismissMs={autoDismissMs}
    />
  );
}

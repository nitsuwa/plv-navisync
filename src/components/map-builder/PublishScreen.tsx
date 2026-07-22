import { ActionProgressDialog } from "./ActionProgressDialog";
import type { ActionProgressDialogProps } from "./ActionProgressDialog";

// ── Props ───────────────────────────────────────────────────────────────────
export interface PublishScreenProps {
  open: boolean;
  state: "publishing" | "success" | "error";
  campusName?: string;
  onClose: () => void;
  onRetry?: () => void;
  autoDismissMs?: number;
  /** Called when the user clicks "Review Issues" in the error state */
  onReviewIssues?: () => void;
}

// ── Component ───────────────────────────────────────────────────────────────
export function PublishScreen({
  open,
  state,
  campusName,
  onClose,
  onRetry,
  autoDismissMs = 1500,
  onReviewIssues,
}: PublishScreenProps) {
  // Map legacy "publishing" state name to ActionProgressDialog's "loading" state
  const mappedState: ActionProgressDialogProps["state"] =
    state === "publishing" ? "loading" : state === "success" ? "success" : "error";

  return (
    <ActionProgressDialog
      open={open}
      state={mappedState}
      action="publishing"
      entityName={campusName}
      onClose={onClose}
      onRetry={onRetry}
      onReviewIssues={onReviewIssues}
      autoDismissMs={autoDismissMs}
    />
  );
}

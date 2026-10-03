import { Flag } from "lucide-react";
import { cn } from "../../lib/utils";

interface StudentReportActionProps {
  onClick: () => void;
  ariaLabel: string;
  testId?: string;
  className?: string;
}

/** Shared, non-destructive report action for student building and room details. */
export function StudentReportAction({ onClick, ariaLabel, testId = "student-report-action", className }: StudentReportActionProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-xl border border-destructive/30 bg-card px-2.5 text-xs font-bold text-destructive shadow-sm transition-[transform,background-color,border-color] duration-150 hover:border-destructive/45 hover:bg-destructive/5 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/30 motion-reduce:transition-none",
        className,
      )}
    >
      <Flag className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">Report</span>
    </button>
  );
}

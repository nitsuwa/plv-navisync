import type { Campus } from "./types";
import { cn } from "../../lib/utils";
import { ToolbarTooltip } from "./ToolbarTooltip";

export type CampusStatusKind = "live" | "unsaved" | "saved-unpublished" | "draft";

export interface CampusStatusDetails {
  kind: CampusStatusKind;
  badgeLabel: "Live" | "Changes" | "Ready to Publish" | "Draft" | "New";
  title: string;
  description: string;
  studentsSee: string;
  nextStep?: string;
  badgeClassName: string;
  dotClassName: string;
  tooltipClassName: string;
  titleClassName: string;
}

type CampusStatusSource = Pick<Campus, "publishStatus" | "publishedAt" | "lifecycleStatus">;

/**
 * Derive the status explanation from the same persisted/editor signals used by
 * the Map Builder lifecycle controls. `isDirty` is the local, unsaved editor
 * snapshot; `hasDraftChanges` is the saved draft timestamp being newer than
 * the currently published version (or the persisted lifecycle fallback when
 * the immutable snapshot is not available yet).
 */
export function getCampusStatusDetails(
  campus: CampusStatusSource,
  isDirty: boolean,
  hasDraftChanges = false,
): CampusStatusDetails {
  const hasPublishedVersion = Boolean(campus.publishedAt) || campus.lifecycleStatus === "unpublished";

  if (campus.publishStatus === "published") {
    if (isDirty) {
      return {
        kind: "unsaved",
        badgeLabel: "Changes",
        title: "Unsaved changes",
        description: "Unsaved edits are not live yet.",
        studentsSee: "The currently published campus map.",
        nextStep: "Save when you’re ready.",
        badgeClassName: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/30 text-amber-700 dark:text-amber-400",
        dotClassName: "bg-amber-500",
        tooltipClassName: "w-[230px] border-amber-200/80 dark:border-amber-800/50 bg-amber-50/95 dark:bg-amber-950/90",
        titleClassName: "text-amber-800 dark:text-amber-300",
      };
    }
    if (hasDraftChanges) {
      return {
        kind: "saved-unpublished",
        badgeLabel: "Ready to Publish",
        title: "Ready to publish",
        description: "Saved changes are not live yet.",
        studentsSee: "The previous published campus map.",
        nextStep: "Review & Publish when ready.",
        badgeClassName: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/30 text-amber-700 dark:text-amber-400",
        dotClassName: "bg-amber-500",
        tooltipClassName: "w-[230px] border-amber-200/80 dark:border-amber-800/50 bg-amber-50/95 dark:bg-amber-950/90",
        titleClassName: "text-amber-800 dark:text-amber-300",
      };
    }
    return {
      kind: "live",
      badgeLabel: "Live",
      title: "Live",
      description: "Students are viewing the latest published map.",
      studentsSee: "The latest published campus map.",
      badgeClassName: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/30 text-green-700 dark:text-green-400",
      dotClassName: "bg-green-500",
      tooltipClassName: "w-[220px] border-emerald-200/80 dark:border-emerald-800/50 bg-emerald-50/95 dark:bg-emerald-950/90",
      titleClassName: "text-emerald-800 dark:text-emerald-300",
    };
  }

  if (hasPublishedVersion) {
    return {
      kind: "saved-unpublished",
      badgeLabel: "Draft",
      title: "Ready to publish",
      description: "Saved changes are not live yet.",
      studentsSee: "The previous published campus map.",
      nextStep: "Review & Publish when ready.",
      badgeClassName: "bg-muted border-border text-muted-foreground",
      dotClassName: "bg-muted-foreground",
      tooltipClassName: "w-[230px] border-slate-200/80 dark:border-slate-700/50 bg-slate-50/95 dark:bg-slate-950/90",
      titleClassName: "text-slate-700 dark:text-slate-300",
    };
  }

  return {
    kind: "draft",
    badgeLabel: "New",
    title: "Not published",
    description: isDirty
      ? "Unsaved edits are not visible to students yet."
      : "This campus is not visible to students yet.",
    studentsSee: "No campus map yet.",
    nextStep: "Publish when ready.",
    badgeClassName: "bg-slate-50 dark:bg-slate-800/20 border-slate-200 dark:border-slate-700/30 text-slate-500 dark:text-slate-400",
    dotClassName: "bg-slate-400",
    tooltipClassName: "w-[220px] border-slate-200/80 dark:border-slate-700/50 bg-slate-50/95 dark:bg-slate-950/90",
    titleClassName: "text-slate-700 dark:text-slate-300",
  };
}

export function CampusStatusBadge({
  campus,
  isDirty,
  hasDraftChanges,
}: {
  campus: CampusStatusSource;
  isDirty: boolean;
  hasDraftChanges: boolean;
}) {
  const details = getCampusStatusDetails(campus, isDirty, hasDraftChanges);
  const tooltip = [details.description, details.nextStep].filter(Boolean).join("\n");
  const accessibleLabel = `${details.badgeLabel}. ${details.description} Students currently see: ${details.studentsSee}${details.nextStep ? ` Next step: ${details.nextStep}` : ""}`;

  return (
    <ToolbarTooltip tool="campusStatus" label={details.title} shortcut="" hint={tooltip} tooltipClassName={details.tooltipClassName} titleClassName={details.titleClassName}>
      <span
        data-testid="campus-status-badge"
        role="status"
        tabIndex={0}
        aria-label={accessibleLabel}
        className={cn("text-[8px] font-bold px-1.5 py-0.5 rounded-md border shrink-0 hidden sm:flex items-center gap-1 outline-none focus-visible:ring-2 focus-visible:ring-primary/50", details.badgeClassName)}
      >
        <span className={cn("w-1 h-1 rounded-full shrink-0", details.dotClassName)} />
        {details.badgeLabel}
      </span>
    </ToolbarTooltip>
  );
}

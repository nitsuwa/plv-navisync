/**
 * B7 Phase 2 — Object-specific issue guidance.
 *
 * A compact, severity-styled "Needs attention" section shown near the TOP of an
 * object's Properties sidebar when that object currently has live validation
 * issues. It is derived from the SAME canonical issue list as the global Issues
 * control and the on-canvas markers — never a separate validator — so it
 * appears and disappears immediately as issues are created or fixed.
 *
 * - error   → destructive/red styling
 * - warning → amber styling
 * - info    → neutral/informational styling
 * - multiple issues render as separate concise rows (deduped upstream)
 * - renders nothing when there are no issues for the selection
 */

import { AlertTriangle, Info, AlertCircle } from "lucide-react";
import { cn } from "../../lib/utils";
import type { ValidationIssue } from "./ValidationErrorsDialog";
import type { FloorIssue } from "../../lib/floorGeometry";
import { issueKey } from "../../lib/issueLocate";

export interface ObjectIssueItem {
  /** Stable identity (dedupes logically-identical issues). */
  key: string;
  severity: "error" | "warning" | "info";
  /** Short human-facing title, e.g. "Duplicate room name". */
  title: string;
  /** The validator's readable explanation / suggested resolution. */
  message: string;
}

/** A few hand-written titles where the raw type name reads awkwardly. */
const TITLE_OVERRIDES: Record<string, string> = {
  emergency_exit_no_nav: "Emergency exit is not connected to Navigation",
  nav_edge_blocked_by_obstacle: "Navigation connection is blocked",
};

/** Human-readable short title for an issue type (snake_case → words). */
export function issueTitleForType(type: string): string {
  if (TITLE_OVERRIDES[type]) return TITLE_OVERRIDES[type];
  return type
    .split("_")
    .map((word) => (word.length > 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");
}

/** Map canonical ValidationIssues into ObjectIssueItem rows (deduped). */
export function validationIssuesToItems(issues: ValidationIssue[]): ObjectIssueItem[] {
  const seen = new Set<string>();
  const out: ObjectIssueItem[] = [];
  for (const issue of issues) {
    const key = issueKey(issue);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      severity: issue.severity,
      title: issueTitleForType(issue.type),
      message: issue.message,
    });
  }
  return out;
}

/** Short title derived from a floor-local message (first sentence, capped). */
function titleFromMessage(message: string): string {
  const trimmed = message.trim();
  const firstSentence = trimmed.split(/(?<=\.)\s+/)[0] ?? trimmed;
  return firstSentence.length > 64 ? `${firstSentence.slice(0, 61)}…` : firstSentence;
}

/**
 * Map FloorIssue rows (canonical rows converted + FloorEditor-local live
 * checks, already deduped by the Issues panel merge) into ObjectIssueItem rows.
 */
export function floorIssuesToItems(issues: FloorIssue[]): ObjectIssueItem[] {
  const seen = new Set<string>();
  const out: ObjectIssueItem[] = [];
  for (const issue of issues) {
    if (seen.has(issue.id)) continue;
    seen.add(issue.id);
    out.push({
      key: issue.id,
      severity: issue.severity,
      title: titleFromMessage(issue.message),
      message: issue.message,
    });
  }
  return out;
}

export function ObjectIssueSection({ items }: { items: ObjectIssueItem[] }) {
  if (items.length === 0) return null;
  const worst: "error" | "warning" | "info" = items.some((i) => i.severity === "error")
    ? "error"
    : items.some((i) => i.severity === "warning")
      ? "warning"
      : "info";
  return (
    <div
      data-testid="object-issue-section"
      data-severity={worst}
      className={cn(
        "rounded-xl border p-2.5 space-y-2",
        worst === "error"
          ? "border-red-300 dark:border-red-800/40 bg-red-50/70 dark:bg-red-900/10"
          : worst === "warning"
            ? "border-amber-300 dark:border-amber-800/40 bg-amber-50/70 dark:bg-amber-900/10"
            : "border-border bg-muted/40"
      )}
    >
      <div className="flex items-center gap-1.5">
        {worst === "error" ? (
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-600" />
        ) : worst === "warning" ? (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
        ) : (
          <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="text-[9px] font-extrabold uppercase tracking-widest text-foreground">Needs attention</span>
      </div>
      <div className="space-y-1.5">
        {items.map((item) => (
          <div key={item.key} className="space-y-0.5">
            <p
              className={cn(
                "text-[10px] font-bold leading-snug",
                item.severity === "error" ? "text-red-700 dark:text-red-400"
                  : item.severity === "warning" ? "text-amber-700 dark:text-amber-400"
                  : "text-foreground"
              )}
            >
              {item.title}
            </p>
            {item.message && (
              <p className="text-[9px] leading-relaxed text-muted-foreground">{item.message}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

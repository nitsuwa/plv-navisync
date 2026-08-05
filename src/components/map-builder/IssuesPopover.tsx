import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, AlertTriangle, CheckCircle2, MapPin } from "lucide-react";
import { cn } from "../../lib/utils";
import type { ValidationIssue, ValidationSeverity } from "./ValidationErrorsDialog";

// ── Issues popover: anchored near the button, shows on hover + click, navigates to issue ──
export function IssuesPopover({ issues, onIssueClick }: { issues: ValidationIssue[]; onIssueClick: (issue: ValidationIssue) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const hoverRef = useRef(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const [pos, setPos] = useState({ x: 0, y: 0, above: true });

  const recalcPos = useCallback(() => {
    if (!ref.current) return;
    const btnRect = ref.current.getBoundingClientRect();
    const POPOVER_WIDTH = 300;
    const centerX = btnRect.left + btnRect.width / 2 - POPOVER_WIDTH / 2;
    const padding = 16;
    const x = Math.max(padding, Math.min(centerX, window.innerWidth - POPOVER_WIDTH - padding));
    const gap = 8;
    const spaceAbove = btnRect.top - gap;
    const spaceBelow = window.innerHeight - btnRect.bottom - gap;
    const showAbove = spaceAbove >= 160 || spaceAbove >= spaceBelow;
    let y: number;
    if (showAbove) {
      y = btnRect.top - gap; // Popover's BOTTOM edge sits above button
    } else {
      y = btnRect.bottom + gap; // Popover's TOP edge sits below button
    }
    setPos({ x, y, above: showAbove });
  }, []);

  // Open on hover, close when leaving both trigger & popover
  const handleMouseEnter = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    if (issues.length > 0) {
      recalcPos();
      setOpen(true);
    }
    hoverRef.current = true;
  }, [issues, recalcPos]);

  const handleMouseLeave = useCallback(() => {
    hoverRef.current = false;
    closeTimerRef.current = setTimeout(() => {
      if (!hoverRef.current) setOpen(false);
    }, 400);
  }, []);

  const handlePopoverMouseEnter = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    hoverRef.current = true;
  }, []);

  const handlePopoverMouseLeave = useCallback(() => {
    hoverRef.current = false;
    closeTimerRef.current = setTimeout(() => {
      if (!hoverRef.current) setOpen(false);
    }, 400);
  }, []);

  // Recalc position on window resize
  useEffect(() => {
    if (!open) return;
    const onResize = () => recalcPos();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, recalcPos]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const errorCount = issues.length;

  // Group issues by severity
  const grouped = useMemo(() => {
    const groups: { label: string; severity: ValidationSeverity; items: ValidationIssue[] }[] = [
      { label: "Errors", severity: "error", items: [] },
      { label: "Warnings", severity: "warning", items: [] },
      { label: "Info", severity: "info", items: [] },
    ];
    for (const issue of issues) {
      const g = groups.find(g => g.severity === issue.severity);
      if (g) g.items.push(issue);
    }
    return groups.filter(g => g.items.length > 0);
  }, [issues]);

  const severityColors: Record<ValidationSeverity, { icon: string; text: string; bg: string; dot: string }> = {
    error: { icon: "#dc2626", text: "#dc2626", bg: "color-mix(in srgb, #dc2626 8%, transparent)", dot: "bg-red-500" },
    warning: { icon: "#d97706", text: "#d97706", bg: "color-mix(in srgb, #d97706 8%, transparent)", dot: "bg-amber-500" },
    info: { icon: "#3b82f6", text: "#3b82f6", bg: "color-mix(in srgb, #3b82f6 8%, transparent)", dot: "bg-blue-500" },
  };

  const showPopover = open && errorCount > 0;

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        onMouseDown={(e) => {
          e.stopPropagation();
          if (!open && issues.length > 0) recalcPos();
          setOpen(v => !v);
        }}
        className={cn(
          "flex items-center gap-1 px-1.5 py-0.5 rounded-sm transition-all cursor-pointer hover:opacity-80",
          open && "opacity-100"
        )}
        style={{
          background: errorCount > 0
            ? "color-mix(in srgb, var(--destructive) 10%, transparent)"
            : "color-mix(in srgb, var(--muted) 40%, transparent)",
        }}
      >
        {errorCount > 0 ? (
          <>
            <AlertTriangle className="h-2.5 w-2.5 shrink-0" style={{ color: "var(--destructive)" }} />
            <span className="text-[9px] font-extrabold" style={{ color: "var(--destructive)" }}>{errorCount}</span>
          </>
        ) : (
          <>
            <CheckCircle2 className="h-2.5 w-2.5 shrink-0" style={{ color: "#22c55e" }} />
            <span className="text-[9px] font-extrabold" style={{ color: "#22c55e" }}>OK</span>
          </>
        )}
      </button>
      {showPopover && createPortal(
        <div
          ref={popoverRef}
          onMouseEnter={handlePopoverMouseEnter}
          onMouseLeave={handlePopoverMouseLeave}
          style={{
            position: "fixed",
            left: pos.x,
            ...(pos.above ? { bottom: window.innerHeight - pos.y } : { top: pos.y }),
            zIndex: 9999,
            pointerEvents: "auto",
            maxWidth: 300,
            minWidth: 260,
          }}
        >
          <div className="rounded-xl border shadow-2xl overflow-hidden" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <div className="px-3 py-2 border-b border-border flex items-center justify-between gap-3">
              <span className="text-[10px] font-bold text-foreground">{'\u26A0'} {errorCount} Issue{errorCount !== 1 ? 's' : ''}</span>
              <button
                onClick={() => setOpen(false)}
                className="flex items-center justify-center w-4 h-4 rounded hover:bg-muted transition-colors"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
            <div className="p-1.5 max-h-[300px] overflow-y-auto scrollbar-show-on-hover">
              {grouped.map((group) => (
                <div key={group.severity}>
                  <div className="flex items-center gap-1.5 px-2 py-1">
                    <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", severityColors[group.severity].dot)} />
                    <span className="text-[8px] font-extrabold uppercase tracking-wider" style={{ color: severityColors[group.severity].text }}>
                      {group.label} ({group.items.length})
                    </span>
                  </div>
                  {group.items.map((issue, idx) => (
                    <button
                      key={`${issue.type}-${issue.buildingId ?? idx}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onIssueClick(issue);
                        setOpen(false);
                      }}
                      className="w-full flex items-start gap-2 px-2.5 py-2 rounded-lg text-left transition-all hover:bg-muted/60 active:scale-[0.98]"
                    >
                      <div
                        className="w-4 h-4 rounded-full shrink-0 mt-0.5 flex items-center justify-center"
                        style={{ background: severityColors[issue.severity].bg }}
                      >
                        <AlertTriangle className="h-2.5 w-2.5" style={{ color: severityColors[issue.severity].icon }} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-[11px] font-medium leading-snug block" style={{ color: "var(--foreground)" }}>
                          {issue.message}
                        </span>
                        {issue.buildingId && (
                          <span className="text-[8px] font-mono mt-0.5 flex items-center gap-1" style={{ color: "var(--muted-foreground)" }}>
                            <MapPin className="h-2.5 w-2.5" />
                            Click to locate on map
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

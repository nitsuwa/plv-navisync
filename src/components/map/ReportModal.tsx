import { useState } from "react";
import { CheckCircle2, Flag, X, MapPin, Camera } from "lucide-react";
import type { Building } from "../../types";
import { cn } from "../../lib/utils";

const ISSUE_TYPES = [
  "Broken Light",
  "Flooded Area",
  "Damaged Property",
  "Blocked Walkway",
  "Safety Hazard",
  "Facility Problem",
  "Other",
];

interface ReportModalProps {
  building: Building;
  onClose: () => void;
}

export function ReportModal({ building, onClose }: ReportModalProps) {
  const [issueType, setIssueType] = useState("");
  const [description, setDescription] = useState("");
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <div
        className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      >
        <div
          className="bg-card border border-border rounded-3xl p-8 shadow-2xl max-w-sm w-full mx-4 text-center"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-14 h-14 rounded-2xl bg-green-100 dark:bg-green-900/20 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="h-7 w-7 text-green-600 dark:text-green-400" />
          </div>
          <h3 className="font-extrabold text-foreground text-lg mb-2" style={{ fontFamily: "var(--font-sans)" }}>
            Report Submitted
          </h3>
          <p className="text-sm text-muted-foreground mb-1">Campus maintenance has been notified.</p>
          <p className="text-xs text-muted-foreground mb-6">
            Location: <span className="font-semibold text-foreground">{building.name}</span>
          </p>
          <button
            onClick={onClose}
            className="h-10 px-8 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="absolute inset-0 z-50 flex items-end sm:items-center justify-center bg-background/70 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-md mx-0 sm:mx-4 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
              <Flag className="h-4 w-4 text-destructive" />
            </div>
            <div>
              <h3 className="font-extrabold text-foreground text-sm" style={{ fontFamily: "var(--font-sans)" }}>
                Report Issue
              </h3>
              <p className="text-[11px] text-muted-foreground">{building.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center hover:bg-secondary transition-colors"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/60 border border-border">
            <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="text-xs text-foreground font-semibold flex-1">{building.name}</span>
            <span className="text-[10px] font-bold text-green-600 dark:text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded-full">
              Auto-set
            </span>
          </div>
          <div>
            <label className="block text-xs font-bold text-foreground uppercase tracking-wide mb-2">Issue Type *</label>
            <div className="grid grid-cols-2 gap-1.5">
              {ISSUE_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setIssueType(t)}
                  className={cn(
                    "text-xs font-semibold py-2 px-2.5 rounded-xl border text-left transition-all",
                    issueType === t
                      ? "border-destructive bg-destructive/8 text-destructive"
                      : "border-border text-muted-foreground hover:border-destructive/30",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-foreground uppercase tracking-wide mb-1.5">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Describe the issue in detail…"
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-input-background text-foreground placeholder:text-muted-foreground text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
              style={{ fontFamily: "var(--font-body)" }}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              className="flex items-center gap-1.5 h-10 px-3 rounded-xl border border-border text-muted-foreground text-xs font-semibold hover:bg-muted transition-colors"
            >
              <Camera className="h-3.5 w-3.5" /> Photo
            </button>
            <button
              onClick={() => { if (issueType) setSubmitted(true); }}
              disabled={!issueType}
              className="flex-1 h-10 rounded-xl bg-destructive text-destructive-foreground text-sm font-extrabold hover:bg-destructive/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.97]"
            >
              Submit Report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

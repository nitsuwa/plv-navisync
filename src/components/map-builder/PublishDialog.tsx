import { useState } from "react";
import { motion } from "motion/react";
import { X, Building2, Layers, DoorOpen, AlertTriangle, CheckCircle2, Globe, Clock, CalendarDays, Eye, Share2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { SPRING } from "../../config/animation";
import type { Campus } from "./types";

interface PublishDialogProps {
  campus: Campus;
  onClose: () => void;
  onPublish: () => void;
}

export function PublishDialog({ campus, onClose, onPublish }: PublishDialogProps) {
  const [scheduleMode, setScheduleMode] = useState<"now" | "later" | null>(null);
  const [scheduleDate, setScheduleDate] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [previewUrl] = useState(() => `preview/${campus.id}?token=${Date.now().toString(36)}`);
  const [copied, setCopied] = useState(false);

  const totalBuildings = campus.buildings.length;
  const totalFloors = campus.buildings.reduce((s, b) => s + b.floors.length, 0);
  const totalRooms = campus.buildings.reduce(
    (s, b) => s + b.floors.reduce((sf, f) => sf + f.rooms.length, 0),
    0
  );
  const totalPaths = campus.paths.length;
  const totalMarkers = campus.markers.length;

  const warnings: string[] = [];
  if (totalBuildings === 0) warnings.push("No buildings have been added to this campus.");
  campus.buildings.forEach((b) => {
    if (!b.name || b.name === "New Building") warnings.push(`Building "${b.code}" has a placeholder name.`);
    if (!b.description) warnings.push(`Building "${b.code}" has no description.`);
    b.floors.forEach((f) => {
      if (f.rooms.length === 0) warnings.push(`"${b.code}" floor "${f.label}" has no rooms.`);
    });
  });

  const hasWarnings = warnings.length > 0;

  const handleCopyPreview = () => {
    navigator.clipboard?.writeText(previewUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", duration: 0.4, bounce: 0.25 }}
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col"
        style={{ maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Globe className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-extrabold text-foreground text-base" style={{ fontFamily: "var(--font-sans)" }}>
                Publish Campus
              </h2>
              <p className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-body)" }}>
                Review before publishing {campus.name} to students
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center hover:bg-secondary transition-colors text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-show-on-hover p-6 space-y-5">
          {/* Campus Summary */}
          <div>
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-muted-foreground mb-3">
              Campus Summary
            </h3>
            <div className="flex flex-col gap-1.5 px-4 py-3 rounded-xl border border-border bg-muted/20">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Name</span>
                <span className="font-bold text-foreground">{campus.name}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Code</span>
                <span className="font-bold text-foreground font-mono">{campus.code}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Canvas</span>
                <span className="font-bold text-foreground font-mono">{campus.canvasW} × {campus.canvasH}</span>
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div>
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-muted-foreground mb-3">Content</h3>
            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: Building2, label: "Buildings", value: totalBuildings, color: "text-primary" },
                { icon: Layers, label: "Floors", value: totalFloors, color: "text-emerald-600 dark:text-emerald-400" },
                { icon: DoorOpen, label: "Rooms", value: totalRooms, color: "text-amber-600 dark:text-amber-400" },
              ].map((stat) => (
                <div key={stat.label} className="flex flex-col items-center gap-1.5 py-3 rounded-xl border border-border bg-muted/20">
                  <stat.icon className={cn("h-4 w-4", stat.color)} />
                  <span className="text-lg font-extrabold text-foreground">{stat.value}</span>
                  <span className="text-[10px] text-muted-foreground">{stat.label}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <div className="flex-1 flex items-center justify-between px-3 py-2 rounded-xl border border-border bg-muted/20 text-xs">
                <span className="text-muted-foreground">Paths</span>
                <span className="font-bold text-foreground">{totalPaths}</span>
              </div>
              <div className="flex-1 flex items-center justify-between px-3 py-2 rounded-xl border border-border bg-muted/20 text-xs">
                <span className="text-muted-foreground">Markers</span>
                <span className="font-bold text-foreground">{totalMarkers}</span>
              </div>
            </div>
          </div>

          {/* Warnings */}
          {hasWarnings && (
            <div>
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                Validation
              </h3>
              <div className="space-y-1.5">
                {warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-xl border border-amber-200 dark:border-amber-800/30 bg-amber-50 dark:bg-amber-900/10">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <span className="text-xs text-amber-800 dark:text-amber-300" style={{ fontFamily: "var(--font-body)" }}>{w}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {!hasWarnings && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-green-200 dark:border-green-800/30 bg-green-50 dark:bg-green-900/10">
              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
              <span className="text-xs font-semibold text-green-700 dark:text-green-300">All checks passed.</span>
            </div>
          )}

          {/* ── Staging Preview ── */}
          <div>
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
              <Eye className="h-3.5 w-3.5" />
              Staging Preview
            </h3>
            <div className="rounded-xl border border-border overflow-hidden">
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Share2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-semibold text-foreground">Generate Preview Link</span>
                </div>
                <span className="text-[10px] text-primary">{showPreview ? "Hide" : "Show"}</span>
              </button>
              {showPreview && (
                <div className="px-4 pb-3 space-y-2">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border">
                    <code className="flex-1 text-[10px] font-mono text-muted-foreground truncate">{previewUrl}</code>
                    <button
                      onClick={handleCopyPreview}
                      className="shrink-0 text-[10px] font-bold text-primary hover:text-primary/80 transition-colors"
                    >
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Share this link with reviewers to preview the campus before publishing. The preview shows exactly what students will see.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ── Scheduling ── */}
          <div>
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              Schedule
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() => setScheduleMode("now")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 h-10 rounded-xl border text-xs font-bold transition-all",
                  scheduleMode === "now"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted"
                )}
              >
                <Globe className="h-4 w-4" />
                Publish Now
              </button>
              <button
                onClick={() => setScheduleMode("later")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 h-10 rounded-xl border text-xs font-bold transition-all",
                  scheduleMode === "later"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted"
                )}
              >
                <Clock className="h-4 w-4" />
                Schedule
              </button>
            </div>
            {scheduleMode === "later" && (
              <div className="mt-2">
                <input
                  type="datetime-local"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-border bg-input-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-6 pb-5 pt-3 border-t border-border shrink-0">
          <button onClick={onClose} className="flex-1 h-10 rounded-xl border border-border text-sm font-bold text-muted-foreground hover:bg-muted transition-colors">
            Cancel
          </button>
          <button
            onClick={onPublish}
            disabled={scheduleMode === "later" && !scheduleDate}
            className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-extrabold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-40"
          >
            <Globe className="h-4 w-4" />
            {scheduleMode === "later" && scheduleDate ? "Schedule Publish" : "Publish Now"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

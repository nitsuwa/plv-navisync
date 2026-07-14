import { cn } from "../../lib/utils";

// ── Base skeleton block ──────────────────────────────────────────────────────

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn("animate-pulse rounded-xl bg-muted/60", className)}
      aria-hidden="true"
    />
  );
}

// ── Card skeleton ────────────────────────────────────────────────────────────

export function SkeletonCard({ className }: SkeletonProps) {
  return (
    <div className={cn("bg-card rounded-2xl border border-border shadow-sm p-5", className)}>
      <div className="flex items-center gap-4 mb-4">
        <Skeleton className="w-11 h-11 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-2.5 w-20" />
        </div>
        <Skeleton className="w-20 h-7 rounded-lg" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-2.5 w-full" />
        <Skeleton className="h-2.5 w-3/4" />
      </div>
    </div>
  );
}

// ── Table row skeleton ───────────────────────────────────────────────────────

export function SkeletonTableRow({ cols = 5 }: { cols?: number }) {
  return (
    <div className="flex items-center gap-4 px-5 py-4 border-b border-border last:border-0">
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            "h-4",
            i === 0 ? "flex-[2]" : i === cols - 1 ? "w-20 ml-auto" : "flex-1 hidden md:block"
          )}
        />
      ))}
    </div>
  );
}

// ── Dashboard skeleton ───────────────────────────────────────────────────────

export function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-72" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-9 w-28 rounded-xl" />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>

      {/* Progress section */}
      <Skeleton className="h-52 w-full rounded-2xl" />

      {/* Quick actions */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-28" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid lg:grid-cols-3 gap-5">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-64 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

// ── Table page skeleton ──────────────────────────────────────────────────────

export function TablePageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-36" />
        </div>
        <Skeleton className="h-10 w-36 rounded-xl" />
      </div>

      {/* Search / filter */}
      <div className="flex gap-3">
        <Skeleton className="h-10 w-72 rounded-xl" />
        <div className="flex gap-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-20 rounded-xl" />
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        {/* Header row */}
        <div className="flex items-center gap-4 px-5 py-3 bg-muted/40 border-b border-border">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton
              key={i}
              className={cn("h-3", i === 0 ? "flex-[2]" : i === 4 ? "w-24 ml-auto" : "flex-1 hidden md:block")}
            />
          ))}
        </div>
        {/* Data rows */}
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonTableRow key={i} />
        ))}
      </div>
    </div>
  );
}

// ── Settings page skeleton ───────────────────────────────────────────────────

export function SettingsSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-36 rounded-xl" />
      </div>

      {/* Tabs */}
      <Skeleton className="h-12 w-full rounded-2xl" />

      {/* Content cards */}
      {Array.from({ length: 2 }).map((_, i) => (
        <Skeleton key={i} className="h-64 w-full rounded-2xl" />
      ))}
    </div>
  );
}

// ── Map builder skeleton ─────────────────────────────────────────────────────

export function MapBuilderSkeleton() {
  return (
    <div className="flex flex-col w-full flex-1 min-h-0 animate-fade-in">
      {/* Header */}
      <div className="h-12 border-b border-border bg-card flex items-center px-4 gap-2 shrink-0">
        <Skeleton className="h-7 w-20 rounded-lg" />
        <div className="w-px h-4 bg-border" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-5 w-16 rounded-full" />
        <div className="flex-1" />
        <Skeleton className="h-8 w-24 rounded-xl" />
        <Skeleton className="h-8 w-8 rounded-xl" />
        <Skeleton className="h-8 w-8 rounded-xl" />
        <div className="w-px h-5 bg-border" />
        <Skeleton className="h-8 w-24 rounded-xl" />
      </div>

      {/* Canvas area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Hierarchy panel */}
        <div className="w-56 border-r border-border bg-card shrink-0">
          <div className="px-3 py-2.5 border-b border-border">
            <Skeleton className="h-3 w-20" />
          </div>
          <div className="p-3 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className={cn("h-6 rounded-lg", i % 2 === 0 ? "w-full" : "w-3/4")} />
            ))}
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 bg-[#e8eaf0] flex items-center justify-center">
          <div className="text-center">
            <Skeleton className="w-80 h-60 rounded-xl mx-auto mb-4" />
            <Skeleton className="h-4 w-48 mx-auto" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Reports specific skeleton ────────────────────────────────────────────────

export function ReportsSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-8 w-28 rounded-xl" />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>

      {/* Reports list */}
      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <div className="flex gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-20 rounded-xl" />
            ))}
            <div className="flex-1" />
            <Skeleton className="h-8 w-32 rounded-xl" />
            <Skeleton className="h-8 w-32 rounded-xl" />
          </div>
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-start gap-4 px-5 py-4">
              <Skeleton className="w-9 h-9 rounded-xl shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-64" />
                <Skeleton className="h-3 w-96" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-3 w-16 ml-auto" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

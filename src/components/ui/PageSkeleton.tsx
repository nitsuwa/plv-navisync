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
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-28 rounded-xl" />
      </div>

      {/* Stats grid - 4 cards matching KEY_METRICS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-card rounded-2xl border border-border shadow-sm p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-8 w-12" />
                <Skeleton className="h-3 w-28" />
                <div className="flex items-center gap-1.5 mt-2">
                  <Skeleton className="h-3.5 w-3.5 rounded-full" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
              <Skeleton className="w-12 h-12 rounded-2xl shrink-0" />
            </div>
          </div>
        ))}
      </div>

      {/* Bottom row - 3 columns matching Priority, Activity, Quick Actions */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Priority Items */}
        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-5 rounded-full" />
            </div>
          </div>
          <div className="divide-y divide-border">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 px-5 py-3.5">
                <Skeleton className="w-8 h-8 rounded-xl shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3 w-44" />
                  <Skeleton className="h-2.5 w-16" />
                </div>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 border-t border-border">
            <Skeleton className="h-3 w-24" />
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <Skeleton className="h-4 w-28" />
          </div>
          <div className="divide-y divide-border">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 px-5 py-3">
                <Skeleton className="w-7 h-7 rounded-lg shrink-0" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3 w-36" />
                  <Skeleton className="h-2.5 w-52" />
                </div>
                <Skeleton className="h-2.5 w-10" />
              </div>
            ))}
          </div>
          <div className="px-5 py-3 border-t border-border">
            <Skeleton className="h-3 w-24" />
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-card rounded-2xl border border-border shadow-sm p-5">
          <Skeleton className="h-4 w-28 mb-4" />
          <div className="grid grid-cols-2 gap-2.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="p-3 rounded-xl border border-border">
                <div className="space-y-2">
                  <Skeleton className="w-9 h-9 rounded-xl" />
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-2.5 w-14" />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-border">
            <Skeleton className="h-3 w-36" />
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <Skeleton className="h-10 w-full rounded-2xl" />
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

// ── List card skeleton (for Locations, Routes) ───────────────────────────────

export function ListCardSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="bg-card rounded-2xl border border-border shadow-sm p-4">
          <div className="flex items-start gap-3 mb-3">
            <Skeleton className="w-9 h-9 rounded-xl shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="w-14 h-6 rounded-lg" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-2.5 w-full" />
            <Skeleton className="h-2.5 w-4/5" />
          </div>
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
            <Skeleton className="h-6 w-3/5" />
            <Skeleton className="h-6 w-1/4 ml-auto" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Event card skeleton ─────────────────────────────────────────────────────

export function EventCardSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="grid gap-4">
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="flex items-start gap-4 p-5">
            <Skeleton className="w-12 h-12 rounded-2xl shrink-0" />
            <div className="flex-1 space-y-3 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                </div>
                <Skeleton className="h-6 w-20 rounded-full shrink-0" />
              </div>
              <div className="flex gap-4">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-3 w-36" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 px-5 py-3 border-t border-border">
            <Skeleton className="h-8 w-16 rounded-xl" />
            <Skeleton className="h-8 w-20 rounded-xl" />
            <Skeleton className="h-8 w-16 rounded-xl ml-auto" />
          </div>
        </div>
      ))}
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

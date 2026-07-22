import { cn } from "../../lib/utils";

interface SkeletonProps {
  className?: string;
  variant?: "text" | "circular" | "rectangular" | "card" | "avatar";
  width?: string | number;
  height?: string | number;
}

export function Skeleton({ className, variant = "text", width, height }: SkeletonProps) {
  const base = "animate-pulse bg-muted/60 rounded-xl";
  const variants = {
    text: "h-4 w-full",
    circular: "rounded-full",
    rectangular: "rounded-xl",
    card: "h-48 w-full rounded-2xl",
    avatar: "h-10 w-10 rounded-full",
  };

  return (
    <div
      className={cn(base, variants[variant], className)}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <Skeleton variant="card" />
      <div className="p-4 space-y-3">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <div className="flex gap-2 pt-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4 rounded-2xl border border-border bg-card">
          <Skeleton variant="avatar" className="shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-8 w-20 rounded-xl shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonPage() {
  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-7 py-10 space-y-8">
      <div className="flex items-center gap-4">
        <Skeleton variant="avatar" className="h-12 w-12" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}

export function SkeletonInline({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-block animate-pulse bg-muted-foreground/10 rounded", className)}
      style={{ width: "4em", height: "1em" }}
      aria-hidden="true"
    />
  );
}

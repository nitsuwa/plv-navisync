import { Bell, AlertTriangle, Megaphone, Wrench, CalendarDays, Clock } from "lucide-react";
import type { Announcement } from "../../types";
import { CategoryBadge, PriorityBadge } from "./Badge";
import { formatRelativeTime, formatDate } from "../../lib/utils";
import { cn } from "../../lib/utils";

interface AnnouncementCardProps {
  announcement: Announcement;
  className?: string;
  compact?: boolean;
}

const categoryIcons = {
  general: Bell,
  academic: CalendarDays,
  event: Megaphone,
  emergency: AlertTriangle,
  maintenance: Wrench,
};

const accentColors: Record<string, string> = {
  urgent: "border-l-destructive bg-destructive/3",
  high: "border-l-yellow-500 bg-yellow-50/50 dark:bg-yellow-900/5",
  normal: "border-l-primary bg-primary/3 dark:bg-primary/5",
  low: "border-l-border",
};

const iconBg: Record<string, string> = {
  urgent: "bg-destructive/10 text-destructive",
  high: "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400",
  normal: "bg-primary/10 text-primary",
  low: "bg-muted text-muted-foreground",
};

export function AnnouncementCard({ announcement, className, compact = false }: AnnouncementCardProps) {
  const Icon = categoryIcons[announcement.category as keyof typeof categoryIcons] ?? Bell;

  return (
    <div className={cn(
      "rounded-2xl border border-border bg-card shadow-sm overflow-hidden border-l-4 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5",
      accentColors[announcement.priority] ?? "border-l-border",
      className
    )}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={cn("shrink-0 flex items-center justify-center w-9 h-9 rounded-xl", iconBg[announcement.priority] ?? iconBg.normal)}>
            <Icon className="h-4 w-4" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
              <CategoryBadge category={announcement.category} />
              <PriorityBadge priority={announcement.priority} />
            </div>

            <h3 className="font-bold text-foreground text-sm leading-snug line-clamp-2 mb-1">
              {announcement.title}
            </h3>

            {!compact && (
              <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3 mb-3">
                {announcement.content}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-1.5">
              <span className="font-semibold text-foreground/70">{announcement.author}</span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatRelativeTime(announcement.published_at)}
              </span>
              {announcement.expires_at && !compact && (
                <span className="text-muted-foreground/70">Expires {formatDate(announcement.expires_at)}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { cn } from "../../lib/utils";
import { memo } from "react";
import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: { value: number; label: string };
  variant?: "default" | "primary" | "accent" | "success" | "warning";
  className?: string;
}

const variantConfig = {
  default: {
    wrapper: "bg-card border-border",
    icon: "bg-primary/10 text-primary",
    title: "text-muted-foreground",
    value: "text-foreground",
  },
  primary: {
    wrapper: "bg-primary border-primary text-primary-foreground",
    icon: "bg-white/20 text-white",
    title: "text-primary-foreground/70",
    value: "text-white",
  },
  accent: {
    wrapper: "bg-gradient-to-br from-accent/15 to-accent/5 border-accent/25",
    icon: "bg-accent/20 text-accent",
    title: "text-muted-foreground",
    value: "text-foreground",
  },
  success: {
    wrapper: "bg-gradient-to-br from-green-50 to-emerald-50/50 border-green-200 dark:from-green-900/20 dark:to-emerald-900/10 dark:border-green-800/40",
    icon: "bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400",
    title: "text-muted-foreground",
    value: "text-foreground",
  },
  warning: {
    wrapper: "bg-gradient-to-br from-blue-50 to-indigo-50/50 border-blue-200 dark:from-blue-900/20 dark:border-blue-800/40",
    icon: "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400",
    title: "text-muted-foreground",
    value: "text-foreground",
  },
};

const StatCard = memo(function StatCard({ title, value, subtitle, icon: Icon, trend, variant = "default", className }: StatCardProps) {
  const cfg = variantConfig[variant];

  return (
    <div className={cn(
      "rounded-2xl border p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5",
      cfg.wrapper,
      className
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className={cn("text-[11px] font-bold uppercase tracking-widest", cfg.title)}>
            {title}
          </p>
          <p className={cn("text-2xl sm:text-3xl font-extrabold tracking-tight tabular-nums mt-1.5", cfg.value)}>
            {value}
          </p>
          {subtitle && (
            <p className={cn("text-xs mt-1.5 leading-relaxed", cfg.title)}>
              {subtitle}
            </p>
          )}
          {trend && (
            <div className="flex items-center gap-1.5 mt-2">
              {trend.value >= 0
                ? <TrendingUp className="h-3.5 w-3.5 text-green-500" />
                : <TrendingDown className="h-3.5 w-3.5 text-destructive" />
              }
              <span className={cn("text-xs font-bold", trend.value >= 0 ? "text-green-500" : "text-destructive")}>
                {trend.value >= 0 ? "+" : ""}{trend.value}%
              </span>
              <span className={cn("text-xs", cfg.title)}>{trend.label}</span>
            </div>
          )}
        </div>
        <div className={cn("shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-sm", cfg.icon)}>
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>
      </div>
    </div>
  );
});

export { StatCard };

import { cn } from "../../lib/utils";

type BadgeVariant = "default" | "secondary" | "accent" | "success" | "warning" | "danger" | "urgent";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variants: Record<BadgeVariant, string> = {
  default: "bg-primary/10 text-primary",
  secondary: "bg-secondary text-secondary-foreground",
  accent: "bg-accent/20 text-accent dark:text-accent",
  success: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  warning: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  danger: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  urgent: "bg-destructive text-destructive-foreground",
};

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide", variants[variant], className)}>
      {children}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, BadgeVariant> = {
    low: "secondary",
    normal: "default",
    high: "warning",
    urgent: "urgent",
  };
  const labels: Record<string, string> = {
    low: "Low",
    normal: "Normal",
    high: "High",
    urgent: "Urgent",
  };
  return <Badge variant={map[priority] ?? "default"}>{labels[priority] ?? priority}</Badge>;
}

export function CategoryBadge({ category }: { category: string }) {
  const map: Record<string, BadgeVariant> = {
    general: "secondary",
    academic: "default",
    event: "accent",
    emergency: "urgent",
    maintenance: "warning",
  };
  return (
    <Badge variant={map[category] ?? "default"} className="capitalize">
      {category}
    </Badge>
  );
}

export function BuildingCategoryBadge({ category }: { category: string }) {
  const map: Record<string, BadgeVariant> = {
    academic: "default",
    admin: "accent",
    facility: "success",
    sports: "warning",
    dormitory: "secondary",
  };
  return (
    <Badge variant={map[category] ?? "default"} className="capitalize">
      {category}
    </Badge>
  );
}

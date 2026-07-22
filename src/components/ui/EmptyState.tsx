import { motion } from "motion/react";
import { cn } from "../../lib/utils";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "py-10" : "py-20",
        className
      )}
    >
      {/* Animated icon container with gradient glow */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.12, type: "spring", stiffness: 200, damping: 14 }}
        className="relative mb-6"
      >
        {/* Outer glow ring */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/8 to-primary/3 blur-xl scale-150" />
        {/* Icon container */}
        <div className={cn(
          "relative flex items-center justify-center rounded-2xl shadow-sm",
          compact ? "w-14 h-14" : "w-20 h-20",
          "bg-gradient-to-br from-muted to-muted/70 border border-border shadow-sm"
        )}>
          <Icon
            className={cn(
              "text-muted-foreground/45",
              compact ? "h-7 w-7" : "h-10 w-10"
            )}
          />
          {/* Decorative dotted ring */}
          <div className="absolute inset-0 rounded-2xl border border-dashed border-muted-foreground/10 scale-110" />
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.22, duration: 0.35 }}
        className="space-y-1"
      >
        <h3 className={cn(
          "font-extrabold text-foreground",
          compact ? "text-base" : "text-xl tracking-tight"
        )}>
          {title}
        </h3>
        {description && (
          <p className={cn(
            "text-muted-foreground leading-relaxed mx-auto",
            compact ? "text-xs max-w-[260px]" : "text-sm max-w-sm"
          )}>
            {description}
          </p>
        )}
      </motion.div>

      {action && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.32, duration: 0.35 }}
          className="mt-7"
        >
          {action}
        </motion.div>
      )}
    </motion.div>
  );
}

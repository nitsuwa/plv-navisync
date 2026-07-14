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
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "py-12" : "py-20",
        className
      )}
    >
      {/* Animated icon container */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.15, type: "spring", stiffness: 200, damping: 15 }}
        className={cn(
          "relative flex items-center justify-center rounded-2xl mb-5",
          compact ? "w-14 h-14" : "w-20 h-20",
          "bg-muted border border-border"
        )}
      >
        <Icon
          className={cn(
            "text-muted-foreground/50",
            compact ? "h-7 w-7" : "h-10 w-10"
          )}
        />
        {/* Decorative ring */}
        <div className="absolute inset-0 rounded-2xl border border-dashed border-muted-foreground/10 scale-110" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.3 }}
      >
        <h3 className={cn(
          "font-extrabold text-foreground mb-1",
          compact ? "text-base" : "text-lg"
        )}>
          {title}
        </h3>
        {description && (
          <p className={cn(
            "text-muted-foreground leading-relaxed mx-auto max-w-xs",
            compact ? "text-xs" : "text-sm"
          )}>
            {description}
          </p>
        )}
      </motion.div>

      {action && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.3 }}
          className="mt-6"
        >
          {action}
        </motion.div>
      )}
    </motion.div>
  );
}

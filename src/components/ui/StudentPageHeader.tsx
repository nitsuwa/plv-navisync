import { Link } from "react-router";
import { ChevronLeft } from "lucide-react";
import { cn } from "../../lib/utils";

interface StudentPageHeaderProps {
  title: string;
  subtitle?: string;
  icon: React.ElementType;
  iconBg?: string;
  iconColor?: string;
  backTo?: string;
  action?: React.ReactNode;
  variant?: "default" | "profile";
  children?: React.ReactNode;
}

export function StudentPageHeader({
  title,
  subtitle,
  icon: Icon,
  iconBg = "color-mix(in srgb, var(--primary) 14%, transparent)",
  iconColor = "var(--primary)",
  backTo,
  action,
  variant = "default",
  children,
}: StudentPageHeaderProps) {
  return (
    <div className={cn("relative overflow-hidden", variant === "profile" ? "student-hero-header" : "student-page-header")}>
      {/* Decorative mesh orbs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full opacity-40 animate-orb-1"
          style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--primary) 30%, transparent) 0%, transparent 70%)" }}/>
        <div className="absolute -bottom-20 -left-10 w-48 h-48 rounded-full opacity-30 animate-orb-2"
          style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--accent) 25%, transparent) 0%, transparent 70%)" }}/>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full student-header-grid opacity-[0.04] dark:opacity-[0.06]"/>
      </div>

      <div className="relative max-w-2xl mx-auto px-5 py-6 sm:py-7">
        {backTo && (
          <Link
            to={backTo}
            className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors mb-4 -ml-1 px-2 py-1 rounded-lg hover:bg-muted/60"
          >
            <ChevronLeft className="h-3.5 w-3.5"/>
            Back
          </Link>
        )}

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div
              className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ring-1 ring-black/5 dark:ring-white/10"
              style={{ background: iconBg }}
            >
              <Icon className="h-5 w-5 sm:h-[22px] sm:w-[22px]" style={{ color: iconColor }}/>
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-extrabold text-foreground tracking-tight truncate">
                {title}
              </h1>
              {subtitle && (
                <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 leading-snug">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>

        {children && <div className="mt-5">{children}</div>}
      </div>
    </div>
  );
}

import { Sun, Moon } from "lucide-react";
import { cn } from "../../lib/utils";

interface ThemeToggleProps {
  theme: "light" | "dark";
  onToggle: () => void;
  className?: string;
}

export function ThemeToggle({ theme, onToggle, className }: ThemeToggleProps) {
  return (
    <button
      onClick={onToggle}
      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
      className={cn(
        "relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border",
        "bg-card text-muted-foreground transition-all duration-200",
        "hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      <Sun className={cn("h-4 w-4 transition-all duration-300", theme === "dark" ? "scale-0 opacity-0 absolute" : "scale-100 opacity-100")} />
      <Moon className={cn("h-4 w-4 transition-all duration-300", theme === "light" ? "scale-0 opacity-0 absolute" : "scale-100 opacity-100")} />
    </button>
  );
}

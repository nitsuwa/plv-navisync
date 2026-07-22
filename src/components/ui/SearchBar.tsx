import { Search, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../../lib/utils";
import { useSearchKeyboard } from "../../hooks/useSearchKeyboard";

interface SearchBarProps {
  placeholder?: string;
  onSearch?: (query: string) => void;
  onClear?: () => void;
  className?: string;
  size?: "sm" | "md" | "lg";
  value?: string;
  /** Show keyboard shortcut hint (/ to search) */
  showShortcutHint?: boolean;
  /** Controlled mode — the parent manages state */
  disabled?: boolean;
}

export function SearchBar({
  placeholder = "Search...",
  onSearch,
  onClear,
  className,
  size = "md",
  value: controlledValue,
  showShortcutHint,
  disabled,
}: SearchBarProps) {
  const { inputRef } = useSearchKeyboard({
    onFocus: () => inputRef.current?.focus(),
    onClear: () => onClear?.(),
    hasValue: controlledValue ? controlledValue.length > 0 : false,
  });

  const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPod|iPhone|iPad/.test(navigator.platform ?? navigator.userAgent ?? "");

  const sizeClasses = {
    sm: "h-9 text-xs pl-9 pr-8",
    md: "h-10 text-sm pl-10 pr-9",
    lg: "h-12 text-sm pl-12 pr-10",
  };

  const iconSizes = {
    sm: "h-3.5 w-3.5 left-2.5",
    md: "h-4 w-4 left-3",
    lg: "h-5 w-5 left-4",
  };

  const clearSizes = {
    sm: "right-2",
    md: "right-2.5",
    lg: "right-3",
  };

  return (
    <div className={cn("relative group", className)}>
      <Search
        className={cn(
          "absolute top-1/2 -translate-y-1/2 text-muted-foreground transition-all duration-200 group-focus-within:text-primary group-focus-within:scale-110",
          iconSizes[size]
        )}
      />
      <input
        ref={inputRef}
        type="text"
        value={controlledValue}
        onChange={(e) => onSearch?.(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        aria-label="Search"
        className={cn(
          "w-full rounded-xl border border-border bg-input-background text-foreground placeholder:text-muted-foreground",
          "transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
          "shadow-sm hover:border-primary/30 hover:shadow-md",
          "focus:shadow-lg focus:shadow-primary/5",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          sizeClasses[size]
        )}
      />

      {/* Clear button */}
      <AnimatePresence>
        {controlledValue && (
          <motion.button
            key="clear-btn"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            onClick={() => {
              onClear?.();
              onSearch?.("");
              inputRef.current?.focus();
            }}
            className={cn(
              "absolute top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground hover:scale-110 active:scale-90 transition-all duration-150",
              clearSizes[size]
            )}
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Keyboard shortcut hint */}
      {showShortcutHint && !controlledValue && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none select-none">
          <kbd className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-muted text-[10px] font-semibold text-muted-foreground border border-border">
            {isMac ? "⌘" : "Ctrl"}
            <span className="text-[9px]">/</span>
          </kbd>
        </div>
      )}
    </div>
  );
}

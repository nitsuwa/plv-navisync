import { useState, useRef, useEffect, useCallback } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "../../lib/utils";

export interface ComboboxOption {
  value: string;
  label: string;
  color?: string;
  icon?: React.ElementType;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  align?: "start" | "center" | "end";
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  emptyText = "No results found.",
  className,
  align = "start",
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    if (open) document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const filtered = search.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  const handleSelect = useCallback((opt: ComboboxOption) => {
    onChange(opt.value);
    setOpen(false);
    setSearch("");
  }, [onChange]);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full flex items-center gap-2 h-9 px-3 rounded-xl border border-border bg-input-background text-foreground text-xs font-medium transition-all",
          "hover:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/20",
          open && "border-primary/30 ring-2 ring-primary/20"
        )}
      >
        {selected?.color && (
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ background: selected.color }}
          />
        )}
        {selected?.icon && <selected.icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        <span className="flex-1 text-left truncate">
          {selected ? selected.label : <span className="text-muted-foreground">{placeholder}</span>}
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div
          className={cn(
            "absolute top-full mt-1 z-50 w-full min-w-[180px] rounded-xl border border-border bg-card shadow-xl overflow-hidden animate-scale-in",
            align === "end" && "right-0"
          )}
          style={{ transformOrigin: align === "end" ? "top right" : "top left" }}
        >
          {/* Search input */}
          <div className="flex items-center gap-2 px-3 h-9 border-b border-border">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
            />
          </div>

          {/* Options list */}
          <div className="max-h-[200px] overflow-y-auto scrollbar-show-on-hover py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">{emptyText}</div>
            ) : (
              filtered.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelect(opt)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-left transition-colors",
                      isSelected
                        ? "bg-primary/8 text-primary"
                        : "text-foreground hover:bg-muted"
                    )}
                  >
                    {opt.color && (
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: opt.color }}
                      />
                    )}
                    {opt.icon && <opt.icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                    <span className="flex-1 truncate">{opt.label}</span>
                    {isSelected && <Check className="h-3.5 w-3.5 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

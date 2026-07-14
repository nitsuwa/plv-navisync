import { Search, X } from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/utils";

interface SearchBarProps {
  placeholder?: string;
  onSearch?: (query: string) => void;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function SearchBar({ placeholder = "Search...", onSearch, className, size = "md" }: SearchBarProps) {
  const [query, setQuery] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    onSearch?.(e.target.value);
  };

  const handleClear = () => {
    setQuery("");
    onSearch?.("");
  };

  const sizeClasses = {
    sm: "h-9 text-sm pl-9 pr-8",
    md: "h-11 text-sm pl-10 pr-9",
    lg: "h-14 text-base pl-12 pr-10",
  };

  const iconSizes = {
    sm: "h-3.5 w-3.5 left-2.5",
    md: "h-4 w-4 left-3",
    lg: "h-5 w-5 left-4",
  };

  return (
    <div className={cn("relative group", className)}>
      <Search className={cn("absolute top-1/2 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary", iconSizes[size])} />
      <input
        type="text"
        value={query}
        onChange={handleChange}
        placeholder={placeholder}
        className={cn(
          "w-full rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground",
          "transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
          "shadow-sm hover:border-primary/30",
          sizeClasses[size]
        )}
      />
      {query && (
        <button
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

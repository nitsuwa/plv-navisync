import { useState, useRef, useEffect, useCallback } from "react";
import { Building2, X, ChevronDown } from "lucide-react";
import type { Building } from "../../types";

interface BuildingPickerProps {
  badge: string;
  badgeColor: string;
  value: Building | null;
  onSelect: (b: Building) => void;
  onClear: () => void;
  placeholder: string;
  buildings?: readonly Building[];
}

export function BuildingPicker({
  badge, badgeColor, value, onSelect, onClear, placeholder, buildings,
}: BuildingPickerProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Scroll active item into view
  useEffect(() => {
    if (!open || !listRef.current) return;
    const activeEl = listRef.current.querySelector<HTMLButtonElement>(`[data-idx="${activeIdx}"]`);
    activeEl?.scrollIntoView({ block: "nearest" });
  }, [activeIdx, open]);

  const list = (buildings ?? []) as Building[];
  const filtered = list.filter(
    (b) =>
      !query ||
      b.name.toLowerCase().includes(query.toLowerCase()) ||
      b.code.toLowerCase().includes(query.toLowerCase()),
  );

  const handleSelect = useCallback((b: Building) => {
    onSelect(b);
    setOpen(false);
    setQuery("");
    setActiveIdx(0);
  }, [onSelect]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setOpen(true);
        setQuery("");
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIdx(prev => (prev + 1) % Math.max(filtered.length, 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIdx(prev => (prev - 1 + Math.max(filtered.length, 1)) % Math.max(filtered.length, 1));
        break;
      case "Enter":
        e.preventDefault();
        if (filtered[activeIdx]) {
          handleSelect(filtered[activeIdx]);
        }
        break;
      case "Escape":
        e.preventDefault();
        setOpen(false);
        inputRef.current?.blur();
        break;
    }
  }, [open, filtered, activeIdx, handleSelect]);

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-2 h-10 px-3 rounded-xl border border-border bg-input-background transition-all duration-200 hover:border-primary/30">
        <span
          className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-white text-[9px] font-extrabold"
          style={{ background: badgeColor }}
        >
          {badge}
        </span>
        <input
          ref={inputRef}
          type="text"
          value={open ? query : (value?.name ?? "")}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setActiveIdx(0); }}
          onFocus={() => { setOpen(true); setQuery(""); setActiveIdx(0); }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none min-w-0 transition-all"
          style={{ fontFamily: "var(--font-body)" }}
          aria-label={placeholder}
          aria-expanded={open}
          aria-autocomplete="list"
          role="combobox"
        />
        {value && !open && (
          <button
            onMouseDown={(e) => { e.preventDefault(); onClear(); setQuery(""); }}
            className="text-muted-foreground hover:text-foreground shrink-0"
            aria-label="Clear selection"
          >
            <X className="h-3 w-3" />
          </button>
        )}
        <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
      </div>
      {open && (
        <div
          ref={listRef}
          className="absolute top-full left-0 right-0 mt-1 rounded-xl border border-border bg-card shadow-xl overflow-hidden z-[60]"
          style={{ maxHeight: 200, overflowY: "auto" }}
          role="listbox"
        >
          {/* Screen reader live region for result announcements */}
          <div
            aria-live="polite"
            aria-atomic="true"
            className="sr-only"
          >
            {filtered.length > 0
              ? `${filtered.length} building${filtered.length !== 1 ? 's' : ''}${query ? ` for ${query}` : ''}`
              : query ? `No buildings found for ${query}` : ''}
          </div>
          {filtered.length > 0 ? (
            <>
              {/* Result count */}
              <div className="px-3 pt-2 pb-1 text-[10px] font-semibold text-muted-foreground" aria-hidden="true">
                {filtered.length} building{filtered.length !== 1 ? "s" : ""}
                {query && <> for "<span className="text-foreground/60">{query}</span>"</>}
              </div>
              {filtered.map((b, idx) => (
                <button
                  key={b.id}
                  data-idx={idx}
                  role="option"
                  aria-selected={idx === activeIdx}
                  onMouseDown={(e) => { e.preventDefault(); handleSelect(b); }}
                  onMouseEnter={() => setActiveIdx(idx)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors ${
                    idx === activeIdx
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted active:bg-primary/8"
                  }`}
                >
                  <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Building2 className="h-3 w-3 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-foreground truncate">{b.name}</p>
                    <p className="text-[10px] text-muted-foreground">{b.code}</p>
                  </div>
                </button>
              ))}
            </>
          ) : (
            <div className="flex flex-col items-center py-6 px-4 text-center">
              <Building2 className="h-6 w-6 text-muted-foreground/30 mb-1.5" />
              <p className="text-xs font-semibold text-muted-foreground">No buildings found</p>
              <p className="text-[10px] text-muted-foreground/85 mt-0.5">
                Try a different search term.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

import { useState, useRef, useEffect } from "react";
import { Building2, X } from "lucide-react";
import { MOCK_BUILDINGS as LEGACY_BUILDINGS } from "../../data/mockData";
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
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const list = (buildings ?? LEGACY_BUILDINGS) as Building[];
  const filtered = list.filter(
    (b) =>
      !query ||
      b.name.toLowerCase().includes(query.toLowerCase()) ||
      b.code.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-2 h-9 px-2.5 rounded-xl border border-border bg-input-background/80">
        <span
          className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-white text-[9px] font-extrabold"
          style={{ background: badgeColor }}
        >
          {badge}
        </span>
        <input
          type="text"
          value={open ? query : (value?.name ?? "")}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => { setOpen(true); setQuery(""); }}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none min-w-0"
          style={{ fontFamily: "var(--font-body)" }}
        />
        {value && !open && (
          <button
            onMouseDown={(e) => { e.preventDefault(); onClear(); setQuery(""); }}
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      {open && (
        <div
          className="absolute top-full left-0 right-0 mt-1 rounded-xl border border-border bg-card shadow-xl overflow-hidden z-[60]"
          style={{ maxHeight: 180, overflowY: "auto" }}
        >
          {filtered.length > 0 ? (
            filtered.map((b) => (
              <button
                key={b.id}
                onMouseDown={(e) => { e.preventDefault(); onSelect(b); setOpen(false); setQuery(""); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted transition-colors text-left"
              >
                <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Building2 className="h-3 w-3 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-foreground truncate">{b.name}</p>
                  <p className="text-[10px] text-muted-foreground">{b.code}</p>
                </div>
              </button>
            ))
          ) : (
            <p className="text-xs text-muted-foreground px-3 py-2.5">No buildings found</p>
          )}
        </div>
      )}
    </div>
  );
}

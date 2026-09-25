import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Search, Sparkles, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { CanvasAssetVisual } from "./CanvasAssetVisual";
import {
  getCanvasAsset,
  listCanvasAssets,
  type CanvasAssetCategory,
  type CanvasAssetDescriptor,
  type CanvasAssetSurface,
} from "./canvasAssetCatalog";

export interface CanvasAssetPaletteProps {
  surface: CanvasAssetSurface;
  activeKey: string | null;
  onSelect: (asset: CanvasAssetDescriptor) => void;
  compact?: boolean;
  disabled?: boolean;
  /** Keeps the event asset picker over the canvas instead of in page flow. */
  floating?: boolean;
}

const CATEGORY_ORDER: CanvasAssetCategory[] = ["essentials", "seating", "production", "outdoor", "safety", "signage"];
const CATEGORY_LABELS: Record<CanvasAssetCategory, string> = {
  essentials: "Essentials",
  seating: "Seating",
  production: "Production",
  outdoor: "Outdoor",
  safety: "Safety",
  signage: "Signage",
};

const EVENT_RECENT_ASSET_KEYS = ["chair", "table", "booth", "stage"];
const EVENT_ASSET_DRAG_TYPE = "application/x-plv-event-asset";

function assetDragStart(event: React.DragEvent<HTMLButtonElement>, asset: CanvasAssetDescriptor) {
  event.stopPropagation();
  if (!event.dataTransfer) return;
  event.dataTransfer.setData(EVENT_ASSET_DRAG_TYPE, asset.key);
  event.dataTransfer.setData("text/plain", asset.key);
  event.dataTransfer.effectAllowed = "copy";
}

function AssetOption({
  asset,
  selected,
  onSelect,
  disabled,
}: {
  asset: CanvasAssetDescriptor;
  selected: boolean;
  onSelect: (asset: CanvasAssetDescriptor) => void;
  disabled: boolean;
}) {
  return (
    <button
      key={asset.key}
      type="button"
      role="option"
      aria-selected={selected}
      aria-label={`${asset.name}: ${asset.description}`}
      title={`${asset.name} — ${asset.description}`}
      draggable={!disabled}
      onDragStart={(event) => assetDragStart(event, asset)}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(asset);
      }}
      disabled={disabled}
      className={cn(
        "flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border px-2 text-[10px] font-bold text-foreground transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50",
        selected ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/30" : "border-border/70 bg-background/70 hover:border-primary/50 hover:bg-muted",
      )}
    >
      <CanvasAssetVisual assetKey={asset.key} label={asset.name} className="h-7 w-7 shrink-0" />
      <span className="max-w-28 truncate">{asset.name}</span>
    </button>
  );
}

export function CanvasAssetPalette({
  surface,
  activeKey,
  onSelect,
  compact = false,
  disabled = false,
  floating = false,
}: CanvasAssetPaletteProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(!compact && !floating);
  const [recentKeys, setRecentKeys] = useState<string[]>(() => (
    surface === "event"
      ? EVENT_RECENT_ASSET_KEYS
      : listCanvasAssets(surface).slice(0, 4).map((asset) => asset.key)
  ));

  const assets = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return listCanvasAssets(surface).filter((asset) => !normalized
      || asset.name.toLowerCase().includes(normalized)
      || asset.key.toLowerCase().includes(normalized)
      || asset.keywords.some((keyword) => keyword.includes(normalized)));
  }, [query, surface]);

  const grouped = CATEGORY_ORDER.map((category) => ({
    category,
    assets: assets.filter((asset) => asset.category === category),
  })).filter((group) => group.assets.length > 0);

  const availableAssets = useMemo(() => listCanvasAssets(surface), [surface]);
  const activeAsset = getCanvasAsset(activeKey || "") || availableAssets[0];
  const recentAssets = useMemo(() => {
    const available = new Map(availableAssets.map((asset) => [asset.key, asset]));
    const keys = [activeKey, ...recentKeys].filter((key): key is string => Boolean(key));
    const uniqueKeys = [...new Set(keys)];
    return uniqueKeys
      .map((key) => available.get(key))
      .filter((asset): asset is CanvasAssetDescriptor => Boolean(asset))
      .slice(0, 4);
  }, [activeKey, availableAssets, recentKeys]);

  const closePicker = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  const handleAssetSelect = useCallback((asset: CanvasAssetDescriptor) => {
    setRecentKeys((current) => [asset.key, ...current.filter((key) => key !== asset.key)].slice(0, 4));
    onSelect(asset);
    if (floating) closePicker();
  }, [closePicker, floating, onSelect]);

  useEffect(() => {
    if (!floating || !open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      closePicker();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closePicker, floating, open]);

  if (floating) {
    return (
      <section
        data-testid="canvas-asset-floating-palette"
        data-floating="true"
        aria-label={`${surface === "event" ? "Event" : "Map"} assets`}
        className="relative w-max max-w-full"
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="max-w-full rounded-2xl border border-border/80 bg-card/95 p-2 shadow-xl backdrop-blur-sm">
          <button
            type="button"
            aria-expanded={open}
            aria-label={`Add event item — ${open ? "Close asset picker" : "More assets"}`}
            onClick={() => setOpen((current) => !current)}
            disabled={disabled}
            className="flex min-h-11 w-full min-w-56 items-center gap-2 rounded-xl px-2.5 text-left text-xs font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden="true">
              {activeAsset ? <CanvasAssetVisual assetKey={activeAsset.key} label="" className="h-7 w-7" /> : <Sparkles className="h-4 w-4" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-extrabold uppercase tracking-[0.1em] text-muted-foreground">Add event item</span>
              <span className="block truncate">{activeAsset?.name || "Choose an item"} selected</span>
            </span>
            <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[10px] font-bold text-muted-foreground">
              {open ? "Close" : "More assets"}
            </span>
            {open ? <ChevronUp className="h-4 w-4 shrink-0" aria-hidden="true" /> : <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />}
          </button>

          <div className={cn("mt-1.5 min-w-0", compact && "hidden sm:block")} aria-label="Recently used">
            <p className="px-2 text-[9px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">Recently used</p>
            <div className="mt-1 flex max-w-full gap-1 overflow-x-auto no-scrollbar">
              {recentAssets.map((asset) => {
                const selected = activeKey === asset.key;
                return (
                  <button
                    key={asset.key}
                    type="button"
                    aria-label={`${asset.name}${selected ? " — selected" : ""}`}
                    aria-pressed={selected}
                    draggable={!disabled}
                    onDragStart={(event) => assetDragStart(event, asset)}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleAssetSelect(asset);
                    }}
                    disabled={disabled}
                    className={cn(
                      "flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border px-2 text-[10px] font-bold text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50",
                      selected ? "border-primary bg-primary/10 ring-1 ring-primary/30" : "border-border/70 bg-background/70 hover:border-primary/50 hover:bg-muted",
                    )}
                    title={`${asset.name} — click to place on canvas`}
                  >
                    <CanvasAssetVisual assetKey={asset.key} label={asset.name} className="h-6 w-6 shrink-0" />
                    <span>{asset.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <p className={cn("mt-1.5 px-2 text-[10px] text-muted-foreground", compact && "hidden sm:block")}>Choose an item, then click the canvas. Drag to place it.</p>
        </div>

        {open && (
          <>
            <div
              className="event-asset-catalog-scrim fixed inset-0 z-[60] bg-slate-950/25 md:hidden"
              aria-hidden="true"
              onClick={closePicker}
            />
            <div
              id={`${surface}-asset-palette-panel`}
              data-testid="canvas-asset-catalog"
              data-mobile-sheet="true"
              role="dialog"
              aria-label="Choose an event item"
              className="event-asset-catalog-panel absolute left-0 top-[calc(100%+0.5rem)] z-[70] w-[min(34rem,calc(100vw-2rem))] max-h-[min(70vh,34rem)] overflow-y-auto rounded-2xl border border-border/80 bg-card p-3 shadow-2xl"
              onWheel={(event) => event.stopPropagation()}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-extrabold text-foreground">Choose an event item</p>
                  <p className="text-[10px] text-muted-foreground">Click an item to keep placing it, or drag it to the canvas.</p>
                </div>
                <button
                  type="button"
                  aria-label="Close asset picker"
                  title="Close asset picker"
                  onClick={closePicker}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <div className="relative mb-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search assets"
                  aria-label="Search assets"
                  disabled={disabled}
                  className="h-11 w-full rounded-xl border border-border/70 bg-background/80 pl-9 pr-3 text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
                />
              </div>
              <div className="flex min-w-0 flex-col gap-3">
                {grouped.map(({ category, assets: categoryAssets }) => (
                  <div key={category} className="min-w-0">
                    <span className="mb-1.5 block text-[9px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">{CATEGORY_LABELS[category]}</span>
                    <div className="flex min-w-0 flex-wrap gap-1.5">
                      {categoryAssets.map((asset) => (
                        <AssetOption
                          key={asset.key}
                          asset={asset}
                          selected={activeKey === asset.key}
                          onSelect={handleAssetSelect}
                          disabled={disabled}
                        />
                      ))}
                    </div>
                  </div>
                ))}
                {grouped.length === 0 && <p className="px-1 py-2 text-xs text-muted-foreground">No matching assets</p>}
              </div>
            </div>
          </>
        )}
      </section>
    );
  }

  return (
    <section
      data-testid="canvas-asset-palette"
      aria-label={`${surface === "event" ? "Event" : "Map"} assets`}
      className={cn("min-w-0", compact ? "rounded-xl border border-border/70 bg-card/80 p-1.5" : "flex-1")}
    >
      {compact && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${surface}-asset-palette-panel`}
          onClick={() => setOpen((current) => !current)}
          disabled={disabled}
          className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-2.5 text-xs font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
        >
          <span className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden="true">✦</span> Choose asset</span>
          {open ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
        </button>
      )}

      {open && (
        <div id={`${surface}-asset-palette-panel`} className={cn("min-w-0", compact && "pt-1.5")}>
          <div className="relative mb-1.5">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search assets"
              aria-label="Search assets"
              disabled={disabled}
              className="h-9 w-full rounded-lg border border-border/70 bg-background/80 pl-8 pr-2 text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
            />
          </div>
          <div className={cn("flex min-w-0 gap-3", compact ? "max-h-64 flex-col overflow-y-auto" : "flex-wrap")}>
            {grouped.map(({ category, assets: categoryAssets }) => (
              <div key={category} className={cn("min-w-0", compact ? "w-full" : "flex items-center gap-1.5")}>
                <span className="mb-1 block shrink-0 text-[9px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">{CATEGORY_LABELS[category]}</span>
                <div className={cn("flex min-w-0 gap-1.5", compact ? "flex-wrap" : "overflow-x-auto no-scrollbar")}>
                  {categoryAssets.map((asset) => (
                    <AssetOption
                      key={asset.key}
                      asset={asset}
                      selected={activeKey === asset.key}
                      onSelect={onSelect}
                      disabled={disabled}
                    />
                  ))}
                </div>
              </div>
            ))}
            {grouped.length === 0 && <p className="px-1 py-2 text-xs text-muted-foreground">No matching assets</p>}
          </div>
        </div>
      )}
    </section>
  );
}

export { EVENT_ASSET_DRAG_TYPE };

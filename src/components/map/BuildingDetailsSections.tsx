import { Accessibility, Clock } from "lucide-react";
import type { ReactNode } from "react";
import type { Building } from "../../types";
import { BuildingCover } from "./BuildingCover";

interface BuildingDetailsSectionsProps {
  building: Building;
  facilities: string[];
  accessibility: string[];
  floorCount: number;
  showCover?: boolean;
  showQR?: boolean;
  qrContent?: ReactNode;
  variant?: "full" | "compact" | "peek";
}

const categoryLabel = (value: string) => value ? value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Campus building";

export function BuildingDetailsSections({
  building, facilities, accessibility, floorCount, showCover = false, showQR, qrContent, variant = "full",
}: BuildingDetailsSectionsProps) {
  const description = building.description?.trim();
  const operatingHours = building.operating_hours?.trim();
  const facts = [categoryLabel(building.category), floorCount > 0 ? `${floorCount} ${floorCount === 1 ? "floor" : "floors"}` : null].filter(Boolean);
  const compact = variant !== "full";
  const compactFeatures = [...facilities.slice(0, 1), ...accessibility.slice(0, 2), ...facilities.slice(1, 2)]
    .filter((feature, index, all) => all.findIndex((item) => item.toLowerCase() === feature.toLowerCase()) === index)
    .slice(0, variant === "compact" ? 2 : 4);

  if (compact) {
    return (
      <div className="space-y-2.5">
        {description && variant === "compact" && (
          <p data-testid="building-description" className="line-clamp-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
        )}
        <div data-testid="building-quick-facts-compact" className="space-y-1.5">
          <p className="text-xs font-semibold text-foreground/80">{facts.join(" · ")}</p>
          {variant === "compact" && compactFeatures.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {compactFeatures.map((fact) => (
                <span key={fact} className="whitespace-nowrap rounded-full border border-border/70 bg-muted/60 px-2 py-1 text-[10px] font-medium leading-none text-muted-foreground">{fact}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showCover && <BuildingCover imageUrl={building.image_url} code={building.code} name={building.name} className="rounded-2xl" />}

      {description && <p data-testid="building-description" className="text-sm leading-relaxed text-muted-foreground">{description}</p>}

      <section aria-label="Quick information" className="space-y-2">
        <h3 className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">Quick information</h3>
        <div className="flex flex-wrap gap-2">
          {facts.map((fact) => (
            <span key={fact} className="rounded-full border border-border/80 bg-muted/70 px-2.5 py-1 text-[11px] font-semibold text-foreground/80">{fact}</span>
          ))}
        </div>
      </section>

      {facilities.length > 0 && (
        <section data-testid="building-facilities" aria-label="Facilities" className="space-y-2">
          <h3 className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">Facilities</h3>
          <div className="flex flex-wrap gap-1.5">
            {facilities.map((facility) => <span key={facility} className="rounded-lg border border-border/80 bg-card px-2.5 py-1.5 text-xs font-medium text-foreground/85">{facility}</span>)}
          </div>
        </section>
      )}

      {accessibility.length > 0 && (
        <section data-testid="building-accessibility" aria-label="Accessibility" className="space-y-2">
          <h3 className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">Accessibility</h3>
          <div className="space-y-1.5">
            {accessibility.map((item) => (
              <div key={item} className="flex items-center gap-2 rounded-xl border border-emerald-200/70 bg-emerald-50/70 px-3 py-2 text-xs text-foreground dark:border-emerald-900/40 dark:bg-emerald-950/20">
                <Accessibility className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" /> {item}
              </div>
            ))}
          </div>
        </section>
      )}

      {operatingHours && (
        <section data-testid="building-hours" className="space-y-2">
          <h3 className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">Hours</h3>
          <div className="flex items-start gap-2 rounded-xl border border-border/80 bg-muted/40 px-3 py-2.5 text-xs leading-relaxed text-foreground/85">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> <span>{operatingHours}</span>
          </div>
        </section>
      )}

      {showQR && qrContent && <div data-testid="building-qr" className="flex justify-center rounded-2xl border border-border bg-muted/40 p-4">{qrContent}</div>}
    </div>
  );
}

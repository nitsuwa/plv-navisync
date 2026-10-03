import { useEffect, useRef, useState } from "react";
import type { Campus } from "../map-builder/types";
import { buildEventVenues } from "../../lib/eventMapView";
import type { PublicEventPreview } from "../../types/eventPreview";

export function EventVenueLayer({ campus, events, zoom = 1, onSelect }: {
  campus: Campus;
  events: PublicEventPreview[];
  zoom?: number;
  onSelect: (eventId: string, locationId: string) => void;
}) {
  const layerRef = useRef<SVGGElement>(null);
  const [cssScale, setCssScale] = useState(1);
  const [openVenueId, setOpenVenueId] = useState<string | null>(null);
  const venues = buildEventVenues(campus, events);

  useEffect(() => {
    const group = layerRef.current;
    const svg = group?.ownerSVGElement;
    if (!group || !svg) return;
    const measure = () => {
      const matrix = typeof group.getScreenCTM === "function" ? group.getScreenCTM() : null;
      const scale = matrix ? Math.hypot(matrix.a, matrix.b) : 1;
      setCssScale(Number.isFinite(scale) && scale > 0 ? scale : 1);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(svg);
    window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, [campus, events, zoom]);

  const px = (value: number) => value / cssScale;
  const pick = (eventId: string, locationId: string) => {
    setOpenVenueId(null);
    onSelect(eventId, locationId);
  };

  return <g ref={layerRef} data-testid="event-venue-layer" style={{ pointerEvents: "none" }}>
    {venues.map((venue) => {
      const count = venue.eventIds.length;
      const venueEvents = venue.eventIds.map((id) => events.find((event) => event.id === id)).filter((event): event is PublicEventPreview => Boolean(event));
      const open = openVenueId === venue.id;
      return <g key={venue.id} transform={`translate(${venue.x},${venue.y})`}>
        <g role="button" tabIndex={0} aria-label={`${venue.label}, ${count} event${count === 1 ? "" : "s"}`} data-event-venue={venue.id} data-no-drag
          style={{ pointerEvents: "all", cursor: "pointer" }}
          onClick={(event) => { event.stopPropagation(); if (count === 1) pick(venue.eventIds[0], venue.locations.find((entry) => entry.eventId === venue.eventIds[0])!.locationId); else setOpenVenueId(open ? null : venue.id); }}
          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); if (count === 1) pick(venue.eventIds[0], venue.locations.find((entry) => entry.eventId === venue.eventIds[0])!.locationId); else setOpenVenueId(open ? null : venue.id); } }}>
          <circle r={px(24)} fill="var(--card)" stroke="var(--primary)" strokeWidth={px(2.5)} className="drop-shadow-md" />
          <path d={`M 0 ${px(12)} C ${px(-4)} ${px(5)}, ${px(-9)} ${px(0)}, ${px(-9)} ${px(-7)} a ${px(9)} ${px(9)} 0 1 1 ${px(18)} 0 C ${px(9)} 0 ${px(4)} ${px(5)} 0 ${px(12)} Z`} fill="var(--primary)" />
          <circle cy={px(-7)} r={px(3)} fill="var(--primary-foreground)" />
          {count > 1 && <g><circle cx={px(16)} cy={px(-17)} r={px(10)} fill="var(--destructive)" stroke="var(--card)" strokeWidth={px(2)} /><text x={px(16)} y={px(-13)} textAnchor="middle" fontSize={px(10)} fontWeight={800} fill="var(--destructive-foreground)">{count}</text></g>}
          <title>{venue.label}: {venueEvents.map((event) => event.title).join(", ")}</title>
        </g>
        {open && <g transform={`translate(${px(28)},${px(-30)})`} style={{ pointerEvents: "all" }}>
          {venue.locations.map((entry, index) => {
            const event = events.find((item) => item.id === entry.eventId);
            if (!event) return null;
            return <g key={`${entry.eventId}:${entry.locationId}`} transform={`translate(0,${index * px(38)})`} role="button" tabIndex={0} aria-label={`View ${event.title}`} data-no-drag
              onClick={(click) => { click.stopPropagation(); pick(entry.eventId, entry.locationId); }}
              onKeyDown={(key) => { if (key.key === "Enter" || key.key === " ") { key.preventDefault(); key.stopPropagation(); pick(entry.eventId, entry.locationId); } }}>
              <rect width={px(220)} height={px(34)} rx={px(9)} fill="var(--card)" stroke="var(--border)" strokeWidth={px(1.5)} />
              <text x={px(10)} y={px(22)} fontSize={px(12)} fontWeight={700} fill="var(--card-foreground)">{event.title.slice(0, 24)}{event.title.length > 24 ? "…" : ""}</text>
            </g>;
          })}
        </g>}
      </g>;
    })}
  </g>;
}

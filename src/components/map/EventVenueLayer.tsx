import { useEffect, useRef, useState } from "react";
import type { Campus } from "../map-builder/types";
import { buildEventVenues, resolveEventLocation } from "../../lib/eventMapView";
import type { PublicEventPreview } from "../../types/eventPreview";

export function EventVenueLayer({ campus, events, zoom = 1, onSelect, onInspectVenue, selectedLocationId }: {
  campus: Campus;
  events: PublicEventPreview[];
  zoom?: number;
  onSelect: (eventId: string, locationId: string) => void;
  onInspectVenue?: (venueId: string) => void;
  selectedLocationId?: string | null;
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
      const active = Boolean(selectedLocationId && venue.locations.some(entry => entry.locationId === selectedLocationId));
      const name = venue.type === 'campus' ? 'Campus Grounds' : venue.label;
      const floorLabels = [...new Set(venue.locations.flatMap(entry => {
        const location = events.find(event => event.id === entry.eventId)?.locations.find(item => item.id === entry.locationId);
        const resolved = location && resolveEventLocation(campus, location.locationRef);
        return resolved?.kind === 'floor' ? [resolved.floor.label || `Floor ${resolved.floorNumber}`] : [];
      }))];
      const subtitle = floorLabels.length > 1 ? `${floorLabels.length} floors · Tap for maps` : floorLabels[0] || (venue.label.includes('approximate') ? 'Approximate venue' : 'Event venue');
      const visibleName = name.length > 29 ? `${name.slice(0, 28)}…` : name;
      const width = Math.max(132, Math.min(224, Math.max(visibleName.length, subtitle.length) * 6.3 + 24));
      const labelY = venue.type === 'building' ? -78 : 33;
      const inspect = () => {
        if (onInspectVenue) { setOpenVenueId(null); onInspectVenue(venue.id); }
        else if (count === 1 && venue.locations.length === 1) pick(venue.eventIds[0], venue.locations[0].locationId);
        else setOpenVenueId(open ? null : venue.id);
      };
      return <g key={venue.id} transform={`translate(${venue.x},${venue.y})`}>
        <g role="button" tabIndex={0} className="group focus:outline-none" aria-label={`${venue.label}, ${count} event${count === 1 ? "" : "s"}`} data-event-venue={venue.id} data-no-drag
          aria-pressed={active}
          style={{ pointerEvents: "all", cursor: "pointer" }}
          onClick={(event) => { event.stopPropagation(); inspect(); }}
          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); inspect(); } }}>
          <rect data-event-venue-hit-area x={px(-width / 2)} y={px(Math.min(-31, labelY))} width={px(width)} height={px(Math.max(25, labelY + 43) - Math.min(-31, labelY))} fill="transparent" />
          <circle r={px(30)} fill="none" stroke="var(--primary)" strokeWidth={px(1.5)} className="opacity-0 group-focus:opacity-50" />
          {active && <circle r={px(29)} fill="none" stroke="var(--primary)" strokeWidth={px(2)} opacity={0.3} />}
          <circle r={px(24)} fill="var(--card)" stroke="var(--primary)" strokeWidth={px(2.5)} className="drop-shadow-md" />
          <path d={`M 0 ${px(12)} C ${px(-4)} ${px(5)}, ${px(-9)} ${px(0)}, ${px(-9)} ${px(-7)} a ${px(9)} ${px(9)} 0 1 1 ${px(18)} 0 C ${px(9)} 0 ${px(4)} ${px(5)} 0 ${px(12)} Z`} fill="var(--primary)" />
          <circle cy={px(-7)} r={px(3)} fill="var(--primary-foreground)" />
          {count > 1 && <g><rect x={px(15)} y={px(-29)} width={px(64)} height={px(22)} rx={px(11)} fill="var(--card)" stroke="var(--primary)" strokeWidth={px(1.5)} /><text x={px(47)} y={px(-14)} textAnchor="middle" fontSize={px(10)} fontWeight={800} fill="var(--primary)">{count} events</text></g>}
          <rect x={px(-width / 2)} y={px(labelY)} width={px(width)} height={px(43)} rx={px(10)} fill="var(--card)" stroke={active ? 'var(--primary)' : 'var(--border)'} strokeWidth={px(active ? 1.5 : 1)} className="drop-shadow-sm" />
          <text y={px(labelY + 17)} textAnchor="middle" fontSize={px(11)} fontWeight={800} fill="var(--card-foreground)">{visibleName}</text>
          <text y={px(labelY + 32)} textAnchor="middle" fontSize={px(10)} fill="var(--muted-foreground)">{subtitle}</text>
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
              <text x={px(10)} y={px(22)} fontSize={px(12)} fontWeight={700} fill="var(--card-foreground)">{(venue.eventIds.length === 1 ? event.locations.find(location => location.id === entry.locationId)?.locationRef.label : event.title)?.slice(0, 30)}</text>
            </g>;
          })}
        </g>}
      </g>;
    })}
  </g>;
}

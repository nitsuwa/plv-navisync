import { useEffect, useRef, useState, useCallback } from "react";
import {
  MapPin, Loader2, Search, Crosshair, LocateFixed, Copy, Check, MapPlus,
  RotateCcw, Satellite, Map as MapIcon, AlertCircle,
} from "lucide-react";
import { cn } from "../../lib/utils";
import L from "leaflet";

// Fix default marker icon path issue with bundlers
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// ── Types ──────────────────────────────────────────────────────────────────

export type LocationSource = "none" | "search" | "locate" | "adjusted" | "click";

export interface AddressData {
  address: string;
  city: string;
  province: string;
  postalCode: string;
}

interface MapPickerProps {
  lat: string;
  lng: string;
  onLatChange: (v: string) => void;
  onLngChange: (v: string) => void;
  onAddressUpdate?: (data: AddressData) => void;
  /** When this string changes (non-empty), the MapPicker triggers a search for it */
  searchQueryFromParent?: string;
  /** Called with the location source type so the parent can track it */
  onLocationSourceChange?: (source: LocationSource) => void;
}

// ── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_CENTER: [number, number] = [14.7062, 120.9813]; // PLV Valenzuela
const MAP_HEIGHT = 300;
const NOMINATIM_USER_AGENT = "PLV-NaviSync/1.0";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatCoord(val: string): string {
  const n = parseFloat(val);
  return isNaN(n) ? "—" : n.toFixed(6);
}

// ── Location status indicator ──────────────────────────────────────────────

function LocationStatusBadge({ source, accuracy }: { source: LocationSource; accuracy?: number }) {
  if (source === "none") {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-muted/40 border border-border/50">
        <MapIcon className="h-3 w-3 text-muted-foreground/50" />
        <span className="text-[10px] font-medium text-muted-foreground/50">No location selected</span>
      </div>
    );
  }

  const isAdjusted = source === "adjusted";
  return (
    <div className={cn(
      "flex items-center gap-1.5 px-2.5 py-1 rounded-lg border",
      isAdjusted
        ? "bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/30"
        : "bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800/30"
    )}>
      {isAdjusted ? (
        <AlertCircle className="h-3 w-3 text-amber-500" />
      ) : (
        <MapPin className="h-3 w-3 text-emerald-500" />
      )}
      <span className={cn(
        "text-[10px] font-semibold",
        isAdjusted ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"
      )}>
        {isAdjusted ? "Location manually adjusted" : accuracy ? `Location found (≈${accuracy}m)` : "Location found"}
      </span>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export function MapPicker({
  lat, lng, onLatChange, onLngChange, onAddressUpdate,
  searchQueryFromParent, onLocationSourceChange,
}: MapPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [copied, setCopied] = useState(false);
  const [noResults, setNoResults] = useState(false);
  const [locationSource, setLocationSource] = useState<LocationSource>("none");
  const [accuracy, setAccuracy] = useState<number | undefined>(undefined);
  const reverseGeoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSearchedLatRef = useRef<number | null>(null);
  const lastSearchedLngRef = useRef<number | null>(null);
  const previousSearchQueryRef = useRef<string>("");

  const parsedLat = parseFloat(lat);
  const parsedLng = parseFloat(lng);
  const hasCoords = !isNaN(parsedLat) && !isNaN(parsedLng);
  const isAdjusted = locationSource === "adjusted";

  // Notify parent of location source changes
  const updateLocationSource = useCallback((source: LocationSource) => {
    setLocationSource(source);
    onLocationSourceChange?.(source);
  }, [onLocationSourceChange]);

  // ── Reverse geocode via Nominatim ─────────────────────────────────────────

  const reverseGeocode = useCallback(async (latitude: number, longitude: number) => {
    if (!onAddressUpdate) return;
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`,
        { headers: { "User-Agent": NOMINATIM_USER_AGENT } }
      );
      if (!res.ok) return;
      const data = await res.json();
      const addr = data.address || {};

      // Build the most specific address from what Nominatim returns
      const parts: string[] = [];
      if (addr.road) parts.push(addr.road);
      if (addr.house_number) parts.push(addr.house_number);
      if (addr.suburb) parts.push(addr.suburb);
      if (addr.neighbourhood) parts.push(addr.neighbourhood);
      if (addr.barangay) parts.push(addr.barangay);
      const streetAddress = parts.join(", ") || data.display_name?.split(",")[0]?.trim() || "";

      onAddressUpdate({
        address: streetAddress,
        city: addr.city || addr.town || addr.municipality || addr.county || "",
        province: addr.state || addr.region || "",
        postalCode: addr.postcode || "",
      });
    } catch {
      // Reverse geocoding failed silently — the user can still fill in fields manually
    }
  }, [onAddressUpdate]);

  // ── Debounced reverse geocode (fires after marker stops moving) ──────────

  const scheduleReverseGeocode = useCallback((latitude: number, longitude: number) => {
    if (reverseGeoTimerRef.current) clearTimeout(reverseGeoTimerRef.current);
    reverseGeoTimerRef.current = setTimeout(() => {
      reverseGeocode(latitude, longitude);
    }, 600);
  }, [reverseGeocode]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (reverseGeoTimerRef.current) clearTimeout(reverseGeoTimerRef.current);
    };
  }, []);

  // ── Initialize map ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: hasCoords ? [parsedLat, parsedLng] : DEFAULT_CENTER,
      zoom: 15,
      zoomControl: true,
      attributionControl: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(map);

    // Click handler to set marker
    map.on("click", (e: L.LeafletMouseEvent) => {
      const { lat: clickLat, lng: clickLng } = e.latlng;
      onLatChange(clickLat.toFixed(6));
      onLngChange(clickLng.toFixed(6));
      updateLocationSource("click");
      scheduleReverseGeocode(clickLat, clickLng);
    });

    mapInstanceRef.current = map;
    setMapReady(true);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      setMapReady(false);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Update marker when lat/lng change, auto-center map ───────────────────

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady) return;

    if (!hasCoords) {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      return;
    }

    if (markerRef.current) {
      markerRef.current.setLatLng([parsedLat, parsedLng]);
    } else {
      const marker = L.marker([parsedLat, parsedLng], { draggable: true }).addTo(map);
      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        onLatChange(pos.lat.toFixed(6));
        onLngChange(pos.lng.toFixed(6));
        updateLocationSource("adjusted");
        scheduleReverseGeocode(pos.lat, pos.lng);
      });
      markerRef.current = marker;
    }

    map.setView([parsedLat, parsedLng], 16, { animate: true });
  }, [lat, lng, mapReady, hasCoords, parsedLat, parsedLng, onLatChange, onLngChange, scheduleReverseGeocode]);

  // ── Center map on coordinates ────────────────────────────────────────────

  const centerOnCoords = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map || !hasCoords) return;
    map.setView([parsedLat, parsedLng], 16, { animate: true });
  }, [hasCoords, parsedLat, parsedLng]);

  // ── Search address using Nominatim ───────────────────────────────────────

  const handleSearch = useCallback(async (query: string) => {
    if (!query || !query.trim()) return;
    setSearching(true);
    setNoResults(false);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`,
        { headers: { "User-Agent": NOMINATIM_USER_AGENT } }
      );
      const data = await res.json();
      if (data.length > 0) {
        const foundLat = parseFloat(data[0].lat);
        const foundLng = parseFloat(data[0].lon);
        lastSearchedLatRef.current = foundLat;
        lastSearchedLngRef.current = foundLng;
        onLatChange(foundLat.toFixed(6));
        onLngChange(foundLng.toFixed(6));
        updateLocationSource("search");
        setAccuracy(undefined);
        // Reverse geocode to fill in address details
        await reverseGeocode(foundLat, foundLng);
        setNoResults(false);
      } else {
        setNoResults(true);
      }
    } catch {
      setNoResults(true);
    } finally {
      setSearching(false);
    }
  }, [onLatChange, onLngChange, reverseGeocode, updateLocationSource]);

  // ── Get user's current location via browser Geolocation API ───────────────

  const handleLocate = useCallback(() => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const foundLat = pos.coords.latitude;
        const foundLng = pos.coords.longitude;
        lastSearchedLatRef.current = foundLat;
        lastSearchedLngRef.current = foundLng;
        setAccuracy(Math.round(pos.coords.accuracy));
        onLatChange(foundLat.toFixed(6));
        onLngChange(foundLng.toFixed(6));
        updateLocationSource("locate");
        scheduleReverseGeocode(foundLat, foundLng);
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [onLatChange, onLngChange, scheduleReverseGeocode, updateLocationSource]);

  // ── Reset marker to last searched location ────────────────────────────────

  const handleResetMarker = useCallback(() => {
    if (lastSearchedLatRef.current === null || lastSearchedLngRef.current === null) return;
    onLatChange(lastSearchedLatRef.current.toFixed(6));
    onLngChange(lastSearchedLngRef.current.toFixed(6));
    updateLocationSource("search");
  }, [onLatChange, onLngChange, updateLocationSource]);

  // ── External search trigger ───────────────────────────────────────────────

  useEffect(() => {
    if (!searchQueryFromParent || searchQueryFromParent === previousSearchQueryRef.current) return;
    previousSearchQueryRef.current = searchQueryFromParent;
    setSearchQuery(searchQueryFromParent);
    handleSearch(searchQueryFromParent);
  }, [searchQueryFromParent, handleSearch]);

  // ── Copy coordinates to clipboard ────────────────────────────────────────

  const handleCopyCoords = useCallback(() => {
    if (!hasCoords) return;
    navigator.clipboard.writeText(`${formatCoord(lat)}, ${formatCoord(lng)}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [hasCoords, lat, lng]);

  // ── Handle search input keydown ──────────────────────────────────────────

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch(searchQuery);
    }
  }, [handleSearch, searchQuery]);

  return (
    <div className="space-y-3">
      {/* ── Location status indicator ── */}
      <LocationStatusBadge source={locationSource} accuracy={accuracy} />

      {/* ── Search bar + action buttons ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); if (noResults) setNoResults(false); }}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search campus, address, landmark, or street..."
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-input-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
          />
        </div>

        {/* Search Location button */}
        <button
          type="button"
          onClick={() => handleSearch(searchQuery)}
          disabled={searching || !searchQuery.trim()}
          className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0 shadow-sm"
        >
          {searching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Search className="h-3.5 w-3.5" />
          )}
          Search
        </button>

        {/* Use Current Location button */}
        <button
          type="button"
          onClick={handleLocate}
          disabled={locating}
          className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-xs font-bold border border-border text-foreground hover:bg-muted hover:text-primary transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          title="Use current device location"
        >
          {locating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Crosshair className="h-3.5 w-3.5" />
          )}
          My Location
        </button>

        {/* Center on Campus Marker button */}
        {hasCoords && (
          <button
            type="button"
            onClick={centerOnCoords}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-xs font-bold border border-border text-foreground hover:bg-muted hover:text-primary transition-all shrink-0"
            title="Center map on the campus marker"
          >
            <LocateFixed className="h-3.5 w-3.5" />
            Center
          </button>
        )}

        {/* Reset Marker button — only shown when marker was manually adjusted */}
        {isAdjusted && lastSearchedLatRef.current !== null && (
          <button
            type="button"
            onClick={handleResetMarker}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-xs font-bold border border-amber-300/60 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/10 hover:bg-amber-100 dark:hover:bg-amber-900/20 transition-all shrink-0"
            title="Reset marker to the last searched location"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        )}
      </div>

      {/* ── Map container ── */}
      <div
        ref={mapRef}
        className="w-full rounded-xl border border-border overflow-hidden bg-muted/20"
        style={{ height: MAP_HEIGHT }}
      />

      {/* ── Empty state or Coordinate display ── */}
      {!hasCoords ? (
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-muted/20 border border-border/50">
          <MapPlus className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Search for your campus or click anywhere on the map to place the campus marker.
          </p>
        </div>
      ) : (
        <>
          {/* Coordinates + actions bar */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl bg-muted/15 border border-border/50">
            {/* Coordinates */}
            <div className="flex items-center gap-4 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase text-muted-foreground/60 tracking-wider">Lat</span>
                <span className="text-xs font-mono font-bold text-foreground tabular-nums">{formatCoord(lat)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase text-muted-foreground/60 tracking-wider">Lng</span>
                <span className="text-xs font-mono font-bold text-foreground tabular-nums">{formatCoord(lng)}</span>
              </div>
            </div>

            {/* Copy button */}
            <button
              type="button"
              onClick={handleCopyCoords}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[10px] font-bold bg-muted text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all shrink-0"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 text-green-500" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  Copy Coordinates
                </>
              )}
            </button>

            {/* Click hint */}
            <p className="text-[10px] text-muted-foreground/40 flex items-center gap-1 shrink-0">
              <MapPin className="h-3 w-3" />
              Drag to adjust
            </p>
          </div>

          {/* Accuracy display */}
          {accuracy !== undefined && (
            <p className="text-[10px] text-muted-foreground/50 flex items-center gap-1.5">
              <Satellite className="h-3 w-3" />
              Approximate accuracy: ±{accuracy} meter{accuracy !== 1 ? "s" : ""}
            </p>
          )}
        </>
      )}

      {/* ── No results message ── */}
      {noResults && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900/30 dark:bg-amber-900/10 p-3">
          <p className="text-[11px] font-bold text-amber-700 dark:text-amber-400">No matching location found.</p>
          <p className="text-[10px] text-amber-600/80 dark:text-amber-400/70 mt-0.5">
            Try searching with a more specific address or place the marker manually on the map.
          </p>
        </div>
      )}
    </div>
  );
}

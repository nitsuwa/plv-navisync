import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Building2, ChevronDown, MapPin, X } from "lucide-react";
import { createPortal } from "react-dom";
import type { Building } from "../../types";
import type { RoomDest } from "../../lib/combinedPathfinding";

type EndpointOption =
  | { kind: "building"; key: string; value: Building }
  | { kind: "room"; key: string; value: RoomDest };

interface MenuPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

interface EndpointPickerProps {
  badge: string;
  badgeColor: string;
  building: Building | null;
  room: RoomDest | null;
  onBuildingSelect: (building: Building) => void;
  onBuildingClear: () => void;
  onRoomSelect?: (room: RoomDest | null) => void;
  onRoomClear?: () => void;
  placeholder: string;
  buildings?: readonly Building[];
  roomOptions?: readonly RoomDest[];
}

const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase();

const roomKey = (room: RoomDest) => `${room.buildingId}:${room.floorNumber}:${room.roomId}`;

/**
 * A single endpoint search control for the route planner.
 * Buildings and published rooms share one searchable menu, while their
 * result rows remain visually and semantically distinct.
 */
export function EndpointPicker({
  badge,
  badgeColor,
  building,
  room,
  onBuildingSelect,
  onBuildingClear,
  onRoomSelect,
  onRoomClear,
  placeholder,
  buildings = [],
  roomOptions = [],
}: EndpointPickerProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const endpointName = badge === "A" ? "starting" : "destination";
  const testKey = badge === "A" ? "from" : "to";

  useEffect(() => {
    const handleOutsideMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        ref.current && !ref.current.contains(target)
        && !menuRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideMouseDown);
    return () => document.removeEventListener("mousedown", handleOutsideMouseDown);
  }, []);

  const updateMenuPosition = useCallback(() => {
    if (!ref.current || typeof window === "undefined") return;

    const bounds = ref.current.getBoundingClientRect();
    const viewport = window.visualViewport;
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportHeight = viewport?.height ?? window.innerHeight;
    const viewportWidth = viewport?.width ?? window.innerWidth;
    const gutter = 8;
    const desiredHeight = viewportWidth < 768 ? 360 : 280;
    const availableBelow = Math.max(0, viewportTop + viewportHeight - bounds.bottom - gutter);
    const availableAbove = Math.max(0, bounds.top - viewportTop - gutter);
    const opensAbove = availableBelow < Math.min(desiredHeight, 240) && availableAbove > availableBelow;
    const availableHeight = opensAbove ? availableAbove : availableBelow;
    const maxHeight = Math.max(96, Math.min(desiredHeight, availableHeight || desiredHeight));
    const width = Math.min(
      Math.max(bounds.width, viewportWidth < 768 ? 280 : 240),
      Math.max(viewportWidth - (gutter * 2), 0),
    );
    const left = Math.min(
      Math.max(bounds.left, gutter),
      Math.max(gutter, viewportWidth - width - gutter),
    );
    const top = opensAbove
      ? Math.max(viewportTop + gutter, bounds.top - maxHeight - 6)
      : Math.min(bounds.bottom + 6, viewportTop + viewportHeight - gutter);

    setMenuPosition({ top, left, width, maxHeight });
  }, []);

  // The mobile planner is an overflow-scrolling bottom sheet. Recalculate a
  // fixed menu position while it or the viewport moves so the menu is never
  // trapped inside the sheet's clipping boundary.
  useEffect(() => {
    if (!open) {
      setMenuPosition(null);
      return;
    }

    updateMenuPosition();
    const handleViewportChange = () => updateMenuPosition();
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    window.visualViewport?.addEventListener("resize", handleViewportChange);
    window.visualViewport?.addEventListener("scroll", handleViewportChange);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
      window.visualViewport?.removeEventListener("resize", handleViewportChange);
      window.visualViewport?.removeEventListener("scroll", handleViewportChange);
    };
  }, [open, updateMenuPosition]);

  const filteredBuildings = useMemo(() => {
    const search = normalize(query);
    return buildings.filter((candidate) => {
      if (!search) return true;
      return [candidate.name, candidate.code].some((field) => normalize(field).includes(search));
    });
  }, [buildings, query]);

  const filteredRooms = useMemo(() => {
    const search = normalize(query);
    if (!onRoomSelect) return [];
    return roomOptions.filter((candidate) => {
      if (!search) return true;
      return [
        candidate.roomName,
        candidate.roomId,
        candidate.buildingLabel,
        candidate.buildingCode,
        `floor ${candidate.floorNumber}`,
      ].some((field) => normalize(field).includes(search));
    });
  }, [onRoomSelect, query, roomOptions]);

  const options = useMemo<EndpointOption[]>(() => [
    ...filteredBuildings.map((candidate) => ({
      kind: "building" as const,
      key: `building:${candidate.id}`,
      value: candidate,
    })),
    ...filteredRooms.map((candidate) => ({
      kind: "room" as const,
      key: `room:${roomKey(candidate)}`,
      value: candidate,
    })),
  ], [filteredBuildings, filteredRooms]);

  useEffect(() => {
    if (activeIdx >= options.length) setActiveIdx(Math.max(options.length - 1, 0));
  }, [activeIdx, options.length]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const activeElement = listRef.current.querySelector<HTMLButtonElement>(`[data-idx="${activeIdx}"]`);
    // jsdom and some embedded webviews do not implement scrollIntoView.
    if (typeof activeElement?.scrollIntoView === "function") {
      activeElement.scrollIntoView({ block: "nearest" });
    }
  }, [activeIdx, open]);

  const resetPicker = useCallback(() => {
    setOpen(false);
    setMenuPosition(null);
    setQuery("");
    setActiveIdx(0);
  }, []);

  const handleSelect = useCallback((option: EndpointOption) => {
    if (option.kind === "room") {
      onRoomSelect?.(option.value);
    } else {
      // Selecting a building replaces a previously selected room endpoint.
      if (room) onRoomClear?.();
      onBuildingSelect(option.value);
    }
    resetPicker();
  }, [onBuildingSelect, onRoomClear, onRoomSelect, resetPicker, room]);

  const handleClear = useCallback(() => {
    if (room) {
      if (onRoomClear) onRoomClear();
      else onRoomSelect?.(null);
    } else {
      onBuildingClear();
    }
    resetPicker();
  }, [onBuildingClear, onRoomClear, onRoomSelect, resetPicker, room]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (event.key === "ArrowDown" || event.key === "Enter") {
        event.preventDefault();
        setOpen(true);
        setQuery("");
        setActiveIdx(0);
      }
      return;
    }

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIdx((previous) => (previous + 1) % Math.max(options.length, 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIdx((previous) => (previous - 1 + Math.max(options.length, 1)) % Math.max(options.length, 1));
        break;
      case "Enter":
        event.preventDefault();
        if (options[activeIdx]) handleSelect(options[activeIdx]);
        break;
      case "Escape":
        event.preventDefault();
        setOpen(false);
        inputRef.current?.blur();
        break;
    }
  }, [activeIdx, handleSelect, open, options]);

  const selectedLabel = room?.roomName ?? building?.name ?? "";
  const selectedType = room ? "Room" : building ? "Building" : null;
  const selectedMeta = room
    ? `${room.buildingCode} · Floor ${room.floorNumber}`
    : building
      ? `${building.code} · Building`
      : "";
  const resultCount = filteredBuildings.length + filteredRooms.length;
  const resultAnnouncement = resultCount > 0
    ? `${resultCount} location${resultCount !== 1 ? "s" : ""}${query ? ` for ${query}` : ""}`
    : query
      ? `No buildings or rooms found for ${query}`
      : "";

  const renderOption = (option: EndpointOption, index: number) => {
    const isBuilding = option.kind === "building";
    const label = isBuilding ? option.value.name : option.value.roomName;
    const meta = isBuilding
      ? `${option.value.code} · Building`
      : `${option.value.buildingCode} · Floor ${option.value.floorNumber}`;

    return (
      <button
        key={option.key}
        id={`${listId}-option-${index}`}
        data-idx={index}
        role="option"
        aria-selected={index === activeIdx}
        onMouseDown={(event) => { event.preventDefault(); handleSelect(option); }}
        onMouseEnter={() => setActiveIdx(index)}
        className={`w-full flex items-center gap-3 md:gap-2.5 px-4 md:px-3 py-3.5 md:py-2.5 text-left transition-colors ${
          index === activeIdx
            ? "bg-primary/10 text-primary"
            : "hover:bg-muted active:bg-primary/8"
        }`}
      >
        <div className={`w-9 h-9 md:w-7 md:h-7 rounded-xl md:rounded-lg flex items-center justify-center shrink-0 ${isBuilding ? "bg-primary/10" : "bg-amber-500/10"}`}>
          {isBuilding
            ? <Building2 className="h-4 w-4 md:h-3.5 md:w-3.5 text-primary" />
            : <MapPin className="h-4 w-4 md:h-3.5 md:w-3.5 text-amber-600 dark:text-amber-400" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm md:text-xs font-bold text-foreground truncate">{label}</p>
          <p className="text-[11px] md:text-[10px] text-muted-foreground truncate">{meta}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-1 md:px-1.5 md:py-0.5 text-[9px] md:text-[8px] font-extrabold uppercase tracking-wide ${
          isBuilding
            ? "border-primary/20 bg-primary/5 text-primary"
            : "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400"
        }`}>
          {isBuilding ? "Building" : "Room"}
        </span>
      </button>
    );
  };

  const anchorBounds = ref.current?.getBoundingClientRect();
  const resolvedMenuPosition = menuPosition ?? {
    top: (anchorBounds?.bottom ?? 0) + 6,
    left: anchorBounds?.left ?? 0,
    width: Math.max(anchorBounds?.width ?? 0, 280),
    maxHeight: 280,
  };

  return (
    <div ref={ref} className="relative" data-testid={`${testKey}-endpoint-picker`}>
      <div className="flex items-center gap-2.5 md:gap-2 h-12 md:h-10 px-3.5 md:px-3 rounded-2xl md:rounded-xl border border-border bg-input-background transition-all duration-200 hover:border-primary/30">
        <span
          className="w-6 h-6 md:w-5 md:h-5 rounded-full flex items-center justify-center shrink-0 text-white text-[10px] md:text-[9px] font-extrabold"
          style={{ background: badgeColor }}
        >
          {badge}
        </span>
        <div className="min-w-0 flex-1 flex items-center gap-1.5">
          <input
            ref={inputRef}
            type="text"
            value={open ? query : selectedLabel}
            onChange={(event) => { setQuery(event.target.value); setOpen(true); setActiveIdx(0); }}
            onFocus={() => { setOpen(true); setQuery(""); setActiveIdx(0); }}
            onClick={() => {
              if (!open) {
                setOpen(true);
                setQuery("");
                setActiveIdx(0);
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="flex-1 bg-transparent text-sm md:text-xs text-foreground placeholder:text-muted-foreground focus:outline-none min-w-0 transition-all"
            style={{ fontFamily: "var(--font-body)" }}
            aria-label={placeholder}
            aria-expanded={open}
            aria-controls={listId}
            aria-activedescendant={open && options[activeIdx] ? `${listId}-option-${activeIdx}` : undefined}
            aria-autocomplete="list"
            role="combobox"
          />
          {!open && selectedType && (
            <span className="inline-flex shrink-0 rounded-full bg-muted px-1.5 py-1 md:py-0.5 text-[9px] md:text-[8px] font-extrabold uppercase tracking-wide text-muted-foreground">
              {selectedType}
            </span>
          )}
        </div>
        {selectedMeta && !open && (
          <span className="hidden lg:inline shrink-0 text-[9px] font-semibold text-muted-foreground max-w-[90px] truncate" title={selectedMeta}>
            {selectedMeta}
          </span>
        )}
        {(building || room) && !open && (
          <button
            onMouseDown={(event) => { event.preventDefault(); handleClear(); }}
            className="text-muted-foreground hover:text-foreground shrink-0"
            aria-label={`Clear ${endpointName} selection`}
          >
            <X className="h-3 w-3" />
          </button>
        )}
        <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
      </div>
      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={(element) => {
            listRef.current = element;
            menuRef.current = element;
          }}
          id={listId}
          className="fixed rounded-2xl md:rounded-xl border border-border bg-card shadow-2xl overflow-x-hidden z-[100]"
          style={{
            top: resolvedMenuPosition.top,
            left: resolvedMenuPosition.left,
            width: resolvedMenuPosition.width,
            maxHeight: resolvedMenuPosition.maxHeight,
            overflowY: "auto",
            overscrollBehaviorY: "contain",
          }}
          onWheelCapture={(event) => event.stopPropagation()}
          onTouchMoveCapture={(event) => event.stopPropagation()}
          role="listbox"
          aria-label={`${placeholder} options`}
        >
          <div aria-live="polite" aria-atomic="true" className="sr-only">
            {resultAnnouncement}
          </div>
          {resultCount > 0 ? (
            <>
              {filteredBuildings.length > 0 && (
                <div role="group" aria-label="Buildings">
                  <div className="flex items-center gap-2 md:gap-1.5 px-4 md:px-3 pt-3 md:pt-2 pb-1.5 md:pb-1 text-[11px] md:text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground" aria-hidden="true">
                    <Building2 className="h-3.5 w-3.5 md:h-3 md:w-3 text-primary" />
                    Buildings <span className="font-semibold opacity-70">({filteredBuildings.length})</span>
                  </div>
                  {filteredBuildings.map((candidate, index) => renderOption({
                    kind: "building",
                    key: `building:${candidate.id}`,
                    value: candidate,
                  }, index))}
                </div>
              )}
              {filteredRooms.length > 0 && (
                <div role="group" aria-label="Rooms" className={filteredBuildings.length > 0 ? "border-t border-border/60" : ""}>
                  <div className="flex items-center gap-2 md:gap-1.5 px-4 md:px-3 pt-3 md:pt-2 pb-1.5 md:pb-1 text-[11px] md:text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground" aria-hidden="true">
                    <MapPin className="h-3.5 w-3.5 md:h-3 md:w-3 text-amber-600 dark:text-amber-400" />
                    Rooms <span className="font-semibold opacity-70">({filteredRooms.length})</span>
                  </div>
                  {filteredRooms.map((candidate, index) => renderOption({
                    kind: "room",
                    key: `room:${roomKey(candidate)}`,
                    value: candidate,
                  }, filteredBuildings.length + index))}
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center py-8 md:py-6 px-4 text-center">
              <MapPin className="h-7 w-7 md:h-6 md:w-6 text-muted-foreground/30 mb-2 md:mb-1.5" />
              <p className="text-sm md:text-xs font-semibold text-muted-foreground">No buildings or rooms found</p>
              <p className="text-[11px] md:text-[10px] text-muted-foreground/85 mt-0.5">Try a different search term.</p>
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

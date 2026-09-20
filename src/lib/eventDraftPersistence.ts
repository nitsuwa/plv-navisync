import type {
  EventLocationRef,
  FloorFurniture,
  FloorLabel,
} from "../components/map-builder/types";
import { eventLocationKey } from "./eventOverlayModel";

const EVENT_LAYOUT_DRAFT_VERSION = 1 as const;
const EVENT_LAYOUT_DRAFT_PREFIX = "plv-navisync:event-layout-draft:";

export interface EventLayoutDraft {
  version: typeof EVENT_LAYOUT_DRAFT_VERSION;
  overlayId: string;
  locationKey: string;
  eventFurniture: FloorFurniture[];
  eventLabels: FloorLabel[];
  updatedAt: number;
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function eventLayoutDraftStorageKey(overlayId: string, locationRef: EventLocationRef): string {
  return `${EVENT_LAYOUT_DRAFT_PREFIX}${encodeURIComponent(overlayId)}:${encodeURIComponent(eventLocationKey(locationRef))}`;
}

export function readEventLayoutDraft(
  overlayId: string,
  locationRef: EventLocationRef,
): EventLayoutDraft | null {
  const storage = getStorage();
  if (!storage) return null;

  let raw: string | null;
  try {
    raw = storage.getItem(eventLayoutDraftStorageKey(overlayId, locationRef));
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<EventLayoutDraft>;
    const locationKey = eventLocationKey(locationRef);
    if (
      parsed.version !== EVENT_LAYOUT_DRAFT_VERSION
      || parsed.overlayId !== overlayId
      || parsed.locationKey !== locationKey
      || !Array.isArray(parsed.eventFurniture)
      || !Array.isArray(parsed.eventLabels)
    ) {
      return null;
    }
    return {
      version: EVENT_LAYOUT_DRAFT_VERSION,
      overlayId,
      locationKey,
      eventFurniture: parsed.eventFurniture as FloorFurniture[],
      eventLabels: parsed.eventLabels as FloorLabel[],
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
    };
  } catch {
    return null;
  }
}

export function writeEventLayoutDraft(
  overlayId: string,
  locationRef: EventLocationRef,
  eventFurniture: FloorFurniture[],
  eventLabels: FloorLabel[],
): void {
  const storage = getStorage();
  if (!storage) return;

  const draft: EventLayoutDraft = {
    version: EVENT_LAYOUT_DRAFT_VERSION,
    overlayId,
    locationKey: eventLocationKey(locationRef),
    eventFurniture,
    eventLabels,
    updatedAt: Date.now(),
  };
  try {
    storage.setItem(eventLayoutDraftStorageKey(overlayId, locationRef), JSON.stringify(draft));
  } catch {
    // A full or disabled browser storage should never block event editing.
  }
}

export function clearEventLayoutDraft(overlayId: string, locationRef: EventLocationRef): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(eventLayoutDraftStorageKey(overlayId, locationRef));
  } catch {
    // A disabled browser storage should never block saving the server draft.
  }
}

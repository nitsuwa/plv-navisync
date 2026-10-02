import type { CampusEventOverlay, EventOverlayLocation } from "../components/map-builder/types";

export type EventPhase = "hidden" | "scheduled" | "upcoming" | "ongoing" | "ended";
export type EventMapFilter = "all" | "ongoing" | "upcoming";

export type PublicEventPreview = Pick<
  CampusEventOverlay,
  "id" | "title" | "description" | "organizer" | "posterUrl" | "markers"
> & {
  campusId: string;
  status: "approved";
  isActive: true;
  dateStart: string;
  dateEnd: string;
  publicationAt: string;
  locations: EventOverlayLocation[];
};

export interface PublicEventFeed {
  serverNow: string;
  events: PublicEventPreview[];
}

export type EventPublicationCommand =
  | { action: "publish_now" }
  | { action: "schedule"; publicationAt: string }
  | { action: "unpublish" };

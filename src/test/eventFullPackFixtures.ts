import type { PublicEventPreview } from "../types/eventPreview";

export const eventPreviewFixture = (
  overrides: Partial<PublicEventPreview> = {},
): PublicEventPreview => ({
  id: "event-a",
  campusId: "campus-a",
  title: "College Week",
  description: "Student activities",
  organizer: "OSA",
  markers: [],
  status: "approved",
  isActive: true,
  publicationAt: "2026-10-05T01:00:00.000Z",
  dateStart: "2026-10-08T01:00:00.000Z",
  dateEnd: "2026-10-08T09:00:00.000Z",
  locations: [{
    id: "grounds",
    locationRef: { type: "campus", label: "Campus Grounds" },
    eventFurniture: [],
    eventLabels: [],
  }],
  ...overrides,
});

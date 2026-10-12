import { normalizeEventOverlayLocations } from "./eventOverlayModel";
import type { CampusEventOverlay } from "../components/map-builder/types";
import type { EventOrganizationContext } from "../types/eventOrganization";

export interface ReuseOrganizationEventRequest {
  sourceId: string;
  expectedSourceUpdatedAt: string;
  organizationId: string;
  expectedGrantId: string;
  title: string;
  academicYear: string;
  requestId: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** A user-facing summary of only the content the server is allowed to carry forward. */
export function buildReusableLayoutPreview(source: CampusEventOverlay) {
  return {
    title: source.title,
    description: source.description ?? "",
    organizer: source.organizer,
    posterUrl: source.posterUrl,
    locations: normalizeEventOverlayLocations(source).map((location) => ({
      label: location.locationRef.label,
      furnitureCount: location.eventFurniture.length,
      labelCount: location.eventLabels.length,
    })),
  };
}

/** Build the minimal request. Layout data is deliberately fetched and copied by the server. */
export function prepareEventReuseRequest(
  source: CampusEventOverlay,
  organization: EventOrganizationContext,
  title: string,
  requestId: string,
): ReuseOrganizationEventRequest {
  if (!source.id || source.organizationId !== organization.organizationId) {
    throw new Error("Choose a historical event from the same organization.");
  }
  if (!source.updatedAt || !Number.isFinite(Date.parse(source.updatedAt))) {
    throw new Error("Refresh this historical layout before reusing it.");
  }
  if (!source.campusId) throw new Error("This layout has no campus map to reuse.");
  const cleanTitle = title.trim();
  if (!cleanTitle || cleanTitle.length > 200) throw new Error("Enter a new event title of up to 200 characters.");
  const academicYear = organization.academicYear.trim();
  if (!academicYear || academicYear.length > 40) throw new Error("The current representative assignment has no valid academic year.");
  if (!organization.grantId || !UUID.test(organization.grantId)) throw new Error("Refresh your organization assignment before reusing a layout.");
  if (!UUID.test(requestId)) throw new Error("The reuse request could not be identified. Close and reopen this dialog.");
  return {
    sourceId: source.id,
    expectedSourceUpdatedAt: source.updatedAt,
    organizationId: organization.organizationId,
    expectedGrantId: organization.grantId,
    title: cleanTitle,
    academicYear,
    requestId,
  };
}

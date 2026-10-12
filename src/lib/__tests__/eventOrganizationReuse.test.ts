import { describe, expect, it } from "vitest";
import { buildReusableLayoutPreview, prepareEventReuseRequest } from "../eventOrganizationReuse";
import type { CampusEventOverlay } from "../../components/map-builder/types";

const organization = { organizationId: "org-1", organizationName: "IT Organization", grantId: "30000000-0000-4000-8000-000000000001", academicYear: "2026–2027", expiresAt: "2027-06-30T00:00:00Z" };
const source = {
  id: "10000000-0000-4000-8000-000000000001", organizationId: "org-1", updatedAt: "2026-10-08T12:00:00Z",
  campusId: "campus-1", title: "Old fair", description: "Layout", organizer: "Old IT Org", posterUrl: "https://example.test/event_posters/old.png",
  status: "approved", dateStart: "2025-03-15T01:00:00Z", dateEnd: "2025-03-15T09:00:00Z", publicationAt: "2025-03-01T00:00:00Z",
  adminComment: "Private note", locationFeedback: { ground: "Private feedback" }, feedbackResolutions: { ground: { pin: { addressedBy: "admin" } } },
  revision: 44, submittedAt: "2025-02-01T00:00:00Z", locations: [{ id: "ground", locationRef: { type: "campus", label: "Campus Grounds" }, eventFurniture: [{ id: "booth", type: "booth", name: "Booth", category: "event", x: 20, y: 30, width: 50, height: 30, rotation: 0, color: "#f00" }], eventLabels: [{ id: "label", x: 1, y: 2, text: "Stage", fontSize: 14, color: "#000", rotation: 0 }] }],
} as unknown as CampusEventOverlay;

describe("organization event reuse request", () => {
  it("previews only reusable layout content, never dates, review feedback, or revision state", () => {
    const preview = buildReusableLayoutPreview(source);
    expect(preview).toEqual({ title: "Old fair", description: "Layout", organizer: "Old IT Org", posterUrl: "https://example.test/event_posters/old.png", locations: [{ label: "Campus Grounds", furnitureCount: 1, labelCount: 1 }] });
    expect(preview).not.toHaveProperty("dateStart");
    expect(preview).not.toHaveProperty("adminComment");
    expect(preview).not.toHaveProperty("revision");
  });

  it("prepares a minimal command and ties the draft to the current organization grant", () => {
    expect(prepareEventReuseRequest(source, organization, "  New fair  ", "20000000-0000-4000-8000-000000000001")).toEqual({
      sourceId: source.id, expectedSourceUpdatedAt: source.updatedAt, organizationId: organization.organizationId,
      expectedGrantId: organization.grantId, title: "New fair", academicYear: organization.academicYear,
      requestId: "20000000-0000-4000-8000-000000000001",
    });
  });

  it.each([
    [{ ...source, organizationId: "org-other" }, organization, "New fair", "20000000-0000-4000-8000-000000000001", /same organization/i],
    [source, organization, " ", "20000000-0000-4000-8000-000000000001", /title/i],
    [source, organization, "x".repeat(201), "20000000-0000-4000-8000-000000000001", /title/i],
    [source, { ...organization, academicYear: "" }, "New fair", "20000000-0000-4000-8000-000000000001", /academic year/i],
    [source, organization, "New fair", "not-a-uuid", /request/i],
  ])("rejects invalid reuse request inputs", (event, org, title, requestId, message) => {
    expect(() => prepareEventReuseRequest(event as CampusEventOverlay, org, title, requestId)).toThrow(message as RegExp);
  });
});

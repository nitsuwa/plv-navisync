import type { Campus } from "../components/map-builder/types";
import type { IssueReport } from "../services/reportService";

type ReportFields = Pick<IssueReport,
  "title" | "description" | "category" | "campusId" | "buildingId" | "buildingName"
  | "floorId" | "floorLabel" | "roomId" | "roomName" | "campusPlaceId" | "campusPlaceName">;

export interface ReportPresentation {
  /** The most specific reported place: room, campus place, or building. */
  place: string;
  /** Where that place is, e.g. "Student Center Building · Ground Floor". */
  context: string | null;
  /** The reported problem, e.g. "Facility Problem". */
  issue: string | null;
  /** What the student wrote; null when the form filled in its placeholder. */
  details: string | null;
}

// Mirrors the categories ReportModal submits, for reports whose title lacks an issue.
const ISSUE_BY_CATEGORY: Record<string, string> = {
  electrical_issue: "Broken Light",
  water_leak: "Flooded Area",
  damaged_facility: "Damaged Property",
  accessibility_concern: "Blocked Walkway",
  safety_concern: "Safety Hazard",
  broken_equipment: "Facility Problem",
  other: "Other",
};

const SEPARATOR = " · ";

/** ReportModal titles reports as "<issue> at <Building · Floor · Room>". */
function parseTitle(title: string): { issue: string | null; locationParts: string[] } {
  const at = title.indexOf(" at ");
  if (at <= 0) return { issue: null, locationParts: [] };
  return {
    issue: title.slice(0, at).trim() || null,
    locationParts: title.slice(at + 4).split(SEPARATOR).map((part) => part.trim()).filter(Boolean),
  };
}

function lookupCampusNames(report: ReportFields, campuses: Campus[]) {
  const campus = campuses.find((candidate) => candidate.id === report.campusId);
  if (!campus) return {};
  const building = campus.buildings.find((candidate) => candidate.id === report.buildingId);
  const floor = building?.floors.find((candidate) => candidate.id === report.floorId)
    ?? building?.floors.find((candidate) => candidate.rooms?.some((room) => room.id === report.roomId));
  const room = floor?.rooms?.find((candidate) => candidate.id === report.roomId);
  const place = campus.markers?.find((candidate) => candidate.id === (report.campusPlaceId ?? report.roomId));
  return {
    building: building?.name,
    floor: floor ? floor.label || `Floor ${floor.number}` : undefined,
    room: room?.name,
    place: place?.name,
  };
}

export function presentReport(report: ReportFields, campuses: Campus[] = []): ReportPresentation {
  const parsed = parseTitle(report.title ?? "");
  const known = lookupCampusNames(report, campuses);

  const placeName = report.campusPlaceName || known.place;
  const roomName = report.roomName || known.room;
  const floorName = report.floorLabel || known.floor;
  const buildingName = report.buildingName || known.building;

  let place: string;
  let contextParts: Array<string | undefined>;
  if (placeName) {
    place = placeName;
    contextParts = [];
  } else if (roomName) {
    place = roomName;
    contextParts = [buildingName, floorName];
  } else if (buildingName) {
    place = buildingName;
    contextParts = [floorName];
  } else if (parsed.locationParts.length) {
    // No IDs resolved (e.g. the campus was unpublished): fall back to the title.
    place = parsed.locationParts[parsed.locationParts.length - 1];
    contextParts = parsed.locationParts.slice(0, -1);
  } else {
    place = report.title || "Campus location";
    contextParts = [];
  }

  const issue = parsed.issue ?? ISSUE_BY_CATEGORY[report.category] ?? null;
  const description = report.description?.trim() ?? "";
  // A blank description is stored as "<issue> reported at <location>."
  const isPlaceholder = Boolean(parsed.issue) && /^.+ reported at .+\.$/.test(description)
    && description.startsWith(`${parsed.issue} reported at `);

  return {
    place,
    context: contextParts.filter(Boolean).join(SEPARATOR) || null,
    issue: issue === place ? null : issue,
    details: description && !isPlaceholder ? description : null,
  };
}

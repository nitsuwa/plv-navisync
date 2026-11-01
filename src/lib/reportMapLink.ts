import type { IssueReport } from "../services/reportService";

type ReportLocation = Pick<IssueReport, "campusId" | "buildingId" | "floorId" | "roomId" | "campusPlaceId">;

/**
 * Map link for "View on map" on a report: the reported room when there is
 * one, else the campus place, else the building. The map resolves `roomId`
 * the same way as choosing that room from search.
 */
export function reportMapHref(report: ReportLocation): string {
  const params = new URLSearchParams();
  if (report.campusId) params.set("campusId", report.campusId);

  if (report.campusPlaceId) {
    params.set("placeId", report.campusPlaceId);
  } else if (report.buildingId) {
    params.set("buildingId", report.buildingId);
    if (report.roomId) {
      if (report.floorId) params.set("floorId", report.floorId);
      params.set("roomId", report.roomId);
    }
  } else {
    return "/map";
  }
  return `/map?${params.toString()}`;
}

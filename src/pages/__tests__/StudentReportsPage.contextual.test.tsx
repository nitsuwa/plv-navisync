import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

const campus = vi.hoisted(() => ({ id: "campus-1" }));
const authState = vi.hoisted(() => ({ loading: false, isStudent: true }));
const reportService = vi.hoisted(() => ({ getStudentReports: vi.fn().mockResolvedValue([]) }));

vi.mock("../../hooks/useStudentAuth", () => ({ useStudentAuth: () => authState }));
vi.mock("../../hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../hooks")>()),
  usePublishedCampus: () => ({ activeCampus: campus }),
}));
vi.mock("../../lib/mapDataAdapter", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/mapDataAdapter")>()),
  buildingsFromCampus: () => [{ id: "b1", code: "B1", name: "Student Center" }],
}));
vi.mock("../../services/reportService", () => ({ reportService }));
vi.mock("../../hooks/useScrollReveal", () => ({ useScrollReveal: () => ({ ref: vi.fn(), visible: true }) }));
vi.mock("../../components/map/ReportModal", () => ({
  ReportModal: ({ building }: { building: { name: string } }) => <div role="dialog">Report issue for {building.name}</div>,
}));

import { StudentReportsPage } from "../StudentReportsPage";

describe("StudentReportsPage contextual report flow", () => {
  it("opens a report form for the building from the canonical query", async () => {
    render(
      <MemoryRouter initialEntries={["/student/reports?building=b1"]}>
        <StudentReportsPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByRole("dialog")).toHaveTextContent("Student Center"));
  });

  it("removes the redundant section and refresh controls and formats report update times", async () => {
    const submittedAt = "2026-10-05T14:08:21.984631+00:00";
    reportService.getStudentReports.mockResolvedValueOnce([{
      id: "report-1",
      campusId: "campus-1",
      reporterId: "student-1",
      category: "electrical_issue",
      priority: "normal",
      title: "Broken light at Student Center",
      description: "A light is broken.",
      status: "pending",
      createdAt: submittedAt,
      updatedAt: submittedAt,
      updates: [{ text: "Report submitted", date: submittedAt }],
    }] as never);

    render(
      <MemoryRouter initialEntries={["/student/reports"]}>
        <StudentReportsPage />
      </MemoryRouter>,
    );

    await screen.findByText("Report submitted");
    expect(screen.queryByText("Submitted Reports")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Refresh reports" })).not.toBeInTheDocument();
    const timestamp = document.querySelector(`time[datetime="${submittedAt}"]`);
    expect(timestamp).toBeInTheDocument();
    expect(timestamp).not.toHaveTextContent(submittedAt);
    expect(timestamp).toHaveTextContent("2026");
  });
});

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
});

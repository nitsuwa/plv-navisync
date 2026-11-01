import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IssueReport } from "../../../services/reportService";
import { ReportClosurePanel } from "../ReportClosurePanel";

const mocks = vi.hoisted(() => ({ reopenOwnReport: vi.fn() }));
vi.mock("../../../services/reportService", () => ({
  reportService: { reopenOwnReport: mocks.reopenOwnReport },
}));

const recently = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
const report = {
  id: "r1",
  campusId: "c1",
  reporterId: "student-1",
  category: "electrical_issue",
  priority: "normal",
  title: "Broken Light at CABA · Ground Floor · CABA-101",
  description: "Broken Light reported at CABA · Ground Floor · CABA-101.",
  status: "resolved",
  resolutionNotes: "Maintenance replaced the ceiling light on Oct 27.",
  createdAt: recently,
  updatedAt: recently,
} as IssueReport;

describe("ReportClosurePanel", () => {
  beforeEach(() => {
    mocks.reopenOwnReport.mockClear();
    mocks.reopenOwnReport.mockImplementation(async () => undefined);
  });

  it("shows nothing while a report is still open", () => {
    const { container } = render(<ReportClosurePanel report={{ ...report, status: "in_progress" }} onReopened={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the campus team's resolution to the reporter", () => {
    render(<ReportClosurePanel report={report} onReopened={vi.fn()} />);
    expect(screen.getByText("Resolution from the campus team")).toBeInTheDocument();
    expect(screen.getByText("Maintenance replaced the ceiling light on Oct 27.")).toBeInTheDocument();
  });

  it("lets the reporter reopen with a reason when the problem is still there", async () => {
    mocks.reopenOwnReport.mockResolvedValue(undefined);
    const onReopened = vi.fn();
    render(<ReportClosurePanel report={report} onReopened={onReopened} />);
    fireEvent.click(screen.getByRole("button", { name: /Still a problem\? Reopen this report/ }));
    const submit = screen.getByRole("button", { name: "Reopen report" });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("What's still wrong?"), { target: { value: "Still flickering this morning." } });
    await act(async () => { fireEvent.click(submit); });
    expect(mocks.reopenOwnReport).toHaveBeenCalledWith("r1", "Still flickering this morning.");
    expect(onReopened).toHaveBeenCalled();
  });

  it("explains when the server refuses, e.g. after two reopens", async () => {
    mocks.reopenOwnReport.mockImplementation(() => Promise.reject(new Error("This report has already been reopened twice. Please submit a new report.")));
    render(<ReportClosurePanel report={report} onReopened={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Reopen this report/ }));
    fireEvent.change(screen.getByLabelText("What's still wrong?"), { target: { value: "Still flickering this morning." } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Reopen report" })); });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("reopened twice"));
  });

  it("stops offering to reopen after the 30-day window", () => {
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    render(<ReportClosurePanel report={{ ...report, status: "rejected", resolutionNotes: "Duplicate of an earlier report.", updatedAt: old }} onReopened={vi.fn()} />);
    expect(screen.getByText("Why this report was dismissed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /review/i })).not.toBeInTheDocument();
    expect(screen.getByText(/within 30 days of closing/)).toBeInTheDocument();
  });
});

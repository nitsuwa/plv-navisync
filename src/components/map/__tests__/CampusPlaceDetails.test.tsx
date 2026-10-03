import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CampusMarker } from "../../map-builder/types";
import type { StudentAuthState } from "../../../contexts/StudentAuthContext";
import { CampusPlaceDetails } from "../CampusPlaceDetails";
import { weeklyHoursPreset } from "../../../lib/buildingInformation";

const place: CampusMarker = {
  id: "gate-main",
  name: "Campus Gate",
  type: "gate",
  purpose: "general",
  navNodeId: "gate-node",
  x: 220,
  y: 130,
  color: "#2563eb",
};

const studentAuth = {
  profile: { id: "student-1" },
  loading: false,
  isStudent: true,
  isStudentOrg: false,
  username: "Student",
  role: "student",
  refreshProfile: vi.fn(),
  signOut: vi.fn(),
} as unknown as StudentAuthState;

function renderDetails(overrides: Partial<Parameters<typeof CampusPlaceDetails>[0]> = {}) {
  return render(<CampusPlaceDetails
    place={place}
    campusId="campus-1"
    canRouteTo
    canStartAt
    saved={false}
    studentAuth={studentAuth}
    onClose={vi.fn()}
    onDirections={vi.fn()}
    onStartHere={vi.fn()}
    onSave={vi.fn()}
    onReport={vi.fn()}
    onSignInPrompt={vi.fn()}
    {...overrides}
  />);
}

describe("CampusPlaceDetails", () => {
  it("uses a branded fallback and offers route, save, share, and report without building entry", () => {
    renderDetails();
    expect(screen.getAllByLabelText("Campus Gate campus place details").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("campus-place-directions").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("campus-place-start-here").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("campus-place-report").length).toBeGreaterThan(0);
    expect(screen.queryByText("Enter Building")).not.toBeInTheDocument();
    expect(screen.queryByText("No accessibility data yet")).not.toBeInTheDocument();
    expect(screen.getAllByText(/Gate/).length).toBeGreaterThan(0);
  });

  it("shows configured student information and keeps optional sections hidden when absent", () => {
    renderDetails({ place: {
      ...place,
      studentInfo: {
        description: "The main pedestrian entrance to campus.",
        gateType: "main_entrance",
        operatingHoursSchedule: weeklyHoursPreset("daily"),
        accessibleEntrance: true,
        pedestrianAccess: true,
      },
    } });
    expect(screen.getAllByText("The main pedestrian entrance to campus.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Accessible entrance").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Pedestrian access").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Operating hours/).length).toBeGreaterThan(0);
  });

  it("wires Directions, Start here, and Report directly to their actions", () => {
    const onDirections = vi.fn();
    const onStartHere = vi.fn();
    const onReport = vi.fn();
    renderDetails({ onDirections, onStartHere, onReport });
    fireEvent.click(screen.getAllByTestId("campus-place-directions")[0]);
    fireEvent.click(screen.getAllByTestId("campus-place-start-here")[0]);
    fireEvent.click(screen.getAllByTestId("campus-place-report")[0]);
    expect(onDirections).toHaveBeenCalledTimes(1);
    expect(onStartHere).toHaveBeenCalledTimes(1);
    expect(onReport).toHaveBeenCalledTimes(1);
  });

  it("explains when the place has no authored route connection", () => {
    renderDetails({ canRouteTo: false, canStartAt: false });
    expect(screen.getAllByTestId("campus-place-directions")[0]).toBeDisabled();
    expect(screen.getAllByTestId("campus-place-start-here")[0]).toBeDisabled();
    expect(screen.getAllByText("This place is not connected to the walking network yet.").length).toBeGreaterThan(0);
  });

  it("keeps destination and starting-point availability independent for one-way graph links", () => {
    const { unmount } = renderDetails({ canRouteTo: true, canStartAt: false });
    expect(screen.getAllByTestId("campus-place-directions")[0]).toBeEnabled();
    expect(screen.getAllByTestId("campus-place-start-here")[0]).toBeDisabled();
    unmount();

    renderDetails({ canRouteTo: false, canStartAt: true });
    expect(screen.getAllByTestId("campus-place-directions")[0]).toBeDisabled();
    expect(screen.getAllByTestId("campus-place-start-here")[0]).toBeEnabled();
  });
});

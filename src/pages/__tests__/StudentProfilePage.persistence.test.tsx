import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  loading: false,
  isStudent: true,
  username: "Maria Santos",
  role: "student" as const,
  profile: {
    id: "user-1",
    first_name: "Maria",
    last_name: "Santos",
    email: "maria@plv.edu.ph",
    student_number: "2024-001",
    department: "Computer Engineering",
    avatar_path: null,
    role: "student",
    is_active: true,
  },
  signOut: vi.fn(),
  refreshProfile: vi.fn(),
}));
const accountService = vi.hoisted(() => ({
  getSavedBuildingIds: vi.fn().mockReturnValue(["b1"]),
  getSavedBuildingIdsAsync: vi.fn().mockResolvedValue(["b1"]),
}));
const reportService = vi.hoisted(() => ({ getStudentReports: vi.fn().mockResolvedValue([]) }));
const profileService = vi.hoisted(() => ({
  updateStudentProfile: vi.fn().mockResolvedValue({ ...authState.profile, first_name: "Ana", last_name: "Reyes" }),
  uploadStudentAvatar: vi.fn().mockResolvedValue({ path: "user-1/avatar.png", url: "https://signed/avatar" }),
}));

vi.mock("../../hooks/useStudentAuth", () => ({ useStudentAuth: () => authState }));
vi.mock("../../hooks/useScrollReveal", () => ({ useScrollReveal: () => ({ ref: vi.fn(), visible: true }) }));
vi.mock("../../services/studentAccountService", () => ({ studentAccountService: accountService }));
vi.mock("../../services/reportService", () => ({ reportService }));
vi.mock("../../services/studentProfileService", () => profileService);
vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }),
}));

import { StudentProfilePage } from "../StudentProfilePage";

describe("StudentProfilePage persistence", () => {
  it("saves the edited profile name through the profile service", async () => {
    render(<StudentProfilePage />, { wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter> });
    await waitFor(() => expect(screen.getByRole("heading", { name: "Maria Santos" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Edit display name" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Edit display name" }), { target: { value: "Ana Reyes" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(profileService.updateStudentProfile).toHaveBeenCalledWith({
      firstName: "Ana",
      lastName: "Reyes",
    }));
  });

  it("uploads a selected profile photo", async () => {
    render(<StudentProfilePage />, { wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter> });
    await waitFor(() => expect(screen.getByRole("heading", { name: "Maria Santos" })).toBeInTheDocument());

    const input = screen.getByLabelText("Upload profile photo");
    fireEvent.change(input, { target: { files: [new File(["avatar"], "avatar.png", { type: "image/png" })] } });

    await waitFor(() => expect(profileService.uploadStudentAvatar).toHaveBeenCalled());
  });
});

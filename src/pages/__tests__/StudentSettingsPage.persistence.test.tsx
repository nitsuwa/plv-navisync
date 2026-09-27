import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  loading: false,
  isStudent: true,
  username: "Maria Santos",
  role: "student" as const,
  signOut: vi.fn(),
}));
const preferenceService = vi.hoisted(() => ({
  DEFAULT_STUDENT_PREFERENCES: { mapUpdates: true, reportStatus: true, campusEvents: true },
  loadStudentPreferences: vi.fn(),
  saveStudentPreferences: vi.fn(),
}));
const passwordService = vi.hoisted(() => ({ updateStudentPassword: vi.fn() }));

vi.mock("../../hooks/useStudentAuth", () => ({ useStudentAuth: () => authState }));
vi.mock("../../hooks/useTheme", () => ({ useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }) }));
vi.mock("../../hooks/useScrollReveal", () => ({
  useScrollReveal: () => ({ ref: vi.fn(), visible: true }),
}));
vi.mock("../../services/studentPreferencesService", () => preferenceService);
vi.mock("../../lib/studentAccount", () => passwordService);
vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }),
}));

import { StudentSettingsPage } from "../StudentSettingsPage";

describe("StudentSettingsPage persistence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.scrollTo = vi.fn();
    preferenceService.loadStudentPreferences.mockResolvedValue({
      mapUpdates: false,
      reportStatus: true,
      campusEvents: false,
    });
    preferenceService.saveStudentPreferences.mockImplementation(async (value) => value);
    passwordService.updateStudentPassword.mockResolvedValue({ user: { id: "user-1" } });
  });

  afterEach(() => vi.useRealTimers());

  it("loads and persists notification settings", async () => {
    render(<StudentSettingsPage />, { wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter> });
    await act(async () => vi.advanceTimersByTime(600));
    vi.useRealTimers();
    fireEvent.click(screen.getByRole("tab", { name: "Notifications" }));

    await waitFor(() => expect(preferenceService.loadStudentPreferences).toHaveBeenCalled());
    const mapToggle = screen.getByRole("switch", { name: "Map updates" });
    expect(mapToggle).toHaveAttribute("aria-checked", "false");

    fireEvent.click(mapToggle);
    await waitFor(() => expect(preferenceService.saveStudentPreferences).toHaveBeenCalledWith({
      mapUpdates: true,
      reportStatus: true,
      campusEvents: false,
    }));
  });

  it("verifies the current password before saving a new one", async () => {
    render(<StudentSettingsPage />, { wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter> });
    await act(async () => vi.advanceTimersByTime(600));
    vi.useRealTimers();
    fireEvent.click(screen.getByRole("tab", { name: "Security" }));
    fireEvent.click(await screen.findByText("Change Password"));

    fireEvent.change(screen.getByLabelText("Current Password"), { target: { value: "old-password" } });
    fireEvent.change(screen.getByLabelText("New Password"), { target: { value: "new-password" } });
    fireEvent.change(screen.getByLabelText("Confirm New Password"), { target: { value: "new-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Update Password" }));

    await waitFor(() => expect(passwordService.updateStudentPassword).toHaveBeenCalledWith("old-password", "new-password"));
  });
});

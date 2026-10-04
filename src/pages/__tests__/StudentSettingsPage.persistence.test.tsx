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
const themeService = vi.hoisted(() => ({ setThemePreference: vi.fn() }));
vi.mock("../../hooks/useTheme", () => ({ useTheme: () => ({ theme: "light", themePreference: "system", toggleTheme: vi.fn(), setThemePreference: themeService.setThemePreference }) }));
vi.mock("../../hooks/useScrollReveal", () => ({
  useScrollReveal: () => ({ ref: vi.fn(), visible: true }),
}));
vi.mock("../../services/studentPreferencesService", () => preferenceService);
vi.mock("../../lib/studentAccount", () => ({ MIN_ACCOUNT_PASSWORD_LENGTH: 8, ...passwordService }));
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

  it("persists the active report-status category without exposing inactive categories", async () => {
    render(<StudentSettingsPage />, { wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter> });
    await act(async () => vi.advanceTimersByTime(600));
    vi.useRealTimers();
    fireEvent.click(screen.getByRole("tab", { name: "Notifications" }));

    await waitFor(() => expect(preferenceService.loadStudentPreferences).toHaveBeenCalled());
    const reportToggle = screen.getByRole("switch", { name: "Report status" });
    expect(reportToggle).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("switch", { name: "Map updates" })).not.toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "Campus events" })).not.toBeInTheDocument();

    fireEvent.click(reportToggle);
    await waitFor(() => expect(preferenceService.saveStudentPreferences).toHaveBeenCalledWith({
      mapUpdates: false,
      reportStatus: false,
      campusEvents: false,
    }));
  });

  it("restores the previous notification state when saving fails", async () => {
    preferenceService.saveStudentPreferences.mockRejectedValueOnce(new Error("offline"));
    render(<StudentSettingsPage />, { wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter> });
    await act(async () => vi.advanceTimersByTime(600));
    vi.useRealTimers();
    fireEvent.click(screen.getByRole("tab", { name: "Notifications" }));
    const reportToggle = await screen.findByRole("switch", { name: "Report status" });
    fireEvent.click(reportToggle);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Could not save this preference"));
    expect(reportToggle).toHaveAttribute("aria-checked", "true");
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

  it("offers System, Light, and Dark theme choices without a Support tab", async () => {
    render(<StudentSettingsPage />, { wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter> });
    await act(async () => vi.advanceTimersByTime(600));
    vi.useRealTimers();

    expect(screen.queryByRole("tab", { name: /Support/ })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Appearance" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Notifications" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Security" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /System/ })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: /Dark/ }));
    expect(themeService.setThemePreference).toHaveBeenCalledWith("dark");
  });
});

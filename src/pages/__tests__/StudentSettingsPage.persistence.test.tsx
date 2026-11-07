import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAP_HAPTIC_PREFERENCE_KEY, MAP_SOUND_PREFERENCE_KEY } from "../../lib/mapFeedback";
import * as mapFeedback from "../../lib/mapFeedback";

const authState = vi.hoisted(() => ({
  loading: false,
  isStudent: true,
  username: "Maria Santos",
  role: "student" as "student" | "student_org",
  profile: { id: "student-a" } as { id: string } | null,
  signOut: vi.fn(),
}));
const preferenceService = vi.hoisted(() => ({
  DEFAULT_STUDENT_PREFERENCES: { mapUpdates: true, reportStatus: true, campusEvents: true },
  loadStudentPreferences: vi.fn(),
  saveStudentPreferences: vi.fn(),
}));
const passwordService = vi.hoisted(() => ({ updateStudentPassword: vi.fn() }));
const buddyState = vi.hoisted(() => ({
  appearance: { outfit: "classic" as const, backpack: "classic" as const },
  loaded: true,
  saveAppearance: vi.fn(),
}));

vi.mock("../../hooks/useStudentAuth", () => ({ useStudentAuth: () => authState }));
const themeService = vi.hoisted(() => ({ setThemePreference: vi.fn() }));
vi.mock("../../hooks/useTheme", () => ({ useTheme: () => ({ theme: "light", preference: "system", toggleTheme: vi.fn(), setThemePreference: themeService.setThemePreference }) }));
vi.mock("../../hooks/useScrollReveal", () => ({
  useScrollReveal: () => ({ ref: vi.fn(), visible: true }),
}));
vi.mock("../../services/studentPreferencesService", () => preferenceService);
vi.mock("../../lib/studentAccount", () => ({ MIN_ACCOUNT_PASSWORD_LENGTH: 8, ...passwordService }));
vi.mock("../../contexts/NaviBuddyStore", () => ({
  useNaviBuddy: () => buddyState,
  useNaviBuddyAppearance: () => buddyState.appearance,
}));
vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }),
}));

import { StudentSettingsPage } from "../StudentSettingsPage";

describe("StudentSettingsPage persistence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    authState.profile = { id: "student-a" };
    window.scrollTo = vi.fn();
    preferenceService.loadStudentPreferences.mockResolvedValue({
      mapUpdates: false,
      reportStatus: true,
      campusEvents: false,
    });
    preferenceService.saveStudentPreferences.mockImplementation(async (value) => value);
    passwordService.updateStudentPassword.mockResolvedValue({ user: { id: "user-1" } });
    buddyState.appearance = { outfit: "classic", backpack: "classic" };
    buddyState.loaded = true;
    buddyState.saveAppearance.mockReset().mockImplementation(async (next) => { buddyState.appearance = next; });
  });

  afterEach(() => vi.useRealTimers());

  it("keeps map sound off and haptics on by default, then persists their settings locally", async () => {
    render(<StudentSettingsPage />, { wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter> });
    await act(async () => vi.advanceTimersByTime(600));
    vi.useRealTimers();
    const sound = screen.getByRole("switch", { name: "Sound effects" });
    const haptics = screen.getByRole("switch", { name: "Haptic feedback" });
    expect(sound).toHaveClass("h-11", "w-12");
    expect(sound.querySelector("span")).toHaveClass("h-[26px]", "w-12");
    expect(sound.querySelector("span span")).toHaveClass("h-5", "w-5", "transition-[translate]");
    expect(sound).toHaveAttribute("aria-checked", "false");
    expect(haptics).toHaveAttribute("aria-checked", "true");
    fireEvent.click(sound);
    expect(localStorage.getItem(MAP_SOUND_PREFERENCE_KEY)).toBe("on");
    fireEvent.click(screen.getByRole("switch", { name: "Haptic feedback" }));
    expect(localStorage.getItem(MAP_HAPTIC_PREFERENCE_KEY)).toBe("off");
  });

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

  it("reloads account-specific notification preferences when the active student changes", async () => {
    preferenceService.loadStudentPreferences.mockClear();
    preferenceService.loadStudentPreferences.mockImplementation(async () => ({
      mapUpdates: true,
      reportStatus: authState.profile?.id !== "student-a",
      campusEvents: true,
    }));
    const { rerender } = render(<StudentSettingsPage />, { wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter> });
    await act(async () => vi.advanceTimersByTime(600));
    vi.useRealTimers();
    fireEvent.click(screen.getByRole("tab", { name: "Notifications" }));

    await waitFor(() => expect(screen.getByRole("switch", { name: "Report status" })).toHaveAttribute("aria-checked", "false"));
    const previousCalls = preferenceService.loadStudentPreferences.mock.calls.length;
    authState.profile = { id: "student-b" };
    rerender(<StudentSettingsPage />);

    await waitFor(() => expect(preferenceService.loadStudentPreferences.mock.calls.length).toBeGreaterThan(previousCalls));
    await waitFor(() => expect(screen.getByRole("switch", { name: "Report status" })).toHaveAttribute("aria-checked", "true"));
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

  it("provides a large, stateful password visibility control", async () => {
    render(<StudentSettingsPage />, { wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter> });
    await act(async () => vi.advanceTimersByTime(600));
    vi.useRealTimers();
    fireEvent.click(screen.getByRole("tab", { name: "Security" }));
    fireEvent.click(await screen.findByText("Change Password"));

    const currentPassword = screen.getByLabelText("Current Password");
    const showPassword = await screen.findByRole("button", { name: "Show current password" });
    expect(showPassword).toHaveClass("h-11", "w-11");
    expect(showPassword).toHaveAttribute("aria-pressed", "false");
    expect(currentPassword).toHaveAttribute("type", "password");

    fireEvent.click(showPassword);
    const hidePassword = screen.getByRole("button", { name: "Hide current password" });
    expect(hidePassword).toHaveAttribute("aria-pressed", "true");
    expect(currentPassword).toHaveAttribute("type", "text");
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

  it("shows the student-only NaviBuddy editor with live outfit and backpack controls", async () => {
    localStorage.setItem(MAP_SOUND_PREFERENCE_KEY, "on");
    const saveSound = vi.spyOn(mapFeedback, "triggerMapFeedbackSound");
    render(<StudentSettingsPage />, { wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter> });
    await act(async () => vi.advanceTimersByTime(600));
    vi.useRealTimers();
    fireEvent.click(screen.getByRole("tab", { name: "My NaviBuddy" }));

    const outfits = within(screen.getByRole("radiogroup", { name: "NaviBuddy outfit" }));
    expect(outfits.getByRole("radio", { name: "Classic" })).toHaveAttribute("aria-checked", "true");
    const saveButton = screen.getByRole("button", { name: "Save Look" });
    expect(saveButton).toBeDisabled();
    expect(screen.getAllByRole("img", { name: "Classic NaviBuddy" }).length).toBeGreaterThanOrEqual(1);
    fireEvent.click(outfits.getByRole("radio", { name: "Adventurer" }));
    expect(outfits.getByRole("radio", { name: "Adventurer" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getAllByRole("img", { name: "Adventurer NaviBuddy" }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("navibuddy-selected-outfit-label")).toHaveTextContent("Adventurer");
    expect(screen.getByTestId("navibuddy-selected-outfit-label")).toHaveClass("whitespace-nowrap");
    expect(outfits.getByRole("img", { name: "Adventurer NaviBuddy" })).toHaveClass("h-[60px]", "w-[54px]");
    expect(screen.queryByText("Navigation reactions")).not.toBeInTheDocument();
    const backpacks = within(screen.getByRole("radiogroup", { name: "NaviBuddy backpack" }));
    fireEvent.click(backpacks.getByRole("radio", { name: "Compact Backpack" }));
    expect(backpacks.getByRole("radio", { name: "Compact Backpack" })).toHaveAttribute("aria-checked", "true");
    expect(saveButton).toBeEnabled();
    fireEvent.click(outfits.getByRole("radio", { name: "Classic" }));
    fireEvent.click(backpacks.getByRole("radio", { name: "Classic Backpack" }));
    expect(saveButton).toBeDisabled();
    fireEvent.click(outfits.getByRole("radio", { name: "Adventurer" }));
    fireEvent.click(backpacks.getByRole("radio", { name: "Compact Backpack" }));
    fireEvent.click(saveButton);
    await waitFor(() => expect(buddyState.saveAppearance).toHaveBeenCalledWith({ outfit: "adventurer", backpack: "compact" }));
    expect(saveButton).toBeDisabled();
    expect(await screen.findByText("Look saved!")).toBeInTheDocument();
    expect(saveSound).toHaveBeenCalledTimes(1);
    expect(saveSound).toHaveBeenCalledWith("save-success");
    saveSound.mockRestore();
  });

  it("keeps a failed save editable and silent, and Reset remains an unsaved draft action", async () => {
    localStorage.setItem(MAP_SOUND_PREFERENCE_KEY, "on");
    buddyState.saveAppearance.mockRejectedValueOnce(new Error("offline"));
    const saveSound = vi.spyOn(mapFeedback, "triggerMapFeedbackSound");
    render(<StudentSettingsPage />, { wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter> });
    await act(async () => vi.advanceTimersByTime(600));
    vi.useRealTimers();
    fireEvent.click(screen.getByRole("tab", { name: "My NaviBuddy" }));
    const saveButton = screen.getByRole("button", { name: "Save Look" });
    expect(saveButton).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Reset NaviBuddy to default" }));
    expect(saveButton).toBeDisabled();
    const outfits = within(screen.getByRole("radiogroup", { name: "NaviBuddy outfit" }));
    fireEvent.click(outfits.getByRole("radio", { name: "PLV Uniform" }));
    expect(saveButton).toBeEnabled();
    fireEvent.click(saveButton);
    await waitFor(() => expect(buddyState.saveAppearance).toHaveBeenCalledWith({ outfit: "plv_uniform", backpack: "classic" }));
    await waitFor(() => expect(saveButton).toBeEnabled());
    expect(screen.queryByText("Look saved!")).not.toBeInTheDocument();
    expect(saveSound).not.toHaveBeenCalled();
    saveSound.mockRestore();
  });

  it("does not expose customization to student organization accounts", async () => {
    authState.role = "student_org";
    render(<StudentSettingsPage />, { wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter> });
    await act(async () => vi.advanceTimersByTime(600));
    vi.useRealTimers();
    expect(screen.queryByRole("tab", { name: "My NaviBuddy" })).not.toBeInTheDocument();
    authState.role = "student";
  });
});

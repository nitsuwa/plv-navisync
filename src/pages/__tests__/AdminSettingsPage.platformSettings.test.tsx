import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  upsertSettings: vi.fn(),
  logActivity: vi.fn(),
  listCampuses: vi.fn(),
  getNotificationPreferences: vi.fn(),
  saveNotificationPreferences: vi.fn(),
}));

vi.mock("../../services/settingsService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/settingsService")>();
  return {
    ...actual,
    settingsService: { ...actual.settingsService, getSettings: mocks.getSettings, upsertSettings: mocks.upsertSettings },
    logPlatformSettingsActivity: mocks.logActivity,
  };
});
vi.mock("../../services/campusService", () => ({ campusService: { list: mocks.listCampuses } }));
vi.mock("../../services/adminNotificationPreferencesService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/adminNotificationPreferencesService")>();
  return {
    ...actual,
    adminNotificationPreferencesService: {
      ...actual.adminNotificationPreferencesService,
      get: mocks.getNotificationPreferences,
      save: mocks.saveNotificationPreferences,
    },
  };
});
vi.mock("../../hooks/useToast", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

import { AdminSettingsPage } from "../AdminSettingsPage";

describe("Admin Settings platform controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
    mocks.getSettings.mockResolvedValue({ default_campus_id: "campus-main" });
    mocks.listCampuses.mockResolvedValue([
      { id: "campus-main", name: "Main Campus", code: "PLV", isDefault: true, lifecycleStatus: "published" },
      { id: "campus-north", name: "North Campus", code: "NORTH", lifecycleStatus: "published" },
      { id: "campus-draft", name: "Private Draft", code: "DRAFT", lifecycleStatus: "draft" },
      { id: "campus-soon", name: "Coming Soon Campus", code: "SOON", lifecycleStatus: "coming_soon" },
    ]);
    mocks.getNotificationPreferences.mockResolvedValue({ reports: true, events: true, campus: true, announcements: true, users: true });
    mocks.upsertSettings.mockResolvedValue(undefined);
    mocks.logActivity.mockResolvedValue(undefined);
    mocks.saveNotificationPreferences.mockResolvedValue(undefined);
  });

  it("shows only the three useful sections and offers only published campuses", async () => {
    render(<AdminSettingsPage />);
    expect(await screen.findByRole("tab", { name: "Student Experience" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Map & Navigation" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Notifications" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "General" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Appearance" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Emergency" })).not.toBeInTheDocument();

    const campus = screen.getByRole("combobox", { name: "Default Campus" });
    expect(campus).toHaveAttribute("data-slot", "select-trigger");
    expect(campus).toHaveTextContent("Main Campus — PLV");
    fireEvent.keyDown(campus, { key: "ArrowDown" });
    expect(await screen.findByRole("option", { name: "Main Campus — PLV" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Private Draft/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Coming Soon Campus/ })).not.toBeInTheDocument();
  });

  it("uses the same custom Select for route mode and keeps selection unsaved across tabs", async () => {
    render(<AdminSettingsPage />);
    await screen.findByRole("tab", { name: "Student Experience" });
    fireEvent.click(screen.getByRole("tab", { name: "Map & Navigation" }));

    const routeMode = await screen.findByRole("combobox", { name: "Default Route Mode" });
    expect(routeMode).toHaveAttribute("data-slot", "select-trigger");
    expect(routeMode).toHaveTextContent("Standard");
    fireEvent.keyDown(routeMode, { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "Accessible" }));

    await waitFor(() => expect(routeMode).toHaveTextContent("Accessible"));
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeEnabled();
    fireEvent.click(screen.getByRole("tab", { name: "Student Experience" }));
    fireEvent.click(screen.getByRole("tab", { name: "Map & Navigation" }));
    expect(await screen.findByRole("combobox", { name: "Default Route Mode" })).toHaveTextContent("Accessible");
    expect(mocks.upsertSettings).not.toHaveBeenCalled();
  });

  it("updates the Default Campus locally and retains it when switching tabs", async () => {
    render(<AdminSettingsPage />);
    const campus = await screen.findByRole("combobox", { name: "Default Campus" });
    fireEvent.keyDown(campus, { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "North Campus — NORTH" }));

    expect(campus).toHaveTextContent("North Campus — NORTH");
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeEnabled();
    fireEvent.click(screen.getByRole("tab", { name: "Map & Navigation" }));
    fireEvent.click(screen.getByRole("tab", { name: "Student Experience" }));
    expect(await screen.findByRole("combobox", { name: "Default Campus" })).toHaveTextContent("North Campus — NORTH");
    expect(mocks.upsertSettings).not.toHaveBeenCalled();
  });

  it("saves only changed platform values and logs one settings action", async () => {
    render(<AdminSettingsPage />);
    await screen.findByRole("tab", { name: "Student Experience" });
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeDisabled();
    fireEvent.click(screen.getByRole("switch", { name: "Remember Last Campus" }));
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(mocks.upsertSettings).toHaveBeenCalledWith([
      { key: "remember_last_campus", value: false, isPublic: true },
    ], false));
    expect(await screen.findByRole("button", { name: "Saved" })).toBeDisabled();
    expect(mocks.logActivity).toHaveBeenCalledTimes(1);
    expect(mocks.logActivity).toHaveBeenCalledWith(["remember_last_campus"]);
  });

  it("keeps unsaved edits across tabs and saves them together", async () => {
    render(<AdminSettingsPage />);
    const studentTab = await screen.findByRole("tab", { name: "Student Experience" });
    fireEvent.click(screen.getByRole("switch", { name: "Remember Last Campus" }));

    fireEvent.click(screen.getByRole("tab", { name: "Map & Navigation" }));
    await screen.findByRole("switch", { name: "Show Map Labels" });
    fireEvent.click(screen.getByRole("switch", { name: "Show Map Labels" }));

    fireEvent.click(screen.getByRole("tab", { name: "Notifications" }));
    await screen.findByRole("switch", { name: "Reports notifications" });
    fireEvent.click(screen.getByRole("switch", { name: "Reports notifications" }));
    fireEvent.click(studentTab);

    await screen.findByRole("switch", { name: "Remember Last Campus" });
    expect(screen.getByRole("switch", { name: "Remember Last Campus" })).toHaveAttribute("aria-checked", "false");
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(mocks.upsertSettings).toHaveBeenCalledWith(expect.arrayContaining([
      { key: "remember_last_campus", value: false, isPublic: true },
      { key: "show_map_labels", value: false, isPublic: true },
    ]), false));
    expect(mocks.saveNotificationPreferences).toHaveBeenCalledWith(expect.objectContaining({ reports: false }));
  });

  it("supports arrow-key navigation between accessible tabs", async () => {
    render(<AdminSettingsPage />);
    const studentTab = await screen.findByRole("tab", { name: "Student Experience" });
    fireEvent.keyDown(studentTab, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Map & Navigation" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Map & Navigation" })).toHaveFocus();
  });

  it("keeps local edits and allows retry when saving fails", async () => {
    mocks.upsertSettings.mockRejectedValueOnce(new Error("network error"));
    render(<AdminSettingsPage />);
    await screen.findByRole("tab", { name: "Student Experience" });
    fireEvent.click(screen.getByRole("switch", { name: "Remember Last Campus" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(mocks.upsertSettings).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("switch", { name: "Remember Last Campus" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeEnabled();
  });

  it("stores notification choices per admin without writing a platform-wide setting", async () => {
    render(<AdminSettingsPage />);
    await screen.findByRole("tab", { name: "Student Experience" });
    fireEvent.click(screen.getByRole("tab", { name: "Notifications" }));
    await screen.findByRole("switch", { name: "Events notifications" });
    fireEvent.click(screen.getByRole("switch", { name: "Events notifications" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(mocks.saveNotificationPreferences).toHaveBeenCalledWith({
      reports: true, events: false, campus: true, announcements: true, users: true,
    }));
    expect(mocks.upsertSettings).toHaveBeenCalledWith([], false);
    expect(mocks.logActivity).toHaveBeenCalledTimes(1);
    expect(mocks.logActivity).toHaveBeenCalledWith(["admin_notification_preferences"]);
  });
});

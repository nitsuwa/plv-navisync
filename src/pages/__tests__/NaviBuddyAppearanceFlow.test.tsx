import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_NAVIBUDDY_APPEARANCE, type NaviBuddyAppearance } from "../../lib/naviBuddy";

const authState = vi.hoisted(() => ({
  loading: false,
  isStudent: true,
  username: "Test Student",
  role: "student" as "student" | "student_org",
  profile: { id: "student-a" } as { id: string } | null,
  signOut: vi.fn(),
}));
const buddyService = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
const studentPreferences = vi.hoisted(() => ({
  DEFAULT_STUDENT_PREFERENCES: { mapUpdates: true, reportStatus: true, campusEvents: true },
  loadStudentPreferences: vi.fn(),
  saveStudentPreferences: vi.fn(),
}));
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }));

vi.mock("../../hooks/useStudentAuth", () => ({ useStudentAuth: () => authState }));
vi.mock("../../services/naviBuddyPreferencesService", () => ({
  loadNaviBuddyAppearance: buddyService.load,
  saveNaviBuddyAppearance: buddyService.save,
}));
vi.mock("../../services/studentPreferencesService", () => studentPreferences);
vi.mock("../../hooks/useTheme", () => ({ useTheme: () => ({ theme: "light", preference: "system", setThemePreference: vi.fn() }) }));
vi.mock("../../hooks/useScrollReveal", () => ({ useScrollReveal: () => ({ ref: vi.fn(), visible: true }) }));
vi.mock("../../hooks/useToast", () => ({ useToast: () => toasts }));

import { IskolarMarkerArt } from "../../components/map/IskolarMarkerArt";
import { NaviBuddyProvider } from "../../contexts/NaviBuddyContext";
import { useNaviBuddyAppearance } from "../../contexts/NaviBuddyStore";
import { StudentSettingsPage } from "../StudentSettingsPage";

function MapAppearance() {
  const appearance = useNaviBuddyAppearance();
  return <div>
    <p data-testid="map-appearance">{appearance.outfit}:{appearance.backpack}</p>
    <svg><IskolarMarkerArt bearing={0} /></svg>
  </div>;
}

function SettingsMapJourney() {
  const [mapOpen, setMapOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setMapOpen(true)}>Map tab</button>
    {mapOpen ? <MapAppearance /> : <StudentSettingsPage />}
  </>;
}

function renderJourney() {
  return render(<MemoryRouter><NaviBuddyProvider><SettingsMapJourney /></NaviBuddyProvider></MemoryRouter>);
}

async function openStudio() {
  await screen.findByRole("tab", { name: "My NaviBuddy" });
  fireEvent.click(screen.getByRole("tab", { name: "My NaviBuddy" }));
  await screen.findByRole("radio", { name: "Classic" });
}

describe("Settings to Map NaviBuddy appearance flow", () => {
  beforeEach(() => {
    authState.profile = { id: "student-a" };
    authState.isStudent = true;
    authState.role = "student";
    buddyService.load.mockReset().mockResolvedValue(DEFAULT_NAVIBUDDY_APPEARANCE);
    buddyService.save.mockReset().mockImplementation(async (_id: string, _student: boolean, next: NaviBuddyAppearance) => next);
    studentPreferences.loadStudentPreferences.mockReset().mockResolvedValue({ mapUpdates: true, reportStatus: true, campusEvents: true });
    studentPreferences.saveStudentPreferences.mockReset().mockResolvedValue(undefined);
    Object.values(toasts).forEach((toast) => toast.mockClear());
    window.scrollTo = vi.fn();
  });

  afterEach(() => vi.restoreAllMocks());

  it("keeps the saved look active during a pending save, then synchronizes the marker after success", async () => {
    let resolveSave!: (appearance: NaviBuddyAppearance) => void;
    buddyService.save.mockImplementationOnce((_id: string, _student: boolean, next: NaviBuddyAppearance) => new Promise((resolve) => { resolveSave = () => resolve(next); }));
    renderJourney();
    await openStudio();

    const outfitGroup = within(screen.getByRole("radiogroup", { name: "NaviBuddy outfit" }));
    fireEvent.click(outfitGroup.getByRole("radio", { name: "Adventurer" }));
    const backpackGroup = within(screen.getByRole("radiogroup", { name: "NaviBuddy backpack" }));
    fireEvent.click(backpackGroup.getByRole("radio", { name: "Compact Backpack" }));
    expect(outfitGroup.getByRole("radio", { name: "Adventurer" })).toHaveAttribute("aria-checked", "true");

    fireEvent.click(screen.getByRole("button", { name: "Save Look" }));
    await waitFor(() => expect(buddyService.save).toHaveBeenCalledWith("student-a", true, { outfit: "adventurer", backpack: "compact", companionEnabled: true }));
    fireEvent.click(screen.getByRole("button", { name: "Map tab" }));
    expect(screen.getByTestId("map-appearance")).toHaveTextContent("classic:classic");

    await act(async () => { resolveSave({ outfit: "adventurer", backpack: "compact", companionEnabled: true }); });
    expect(screen.getByTestId("map-appearance")).toHaveTextContent("adventurer:compact");
    expect(document.querySelector('path[fill="#a77a43"]')).toBeInTheDocument();
  });

  it("keeps the prior map appearance on save failure and allows retry", async () => {
    buddyService.save.mockRejectedValueOnce(new Error("offline"));
    renderJourney();
    await openStudio();
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "NaviBuddy outfit" })).getByRole("radio", { name: "PLV Uniform" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Look" }));
    await waitFor(() => expect(toasts.error).toHaveBeenCalledWith("Look not saved"));
    expect(screen.getByRole("button", { name: "Save Look" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Map tab" }));
    expect(screen.getByTestId("map-appearance")).toHaveTextContent("classic:classic");
  });
});

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_NAVIBUDDY_APPEARANCE } from "../../lib/naviBuddy";

const auth = vi.hoisted(() => ({ profile: null as { id: string } | null, role: "student" as "student" | "student_org", isStudent: true, loading: false }));
vi.mock("../../hooks/useStudentAuth", () => ({ useStudentAuth: () => auth }));
vi.mock("../../services/naviBuddyPreferencesService", () => ({
  loadNaviBuddyAppearance: vi.fn().mockResolvedValue(DEFAULT_NAVIBUDDY_APPEARANCE),
  saveNaviBuddyAppearance: vi.fn().mockImplementation(async (_id, _student, value) => value),
}));

import { NaviBuddyProvider } from "../NaviBuddyContext";
import { useNaviBuddy } from "../NaviBuddyStore";
import { loadNaviBuddyAppearance, saveNaviBuddyAppearance } from "../../services/naviBuddyPreferencesService";

function Harness() {
  const { appearance, saveAppearance } = useNaviBuddy();
  return <><button onClick={() => void saveAppearance({ ...appearance, outfit: "adventurer" }).catch(() => {})}>Save Adventurer</button><span data-testid="outfit">{appearance.outfit}</span></>;
}

describe("NaviBuddy shared state", () => {
  beforeEach(() => {
    auth.profile = null;
    auth.role = "student";
    auth.isStudent = true;
    auth.loading = false;
    vi.mocked(loadNaviBuddyAppearance).mockReset().mockResolvedValue(DEFAULT_NAVIBUDDY_APPEARANCE);
    vi.mocked(saveNaviBuddyAppearance).mockReset().mockImplementation(async (_id, _student, value) => value);
  });
  afterEach(() => { vi.useRealTimers(); });

  it("keeps account-specific appearance out of a different or non-student session", async () => {
    auth.profile = { id: "student-a" };
    const { rerender } = render(<NaviBuddyProvider><Harness /></NaviBuddyProvider>);
    await act(async () => { await Promise.resolve(); });
    auth.profile = null;
    auth.isStudent = false;
    rerender(<NaviBuddyProvider><Harness /></NaviBuddyProvider>);
    expect(screen.getByText("classic")).toBeInTheDocument();
    auth.profile = null;
    auth.isStudent = true;
  });

  it("does not publish an appearance when persistence fails", async () => {
    auth.profile = { id: "student-a" };
    vi.mocked(loadNaviBuddyAppearance).mockResolvedValue({ ...DEFAULT_NAVIBUDDY_APPEARANCE, outfit: "casual" });
    vi.mocked(saveNaviBuddyAppearance).mockRejectedValue(new Error("offline"));
    render(<NaviBuddyProvider><Harness /></NaviBuddyProvider>);
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByRole("button", { name: "Save Adventurer" }));
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId("outfit")).toHaveTextContent("casual");
  });

  it("ignores a delayed preference load after the active account changes", async () => {
    let resolveStudentA!: (appearance: typeof DEFAULT_NAVIBUDDY_APPEARANCE) => void;
    vi.mocked(loadNaviBuddyAppearance).mockImplementation((userId) => userId === "student-a"
      ? new Promise((resolve) => { resolveStudentA = resolve; })
      : Promise.resolve({ ...DEFAULT_NAVIBUDDY_APPEARANCE, outfit: "plv_uniform" }));
    auth.profile = { id: "student-a" };
    const { rerender } = render(<NaviBuddyProvider><Harness /></NaviBuddyProvider>);
    auth.profile = { id: "student-b" };
    rerender(<NaviBuddyProvider><Harness /></NaviBuddyProvider>);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId("outfit")).toHaveTextContent("plv_uniform");
    await act(async () => { resolveStudentA({ ...DEFAULT_NAVIBUDDY_APPEARANCE, outfit: "adventurer" }); });
    expect(screen.getByTestId("outfit")).toHaveTextContent("plv_uniform");
  });

  it("rejects outfit saves for guest and non-student sessions", async () => {
    auth.profile = null;
    auth.isStudent = false;
    const { unmount } = render(<NaviBuddyProvider><Harness /></NaviBuddyProvider>);
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByRole("button", { name: "Save Adventurer" }));
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId("outfit")).toHaveTextContent("classic");
    expect(saveNaviBuddyAppearance).not.toHaveBeenCalled();
    unmount();
  });
});

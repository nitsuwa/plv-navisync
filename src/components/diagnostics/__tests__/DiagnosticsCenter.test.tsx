import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const auth = vi.hoisted(() => ({
  status: "authenticated",
  session: { user: { id: "admin" } },
  profile: { role: "admin", is_active: true },
}));

vi.mock("../../../contexts/StudentAuthContext", () => ({ useAuth: () => auth }));

import { DiagnosticsCenter } from "../DiagnosticsCenter";
import {
  clearDiagnosticEventsForTests,
  getMapDiagnosticContext,
  getRecentDiagnosticEvents,
  OPEN_DIAGNOSTICS_EVENT,
  recordDiagnosticEvent,
  setMapDiagnosticContext,
} from "../../../lib/diagnostics";

afterEach(() => {
  clearDiagnosticEventsForTests();
});

beforeEach(() => {
  auth.status = "authenticated";
  auth.session = { user: { id: "admin" } };
  auth.profile = { role: "admin", is_active: true };
});

describe("DiagnosticsCenter access and capture", () => {
  it("opens from the developer shortcut, captures the current route state, and closes without changing it", async () => {
    const context = {
      mapMode: "3D" as const,
      navigationState: "navigating",
      cameraMode: "follow",
      cameraRecovery: "failed" as const,
      campus: "Main Campus",
      selectedBuilding: "Canteen",
      floor: null,
      route: { start: "Campus Gate", destination: "Canteen", type: "standard", currentStep: 2, stepCount: 5 },
      routeStatus: "paused" as const,
      mapDataStatus: "ready" as const,
      context: "outdoor" as const,
      outdoorTransparency: "enabled" as const,
    };
    setMapDiagnosticContext(context);
    recordDiagnosticEvent({ category: "camera-recovery", severity: "error", summary: "Could not return to the route position." });
    render(<DiagnosticsCenter localUnlockEnabled />);

    fireEvent.keyDown(window, { key: "d", ctrlKey: true, shiftKey: true });
    expect(await screen.findByRole("dialog", { name: "Diagnostics Center" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "What happened?" }), { target: { value: "Camera recovery failed on route" } });
    fireEvent.click(screen.getByRole("button", { name: "Capture Bug Report" }));

    await screen.findByRole("textbox", { name: "Diagnostic summary" });
    expect((screen.getByRole("textbox", { name: "Diagnostic summary" }) as HTMLTextAreaElement).value).toContain("Campus Gate");
    expect((screen.getByRole("textbox", { name: "Diagnostic summary" }) as HTMLTextAreaElement).value).toContain("Could not return to the route position.");
    expect(screen.getByRole("status")).toHaveTextContent("Bug report captured");
    expect(getMapDiagnosticContext()).toEqual(context);
    expect(screen.getByRole("button", { name: "Download JSON" })).toBeEnabled();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Diagnostics Center" })).not.toBeInTheDocument();
  });

  it("opens from the keyboard shortcut for an active super administrator", async () => {
    auth.profile = { role: "super_admin", is_active: true };
    render(<DiagnosticsCenter localUnlockEnabled />);
    fireEvent.keyDown(window, { key: "d", metaKey: true, shiftKey: true });
    expect(await screen.findByRole("dialog", { name: "Diagnostics Center" })).toBeInTheDocument();
  });

  it("copies the captured summary and downloads sanitized JSON", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const createObjectURL = vi.fn(() => "blob:diagnostic-report");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(<DiagnosticsCenter localUnlockEnabled />);
    fireEvent.keyDown(window, { key: "d", ctrlKey: true, shiftKey: true });
    fireEvent.click(await screen.findByRole("button", { name: "Capture Bug Report" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Copy Debug Summary" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Copy Debug Summary" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining("PLV NAVISYNC BUG REPORT")));
    fireEvent.click(screen.getByRole("button", { name: "Download JSON" }));

    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:diagnostic-report");
    click.mockRestore();
    vi.unstubAllGlobals();
  });

  it("opens only the unlock dialog for unauthorized users", async () => {
    auth.profile = { role: "student", is_active: true };
    render(<DiagnosticsCenter localUnlockEnabled />);
    const shortcut = new KeyboardEvent("keydown", { key: "d", ctrlKey: true, shiftKey: true, cancelable: true });
    window.dispatchEvent(shortcut);
    window.dispatchEvent(new Event(OPEN_DIAGNOSTICS_EVENT));
    expect(shortcut.defaultPrevented).toBe(true);
    expect(await screen.findByRole("dialog", { name: "Developer Diagnostics" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Diagnostics Center" })).not.toBeInTheDocument();
  });

  it("rejects invalid developer credentials with a generic message and keeps the map authorization closed", async () => {
    auth.profile = { role: "student", is_active: true };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    render(<DiagnosticsCenter localUnlockEnabled />);
    fireEvent.keyDown(window, { key: "d", ctrlKey: true, shiftKey: true });
    fireEvent.change(screen.getByLabelText("Developer ID"), { target: { value: "unknown" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "invalid-test-value" } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock Diagnostics" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not unlock Diagnostics.");
    expect(screen.queryByRole("dialog", { name: "Diagnostics Center" })).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("does not activate while typing and cleans up its listeners on unmount", () => {
    const view = render(<DiagnosticsCenter />);
    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    document.body.append(input, textarea);
    fireEvent.keyDown(input, { key: "d", ctrlKey: true, shiftKey: true });
    fireEvent.keyDown(textarea, { key: "d", metaKey: true, shiftKey: true });
    expect(screen.queryByRole("dialog", { name: "Diagnostics Center" })).not.toBeInTheDocument();

    const before = getRecentDiagnosticEvents().length;
    view.unmount();
    window.dispatchEvent(new ErrorEvent("error", { message: "late error" }));
    expect(getRecentDiagnosticEvents()).toHaveLength(before);
    input.remove();
    textarea.remove();
  });
});

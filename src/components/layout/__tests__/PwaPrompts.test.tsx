import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MotionGlobalConfig } from "motion/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PwaState } from "../../../lib/pwa";
import { InstallAppBanner, PwaUpdateNotifier } from "../PwaPrompts";

const pwa = vi.hoisted(() => ({
  state: {} as PwaState,
  applyPwaUpdate: vi.fn(async () => {}),
  promptPwaInstall: vi.fn(async () => true),
}));

vi.mock("../../../lib/pwa", () => ({
  usePwaState: () => pwa.state,
  applyPwaUpdate: pwa.applyPwaUpdate,
  promptPwaInstall: pwa.promptPwaInstall,
}));

vi.mock("../../../hooks/useReducedMotion", () => ({ useReducedMotion: () => true }));

// Keep exit animations instant so removal waits only a frame.
MotionGlobalConfig.skipAnimations = true;

function setState(patch: Partial<PwaState>) {
  pwa.state = {
    updateReady: false,
    canInstall: false,
    isStandalone: false,
    manualInstall: null,
    online: true,
    ...patch,
  };
}

/** AnimatePresence removes exiting elements on Motion's real frame loop. */
async function expectRemoved(testId: string) {
  vi.useRealTimers();
  await waitFor(() => expect(screen.queryByTestId(testId)).not.toBeInTheDocument());
}

function renderBanner(path = "/") {
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <InstallAppBanner />
    </MemoryRouter>,
  );
  // The card waits a few seconds so it doesn't greet people on first paint.
  act(() => { vi.advanceTimersByTime(4100); });
  return view;
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  pwa.applyPwaUpdate.mockClear();
  pwa.promptPwaInstall.mockClear();
  setState({});
});

afterEach(() => {
  vi.useRealTimers();
});

describe("InstallAppBanner", () => {
  it("offers one-tap install when the browser provides a prompt", () => {
    setState({ canInstall: true, manualInstall: "android" });
    renderBanner();
    expect(screen.getByRole("dialog", { name: "PLV NaviSync" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /install app/i })).toBeInTheDocument();
    expect(screen.queryByText(/add to home screen/i)).not.toBeInTheDocument();
  });

  it("falls back to manual steps when no native prompt has arrived", () => {
    setState({ manualInstall: "android" });
    renderBanner();
    expect(screen.getByText(/install app/i, { selector: "span" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Got it" })).toBeInTheDocument();
  });

  it("does not advertise offline support, since map data needs Supabase", () => {
    setState({ canInstall: true });
    renderBanner();
    expect(screen.queryByText(/offline/i)).not.toBeInTheDocument();
  });

  it.each([
    ["the browser cannot install", {}, "/"],
    ["the app is already running installed", { canInstall: true, isStandalone: true }, "/"],
    ["the map needs the bottom of the screen", { canInstall: true }, "/map"],
    ["an event editor is open", { canInstall: true }, "/student/events/abc/edit"],
  ] as const)("stays hidden when %s", (_label, patch, path) => {
    setState(patch);
    renderBanner(path);
    expect(screen.queryByTestId("install-app-card")).not.toBeInTheDocument();
  });

  it("remembers a dismissal and stays hidden on the next visit", async () => {
    setState({ manualInstall: "desktop-chromium" });
    const { unmount } = renderBanner();
    fireEvent.click(screen.getByRole("button", { name: /dismiss install suggestion/i }));
    await expectRemoved("install-app-card");
    expect(localStorage.getItem("plv-install-dismissed-at")).not.toBeNull();
    unmount();

    vi.useFakeTimers();
    renderBanner();
    expect(screen.queryByTestId("install-app-card")).not.toBeInTheDocument();
  });

  it("hands the install to the browser prompt", async () => {
    setState({ canInstall: true });
    renderBanner();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /install app/i })); });
    expect(pwa.promptPwaInstall).toHaveBeenCalledTimes(1);
  });
});

describe("PwaUpdateNotifier", () => {
  it("stays out of the way until a new build is waiting", () => {
    render(<PwaUpdateNotifier />);
    expect(screen.queryByTestId("pwa-update-card")).not.toBeInTheDocument();
  });

  it("reloads into the new build only when asked", async () => {
    setState({ updateReady: true });
    render(<PwaUpdateNotifier />);
    expect(screen.getByRole("alertdialog")).toHaveTextContent("A new version of NaviSync is ready");
    expect(pwa.applyPwaUpdate).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /reload now/i })); });
    expect(pwa.applyPwaUpdate).toHaveBeenCalledTimes(1);
  });

  it("can be put off for the current visit", async () => {
    setState({ updateReady: true });
    render(<PwaUpdateNotifier />);
    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    await expectRemoved("pwa-update-card");
    expect(pwa.applyPwaUpdate).not.toHaveBeenCalled();
  });
});

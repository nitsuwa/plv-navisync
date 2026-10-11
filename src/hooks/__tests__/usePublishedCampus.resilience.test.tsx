import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Campus } from "../../components/map-builder/types";
import { DEFAULT_PUBLIC_PLATFORM_SETTINGS } from "../../services/settingsService";
import { usePublishedCampus } from "../usePublishedCampus";

const mocks = vi.hoisted(() => ({
  listPublishedSnapshots: vi.fn(),
  list: vi.fn(),
  listComingSoon: vi.fn(),
  loadStructure: vi.fn(),
  getSettings: vi.fn(),
}));

vi.mock("../../contexts/StudentAuthContext", () => ({
  useAuth: () => ({ session: null, profile: null }),
}));

vi.mock("../../services/campusService", () => ({
  campusService: {
    listPublishedSnapshots: mocks.listPublishedSnapshots,
    list: mocks.list,
    listComingSoon: mocks.listComingSoon,
  },
}));

vi.mock("../../services/campusStructureService", () => ({
  campusStructureService: { load: mocks.loadStructure },
}));

vi.mock("../../services/settingsService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/settingsService")>();
  return {
    ...actual,
    settingsService: { ...actual.settingsService, getPublicPlatformSettings: mocks.getSettings },
  };
});

const campus = {
  id: "published-campus",
  name: "PLV Main Campus",
  isDefault: true,
  lifecycleStatus: "published",
  publishStatus: "published",
} as unknown as Campus;

describe("published campus refresh resilience", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    mocks.getSettings.mockResolvedValue(DEFAULT_PUBLIC_PLATFORM_SETTINGS);
    mocks.listPublishedSnapshots.mockResolvedValue([campus]);
    mocks.list.mockResolvedValue([]);
    mocks.listComingSoon.mockResolvedValue([]);
    mocks.loadStructure.mockImplementation((value: Campus) => Promise.resolve(value));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the last good campus when a background snapshot refresh times out", async () => {
    const { result } = renderHook(() => usePublishedCampus());
    await waitFor(() => expect(result.current.activeCampus?.id).toBe(campus.id));
    mocks.listPublishedSnapshots.mockRejectedValueOnce({ code: "57014", message: "statement timeout" });

    await act(async () => { await result.current.refetch(); });

    expect(result.current.activeCampus?.id).toBe(campus.id);
    expect(result.current.campuses).toHaveLength(1);
    expect(result.current.isCached).toBe(true);
    expect(result.current.error).toBeNull();
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("keeps failed cached refreshes out of loading, bounds resume retries, and allows manual refresh", async () => {
    const baseTime = 1_700_000_000_000;
    const now = vi.spyOn(Date, "now").mockReturnValue(baseTime);
    const visibilityDescriptor = Object.getOwnPropertyDescriptor(document, "visibilityState");
    const setVisibility = (visibilityState: DocumentVisibilityState) => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: visibilityState });
      act(() => document.dispatchEvent(new Event("visibilitychange")));
    };

    try {
      const { result } = renderHook(() => usePublishedCampus());
      await waitFor(() => expect(result.current.activeCampus?.id).toBe(campus.id));
      mocks.listPublishedSnapshots.mockRejectedValueOnce({ code: "57014", message: "statement timeout" });

      await act(async () => { await result.current.refetch(); });

      expect(result.current.activeCampus?.id).toBe(campus.id);
      expect(result.current.loading).toBe(false);
      expect(result.current.isCached).toBe(true);
      expect(mocks.listPublishedSnapshots).toHaveBeenCalledTimes(2);

      now.mockReturnValue(baseTime + 20_000);
      setVisibility("hidden");
      now.mockReturnValue(baseTime + 40_000);
      setVisibility("visible");
      await act(async () => { await Promise.resolve(); });

      // A quick return after the failure must not start another request.
      expect(mocks.listPublishedSnapshots).toHaveBeenCalledTimes(2);
      expect(result.current.loading).toBe(false);
      expect(result.current.activeCampus?.id).toBe(campus.id);

      now.mockReturnValue(baseTime + 50_000);
      setVisibility("hidden");
      now.mockReturnValue(baseTime + 70_000);
      mocks.listPublishedSnapshots.mockRejectedValueOnce({ code: "57014", message: "statement timeout" });
      setVisibility("visible");
      await waitFor(() => expect(mocks.listPublishedSnapshots).toHaveBeenCalledTimes(3));
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
      expect(result.current.loading).toBe(false);
      expect(result.current.activeCampus?.id).toBe(campus.id);

      now.mockReturnValue(baseTime + 180_000);
      setVisibility("hidden");
      now.mockReturnValue(baseTime + 200_000);
      mocks.listPublishedSnapshots.mockRejectedValueOnce({ code: "57014", message: "statement timeout" });
      setVisibility("visible");
      await waitFor(() => expect(mocks.listPublishedSnapshots).toHaveBeenCalledTimes(4));
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
      expect(result.current.loading).toBe(false);

      now.mockReturnValue(baseTime + 500_000);
      setVisibility("hidden");
      now.mockReturnValue(baseTime + 520_000);
      setVisibility("visible");
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
      expect(mocks.listPublishedSnapshots).toHaveBeenCalledTimes(4);

      // Explicit user retries are never blocked by the automatic retry cap.
      await act(async () => { await result.current.refetch(); });
      expect(mocks.listPublishedSnapshots).toHaveBeenCalledTimes(5);
      expect(result.current.loading).toBe(false);
      expect(result.current.isCached).toBe(false);
      expect(result.current.activeCampus?.id).toBe(campus.id);
    } finally {
      now.mockRestore();
      if (visibilityDescriptor) Object.defineProperty(document, "visibilityState", visibilityDescriptor);
      else delete (document as { visibilityState?: DocumentVisibilityState }).visibilityState;
    }
  });

  it("keeps the active published campus object graph stable when a resume refresh has no newer revision", async () => {
    const { result } = renderHook(() => usePublishedCampus());
    await waitFor(() => expect(result.current.activeCampus?.id).toBe(campus.id));
    const existingListing = result.current.campuses;
    mocks.listPublishedSnapshots.mockResolvedValueOnce([{ ...campus } as Campus]);

    await act(async () => { await result.current.refetch(); });

    expect(result.current.campuses).toBe(existingListing);
    expect(result.current.activeCampus).toBe(existingListing[0]);
  });

  it("shows a retryable generic error when the first campus load times out", async () => {
    mocks.listPublishedSnapshots.mockRejectedValueOnce({ code: "57014", message: "canceling statement due to statement timeout" });

    const { result } = renderHook(() => usePublishedCampus());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.activeCampus).toBeNull();
    expect(result.current.isEmpty).toBe(true);
    expect(result.current.error).toBe("We couldn't load the campus map right now. Please try again.");
    expect(result.current.error).not.toContain("57014");
    expect(result.current.error).not.toContain("statement timeout");
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("keeps the legacy campus-list fallback for a missing snapshot relation", async () => {
    mocks.listPublishedSnapshots.mockRejectedValueOnce({ code: "42P01", message: "relation missing" });
    mocks.list.mockResolvedValueOnce([campus]);

    const { result } = renderHook(() => usePublishedCampus());
    await waitFor(() => expect(result.current.activeCampus?.id).toBe(campus.id));

    expect(mocks.list).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
  });
});

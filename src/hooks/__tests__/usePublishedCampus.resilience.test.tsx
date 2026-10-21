import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Campus } from "../../components/map-builder/types";
import { DEFAULT_PUBLIC_PLATFORM_SETTINGS } from "../../services/settingsService";
import { resetPublishedCampusDirectoryThrottle, usePublishedCampus } from "../usePublishedCampus";

const mocks = vi.hoisted(() => ({
  listPublishedSnapshots: vi.fn(),
  listPublishedVersionStatus: vi.fn(),
  listComingSoon: vi.fn(),
  getSettings: vi.fn(),
}));

vi.mock("../../contexts/StudentAuthContext", () => ({
  useAuthUserId: () => null,
}));

vi.mock("../../services/campusService", () => ({
  campusService: {
    listPublishedSnapshots: mocks.listPublishedSnapshots,
    listPublishedVersionStatus: mocks.listPublishedVersionStatus,
    listComingSoon: mocks.listComingSoon,
  },
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
  publishedAt: "2026-10-01T00:00:00.000Z",
} as unknown as Campus;

const status = (versionId = "version-1") => [{
  campus_id: campus.id,
  latest_published_version_id: versionId,
  published_at: "2026-10-01T00:00:00.000Z",
}];

async function flushPromises(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("published campus version refresh", () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetPublishedCampusDirectoryThrottle();
    vi.clearAllMocks();
    mocks.getSettings.mockResolvedValue(DEFAULT_PUBLIC_PLATFORM_SETTINGS);
    mocks.listPublishedVersionStatus.mockResolvedValue(status());
    mocks.listPublishedSnapshots.mockResolvedValue([campus]);
    mocks.listComingSoon.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("loads one sanitized snapshot on a cold start and stores it under the published version", async () => {
    const { result } = renderHook(() => usePublishedCampus());

    await waitFor(() => expect(result.current.activeCampus?.id).toBe(campus.id));

    expect(mocks.listPublishedVersionStatus).toHaveBeenCalledTimes(1);
    expect(mocks.listPublishedSnapshots).toHaveBeenCalledTimes(1);
    const cached = JSON.parse(sessionStorage.getItem("plv_published_campuses_version_cache_v2") ?? "{}");
    expect(cached.schemaVersion).toBe(2);
    expect(cached.snapshots).toMatchObject([{
      campusId: campus.id,
      versionId: "version-1",
      campus: { id: campus.id },
    }]);
  });

  it("does not fetch or replace the campus object when manual refresh sees an unchanged version", async () => {
    const { result } = renderHook(() => usePublishedCampus());
    await waitFor(() => expect(result.current.activeCampus?.id).toBe(campus.id));
    const currentCampus = result.current.activeCampus;

    await act(async () => { await result.current.refetch(); });

    expect(mocks.listPublishedVersionStatus).toHaveBeenCalledTimes(2);
    expect(mocks.listPublishedSnapshots).toHaveBeenCalledTimes(1);
    expect(result.current.activeCampus).toBe(currentCampus);
  });

  it("checks metadata across three polling intervals without repeating the full snapshot RPC", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => usePublishedCampus());
    await flushPromises();
    expect(result.current.activeCampus?.id).toBe(campus.id);

    for (let interval = 0; interval < 3; interval += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
        await Promise.resolve();
        await Promise.resolve();
      });
    }

    expect(mocks.listPublishedVersionStatus).toHaveBeenCalledTimes(4);
    expect(mocks.listPublishedSnapshots).toHaveBeenCalledTimes(1);
    expect(result.current.activeCampus?.id).toBe(campus.id);
  });

  it("does not drop a scheduled metadata poll when timer drift reaches the throttle boundary", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => usePublishedCampus());
    await flushPromises();
    expect(result.current.activeCampus?.id).toBe(campus.id);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.listPublishedVersionStatus).toHaveBeenCalledTimes(2);

    // Simulate the browser timer firing a few hundred milliseconds before
    // the global duplicate-request guard reaches its exact 60-second cutoff.
    vi.setSystemTime(Date.now() - 500);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.listPublishedVersionStatus).toHaveBeenCalledTimes(3);
    expect(mocks.listPublishedSnapshots).toHaveBeenCalledTimes(1);
  });

  it("fetches exactly one new sanitized snapshot after the version id changes", async () => {
    const updatedCampus = { ...campus, name: "Updated Main Campus" } as Campus;
    mocks.listPublishedSnapshots.mockResolvedValueOnce([campus]).mockResolvedValueOnce([updatedCampus]);
    const { result } = renderHook(() => usePublishedCampus());
    await waitFor(() => expect(result.current.activeCampus?.name).toBe(campus.name));

    mocks.listPublishedVersionStatus.mockResolvedValue(status("version-2"));
    await act(async () => { await result.current.refetch(); });

    expect(mocks.listPublishedSnapshots).toHaveBeenCalledTimes(2);
    expect(result.current.activeCampus?.name).toBe("Updated Main Campus");
    expect(JSON.parse(sessionStorage.getItem("plv_published_campuses_version_cache_v2") ?? "{}").snapshots)
      .toMatchObject([{ versionId: "version-2", campus: { name: "Updated Main Campus" } }]);
  });

  it("preserves the working map silently when a background metadata check fails", async () => {
    const { result } = renderHook(() => usePublishedCampus());
    await waitFor(() => expect(result.current.activeCampus?.id).toBe(campus.id));
    const currentCampus = result.current.activeCampus;
    mocks.listPublishedVersionStatus.mockRejectedValueOnce({ code: "500", message: "temporary failure" });

    await act(async () => { await result.current.refetch(); });

    expect(result.current.activeCampus).toBe(currentCampus);
    expect(result.current.error).toBeNull();
    expect(mocks.listPublishedSnapshots).toHaveBeenCalledTimes(1);
  });

  it("keeps the last good map if the full snapshot fetch fails after a version change", async () => {
    const { result } = renderHook(() => usePublishedCampus());
    await waitFor(() => expect(result.current.activeCampus?.id).toBe(campus.id));
    const currentCampus = result.current.activeCampus;
    mocks.listPublishedVersionStatus.mockResolvedValue(status("version-2"));
    mocks.listPublishedSnapshots.mockRejectedValueOnce({ code: "500", message: "temporary failure" });

    await act(async () => { await result.current.refetch(); });

    expect(result.current.activeCampus).toBe(currentCampus);
    expect(result.current.error).toBeNull();
    expect(mocks.listPublishedSnapshots).toHaveBeenCalledTimes(2);
  });

  it("coalesces initial status and full-snapshot requests across mounted consumers", async () => {
    const first = renderHook(() => usePublishedCampus());
    const second = renderHook(() => usePublishedCampus());

    await waitFor(() => {
      expect(first.result.current.activeCampus?.id).toBe(campus.id);
      expect(second.result.current.activeCampus?.id).toBe(campus.id);
    });

    expect(mocks.listPublishedVersionStatus).toHaveBeenCalledTimes(1);
    expect(mocks.listPublishedSnapshots).toHaveBeenCalledTimes(1);
    expect(mocks.listComingSoon).toHaveBeenCalledTimes(1);
  });

  it("invalidates the removed campus cache without refetching surviving snapshots", async () => {
    const { result } = renderHook(() => usePublishedCampus());
    await waitFor(() => expect(result.current.activeCampus?.id).toBe(campus.id));
    mocks.listPublishedVersionStatus.mockResolvedValue([]);

    await act(async () => { await result.current.refetch(); });

    expect(result.current.campuses).toEqual([]);
    expect(mocks.listPublishedSnapshots).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sessionStorage.getItem("plv_published_campuses_version_cache_v2") ?? "{}").snapshots).toEqual([]);
  });

  it("does not use the full snapshot RPC when the initial metadata request fails", async () => {
    mocks.listPublishedVersionStatus.mockRejectedValueOnce({ code: "500", message: "temporary failure" });
    const { result } = renderHook(() => usePublishedCampus());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.activeCampus).toBeNull();
    expect(result.current.error).toBe("We couldn't load the campus map right now. Please try again.");
    expect(mocks.listPublishedSnapshots).not.toHaveBeenCalled();
  });

  it("reuses a persisted snapshot only when its cached version matches current metadata", async () => {
    const first = renderHook(() => usePublishedCampus());
    await waitFor(() => expect(first.result.current.activeCampus?.id).toBe(campus.id));
    first.unmount();

    resetPublishedCampusDirectoryThrottle();
    mocks.listPublishedSnapshots.mockClear();
    const second = renderHook(() => usePublishedCampus());
    await waitFor(() => expect(second.result.current.activeCampus?.id).toBe(campus.id));

    expect(mocks.listPublishedVersionStatus).toHaveBeenCalledTimes(2);
    expect(mocks.listPublishedSnapshots).not.toHaveBeenCalled();
  });
});

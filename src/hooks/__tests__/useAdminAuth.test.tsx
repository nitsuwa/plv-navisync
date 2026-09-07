import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  maybeSingle: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock("../../lib/supabase", () => ({
  isConnected: true,
  supabase: {
    auth: {
      getUser: mocks.getUser,
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange,
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: mocks.maybeSingle })),
      })),
    })),
  },
}));

import { useAdminAuth } from "../useAdminAuth";

const session = { user: { id: "admin-1" } };
const profile = {
  id: "admin-1",
  role: "admin",
  is_active: true,
  email: "admin@example.test",
};

describe("useAdminAuth lifecycle stability", () => {
  let authListener: ((event: string, nextSession: typeof session | null) => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    authListener = undefined;
    mocks.onAuthStateChange.mockImplementation((callback: typeof authListener) => {
      authListener = callback;
      return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
    });
    mocks.getUser.mockResolvedValue({ data: { user: session.user }, error: null });
    mocks.getSession.mockResolvedValue({ data: { session }, error: null });
    mocks.maybeSingle.mockResolvedValue({ data: profile, error: null });
  });

  it("restores the persisted session through getSession without an initial getUser race", async () => {
    mocks.getUser.mockRejectedValue(new Error("Auth session missing!"));

    const { result } = renderHook(() => useAdminAuth());

    await waitFor(() => expect(result.current.isAdmin).toBe(true));
    expect(mocks.getSession).toHaveBeenCalled();
    expect(result.current.profile).toEqual(profile);
  });

  it("keeps auth initializing when INITIAL_SESSION is null before a delayed session restore", async () => {
    let resolveSession: ((value: { data: { session: typeof session } | { session: null }; error: null }) => void) | undefined;
    mocks.getSession.mockImplementationOnce(() => new Promise((resolve) => {
      resolveSession = resolve;
    }));

    const { result } = renderHook(() => useAdminAuth());

    await act(async () => {
      authListener?.("INITIAL_SESSION", null);
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.status).toBe("initializing");
    expect(result.current.profile).toBeNull();
    expect(mocks.getUser).not.toHaveBeenCalled();

    await act(async () => {
      resolveSession?.({ data: { session }, error: null });
    });

    await waitFor(() => expect(result.current.isAdmin).toBe(true));
    expect(result.current.status).toBe("authenticated");
    expect(result.current.profile).toEqual(profile);
  });

  it("does not let focus revalidation race the initial administrator profile check", async () => {
    let resolveProfile: ((value: { data: typeof profile; error: null }) => void) | undefined;
    mocks.maybeSingle.mockImplementationOnce(() => new Promise((resolve) => {
      resolveProfile = resolve;
    }));

    const { result } = renderHook(() => useAdminAuth());
    await waitFor(() => expect(mocks.getSession).toHaveBeenCalled());

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.status).toBe("initializing");
    expect(mocks.getUser).not.toHaveBeenCalled();

    await act(async () => {
      resolveProfile?.({ data: profile, error: null });
    });
    await waitFor(() => expect(result.current.status).toBe("authenticated"));
  });

  it("keeps a valid admin mounted when focus/visibility revalidation has a transient error", async () => {
    const { result } = renderHook(() => useAdminAuth());
    await waitFor(() => expect(result.current.isAdmin).toBe(true));

    mocks.getUser.mockResolvedValue({ data: { user: session.user }, error: new Error("network briefly unavailable") });
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(result.current.isAdmin).toBe(true);
    expect(result.current.profile).toEqual(profile);
    expect(result.current.loading).toBe(false);
  });

  it("keeps the current admin during a token refresh profile-query failure", async () => {
    const { result } = renderHook(() => useAdminAuth());
    await waitFor(() => expect(result.current.isAdmin).toBe(true));

    mocks.maybeSingle.mockResolvedValue({ data: null, error: new Error("temporary profile timeout") });
    await act(async () => {
      authListener?.("TOKEN_REFRESHED", session);
    });

    expect(result.current.isAdmin).toBe(true);
    expect(result.current.profile).toEqual(profile);
  });

  it("keeps the current admin for a non-authoritative null-session notification", async () => {
    const { result } = renderHook(() => useAdminAuth());
    await waitFor(() => expect(result.current.isAdmin).toBe(true));

    await act(async () => {
      authListener?.("TOKEN_REFRESHED", null);
    });

    expect(result.current.isAdmin).toBe(true);
    expect(result.current.profile).toEqual(profile);
    expect(result.current.loading).toBe(false);
  });

  it("still clears the editor gate on an explicit sign-out", async () => {
    const { result } = renderHook(() => useAdminAuth());
    await waitFor(() => expect(result.current.isAdmin).toBe(true));
    expect(mocks.onAuthStateChange).toHaveBeenCalled();
    expect(authListener).toBeTypeOf("function");

    await act(async () => {
      authListener?.("SIGNED_OUT", null);
    });

    await waitFor(() => {
      expect(result.current.isAdmin).toBe(false);
      expect(result.current.profile).toBeNull();
      expect(result.current.status).toBe("unauthenticated");
    });
  });

  it("does not restore a stale profile from a request that finishes after sign-out", async () => {
    const { result } = renderHook(() => useAdminAuth());
    await waitFor(() => expect(result.current.isAdmin).toBe(true));

    let resolveLateProfile: ((value: { data: typeof profile | null; error: Error | null }) => void) | undefined;
    mocks.maybeSingle.mockImplementationOnce(() => new Promise((resolve) => {
      resolveLateProfile = resolve;
    }));

    await act(async () => {
      authListener?.("TOKEN_REFRESHED", session);
    });
    await act(async () => {
      authListener?.("SIGNED_OUT", null);
    });
    resolveLateProfile?.({ data: profile, error: null });

    await waitFor(() => {
      expect(result.current.isAdmin).toBe(false);
      expect(result.current.profile).toBeNull();
    });
  });
});

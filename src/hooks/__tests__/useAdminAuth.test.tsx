import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  onAuthStateChange: vi.fn(),
  maybeSingle: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock("../../lib/supabase", () => ({
  isConnected: true,
  supabase: {
    auth: {
      getUser: mocks.getUser,
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
    mocks.maybeSingle.mockResolvedValue({ data: profile, error: null });
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
    });
  });
});

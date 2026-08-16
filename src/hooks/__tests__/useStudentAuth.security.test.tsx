import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    profile: {
      id: "student-1",
      email: "student@example.test",
      role: "student",
      first_name: "Test",
      last_name: "Student",
      is_active: true,
    },
    authError: null as Error | null,
  };

  const maybeSingle = vi.fn(async () => ({ data: { ...state.profile }, error: null }));
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  const unsubscribe = vi.fn();
  const getUser = vi.fn(async () => state.authError
    ? { data: { user: null }, error: state.authError }
    : { data: { user: { id: "student-1" } }, error: null });

  return {
    state,
    from,
    select,
    eq,
    maybeSingle,
    getUser,
    unsubscribe,
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe } } })),
    signOut: vi.fn(async () => ({ error: null })),
  };
});

vi.mock("../../lib/supabase", () => ({
  isConnected: true,
  supabase: {
    auth: {
      getUser: mocks.getUser,
      onAuthStateChange: mocks.onAuthStateChange,
      signOut: mocks.signOut,
    },
    from: mocks.from,
  },
}));

import { useStudentAuth } from "../useStudentAuth";

describe("useStudentAuth security revalidation", () => {
  beforeEach(() => {
    mocks.state.profile.is_active = true;
    mocks.state.authError = null;
    vi.clearAllMocks();
  });

  it("drops student authorization when the live profile is deactivated", async () => {
    const { result, unmount } = renderHook(() => useStudentAuth());

    await waitFor(() => expect(result.current.isStudent).toBe(true));
    expect(result.current.profile?.is_active).toBe(true);

    mocks.state.profile.is_active = false;
    act(() => window.dispatchEvent(new Event("focus")));

    await waitFor(() => expect(result.current.isStudent).toBe(false));
    expect(result.current.profile?.is_active).toBe(false);
    unmount();
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  });

  it("clears the profile when server-side identity validation fails", async () => {
    const { result } = renderHook(() => useStudentAuth());
    await waitFor(() => expect(result.current.isStudent).toBe(true));

    mocks.state.authError = new Error("expired session");
    act(() => window.dispatchEvent(new Event("focus")));

    await waitFor(() => expect(result.current.profile).toBeNull());
    expect(result.current.isStudent).toBe(false);
    expect(result.current.loading).toBe(false);
  });
});

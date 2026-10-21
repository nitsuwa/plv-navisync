import { describe, expect, it } from "vitest";
import {
  student3dCameraFollowOffsetForContext,
  student3dCameraRecenterCompletionMatches,
  student3dCameraRecenterNonceForContext,
  student3dCameraRecenterNonceToHandle,
} from "../student3dCameraRecenter";

describe("student 3D camera recenter ownership", () => {
  it("only hands a saved Follow offset to its own canonical renderer context", () => {
    const followOffset: [number, number, number] = [4, 8, 9];
    const request = { nonce: 8, contextKey: "caba:6", followOffset };

    expect(student3dCameraFollowOffsetForContext(request, "caba:6")).toEqual(followOffset);
    expect(student3dCameraFollowOffsetForContext(request, "caba:5")).toBeNull();
    expect(student3dCameraFollowOffsetForContext(request, "campus")).toBeNull();
  });

  it("sends a pending recenter only to the renderer that owns its context", () => {
    const request = { nonce: 8, contextKey: "caba:6" };

    expect(student3dCameraRecenterNonceForContext(request, "caba:6")).toBe(8);
    expect(student3dCameraRecenterNonceForContext(request, "campus")).toBe(0);
  });

  it("rejects stale or wrong-context renderer completions", () => {
    const request = { nonce: 8, contextKey: "caba:6" };

    expect(student3dCameraRecenterCompletionMatches(request, 8, "caba:6")).toBe(true);
    expect(student3dCameraRecenterCompletionMatches(request, 7, "caba:6")).toBe(false);
    expect(student3dCameraRecenterCompletionMatches(request, 8, "campus")).toBe(false);
    expect(student3dCameraRecenterCompletionMatches(null, 8, "caba:6")).toBe(false);
  });

  it("handles a request already present when a renderer mounts, then ignores repeats", () => {
    expect(student3dCameraRecenterNonceToHandle(8, 0)).toBe(8);
    expect(student3dCameraRecenterNonceToHandle(8, 8)).toBeNull();
    expect(student3dCameraRecenterNonceToHandle(7, 8)).toBeNull();
  });
});

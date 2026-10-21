import type { Student3dCameraOffset } from "./student3dCameraPose";

export interface Student3dCameraRecenterRequest {
  nonce: number;
  contextKey: string;
  followOffset?: Student3dCameraOffset | null;
}

/** A renderer may act on a recenter request only when it owns that map context. */
export function student3dCameraRecenterNonceForContext(
  request: Student3dCameraRecenterRequest | null | undefined,
  contextKey: string,
): number {
  return request?.contextKey === contextKey ? request.nonce : 0;
}

/** A saved Follow offset may only move with its original renderer context. */
export function student3dCameraFollowOffsetForContext(
  request: Student3dCameraRecenterRequest | null | undefined,
  contextKey: string,
): Student3dCameraOffset | null {
  return request?.contextKey === contextKey ? request.followOffset ?? null : null;
}

/** Ignore stale completion callbacks from an inactive renderer or older request. */
export function student3dCameraRecenterCompletionMatches(
  request: Student3dCameraRecenterRequest | null | undefined,
  nonce: number,
  contextKey: string,
): boolean {
  return Boolean(request && request.nonce === nonce && request.contextKey === contextKey);
}

/** Process an initial request on mount as well as later requests exactly once. */
export function student3dCameraRecenterNonceToHandle(
  requestedNonce: number,
  lastHandledNonce: number,
): number | null {
  return requestedNonce > 0 && requestedNonce > lastHandledNonce ? requestedNonce : null;
}

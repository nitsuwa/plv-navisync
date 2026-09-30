/** Same-origin, transient completion signals. Never include credentials or profile data. */
export type AuthLifecycleSignal = "EMAIL_VERIFIED" | "PASSWORD_RESET_COMPLETE";

const CHANNEL_NAME = "plv-navisync-auth-lifecycle";

export function publishAuthLifecycleSignal(signal: AuthLifecycleSignal): void {
  if (typeof BroadcastChannel === "undefined") return;
  try {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage({ type: signal });
    channel.close();
  } catch {
    // Auth itself remains complete even if this optional UX signal is unavailable.
  }
}

export function subscribeAuthLifecycleSignal(
  onSignal: (signal: AuthLifecycleSignal) => void,
): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};
  let channel: BroadcastChannel;
  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
  } catch {
    return () => {};
  }
  channel.onmessage = (event: MessageEvent<unknown>) => {
    const type = (event.data as { type?: unknown } | null)?.type;
    if (type === "EMAIL_VERIFIED" || type === "PASSWORD_RESET_COMPLETE") onSignal(type);
  };
  return () => channel.close();
}

import { useCallback, useEffect, useRef, useState } from "react";
import type { CampusEventOverlay } from "../components/map-builder/types";
import type { EventOrganizationContext } from "../types/eventOrganization";
import { eventOverlayService } from "../services/eventOverlayService";

const PAGE_SIZE = 100;
interface WorkspaceState {
  key: string;
  events: CampusEventOverlay[];
  total: number;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
}
const stateFor = (key: string, loading = true): WorkspaceState => ({ key, events: [], total: 0, loading, loadingMore: false, error: null });

/** Loads only server-authorized events for the current actor, organization, and grant. */
export function useOrganizationEventWorkspace(actorId: string | undefined, organization: EventOrganizationContext | null, enabled: boolean) {
  const key = enabled && actorId && organization ? `${actorId}:${organization.organizationId}:${organization.grantId}` : "";
  const organizationId = organization?.organizationId;
  const [state, setState] = useState<WorkspaceState>(() => stateFor(key, Boolean(key)));
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    if (!key || !organizationId) {
      ++generation.current;
      setState(stateFor("", false));
      return;
    }
    const request = ++generation.current;
    setState((previous) => previous.key === key ? { ...previous, loading: previous.events.length === 0, loadingMore: false, error: null } : stateFor(key));
    try {
      const result = await eventOverlayService.listOrganizationEvents(organizationId, { limit: PAGE_SIZE, offset: 0, includeArchived: false });
      if (request !== generation.current) return;
      setState({ key, events: result.events, total: result.total, loading: false, loadingMore: false, error: null });
    } catch (cause) {
      if (request !== generation.current) return;
      setState((previous) => ({ ...stateFor(key, false), events: previous.key === key ? previous.events : [], total: previous.key === key ? previous.total : 0, error: cause instanceof Error ? cause.message : "Organization event work could not be loaded. Reconnect and retry." }));
    }
  }, [key, organizationId]);

  useEffect(() => {
    void refresh();
    return () => { ++generation.current; };
  }, [refresh]);

  useEffect(() => {
    if (!key) return;
    const revalidate = () => { if (document.visibilityState !== "hidden") void refresh(); };
    const timer = window.setInterval(revalidate, 15_000);
    window.addEventListener("focus", revalidate);
    window.addEventListener("online", revalidate);
    document.addEventListener("visibilitychange", revalidate);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", revalidate);
      window.removeEventListener("online", revalidate);
      document.removeEventListener("visibilitychange", revalidate);
    };
  }, [key, refresh]);

  const loadMore = useCallback(async () => {
    if (!key || !organizationId || state.key !== key || state.events.length >= state.total || state.loadingMore) return;
    const request = generation.current;
    setState((previous) => previous.key === key ? { ...previous, loadingMore: true, error: null } : previous);
    try {
      const result = await eventOverlayService.listOrganizationEvents(organizationId, { limit: PAGE_SIZE, offset: state.events.length, includeArchived: false });
      if (request !== generation.current) return;
      setState((previous) => previous.key === key ? { ...previous, events: [...previous.events, ...result.events.filter((item) => !previous.events.some((old) => old.id === item.id))], total: result.total, loadingMore: false, error: null } : previous);
    } catch (cause) {
      if (request === generation.current) setState((previous) => previous.key === key ? { ...previous, loadingMore: false, error: cause instanceof Error ? cause.message : "More event work could not be loaded. Retry." } : previous);
    }
  }, [key, organizationId, state]);

  const visible = state.key === key && key ? state : stateFor(key, Boolean(key));
  return { ...visible, refresh, loadMore };
}

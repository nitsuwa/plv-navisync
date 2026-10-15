import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EventOrganizationContext } from "../types/eventOrganization";
import { eventOrganizationService } from "../services/eventOrganizationService";

interface AccessState {
  actorId: string | undefined;
  organizations: EventOrganizationContext[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
}

const initialState = (actorId?: string): AccessState => ({ actorId, organizations: [], loading: Boolean(actorId), refreshing: false, error: null });

/** Keeps the protected workspace tied to the server-confirmed representative grant. */
export function useEventOrganizationAccess(actorId: string | undefined, enabled: boolean) {
  const [state, setState] = useState<AccessState>(() => initialState(actorId));
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(null);
  const requestId = useRef(0);
  const lastActivationRefreshAt = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (!actorId || !enabled) {
      ++requestId.current;
      setState(initialState(actorId));
      return;
    }
    const request = ++requestId.current;
    setState((previous) => previous.actorId === actorId
      ? { ...previous, loading: previous.organizations.length === 0, refreshing: true, error: null }
      : { ...initialState(actorId), refreshing: true });
    try {
      const organizations = await eventOrganizationService.listMyEventOrganizations();
      if (request !== requestId.current) return;
      setState({ actorId, organizations, loading: false, refreshing: false, error: null });
      setSelectedOrganizationId((selected) => organizations.some((organization) => organization.organizationId === selected) ? selected : null);
    } catch (cause) {
      if (request !== requestId.current) return;
      setState((previous) => ({
        actorId,
        organizations: previous.actorId === actorId ? previous.organizations : [],
        loading: false,
        refreshing: false,
        error: cause instanceof Error ? cause.message : "Organization access could not be checked. Reconnect and retry.",
      }));
    }
  }, [actorId, enabled]);

  useEffect(() => {
    void refresh();
    return () => { ++requestId.current; };
  }, [refresh]);

  useEffect(() => {
    if (!actorId || !enabled) return;
    const revalidate = () => {
      if (document.visibilityState === "hidden") return;
      void refresh();
    };
    const revalidateOnActivation = () => {
      if (document.visibilityState === "hidden") return;
      const now = Date.now();
      if (lastActivationRefreshAt.current !== null && now - lastActivationRefreshAt.current < 250) return;
      lastActivationRefreshAt.current = now;
      void refresh();
    };
    const timer = window.setInterval(revalidate, 30_000);
    window.addEventListener("focus", revalidateOnActivation);
    window.addEventListener("online", revalidate);
    document.addEventListener("visibilitychange", revalidateOnActivation);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", revalidateOnActivation);
      window.removeEventListener("online", revalidate);
      document.removeEventListener("visibilitychange", revalidateOnActivation);
    };
  }, [actorId, enabled, refresh]);

  const organizations = state.actorId === actorId && enabled ? state.organizations : [];
  const organization = useMemo(() => {
    if (organizations.length === 1) return organizations[0];
    if (!selectedOrganizationId) return null;
    return organizations.find((entry) => entry.organizationId === selectedOrganizationId) ?? null;
  }, [organizations, selectedOrganizationId]);
  const selectOrganization = useCallback((id: string) => {
    if (organizations.some((entry) => entry.organizationId === id)) setSelectedOrganizationId(id);
    else setSelectedOrganizationId(null);
  }, [organizations]);

  return {
    organizations,
    organization,
    selectedOrganizationId: organization?.organizationId ?? null,
    selectOrganization,
    loading: state.actorId !== actorId || (enabled && state.loading),
    refreshing: state.actorId === actorId && state.refreshing,
    error: state.actorId === actorId ? state.error : null,
    refresh,
  };
}

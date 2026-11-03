"use client";

import { useCallback, useEffect, useState } from "react";
import {
  demoConnectionRegistry,
  type OrganizationConnectionId,
  type OrganizationConnectionRegistry,
} from "@/lib/organization-connections.types";

export const organizationConnectionsChanged =
  "servicebuddy-organization-connections-changed";

export function notifyOrganizationConnectionsChanged() {
  window.dispatchEvent(new Event(organizationConnectionsChanged));
}

export function useOrganizationConnections(demo: boolean) {
  const [registry, setRegistry] =
    useState<OrganizationConnectionRegistry | null>(
      demo ? demoConnectionRegistry() : null,
    );
  const [loading, setLoading] = useState(!demo);
  const [error, setError] = useState("");

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (demo) {
        setRegistry(demoConnectionRegistry());
        setLoading(false);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/connections/status", {
          cache: "no-store",
          signal,
        });
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error || "Could not check connections.");
        if (!signal?.aborted) setRegistry(body);
      } catch (caught) {
        if (!signal?.aborted)
          setError(
            caught instanceof Error
              ? caught.message
              : "Could not check connections.",
          );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [demo],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void refresh(controller.signal), 0);
    const reload = () => void refresh();
    window.addEventListener(organizationConnectionsChanged, reload);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
      window.removeEventListener(organizationConnectionsChanged, reload);
    };
  }, [refresh]);

  return { registry, loading, error, refresh };
}

export function useOrganizationConnection(
  id: OrganizationConnectionId,
  demo: boolean,
) {
  const result = useOrganizationConnections(demo);
  return {
    ...result,
    capability: result.registry?.capabilities[id] || null,
  };
}

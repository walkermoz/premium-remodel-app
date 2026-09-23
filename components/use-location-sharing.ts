"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@/lib/types";
import type { SharedLocation } from "@/lib/location";

async function locationRequest(data: Record<string, unknown>) {
  const response = await fetch("/api/locations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok)
    throw Object.assign(
      new Error(result.error || "Could not update location sharing."),
      { status: response.status },
    );
}
function positionData(position: GeolocationPosition): SharedLocation {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    capturedAt: new Date(position.timestamp).toISOString(),
  };
}
const sampleLocation = (): SharedLocation => ({
  latitude: 35.7796,
  longitude: -78.6382,
  accuracy: 18,
  capturedAt: new Date().toISOString(),
});
const options: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 15000,
  timeout: 20000,
};
export function useLocationSharing(user: User, demo: boolean) {
  const key = `premium-remodel-location:${user.id}`;
  const [sharing, setSharing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pendingStop, setPendingStop] = useState(false);
  const [lastLocation, setLastLocation] = useState<SharedLocation | null>(null);
  const session = useRef<string | null>(null);
  const stopping = useRef<string | null>(null);
  const watch = useRef<number | null>(null);
  const lastSend = useRef(0);
  const sending = useRef(false);
  const starting = useRef(false);
  const remember = useCallback(
    (value: { session: string; stopping?: boolean } | null) => {
      try {
        if (value) sessionStorage.setItem(key, JSON.stringify(value));
        else sessionStorage.removeItem(key);
      } catch {
        /* Sharing still works without browser storage. */
      }
    },
    [key],
  );
  const clearWatch = useCallback(() => {
    if (watch.current !== null && navigator.geolocation)
      navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
  }, []);
  const finishStop = useCallback(
    async (id: string) => {
      try {
        if (!demo)
          await locationRequest(
            id === "all"
              ? { action: "clear" }
              : { action: "stop", sessionId: id },
          );
        if (stopping.current === id) {
          stopping.current = null;
          setPendingStop(false);
          remember(null);
          setError("");
        }
      } catch {
        setPendingStop(true);
        setError(
          "Sharing has stopped on this phone. Reconnect to remove the last position from the team map; we will retry automatically.",
        );
      }
    },
    [demo, remember],
  );
  const stop = useCallback(async () => {
    const id = session.current || stopping.current;
    session.current = null;
    clearWatch();
    setSharing(false);
    setLastLocation(null);
    if (!id) return;
    stopping.current = id;
    remember({ session: id, stopping: true });
    setPendingStop(true);
    await finishStop(id);
  }, [clearWatch, finishStop, remember]);
  const stopAll = useCallback(async () => {
    session.current = null;
    clearWatch();
    setSharing(false);
    setLastLocation(null);
    stopping.current = "all";
    remember({ session: "all", stopping: true });
    setPendingStop(true);
    await finishStop("all");
  }, [clearWatch, finishStop, remember]);
  const publish = useCallback(
    async (point: SharedLocation, id: string) => {
      if (
        session.current !== id ||
        document.hidden ||
        sending.current ||
        Date.now() - lastSend.current < 15000
      )
        return;
      sending.current = true;
      try {
        if (!demo)
          await locationRequest({ action: "update", sessionId: id, ...point });
        if (session.current === id) {
          lastSend.current = Date.now();
          setLastLocation(point);
          setError("");
        }
      } catch (error) {
        if (session.current !== id) return;
        const status = (error as { status?: number }).status;
        if (status === 409 || status === 401) {
          session.current = null;
          remember(null);
          clearWatch();
          setSharing(false);
          setLastLocation(null);
        }
        setError(
          error instanceof Error
            ? error.message
            : "Location could not be sent. Retrying while the app is open.",
        );
      } finally {
        sending.current = false;
      }
    },
    [demo, clearWatch, remember],
  );
  const start = async () => {
    if (starting.current || session.current || stopping.current) return;
    starting.current = true;
    setBusy(true);
    setError("");
    let id: string | null = null;
    try {
      if (!demo && (!window.isSecureContext || !navigator.geolocation))
        throw new Error(
          "Location is unavailable here. Open Premium Remodel in Safari or Chrome on your phone.",
        );
      const point = demo
        ? sampleLocation()
        : positionData(
            await new Promise<GeolocationPosition>((resolve, reject) =>
              navigator.geolocation.getCurrentPosition(
                resolve,
                reject,
                options,
              ),
            ),
          );
      id = crypto.randomUUID();
      if (!demo) await locationRequest({ action: "start", sessionId: id });
      session.current = id;
      remember({ session: id });
      lastSend.current = 0;
      setSharing(true);
      await publish(point, id);
    } catch (error) {
      if (id) {
        stopping.current = id;
        remember({ session: id, stopping: true });
        await finishStop(id);
      }
      const code = (error as GeolocationPositionError)?.code;
      setError(
        code === 1
          ? "Location permission was denied. Allow Location for this site in your browser settings, then tap Share my location again."
          : code === 2 || code === 3
            ? "Your phone could not get a location. Check Location Services and try again outdoors or near a window."
            : error instanceof Error
              ? error.message
              : "Could not start location sharing.",
      );
    } finally {
      starting.current = false;
      setBusy(false);
    }
  };
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const stored = JSON.parse(sessionStorage.getItem(key) || "null");
        if (typeof stored?.session === "string") {
          if (stored.stopping) {
            stopping.current = stored.session;
            setPendingStop(true);
            void finishStop(stored.session);
          } else {
            session.current = stored.session;
            setSharing(true);
          }
        }
      } catch {
        /* Start sharing explicitly if storage is unavailable. */
      }
    }, 0);
    return () => {
      clearTimeout(timer);
      clearWatch();
    };
  }, [key, clearWatch, finishStop]);
  useEffect(() => {
    if (!sharing) return;
    const success = (position: GeolocationPosition) => {
      const id = session.current;
      if (id) void publish(positionData(position), id);
    };
    const failure = (failure: GeolocationPositionError) => {
      if (!session.current || document.hidden) return;
      if (failure.code === 1)
        void stop().then(() =>
          setError("Location permission was removed. Sharing is stopped."),
        );
      else
        setError(
          "Waiting for a location fix. The map shows your last successful update.",
        );
    };
    const refresh = () => {
      const id = session.current;
      if (!id || document.hidden) return;
      if (demo) {
        void publish(sampleLocation(), id);
        return;
      }
      if (!navigator.geolocation) return;
      if (watch.current === null)
        watch.current = navigator.geolocation.watchPosition(
          success,
          failure,
          options,
        );
      navigator.geolocation.getCurrentPosition(success, failure, options);
    };
    const visibility = () => {
      if (document.hidden) clearWatch();
      else refresh();
    };
    refresh();
    const timer = setInterval(refresh, 30000);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pageshow", refresh);
    window.addEventListener("pagehide", clearWatch);
    window.addEventListener("online", refresh);
    return () => {
      clearInterval(timer);
      clearWatch();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pageshow", refresh);
      window.removeEventListener("pagehide", clearWatch);
      window.removeEventListener("online", refresh);
    };
  }, [sharing, demo, publish, stop, clearWatch]);
  useEffect(() => {
    if (!pendingStop) return;
    const retry = () => {
      if (stopping.current) void finishStop(stopping.current);
    };
    window.addEventListener("online", retry);
    const timer = setInterval(retry, 15000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", retry);
    };
  }, [pendingStop, finishStop]);
  return {
    sharing,
    busy,
    pendingStop,
    error,
    lastLocation,
    start,
    stop,
    stopAll,
  };
}
export type LocationSharing = ReturnType<typeof useLocationSharing>;

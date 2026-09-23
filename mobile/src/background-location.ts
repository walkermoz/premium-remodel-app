import * as Crypto from "expo-crypto";
import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import * as TaskManager from "expo-task-manager";
import { appRequest } from "./lib/api";

export const LOCATION_TASK = "premium-remodel-active-shift";
const SESSION_KEY = "premium-remodel-location-session";

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(
  LOCATION_TASK,
  async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    const sessionId = await SecureStore.getItemAsync(SESSION_KEY);
    if (!sessionId) return;
    const location = data.locations[data.locations.length - 1];
    try {
      await appRequest("/api/locations", {
        method: "POST",
        body: {
          action: "update",
          sessionId,
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: Math.max(0, location.coords.accuracy || 0),
          capturedAt: new Date(location.timestamp).toISOString(),
        },
      });
    } catch {
      // The next operating-system location event will retry with a newer fix.
    }
  },
);

async function sendFix(sessionId: string, location: Location.LocationObject) {
  await appRequest("/api/locations", {
    method: "POST",
    body: {
      action: "update",
      sessionId,
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: Math.max(0, location.coords.accuracy || 0),
      capturedAt: new Date(location.timestamp).toISOString(),
    },
  });
}

export async function locationSharingActive() {
  return Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
}

export async function startLocationSharing() {
  const services = await Location.hasServicesEnabledAsync();
  if (!services) throw new Error("Turn on Location Services, then try again.");
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== "granted")
    throw new Error(
      "Allow location access while using the app to start your shift.",
    );
  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.status !== "granted")
    throw new Error(
      "Choose Always Allow in Location Settings so your shift stays current when the phone is locked.",
    );

  const sessionId = Crypto.randomUUID();
  await appRequest("/api/locations", {
    method: "POST",
    body: { action: "start", sessionId },
  });
  await SecureStore.setItemAsync(SESSION_KEY, sessionId);
  try {
    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      activityType: Location.ActivityType.OtherNavigation,
      distanceInterval: 75,
      timeInterval: 60_000,
      deferredUpdatesDistance: 100,
      deferredUpdatesInterval: 60_000,
      pausesUpdatesAutomatically: true,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "Premium Remodel shift is active",
        notificationBody: "Location sharing stops when you end your shift.",
        notificationColor: "#173D52",
      },
    });
    const initial = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    await sendFix(sessionId, initial);
    return initial;
  } catch (error) {
    await appRequest("/api/locations", {
      method: "POST",
      body: { action: "stop", sessionId },
    }).catch(() => undefined);
    await SecureStore.deleteItemAsync(SESSION_KEY);
    throw error;
  }
}

export async function stopLocationSharing() {
  const sessionId = await SecureStore.getItemAsync(SESSION_KEY);
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK))
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  if (sessionId)
    await appRequest("/api/locations", {
      method: "POST",
      body: { action: "stop", sessionId },
    });
  else
    await appRequest("/api/locations", {
      method: "POST",
      body: { action: "clear" },
    });
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

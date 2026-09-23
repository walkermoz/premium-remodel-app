export interface SharedLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  capturedAt: string;
}
export interface LocatedMember {
  id: string;
  name: string;
  location: SharedLocation | null;
}
export const locationStaleMs = 2 * 60 * 1000;
export const locationExpiryMs = 60 * 60 * 1000;
export function locationAge(location: SharedLocation, now: number) {
  const age = Math.max(0, now - Date.parse(location.capturedAt));
  return {
    stale: age >= locationStaleMs,
    expired: age >= locationExpiryMs,
    label:
      age < 60000
        ? "Updated just now"
        : `Updated ${Math.floor(age / 60000)} min ago`,
  };
}

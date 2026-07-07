// lib/evv/gps.ts — GPS capture + haversine geofence verification
export interface GpsFix {
  lat: number;
  lng: number;
  accuracy: number; // meters
  timestamp: number; // epoch ms
}

export const DEFAULT_GEOFENCE_RADIUS_M = Number(
  process.env.NEXT_PUBLIC_EVV_GEOFENCE_RADIUS_M ?? 150
);

/** High-accuracy GPS fix. Rejects with GeolocationPositionError on denial/timeout. */
export function captureGps(timeoutMs = 15_000): Promise<GpsFix> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("GEOLOCATION_UNAVAILABLE"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp
        }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
    );
  });
}

/** Haversine great-circle distance in meters. */
export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export interface GeofenceResult {
  withinFence: boolean;
  distanceMeters: number;
  radiusMeters: number;
}

export function verifyGeofence(
  clockGps: { lat: number; lng: number },
  clientResidenceGps: { lat: number; lng: number },
  radiusMeters: number = DEFAULT_GEOFENCE_RADIUS_M
): GeofenceResult {
  const distanceMeters = haversineMeters(clockGps, clientResidenceGps);
  return { withinFence: distanceMeters <= radiusMeters, distanceMeters, radiusMeters };
}

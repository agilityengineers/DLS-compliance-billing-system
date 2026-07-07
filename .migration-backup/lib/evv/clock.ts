// lib/evv/clock.ts — clock-in/clock-out flow used by the field visit screen.
// Writes go through the offline layer (writeLocal) so they work with no signal.
"use client";

import { captureGps, verifyGeofence, type GpsFix } from "./gps";
import { writeLocal, newLocalId, db } from "@/lib/offline/db";
import type { EvvLog } from "@/lib/supabase/types";

export type ClockResult =
  | { ok: true; log: EvvLog; geofence: { withinFence: boolean; distanceMeters: number } }
  | { ok: false; reason: "GPS_FAILED" | "OUTSIDE_GEOFENCE" | "ALREADY_CLOCKED"; distanceMeters?: number };

export async function clockIn(
  visitId: string,
  clientResidence: { lat: number; lng: number } | null
): Promise<ClockResult> {
  const existing = await db.evv_logs.where("visit_id").equals(visitId).first();
  if (existing?.clock_in_time && !existing.clock_out_time) {
    return { ok: false, reason: "ALREADY_CLOCKED" };
  }

  let gps: GpsFix;
  try {
    gps = await captureGps();
  } catch {
    return { ok: false, reason: "GPS_FAILED" }; // UI offers telephony fallback
  }

  const geofence = clientResidence
    ? verifyGeofence(gps, clientResidence)
    : { withinFence: true, distanceMeters: 0, radiusMeters: 0 };
  if (!geofence.withinFence) {
    return { ok: false, reason: "OUTSIDE_GEOFENCE", distanceMeters: geofence.distanceMeters };
  }

  const log: EvvLog = {
    id: newLocalId(),
    visit_id: visitId,
    clock_in_time: new Date(gps.timestamp).toISOString(),
    clock_out_time: null,
    clock_in_gps: { lat: gps.lat, lng: gps.lng },
    clock_out_gps: null,
    verification_method: "GPS",
    offline_locked: false,
    manual_adjustment_reason: null
  };
  await writeLocal("evv_logs", "insert", log as unknown as Record<string, unknown> & { id: string });
  return { ok: true, log, geofence };
}

export async function clockOut(
  visitId: string,
  clientResidence: { lat: number; lng: number } | null
): Promise<ClockResult> {
  const open = await db.evv_logs.where("visit_id").equals(visitId).first();
  if (!open || !open.clock_in_time || open.clock_out_time) {
    return { ok: false, reason: "ALREADY_CLOCKED" };
  }

  let gps: GpsFix;
  try {
    gps = await captureGps();
  } catch {
    return { ok: false, reason: "GPS_FAILED" };
  }

  const geofence = clientResidence
    ? verifyGeofence(gps, clientResidence)
    : { withinFence: true, distanceMeters: 0, radiusMeters: 0 };

  const updated: EvvLog = {
    ...open,
    clock_out_time: new Date(gps.timestamp).toISOString(),
    clock_out_gps: { lat: gps.lat, lng: gps.lng },
    offline_locked: true // closed record — server timestamps win in sync conflicts
  };
  await writeLocal("evv_logs", "update", updated as unknown as Record<string, unknown> & { id: string });
  return { ok: true, log: updated, geofence };
}

/**
 * Telephony fallback. Records a verification_method='Telephony' EVV log
 * (skips the GPS geofence by design — the registered landline is the
 * location evidence) and returns dial instructions. A real IVR provider
 * (Sandata telephony) must post verification tokens before this counts as
 * certified EVV — PRODUCTION-READINESS.md §4.8.
 */
export async function requestTelephonyFallback(visitId: string): Promise<{ instructions: string; recorded: boolean }> {
  const code = visitId.slice(0, 8).toUpperCase();
  const existing = await db.evv_logs.where("visit_id").equals(visitId).first();
  if (existing?.clock_in_time) {
    return {
      instructions: `A clock record already exists for this visit. Call the EVV line from the client's registered phone and enter visit code ${code} to verify.`,
      recorded: false
    };
  }
  const log: EvvLog = {
    id: newLocalId(),
    visit_id: visitId,
    clock_in_time: new Date().toISOString(),
    clock_out_time: null,
    clock_in_gps: null,
    clock_out_gps: null,
    verification_method: "Telephony",
    offline_locked: false,
    manual_adjustment_reason: null
  };
  await writeLocal("evv_logs", "insert", log as unknown as Record<string, unknown> & { id: string });
  return {
    instructions: `Telephony clock-in recorded (pending IVR verification). Call the EVV line from the client's registered phone and enter visit code ${code}.`,
    recorded: true
  };
}

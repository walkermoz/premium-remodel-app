import { z } from "zod";
import {
  apiError,
  checkOriginOrBearer,
  HttpError,
  limitAttempts,
  requireRequestUser,
} from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { locationExpiryMs } from "@/lib/location";
export const runtime = "nodejs";
const point = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracy: z.number().finite().min(0).max(100000),
  capturedAt: z.iso.datetime().refine((value) => {
    const age = Date.now() - Date.parse(value);
    return age >= -60000 && age <= locationExpiryMs;
  }, "Location must be a recent reading."),
});
const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("clear") }),
  z.object({ action: z.literal("start"), sessionId: z.uuid() }),
  z.object({ action: z.literal("stop"), sessionId: z.uuid() }),
  z.object({
    action: z.literal("update"),
    sessionId: z.uuid(),
    ...point.shape,
  }),
]);

export async function GET(request: Request) {
  try {
    const user = await requireRequestUser(request),
      db = supabaseAdmin();
    const cutoff = new Date(Date.now() - locationExpiryMs).toISOString();
    // Only a last position is stored. Remove expired coordinates on the next workspace request.
    const cleanup = await db
      .from("remodel_locations")
      .update({
        latitude: null,
        longitude: null,
        accuracy: null,
        captured_at: null,
      })
      .eq("organization_id", user.organizationId)
      .lt("captured_at", cutoff);
    if (cleanup.error) throw cleanup.error;
    let profiles = db
      .from("profiles")
      .select("id,full_name")
      .eq("organization_id", user.organizationId)
      .eq("active", true)
      .in("role", ["owner", "admin", "office", "crew", "field", "doorknocker"]);
    let locations = db
      .from("remodel_locations")
      .select("profile_id,latitude,longitude,accuracy,captured_at")
      .eq("organization_id", user.organizationId)
      .eq("sharing", true)
      .gt("captured_at", cutoff);
    if (user.role !== "admin") {
      profiles = profiles.eq("id", user.id);
      locations = locations.eq("profile_id", user.id);
    }
    const [people, positions] = await Promise.all([profiles, locations]);
    if (people.error) throw people.error;
    if (positions.error) throw positions.error;
    return Response.json(
      {
        members: people.data.map((member) => {
          const found = positions.data.find(
            (row) => row.profile_id === member.id,
          );
          return {
            id: member.id,
            name: member.full_name,
            location:
              found && found.latitude !== null && found.longitude !== null
                ? {
                    latitude: found.latitude,
                    longitude: found.longitude,
                    accuracy: found.accuracy,
                    capturedAt: found.captured_at,
                  }
                : null,
          };
        }),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    checkOriginOrBearer(request);
    const user = await requireRequestUser(request);
    const data = input.parse(await request.json()),
      db = supabaseAdmin();
    if (data.action === "start") {
      await limitAttempts(`location-start:${user.id}`, 60);
      const result = await db.from("remodel_locations").upsert({
        profile_id: user.id,
        organization_id: user.organizationId,
        session_id: data.sessionId,
        sharing: true,
        latitude: null,
        longitude: null,
        accuracy: null,
        captured_at: null,
        updated_at: new Date().toISOString(),
      });
      if (result.error) throw result.error;
    } else if (data.action === "stop" || data.action === "clear") {
      let query = db
        .from("remodel_locations")
        .update({
          sharing: false,
          latitude: null,
          longitude: null,
          accuracy: null,
          captured_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("profile_id", user.id)
        .eq("organization_id", user.organizationId);
      if (data.action === "stop")
        query = query.eq("session_id", data.sessionId);
      const result = await query;
      if (result.error) throw result.error;
    } else {
      const result = await db.rpc("remodel_update_location", {
        p_profile: user.id,
        p_org: user.organizationId,
        p_session: data.sessionId,
        p_lat: data.latitude,
        p_lng: data.longitude,
        p_accuracy: data.accuracy,
        p_captured: data.capturedAt,
      });
      if (result.error) throw result.error;
      if (!result.data)
        throw new HttpError(
          409,
          "This sharing session ended or another device started sharing. Tap Share my location to use this device.",
        );
    }
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

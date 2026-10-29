import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { HttpError, type WorkspaceUser } from "./auth";
import { supabaseAdmin } from "./supabase/server";
import { supabaseConfig } from "./supabase/config";
import type {
  RoomScanCapture,
  RoomScanSummary,
} from "./room-scan-types";
import type { Quote } from "./types";

const bucket = "remodel-files";
const sessionMinutes = 20;
const maxModelBytes = 48 * 1024 * 1024;
const maxPreviewBytes = 8 * 1024 * 1024;

const finiteMeasurement = z.number().finite().min(0).max(1_000_000);
export const roomScanCaptureSchema = z.object({
  schemaVersion: z.literal(1),
  roomName: z.string().trim().min(1).max(120),
  capturedAt: z.iso.datetime(),
  device: z.object({
    model: z.string().trim().min(1).max(120),
    systemName: z.string().trim().min(1).max(60),
    systemVersion: z.string().trim().min(1).max(60),
  }),
  measurements: z.object({
    floorAreaSqFt: finiteMeasurement,
    wallAreaSqFt: finiteMeasurement,
    ceilingHeightFt: finiteMeasurement,
    perimeterFt: finiteMeasurement,
    widthFt: finiteMeasurement,
    depthFt: finiteMeasurement,
    doors: z.number().int().min(0).max(100),
    windows: z.number().int().min(0).max(100),
    openings: z.number().int().min(0).max(100),
  }),
  surfaces: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(100),
        kind: z.enum(["wall", "door", "window", "opening", "object"]),
        widthFt: finiteMeasurement,
        heightFt: finiteMeasurement,
        depthFt: finiteMeasurement,
        confidence: z.enum(["low", "medium", "high"]),
      }),
    )
    .max(500),
});

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function scanFolder(organizationId: string, quoteId: string, scanId: string) {
  return `${organizationId}/${quoteId}/room-scans/${scanId}`;
}

function toSummary(row: Record<string, unknown>): RoomScanSummary {
  const capture = row.capture as RoomScanCapture;
  return {
    id: String(row.id),
    quoteId: String(row.quote_id),
    roomName: String(row.room_name),
    capturedAt: String(row.captured_at),
    createdAt: String(row.created_at),
    createdByName: String(row.created_by_name),
    device: capture.device,
    measurements: capture.measurements,
    surfaceCount: capture.surfaces.length,
  };
}

export async function createRoomScanSession(
  user: WorkspaceUser,
  quote: Quote,
) {
  const token = randomBytes(32).toString("base64url");
  const id = randomUUID();
  const scanId = randomUUID();
  const expiresAt = new Date(
    Date.now() + sessionMinutes * 60_000,
  ).toISOString();
  const { error } = await supabaseAdmin()
    .from("remodel_room_scan_sessions")
    .insert({
      id,
      scan_id: scanId,
      organization_id: user.organizationId,
      quote_id: quote.id,
      created_by: user.id,
      created_by_name: user.name,
      token_hash: tokenHash(token),
      expires_at: expiresAt,
    });
  if (error) throw error;
  return { token, scanId, expiresAt };
}

async function captureSession(token: string) {
  if (!/^[A-Za-z0-9_-]{40,80}$/.test(token))
    throw new HttpError(404, "This room-scan session is unavailable.");
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("remodel_room_scan_sessions")
    .select(
      "id,scan_id,organization_id,quote_id,created_by,created_by_name,expires_at,completed_at",
    )
    .eq("token_hash", tokenHash(token))
    .maybeSingle();
  if (error) throw error;
  if (!data || Date.parse(data.expires_at) <= Date.now())
    throw new HttpError(410, "This room-scan session has expired.");
  const quote = await admin
    .from("remodel_records")
    .select("data")
    .eq("organization_id", data.organization_id)
    .eq("id", data.quote_id)
    .eq("kind", "quote")
    .maybeSingle();
  if (quote.error) throw quote.error;
  if (!quote.data)
    throw new HttpError(404, "The quote for this scan is unavailable.");
  return { ...data, quote: quote.data.data as Quote };
}

export async function getRoomScanCaptureSession(token: string) {
  const session = await captureSession(token);
  const existing = session.completed_at
    ? await supabaseAdmin()
        .from("remodel_room_scans")
        .select("*")
        .eq("organization_id", session.organization_id)
        .eq("id", session.scan_id)
        .maybeSingle()
    : null;
  if (existing?.error) throw existing.error;
  if (existing?.data)
    return {
      completed: true as const,
      expiresAt: session.expires_at,
      quote: {
        name: session.quote.name,
        address: session.quote.address,
        customer: session.quote.client,
      },
      scan: toSummary(existing.data),
    };

  const folder = scanFolder(
    session.organization_id,
    session.quote_id,
    session.scan_id,
  );
  const storage = supabaseAdmin().storage.from(bucket);
  const [model, preview] = await Promise.all([
    storage.createSignedUploadUrl(`${folder}/room.usdz`, { upsert: true }),
    storage.createSignedUploadUrl(`${folder}/floor-plan.png`, { upsert: true }),
  ]);
  if (model.error) throw model.error;
  if (preview.error) throw preview.error;
  const { key } = supabaseConfig();
  return {
    completed: false as const,
    expiresAt: session.expires_at,
    quote: {
      name: session.quote.name,
      address: session.quote.address,
      customer: session.quote.client,
    },
    uploads: {
      model: {
        url: model.data.signedUrl,
        contentType: "model/vnd.usdz+zip",
      },
      preview: {
        url: preview.data.signedUrl,
        contentType: "image/png",
      },
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "x-upsert": "true",
      },
    },
  };
}

function storedSize(file: { metadata?: Record<string, unknown> | null }) {
  return Number(file.metadata?.size || 0);
}

export async function finalizeRoomScan(
  token: string,
  input: unknown,
): Promise<RoomScanSummary> {
  const session = await captureSession(token);
  if (session.completed_at) {
    const current = await supabaseAdmin()
      .from("remodel_room_scans")
      .select("*")
      .eq("organization_id", session.organization_id)
      .eq("id", session.scan_id)
      .maybeSingle();
    if (current.error) throw current.error;
    if (current.data) return toSummary(current.data);
  }
  const capture = roomScanCaptureSchema.parse(input);
  const folder = scanFolder(
    session.organization_id,
    session.quote_id,
    session.scan_id,
  );
  const storage = supabaseAdmin().storage.from(bucket);
  const listed = await storage.list(folder, { limit: 10 });
  if (listed.error) throw listed.error;
  const model = listed.data.find((file) => file.name === "room.usdz");
  const preview = listed.data.find((file) => file.name === "floor-plan.png");
  if (!model || !storedSize(model) || storedSize(model) > maxModelBytes)
    throw new HttpError(400, "Upload a RoomPlan model up to 48 MB.");
  if (!preview || !storedSize(preview) || storedSize(preview) > maxPreviewBytes)
    throw new HttpError(400, "Upload a floor-plan preview up to 8 MB.");

  const metadataPath = `${folder}/room.json`;
  const metadataBytes = new TextEncoder().encode(
    JSON.stringify(capture, null, 2),
  );
  const metadataUpload = await storage.upload(metadataPath, metadataBytes, {
    contentType: "application/json",
    upsert: true,
  });
  if (metadataUpload.error) throw metadataUpload.error;

  const now = new Date().toISOString();
  const admin = supabaseAdmin();
  const inserted = await admin
    .from("remodel_room_scans")
    .upsert(
      {
        id: session.scan_id,
        organization_id: session.organization_id,
        quote_id: session.quote_id,
        created_by: session.created_by,
        created_by_name: session.created_by_name,
        room_name: capture.roomName,
        captured_at: capture.capturedAt,
        capture,
        model_path: `${folder}/room.usdz`,
        preview_path: `${folder}/floor-plan.png`,
        metadata_path: metadataPath,
        created_at: now,
        updated_at: now,
      },
      { onConflict: "organization_id,id" },
    )
    .select("*")
    .single();
  if (inserted.error) throw inserted.error;
  const completed = await admin
    .from("remodel_room_scan_sessions")
    .update({ completed_at: now })
    .eq("id", session.id)
    .is("completed_at", null);
  if (completed.error) throw completed.error;
  return toSummary(inserted.data);
}

export async function listRoomScans(
  organizationId: string,
  quoteId: string,
) {
  const { data, error } = await supabaseAdmin()
    .from("remodel_room_scans")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("quote_id", quoteId)
    .order("captured_at", { ascending: false });
  if (error) throw error;
  return data.map(toSummary);
}

export async function findRoomScan(organizationId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await supabaseAdmin()
    .from("remodel_room_scans")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function deleteRoomScan(organizationId: string, id: string) {
  const row = await findRoomScan(organizationId, id);
  if (!row) throw new HttpError(404, "Room scan not found.");
  const storage = supabaseAdmin().storage.from(bucket);
  const removed = await storage.remove([
    row.model_path,
    row.preview_path,
    row.metadata_path,
  ]);
  if (removed.error) throw removed.error;
  const deleted = await supabaseAdmin()
    .from("remodel_room_scans")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", id);
  if (deleted.error) throw deleted.error;
}

import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import {
  apiError,
  checkOrigin,
  HttpError,
  limitAttempts,
  requireUser,
} from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit-server";
import { MAX_FILE_SIZE } from "@/lib/file-policy";
import { supabaseAdmin } from "@/lib/supabase/server";
import { validateStoredFile } from "@/lib/validate-file";

export const runtime = "nodejs";

const bucket = "remodel-files";
const memberIdSchema = z.uuid();

function photoUrl(memberId: string, version: string) {
  return `/api/team-photos?memberId=${memberId}&v=${encodeURIComponent(version)}`;
}

async function membership(organizationId: string, memberId: string) {
  const { data, error } = await supabaseAdmin()
    .from("remodel_memberships")
    .select("avatar_path")
    .eq("organization_id", organizationId)
    .eq("profile_id", memberId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "Team member not found.");
  return data;
}

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const memberId = memberIdSchema.parse(
      new URL(request.url).searchParams.get("memberId"),
    );
    const member = await membership(user.organizationId, memberId);
    const path = member.avatar_path;
    if (
      !path ||
      !path.startsWith(`${user.organizationId}/team-photos/${memberId}/`)
    )
      throw new HttpError(404, "Photo not found.");
    const { data, error } = await supabaseAdmin()
      .storage.from(bucket)
      .download(path);
    if (error || !data) throw new HttpError(404, "Photo unavailable.");
    return new Response(data, {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    if (
      Number(request.headers.get("content-length") || 0) >
      MAX_FILE_SIZE + 65536
    )
      throw new HttpError(413, "Choose a photo smaller than 4 MB.");
    const form = await request.formData();
    const memberId = memberIdSchema.parse(form.get("memberId"));
    if (user.role !== "admin" && memberId !== user.id)
      throw new HttpError(403, "You can change only your own photo.");
    const file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > MAX_FILE_SIZE)
      throw new HttpError(400, "Choose a photo up to 4 MB.");
    const previous = await membership(user.organizationId, memberId);
    await limitAttempts(`team-photo:${user.id}`, 40);
    let validated;
    try {
      validated = await validateStoredFile(file);
    } catch (error) {
      throw new HttpError(
        400,
        error instanceof Error ? error.message : "Unsupported photo.",
      );
    }
    if (!validated.mime.startsWith("image/"))
      throw new HttpError(400, "Choose a JPG, PNG, or WebP photo.");
    const bytes = await sharp(validated.bytes)
      .resize(512, 512, { fit: "cover", position: "attention" })
      .webp({ quality: 82 })
      .toBuffer();
    const path = `${user.organizationId}/team-photos/${memberId}/${randomUUID()}.webp`;
    const storage = supabaseAdmin().storage.from(bucket);
    const uploaded = await storage.upload(path, bytes, {
      contentType: "image/webp",
      upsert: false,
    });
    if (uploaded.error) throw uploaded.error;
    const version = new Date().toISOString();
    const updated = await supabaseAdmin()
      .from("remodel_memberships")
      .update({ avatar_path: path, avatar_updated_at: version })
      .eq("organization_id", user.organizationId)
      .eq("profile_id", memberId)
      .eq("active", true)
      .select("profile_id");
    if (updated.error || !updated.data?.length) {
      await storage.remove([path]);
      if (updated.error) throw updated.error;
      throw new HttpError(404, "Team member not found.");
    }
    if (previous.avatar_path) await storage.remove([previous.avatar_path]);
    await recordAuditEvent(user, {
      action: "updated",
      entityKind: "team",
      entityId: memberId,
      subject: "Changed team profile photo",
    });
    return Response.json({ photoUrl: photoUrl(memberId, version) });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    const { memberId } = z
      .object({ memberId: memberIdSchema })
      .parse(await request.json());
    if (user.role !== "admin" && memberId !== user.id)
      throw new HttpError(403, "You can remove only your own photo.");
    const member = await membership(user.organizationId, memberId);
    const { error } = await supabaseAdmin()
      .from("remodel_memberships")
      .update({ avatar_path: null, avatar_updated_at: null })
      .eq("organization_id", user.organizationId)
      .eq("profile_id", memberId)
      .eq("active", true);
    if (error) throw error;
    if (member.avatar_path)
      await supabaseAdmin().storage.from(bucket).remove([member.avatar_path]);
    await recordAuditEvent(user, {
      action: "updated",
      entityKind: "team",
      entityId: memberId,
      subject: "Removed team profile photo",
    });
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import {
  apiError,
  checkOrigin,
  HttpError,
  limitAttempts,
  requireUser,
  type WorkspaceUser,
} from "@/lib/auth";
import { recordAuditEvent } from "@/lib/audit-server";
import { MAX_FILE_SIZE } from "@/lib/file-policy";
import { findRecord, updateRecord } from "@/lib/repository";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Contractor } from "@/lib/types";
import { validateStoredFile } from "@/lib/validate-file";

export const runtime = "nodejs";

const bucket = "remodel-files";
const contactIdSchema = z.uuid();

async function contactForUser(user: WorkspaceUser, contactId: string) {
  if (user.group === "doorknocker")
    throw new HttpError(403, "Contact photos are unavailable for this role.");
  const contact = (await findRecord(
    user,
    contactId,
    "contractor",
  )) as Contractor | null;
  if (!contact) throw new HttpError(404, "Contact not found.");
  return contact;
}

function storedPath(user: WorkspaceUser, contact: Contractor) {
  const path = contact.photoPath;
  return path?.startsWith(
    `${user.organizationId}/contact-photos/${contact.id}/`,
  )
    ? path
    : null;
}

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const contactId = contactIdSchema.parse(
      new URL(request.url).searchParams.get("contactId"),
    );
    const contact = await contactForUser(user, contactId);
    const path = storedPath(user, contact);
    if (!path) throw new HttpError(404, "Photo not found.");
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
    const contactId = contactIdSchema.parse(form.get("contactId"));
    const contact = await contactForUser(user, contactId);
    const file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > MAX_FILE_SIZE)
      throw new HttpError(400, "Choose a photo up to 4 MB.");
    await limitAttempts(`contact-photo:${user.id}`, 40);
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
    const path = `${user.organizationId}/contact-photos/${contactId}/${randomUUID()}.webp`;
    const storage = supabaseAdmin().storage.from(bucket);
    const uploaded = await storage.upload(path, bytes, {
      contentType: "image/webp",
      upsert: false,
    });
    if (uploaded.error) throw uploaded.error;
    let updated: Contractor;
    try {
      updated = (await updateRecord(
        user,
        contact,
        {
          ...contact,
          photoPath: path,
          photoUpdatedAt: new Date().toISOString(),
        },
        contact.updatedAt,
      )) as Contractor;
    } catch (error) {
      await storage.remove([path]);
      throw error;
    }
    const previous = storedPath(user, contact);
    if (previous) await storage.remove([previous]);
    await recordAuditEvent(user, {
      action: "updated",
      entityKind: "contractor",
      entityId: contactId,
      subject: "Changed contact photo",
    });
    return Response.json({ contact: updated });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    const { contactId } = z
      .object({ contactId: contactIdSchema })
      .parse(await request.json());
    const contact = await contactForUser(user, contactId);
    const path = storedPath(user, contact);
    if (!path) throw new HttpError(404, "Photo not found.");
    const withoutPhoto = { ...contact };
    delete withoutPhoto.photoPath;
    delete withoutPhoto.photoUpdatedAt;
    const updated = (await updateRecord(
      user,
      contact,
      withoutPhoto,
      contact.updatedAt,
    )) as Contractor;
    await supabaseAdmin().storage.from(bucket).remove([path]);
    await recordAuditEvent(user, {
      action: "updated",
      entityKind: "contractor",
      entityId: contactId,
      subject: "Removed contact photo",
    });
    return Response.json({ contact: updated });
  } catch (error) {
    return apiError(error);
  }
}

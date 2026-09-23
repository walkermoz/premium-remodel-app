import { randomUUID } from "node:crypto";
import {
  apiError,
  checkOrigin,
  HttpError,
  requireUser,
  limitAttempts,
} from "@/lib/auth";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import {
  deleteRecord,
  findRecord,
  insertRecord,
  updateRecord,
} from "@/lib/repository";
import type { Attachment, Project } from "@/lib/types";
import { validateStoredFile } from "@/lib/validate-file";
import { MAX_FILE_SIZE } from "@/lib/file-policy";
export const runtime = "nodejs";
export const maxDuration = 60;
const bucket = "remodel-files";
const maxSize = MAX_FILE_SIZE;
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    if (Number(request.headers.get("content-length") || 0) > maxSize + 65536)
      throw new HttpError(413, "Choose a file smaller than 4 MB.");
    const form = await request.formData();
    const file = form.get("file");
    const projectId = String(form.get("projectId") || "");
    if (!(file instanceof File) || !file.size || file.size > maxSize)
      throw new HttpError(400, "Choose a nonempty file smaller than 4 MB.");
    if (
      !(await findRecord(user, projectId, "project")) &&
      !(await findRecord(user, projectId, "quote"))
    )
      throw new HttpError(404, "Project not found.");
    await limitAttempts(`files:${user.id}`, 120);
    let validated;
    try {
      validated = await validateStoredFile(file);
    } catch (error) {
      throw new HttpError(
        400,
        error instanceof Error ? error.message : "Unsupported file.",
      );
    }
    const { bytes, mime, name, extension, validationVersion } = validated;
    const storedPath = `${user.organizationId}/${projectId}/${randomUUID()}/file.${extension}`;
    const storage = supabaseAdmin().storage.from(bucket);
    const { error } = await storage.upload(storedPath, bytes, {
      contentType: mime,
      upsert: false,
    });
    if (error) throw error;
    try {
      return Response.json(
        await insertRecord(user, "attachment", {
          projectId,
          name,
          mime,
          size: bytes.length,
          validationVersion,
          storage: "supabase",
          path: storedPath,
          authorName: user.name,
        }),
        { status: 201 },
      );
    } catch (e) {
      await storage.remove([storedPath]);
      throw e;
    }
  } catch (e) {
    return apiError(e);
  }
}
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const file = id
      ? ((await findRecord(user, id, "attachment")) as Attachment | null)
      : null;
    if (!file || !file.path.startsWith(`${user.organizationId}/`))
      throw new HttpError(404, "File not found.");
    const { data, error } = await (
      await supabaseServer()
    ).storage
      .from(bucket)
      .download(file.path);
    if (error || !data) throw new HttpError(404, "File unavailable.");
    return new Response(data, {
      headers: {
        "Content-Type": file.mime,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Content-Disposition": `${!url.searchParams.has("download") && file.mime.startsWith("image/") ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    if (user.role !== "admin")
      throw new HttpError(403, "Only the administrator can delete files.");
    const { id } = await request.json();
    const file = (await findRecord(
      user,
      String(id),
      "attachment",
    )) as Attachment | null;
    if (!file || !file.path.startsWith(`${user.organizationId}/`))
      throw new HttpError(404, "File not found.");
    const project = (await findRecord(
      user,
      file.projectId,
      "project",
    )) as Project | null;
    if (project?.coverAttachmentId === file.id)
      await updateRecord(
        user,
        project,
        { ...project, coverAttachmentId: "" },
        project.updatedAt,
      );
    const { error } = await supabaseAdmin()
      .storage.from(bucket)
      .remove([file.path]);
    if (error) throw error;
    await deleteRecord(user, file.id);
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}

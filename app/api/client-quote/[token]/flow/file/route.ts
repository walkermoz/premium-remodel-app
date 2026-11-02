import { randomUUID } from "node:crypto";
import { apiError, checkOrigin, HttpError, limitAttempts } from "@/lib/auth";
import { readClientQuoteSource } from "@/lib/client-quote";
import { MAX_FILE_SIZE } from "@/lib/file-policy";
import { saveCustomerQuoteFlowValue } from "@/lib/quote-flow-instances";
import { supabaseAdmin } from "@/lib/supabase/server";
import { validateStoredFile } from "@/lib/validate-file";

export const runtime = "nodejs";
export const maxDuration = 60;
type Context = { params: Promise<{ token: string }> };

export async function POST(request: Request, context: Context) {
  let storedPath = "";
  let attachmentId = "";
  let organizationId = "";
  try {
    checkOrigin(request);
    const { token } = await context.params;
    await limitAttempts(`client-flow-file:${token.slice(0, 24)}`, 20);
    if (
      Number(request.headers.get("content-length") || 0) >
      MAX_FILE_SIZE + 65_536
    )
      throw new HttpError(413, "Choose a file smaller than 4 MB.");
    const source = await readClientQuoteSource(token, { recordView: false });
    if (!source) throw new HttpError(404, "Quote unavailable.");
    organizationId = source.organizationId;
    const form = await request.formData();
    const file = form.get("file");
    const stageId = String(form.get("stageId") || "");
    const blockId = String(form.get("blockId") || "");
    if (!(file instanceof File) || !file.size || file.size > MAX_FILE_SIZE)
      throw new HttpError(400, "Choose a nonempty file smaller than 4 MB.");
    if (!stageId || stageId.length > 80 || !blockId || blockId.length > 80)
      throw new HttpError(400, "Choose a valid file field.");
    let validated;
    try {
      validated = await validateStoredFile(file);
    } catch (cause) {
      throw new HttpError(
        400,
        cause instanceof Error ? cause.message : "Unsupported file.",
      );
    }
    attachmentId = randomUUID();
    const now = new Date().toISOString();
    storedPath = `${source.organizationId}/${source.view.quote.id}/flow/${randomUUID()}/file.${validated.extension}`;
    const storage = supabaseAdmin().storage.from("remodel-files");
    const uploaded = await storage.upload(storedPath, validated.bytes, {
      contentType: validated.mime,
      upsert: false,
    });
    if (uploaded.error) throw uploaded.error;
    const attachment = {
      id: attachmentId,
      projectId: source.view.quote.id,
      name: validated.name,
      mime: validated.mime,
      size: validated.bytes.length,
      storage: "supabase",
      path: storedPath,
      authorName: source.view.quote.client || "Customer",
      validationVersion: validated.validationVersion,
      createdAt: now,
      updatedAt: now,
    };
    const inserted = await supabaseAdmin().from("remodel_records").insert({
      id: attachmentId,
      organization_id: source.organizationId,
      created_by: null,
      updated_by: null,
      kind: "attachment",
      project_id: source.view.quote.id,
      data: attachment,
      updated_at: now,
    });
    if (inserted.error) throw inserted.error;
    const flow = await saveCustomerQuoteFlowValue(
      source.organizationId,
      source.view.quote.id,
      {
        stageId,
        blockId,
        value: {
          id: attachment.id,
          name: attachment.name,
          mime: attachment.mime,
          size: attachment.size,
        },
      },
    );
    return Response.json(
      { flow, file: attachment },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (storedPath)
      await supabaseAdmin()
        .storage.from("remodel-files")
        .remove([storedPath])
        .catch(() => undefined);
    if (attachmentId)
      try {
        await supabaseAdmin()
          .from("remodel_records")
          .delete()
          .eq("organization_id", organizationId)
          .eq("id", attachmentId);
      } catch {
        // Preserve the original validation or storage error.
      }
    return apiError(error);
  }
}

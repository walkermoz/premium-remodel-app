import { readFile } from "node:fs/promises";
import path from "node:path";
import { apiError, HttpError, requireUser } from "@/lib/auth";
import { buildQuotePdf, quotePdfFileName } from "@/lib/quote-pdf";
import { findRecord, getWorkspace } from "@/lib/repository";
import type { Quote } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    if (user.group === "doorknocker")
      throw new HttpError(403, "This account cannot download quotes.");
    const { id } = await context.params;
    const quote = (await findRecord(user, id, "quote")) as Quote | null;
    if (!quote) throw new HttpError(404, "Quote not found.");

    const workspace = await getWorkspace(user);
    const logo = await readFile(
      path.join(process.cwd(), "public", "images", "logo.png"),
    );
    const bytes = await buildQuotePdf(quote, workspace.scope, logo);
    const fileName = quotePdfFileName(quote).replace(/["\\]/g, "");

    return new Response(Buffer.from(bytes), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": String(bytes.length),
        "Content-Type": "application/pdf",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

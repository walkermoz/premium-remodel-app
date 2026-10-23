import { apiError, requireUser } from "@/lib/auth";
import { buildMsaPdf } from "@/lib/msa-pdf";
import { findRecord } from "@/lib/repository";
import type { Project } from "@/lib/types";

export const runtime = "nodejs";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const user = await requireUser();
    if (user.group === "doorknocker")
      return new Response(null, { status: 403 });
    const { projectId } = await params;
    const project = (await findRecord(
      user,
      projectId,
      "project",
    )) as Project | null;
    const agreement = project?.msaAgreement;
    if (!agreement || agreement.status !== "signed")
      return new Response(null, { status: 404 });
    const pdf = await buildMsaPdf(agreement);
    return new Response(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Premium-Remodel-MSA-${agreement.quoteNumber.replace(/[^a-zA-Z0-9-]/g, "") || "signed"}.pdf"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

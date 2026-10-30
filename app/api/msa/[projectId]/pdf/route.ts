import { apiError, requireUser } from "@/lib/auth";
import { requirePremiumAgreement } from "@/lib/agreements";
import { buildMsaPdf } from "@/lib/msa-pdf";
import { findRecord } from "@/lib/repository";
import type { Project, Quote } from "@/lib/types";
import { requireWorkspaceTabs } from "@/lib/workspace-tab-access-server";

export const runtime = "nodejs";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const user = await requireUser();
    await requireWorkspaceTabs(user, "Projects", "Quotes");
    requirePremiumAgreement(user.organizationId);
    if (user.group === "doorknocker")
      return new Response(null, { status: 403 });
    const { projectId } = await params;
    const project = (await findRecord(user, projectId)) as
      Project | Quote | null;
    const agreement = project?.msaAgreement;
    if (!agreement || agreement.status !== "signed")
      return new Response(null, { status: 404 });
    const pdf = await buildMsaPdf(agreement);
    return new Response(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${new URL(request.url).searchParams.get("view") === "1" ? "inline" : "attachment"}; filename="Premium-Remodel-MSA-${agreement.quoteNumber.replace(/[^a-zA-Z0-9-]/g, "") || "signed"}.pdf"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

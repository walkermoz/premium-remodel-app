import { z } from "zod";
import { getBusinessConfig } from "@/lib/business-config";
import { canEditWorkspaceRecord } from "@/lib/workspace-tab-access";
import { apiError, checkOrigin, HttpError, requireUser } from "@/lib/auth";
import { findRecord, getWorkspace, updateRecord } from "@/lib/repository";
import { requireWorkspaceTabs } from "@/lib/workspace-tab-access-server";
import { quoteStatuses, type Quote } from "@/lib/types";
import { acceptedScopeSnapshot } from "@/lib/msa-draft";
import { recordAuditEvent } from "@/lib/audit-server";
import { attachConfiguredPaperwork } from "@/lib/paperwork";
import { findLeadRecord, syncLeadStageFromQuote } from "@/lib/lead-records";
import { leadPatchFromQuote } from "@/lib/leads";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    await requireWorkspaceTabs(user, "Quotes");
    const config = await getBusinessConfig(user);
    if (!canEditWorkspaceRecord(config, user.group, "quote"))
      throw new HttpError(403, "Your role cannot edit quotes.");
    const input = z
      .object({ status: z.enum(quoteStatuses), updatedAt: z.iso.datetime() })
      .parse(await request.json());
    const quote = (await findRecord(
      user,
      z.uuid().parse((await params).id),
      "quote",
    )) as Quote | null;
    if (!quote) throw new HttpError(404, "Quote not found.");
    if (quote.quoteAcceptance && input.status !== "Accepted")
      throw new HttpError(
        409,
        "A signed quote keeps its accepted status. Create a revision to change signed scope.",
      );
    const patch: Record<string, unknown> = { ...quote, status: input.status };
    if (input.status === "Accepted" && quote.status !== "Accepted") {
      const scope = (await getWorkspace(user)).scope.filter(
        (i) => i.projectId === quote.id,
      );
      if (!scope.length)
        throw new HttpError(400, "Add quote items before marking it accepted.");
      patch.quoteAcceptedAt = new Date().toISOString();
      patch.quoteAcceptedBy = user.name;
      patch.acceptanceMethod = "staff_marked";
      patch.acceptedByStaffId = user.id;
      patch.contractPrice = scope.reduce((sum, i) => sum + i.estimate, 0);
      patch.acceptedQuoteScope = acceptedScopeSnapshot(scope, quote.category);
      patch.manualAcceptanceHistory = [
        ...(quote.manualAcceptanceHistory || []),
        {
          at: String(patch.quoteAcceptedAt),
          by: user.id,
          total: Number(patch.contractPrice),
          scope: acceptedScopeSnapshot(scope, quote.category),
        },
      ].slice(-50);
    }
    if (
      quote.acceptanceMethod === "staff_marked" &&
      input.status !== "Accepted"
    ) {
      for (const key of [
        "quoteAcceptedAt",
        "quoteAcceptedBy",
        "acceptanceMethod",
        "acceptedByStaffId",
        "contractPrice",
        "acceptedQuoteScope",
      ])
        delete patch[key];
    }
    const updated = await updateRecord(user, quote, patch, input.updatedAt);
    if (quote.leadId) {
      const lead = await findLeadRecord(user.organizationId, quote.leadId);
      if (lead)
        await syncLeadStageFromQuote(
          user,
          quote.leadId,
          leadPatchFromQuote(lead, updated as Quote),
        );
    }
    await recordAuditEvent(user, {
      action: "updated",
      entityKind: "quote",
      entityId: quote.id,
      subject: `Quote status: ${input.status}`,
      afterData: {
        status: input.status,
        method: quote.quoteAcceptance ? "customer_signed" : "staff_marked",
      },
    });
    const warnings =
      input.status === "Accepted"
        ? await attachConfiguredPaperwork(user, quote.id, "quote_accepted")
        : [];
    return Response.json({ quote: updated, warnings });
  } catch (error) {
    return apiError(error);
  }
}

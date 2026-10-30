import { z } from "zod";
import { requirePremiumAgreement } from "@/lib/agreements";
import {
  apiError,
  checkOrigin,
  HttpError,
  limitAttempts,
  requireUser,
} from "@/lib/auth";
import { acceptedScopeSnapshot } from "@/lib/msa-draft";
import { prepareMsa, staffMsaInput } from "@/lib/msa-contract";
import { getWorkspace } from "@/lib/repository";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Quote } from "@/lib/types";
import { requireWorkspaceTabs } from "@/lib/workspace-tab-access-server";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    await requireWorkspaceTabs(user, "Quotes");
    requirePremiumAgreement(user.organizationId);
    if (user.group === "doorknocker")
      throw new HttpError(403, "This account cannot prepare agreements.");
    const { projectId } = await params;
    if (!z.uuid().safeParse(projectId).success)
      throw new HttpError(400, "Choose a valid quote.");
    await limitAttempts(`msa-prepare:${user.id}:${projectId}`, 12);
    const raw = await request.text();
    if (raw.length > 100_000)
      throw new HttpError(413, "Signature is too large.");
    const input = staffMsaInput.parse(JSON.parse(raw));
    const admin = supabaseAdmin();
    const { data: row, error } = await admin
      .from("remodel_records")
      .select("kind,data,updated_at")
      .eq("organization_id", user.organizationId)
      .eq("id", projectId)
      .eq("kind", "quote")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new HttpError(404, "Quote not found.");
    const quote = row.data as Quote;
    if (quote.quoteAcceptedAt || quote.status !== "Draft" || quote.quoteSentAt)
      throw new HttpError(409, "Prepare the MSA before sharing the quote.");
    if (quote.msaAgreement)
      throw new HttpError(
        409,
        "Revise the prepared MSA before signing a replacement.",
      );
    if (
      !quote.clientEmail ||
      input.ownerEmail.toLowerCase() !== quote.clientEmail.toLowerCase() ||
      input.owner.toLowerCase() !== quote.client.trim().toLowerCase()
    )
      throw new HttpError(
        400,
        "The owner name and email must match the client on the quote.",
      );
    const workspace = await getWorkspace(user);
    const items = workspace.scope.filter(
      (item) => item.projectId === projectId,
    );
    if (items.length > 500)
      throw new HttpError(413, "This quote has too many scope items.");
    const price = items.reduce((total, item) => total + item.estimate, 0);
    const now = new Date(
      Math.max(Date.now(), Date.parse(row.updated_at) + 1),
    ).toISOString();
    let agreement;
    try {
      agreement = prepareMsa(
        {
          ...quote,
          acceptedQuoteScope: acceptedScopeSnapshot(items, quote.category),
          contractPrice: price,
        },
        items,
        input,
        user,
        now,
        { allowUnsignedQuote: true },
      );
    } catch (cause) {
      throw new HttpError(
        400,
        cause instanceof Error ? cause.message : "Could not prepare the MSA.",
      );
    }
    agreement.staffSignature.ip = (
      request.headers.get("x-vercel-forwarded-for") ||
      request.headers.get("x-forwarded-for") ||
      ""
    )
      .split(",")[0]
      .trim()
      .slice(0, 80);
    agreement.staffSignature.userAgent = (
      request.headers.get("user-agent") || ""
    ).slice(0, 300);
    const { data: updated, error: updateError } = await admin
      .from("remodel_records")
      .update({
        data: { ...quote, msaAgreement: agreement, updatedAt: now },
        updated_at: now,
        updated_by: user.id,
      })
      .eq("organization_id", user.organizationId)
      .eq("id", projectId)
      .eq("kind", "quote")
      .eq("updated_at", row.updated_at)
      .select("id");
    if (updateError) throw updateError;
    if (!updated?.length)
      throw new HttpError(
        409,
        "Quote changed. Refresh and prepare the MSA again.",
      );
    return Response.json(
      { prepared: true },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    await requireWorkspaceTabs(user, "Quotes");
    requirePremiumAgreement(user.organizationId);
    if (user.group === "doorknocker")
      throw new HttpError(403, "This account cannot revise agreements.");
    const { projectId } = await params;
    if (!z.uuid().safeParse(projectId).success)
      throw new HttpError(400, "Choose a valid quote.");
    const admin = supabaseAdmin();
    const { data: row, error } = await admin
      .from("remodel_records")
      .select("data,updated_at")
      .eq("organization_id", user.organizationId)
      .eq("id", projectId)
      .eq("kind", "quote")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new HttpError(404, "Quote not found.");
    const quote = row.data as Quote;
    if (
      quote.status !== "Draft" ||
      quote.quoteSentAt ||
      quote.msaAgreement?.status !== "prepared"
    )
      throw new HttpError(
        409,
        "Only an unsigned, unshared prepared MSA can be revised.",
      );
    const now = new Date(
      Math.max(Date.now(), Date.parse(row.updated_at) + 1),
    ).toISOString();
    const { data: updated, error: updateError } = await admin
      .from("remodel_records")
      .update({
        data: { ...quote, msaAgreement: undefined, updatedAt: now },
        updated_at: now,
        updated_by: user.id,
      })
      .eq("organization_id", user.organizationId)
      .eq("id", projectId)
      .eq("kind", "quote")
      .eq("updated_at", row.updated_at)
      .select("id");
    if (updateError) throw updateError;
    if (!updated?.length)
      throw new HttpError(
        409,
        "Quote changed. Refresh before revising the MSA.",
      );
    return Response.json({ revised: true });
  } catch (error) {
    return apiError(error);
  }
}

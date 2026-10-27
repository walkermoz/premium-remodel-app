import { z } from "zod";
import { requirePremiumAgreement } from "@/lib/agreements";
import {
  apiError,
  appOrigin,
  checkOrigin,
  HttpError,
  limitAttempts,
  requireUser,
} from "@/lib/auth";
import { createClientEmailToken } from "@/lib/client-portal";
import { isValidClientQuoteSnapshot } from "@/lib/client-quote";
import { acceptedScopeSnapshot } from "@/lib/msa-draft";
import { prepareMsa, staffMsaInput } from "@/lib/msa-contract";
import { signatureStrokesSchema } from "@/lib/quote-signature";
import { sendMsaEmail } from "@/lib/msa-email";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAuditEvent } from "@/lib/audit-server";
import type { Project, Quote, ScopeItem } from "@/lib/types";

export const runtime = "nodejs";
const inputSchema = z.object({
  owner: z.string().optional(),
  ownerEmail: z.email().max(320),
  signerTitle: z.string().optional(),
  signatureStrokes: signatureStrokesSchema.optional(),
  retry: z.boolean().optional(),
  confirmedHistoricalScope: z.boolean().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const user = await requireUser();
    requirePremiumAgreement(user.organizationId);
    if (user.group === "doorknocker")
      throw new HttpError(403, "This account cannot view agreements.");
    const { projectId } = await params;
    if (!z.uuid().safeParse(projectId).success)
      throw new HttpError(400, "Choose a valid project.");
    const { data: link, error } = await supabaseAdmin()
      .from("remodel_client_links")
      .select("quote_snapshot")
      .eq("organization_id", user.organizationId)
      .eq("project_id", projectId)
      .eq("kind", "quote")
      .is("revoked_at", null)
      .maybeSingle();
    if (error) throw error;
    if (!link || !isValidClientQuoteSnapshot(link.quote_snapshot))
      throw new HttpError(
        404,
        "No verified accepted quote snapshot is available. Create an active quote client link.",
      );
    const snapshot = link.quote_snapshot as {
      quote: Project;
      items: ScopeItem[];
    };
    return Response.json(
      {
        price: snapshot.items.reduce((sum, item) => sum + item.estimate, 0),
        scope: acceptedScopeSnapshot(snapshot.items, snapshot.quote.category),
        quoteNumber: snapshot.quote.quoteNumber || "",
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    requirePremiumAgreement(user.organizationId);
    if (user.group === "doorknocker")
      throw new HttpError(403, "This account cannot send agreements.");
    const { projectId } = await params;
    if (!z.uuid().safeParse(projectId).success)
      throw new HttpError(400, "Choose a valid project.");
    await limitAttempts(`msa-send:${user.id}:${projectId}`, 12);
    const raw = await request.text();
    if (raw.length > 100_000)
      throw new HttpError(413, "Signature is too large.");
    const input = inputSchema.parse(JSON.parse(raw));
    const admin = supabaseAdmin();
    const { data: row, error } = await admin
      .from("remodel_records")
      .select("kind,data,updated_at")
      .eq("organization_id", user.organizationId)
      .eq("id", projectId)
      .in("kind", ["project", "quote"])
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new HttpError(404, "Project not found.");
    const project = row.data as Project | Quote;
    if (
      row.kind === "quote" &&
      (project.status !== "Accepted" || !project.quoteAcceptance)
    )
      throw new HttpError(
        409,
        "The customer must sign the quote scope before the MSA can be sent.",
      );
    const { data: link, error: linkError } = await admin
      .from("remodel_client_links")
      .select("id,quote_snapshot")
      .eq("organization_id", user.organizationId)
      .eq("project_id", projectId)
      .eq("kind", "quote")
      .is("revoked_at", null)
      .maybeSingle();
    if (linkError) throw linkError;
    if (!link)
      throw new HttpError(
        400,
        "Create an active quote client link before sending the MSA.",
      );
    let agreement = project.msaAgreement;
    if (agreement?.status === "signed")
      throw new HttpError(409, "This MSA is already signed.");
    if (agreement?.status === "sent")
      throw new HttpError(409, "This MSA has already been sent.");
    if (agreement?.status === "prepared") {
      if (!input.retry)
        throw new HttpError(
          409,
          "An MSA is prepared. Retry the email from the project after checking Gmail Sent.",
        );
      if (agreement.ownerEmail !== input.ownerEmail.toLowerCase())
        throw new HttpError(
          409,
          "Prepared agreement recipient differs. Refresh the project.",
        );
    } else {
      if (
        !project.clientEmail ||
        project.clientEmail.toLowerCase() !== input.ownerEmail.toLowerCase()
      )
        throw new HttpError(
          400,
          "Save the owner's email on the project before sending the MSA.",
        );
      const { data: scopeRows, error: scopeError } = await admin
        .from("remodel_records")
        .select("data")
        .eq("organization_id", user.organizationId)
        .eq("project_id", projectId)
        .eq("kind", "scope")
        .limit(501);
      if (scopeError) throw scopeError;
      if (scopeRows.length > 500)
        throw new HttpError(413, "This project has too many scope items.");
      const snapshot = link.quote_snapshot;
      const verifiedProject = { ...project };
      const recordedTotal = verifiedProject.acceptedQuoteScope?.reduce(
        (sum, item) => sum + item.amount,
        0,
      );
      const needsSnapshot =
        !verifiedProject.acceptedQuoteScope?.length ||
        !verifiedProject.contractPrice ||
        Math.round((recordedTotal || 0) * 100) !==
          Math.round((verifiedProject.contractPrice || 0) * 100);
      if (needsSnapshot && isValidClientQuoteSnapshot(snapshot)) {
        if (!input.confirmedHistoricalScope)
          throw new HttpError(
            400,
            "Review and confirm the historical accepted quote scope before sending this MSA.",
          );
        const accepted = snapshot as { quote: Project; items: ScopeItem[] };
        verifiedProject.acceptedQuoteScope = acceptedScopeSnapshot(
          accepted.items,
          accepted.quote.category,
        );
        verifiedProject.contractPrice = accepted.items.reduce(
          (sum, item) => sum + item.estimate,
          0,
        );
      }
      try {
        agreement = prepareMsa(
          verifiedProject,
          scopeRows.map((item) => item.data as ScopeItem),
          staffMsaInput.parse(input),
          user,
          new Date().toISOString(),
        );
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
      } catch (cause) {
        throw new HttpError(
          400,
          cause instanceof Error ? cause.message : "Could not prepare the MSA.",
        );
      }
      const now = new Date(
        Math.max(Date.now(), Date.parse(row.updated_at) + 1),
      ).toISOString();
      const { data: updated, error: updateError } = await admin
        .from("remodel_records")
        .update({
          data: { ...project, msaAgreement: agreement, updatedAt: now },
          updated_at: now,
          updated_by: user.id,
        })
        .eq("organization_id", user.organizationId)
        .eq("id", projectId)
        .eq("kind", row.kind)
        .eq("updated_at", row.updated_at)
        .select("id");
      if (updateError) throw updateError;
      if (!updated?.length)
        throw new HttpError(
          409,
          "Project changed. Refresh before signing the MSA.",
        );
    }
    const url = `${appOrigin(request)}/client/${createClientEmailToken(link.id, agreement.ownerEmail)}/quote?view=msa`;
    const message = `Hello ${agreement.owner},\n\nPlease review and sign the Master Services Agreement for ${agreement.projectName}. You can read the full agreement and sign securely here:\n\n${url}\n\nAfter you sign, the deposit can be paid online or by check. Work begins after the deposit is received.\n\nPremium Remodel`;
    const messageId = await sendMsaEmail({
      organizationId: user.organizationId,
      to: agreement.ownerEmail,
      subject: "Premium Remodel Master Services Agreement",
      message,
    });
    let recorded = false;
    for (let attempt = 0; attempt < 3 && !recorded; attempt++) {
      const { data: fresh, error: freshError } = await admin
        .from("remodel_records")
        .select("kind,data,updated_at")
        .eq("organization_id", user.organizationId)
        .eq("id", projectId)
        .eq("kind", row.kind)
        .maybeSingle();
      if (freshError) throw freshError;
      const currentMsa = (fresh?.data as Project | Quote | undefined)
        ?.msaAgreement;
      if (!fresh || currentMsa?.termsSha256 !== agreement.termsSha256)
        throw new HttpError(
          409,
          "Email was sent, but the MSA record changed. Contact support before retrying.",
        );
      if (currentMsa.status === "sent" || currentMsa.status === "signed") {
        recorded = true;
        break;
      }
      const now = new Date(
        Math.max(Date.now(), Date.parse(fresh.updated_at) + 1),
      ).toISOString();
      const { data: sent, error: sentError } = await admin
        .from("remodel_records")
        .update({
          data: {
            ...fresh.data,
            msaAgreement: {
              ...agreement,
              status: "sent",
              sentAt: now,
              sendMessageId: messageId,
            },
            updatedAt: now,
          },
          updated_at: now,
          updated_by: user.id,
        })
        .eq("organization_id", user.organizationId)
        .eq("id", projectId)
        .eq("kind", row.kind)
        .eq("updated_at", fresh.updated_at)
        .select("id");
      if (sentError) throw sentError;
      recorded = Boolean(sent?.length);
    }
    if (!recorded)
      throw new HttpError(
        409,
        "Email was sent, but status could not be saved. Check Gmail Sent before retrying.",
      );
    try {
      await recordAuditEvent(user, {
        action: "created",
        entityKind: "msa",
        entityId: projectId,
        projectId,
        subject: `MSA emailed to ${agreement.ownerEmail}`,
        afterData: {
          termsSha256: agreement.termsSha256,
          sendMessageId: messageId,
          signer: agreement.staffSignature.name,
        },
      });
    } catch {
      console.error("Could not record MSA send audit event.");
    }
    return Response.json(
      { sent: true, messageId, url },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

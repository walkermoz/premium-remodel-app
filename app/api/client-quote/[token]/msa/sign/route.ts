import { apiError, checkOrigin, HttpError, limitAttempts } from "@/lib/auth";
import { readClientQuoteSource } from "@/lib/client-quote";
import { parseClientPortalToken } from "@/lib/client-portal";
import {
  cancellationDeadline,
  customerMsaInput,
  easternDate,
} from "@/lib/msa-contract";
import { sendMsaEmail } from "@/lib/msa-email";
import { buildMsaPdf } from "@/lib/msa-pdf";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { MsaAgreement, Project } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    checkOrigin(request);
    const { token } = await params;
    const linkId = parseClientPortalToken(token);
    if (!linkId) throw new HttpError(404, "Agreement link not found.");
    await limitAttempts(`client-msa-sign:${linkId}`, 8);
    const raw = await request.text();
    if (raw.length > 100_000)
      throw new HttpError(413, "Signature is too large.");
    const input = customerMsaInput.parse(JSON.parse(raw));
    const source = await readClientQuoteSource(token);
    if (!source?.view.approved || !source.view.msa)
      throw new HttpError(404, "Agreement is not ready for signature.");
    const admin = supabaseAdmin();
    const { data: row, error } = await admin
      .from("remodel_records")
      .select("data,updated_at")
      .eq("organization_id", source.organizationId)
      .eq("id", source.pdfQuote.id)
      .eq("kind", "project")
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new HttpError(404, "Project not found.");
    const project = row.data as Project;
    const agreement = project.msaAgreement;
    if (!agreement) throw new HttpError(404, "Agreement not found.");
    if (agreement.status === "signed")
      return Response.json({
        signed: true,
        signedAt: agreement.customerSignature?.signedAt,
      });
    if (agreement.status !== "sent")
      throw new HttpError(409, "The agreement has not been sent yet.");
    if (agreement.termsSha256 !== input.termsSha256)
      throw new HttpError(
        409,
        "The agreement changed. Refresh before signing.",
      );
    if (
      input.signedName.toLocaleLowerCase() !==
      agreement.owner.toLocaleLowerCase()
    )
      throw new HttpError(
        400,
        "The signer name must match the owner named in this agreement. Contact Premium Remodel to correct it.",
      );
    const now = new Date(
      Math.max(Date.now(), Date.parse(row.updated_at) + 1),
    ).toISOString();
    const transactionDate = easternDate(now);
    if (input.transactionDate !== transactionDate)
      throw new HttpError(
        409,
        "The date changed while this agreement was open. Refresh to review the completed cancellation notice before signing.",
      );
    const ip = (
      request.headers.get("x-vercel-forwarded-for") ||
      request.headers.get("x-forwarded-for") ||
      ""
    )
      .split(",")[0]
      .trim()
      .slice(0, 80);
    const signed: MsaAgreement = {
      ...agreement,
      status: "signed",
      transactionDate,
      cancellationDeadline: cancellationDeadline(transactionDate),
      customerSignature: {
        name: input.signedName,
        signedAt: now,
        signatureStrokes: input.signatureStrokes,
        ip,
        userAgent: (request.headers.get("user-agent") || "").slice(0, 300),
      },
    };
    const { data: updated, error: updateError } = await admin
      .from("remodel_records")
      .update({
        data: { ...project, msaAgreement: signed, updatedAt: now },
        updated_at: now,
        updated_by: null,
      })
      .eq("organization_id", source.organizationId)
      .eq("id", project.id)
      .eq("kind", "project")
      .eq("updated_at", row.updated_at)
      .select("id");
    if (updateError) throw updateError;
    if (!updated?.length)
      throw new HttpError(409, "The project changed. Refresh before signing.");
    let emailWarning: string | undefined;
    try {
      const pdf = await buildMsaPdf(signed);
      await sendMsaEmail({
        organizationId: source.organizationId,
        to: signed.ownerEmail,
        subject: "Your signed Premium Remodel agreement",
        message: `Hello ${signed.owner},\n\nYour signed Master Services Agreement is attached, including the completed Notice of Cancellation. You can also download it from your private quote page.\n\nThe deposit is now available to pay online or by check. Work begins after the deposit is received.\n\nPremium Remodel`,
        pdf,
      });
    } catch {
      emailWarning =
        "The agreement was signed, but we could not confirm delivery of the email copy. Download the signed PDF now or contact Premium Remodel.";
    }
    return Response.json(
      { signed: true, signedAt: now, emailWarning },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

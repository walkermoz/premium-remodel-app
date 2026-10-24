import { z } from "zod";
import { apiError, checkOrigin, HttpError, requireUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Quote } from "@/lib/types";

export const runtime = "nodejs";

const termsSchema = z.object({
  updatedAt: z.iso.datetime(),
  msaPaymentSchedule: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(64),
        milestone: z.string().trim().min(2).max(200),
        percent: z.number().finite().gt(0).lte(100),
      }),
    )
    .min(1)
    .max(12)
    .refine(
      (steps) =>
        new Set(steps.map((step) => step.id)).size === steps.length &&
        Math.abs(steps.reduce((sum, step) => sum + step.percent, 0) - 100) <
          0.001,
      "Payment milestones must have unique IDs and total 100%.",
    ),
  msaPermitResponsibility: z.enum([
    "Owner obtains and pays",
    "Premium Remodel obtains; owner pays fees",
    "Premium Remodel obtains and pays",
  ]),
  msaContractTerms: z.object({
    exclusions: z.string().trim().min(1).max(15000),
    allowances: z.string().trim().min(1).max(15000),
    retainage: z.string().trim().min(1).max(15000),
    buildersRisk: z.string().trim().min(1).max(15000),
    siteAccess: z.string().trim().min(1).max(15000),
    plans: z.string().trim().min(1).max(15000),
  }),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    if (user.group === "doorknocker")
      throw new HttpError(403, "This account cannot edit agreements.");
    const { projectId } = await params;
    if (!z.uuid().safeParse(projectId).success)
      throw new HttpError(400, "Choose a valid quote.");
    const input = termsSchema.parse(await request.json());
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
      quote.status !== "Accepted" ||
      !quote.quoteAcceptance ||
      quote.msaAgreement ||
      !quote.acceptedQuoteScope?.length
    )
      throw new HttpError(
        409,
        "The quote must be signed and the MSA must not have been sent.",
      );
    if (row.updated_at !== input.updatedAt)
      throw new HttpError(
        409,
        "Quote changed. Refresh before saving MSA terms.",
      );
    const now = new Date(
      Math.max(Date.now(), Date.parse(row.updated_at) + 1),
    ).toISOString();
    const data = {
      ...quote,
      msaPaymentSchedule: input.msaPaymentSchedule,
      msaPermitResponsibility: input.msaPermitResponsibility,
      msaContractTerms: input.msaContractTerms,
      updatedAt: now,
    };
    const { data: updated, error: updateError } = await admin
      .from("remodel_records")
      .update({ data, updated_at: now, updated_by: user.id })
      .eq("organization_id", user.organizationId)
      .eq("id", projectId)
      .eq("kind", "quote")
      .eq("updated_at", row.updated_at)
      .select("id");
    if (updateError) throw updateError;
    if (!updated?.length)
      throw new HttpError(
        409,
        "Quote changed. Refresh before saving MSA terms.",
      );
    return Response.json(data);
  } catch (error) {
    return apiError(error);
  }
}

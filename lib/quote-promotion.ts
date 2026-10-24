import "server-only";

import { quoteAcceptanceSchema } from "./quote-signature";
import { msaPaymentRows } from "./msa-contract";
import { supabaseAdmin } from "./supabase/server";
import type { Activity, Project, Quote } from "./types";

/** The quote remains a quote until the signed scope, signed MSA, and deposit exist. */
export async function promotePaidQuote(
  organizationId: string,
  quoteId: string,
) {
  const admin = supabaseAdmin();
  const { data: row, error } = await admin
    .from("remodel_records")
    .select("kind,data,updated_at")
    .eq("organization_id", organizationId)
    .eq("id", quoteId)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error("Quote is unavailable.");
  if (row.kind === "project") return row.data as Project;
  if (row.kind !== "quote") throw new Error("Quote is unavailable.");

  const quote = row.data as Quote;
  const agreement = quote.msaAgreement;
  const acceptance = quoteAcceptanceSchema.safeParse(quote.quoteAcceptance);
  if (
    quote.status !== "Accepted" ||
    !quote.quoteAcceptedAt ||
    !acceptance.success ||
    agreement?.status !== "signed" ||
    !agreement.customerSignature?.signatureStrokes.length ||
    !agreement.staffSignature?.signatureStrokes.length ||
    !agreement.termsSha256 ||
    !quote.acceptedQuoteScope?.length ||
    !quote.contractPrice
  )
    throw new Error(
      "Signed quote scope and MSA are required before project creation.",
    );

  const scopeCents = Math.round(
    quote.acceptedQuoteScope.reduce((sum, item) => sum + item.amount, 0) * 100,
  );
  if (
    scopeCents !== Math.round(quote.contractPrice * 100) ||
    scopeCents !== Math.round(agreement.price * 100) ||
    JSON.stringify(quote.acceptedQuoteScope) !== JSON.stringify(agreement.scope)
  )
    throw new Error("Signed scope and agreement totals do not match.");

  const depositCents = Math.round(msaPaymentRows(agreement)[0]?.amount * 100);
  if (!Number.isSafeInteger(depositCents) || depositCents <= 0)
    throw new Error("The agreement has no valid deposit milestone.");
  const { data: paymentRows, error: paymentError } = await admin
    .from("remodel_records")
    .select("data")
    .eq("organization_id", organizationId)
    .eq("project_id", quoteId)
    .eq("kind", "activity")
    .limit(1001);
  if (paymentError) throw paymentError;
  if (paymentRows.length > 1000)
    throw new Error("Too many payments to verify automatically.");
  const paidCents = paymentRows.reduce((sum, row) => {
    const activity = row.data as Activity;
    return activity.activityType === "Payment received"
      ? sum + Math.round((activity.amount || 0) * 100)
      : sum;
  }, 0);
  if (paidCents < depositCents) return null;

  const now = new Date(
    Math.max(Date.now(), Date.parse(row.updated_at) + 1),
  ).toISOString();
  const project: Project = {
    ...quote,
    status: "Planning",
    completedDate: "",
    updatedAt: now,
  };
  const { data: updated, error: updateError } = await admin
    .from("remodel_records")
    .update({ kind: "project", data: project, updated_at: now })
    .eq("organization_id", organizationId)
    .eq("id", quoteId)
    .eq("kind", "quote")
    .eq("updated_at", row.updated_at)
    .select("id");
  if (updateError) throw updateError;
  if (updated?.length) return project;
  const { data: latest, error: latestError } = await admin
    .from("remodel_records")
    .select("kind,data")
    .eq("organization_id", organizationId)
    .eq("id", quoteId)
    .maybeSingle();
  if (latestError) throw latestError;
  if (latest?.kind === "project") return latest.data as Project;
  throw new Error("Quote changed. Refresh before moving it to Projects.");
}

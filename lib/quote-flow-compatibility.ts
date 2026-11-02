import { msaPaymentAmounts } from "./msa-draft";
import type { QuoteFlowDefinition } from "./quote-flow-schema";
import type { Activity, Quote } from "./types";

type CompatibilityActivity = Pick<
  Activity,
  "activityType" | "amount" | "occurredAt" | "updatedAt"
>;

type CompatibilityValue = {
  id: string;
  stageId: string;
  blockId: string;
  value: Record<string, unknown>;
  completedBy: string | null;
  completedByType: "customer" | "staff" | "system";
  completedAt: string;
  updatedAt: string;
};

/**
 * Adapts Premium Remodel's existing quote/MSA records into the modular flow
 * completion shape. It never copies drawn signature strokes into flow values.
 */
export function premiumCompatibilityQuoteFlowValues(
  definition: QuoteFlowDefinition,
  quote: Quote,
  activities: CompatibilityActivity[] = [],
) {
  const values: CompatibilityValue[] = [];
  const agreement = quote.msaAgreement;
  for (const stage of definition.stages) {
    const legacyMsa = stage.blocks.some(
      (block) => block.config.renderer === "legacy_premium_msa_v1",
    );
    const legacyPortal = stage.blocks.some(
      (block) => block.config.renderer === "legacy_quote_portal_v1",
    );
    if (!legacyMsa && !legacyPortal) continue;

    for (const block of stage.blocks) {
      if (
        legacyMsa &&
        block.type === "signature" &&
        block.bindingKey === "agreement.staff_signature" &&
        agreement?.staffSignature?.name &&
        agreement.staffSignature.signedAt
      ) {
        values.push({
          id: `compat:${quote.id}:${block.id}`,
          stageId: stage.id,
          blockId: block.id,
          value: {
            method: "legacy_premium_msa",
            signedName: agreement.staffSignature.name,
            signerTitle: agreement.staffSignature.title || "",
            signedAt: agreement.staffSignature.signedAt,
            signerUserId: agreement.staffUserId,
          },
          completedBy: agreement.staffUserId,
          completedByType: "staff",
          completedAt: agreement.staffSignature.signedAt,
          updatedAt: agreement.staffSignature.signedAt,
        });
      }
      if (
        legacyPortal &&
        block.type === "signature" &&
        block.bindingKey === "quote.customer_signature" &&
        quote.quoteAcceptance?.signedName &&
        quote.quoteAcceptance.signedAt
      ) {
        values.push({
          id: `compat:${quote.id}:${block.id}`,
          stageId: stage.id,
          blockId: block.id,
          value: {
            method: "legacy_quote_acceptance",
            signedName: quote.quoteAcceptance.signedName,
            signedAt: quote.quoteAcceptance.signedAt,
          },
          completedBy: null,
          completedByType: "customer",
          completedAt: quote.quoteAcceptance.signedAt,
          updatedAt: quote.quoteAcceptance.signedAt,
        });
      }
      if (
        legacyPortal &&
        block.type === "signature" &&
        block.bindingKey === "agreement.customer_signature" &&
        agreement?.customerSignature?.name &&
        agreement.customerSignature.signedAt
      ) {
        values.push({
          id: `compat:${quote.id}:${block.id}`,
          stageId: stage.id,
          blockId: block.id,
          value: {
            method: "legacy_premium_msa",
            signedName: agreement.customerSignature.name,
            signedAt: agreement.customerSignature.signedAt,
          },
          completedBy: null,
          completedByType: "customer",
          completedAt: agreement.customerSignature.signedAt,
          updatedAt: agreement.customerSignature.signedAt,
        });
      }
      if (
        legacyPortal &&
        block.type === "deposit_collection" &&
        block.bindingKey === "payment.deposit" &&
        agreement?.status === "signed"
      ) {
        const depositCents = Math.round(
          Number(
            msaPaymentAmounts(agreement.price, agreement.paymentSchedule)[0] ||
              0,
          ) * 100,
        );
        const payments = activities.filter(
          (activity) => activity.activityType === "Payment received",
        );
        const paidCents = payments.reduce(
          (sum, activity) =>
            sum + Math.round(Number(activity.amount || 0) * 100),
          0,
        );
        const completedAt = payments
          .map((activity) => activity.occurredAt || activity.updatedAt)
          .filter(Boolean)
          .sort()
          .at(-1);
        if (depositCents > 0 && paidCents >= depositCents && completedAt)
          values.push({
            id: `compat:${quote.id}:${block.id}`,
            stageId: stage.id,
            blockId: block.id,
            value: {
              status: "paid",
              method: "legacy_payment_records",
              amountCents: depositCents,
              paidCents,
              completedAt,
            },
            completedBy: null,
            completedByType: "system",
            completedAt,
            updatedAt: completedAt,
          });
      }
    }
  }
  return values;
}

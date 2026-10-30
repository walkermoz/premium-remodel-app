import { acceptedScopeSnapshot } from "./msa-draft";
import type { Quote, ScopeItem } from "./types";

/** A staff-signed MSA must describe the exact quote the customer will sign. */
export function preparedMsaMatchesQuote(quote: Quote, items: ScopeItem[]) {
  const agreement = quote.msaAgreement;
  if (!agreement || agreement.status !== "prepared") return false;
  const quoteItems = items.filter((item) => item.projectId === quote.id);
  const total = quoteItems.reduce((sum, item) => sum + item.estimate, 0);
  return (
    Math.round(agreement.price * 100) === Math.round(total * 100) &&
    JSON.stringify(agreement.scope) ===
      JSON.stringify(acceptedScopeSnapshot(quoteItems, quote.category)) &&
    agreement.projectName === quote.name &&
    agreement.address === quote.address &&
    agreement.owner === quote.client.trim() &&
    agreement.ownerEmail === quote.clientEmail?.trim().toLowerCase() &&
    agreement.estimatedStart === quote.startDate &&
    agreement.estimatedCompletion === quote.endDate &&
    JSON.stringify(agreement.paymentSchedule) ===
      JSON.stringify(quote.msaPaymentSchedule) &&
    agreement.permitResponsibility === quote.msaPermitResponsibility &&
    JSON.stringify(agreement.terms) === JSON.stringify(quote.msaContractTerms)
  );
}

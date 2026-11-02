import { acceptedScopeSnapshot } from "./msa-draft";
import type { Quote, ScopeItem } from "./types";

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalJson(item)]),
    );
  return value;
}

function jsonValuesMatch(left: unknown, right: unknown) {
  return (
    JSON.stringify(canonicalJson(left)) === JSON.stringify(canonicalJson(right))
  );
}

/** A staff-signed MSA must describe the exact quote the customer will sign. */
export function preparedMsaMatchesQuote(quote: Quote, items: ScopeItem[]) {
  const agreement = quote.msaAgreement;
  if (!agreement || !["prepared", "sent"].includes(agreement.status))
    return false;
  const quoteItems = items.filter((item) => item.projectId === quote.id);
  const total = quoteItems.reduce((sum, item) => sum + item.estimate, 0);
  return (
    Math.round(agreement.price * 100) === Math.round(total * 100) &&
    jsonValuesMatch(
      agreement.scope,
      acceptedScopeSnapshot(quoteItems, quote.category),
    ) &&
    agreement.projectName === quote.name &&
    agreement.address === quote.address &&
    agreement.owner === quote.client.trim() &&
    agreement.ownerEmail === quote.clientEmail?.trim().toLowerCase() &&
    agreement.estimatedStart === quote.startDate &&
    agreement.estimatedCompletion === quote.endDate &&
    jsonValuesMatch(agreement.paymentSchedule, quote.msaPaymentSchedule) &&
    agreement.permitResponsibility === quote.msaPermitResponsibility &&
    jsonValuesMatch(agreement.terms, quote.msaContractTerms)
  );
}

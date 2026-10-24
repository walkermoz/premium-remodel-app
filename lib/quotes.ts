import type { Project, Quote, Workspace } from "./types";

export function nextQuoteNumber(
  workspace: Pick<Workspace, "projects" | "quotes">,
) {
  const highest = [...(workspace.quotes || []), ...workspace.projects].reduce(
    (maximum, record) => {
      const value = "quoteNumber" in record ? record.quoteNumber : undefined;
      return typeof value === "string" && /^\d+$/.test(value)
        ? Math.max(maximum, Number(value))
        : maximum;
    },
    0,
  );
  return String(highest + 1);
}

// Keep trusted historical values through edits without accepting client replacements.
export function preserveProjectHistory(
  data: Record<string, unknown>,
  current?: Project | Quote | null,
) {
  const result = { ...data };
  for (const key of [
    "contractPrice",
    "acceptedQuoteScope",
    "msaAgreement",
    "quoteSentAt",
    "quoteAcceptedAt",
    "quoteAcceptedBy",
    "quoteAcceptance",
    "quoteNumber",
    "quoteNotes",
    "preparedBy",
    "clientEmail",
    "clientPhone",
    "leadId",
    "outcomeAt",
    "revisedDate",
    "preparedByPhone",
    "importedFrom",
    "importedSources",
    "importedAt",
  ] as const) {
    if (
      current &&
      key in current &&
      ((key !== "clientEmail" && key !== "clientPhone") || !(key in data))
    )
      result[key] = (current as unknown as Record<string, unknown>)[key];
  }
  if (current && !("coverAttachmentId" in data))
    result.coverAttachmentId = current.coverAttachmentId;
  if (current && !("msaPaymentSchedule" in data))
    result.msaPaymentSchedule = current.msaPaymentSchedule;
  if (current && !("msaPermitResponsibility" in data))
    result.msaPermitResponsibility = current.msaPermitResponsibility;
  if (current && !("msaContractTerms" in data))
    result.msaContractTerms = current.msaContractTerms;
  return result;
}

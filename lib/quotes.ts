import type { Project, Quote } from "./types";

// Keep trusted historical values through edits without accepting client replacements.
export function preserveProjectHistory(
  data: Record<string, unknown>,
  current?: Project | Quote | null,
) {
  const result = { ...data };
  for (const key of [
    "contractPrice",
    "quoteSentAt",
    "quoteAcceptedAt",
    "quoteAcceptedBy",
    "clientEmail",
    "clientPhone",
    "leadId",
    "outcomeAt",
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
  return result;
}

export function acceptedQuote(quote: Quote, byId: string, at: string): Project {
  return {
    ...quote,
    status: "Planning",
    completedDate: "",
    quoteAcceptedAt: at,
    quoteAcceptedBy: byId,
    updatedAt: at,
  };
}

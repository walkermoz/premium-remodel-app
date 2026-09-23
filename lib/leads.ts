import type {
  Lead,
  LeadDisposition,
  LeadDispositionEvent,
  LeadStage,
  Quote,
  QuoteStatus,
} from "./types";

export function leadDisposition(lead: Lead): LeadDisposition {
  return lead.disposition || "Active";
}

export function isActiveFunnelLead(lead: Lead) {
  const disposition = leadDisposition(lead);
  return disposition === "Active";
}

/** Close-rate denominator excludes Junk/Spam/Test/Archive. */
export function countsTowardCloseRate(lead: Lead) {
  return isActiveFunnelLead(lead);
}

export function withDispositionChange(
  lead: Lead,
  next: LeadDisposition,
  actor: { id: string; name: string },
  at = new Date().toISOString(),
): Pick<Lead, "disposition" | "dispositionHistory"> {
  const from = leadDisposition(lead);
  if (from === next) {
    return {
      disposition: next,
      dispositionHistory: lead.dispositionHistory,
    };
  }
  const entry: LeadDispositionEvent = {
    at,
    byId: actor.id,
    byName: actor.name,
    from,
    to: next,
  };
  return {
    disposition: next,
    dispositionHistory: [...(lead.dispositionHistory || []), entry].slice(-100),
  };
}

export function stageForNewQuote(current: LeadStage): LeadStage {
  if (current === "New" || current === "Follow-up") return "Quote drafted";
  return current;
}

export function stageForQuoteStatus(
  status: QuoteStatus,
  current: LeadStage,
): LeadStage | null {
  if (status === "Draft") return stageForNewQuote(current);
  if (status === "Sent") return "Quote sent";
  if (status === "Declined") return "Lost";
  if (status === "Expired") return "Stale";
  return null;
}

export function leadPatchFromQuote(
  lead: Lead,
  quote: Pick<Quote, "status" | "leadId">,
  options: { accepted?: boolean } = {},
): Partial<Lead> | null {
  if (options.accepted) return { status: "Won" };
  const next = stageForQuoteStatus(quote.status, lead.status);
  if (!next || next === lead.status) return null;
  return { status: next };
}

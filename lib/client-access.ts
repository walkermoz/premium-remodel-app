import "server-only";

import { createClientEmailToken } from "./client-portal";
import { isValidClientQuoteSnapshot } from "./client-quote";
import { supabaseAdmin } from "./supabase/server";
import type { Quote, ScopeItem } from "./types";

export type ClientEmailQuote = {
  id: string;
  quote: Quote;
  items: ScopeItem[];
  url: string;
};

/** Only active quotes currently addressed to this email can be reissued. */
export async function clientQuotesForEmail(
  organizationId: string,
  email: string,
  origin: string,
  issuedAt = Date.now(),
) {
  const normalized = email.trim().toLowerCase();
  const admin = supabaseAdmin();
  const matches: Array<{
    id: string;
    projectId: string;
    quote: Quote;
    items: ScopeItem[];
  }> = [];
  for (let start = 0; ; start += 200) {
    const { data, error } = await admin
      .from("remodel_client_links")
      .select("id,project_id,quote_snapshot")
      .eq("organization_id", organizationId)
      .eq("kind", "quote")
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .range(start, start + 199);
    if (error) throw error;
    for (const link of data) {
      if (!isValidClientQuoteSnapshot(link.quote_snapshot)) continue;
      const snapshot = link.quote_snapshot as {
        quote: Quote;
        items: ScopeItem[];
      };
      if (
        snapshot.quote.id !== link.project_id ||
        snapshot.items.some((item) => item.projectId !== link.project_id)
      )
        continue;
      if (snapshot.quote.clientEmail?.trim().toLowerCase() !== normalized)
        continue;
      matches.push({
        id: link.id,
        projectId: link.project_id,
        quote: snapshot.quote,
        items: snapshot.items,
      });
    }
    if (data.length < 200) break;
  }
  if (!matches.length) return [] satisfies ClientEmailQuote[];

  const validRecords = new Map<string, Quote>();
  for (let start = 0; start < matches.length; start += 200) {
    const ids = matches.slice(start, start + 200).map((link) => link.projectId);
    const { data, error } = await admin
      .from("remodel_records")
      .select("id,kind,data")
      .eq("organization_id", organizationId)
      .in("id", ids);
    if (error) throw error;
    for (const record of data) {
      const current = record.data as Quote;
      if (
        current.clientEmail?.trim().toLowerCase() === normalized &&
        ((record.kind === "quote" && current.status === "Sent") ||
          (record.kind === "project" && Boolean(current.quoteAcceptedAt)))
      )
        validRecords.set(record.id, current);
    }
  }
  return matches
    .filter((link) => validRecords.has(link.projectId))
    .sort((a, b) =>
      (b.quote.quoteSentAt || b.quote.updatedAt).localeCompare(
        a.quote.quoteSentAt || a.quote.updatedAt,
      ),
    )
    .map((link) => ({
      id: link.id,
      quote: {
        ...link.quote,
        quoteAcceptedAt: validRecords.get(link.projectId)?.quoteAcceptedAt,
        quoteSentAt:
          validRecords.get(link.projectId)?.quoteSentAt ||
          link.quote.quoteSentAt,
      },
      items: link.items,
      url: `${origin}/client/${createClientEmailToken(link.id, normalized, issuedAt)}/quote`,
    }));
}

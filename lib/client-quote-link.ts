import "server-only";

import { randomUUID } from "node:crypto";
import { HttpError, type WorkspaceUser } from "./auth";
import { isValidClientQuoteSnapshot } from "./client-quote";
import { supabaseAdmin } from "./supabase/server";
import type { Quote, ScopeItem } from "./types";

/** Keep the emailed quote's private snapshot in sync with its PDF. */
export async function ensureEmailedQuoteLink(
  user: WorkspaceUser,
  quote: Quote,
  items: ScopeItem[],
  sentAt: string,
) {
  const snapshot = {
    quote: { ...quote, status: "Sent" as const, quoteSentAt: sentAt },
    items: items.filter((item) => item.projectId === quote.id),
  };
  if (!isValidClientQuoteSnapshot(snapshot))
    throw new HttpError(
      400,
      "Check the quote before emailing its portal link.",
    );

  const admin = supabaseAdmin();
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: existing, error: lookupError } = await admin
      .from("remodel_client_links")
      .select("id,revoked_at")
      .eq("organization_id", user.organizationId)
      .eq("project_id", quote.id)
      .eq("kind", "quote")
      .maybeSingle();
    if (lookupError) throw lookupError;

    if (existing && !existing.revoked_at) {
      const { data, error } = await admin
        .from("remodel_client_links")
        .update({ quote_snapshot: snapshot })
        .eq("organization_id", user.organizationId)
        .eq("id", existing.id)
        .eq("kind", "quote")
        .is("revoked_at", null)
        .select("id");
      if (error) throw error;
      if (data?.length) return existing.id as string;
      continue;
    }

    const id = randomUUID();
    if (existing) {
      const { data, error } = await admin
        .from("remodel_client_links")
        .update({
          id,
          quote_snapshot: snapshot,
          created_by: user.id,
          created_at: sentAt,
          revoked_at: null,
          last_viewed_at: null,
          view_count: 0,
        })
        .eq("organization_id", user.organizationId)
        .eq("id", existing.id)
        .eq("kind", "quote")
        .eq("revoked_at", existing.revoked_at)
        .select("id");
      if (error) throw error;
      if (data?.length) return id;
      continue;
    }
    const { error } = await admin.from("remodel_client_links").insert({
      id,
      organization_id: user.organizationId,
      project_id: quote.id,
      kind: "quote",
      quote_snapshot: snapshot,
      created_by: user.id,
      created_at: sentAt,
      revoked_at: null,
    });
    if (!error) return id;
    if (error.code !== "23505") throw error;
  }
  throw new HttpError(409, "Client link changed. Try sending the quote again.");
}

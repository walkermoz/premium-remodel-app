import "server-only";

import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { HttpError, type WorkspaceUser } from "./auth";
import { isValidClientQuoteSnapshot } from "./client-quote";
import { supabaseAdmin } from "./supabase/server";
import type { Quote, ScopeItem } from "./types";

function comparableSnapshot(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(comparableSnapshot);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(
        ([key]) =>
          !["createdAt", "updatedAt", "quoteSentAt", "quoteOnsiteAt"].includes(
            key,
          ),
      )
      .map(([key, item]) => [key, comparableSnapshot(item)]),
  );
}

export async function createQuoteRevision(
  user: WorkspaceUser,
  quoteId: string,
  snapshot: Record<string, unknown>,
) {
  const admin = supabaseAdmin();
  for (let attempt = 0; attempt < 3; attempt++) {
    const latest = await admin
      .from("remodel_quote_document_revisions")
      .select("revision")
      .eq("organization_id", user.organizationId)
      .eq("quote_id", quoteId)
      .order("revision", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest.error) throw latest.error;
    const id = randomUUID();
    const revision = Number(latest.data?.revision || 0) + 1;
    const inserted = await admin
      .from("remodel_quote_document_revisions")
      .insert({
        id,
        organization_id: user.organizationId,
        quote_id: quoteId,
        revision,
        snapshot,
        created_by: user.id,
      });
    if (!inserted.error) return { id, revision };
    if (inserted.error.code !== "23505") throw inserted.error;
  }
  throw new HttpError(409, "Quote revision changed. Try again.");
}

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
      .select("id,revoked_at,quote_snapshot,document_revision")
      .eq("organization_id", user.organizationId)
      .eq("project_id", quote.id)
      .eq("kind", "quote")
      .maybeSingle();
    if (lookupError) throw lookupError;

    if (
      existing &&
      !existing.revoked_at &&
      isDeepStrictEqual(
        comparableSnapshot(existing.quote_snapshot),
        comparableSnapshot(snapshot),
      )
    )
      return existing.id as string;

    const revision = await createQuoteRevision(
      user,
      quote.id,
      snapshot as unknown as Record<string, unknown>,
    );

    if (existing && !existing.revoked_at) {
      const nextLinkId = randomUUID();
      const { data, error } = await admin
        .from("remodel_client_links")
        .update({
          id: nextLinkId,
          quote_snapshot: snapshot,
          document_revision_id: revision.id,
          document_revision: revision.revision,
          created_by: user.id,
          created_at: sentAt,
          last_viewed_at: null,
          view_count: 0,
        })
        .eq("organization_id", user.organizationId)
        .eq("id", existing.id)
        .eq("kind", "quote")
        .is("revoked_at", null)
        .select("id");
      if (error) throw error;
      if (data?.length) return nextLinkId;
      await admin
        .from("remodel_quote_document_revisions")
        .delete()
        .eq("organization_id", user.organizationId)
        .eq("id", revision.id);
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
          document_revision_id: revision.id,
          document_revision: revision.revision,
        })
        .eq("organization_id", user.organizationId)
        .eq("id", existing.id)
        .eq("kind", "quote")
        .eq("revoked_at", existing.revoked_at)
        .select("id");
      if (error) throw error;
      if (data?.length) return id;
      await admin
        .from("remodel_quote_document_revisions")
        .delete()
        .eq("organization_id", user.organizationId)
        .eq("id", revision.id);
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
      document_revision_id: revision.id,
      document_revision: revision.revision,
    });
    if (!error) return id;
    await admin
      .from("remodel_quote_document_revisions")
      .delete()
      .eq("organization_id", user.organizationId)
      .eq("id", revision.id);
    if (error.code !== "23505") throw error;
  }
  throw new HttpError(409, "Client link changed. Try sending the quote again.");
}

import "server-only";

import { z } from "zod";
import { parseClientPortalToken } from "./client-portal";
import { quoteAcceptanceSchema } from "./quote-signature";
import { supabaseAdmin } from "./supabase/server";
import type { Quote, ScopeItem } from "./types";

const quoteSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  client: z.string(),
  address: z.string(),
  category: z.string(),
  status: z.string(),
  quoteNumber: z.string().optional(),
  revisedDate: z.string().optional(),
  clientPhone: z.string().optional(),
  preparedBy: z.string().optional(),
  preparedByPhone: z.string().optional(),
  quoteSentAt: z.string().optional(),
  quoteAcceptedAt: z.string().optional(),
  quoteNotes: z.string().optional(),
  updatedAt: z.string(),
});

const itemSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  details: z.string().optional(),
  estimate: z.number().finite(),
  sectionId: z.string().optional(),
  sectionName: z.string().optional(),
  position: z.number().optional(),
});
const snapshotSchema = z.object({
  quote: quoteSchema
    .extend({
      status: z.literal("Sent"),
      createdAt: z.string(),
      startDate: z.string(),
      endDate: z.string(),
      description: z.string(),
      cover: z.enum([
        "",
        "/images/kitchen.jpg",
        "/images/bathroom.jpg",
        "/images/basement.jpg",
        "/images/outdoor.jpg",
        "/images/home.jpg",
      ]),
    })
    .passthrough(),
  items: z
    .array(
      itemSchema
        .extend({
          projectId: z.uuid(),
          createdAt: z.string().optional(),
          updatedAt: z.string().optional(),
          quantity: z.number().finite().optional(),
          unit: z.string().optional(),
          subCost: z.number().finite().optional(),
          materialCost: z.number().finite().optional(),
          contractorId: z.string().optional(),
          status: z.enum(["To do", "In progress", "Done"]).optional(),
        })
        .passthrough(),
    )
    .max(500),
});

export type ClientQuoteItem = z.infer<typeof itemSchema>;
export type ClientQuoteView = {
  quote: z.infer<typeof quoteSchema>;
  items: ClientQuoteItem[];
  total: number;
  approved: boolean;
  acceptance?: Pick<
    z.infer<typeof quoteAcceptanceSchema>,
    "signedName" | "signedAt" | "signatureStrokes"
  >;
};

export function isValidClientQuoteSnapshot(value: unknown) {
  return snapshotSchema.safeParse(value).success;
}

/** The shared token only grants access to this one quote and its public scope. */
export async function readClientQuoteSource(token: string) {
  const id = parseClientPortalToken(token);
  if (!id) return null;

  const admin = supabaseAdmin();
  const { data: link, error: linkError } = await admin
    .from("remodel_client_links")
    .select("id,organization_id,project_id,quote_snapshot")
    .eq("id", id)
    .eq("kind", "quote")
    .is("revoked_at", null)
    .maybeSingle();
  if (linkError) throw linkError;
  if (!link) return null;

  const quoteResult = await admin
    .from("remodel_records")
    .select("kind,data")
    .eq("organization_id", link.organization_id)
    .eq("id", link.project_id)
    .maybeSingle();
  if (quoteResult.error) throw quoteResult.error;

  const record = quoteResult.data;
  const snapshot = snapshotSchema.safeParse(link.quote_snapshot);
  if (
    !record ||
    !snapshot.success ||
    snapshot.data.quote.id !== link.project_id ||
    snapshot.data.quote.status !== "Sent"
  )
    return null;
  if (snapshot.data.items.some((item) => item.projectId !== link.project_id))
    return null;
  const acceptedAt = z
    .object({ quoteAcceptedAt: z.string() })
    .safeParse(record.data);
  const approved = record.kind === "project" && acceptedAt.success;
  const parsedAcceptance = quoteAcceptanceSchema.safeParse(
    z.object({ quoteAcceptance: z.unknown() }).safeParse(record.data).data
      ?.quoteAcceptance,
  );
  const acceptance =
    approved && parsedAcceptance.success ? parsedAcceptance.data : undefined;
  if (record.kind !== "quote" && !approved) return null;
  if (record.kind === "quote") {
    const liveStatus = z
      .object({ status: z.literal("Sent") })
      .safeParse(record.data);
    if (!liveStatus.success) return null;
  }

  const items = snapshot.data.items
    .map((item) => itemSchema.parse(item))
    .sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity));
  const view: ClientQuoteView = {
    quote: {
      ...quoteSchema.parse(snapshot.data.quote),
      quoteAcceptedAt: approved ? acceptedAt.data.quoteAcceptedAt : undefined,
    },
    items,
    total: items.reduce((sum, item) => sum + item.estimate, 0),
    approved,
    acceptance: acceptance
      ? {
          signedName: acceptance.signedName,
          signedAt: acceptance.signedAt,
          signatureStrokes: acceptance.signatureStrokes,
        }
      : undefined,
  };

  await admin.rpc("remodel_note_client_portal_view", { target_link: id });
  return {
    view,
    organizationId: link.organization_id as string,
    // Kept on the server for the same customer-facing PDF used in the dashboard.
    pdfQuote: {
      ...snapshot.data.quote,
      quoteAcceptance: acceptance,
      quoteAcceptedAt: approved ? acceptedAt.data.quoteAcceptedAt : undefined,
    } as Quote,
    pdfItems: snapshot.data.items.map((item) => ({
      ...item,
      createdAt: item.createdAt || snapshot.data.quote.createdAt,
      updatedAt: item.updatedAt || snapshot.data.quote.updatedAt,
      quantity: item.quantity ?? 1,
      unit: item.unit || "job",
      subCost: item.subCost ?? 0,
      contractorId: item.contractorId || "",
      status: item.status || "To do",
    })) as ScopeItem[],
  };
}

export async function readClientQuote(token: string) {
  return (await readClientQuoteSource(token))?.view || null;
}

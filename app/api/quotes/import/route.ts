import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  apiError,
  checkOrigin,
  HttpError,
  limitAttempts,
  requireUser,
} from "@/lib/auth";
import { importedQuoteSchema } from "@/lib/quote-import";
import { allocateQuoteNumber } from "@/lib/repository";
import { schemas } from "@/lib/schemas";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    if (user.group === "doorknocker")
      throw new HttpError(403, "This account cannot import quotes.");
    await limitAttempts(`quote-import-save:${user.id}`, 20);
    const parsed = z
      .object({ quotes: z.array(importedQuoteSchema).min(1).max(5) })
      .safeParse(await request.json());
    if (!parsed.success)
      throw new HttpError(
        400,
        "Review the extracted quote details and try again.",
      );
    const now = new Date().toISOString();
    const records: {
      id: string;
      organization_id: string;
      created_by: string;
      updated_by: string;
      kind: "quote" | "scope";
      project_id: string | null;
      data: Record<string, unknown>;
      updated_at: string;
    }[] = [];
    const quotes: Record<string, unknown>[] = [];
    const scope: Record<string, unknown>[] = [];
    if (
      new Set(parsed.data.quotes.map((draft) => draft.fileName)).size !==
      parsed.data.quotes.length
    )
      throw new HttpError(400, "Choose each proposal only once.");
    for (const draft of parsed.data.quotes) {
      const { data: existing, error: lookupError } = await supabaseAdmin()
        .from("remodel_records")
        .select("id")
        .eq("organization_id", user.organizationId)
        .eq("kind", "quote")
        .eq("data->>importedFrom", draft.fileName)
        .limit(1);
      if (lookupError) throw lookupError;
      if (existing.length)
        throw new HttpError(
          409,
          `${draft.fileName} was already imported. Open the existing quote instead.`,
        );
      const sum = draft.rows.reduce(
        (total, row) => total + Math.round(row.amount * 100),
        0,
      );
      if (Math.abs(sum - Math.round(draft.expectedTotal * 100)) > 1)
        throw new HttpError(
          400,
          `${draft.name}: line items do not match the proposal total.`,
        );
      const quoteData = schemas.quote.parse({
        name: draft.name,
        client: draft.client,
        address: draft.address,
        description: draft.description,
        quoteNotes: draft.quoteNotes,
        category: draft.category,
        cover: "",
        startDate: "",
        endDate: "",
        status: "Draft",
        importedFrom: draft.fileName,
        importedAt: now,
      });
      const quote = {
        ...quoteData,
        quoteNumber: await allocateQuoteNumber(user),
        preparedBy: draft.preparedBy || user.name || "Premium Remodel",
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
      };
      quotes.push(quote);
      records.push({
        id: quote.id,
        organization_id: user.organizationId,
        created_by: user.id,
        updated_by: user.id,
        kind: "quote",
        project_id: null,
        data: quote,
        updated_at: now,
      });
      const sections = new Map<string, string>();
      for (const [position, row] of draft.rows.entries()) {
        if (!sections.has(row.sectionName))
          sections.set(row.sectionName, randomUUID());
        const itemData = schemas.scope.parse({
          projectId: quote.id,
          sectionId: sections.get(row.sectionName),
          sectionName: row.sectionName,
          position,
          title: row.title,
          details: "",
          quantity: 1,
          unit: "job",
          estimate: row.amount,
          subCost: 0,
          materialCost: /material|allowance/i.test(row.sectionName)
            ? row.amount
            : 0,
          contractorId: "",
          status: "To do",
        });
        const item = {
          ...itemData,
          id: randomUUID(),
          createdAt: now,
          updatedAt: now,
        };
        scope.push(item);
        records.push({
          id: item.id,
          organization_id: user.organizationId,
          created_by: user.id,
          updated_by: user.id,
          kind: "scope",
          project_id: quote.id,
          data: item,
          updated_at: now,
        });
      }
    }
    const { error } = await supabaseAdmin()
      .from("remodel_records")
      .insert(records);
    if (error) throw error;
    return Response.json({ quotes, scope }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

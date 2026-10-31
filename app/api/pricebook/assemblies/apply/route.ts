import { randomUUID } from "node:crypto";
import { z } from "zod";
import { apiError, checkOrigin, HttpError, requireUser } from "@/lib/auth";
import { getBusinessConfig } from "@/lib/business-config";
import { mapPricebookAssembly } from "@/lib/pricebook-assemblies";
import { mapPricebookItem, pricebookScopeValues } from "@/lib/pricebook";
import { findRecord, getWorkspace, insertRecords } from "@/lib/repository";
import { schemas } from "@/lib/schemas";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Quote } from "@/lib/types";
import { canEditWorkspaceRecord } from "@/lib/workspace-tab-access";

export const runtime = "nodejs";
const requestSchema = z.object({
  quoteId: z.uuid(),
  assemblyId: z.uuid(),
  revision: z.number().int().positive(),
});

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    const config = await getBusinessConfig(user);
    if (
      !config.features.priceBook ||
      !config.quotePreferences.showPriceBookPicker ||
      !canEditWorkspaceRecord(config, user.group, "scope")
    )
      throw new HttpError(
        403,
        "Price-book assemblies are not available for this quote.",
      );
    const input = requestSchema.parse(await request.json());
    const quote = (await findRecord(
      user,
      input.quoteId,
      "quote",
    )) as Quote | null;
    if (!quote) throw new HttpError(404, "Quote not found.");
    if (quote.status === "Accepted")
      throw new HttpError(409, "The signed quote scope cannot be changed.");
    const { data: row, error } = await supabaseAdmin()
      .from("remodel_pricebook_assemblies")
      .select("*")
      .eq("organization_id", user.organizationId)
      .eq("id", input.assemblyId)
      .eq("active", true)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new HttpError(404, "Assembly not found.");
    const assembly = mapPricebookAssembly(row);
    if (assembly.revision !== input.revision)
      throw new HttpError(409, "This assembly changed. Refresh and try again.");
    const ids = [
      ...new Set(assembly.components.map((part) => part.pricebookItemId)),
    ];
    const { data: itemRows, error: itemError } = await supabaseAdmin()
      .from("remodel_pricebook_items")
      .select("*")
      .eq("organization_id", user.organizationId)
      .eq("active", true)
      .in("id", ids);
    if (itemError) throw itemError;
    if (itemRows.length !== ids.length)
      throw new HttpError(
        409,
        "An assembly item was archived. Update the assembly first.",
      );
    const itemMap = new Map(
      itemRows.map((item) => [String(item.id), mapPricebookItem(item)]),
    );
    const workspace = await getWorkspace(user);
    const current = workspace.scope.filter(
      (item) => item.projectId === quote.id,
    );
    const start =
      current.reduce((max, item) => Math.max(max, item.position ?? 0), -1) + 1;
    const sectionId = randomUUID();
    const rows = assembly.components.map((part, index) => {
      const item = itemMap.get(part.pricebookItemId)!;
      let values;
      try {
        values = pricebookScopeValues(item, part.quantity, part.contractorId);
      } catch {
        throw new HttpError(
          409,
          `The contractor rate for ${item.name} changed. Update the assembly first.`,
        );
      }
      return schemas.scope.parse({
        projectId: quote.id,
        sectionId,
        sectionName: assembly.name,
        position: start + index,
        ...values,
        contractorId: part.contractorId || "",
        status: "To do",
      });
    });
    const inserted = await insertRecords(user, "scope", rows);
    return Response.json({ items: inserted, sectionId }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

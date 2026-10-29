import { z } from "zod";
import {
  apiError,
  checkOrigin,
  HttpError,
  requireUser,
  type WorkspaceUser,
} from "@/lib/auth";
import { getBusinessConfig } from "@/lib/business-config";
import { mapPricebookItem, pricebookInput } from "@/lib/pricebook";
import { supabaseAdmin } from "@/lib/supabase/server";
import { canOpenWorkspaceTab } from "@/lib/workspace-tab-access";

export const runtime = "nodejs";

async function requirePricebook(readForQuote = false) {
  const user = await requireUser();
  const config = await getBusinessConfig(user);
  if (
    !canOpenWorkspaceTab(config, user.group, "Price book") &&
    !(
      readForQuote &&
      config.features.priceBook &&
      config.quotePreferences.showPriceBookPicker &&
      canOpenWorkspaceTab(config, user.group, "Quotes")
    )
  )
    throw new HttpError(
      403,
      "The price book is not available for this organization.",
    );
  return user;
}

async function validateContractorRates(
  user: WorkspaceUser,
  rates?: { contractorId: string }[],
) {
  if (!rates?.length) return;
  const ids = rates.map((rate) => rate.contractorId);
  const { data, error } = await supabaseAdmin()
    .from("remodel_records")
    .select("id")
    .eq("organization_id", user.organizationId)
    .eq("kind", "contractor")
    .in("id", ids);
  if (error) throw error;
  if (data.length !== ids.length)
    throw new HttpError(400, "Choose contractors from this organization.");
}

export async function GET() {
  try {
    const user = await requirePricebook(true);
    const { data, error } = await supabaseAdmin()
      .from("remodel_pricebook_items")
      .select("*")
      .eq("organization_id", user.organizationId)
      .eq("active", true)
      .order("category")
      .order("name");
    if (error) throw error;
    return Response.json(data.map(mapPricebookItem), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requirePricebook();
    if (user.role !== "admin")
      throw new HttpError(403, "Only administrators can edit the price book.");
    const input = pricebookInput.parse(await request.json());
    await validateContractorRates(user, input.contractorRates);
    const { data, error } = await supabaseAdmin()
      .from("remodel_pricebook_items")
      .insert({
        organization_id: user.organizationId,
        name: input.name,
        description: input.description,
        category: input.category,
        unit: input.unit,
        customer_rate_cents: input.customerRateCents,
        customer_visible: input.customerVisible,
        sub_unit: input.subUnit,
        sub_rate_cents: input.subRateCents,
        material_unit: input.materialUnit,
        material_rate_cents: input.materialRateCents,
        contractor_rates: input.contractorRates || [],
      })
      .select("*")
      .single();
    if (error) throw error;
    return Response.json(mapPricebookItem(data), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    checkOrigin(request);
    const user = await requirePricebook();
    if (user.role !== "admin")
      throw new HttpError(403, "Only administrators can edit the price book.");
    const { id, revision, ...input } = pricebookInput
      .extend({ id: z.uuid(), revision: z.number().int().positive() })
      .parse(await request.json());
    await validateContractorRates(user, input.contractorRates);
    const { data, error } = await supabaseAdmin()
      .from("remodel_pricebook_items")
      .update({
        name: input.name,
        description: input.description,
        category: input.category,
        unit: input.unit,
        customer_rate_cents: input.customerRateCents,
        customer_visible: input.customerVisible,
        sub_unit: input.subUnit,
        sub_rate_cents: input.subRateCents,
        material_unit: input.materialUnit,
        material_rate_cents: input.materialRateCents,
        ...(input.contractorRates
          ? { contractor_rates: input.contractorRates }
          : {}),
        revision: revision + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", user.organizationId)
      .eq("id", id)
      .eq("revision", revision)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data)
      throw new HttpError(
        409,
        "This price-book item changed. Refresh and try again.",
      );
    return Response.json(mapPricebookItem(data));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
    const user = await requirePricebook();
    if (user.role !== "admin")
      throw new HttpError(403, "Only administrators can edit the price book.");
    const { id } = z.object({ id: z.uuid() }).parse(await request.json());
    const { data, error } = await supabaseAdmin()
      .from("remodel_pricebook_items")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("organization_id", user.organizationId)
      .eq("id", id)
      .select("id");
    if (error) throw error;
    if (!data.length) throw new HttpError(404, "Price-book item not found.");
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

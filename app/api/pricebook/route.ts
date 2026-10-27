import { z } from "zod";
import { apiError, checkOrigin, HttpError, requireUser } from "@/lib/auth";
import { getBusinessConfig } from "@/lib/business-config";
import { mapPricebookItem, pricebookInput } from "@/lib/pricebook";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

async function requirePricebook() {
  const user = await requireUser();
  if (
    user.group === "doorknocker" ||
    !(await getBusinessConfig(user)).features.priceBook
  )
    throw new HttpError(
      403,
      "The price book is not available for this organization.",
    );
  return user;
}

export async function GET() {
  try {
    const user = await requirePricebook();
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
    const { data, error } = await supabaseAdmin()
      .from("remodel_pricebook_items")
      .insert({
        organization_id: user.organizationId,
        name: input.name,
        description: input.description,
        category: input.category,
        unit: input.unit,
        customer_rate_cents: input.customerRateCents,
        sub_unit: input.subUnit,
        sub_rate_cents: input.subRateCents,
        material_unit: input.materialUnit,
        material_rate_cents: input.materialRateCents,
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
    const { data, error } = await supabaseAdmin()
      .from("remodel_pricebook_items")
      .update({
        name: input.name,
        description: input.description,
        category: input.category,
        unit: input.unit,
        customer_rate_cents: input.customerRateCents,
        sub_unit: input.subUnit,
        sub_rate_cents: input.subRateCents,
        material_unit: input.materialUnit,
        material_rate_cents: input.materialRateCents,
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

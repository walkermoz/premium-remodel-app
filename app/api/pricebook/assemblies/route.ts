import { z } from "zod";
import { apiError, checkOrigin, HttpError, requireUser } from "@/lib/auth";
import { getBusinessConfig } from "@/lib/business-config";
import {
  assemblyInput,
  mapPricebookAssembly,
} from "@/lib/pricebook-assemblies";
import { mapPricebookItem } from "@/lib/pricebook";
import { supabaseAdmin } from "@/lib/supabase/server";
import { canOpenWorkspaceTab } from "@/lib/workspace-tab-access";
import { requireOrganizationCapability } from "@/lib/organization-permissions";

export const runtime = "nodejs";

async function access(edit = false) {
  const user = await requireUser();
  const config = await getBusinessConfig(user);
  if (
    !canOpenWorkspaceTab(config, user.group, "Price book") &&
    !(
      config.features.priceBook &&
      config.quotePreferences.showPriceBookPicker &&
      canOpenWorkspaceTab(config, user.group, "Quotes")
    )
  )
    throw new HttpError(
      403,
      "The price book is not available for this organization.",
    );
  if (edit) {
    if (!canOpenWorkspaceTab(config, user.group, "Price book"))
      throw new HttpError(403, "The price book is not available to your role.");
    await requireOrganizationCapability(user, "pricebook.manage");
  }
  return user;
}

async function validateComponents(
  organizationId: string,
  components: z.infer<typeof assemblyInput>["components"],
) {
  const ids = [...new Set(components.map((part) => part.pricebookItemId))];
  const { data, error } = await supabaseAdmin()
    .from("remodel_pricebook_items")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("active", true)
    .in("id", ids);
  if (error) throw error;
  if (data.length !== ids.length)
    throw new HttpError(
      400,
      "Every assembly component must be an active item in this price book.",
    );
  const items = new Map(
    data.map((row) => [String(row.id), mapPricebookItem(row)]),
  );
  for (const part of components) {
    const item = items.get(part.pricebookItemId)!;
    if (item.contractorRates.length && !part.contractorId)
      throw new HttpError(400, `Choose a contractor for ${item.name}.`);
    if (
      part.contractorId &&
      !item.contractorRates.some(
        (rate) => rate.contractorId === part.contractorId,
      )
    )
      throw new HttpError(
        400,
        `Choose a valid contractor rate for ${item.name}.`,
      );
  }
  return items;
}

export async function GET() {
  try {
    const user = await access();
    const { data, error } = await supabaseAdmin()
      .from("remodel_pricebook_assemblies")
      .select("*")
      .eq("organization_id", user.organizationId)
      .eq("active", true)
      .order("category")
      .order("name");
    if (error) throw error;
    return Response.json(data.map(mapPricebookAssembly), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await access(true);
    const input = assemblyInput.parse(await request.json());
    await validateComponents(user.organizationId, input.components);
    const { data, error } = await supabaseAdmin()
      .from("remodel_pricebook_assemblies")
      .insert({ organization_id: user.organizationId, ...input })
      .select("*")
      .single();
    if (error) throw error;
    return Response.json(mapPricebookAssembly(data), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    checkOrigin(request);
    const user = await access(true);
    const { id, revision, ...input } = assemblyInput
      .extend({ id: z.uuid(), revision: z.number().int().positive() })
      .parse(await request.json());
    await validateComponents(user.organizationId, input.components);
    const { data, error } = await supabaseAdmin()
      .from("remodel_pricebook_assemblies")
      .update({
        ...input,
        revision: revision + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", user.organizationId)
      .eq("id", id)
      .eq("revision", revision)
      .eq("active", true)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data)
      throw new HttpError(409, "This assembly changed. Refresh and try again.");
    return Response.json(mapPricebookAssembly(data));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    checkOrigin(request);
    const user = await access(true);
    const { id, revision } = z
      .object({ id: z.uuid(), revision: z.number().int().positive() })
      .parse(await request.json());
    const { data, error } = await supabaseAdmin()
      .from("remodel_pricebook_assemblies")
      .update({
        active: false,
        revision: revision + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", user.organizationId)
      .eq("id", id)
      .eq("revision", revision)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data)
      throw new HttpError(409, "This assembly changed. Refresh and try again.");
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

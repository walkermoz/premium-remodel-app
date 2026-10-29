import { z } from "zod";
import { apiError, checkOrigin, HttpError, requireUser } from "@/lib/auth";
import { findRecord } from "@/lib/repository";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireWorkspaceTabs } from "@/lib/workspace-tab-access-server";
import type { Quote, ScopeItem } from "@/lib/types";

export const runtime = "nodejs";

const pricingInput = z.object({
  quoteId: z.uuid(),
  items: z
    .array(z.object({ id: z.uuid(), updatedAt: z.string().min(1) }))
    .min(1)
    .max(1000),
  subMultiplier: z.number().finite().min(0).max(100),
  materialMultiplier: z.number().finite().min(0).max(100),
});

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    await requireWorkspaceTabs(user, "Quotes");
    if (user.group === "doorknocker")
      throw new HttpError(403, "Door-knocker records cannot be edited here.");
    const input = pricingInput.parse(await request.json());
    const quote = (await findRecord(
      user,
      input.quoteId,
      "quote",
    )) as Quote | null;
    if (!quote) throw new HttpError(404, "Quote not found.");
    if (quote.status === "Accepted")
      throw new HttpError(409, "The signed quote scope cannot be changed.");

    const { data, error } = await supabaseAdmin().rpc(
      "remodel_price_quote_scope",
      {
        target_organization: user.organizationId,
        target_quote: input.quoteId,
        selected_ids: input.items.map((item) => item.id),
        expected_versions: input.items.map((item) => item.updatedAt),
        sub_multiplier: input.subMultiplier,
        material_multiplier: input.materialMultiplier,
        actor_profile: user.id,
      },
    );
    if (error) {
      if (error.code === "P0002") throw new HttpError(404, "Quote not found.");
      if (error.code === "P0001") throw new HttpError(409, error.message);
      if (error.code === "22023") throw new HttpError(400, error.message);
      throw error;
    }
    return Response.json(data as ScopeItem[], {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}

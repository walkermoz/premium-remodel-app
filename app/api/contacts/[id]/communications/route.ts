import { z } from "zod";
import { apiError, HttpError, requireUser } from "@/lib/auth";
import { listContactCommunications } from "@/lib/contact-communications";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireWorkspaceTabs } from "@/lib/workspace-tab-access-server";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    await requireWorkspaceTabs(user, "Contacts", "Leads", "Quotes");
    const { id } = await params;
    const contactId = z.uuid().parse(id);
    const { data: contact, error: contactError } = await supabaseAdmin()
      .from("remodel_records")
      .select("id,created_by")
      .eq("organization_id", user.organizationId)
      .eq("kind", "contact")
      .eq("id", contactId)
      .maybeSingle();
    if (contactError) throw contactError;
    if (
      !contact ||
      (user.group === "doorknocker" && contact.created_by !== user.id)
    )
      throw new HttpError(404, "Contact not found.");
    const url = new URL(request.url);
    const offset = z.coerce
      .number()
      .int()
      .min(0)
      .max(10_000)
      .default(0)
      .parse(url.searchParams.get("offset") || 0);
    return Response.json(
      await listContactCommunications(user, contactId, offset),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

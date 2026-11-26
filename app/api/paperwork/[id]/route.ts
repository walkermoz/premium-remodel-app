import { z } from "zod";
import {
  apiError,
  appOrigin,
  checkOrigin,
  requireUser,
  HttpError,
} from "@/lib/auth";
import { requireOrganizationCapability } from "@/lib/organization-permissions";
import {
  paperworkRecord,
  startPaperwork,
  savePaperworkDraft,
} from "@/lib/paperwork";
import { supabaseAdmin } from "@/lib/supabase/server";
export const runtime = "nodejs";
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    await requireOrganizationCapability(user, "agreements.manage");
    const raw = await request.text();
    if (raw.length > 100_000)
      throw new HttpError(413, "Paperwork data is too large.");
    return Response.json(
      await savePaperworkDraft(user, (await params).id, JSON.parse(raw)),
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    await requireOrganizationCapability(user, "agreements.manage");
    const { id } = await params;
    z.uuid().parse(id);
    const input = z
      .object({
        action: z.enum(["onsite", "portal", "void"]),
        notify: z.boolean().default(false),
      })
      .parse(await request.json());
    if (input.action === "onsite")
      await requireOrganizationCapability(user, "agreements.mark_in_person");
    if (input.action === "void") {
      const record = await paperworkRecord(user.organizationId, id);
      if (record.packet.status === "completed")
        throw new HttpError(
          409,
          "Completed paperwork stays in history. Add a new copy to make changes.",
        );
      const result = await supabaseAdmin()
        .from("remodel_agreement_packets")
        .update({ status: "void", voided_at: new Date().toISOString() })
        .eq("organization_id", user.organizationId)
        .eq("id", id)
        .neq("status", "completed")
        .select("id");
      if (result.error) throw result.error;
      if (!result.data.length)
        throw new HttpError(
          409,
          "This paperwork was completed in another window.",
        );
      return Response.json({ voided: true });
    }
    return Response.json(
      await startPaperwork(
        user,
        id,
        input.action,
        input.notify,
        appOrigin(request),
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}

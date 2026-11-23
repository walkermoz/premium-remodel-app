import { randomUUID } from "node:crypto";
import { apiError, checkOrigin, HttpError, requireUser } from "@/lib/auth";
import { buildManualLeadRecords } from "@/lib/manual-lead";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireWorkspaceTabs } from "@/lib/workspace-tab-access-server";
import { applySystemOperatingRecord } from "@/lib/operating-settings.server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await requireUser();
    await requireWorkspaceTabs(user, "Leads");
    if (user.group === "doorknocker")
      throw new HttpError(403, "Create door-knocking leads from the map.");
    const captured = buildManualLeadRecords(
      await request.json(),
      randomUUID(),
      randomUUID(),
      new Date().toISOString(),
    );
    const contact = {
      ...captured.contact,
      ...(await applySystemOperatingRecord(
        user.organizationId,
        "contact",
        { ...captured.contact },
        null,
        user.name,
      )),
    };
    const lead = captured.lead;
    const { error } = await supabaseAdmin()
      .from("remodel_records")
      .insert(
        [
          { kind: "contact", entity: contact },
          { kind: "lead", entity: lead },
        ].map(({ kind, entity }) => ({
          id: entity.id,
          organization_id: user.organizationId,
          created_by: user.id,
          updated_by: user.id,
          kind,
          project_id: null,
          data: entity,
          updated_at: entity.updatedAt,
        })),
      );
    if (error) throw error;
    return Response.json(
      { contact, lead },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

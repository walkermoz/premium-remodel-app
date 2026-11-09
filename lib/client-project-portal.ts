import "server-only";

import { z } from "zod";
import { parseClientPortalAccess } from "./client-portal";
import { readClientProjectSchedule } from "./client-project-schedule";
import { supabaseAdmin } from "./supabase/server";

const clientProjectSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1),
  client: z.string().default(""),
  address: z.string().default(""),
  status: z.enum(["Planning", "In progress", "On hold", "Completed"]),
  description: z.string().default(""),
  startDate: z.string().default(""),
  endDate: z.string().default(""),
  updatedAt: z.string(),
});

export async function readClientProjectPortal(token: string) {
  const access = parseClientPortalAccess(token);
  if (!access || access.expired) return null;
  const admin = supabaseAdmin();
  const { data: link, error: linkError } = await admin
    .from("remodel_client_links")
    .select("id,organization_id,project_id")
    .eq("id", access.id)
    .eq("kind", "project")
    .is("revoked_at", null)
    .maybeSingle();
  if (linkError) throw linkError;
  if (!link) return null;

  const { data: record, error: recordError } = await admin
    .from("remodel_records")
    .select("data")
    .eq("organization_id", link.organization_id)
    .eq("id", link.project_id)
    .eq("kind", "project")
    .maybeSingle();
  if (recordError) throw recordError;
  const parsed = clientProjectSchema.safeParse(record?.data);
  if (!parsed.success || parsed.data.id !== link.project_id) return null;

  const schedule = await readClientProjectSchedule(
    link.organization_id,
    link.project_id,
  );
  await admin.rpc("remodel_note_client_portal_view", {
    target_link: access.id,
  });
  return {
    project: parsed.data,
    schedule,
    organizationId: link.organization_id as string,
  };
}

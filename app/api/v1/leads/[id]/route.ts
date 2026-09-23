import { z } from "zod";
import { apiError, HttpError, limitAttempts } from "@/lib/auth";
import { requireApiKey } from "@/lib/api-keys";
import { findLeadRecord, updateLeadRecord } from "@/lib/lead-records";
import { leadDisposition, withDispositionChange } from "@/lib/leads";
import {
  leadApprovalStates,
  leadDispositions,
  leadStages,
  type Contact,
  type Lead,
} from "@/lib/types";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

const patchInput = z
  .object({
    notes: z.string().trim().max(15000).optional(),
    status: z.enum(leadStages).optional(),
    disposition: z.enum(leadDispositions).optional(),
    nextAction: z.string().trim().max(250).optional(),
    nextActionDue: z
      .string()
      .regex(/^$|^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    draftReply: z.string().trim().max(15000).optional(),
    approvalState: z.enum(leadApprovalStates).optional(),
  })
  .strict();

function serializeLead(lead: Lead, contact: Contact | null) {
  return {
    id: lead.id,
    name: lead.name,
    project: lead.project,
    projectDescription: lead.projectDescription,
    status: lead.status,
    disposition: leadDisposition(lead),
    notes: lead.notes || "",
    nextAction: lead.nextAction || "",
    nextActionDue: lead.nextActionDue || "",
    draftReply: lead.draftReply || "",
    approvalState: lead.approvalState || "none",
    dispositionHistory: lead.dispositionHistory || [],
    source: lead.source,
    submittedAt: lead.submittedAt,
    updatedAt: lead.updatedAt,
    contact: contact
      ? {
          id: contact.id,
          name: contact.name,
          email: contact.email,
          phone: contact.phone,
          address: contact.address,
          zip: contact.zip,
        }
      : null,
  };
}

async function loadContact(organizationId: string, contactId: string) {
  const { data, error } = await supabaseAdmin()
    .from("remodel_records")
    .select("data")
    .eq("organization_id", organizationId)
    .eq("kind", "contact")
    .eq("id", contactId)
    .maybeSingle();
  if (error) throw error;
  return data?.data ? (data.data as Contact) : null;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const principal = await requireApiKey(request);
    await limitAttempts(`v1-lead-get:${principal.keyId}`, 120);
    const { id } = await context.params;
    const lead = await findLeadRecord(principal.organizationId, id);
    if (!lead) throw new HttpError(404, "Lead not found.");
    const contact = await loadContact(principal.organizationId, lead.contactId);
    return Response.json(
      { lead: serializeLead(lead, contact) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const principal = await requireApiKey(request);
    await limitAttempts(`v1-lead-patch:${principal.keyId}`, 120);
    const { id } = await context.params;
    const lead = await findLeadRecord(principal.organizationId, id);
    if (!lead) throw new HttpError(404, "Lead not found.");
    const body = patchInput.parse(await request.json());
    if (!Object.keys(body).length)
      throw new HttpError(400, "Provide at least one field to update.");

    const patch: Partial<Lead> = { ...body };
    if (body.disposition) {
      Object.assign(
        patch,
        withDispositionChange(lead, body.disposition, {
          id: principal.actor.id,
          name: principal.actor.name,
        }),
      );
    }

    const updated = await updateLeadRecord(principal.actor, lead, patch);
    const contact = await loadContact(
      principal.organizationId,
      updated.contactId,
    );
    return Response.json({ lead: serializeLead(updated, contact) });
  } catch (error) {
    return apiError(error);
  }
}

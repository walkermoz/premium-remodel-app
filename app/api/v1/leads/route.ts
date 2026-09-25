import { apiError, HttpError, limitAttempts } from "@/lib/auth";
import { requireApiKey } from "@/lib/api-keys";
import { listLeadRecords } from "@/lib/lead-records";
import { leadDisposition } from "@/lib/leads";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Contact, Lead } from "@/lib/types";

export const runtime = "nodejs";

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

export async function GET(request: Request) {
  try {
    const principal = await requireApiKey(request);
    await limitAttempts(`v1-leads:${principal.keyId}`, 120);
    const url = new URL(request.url);
    const status = url.searchParams.get("status") || undefined;
    const disposition =
      url.searchParams.get("disposition") ||
      (url.searchParams.get("active") === "1" ? "Active" : undefined);
    const limit = Number(url.searchParams.get("limit") || "50");
    const leads = await listLeadRecords(principal.organizationId, {
      status,
      disposition,
      limit: Number.isFinite(limit) ? limit : 50,
    });
    const contactIds = [...new Set(leads.map((lead) => lead.contactId))];
    const contacts = new Map<string, Contact>();
    if (contactIds.length) {
      const { data, error } = await supabaseAdmin()
        .from("remodel_records")
        .select("id,data")
        .eq("organization_id", principal.organizationId)
        .eq("kind", "contact")
        .in("id", contactIds);
      if (error) throw error;
      for (const row of data || [])
        contacts.set(row.id, row.data as Contact);
    }
    return Response.json(
      {
        leads: leads.map((lead) =>
          serializeLead(lead, contacts.get(lead.contactId) || null),
        ),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST() {
  return apiError(
    new HttpError(405, "Create leads through the website intake or workspace."),
  );
}

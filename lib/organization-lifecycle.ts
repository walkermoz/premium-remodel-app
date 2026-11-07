import "server-only";

import type { WorkspaceUser } from "./auth";
import { HttpError } from "./auth";
import { getBusinessConfigForOrganization } from "./business-config";
import { revokeGoogleCalendarsForOrganization } from "./google-calendar";
import { revokeGoogleBusinessForOrganization } from "./google-business";
import { revokeGoogleMailForOrganization } from "./google-mail";
import { deleteOrganizationStorage } from "./organization-archive";
import { sanitizeOrganizationExportValue } from "./organization-export-sanitizer";
import { disconnectStripeAccountForOrganization } from "./stripe-connect";
import { supabaseAdmin } from "./supabase/server";
import { deleteTwilioConnection } from "./twilio-connection-store";

const exportPageSize = 1_000;
export const organizationDeletionDelayDays = 30;

const exportTables = [
  "remodel_records",
  "remodel_business_config",
  "remodel_settings",
  "remodel_pricebook_items",
  "remodel_pricebook_assemblies",
  "remodel_audit_events",
  "remodel_client_links",
  "remodel_google_calendar_connections",
  "remodel_google_business_connections",
  "remodel_google_mail_connections",
  "remodel_quote_email_sends",
  "remodel_twilio_connections",
  "remodel_api_keys",
  "remodel_quote_counters",
  "remodel_locations",
  "remodel_room_scan_sessions",
  "remodel_room_scans",
  "remodel_automations",
  "remodel_automation_revisions",
  "remodel_automation_runs",
  "remodel_sms_preferences",
  "remodel_sms_compliance_events",
  "remodel_contact_communications",
  "remodel_workflows",
  "remodel_workflow_versions",
  "remodel_workflow_trigger_subscriptions",
  "remodel_workflow_events",
  "remodel_automation_outbox",
  "remodel_workflow_enrollments",
  "remodel_workflow_runs",
  "remodel_workflow_step_runs",
  "remodel_workflow_waits",
  "remodel_workflow_effects",
  "remodel_workflow_object_notes",
  "remodel_workflow_inbound_webhooks",
  "remodel_workflow_incidents",
  "remodel_organization_secrets",
  "remodel_agreement_templates",
  "remodel_agreement_template_versions",
  "remodel_agreement_packets",
  "remodel_agreement_signers",
  "remodel_agreement_field_values",
  "remodel_payment_connections",
  "remodel_organization_deletion_requests",
] as const;

function missingOptionalRelation(error: { code?: string; message?: string }) {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /relation .* does not exist|could not find the table/i.test(
      error.message || "",
    )
  );
}
async function allOrganizationRows(
  table: (typeof exportTables)[number],
  organizationId: string,
) {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += exportPageSize) {
    const { data, error } = await supabaseAdmin()
      .from(table)
      .select("*")
      .eq("organization_id", organizationId)
      .range(from, from + exportPageSize - 1);
    if (error) {
      if (missingOptionalRelation(error)) return null;
      throw error;
    }
    const page = (data || []) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < exportPageSize) return rows;
  }
}

export function requireOrganizationOwner(user: Pick<WorkspaceUser, "group">) {
  if (user.group !== "owner")
    throw new HttpError(
      403,
      "Only an organization owner can export or schedule deletion of this business.",
    );
}

export async function organizationLifecycleIdentity(organizationId: string) {
  const [organization, config] = await Promise.all([
    supabaseAdmin()
      .from("organizations")
      .select("id,name")
      .eq("id", organizationId)
      .single(),
    getBusinessConfigForOrganization(organizationId),
  ]);
  if (organization.error) throw organization.error;
  return {
    id: organization.data.id as string,
    legalName: organization.data.name as string,
    displayName: config.profile.name || (organization.data.name as string),
  };
}

export async function organizationDeletionStatus(organizationId: string) {
  const { data, error } = await supabaseAdmin()
    .from("remodel_organization_deletion_requests")
    .select(
      "id,status,requested_at,delete_after,processing_at,attempt_count,last_error",
    )
    .eq("organization_id", organizationId)
    .in("status", ["pending", "processing", "failed"])
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data
    ? {
        id: data.id as string,
        status: data.status as "pending" | "processing" | "failed",
        requestedAt: data.requested_at as string,
        deleteAfter: data.delete_after as string,
        processingAt: (data.processing_at as string | null) || null,
        attemptCount: Number(data.attempt_count || 0),
        lastError: (data.last_error as string | null) || null,
      }
    : null;
}

export async function createOrganizationDeletionRequest(user: WorkspaceUser) {
  requireOrganizationOwner(user);
  const existing = await organizationDeletionStatus(user.organizationId);
  if (existing) return existing;

  const deleteAfter = new Date(
    Date.now() + organizationDeletionDelayDays * 24 * 60 * 60 * 1_000,
  ).toISOString();
  const identity = await organizationLifecycleIdentity(user.organizationId);
  const { data, error } = await supabaseAdmin()
    .from("remodel_organization_deletion_requests")
    .insert({
      organization_id: user.organizationId,
      organization_name: identity.displayName,
      requested_by: user.id,
      delete_after: deleteAfter,
    })
    .select(
      "id,status,requested_at,delete_after,processing_at,attempt_count,last_error",
    )
    .single();
  if (error?.code === "23505") {
    const concurrent = await organizationDeletionStatus(user.organizationId);
    if (concurrent) return concurrent;
  }
  if (error) throw error;
  return {
    id: data.id as string,
    status: "pending" as const,
    requestedAt: data.requested_at as string,
    deleteAfter: data.delete_after as string,
    processingAt: null,
    attemptCount: Number(data.attempt_count || 0),
    lastError: null,
  };
}

export async function cancelOrganizationDeletionRequest(user: WorkspaceUser) {
  requireOrganizationOwner(user);
  const pending = await organizationDeletionStatus(user.organizationId);
  if (!pending)
    throw new HttpError(409, "This business has no pending deletion request.");
  if (pending.status === "processing")
    throw new HttpError(
      409,
      "Deletion has started and can no longer be cancelled.",
    );
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin()
    .from("remodel_organization_deletion_requests")
    .update({
      status: "cancelled",
      cancelled_by: user.id,
      cancelled_at: now,
    })
    .eq("id", pending.id)
    .eq("organization_id", user.organizationId)
    .in("status", ["pending", "failed"])
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data)
    throw new HttpError(409, "The deletion request is no longer pending.");
  return { cancelled: true as const, cancelledAt: now };
}

type DeletionJob = {
  id: string;
  organization_id: string;
  attempt_count: number;
};

async function claimDeletionJob(job: DeletionJob) {
  const now = new Date().toISOString();
  const result = await supabaseAdmin()
    .from("remodel_organization_deletion_requests")
    .update({
      status: "processing",
      processing_at: now,
      attempt_count: job.attempt_count + 1,
      last_error: null,
    })
    .eq("id", job.id)
    .eq("organization_id", job.organization_id)
    .in("status", ["pending", "failed"])
    .lte("delete_after", now)
    .select("id,organization_id,attempt_count")
    .maybeSingle();
  if (result.error) throw result.error;
  return (result.data as DeletionJob | null) || null;
}

async function executeDeletionJob(job: DeletionJob) {
  try {
    await revokeGoogleMailForOrganization(job.organization_id);
    await revokeGoogleCalendarsForOrganization(job.organization_id);
    await revokeGoogleBusinessForOrganization(job.organization_id);
    await disconnectStripeAccountForOrganization(job.organization_id);
    await deleteTwilioConnection(job.organization_id);
    const removedFiles = await deleteOrganizationStorage(job.organization_id);
    const result = await supabaseAdmin().rpc(
      "servicebuddy_delete_organization",
      {
        p_organization: job.organization_id,
        p_request: job.id,
      },
    );
    if (result.error) throw result.error;
    return {
      id: job.id,
      organizationId: job.organization_id,
      status: "completed" as const,
      removedFiles,
    };
  } catch (error) {
    const detail = (
      error instanceof Error ? error.message : "Organization deletion failed."
    ).slice(0, 2_000);
    const failed = await supabaseAdmin()
      .from("remodel_organization_deletion_requests")
      .update({ status: "failed", last_error: detail })
      .eq("id", job.id)
      .eq("organization_id", job.organization_id)
      .eq("status", "processing");
    if (failed.error) throw failed.error;
    return {
      id: job.id,
      organizationId: job.organization_id,
      status: "failed" as const,
      error: detail,
    };
  }
}

export async function processDueOrganizationDeletions(limit = 3) {
  const now = new Date().toISOString();
  const due = await supabaseAdmin()
    .from("remodel_organization_deletion_requests")
    .select("id,organization_id,attempt_count")
    .in("status", ["pending", "failed"])
    .lte("delete_after", now)
    .lt("attempt_count", 5)
    .order("delete_after", { ascending: true })
    .limit(Math.min(10, Math.max(1, limit)));
  if (due.error) throw due.error;
  const results = [];
  for (const candidate of due.data || []) {
    const claimed = await claimDeletionJob(candidate as DeletionJob);
    if (claimed) results.push(await executeDeletionJob(claimed));
  }
  return results;
}

export async function buildOrganizationExport(user: WorkspaceUser) {
  requireOrganizationOwner(user);
  const identity = await organizationLifecycleIdentity(user.organizationId);
  const admin = supabaseAdmin();
  const { data: memberships, error: membershipError } = await admin
    .from("remodel_memberships")
    .select("profile_id,role,active,created_at")
    .eq("organization_id", user.organizationId)
    .order("created_at");
  if (membershipError) throw membershipError;

  const profileIds = (memberships || []).map(
    (membership) => membership.profile_id as string,
  );
  const profiles = profileIds.length
    ? await admin
        .from("profiles")
        .select("id,full_name,email,active")
        .in("id", profileIds)
    : { data: [], error: null };
  if (profiles.error) throw profiles.error;
  const profilesById = new Map(
    (profiles.data || []).map((profile) => [profile.id as string, profile]),
  );

  const tables: Record<string, unknown[]> = {};
  const unavailableTables: string[] = [];
  for (const table of exportTables) {
    const rows = await allOrganizationRows(table, user.organizationId);
    if (rows === null) {
      unavailableTables.push(table);
      continue;
    }
    tables[table] = sanitizeOrganizationExportValue(rows) as unknown[];
  }

  return {
    format: "servicebuddy.organization-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    exportedBy: {
      profileId: user.id,
      name: user.name,
      email: user.email,
    },
    organization: identity,
    members: (memberships || []).map((membership) => ({
      profileId: membership.profile_id,
      role: membership.role,
      active: membership.active,
      joinedAt: membership.created_at,
      profile: profilesById.get(membership.profile_id as string) || null,
    })),
    files: {
      included: true,
      note: "Organization-owned uploads are stored in the files directory of the ZIP export. data/files-manifest.json contains their paths, sizes, and SHA-256 checksums.",
    },
    security: {
      credentialsIncluded: false,
      note: "API key hashes, webhook token hashes, OAuth tokens, encrypted secrets, passwords, and provider credentials are excluded.",
    },
    unavailableTables,
    tables,
  };
}

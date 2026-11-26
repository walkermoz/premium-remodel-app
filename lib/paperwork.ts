import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { HttpError, type WorkspaceUser } from "./auth";
import { supabaseAdmin } from "./supabase/server";
import { getBusinessConfigForOrganization } from "./business-config";
import {
  agreementTemplateDefinitionSchema,
  type AgreementField,
} from "./agreement-template-schema";
import {
  fieldValue,
  paperworkAccessToken,
  publishedTemplate,
  renderAgreementPacketDocument,
  tokenHash,
  type PacketRow,
  type SignerRow,
} from "./agreement-packets";
import {
  paperworkConfigurationSchema,
  resolvePaperworkVariable,
  interpolatePaperwork,
} from "./paperwork-schema";
import { sendWorkflowEmail } from "./workflows/workflow-email";
import { readClientQuoteSource } from "./client-quote";
import { ensureEmailedQuoteLink } from "./client-quote-link";
import { createClientEmailToken } from "./client-portal";
import { updateRecord } from "./repository";
import { appearsOnCustomerQuote } from "./customer-quote-scope";
import type { Quote, ScopeItem } from "./types";

export const paperworkDraftSchema = z.object({
  templateId: z.uuid(),
  quoteId: z.uuid(),
  supersedesId: z.uuid().optional(),
  values: z.record(z.string(), z.unknown()).default({}),
  recipients: z
    .array(
      z.object({
        roleId: z.string().max(80),
        name: z.string().trim().min(1).max(200),
        email: z.union([z.email(), z.literal("")]).default(""),
      }),
    )
    .max(50)
    .optional(),
});
export async function paperworkTemplates(organizationId: string) {
  const admin = supabaseAdmin();
  const rows = await admin
    .from("remodel_agreement_templates")
    .select("id,published_version")
    .eq("organization_id", organizationId)
    .eq("status", "published");
  if (rows.error) throw rows.error;
  if (!rows.data.length) return [];
  const versions = await admin
    .from("remodel_agreement_template_versions")
    .select("*")
    .eq("organization_id", organizationId)
    .in(
      "template_id",
      rows.data.map((r) => r.id),
    );
  if (versions.error) throw versions.error;
  return versions.data
    .filter((v) =>
      rows.data.some(
        (r) => r.id === v.template_id && r.published_version === v.version,
      ),
    )
    .flatMap((v) => {
      const settings = paperworkConfigurationSchema.parse(v.paperwork || {});
      return settings.enabled
        ? [
            {
              id: v.template_id as string,
              name: v.name as string,
              description: v.description as string,
              version: v.version as number,
              fields: v.fields as AgreementField[],
              signerRoles: v.signer_roles,
              paperwork: settings,
            },
          ]
        : [];
    });
}
async function quoteSnapshot(user: WorkspaceUser, quoteId: string) {
  const admin = supabaseAdmin();
  const result = await admin
    .from("remodel_records")
    .select("data")
    .eq("organization_id", user.organizationId)
    .eq("id", quoteId)
    .eq("kind", "quote")
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new HttpError(404, "Quote not found.");
  const quote = result.data.data as Quote;
  const rows = await admin
    .from("remodel_records")
    .select("data")
    .eq("organization_id", user.organizationId)
    .eq("project_id", quoteId)
    .eq("kind", "scope")
    .order("updated_at")
    .limit(501);
  if (rows.error) throw rows.error;
  if (rows.data.length > 500)
    throw new HttpError(400, "This quote has too many items for a document.");
  const items = rows.data.map((r) => r.data as ScopeItem);
  const business = await getBusinessConfigForOrganization(user.organizationId);
  const total = items.reduce((sum, item) => sum + item.estimate, 0);
  const snapshot: Record<string, unknown> = {
    contact: {
      id: quote.contactId || null,
      name: quote.client,
      email: quote.clientEmail || "",
      phone: quote.clientPhone || "",
    },
    quote: {
      id: quote.id,
      name: quote.name,
      number: quote.quoteNumber || quote.id.slice(0, 8),
      address: quote.address,
      total,
      scope: items
        .filter(appearsOnCustomerQuote)
        .map((i) => `${i.title}${i.details ? `: ${i.details}` : ""}`)
        .join("\n"),
    },
    organization: {
      name: business.profile.name,
      legalName: business.compliance.legalName || business.profile.name,
      email: business.profile.email,
      phone: business.profile.phone,
    },
    staff: { name: user.name, email: user.email },
    regional: {
      locale: business.regional.locale,
      currency: business.regional.currency,
    },
    sourceQuoteUpdatedAt: quote.updatedAt,
  };
  return { quote, snapshot };
}
export async function paperworkRecord(organizationId: string, id: string) {
  const result = await supabaseAdmin()
    .from("remodel_agreement_packets")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", z.uuid().parse(id))
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data || !result.data.template_snapshot?.paperworkManaged)
    throw new HttpError(404, "Paperwork not found.");
  const signers = await supabaseAdmin()
    .from("remodel_agreement_signers")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("packet_id", id)
    .order("signing_order");
  if (signers.error) throw signers.error;
  const values = await supabaseAdmin()
    .from("remodel_agreement_field_values")
    .select("field_id,value")
    .eq("organization_id", organizationId)
    .eq("packet_id", id);
  if (values.error) throw values.error;
  return {
    packet: result.data,
    signers: signers.data as SignerRow[],
    values: Object.fromEntries(values.data.map((v) => [v.field_id, v.value])),
  };
}
export async function listPaperwork(organizationId: string, quoteId: string) {
  const rows = await supabaseAdmin()
    .from("remodel_agreement_packets")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("quote_id", z.uuid().parse(quoteId))
    .order("created_at", { ascending: false })
    .limit(200);
  if (rows.error) throw rows.error;
  return Promise.all(
    rows.data.map(async (row) => {
      const record = await paperworkRecord(organizationId, row.id);
      return {
        id: record.packet.id,
        title: record.packet.template_snapshot.name,
        status: record.packet.status,
        revision: record.packet.revision,
        templateId: record.packet.template_id,
        templateVersion: record.packet.template_version,
        configuration: record.packet.template_snapshot.paperwork,
        fields: record.packet.template_snapshot.fields,
        values: record.values,
        createdAt: record.packet.created_at,
        completedAt: record.packet.completed_at,
        recipients: record.signers.map((s) => ({
          id: s.id,
          roleId: s.role_id,
          label: s.role_label,
          name: s.name,
          email: s.email,
          partyType: s.party_type,
          status: s.status,
          signedAt: s.signed_at,
        })),
      };
    }),
  );
}
export async function createPaperwork(
  user: WorkspaceUser,
  raw: unknown,
  assignmentKey?: string,
) {
  const input = paperworkDraftSchema.parse(raw);
  const version = await publishedTemplate(
    user.organizationId,
    input.templateId,
  );
  const definition = agreementTemplateDefinitionSchema.parse({
    content: version.content,
    fields: version.fields,
    signerRoles: version.signer_roles,
    paperwork: version.paperwork,
  });
  const config = definition.paperwork;
  if (!config.enabled || !config.contexts.includes("quote"))
    throw new HttpError(409, "This template is not enabled for quotes.");
  if (
    config.completion !== "signature" &&
    definition.fields.some((f) => f.type === "signature")
  )
    throw new HttpError(
      409,
      "Remove signature fields or enable signature completion in this template.",
    );
  const { quote, snapshot } = await quoteSnapshot(user, input.quoteId);
  if (input.supersedesId) {
    const previous = await paperworkRecord(
      user.organizationId,
      input.supersedesId,
    );
    if (
      previous.packet.quote_id !== quote.id ||
      previous.packet.template_id !== input.templateId
    )
      throw new HttpError(
        400,
        "Choose paperwork on this quote with the same template.",
      );
  }
  const roleIds = new Set(definition.signerRoles.map((r) => r.id));
  if (
    input.recipients?.some((r) => !roleIds.has(r.roleId)) ||
    new Set(input.recipients?.map((r) => r.roleId)).size !==
      (input.recipients?.length || 0)
  )
    throw new HttpError(
      400,
      "Choose a recipient once for each configured role.",
    );
  const recipients = definition.signerRoles
    .filter(
      (role) =>
        role.required || input.recipients?.some((r) => r.roleId === role.id),
    )
    .map((role) => {
      const entered = input.recipients?.find((r) => r.roleId === role.id);
      const isStaff = role.partyType === "staff";
      if (config.audience === "staff" && !isStaff)
        throw new HttpError(
          409,
          "Staff paperwork must have staff recipient roles.",
        );
      return {
        id: randomUUID(),
        roleId: role.id,
        label: role.label,
        partyType: role.partyType,
        order: role.order,
        name: entered?.name || (isStaff ? user.name : quote.client),
        email: (
          entered?.email ?? (isStaff ? user.email : quote.clientEmail || "")
        ).toLowerCase(),
      };
    });
  if (recipients.some((r) => !r.name.trim()))
    throw new HttpError(400, "Add the recipient name to the quote first.");
  const values = definition.fields
    .filter((f) => !f.signerRoleId)
    .map((field) => {
      const value = field.bindingKey
        ? resolvePaperworkVariable(snapshot, field.bindingKey, field.type)
        : input.values[field.id];
      if (
        field.required &&
        (value === undefined || value === null || value === "")
      )
        throw new HttpError(
          400,
          `Enter ${field.label} before adding this paperwork.`,
        );
      return {
        id: field.id,
        value:
          value === undefined || value === null ? "" : fieldValue(field, value),
      };
    });
  let content = definition.content;
  snapshot.documentValues = Object.fromEntries(
    values.map((value) => [value.id, value.value]),
  );
  try {
    if (content)
      content = {
        ...content,
        blocks: content.blocks.map((block) => ({
          ...block,
          text: interpolatePaperwork(block.text, snapshot),
        })),
      };
  } catch (error) {
    throw new HttpError(
      400,
      error instanceof Error ? error.message : "Review document variables.",
    );
  }
  const id = randomUUID();
  const templateSnapshot = {
    templateId: version.template_id,
    version: version.version,
    name: version.name,
    description: version.description,
    sourceType: version.source_type,
    content,
    fields: definition.fields,
    signerRoles: definition.signerRoles,
    storagePath: version.storage_path,
    originalFilename: version.original_filename,
    fileSha256: version.file_sha256,
    pageCount: version.page_count,
    paperwork: config,
    paperworkManaged: true,
    ...(input.supersedesId ? { supersedesId: input.supersedesId } : {}),
  };
  const result = await supabaseAdmin().rpc("remodel_create_paperwork", {
    p_org: user.organizationId,
    p_actor: user.id,
    p_document: {
      id,
      templateId: version.template_id,
      templateVersion: version.version,
      quoteId: quote.id,
      projectId: quote.linkedProjectId || null,
      contactId: quote.contactId || null,
      templateSnapshot,
      dataSnapshot: snapshot,
      assignmentKey: assignmentKey || null,
    },
    p_recipients: recipients,
    p_values: values,
  });
  if (result.error) {
    if (result.error.code === "23505" && assignmentKey) {
      const existing = await supabaseAdmin()
        .from("remodel_agreement_packets")
        .select("id")
        .eq("organization_id", user.organizationId)
        .eq("assignment_key", assignmentKey)
        .neq("status", "void")
        .maybeSingle();
      if (existing.data) return { id: existing.data.id as string };
    }
    throw result.error;
  }
  return { id };
}
export async function paperworkDocument(organizationId: string, id: string) {
  const record = await paperworkRecord(organizationId, id);
  return renderAgreementPacketDocument({
    packet: record.packet as PacketRow,
    signers: record.signers,
    signer: record.signers[0],
  });
}

export async function savePaperworkDraft(
  user: WorkspaceUser,
  id: string,
  raw: unknown,
) {
  const input = z
    .object({
      revision: z.number().int().positive(),
      refreshFromQuote: z.boolean().default(false),
      values: z.record(z.string(), z.unknown()),
      recipients: z
        .array(
          z.object({
            roleId: z.string(),
            name: z.string().trim().min(1).max(200),
            email: z.union([z.email(), z.literal("")]),
          }),
        )
        .max(50),
    })
    .parse(raw);
  const record = await paperworkRecord(user.organizationId, id);
  if (record.packet.status !== "draft")
    throw new HttpError(
      409,
      "Shared paperwork is frozen. Add a new copy to make changes.",
    );
  const fields = record.packet.template_snapshot.fields as AgreementField[];
  const values = fields
    .filter((f) => !f.signerRoleId && !f.bindingKey)
    .map((field) => ({
      id: field.id,
      value: fieldValue(field, input.values[field.id] ?? ""),
    }));
  if (
    input.recipients.length !== record.signers.length ||
    new Set(input.recipients.map((r) => r.roleId)).size !==
      record.signers.length ||
    input.recipients.some(
      (r) => !record.signers.some((s) => s.role_id === r.roleId),
    )
  )
    throw new HttpError(400, "Keep the configured document recipients.");
  let snapshot = record.packet.data_snapshot;
  let templateSnapshot = record.packet.template_snapshot;
  if (input.refreshFromQuote) {
    const source = await quoteSnapshot(user, record.packet.quote_id);
    const original = await supabaseAdmin()
      .from("remodel_agreement_template_versions")
      .select("content")
      .eq("organization_id", user.organizationId)
      .eq("template_id", record.packet.template_id)
      .eq("version", record.packet.template_version)
      .single();
    if (original.error) throw original.error;
    const definition = agreementTemplateDefinitionSchema.parse({
      content: original.data.content,
      fields,
      signerRoles: record.packet.template_snapshot.signerRoles,
      paperwork: record.packet.template_snapshot.paperwork,
    });
    snapshot = source.snapshot;
    templateSnapshot = {
      ...templateSnapshot,
      content: definition.content
        ? {
            ...definition.content,
            blocks: definition.content.blocks.map((block) => ({
              ...block,
              text: interpolatePaperwork(block.text, snapshot),
            })),
          }
        : null,
    };
    for (const field of fields.filter((f) => f.bindingKey && !f.signerRoleId)) {
      const value = resolvePaperworkVariable(
        snapshot,
        field.bindingKey!,
        field.type,
      );
      if (
        field.required &&
        (value === undefined || value === null || value === "")
      )
        throw new HttpError(
          400,
          `Add ${field.label} before refreshing this draft.`,
        );
      values.push({
        id: field.id,
        value:
          value === undefined || value === null ? "" : fieldValue(field, value),
      });
    }
  }
  const result = await supabaseAdmin().rpc("remodel_save_paperwork_draft", {
    p_org: user.organizationId,
    p_id: id,
    p_revision: input.revision,
    p_snapshot: templateSnapshot,
    p_data: snapshot,
    p_values: values,
    p_recipients: input.recipients.map((r) => ({
      ...r,
      email: r.email.toLowerCase(),
    })),
  });
  if (result.error) throw result.error;
  if (!result.data)
    throw new HttpError(
      409,
      "Paperwork changed or was shared. Reload before editing.",
    );
  return { saved: true };
}
export async function startPaperwork(
  user: WorkspaceUser,
  id: string,
  channel: "onsite" | "portal",
  notify: boolean,
  origin: string,
) {
  const record = await paperworkRecord(user.organizationId, id);
  const config = paperworkConfigurationSchema.parse(
    record.packet.template_snapshot.paperwork,
  );
  if (record.packet.status === "void")
    throw new HttpError(409, "This paperwork is void.");
  if (channel === "onsite" && !config.inPerson)
    throw new HttpError(409, "In-person completion is not configured.");
  if (
    channel === "portal" &&
    (!config.portal || config.audience !== "customer")
  )
    throw new HttpError(409, "Customer portal delivery is not configured.");
  if (notify && (!config.email || channel !== "portal"))
    throw new HttpError(409, "Email notifications are not configured.");
  const current =
    record.signers.find((s) => s.status !== "signed") || record.signers[0];
  if (!current) throw new HttpError(409, "Configure a recipient first.");
  if (
    channel === "portal" &&
    record.signers.some((s) => s.party_type === "customer" && !s.email)
  )
    throw new HttpError(
      400,
      "Add the customer email before sending to their portal. In-person completion does not need email.",
    );
  const access = paperworkAccessToken(id, current.id);
  const activated = await supabaseAdmin()
    .from("remodel_agreement_signers")
    .update({
      access_token_hash: tokenHash(access),
      access_token_expires_at: new Date(
        Date.now() + 30 * 86400_000,
      ).toISOString(),
    })
    .eq("organization_id", user.organizationId)
    .eq("id", current.id);
  if (activated.error) throw activated.error;
  const signingUrl = `${origin}/agreement/${access}`;
  let portalUrl = signingUrl;
  let customerPortalEmail = "";
  if (channel === "portal") {
    const { quote } = await quoteSnapshot(user, record.packet.quote_id);
    if (!quote.clientEmail)
      throw new HttpError(
        400,
        "Add the quote customer email before publishing to their portal.",
      );
    customerPortalEmail = quote.clientEmail.toLowerCase();
    if (
      !record.signers.some(
        (s) =>
          s.party_type === "customer" &&
          s.email.toLowerCase() === customerPortalEmail,
      )
    )
      throw new HttpError(
        400,
        "The document recipient must match the quote customer email before publishing to their portal. Edit the draft recipient or prepare a revised copy.",
      );
    const admin = supabaseAdmin();
    const existing = await admin
      .from("remodel_client_links")
      .select("id,quote_snapshot")
      .eq("organization_id", user.organizationId)
      .eq("project_id", quote.id)
      .eq("kind", "quote")
      .is("revoked_at", null)
      .maybeSingle();
    if (existing.error) throw existing.error;
    let linkId =
      existing.data?.quote_snapshot?.quote?.clientEmail?.toLowerCase() ===
      quote.clientEmail.toLowerCase()
        ? (existing.data.id as string)
        : "";
    if (!linkId) {
      const scope = await admin
        .from("remodel_records")
        .select("data")
        .eq("organization_id", user.organizationId)
        .eq("project_id", quote.id)
        .eq("kind", "scope")
        .limit(500);
      if (scope.error) throw scope.error;
      linkId = await ensureEmailedQuoteLink(
        user,
        quote,
        scope.data.map((r) => r.data as ScopeItem),
        new Date().toISOString(),
      );
    }
    if (
      !(quote as Quote & { paperworkPortalEnabled?: boolean })
        .paperworkPortalEnabled
    )
      await updateRecord(
        user,
        quote,
        { ...quote, paperworkPortalEnabled: true },
        quote.updatedAt,
      );
    portalUrl = `${origin}/client/${createClientEmailToken(linkId, quote.clientEmail)}/quote?view=paperwork`;
  }
  const published = await supabaseAdmin().rpc("remodel_publish_paperwork", {
    p_org: user.organizationId,
    p_id: id,
    p_revision: record.packet.revision,
    p_channel: channel,
    p_notify: notify,
  });
  if (published.error) throw published.error;
  if (!published.data)
    throw new HttpError(409, "Paperwork changed. Refresh before sharing it.");
  let delivery: "not_requested" | "sent" | "failed" = "not_requested";
  if (notify) {
    if (!current.email)
      throw new HttpError(
        400,
        "Add the current recipient email before notifying them.",
      );
    try {
      await sendWorkflowEmail({
        organizationId: user.organizationId,
        recipient: current.email,
        subject: `Paperwork to complete: ${record.packet.template_snapshot.name}`,
        body: `Hello ${current.name},\n\nPlease review and complete ${record.packet.template_snapshot.name}.\n\n${current.party_type === "customer" && current.email.toLowerCase() === customerPortalEmail ? portalUrl : signingUrl}`,
        idempotencyKey: `paperwork:${id}:${current.id}:${Math.floor(Date.now() / 60_000)}`,
      });
      delivery = "sent";
    } catch {
      delivery = "failed";
    }
  }
  return {
    url: channel === "onsite" ? signingUrl : undefined,
    portalUrl: channel === "portal" ? portalUrl : undefined,
    delivery,
    published: channel === "portal",
  };
}
export async function portalPaperwork(token: string) {
  const source = await readClientQuoteSource(token, { recordView: false });
  if (!source) throw new HttpError(404, "Customer portal not found.");
  const email = (source.currentQuote.clientEmail || "").trim().toLowerCase();
  if (!email) return [];
  const rows = await supabaseAdmin()
    .from("remodel_agreement_packets")
    .select("id,template_snapshot,status,completed_at,created_at")
    .eq("organization_id", source.organizationId)
    .or(
      `quote_id.eq.${source.currentQuote.id},project_id.eq.${source.currentQuote.id}`,
    )
    .in("status", ["sent", "in_progress", "completed"])
    .order("created_at", { ascending: false });
  if (rows.error) {
    // Existing customer links remain usable until the paperwork migration ships.
    if (rows.error.code === "42703" && rows.error.message.includes("quote_id"))
      return [];
    throw rows.error;
  }
  const output = [];
  for (const row of rows.data) {
    if (
      !row.template_snapshot?.portalPublished ||
      row.template_snapshot?.paperwork?.audience !== "customer"
    )
      continue;
    const record = await paperworkRecord(source.organizationId, row.id);
    const recipient = record.signers.find(
      (s) => s.party_type === "customer" && s.email.toLowerCase() === email,
    );
    if (!recipient) continue;
    const current = record.signers.find((s) => s.status !== "signed");
    const canOpen =
      recipient.status === "signed" || current?.id === recipient.id;
    let url: string | undefined;
    if (canOpen) {
      const access = paperworkAccessToken(row.id, recipient.id);
      const updated = await supabaseAdmin()
        .from("remodel_agreement_signers")
        .update({
          access_token_hash: tokenHash(access),
          access_token_expires_at: new Date(
            Date.now() + 30 * 86400_000,
          ).toISOString(),
        })
        .eq("organization_id", source.organizationId)
        .eq("id", recipient.id);
      if (updated.error) throw updated.error;
      url = `/agreement/${access}`;
    }
    output.push({
      id: row.id,
      title: String(row.template_snapshot.name),
      status: row.status,
      recipientComplete: recipient.status === "signed",
      canOpen,
      url,
      completedAt: row.completed_at,
    });
  }
  return output;
}

export async function attachConfiguredPaperwork(
  user: WorkspaceUser,
  quoteId: string,
  trigger: "quote_accepted" | "project_created",
) {
  if (
    !(await getBusinessConfigForOrganization(user.organizationId)).modules
      .agreements
  )
    return [];
  const templates = (await paperworkTemplates(user.organizationId)).filter(
    (t) =>
      t.paperwork.autoAttach === trigger &&
      t.paperwork.contexts.includes("quote"),
  );
  const existing = await listPaperwork(user.organizationId, quoteId);
  const warnings: string[] = [];
  for (const template of templates) {
    if (
      existing.some((d) => d.templateId === template.id && d.status !== "void")
    )
      continue;
    try {
      await createPaperwork(
        user,
        { quoteId, templateId: template.id },
        `${trigger}:${quoteId}:${template.id}`,
      );
    } catch {
      warnings.push(
        `Review ${template.name} in Paperwork; it needs details before it can be added.`,
      );
    }
  }
  return warnings;
}

export async function assignedPaperwork(user: WorkspaceUser) {
  if (
    !(await getBusinessConfigForOrganization(user.organizationId)).modules
      .agreements
  )
    return [];
  const rows = await supabaseAdmin()
    .from("remodel_agreement_signers")
    .select("id,packet_id")
    .eq("organization_id", user.organizationId)
    .eq("party_type", "staff")
    .eq("email", user.email.toLowerCase())
    .neq("status", "signed")
    .limit(100);
  if (rows.error) throw rows.error;
  const output = [];
  for (const row of rows.data) {
    const result = await supabaseAdmin()
      .from("remodel_agreement_packets")
      .select("id,quote_id,status,template_snapshot,data_snapshot")
      .eq("organization_id", user.organizationId)
      .eq("id", row.packet_id)
      .maybeSingle();
    if (result.error) throw result.error;
    if (
      !result.data?.template_snapshot.paperworkManaged ||
      ["void", "completed"].includes(result.data.status)
    )
      continue;
    output.push({
      id: result.data.id,
      title: String(result.data.template_snapshot.name),
      quoteName: String(result.data.data_snapshot.quote?.name || ""),
      quoteId: result.data.quote_id,
    });
  }
  return output;
}

export async function startAssignedPaperwork(
  user: WorkspaceUser,
  id: string,
  origin: string,
) {
  const config = await getBusinessConfigForOrganization(user.organizationId);
  if (!config.modules.agreements)
    throw new HttpError(409, "Paperwork is disabled for this business.");
  const record = await paperworkRecord(user.organizationId, id);
  const current = record.signers.find((s) => s.status !== "signed");
  if (
    !current ||
    current.party_type !== "staff" ||
    current.email.toLowerCase() !== user.email.toLowerCase()
  )
    throw new HttpError(
      403,
      "This paperwork is not assigned to you or an earlier recipient is still pending.",
    );
  return startPaperwork(user, id, "onsite", false, origin);
}

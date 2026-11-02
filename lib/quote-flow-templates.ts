import "server-only";

import type { WorkspaceUser } from "./auth";
import { HttpError } from "./auth";
import {
  defaultQuoteFlowDefinition,
  quoteFlowDefinitionSchema,
  type QuoteFlowDefinition,
} from "./quote-flow-schema";
import { supabaseAdmin } from "./supabase/server";

type QuoteFlowTemplateRow = {
  id: string;
  organization_id: string;
  template_key: string | null;
  name: string;
  description: string;
  status: "draft" | "published" | "archived";
  revision: number;
  current_version: number;
  published_version: number | null;
  definition: unknown;
  is_default: boolean;
  locked: boolean;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

const templateColumns = [
  "id",
  "organization_id",
  "template_key",
  "name",
  "description",
  "status",
  "revision",
  "current_version",
  "published_version",
  "definition",
  "is_default",
  "locked",
  "created_at",
  "updated_at",
  "archived_at",
].join(",");

function templateDto(row: QuoteFlowTemplateRow) {
  return {
    id: row.id,
    templateKey: row.template_key,
    name: row.name,
    description: row.description,
    status: row.status,
    revision: row.revision,
    currentVersion: row.current_version,
    publishedVersion: row.published_version,
    definition: quoteFlowDefinitionSchema.parse(row.definition),
    isDefault: row.is_default,
    locked: row.locked,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

async function templateRow(organizationId: string, templateId: string) {
  const result = await supabaseAdmin()
    .from("remodel_quote_flow_templates")
    .select(templateColumns)
    .eq("organization_id", organizationId)
    .eq("id", templateId)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new HttpError(404, "Quote flow template not found.");
  return result.data as unknown as QuoteFlowTemplateRow;
}

export async function listQuoteFlowTemplates(
  organizationId: string,
  includeArchived = false,
) {
  let query = supabaseAdmin()
    .from("remodel_quote_flow_templates")
    .select(templateColumns)
    .eq("organization_id", organizationId)
    .order("is_default", { ascending: false })
    .order("updated_at", { ascending: false });
  if (!includeArchived) query = query.neq("status", "archived");
  const result = await query;
  if (result.error) throw result.error;
  return (result.data as unknown as QuoteFlowTemplateRow[]).map(templateDto);
}

export async function getQuoteFlowTemplate(
  organizationId: string,
  templateId: string,
) {
  const row = await templateRow(organizationId, templateId);
  const versions = await supabaseAdmin()
    .from("remodel_quote_flow_template_versions")
    .select("id,version,change_note,published_at,published_by")
    .eq("organization_id", organizationId)
    .eq("template_id", templateId)
    .order("version", { ascending: false });
  if (versions.error) throw versions.error;
  return {
    ...templateDto(row),
    versions: versions.data.map((version) => ({
      id: version.id,
      version: version.version,
      changeNote: version.change_note,
      publishedAt: version.published_at,
      publishedBy: version.published_by,
    })),
  };
}

export async function createQuoteFlowTemplate(
  user: WorkspaceUser,
  input: {
    name: string;
    description: string;
    definition?: QuoteFlowDefinition;
  },
) {
  const definition = quoteFlowDefinitionSchema.parse(
    input.definition || defaultQuoteFlowDefinition,
  );
  const now = new Date().toISOString();
  const result = await supabaseAdmin()
    .from("remodel_quote_flow_templates")
    .insert({
      organization_id: user.organizationId,
      name: input.name,
      description: input.description,
      status: "draft",
      definition,
      is_default: false,
      locked: false,
      created_by: user.id,
      updated_by: user.id,
      created_at: now,
      updated_at: now,
    })
    .select(templateColumns)
    .single();
  if (result.error) throw result.error;
  return templateDto(result.data as unknown as QuoteFlowTemplateRow);
}

export async function updateQuoteFlowTemplate(
  user: WorkspaceUser,
  templateId: string,
  input: {
    revision: number;
    name: string;
    description: string;
    definition: QuoteFlowDefinition;
  },
) {
  const current = await templateRow(user.organizationId, templateId);
  if (current.locked)
    throw new HttpError(
      409,
      "This compatibility template is locked. Duplicate it to make structural changes.",
    );
  if (current.status === "archived")
    throw new HttpError(409, "Restore this template before editing it.");
  const definition = quoteFlowDefinitionSchema.parse(input.definition);
  const result = await supabaseAdmin()
    .from("remodel_quote_flow_templates")
    .update({
      name: input.name,
      description: input.description,
      definition,
      revision: input.revision + 1,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", user.organizationId)
    .eq("id", templateId)
    .eq("revision", input.revision)
    .select(templateColumns);
  if (result.error) throw result.error;
  if (result.data.length !== 1)
    throw new HttpError(
      409,
      "This flow changed in another session. Reload before saving.",
    );
  return templateDto(result.data[0] as unknown as QuoteFlowTemplateRow);
}

export async function duplicateQuoteFlowTemplate(
  user: WorkspaceUser,
  templateId: string,
  name?: string,
) {
  const source = await templateRow(user.organizationId, templateId);
  return createQuoteFlowTemplate(user, {
    name: name?.trim() || `${source.name} copy`,
    description: source.description,
    definition: quoteFlowDefinitionSchema.parse(source.definition),
  });
}

export async function publishQuoteFlowTemplate(
  user: WorkspaceUser,
  templateId: string,
  input: { revision: number; changeNote: string; makeDefault: boolean },
) {
  const current = await templateRow(user.organizationId, templateId);
  if (current.status === "archived")
    throw new HttpError(409, "Restore this template before publishing it.");
  if (current.locked)
    throw new HttpError(
      409,
      "The Premium Remodel compatibility flow is already published. Duplicate it before editing.",
    );
  quoteFlowDefinitionSchema.parse(current.definition);
  const result = await supabaseAdmin().rpc(
    "remodel_publish_quote_flow_template",
    {
      p_organization_id: user.organizationId,
      p_template_id: templateId,
      p_expected_revision: input.revision,
      p_published_by: user.id,
      p_change_note: input.changeNote,
    },
  );
  if (result.error) {
    if (result.error.message.includes("quote_flow_revision_conflict"))
      throw new HttpError(
        409,
        "This flow changed in another session. Reload before publishing.",
      );
    if (result.error.message.includes("quote_flow_template_not_found"))
      throw new HttpError(404, "Quote flow template not found.");
    throw result.error;
  }
  if (input.makeDefault) await setDefaultQuoteFlowTemplate(user, templateId);
  return getQuoteFlowTemplate(user.organizationId, templateId);
}

export async function setDefaultQuoteFlowTemplate(
  user: WorkspaceUser,
  templateId: string,
) {
  const current = await templateRow(user.organizationId, templateId);
  if (current.status !== "published")
    throw new HttpError(409, "Publish this flow before making it the default.");
  const selected = await supabaseAdmin().rpc(
    "remodel_set_default_quote_flow_template",
    {
      p_organization_id: user.organizationId,
      p_template_id: templateId,
      p_updated_by: user.id,
    },
  );
  if (selected.error) throw selected.error;
}

export async function setQuoteFlowTemplateArchived(
  user: WorkspaceUser,
  templateId: string,
  archived: boolean,
) {
  const current = await templateRow(user.organizationId, templateId);
  if (current.locked)
    throw new HttpError(
      409,
      "The active compatibility flow cannot be archived.",
    );
  if (archived && current.is_default)
    throw new HttpError(
      409,
      "Choose another default flow before archiving this one.",
    );
  const result = await supabaseAdmin()
    .from("remodel_quote_flow_templates")
    .update({
      status: archived
        ? "archived"
        : current.published_version
          ? "published"
          : "draft",
      archived_at: archived ? new Date().toISOString() : null,
      revision: current.revision + 1,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", user.organizationId)
    .eq("id", templateId)
    .eq("revision", current.revision)
    .select(templateColumns);
  if (result.error) throw result.error;
  if (result.data.length !== 1)
    throw new HttpError(409, "Reload this flow and try again.");
  return templateDto(result.data[0] as unknown as QuoteFlowTemplateRow);
}

export async function publishedQuoteFlowVersion(
  organizationId: string,
  templateId?: string,
) {
  let query = supabaseAdmin()
    .from("remodel_quote_flow_templates")
    .select("id,published_version")
    .eq("organization_id", organizationId)
    .eq("status", "published");
  query = templateId
    ? query.eq("id", templateId)
    : query.eq("is_default", true);
  const selected = await query.maybeSingle();
  if (selected.error) throw selected.error;
  if (!selected.data?.published_version)
    throw new HttpError(409, "Publish a default quote flow before using it.");
  const version = await supabaseAdmin()
    .from("remodel_quote_flow_template_versions")
    .select("template_id,version,name,description,definition,published_at")
    .eq("organization_id", organizationId)
    .eq("template_id", selected.data.id)
    .eq("version", selected.data.published_version)
    .single();
  if (version.error) throw version.error;
  return {
    templateId: version.data.template_id,
    version: version.data.version,
    name: version.data.name,
    description: version.data.description,
    definition: quoteFlowDefinitionSchema.parse(version.data.definition),
    publishedAt: version.data.published_at,
  };
}

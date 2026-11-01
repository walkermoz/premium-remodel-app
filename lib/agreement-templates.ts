import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { HttpError, type WorkspaceUser } from "./auth";
import {
  agreementTemplateDefinitionSchema,
  defaultAgreementSignerRoles,
  type AgreementField,
  type AgreementSignerRole,
  type AgreementTemplateDefinition,
} from "./agreement-template-schema";
import { supabaseAdmin } from "./supabase/server";

const bucket = "remodel-files";
const maxAgreementPdfBytes = 20 * 1024 * 1024;

type AgreementTemplateRow = {
  id: string;
  organization_id: string;
  template_key: string | null;
  name: string;
  description: string;
  source_type:
    | "uploaded_pdf"
    | "servicebuddy_document"
    | "legacy_premium_msa";
  status: "draft" | "published" | "archived";
  revision: number;
  current_version: number;
  published_version: number | null;
  content: unknown;
  fields: unknown;
  signer_roles: unknown;
  storage_path: string | null;
  original_filename: string | null;
  mime_type: string | null;
  file_sha256: string | null;
  page_count: number | null;
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
  "source_type",
  "status",
  "revision",
  "current_version",
  "published_version",
  "content",
  "fields",
  "signer_roles",
  "storage_path",
  "original_filename",
  "mime_type",
  "file_sha256",
  "page_count",
  "created_at",
  "updated_at",
  "archived_at",
].join(",");

function templateDto(row: AgreementTemplateRow) {
  return {
    id: row.id,
    templateKey: row.template_key,
    name: row.name,
    description: row.description,
    sourceType: row.source_type,
    status: row.status,
    revision: row.revision,
    currentVersion: row.current_version,
    publishedVersion: row.published_version,
    content: row.content,
    fields: row.fields as AgreementField[],
    signerRoles: row.signer_roles as AgreementSignerRole[],
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    fileSha256: row.file_sha256,
    pageCount: row.page_count,
    hasSourceFile: Boolean(row.storage_path),
    locked: row.source_type === "legacy_premium_msa",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

async function templateRow(organizationId: string, templateId: string) {
  const result = await supabaseAdmin()
    .from("remodel_agreement_templates")
    .select(templateColumns)
    .eq("organization_id", organizationId)
    .eq("id", templateId)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new HttpError(404, "Agreement template not found.");
  return result.data as unknown as AgreementTemplateRow;
}

export async function listAgreementTemplates(
  organizationId: string,
  includeArchived = false,
) {
  let query = supabaseAdmin()
    .from("remodel_agreement_templates")
    .select(templateColumns)
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false });
  if (!includeArchived) query = query.neq("status", "archived");
  const result = await query;
  if (result.error) throw result.error;
  return (result.data as unknown as AgreementTemplateRow[]).map(templateDto);
}

export async function getAgreementTemplate(
  organizationId: string,
  templateId: string,
) {
  const row = await templateRow(organizationId, templateId);
  const versions = await supabaseAdmin()
    .from("remodel_agreement_template_versions")
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

export async function createAuthoredAgreementTemplate(
  user: WorkspaceUser,
  input: {
    name: string;
    description: string;
    definition?: AgreementTemplateDefinition;
  },
) {
  const definition = agreementTemplateDefinitionSchema.parse(
    input.definition || {
      content: { title: input.name, blocks: [] },
      fields: [],
      signerRoles: defaultAgreementSignerRoles,
    },
  );
  if (!definition.content)
    throw new HttpError(400, "An authored agreement needs document content.");
  const now = new Date().toISOString();
  const result = await supabaseAdmin()
    .from("remodel_agreement_templates")
    .insert({
      organization_id: user.organizationId,
      name: input.name,
      description: input.description,
      source_type: "servicebuddy_document",
      status: "draft",
      content: definition.content,
      fields: definition.fields,
      signer_roles: definition.signerRoles,
      created_by: user.id,
      updated_by: user.id,
      created_at: now,
      updated_at: now,
    })
    .select(templateColumns)
    .single();
  if (result.error) throw result.error;
  return templateDto(result.data as unknown as AgreementTemplateRow);
}

export async function createUploadedAgreementTemplate(
  user: WorkspaceUser,
  input: {
    name: string;
    description: string;
    file: File;
  },
) {
  if (
    !input.file.size ||
    input.file.size > maxAgreementPdfBytes ||
    input.file.type !== "application/pdf"
  )
    throw new HttpError(400, "Choose a PDF no larger than 20 MB.");
  const bytes = Buffer.from(await input.file.arrayBuffer());
  if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-")
    throw new HttpError(400, "The selected file is not a valid PDF.");
  let pageCount: number;
  try {
    const pdf = await PDFDocument.load(bytes, {
      ignoreEncryption: false,
      updateMetadata: false,
    });
    pageCount = pdf.getPageCount();
  } catch {
    throw new HttpError(
      400,
      "The PDF could not be read. Remove password protection and try again.",
    );
  }
  if (pageCount < 1 || pageCount > 500)
    throw new HttpError(400, "Agreement PDFs must contain 1–500 pages.");
  const id = randomUUID();
  const storagePath = `${user.organizationId}/agreements/${id}/source.pdf`;
  const digest = createHash("sha256").update(bytes).digest("hex");
  const storage = supabaseAdmin().storage.from(bucket);
  const upload = await storage.upload(storagePath, bytes, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (upload.error) throw upload.error;
  try {
    const now = new Date().toISOString();
    const result = await supabaseAdmin()
      .from("remodel_agreement_templates")
      .insert({
        id,
        organization_id: user.organizationId,
        name: input.name,
        description: input.description,
        source_type: "uploaded_pdf",
        status: "draft",
        content: null,
        fields: [],
        signer_roles: defaultAgreementSignerRoles,
        storage_path: storagePath,
        original_filename: input.file.name.slice(0, 240),
        mime_type: "application/pdf",
        file_sha256: digest,
        page_count: pageCount,
        created_by: user.id,
        updated_by: user.id,
        created_at: now,
        updated_at: now,
      })
      .select(templateColumns)
      .single();
    if (result.error) throw result.error;
    return templateDto(result.data as unknown as AgreementTemplateRow);
  } catch (error) {
    await storage.remove([storagePath]);
    throw error;
  }
}

export async function updateAgreementTemplate(
  user: WorkspaceUser,
  templateId: string,
  input: {
    revision: number;
    name: string;
    description: string;
    definition: AgreementTemplateDefinition;
  },
) {
  const current = await templateRow(user.organizationId, templateId);
  if (current.source_type === "legacy_premium_msa")
    throw new HttpError(
      409,
      "The current Premium Remodel agreement stays locked for compatibility. Duplicate it before making structural changes.",
    );
  if (current.status === "archived")
    throw new HttpError(409, "Restore this template before editing it.");
  const definition = agreementTemplateDefinitionSchema.parse(input.definition);
  if (current.source_type === "servicebuddy_document" && !definition.content)
    throw new HttpError(400, "An authored agreement needs document content.");
  if (current.source_type === "uploaded_pdf" && definition.content)
    throw new HttpError(400, "Uploaded PDF templates do not use authored content.");
  const result = await supabaseAdmin()
    .from("remodel_agreement_templates")
    .update({
      name: input.name,
      description: input.description,
      content: definition.content,
      fields: definition.fields,
      signer_roles: definition.signerRoles,
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
      "This agreement template changed in another session. Reload before saving.",
    );
  return templateDto(result.data[0] as unknown as AgreementTemplateRow);
}

export async function publishAgreementTemplate(
  user: WorkspaceUser,
  templateId: string,
  input: { revision: number; changeNote: string },
) {
  const current = await templateRow(user.organizationId, templateId);
  if (current.status === "archived")
    throw new HttpError(409, "Restore this template before publishing it.");
  if (current.source_type === "legacy_premium_msa")
    throw new HttpError(
      409,
      "The current Premium Remodel agreement is already published and remains locked for compatibility.",
    );
  const definition = agreementTemplateDefinitionSchema.parse({
    content: current.content,
    fields: current.fields,
    signerRoles: current.signer_roles,
  });
  if (!definition.signerRoles.length)
    throw new HttpError(400, "Add at least one signer before publishing.");
  const result = await supabaseAdmin().rpc(
    "remodel_publish_agreement_template",
    {
      p_organization_id: user.organizationId,
      p_template_id: templateId,
      p_expected_revision: input.revision,
      p_published_by: user.id,
      p_change_note: input.changeNote,
    },
  );
  if (result.error) {
    if (result.error.message.includes("agreement_revision_conflict"))
      throw new HttpError(
        409,
        "This agreement template changed in another session. Reload before publishing.",
      );
    if (result.error.message.includes("agreement_template_not_found"))
      throw new HttpError(404, "Agreement template not found.");
    throw result.error;
  }
  return getAgreementTemplate(user.organizationId, templateId);
}

export async function setAgreementTemplateArchived(
  user: WorkspaceUser,
  templateId: string,
  archived: boolean,
) {
  const current = await templateRow(user.organizationId, templateId);
  if (current.source_type === "legacy_premium_msa")
    throw new HttpError(
      409,
      "The active Premium Remodel agreement cannot be archived yet.",
    );
  const result = await supabaseAdmin()
    .from("remodel_agreement_templates")
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
    throw new HttpError(409, "Reload this template and try again.");
  return templateDto(result.data[0] as unknown as AgreementTemplateRow);
}

export async function agreementTemplateSource(
  organizationId: string,
  templateId: string,
) {
  const row = await templateRow(organizationId, templateId);
  if (row.source_type !== "uploaded_pdf" || !row.storage_path)
    throw new HttpError(404, "This template does not have an uploaded PDF.");
  if (!row.storage_path.startsWith(`${organizationId}/agreements/`))
    throw new HttpError(404, "Agreement source file not found.");
  const result = await supabaseAdmin().storage.from(bucket).download(row.storage_path);
  if (result.error || !result.data)
    throw new HttpError(404, "Agreement source file is unavailable.");
  return {
    bytes: result.data,
    filename: row.original_filename || "agreement.pdf",
    sha256: row.file_sha256,
  };
}

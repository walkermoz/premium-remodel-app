import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { z } from "zod";
import type { WorkspaceUser } from "./auth";
import { HttpError } from "./auth";
import {
  agreementTemplateDefinitionSchema,
  type AgreementField,
} from "./agreement-template-schema";
import { getBusinessConfigForOrganization } from "./business-config";
import { signatureStrokesSchema } from "./quote-signature";
import { supabaseAdmin } from "./supabase/server";

const signerTokenDays = 30;

const signerInputSchema = z.object({
  roleId: z.string().trim().min(2).max(80),
  name: z.string().trim().min(1).max(200),
  email: z.email().max(320),
});

export const createAgreementPacketSchema = z.object({
  templateId: z.uuid(),
  projectId: z.uuid().nullable().optional(),
  contactId: z.uuid().nullable().optional(),
  deliveryMode: z.enum(["email", "onsite"]).default("email"),
  dataSnapshot: z.record(z.string(), z.unknown()).default({}),
  signers: z.array(signerInputSchema).min(1).max(50),
});

export const signAgreementPacketSchema = z.object({
  signedName: z.string().trim().min(1).max(200),
  accepted: z.literal(true),
  signatureStrokes: signatureStrokesSchema,
  values: z.record(z.string(), z.unknown()).default({}),
});

type TemplateVersionRow = {
  organization_id: string;
  template_id: string;
  version: number;
  name: string;
  description: string;
  source_type: string;
  content: unknown;
  fields: unknown;
  signer_roles: unknown;
  storage_path: string | null;
  original_filename: string | null;
  file_sha256: string | null;
  page_count: number | null;
};

type PacketRow = {
  id: string;
  organization_id: string;
  template_id: string;
  template_version: number;
  project_id: string | null;
  contact_id: string | null;
  status: "draft" | "sent" | "in_progress" | "completed" | "void";
  template_snapshot: Record<string, unknown>;
  data_snapshot: Record<string, unknown>;
  created_at: string;
  sent_at: string | null;
  completed_at: string | null;
};

type SignerRow = {
  id: string;
  organization_id: string;
  packet_id: string;
  role_id: string;
  role_label: string;
  party_type: "customer" | "staff" | "other";
  signing_order: number;
  name: string;
  email: string;
  status: "pending" | "notified" | "viewed" | "signed" | "declined";
  access_token_expires_at: string | null;
  notified_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  signature_evidence?: Record<string, unknown> | null;
};

function signingSecret() {
  const value = process.env.CLIENT_PORTAL_SECRET?.trim();
  if (!value || value.length < 32)
    throw new HttpError(
      503,
      "Secure agreement signing is not configured on the server.",
    );
  return value;
}

function tokenHash(token: string) {
  return createHash("sha256")
    .update(`servicebuddy-agreement-v1:${signingSecret()}:${token}`)
    .digest("hex");
}

function newSignerToken() {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    hash: tokenHash(token),
    expiresAt: new Date(
      Date.now() + signerTokenDays * 24 * 60 * 60 * 1_000,
    ).toISOString(),
  };
}

function resolveBinding(source: unknown, path: string | null) {
  if (!path) return undefined;
  return path.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[key];
  }, source);
}

function templateDefinition(row: TemplateVersionRow) {
  return agreementTemplateDefinitionSchema.parse({
    content: row.content,
    fields: row.fields,
    signerRoles: row.signer_roles,
  });
}

function fieldValue(field: AgreementField, value: unknown) {
  if (field.type === "checkbox") {
    if (typeof value !== "boolean")
      throw new Error(`${field.label} is required.`);
    return value;
  }
  if (field.type === "number" || field.type === "currency") {
    const numeric = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numeric))
      throw new Error(`${field.label} must be a number.`);
    return numeric;
  }
  if (field.type === "date") {
    const text = String(value || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text))
      throw new Error(`${field.label} must be a date.`);
    return text;
  }
  const text = String(value ?? "").trim();
  if (field.required && !text) throw new Error(`${field.label} is required.`);
  if (text.length > 20_000) throw new Error(`${field.label} is too long.`);
  return text;
}

async function publishedTemplate(organizationId: string, templateId: string) {
  const template = await supabaseAdmin()
    .from("remodel_agreement_templates")
    .select("published_version,status,source_type")
    .eq("organization_id", organizationId)
    .eq("id", templateId)
    .maybeSingle();
  if (template.error) throw template.error;
  if (!template.data || template.data.status !== "published")
    throw new HttpError(
      409,
      "Publish this agreement template before using it.",
    );
  if (template.data.source_type === "legacy_premium_msa")
    throw new HttpError(
      409,
      "The legacy Premium agreement uses its existing quote flow.",
    );
  const version = await supabaseAdmin()
    .from("remodel_agreement_template_versions")
    .select(
      "organization_id,template_id,version,name,description,source_type,content,fields,signer_roles,storage_path,original_filename,file_sha256,page_count",
    )
    .eq("organization_id", organizationId)
    .eq("template_id", templateId)
    .eq("version", template.data.published_version)
    .maybeSingle();
  if (version.error) throw version.error;
  if (!version.data)
    throw new HttpError(409, "The published agreement version is unavailable.");
  return version.data as unknown as TemplateVersionRow;
}

export async function createAgreementPacket(user: WorkspaceUser, raw: unknown) {
  const input = createAgreementPacketSchema.parse(raw);
  const version = await publishedTemplate(
    user.organizationId,
    input.templateId,
  );
  const definition = templateDefinition(version);
  const signerByRole = new Map(
    input.signers.map((signer) => [signer.roleId, signer]),
  );
  for (const role of definition.signerRoles)
    if (role.required && !signerByRole.has(role.id))
      throw new HttpError(400, `Add the required signer: ${role.label}.`);
  for (const signer of input.signers)
    if (!definition.signerRoles.some((role) => role.id === signer.roleId))
      throw new HttpError(
        400,
        "A signer role does not exist in this template.",
      );

  const packetId = randomUUID();
  const now = new Date().toISOString();
  const firstOrder = Math.min(
    ...definition.signerRoles
      .filter((role) => signerByRole.has(role.id))
      .map((role) => role.order),
  );
  const tokens = new Map<string, ReturnType<typeof newSignerToken>>();
  const signerRows = definition.signerRoles
    .filter((role) => signerByRole.has(role.id))
    .sort((a, b) => a.order - b.order)
    .map((role) => {
      const signer = signerByRole.get(role.id)!;
      const access = role.order === firstOrder ? newSignerToken() : null;
      if (access) tokens.set(role.id, access);
      return {
        id: randomUUID(),
        organization_id: user.organizationId,
        packet_id: packetId,
        role_id: role.id,
        role_label: role.label,
        party_type: role.partyType,
        signing_order: role.order,
        name: signer.name,
        email: signer.email.toLowerCase(),
        status: "pending",
        access_token_hash: access?.hash || null,
        access_token_expires_at: access?.expiresAt || null,
      };
    });

  const templateSnapshot = {
    templateId: version.template_id,
    version: version.version,
    name: version.name,
    description: version.description,
    sourceType: version.source_type,
    content: definition.content,
    fields: definition.fields,
    signerRoles: definition.signerRoles,
    storagePath: version.storage_path,
    originalFilename: version.original_filename,
    fileSha256: version.file_sha256,
    pageCount: version.page_count,
    deliveryMode: input.deliveryMode,
  };

  const admin = supabaseAdmin();
  const packet = await admin.from("remodel_agreement_packets").insert({
    id: packetId,
    organization_id: user.organizationId,
    template_id: version.template_id,
    template_version: version.version,
    project_id: input.projectId || null,
    contact_id: input.contactId || null,
    status: "sent",
    template_snapshot: templateSnapshot,
    data_snapshot: input.dataSnapshot,
    created_by: user.id,
    sent_at: now,
  });
  if (packet.error) throw packet.error;
  const savedSigners = await admin
    .from("remodel_agreement_signers")
    .insert(signerRows);
  if (savedSigners.error) {
    await admin
      .from("remodel_agreement_packets")
      .delete()
      .eq("organization_id", user.organizationId)
      .eq("id", packetId);
    throw savedSigners.error;
  }

  const initialValues = definition.fields.flatMap((field) => {
    if (!field.bindingKey || field.signerRoleId) return [];
    const value = resolveBinding(input.dataSnapshot, field.bindingKey);
    return value === undefined || value === null
      ? []
      : [
          {
            organization_id: user.organizationId,
            packet_id: packetId,
            field_id: field.id,
            signer_id: null,
            value,
          },
        ];
  });
  if (initialValues.length) {
    const saved = await admin
      .from("remodel_agreement_field_values")
      .insert(initialValues);
    if (saved.error) {
      await admin
        .from("remodel_agreement_packets")
        .delete()
        .eq("organization_id", user.organizationId)
        .eq("id", packetId);
      throw saved.error;
    }
  }

  return {
    id: packetId,
    status: "sent" as const,
    deliveryMode: input.deliveryMode,
    firstSigners: signerRows
      .filter((signer) => signer.signing_order === firstOrder)
      .map((signer) => ({
        id: signer.id,
        roleId: signer.role_id,
        name: signer.name,
        email: signer.email,
        token: tokens.get(signer.role_id)!.token,
      })),
  };
}

async function signerSession(token: string) {
  if (!/^[A-Za-z0-9_-]{40,80}$/.test(token))
    throw new HttpError(404, "This agreement link is unavailable.");
  const admin = supabaseAdmin();
  const signer = await admin
    .from("remodel_agreement_signers")
    .select("*")
    .eq("access_token_hash", tokenHash(token))
    .maybeSingle();
  if (signer.error) throw signer.error;
  if (!signer.data)
    throw new HttpError(404, "This agreement link is unavailable.");
  const row = signer.data as unknown as SignerRow;
  if (
    !row.access_token_expires_at ||
    Date.parse(row.access_token_expires_at) <= Date.now()
  )
    throw new HttpError(410, "This agreement link has expired.");
  const packet = await admin
    .from("remodel_agreement_packets")
    .select("*")
    .eq("organization_id", row.organization_id)
    .eq("id", row.packet_id)
    .maybeSingle();
  if (packet.error) throw packet.error;
  if (!packet.data || packet.data.status === "void")
    throw new HttpError(410, "This agreement is no longer available.");
  const signers = await admin
    .from("remodel_agreement_signers")
    .select("*")
    .eq("organization_id", row.organization_id)
    .eq("packet_id", row.packet_id)
    .order("signing_order");
  if (signers.error) throw signers.error;
  return {
    signer: row,
    packet: packet.data as unknown as PacketRow,
    signers: signers.data as unknown as SignerRow[],
  };
}

export async function readAgreementSigningSession(token: string) {
  const session = await signerSession(token);
  const current = session.signers.find((signer) => signer.status !== "signed");
  const blocked =
    current?.id !== session.signer.id && session.signer.status !== "signed";
  if (["pending", "notified"].includes(session.signer.status) && !blocked)
    await supabaseAdmin()
      .from("remodel_agreement_signers")
      .update({ status: "viewed", viewed_at: new Date().toISOString() })
      .eq("organization_id", session.signer.organization_id)
      .eq("id", session.signer.id)
      .in("status", ["pending", "notified"]);
  const values = await supabaseAdmin()
    .from("remodel_agreement_field_values")
    .select("field_id,value")
    .eq("organization_id", session.signer.organization_id)
    .eq("packet_id", session.signer.packet_id);
  if (values.error) throw values.error;
  const business = await getBusinessConfigForOrganization(
    session.signer.organization_id,
  );
  return {
    packetId: session.packet.id,
    status: session.packet.status,
    blocked,
    signer: {
      roleId: session.signer.role_id,
      roleLabel: session.signer.role_label,
      name: session.signer.name,
      email: session.signer.email,
      status: session.signer.status,
    },
    signers: session.signers.map((signer) => ({
      roleLabel: signer.role_label,
      signingOrder: signer.signing_order,
      status: signer.status,
    })),
    template: session.packet.template_snapshot,
    deliveryMode:
      session.packet.template_snapshot.deliveryMode === "onsite"
        ? ("onsite" as const)
        : ("email" as const),
    values: Object.fromEntries(
      (values.data || []).map((value) => [value.field_id, value.value]),
    ),
    business: {
      name: business.profile.name,
      logoUrl: business.profile.logoUrl,
      regional: business.regional,
      paymentInstructions: {
        checkPayee: business.compliance.checkPayee,
        checkMailingAddress: business.compliance.checkMailingAddress,
      },
    },
  };
}

export async function agreementSigningDocument(token: string) {
  const session = await signerSession(token);
  const snapshot = session.packet.template_snapshot;
  const definition = agreementTemplateDefinitionSchema.parse({
    content: snapshot.content,
    fields: snapshot.fields,
    signerRoles: snapshot.signerRoles,
  });
  let pdf: PDFDocument;
  if (snapshot.sourceType === "uploaded_pdf") {
    if (typeof snapshot.storagePath !== "string")
      throw new HttpError(404, "The agreement document is unavailable.");
    const prefix = `${session.signer.organization_id}/agreements/`;
    if (!snapshot.storagePath.startsWith(prefix))
      throw new HttpError(404, "The agreement document is unavailable.");
    const result = await supabaseAdmin()
      .storage.from("remodel-files")
      .download(snapshot.storagePath);
    if (result.error || !result.data)
      throw new HttpError(404, "The agreement document is unavailable.");
    pdf = await PDFDocument.load(await result.data.arrayBuffer());
  } else {
    pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    let page = pdf.addPage([612, 792]);
    let y = 738;
    const write = (text: string, size = 10, heading = false) => {
      const lines = String(text || "").match(/.{1,92}(?:\s|$)|\S{1,92}/g) || [
        "",
      ];
      for (const line of lines) {
        if (y < 54) {
          page = pdf.addPage([612, 792]);
          y = 738;
        }
        page.drawText(line.trim(), {
          x: 54,
          y,
          size,
          font: heading ? bold : font,
          color: rgb(0.08, 0.18, 0.25),
        });
        y -= size + 7;
      }
    };
    write(String(snapshot.name || "Agreement"), 20, true);
    y -= 12;
    for (const block of definition.content?.blocks || []) {
      if (block.type === "page_break") {
        page = pdf.addPage([612, 792]);
        y = 738;
      } else if (block.type === "divider") {
        page.drawLine({
          start: { x: 54, y },
          end: { x: 558, y },
          thickness: 0.7,
          color: rgb(0.75, 0.82, 0.86),
        });
        y -= 18;
      } else {
        write(
          block.text,
          block.type === "heading" ? 14 : 10,
          block.type === "heading",
        );
        y -= block.type === "heading" ? 6 : 10;
      }
    }
  }

  const fieldRows = await supabaseAdmin()
    .from("remodel_agreement_field_values")
    .select("field_id,value,signer_id,completed_at")
    .eq("organization_id", session.signer.organization_id)
    .eq("packet_id", session.signer.packet_id);
  if (fieldRows.error) throw fieldRows.error;
  const values = new Map(
    (fieldRows.data || []).map((row) => [String(row.field_id), row.value]),
  );
  const fieldFont = await pdf.embedFont(StandardFonts.Helvetica);
  for (const field of definition.fields) {
    if (
      field.page === null ||
      field.x === null ||
      field.y === null ||
      field.width === null ||
      field.height === null ||
      !values.has(field.id) ||
      field.page > pdf.getPageCount()
    )
      continue;
    const page = pdf.getPage(field.page - 1);
    const { width, height } = page.getSize();
    const left = field.x * width;
    const bottom = height - (field.y + field.height) * height;
    const boxWidth = field.width * width;
    const boxHeight = field.height * height;
    const value = values.get(field.id);
    if (
      field.type === "signature" &&
      value &&
      typeof value === "object" &&
      Array.isArray((value as Record<string, unknown>).signatureStrokes)
    ) {
      const strokes = signatureStrokesSchema.parse(
        (value as Record<string, unknown>).signatureStrokes,
      );
      for (const stroke of strokes)
        for (let index = 1; index < stroke.length; index++)
          page.drawLine({
            start: {
              x: left + stroke[index - 1][0] * boxWidth,
              y: bottom + (1 - stroke[index - 1][1]) * boxHeight,
            },
            end: {
              x: left + stroke[index][0] * boxWidth,
              y: bottom + (1 - stroke[index][1]) * boxHeight,
            },
            thickness: 1.2,
            color: rgb(0.05, 0.13, 0.2),
          });
      continue;
    }
    const text =
      field.type === "checkbox"
        ? value
          ? "X"
          : ""
        : typeof value === "object" && value
          ? String((value as Record<string, unknown>).signedName || "")
          : String(value ?? "");
    if (text)
      page.drawText(text.slice(0, 500), {
        x: left + 2,
        y: bottom + Math.max(2, boxHeight / 2 - 5),
        size: Math.max(6, Math.min(11, boxHeight * 0.55)),
        font: fieldFont,
        maxWidth: Math.max(10, boxWidth - 4),
        color: rgb(0.05, 0.13, 0.2),
      });
  }

  if (session.packet.status === "completed") {
    const audit = pdf.addPage([612, 792]);
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    audit.drawText("Electronic signature audit", {
      x: 54,
      y: 730,
      size: 18,
      font: bold,
      color: rgb(0.08, 0.18, 0.25),
    });
    audit.drawText(`Agreement packet: ${session.packet.id}`, {
      x: 54,
      y: 704,
      size: 9,
      font: regular,
    });
    let auditY = 660;
    for (const signer of session.signers) {
      audit.drawText(`${signer.role_label}: ${signer.name}`, {
        x: 54,
        y: auditY,
        size: 11,
        font: bold,
      });
      audit.drawText(
        `${signer.email} | Signed ${signer.signed_at || "Pending"}`,
        {
          x: 54,
          y: auditY - 18,
          size: 9,
          font: regular,
        },
      );
      const evidence = signer.signature_evidence || {};
      audit.drawText(
        `Evidence: consent ${evidence.accepted === true ? "accepted" : "unavailable"}${typeof evidence.ipHash === "string" ? ` | IP hash ${evidence.ipHash.slice(0, 16)}...` : ""}`,
        { x: 54, y: auditY - 34, size: 8, font: regular },
      );
      auditY -= 76;
    }
  }

  const filenameBase =
    typeof snapshot.originalFilename === "string"
      ? snapshot.originalFilename.replace(/\.pdf$/i, "")
      : String(snapshot.name || "agreement");
  return {
    bytes: await pdf.save(),
    filename: `${filenameBase}${session.packet.status === "completed" ? "-signed" : ""}.pdf`,
    completed: session.packet.status === "completed",
  };
}

export async function signAgreementPacket(
  token: string,
  raw: unknown,
  evidence: { ipHash?: string; userAgent?: string },
) {
  const input = signAgreementPacketSchema.parse(raw);
  const session = await signerSession(token);
  if (
    session.packet.status === "completed" ||
    session.signer.status === "signed"
  )
    return { completed: true as const, alreadySigned: true as const };
  const current = session.signers.find((signer) => signer.status !== "signed");
  if (current?.id !== session.signer.id)
    throw new HttpError(
      409,
      "An earlier signer must complete this agreement first.",
    );
  if (
    input.signedName.toLocaleLowerCase() !==
    session.signer.name.toLocaleLowerCase()
  )
    throw new HttpError(
      400,
      "The signer name must match the name on this agreement.",
    );

  const snapshot = session.packet.template_snapshot;
  const definition = agreementTemplateDefinitionSchema.parse({
    content: snapshot.content,
    fields: snapshot.fields,
    signerRoles: snapshot.signerRoles,
  });
  const assigned = definition.fields.filter(
    (field) => field.signerRoleId === session.signer.role_id,
  );
  const rows = assigned.map((field) => {
    const value =
      field.type === "signature"
        ? {
            signedName: input.signedName,
            signatureStrokes: input.signatureStrokes,
          }
        : fieldValue(field, input.values[field.id]);
    return {
      organization_id: session.signer.organization_id,
      packet_id: session.signer.packet_id,
      field_id: field.id,
      signer_id: session.signer.id,
      value,
      completed_at: new Date().toISOString(),
    };
  });
  const now = new Date().toISOString();
  const signed = await supabaseAdmin().rpc("remodel_sign_agreement_signer", {
    p_organization_id: session.signer.organization_id,
    p_packet_id: session.signer.packet_id,
    p_signer_id: session.signer.id,
    p_field_values: rows.map((row) => ({
      fieldId: row.field_id,
      value: row.value,
    })),
    p_signature_evidence: {
      signedName: input.signedName,
      accepted: true,
      signedAt: now,
      ...evidence,
    },
  });
  if (signed.error) throw signed.error;
  if (!signed.data)
    throw new HttpError(
      409,
      "This agreement was already signed in another window.",
    );

  const next = session.signers.find(
    (signer) =>
      signer.signing_order > session.signer.signing_order &&
      signer.status !== "signed",
  );
  if (next) {
    const access = newSignerToken();
    const activated = await supabaseAdmin()
      .from("remodel_agreement_signers")
      .update({
        access_token_hash: access.hash,
        access_token_expires_at: access.expiresAt,
      })
      .eq("organization_id", session.signer.organization_id)
      .eq("id", next.id)
      .is("access_token_hash", null);
    if (activated.error) throw activated.error;
    await supabaseAdmin()
      .from("remodel_agreement_packets")
      .update({ status: "in_progress" })
      .eq("organization_id", session.signer.organization_id)
      .eq("id", session.signer.packet_id);
    return {
      completed: false as const,
      deliveryMode:
        session.packet.template_snapshot.deliveryMode === "onsite"
          ? ("onsite" as const)
          : ("email" as const),
      organizationId: session.signer.organization_id,
      packetId: session.signer.packet_id,
      agreementName: String(
        session.packet.template_snapshot.name || "Agreement",
      ),
      nextSigner: {
        id: next.id,
        name: next.name,
        email: next.email,
        token: access.token,
      },
    };
  }

  const completed = await supabaseAdmin()
    .from("remodel_agreement_packets")
    .update({ status: "completed", completed_at: now })
    .eq("organization_id", session.signer.organization_id)
    .eq("id", session.signer.packet_id);
  if (completed.error) throw completed.error;
  return { completed: true as const, alreadySigned: false as const };
}

export async function markAgreementSignerNotified(
  organizationId: string,
  signerId: string,
) {
  const now = new Date().toISOString();
  const result = await supabaseAdmin()
    .from("remodel_agreement_signers")
    .update({ status: "notified", notified_at: now })
    .eq("organization_id", organizationId)
    .eq("id", signerId)
    .in("status", ["pending", "viewed"]);
  if (result.error) throw result.error;
}

export function agreementSigningIpHash(ip: string) {
  return ip
    ? createHash("sha256")
        .update(`servicebuddy-agreement-ip:${signingSecret()}:${ip}`)
        .digest("hex")
    : undefined;
}

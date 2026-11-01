import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { HttpError, type WorkspaceUser } from "./auth";
import { supabaseAdmin } from "./supabase/server";

type SecretRow = {
  id: string;
  organization_id: string;
  name: string;
  description: string;
  ciphertext: string;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
};

function encryptionKey() {
  const encoded = (
    process.env.WORKFLOW_SECRET_ENCRYPTION_KEY ||
    process.env.TWILIO_TOKEN_ENCRYPTION_KEY ||
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY ||
    ""
  ).trim();
  const source = Buffer.from(encoded, "base64url");
  if (source.length !== 32)
    throw new HttpError(
      503,
      "Secure workflow secret storage is not configured yet.",
    );
  return createHash("sha256")
    .update(source)
    .update("servicebuddy:organization-secrets:v1")
    .digest();
}

function seal(value: string, organizationId: string, secretId: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(`${organizationId}:${secretId}:v1`));
  const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    body.toString("base64url"),
  ].join(".");
}

function unseal(ciphertext: string, organizationId: string, secretId: string) {
  const [version, iv, tag, body, extra] = ciphertext.split(".");
  if (version !== "v1" || !iv || !tag || !body || extra)
    throw new HttpError(503, "The saved workflow secret could not be read.");
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(iv, "base64url"),
    );
    decipher.setAAD(Buffer.from(`${organizationId}:${secretId}:v1`));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(body, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new HttpError(503, "The saved workflow secret could not be read.");
  }
}

function metadata(row: Omit<SecretRow, "ciphertext" | "organization_id">) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUsedAt: row.last_used_at,
  };
}

export async function listOrganizationSecrets(organizationId: string) {
  const result = await supabaseAdmin()
    .from("remodel_organization_secrets")
    .select("id,name,description,created_at,updated_at,last_used_at")
    .eq("organization_id", organizationId)
    .order("name");
  if (result.error) throw result.error;
  return result.data.map(metadata);
}

export async function saveOrganizationSecret(
  user: WorkspaceUser,
  input: {
    id?: string;
    name: string;
    description: string;
    value: string;
  },
) {
  const existing = input.id
    ? await supabaseAdmin()
        .from("remodel_organization_secrets")
        .select("id,created_at")
        .eq("organization_id", user.organizationId)
        .eq("id", input.id)
        .maybeSingle()
    : null;
  if (existing?.error) throw existing.error;
  if (input.id && !existing?.data)
    throw new HttpError(404, "Workflow secret not found.");
  const id = existing?.data?.id || randomUUID();
  const now = new Date().toISOString();
  const result = await supabaseAdmin()
    .from("remodel_organization_secrets")
    .upsert(
      {
        id,
        organization_id: user.organizationId,
        name: input.name,
        description: input.description,
        ciphertext: seal(input.value, user.organizationId, id),
        created_by: user.id,
        updated_by: user.id,
        created_at: existing?.data?.created_at || now,
        updated_at: now,
      },
      { onConflict: "organization_id,id" },
    )
    .select("id,name,description,created_at,updated_at,last_used_at")
    .single();
  if (result.error) {
    if (result.error.code === "23505")
      throw new HttpError(409, "A workflow secret already uses that name.");
    throw result.error;
  }
  return metadata(result.data);
}

/**
 * One-time migration helper for platform-provisioned tenant connections.
 * It never overwrites an administrator-managed secret with the same name.
 */
export async function ensureSystemOrganizationSecret(input: {
  organizationId: string;
  name: string;
  description: string;
  value: string;
}) {
  const existing = await supabaseAdmin()
    .from("remodel_organization_secrets")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("name", input.name)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data?.id) return existing.data.id as string;
  const id = randomUUID();
  const now = new Date().toISOString();
  const saved = await supabaseAdmin()
    .from("remodel_organization_secrets")
    .insert({
      id,
      organization_id: input.organizationId,
      name: input.name,
      description: input.description,
      ciphertext: seal(input.value, input.organizationId, id),
      created_by: null,
      updated_by: null,
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();
  if (saved.error?.code === "23505") {
    const raced = await supabaseAdmin()
      .from("remodel_organization_secrets")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("name", input.name)
      .single();
    if (raced.error) throw raced.error;
    return raced.data.id as string;
  }
  if (saved.error) throw saved.error;
  return saved.data.id as string;
}

export async function deleteOrganizationSecret(
  organizationId: string,
  secretId: string,
) {
  const result = await supabaseAdmin()
    .from("remodel_organization_secrets")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", secretId)
    .select("id");
  if (result.error) throw result.error;
  if (!result.data.length)
    throw new HttpError(404, "Workflow secret not found.");
}

export async function organizationSecretValue(
  organizationId: string,
  secretId: string,
) {
  const result = await supabaseAdmin()
    .from("remodel_organization_secrets")
    .select("id,organization_id,ciphertext")
    .eq("organization_id", organizationId)
    .eq("id", secretId)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data)
    throw new Error("The selected workflow secret was removed.");
  await supabaseAdmin()
    .from("remodel_organization_secrets")
    .update({ last_used_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("id", secretId);
  return unseal(result.data.ciphertext, organizationId, secretId);
}

export const sealOrganizationValue = seal;
export const unsealOrganizationValue = unseal;
